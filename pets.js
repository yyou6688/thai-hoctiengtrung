/* ===================== pets.js =====================
   Hệ thống "Bộ sưu tập" thú cưng/cây cảnh — tạo động lực cho việc luyện
   tập hằng ngày. Toàn bộ trạng thái lưu ở DB.pets (khoá localStorage
   'xnc_pets', do app.js quản lý persist()).

   Nguyên tắc:
   - Có 1 danh sách CỐ ĐỊNH các "bạn đồng hành" (COMPANION_LIST), mỗi mốc
     lớn (streak HOẶC tổng số chữ đã ôn — đạt 1 trong 2 là được) mở khóa
     1 bạn mới. Bạn cũ KHÔNG bị thay thế — nuôi xong (trưởng thành hoàn
     toàn) thì "tốt nghiệp" vào phòng trưng bày vĩnh viễn.
   - Chỉ nuôi 1 bạn "đang lớn" tại 1 thời điểm — mỗi lần hoàn thành 打卡
     trong ngày là cho ăn 1 lần (tính vào số ngày đã chăm). Nếu tỉ lệ
     "kiểm tra viết đúng giờ" trong ngày đạt ngưỡng, được cho ăn thêm 1
     phần (lớn nhanh hơn).
   - Bỏ bê (không 打卡) nhiều ngày liên tiếp: buồn → héo nặng → chết (mất
     bạn đó, phải nuôi lại từ đầu) — trừ khi có "vé cứu" (kiếm được sau
     mỗi 10 lần 打卡) để tự cứu 1 lần.
========================================================================= */

const COMPANION_LIST = [
  { icon:'🐱', name:'Mèo con',      type:'pet',   unlockStreak:7,   unlockChars:30  },
  { icon:'🌵', name:'Xương rồng',   type:'plant', unlockStreak:14,  unlockChars:60  },
  { icon:'🐶', name:'Cún con',      type:'pet',   unlockStreak:21,  unlockChars:100 },
  { icon:'🌸', name:'Hoa hồng',     type:'plant', unlockStreak:30,  unlockChars:150 },
  { icon:'🐰', name:'Thỏ con',      type:'pet',   unlockStreak:45,  unlockChars:220 },
  { icon:'🎍', name:'Tre / Bonsai', type:'plant', unlockStreak:60,  unlockChars:300 },
  { icon:'🐦', name:'Chim nhỏ',     type:'pet',   unlockStreak:90,  unlockChars:450 },
  { icon:'🌳', name:'Cây cổ thụ',   type:'plant', unlockStreak:120, unlockChars:600 },
];
// Số ngày CHĂM (cộng dồn, không cần liên tiếp) để lên mỗi giai đoạn.
// Mốc cuối (54 ngày) = trưởng thành hoàn toàn, "tốt nghiệp" vào bộ sưu tập.
const GROWTH_STAGES = [
  { name:'Trứng / mầm',        minFed:0  },
  { name:'Con non / nảy chồi', minFed:3  },
  { name:'Thiếu niên / cây con', minFed:10 },
  { name:'Trưởng thành / ra hoa', minFed:24 },
  { name:'Hoàn thiện',         minFed:54 },
];
const PET_TEST_TIME_TIERS = [ [5,15], [10,25], [15,35], [Infinity,50] ]; // [maxStrokes, giây]
const PET_QUALITY_BONUS_THRESHOLD = 0.7; // tỉ lệ qua kiểm tra trong ngày để được cho ăn thêm
const PET_TICKET_EVERY_N_CHECKINS = 10;
const PET_TICKET_MAX = 3;
const PET_DEATH_MISSED_DAYS = 7;

function getTestTimeLimit(strokes){
  for(const [max,sec] of PET_TEST_TIME_TIERS){ if(strokes<=max) return sec; }
  return 50;
}

function petDaysBetween(dateStrA, dateStrB){
  const a = new Date(dateStrA+'T00:00:00'), b = new Date(dateStrB+'T00:00:00');
  return Math.round((b-a)/86400000);
}

function ensurePetsInit(){
  if(!DB.pets){
    DB.pets = {
      companions: COMPANION_LIST.map(()=>({ state:'locked', fedDays:0, missedDays:0, lastFedDate:null, diedCount:0 })),
      activeIdx: null,
      tickets: 0,
      lastTicketGrantAt: 0,
      dailyTest: { date:'', attempted:0, passed:0 },
    };
    persist('pets');
  }
}

function getCharsReviewedCount(){ return DB.hanzi.filter(h=>h.reviewCount>0).length; }

function meetsUnlock(companionDef){
  const streak = getStreak();
  const chars = getCharsReviewedCount();
  return streak>=companionDef.unlockStreak || chars>=companionDef.unlockChars;
}

// Gọi mỗi khi render Home / sau khi 打卡 — xử lý decay, chết/vé cứu, tốt
// nghiệp, mở khóa bạn mới, phát vé cứu. Trả về các sự kiện để hiện toast.
function refreshPetUnlocks(){
  ensurePetsInit();
  const p = DB.pets;
  const events = { died:null, graduated:null, unlocked:null, ticketUsed:false, ticketGained:false };
  const today = todayStr();

  // 1) decay / chết cho bạn đang nuôi
  if(p.activeIdx!=null){
    const c = p.companions[p.activeIdx];
    if(c && c.state==='growing'){
      const missed = c.lastFedDate ? Math.max(0, petDaysBetween(c.lastFedDate, today)-1) : 0;
      c.missedDays = missed;
      if(missed>=PET_DEATH_MISSED_DAYS){
        if(p.tickets>0){
          p.tickets--; c.missedDays=0; c.lastFedDate=today;
          events.ticketUsed = true;
        } else {
          c.diedCount = (c.diedCount||0)+1;
          c.fedDays = 0; c.missedDays = 0; c.lastFedDate = null;
          events.died = COMPANION_LIST[p.activeIdx].name;
        }
      }
    }
  }

  // 2) tốt nghiệp nếu đủ ngày chăm
  if(p.activeIdx!=null){
    const c = p.companions[p.activeIdx];
    if(c && c.state==='growing' && c.fedDays>=GROWTH_STAGES[GROWTH_STAGES.length-1].minFed){
      c.state = 'graduated';
      events.graduated = COMPANION_LIST[p.activeIdx].name;
      p.activeIdx = null;
    }
  }

  // 3) mở khóa bạn tiếp theo nếu chưa có ai đang nuôi
  if(p.activeIdx==null){
    for(let i=0;i<COMPANION_LIST.length;i++){
      if(p.companions[i].state==='locked' && meetsUnlock(COMPANION_LIST[i])){
        p.companions[i].state = 'growing';
        p.activeIdx = i;
        events.unlocked = COMPANION_LIST[i].name;
        break;
      }
    }
  }

  // 4) phát vé cứu theo tổng số lần 打卡
  const totalCheckins = Object.values(DB.checkins).filter(Boolean).length;
  while(totalCheckins - p.lastTicketGrantAt >= PET_TICKET_EVERY_N_CHECKINS && p.tickets<PET_TICKET_MAX){
    p.tickets++; p.lastTicketGrantAt += PET_TICKET_EVERY_N_CHECKINS;
    events.ticketGained = true;
  }

  persist('pets');
  return events;
}

function getTodayTestInfo(){
  const t = DB.pets && DB.pets.dailyTest;
  if(!t || t.date!==todayStr()) return {attempted:0, passed:0};
  return t;
}
function recordTestResult(pass){
  ensurePetsInit();
  const t = DB.pets.dailyTest;
  if(t.date!==todayStr()){ t.date=todayStr(); t.attempted=0; t.passed=0; }
  t.attempted++;
  if(pass) t.passed++;
  persist('pets');
}

// Cho bạn đang nuôi ăn 1 lần trong ngày (gọi từ checkinToday, chỉ tính 1
// lần/ngày). qualityBonus=true nếu tỉ lệ kiểm tra viết hôm nay đạt ngưỡng.
function feedActivePet(qualityBonus){
  ensurePetsInit();
  const p = DB.pets;
  if(p.activeIdx==null) return;
  const c = p.companions[p.activeIdx];
  if(!c || c.state!=='growing') return;
  const today = todayStr();
  if(c.lastFedDate===today) return; // đã cho ăn hôm nay rồi
  c.fedDays += qualityBonus ? 2 : 1;
  c.lastFedDate = today;
  c.missedDays = 0;
  persist('pets');
}

function showPetEvents(events){
  if(!events) return;
  if(events.died){ toast('💔 '+events.died+' đã mất vì bị bỏ bê quá lâu — bắt đầu nuôi lại từ đầu.'); return; }
  if(events.graduated){ toast('🎓 '+events.graduated+' đã trưởng thành hoàn toàn! Xem ở Bộ sưu tập.'); return; }
  if(events.unlocked){ toast('🎉 Bạn mới xuất hiện: '+events.unlocked+'! Vào 打卡 để bắt đầu chăm sóc.'); return; }
  if(events.ticketUsed){ toast('🎫 Đã dùng 1 vé cứu để cứu thú cưng khỏi bị mất!'); return; }
  if(events.ticketGained){ toast('🎫 Nhận được 1 vé cứu mới (dùng khi lỡ quên 打卡 nhiều ngày)!'); return; }
}

function getGrowthStageIndex(fedDays){
  let idx = 0;
  for(let i=0;i<GROWTH_STAGES.length;i++){ if(fedDays>=GROWTH_STAGES[i].minFed) idx=i; }
  return idx;
}
function getGrowthVisual(companionDef, fedDays){
  const stageIdx = getGrowthStageIndex(fedDays);
  const isPlant = companionDef.type==='plant';
  if(stageIdx===0) return isPlant ? '🌱' : '🥚';
  if(stageIdx===1) return isPlant ? '🌿' : '🐣';
  return companionDef.icon; // giai đoạn 2 trở lên: icon thật, cỡ chữ tăng dần qua CSS theo stage
}

/* ---------------- Render thẻ thú cưng ở 打卡 (Home) ---------------- */
function renderPetCard(){
  const wrap = document.getElementById('petCardWrap');
  if(!wrap) return;
  ensurePetsInit();
  showPetEvents(refreshPetUnlocks());
  const p = DB.pets;

  if(p.activeIdx==null){
    const graduatedCount = p.companions.filter(c=>c.state==='graduated').length;
    wrap.innerHTML = `
      <div class="card pet-card">
        <div class="pet-card-empty">
          <span class="pet-emoji-lg">${graduatedCount>0 ? '🏡' : '🌱'}</span>
          <div class="rtitle" style="margin-top:6px;">${graduatedCount>0 ? 'Đã tốt nghiệp '+graduatedCount+' bạn!' : 'Chưa có bạn đồng hành nào'}</div>
          <div class="rmeta">Đạt streak ${COMPANION_LIST[graduatedCount] ? COMPANION_LIST[graduatedCount].unlockStreak : '?'} ngày hoặc ${COMPANION_LIST[graduatedCount] ? COMPANION_LIST[graduatedCount].unlockChars : '?'} chữ đã ôn để mở khóa bạn tiếp theo.</div>
          <button class="btn btn-soft btn-sm" id="btnOpenPetGallery" style="margin-top:10px;">🖼 Bộ sưu tập</button>
        </div>
      </div>`;
  } else {
    const def = COMPANION_LIST[p.activeIdx];
    const c = p.companions[p.activeIdx];
    const stageIdx = getGrowthStageIndex(c.fedDays);
    const stage = GROWTH_STAGES[stageIdx];
    const nextStage = GROWTH_STAGES[stageIdx+1];
    const visual = getGrowthVisual(def, c.fedDays);
    const fedToday = c.lastFedDate===todayStr();
    const healthLabel = c.missedDays<=0 ? '' : c.missedDays<3 ? '😢 Đang buồn vì bị bỏ quên' : '🥀 Đang héo nặng — cho ăn ngay!';
    const pct = nextStage ? Math.min(100, Math.round((c.fedDays-stage.minFed)/(nextStage.minFed-stage.minFed)*100)) : 100;
    wrap.innerHTML = `
      <div class="card pet-card">
        <div class="pet-card-main">
          <span class="pet-emoji-lg pet-stage-${stageIdx}">${visual}</span>
          <div style="flex:1;min-width:0;">
            <div class="rtitle">${escapeHTML(def.name)} <span class="rmeta">· ${escapeHTML(stage.name)}</span></div>
            <div class="pet-progress-track"><div class="pet-progress-fill" style="width:${pct}%;"></div></div>
            <div class="rmeta">${c.fedDays}/${GROWTH_STAGES[GROWTH_STAGES.length-1].minFed} ngày chăm ${fedToday?'· 🍚 đã cho ăn hôm nay':'· chưa cho ăn hôm nay'}</div>
            ${healthLabel?`<div class="rmeta" style="color:#C0637E;font-weight:700;margin-top:2px;">${healthLabel}</div>`:''}
          </div>
        </div>
        <div class="writer-controls" style="justify-content:space-between;margin-top:10px;">
          <span class="rmeta">🎫 Vé cứu: ${p.tickets}/${PET_TICKET_MAX}</span>
          <button class="btn btn-soft btn-sm" id="btnOpenPetGallery">🖼 Bộ sưu tập</button>
        </div>
      </div>`;
  }
  const btn = document.getElementById('btnOpenPetGallery');
  if(btn) btn.addEventListener('click', openPetGalleryModal);
}

function openPetGalleryModal(){
  ensurePetsInit();
  const p = DB.pets;
  const cards = COMPANION_LIST.map((def,i)=>{
    const c = p.companions[i];
    let icon, statusLabel;
    if(c.state==='locked'){ icon='🔒'; statusLabel = `Cần streak ${def.unlockStreak} ngày hoặc ${def.unlockChars} chữ đã ôn`; }
    else if(c.state==='graduated'){ icon=def.icon; statusLabel = 'Đã trưởng thành 🎓'; }
    else { icon=getGrowthVisual(def, c.fedDays); statusLabel = `Đang nuôi — ${c.fedDays}/${GROWTH_STAGES[GROWTH_STAGES.length-1].minFed} ngày`; }
    return `
      <div class="pet-gallery-item${c.state==='locked'?' locked':''}">
        <div class="pet-emoji-md">${icon}</div>
        <div class="pet-gallery-name">${escapeHTML(def.name)}</div>
        <div class="rmeta" style="font-size:11px;">${statusLabel}</div>
        ${c.diedCount>0?`<div class="rmeta" style="font-size:10.5px;color:#C0637E;">💔 từng mất ${c.diedCount} lần</div>`:''}
      </div>`;
  }).join('');
  openModal(`
    <h3>🖼 Bộ sưu tập</h3>
    <p style="font-size:12.5px;color:var(--text-muted);margin:2px 0 12px;">🎫 Vé cứu hiện có: ${p.tickets}/${PET_TICKET_MAX} — nhận thêm 1 vé mỗi ${PET_TICKET_EVERY_N_CHECKINS} lần 打卡.</p>
    <div class="pet-gallery-grid">${cards}</div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" data-close>Đóng</button></div>
  `);
}
