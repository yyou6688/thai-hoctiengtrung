/* ===================== xinhua.js =====================
   Lớp dữ liệu "giải thích / ghép từ / đặt câu" cho mỗi chữ Hán,
   lấy từ kho mở github.com/pwxcoo/chinese-xinhua (qua CDN jsdelivr,
   mirror của GitHub, tải nhanh + có CORS đầy đủ).

   ĐÃ KIỂM TRA TRỰC TIẾP schema thật của kho (README chính chủ,
   4/9/2026) — 3 file dữ liệu dùng trong app:

     data/word.json  (汉字 — 16.142 chữ đơn): mỗi bản ghi có đúng các
       trường: word, oldword, strokes, pinyin, radicals, explanation, more.
       => dùng làm nguồn GIẢI THÍCH + BỘ THỦ + SỐ NÉT chính cho từng chữ.

     data/idiom.json (成语 — 31.648 thành ngữ 4 chữ): word, pinyin,
       explanation, example, derivation, abbreviation.
       => dùng làm nguồn ĐẶT CÂU (trường "example" là câu ví dụ thật có
       sẵn trong kho; nếu thành ngữ không có "example" thì lấy "derivation"
       — xuất xứ, cũng là một dạng câu/trích dẫn có chứa cụm từ đó).

     data/ci.json (词语 — 264.434 từ ghép 2-3 chữ thông thường, KHÔNG có
       trường pinyin): chỉ có "ci" và "explanation".
       => dùng làm nguồn GHÉP TỪ chính (từ ghép đời thường thực tế, đúng
       nghĩa "ghép từ" hơn nhiều so với thành ngữ 4 chữ cố định).

   Cách hoạt động:
   - Khi cần dữ liệu, app tải các file JSON trên qua CDN (chỉ 1 lần),
     rồi lưu lại vào IndexedDB (kho 'xnc-xinhua') để dùng offline các
     lần sau. Service Worker cũng tự cache thêm 1 lớp request mạng.
   - Vì word.json khá nặng (mỗi chữ có đoạn "more" rất dài, không dùng
     tới), app CẮT BỚT trường "more"/"oldword" trước khi lưu để giảm
     dung lượng lưu trữ trên máy — chỉ giữ word/pinyin/radicals/strokes/
     explanation.
   - ci.json có 264k dòng nên KHÔNG dựng sẵn chỉ mục theo từng chữ (tốn
     bộ nhớ), mà lọc trực tiếp (filter theo chuỗi con) mỗi khi cần tra —
     vẫn chỉ mất vài chục mili-giây, không đáng kể.
   - Cả 3 file có thể khá nặng khi tải lần đầu (word.json + idiom.json +
     ci.json cộng lại có thể vài chục MB) — nên tải khi có Wi-Fi. Từ lần
     2 trở đi lấy thẳng từ máy, không cần mạng.
========================================================================= */

const XINHUA_SOURCES = {
  word:  'https://cdn.jsdelivr.net/gh/pwxcoo/chinese-xinhua@master/data/word.json',
  idiom: 'https://cdn.jsdelivr.net/gh/pwxcoo/chinese-xinhua@master/data/idiom.json',
  ci:    'https://cdn.jsdelivr.net/gh/pwxcoo/chinese-xinhua@master/data/ci.json',
};
// Nếu CDN trên lỗi (jsdelivr đôi khi rate-limit), thử theo thứ tự các nguồn dự phòng này:
const XINHUA_FALLBACK_SOURCES = {
  word:  ['https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/word.json'],
  idiom: ['https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json'],
  ci:    ['https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/ci.json'],
};

const XinhuaCache = {
  charMap: null,     // Map: 1 chữ -> {pinyin, radicals, strokes, explanation}
  idiomList: null,   // Array các thành ngữ thô {word,pinyin,explanation,example,derivation}
  idiomByChar: null, // Map: 1 chữ -> [idiom entries chứa chữ đó]
  ciList: null,      // Array các từ ghép thô {ci, explanation} — không dựng index, lọc trực tiếp
  loadingWord: null,
  loadingIdiom: null,
  loadingCi: null,
};

/* ---------------- IndexedDB helper tối giản (không phụ thuộc thư viện ngoài) ---------------- */
function xnIDBOpen(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('no-idb')); return; }
    const req = indexedDB.open('xnc-xinhua', 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore('files'); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function xnIDBGet(key){
  try{
    const db = await xnIDBOpen();
    return await new Promise((resolve)=>{
      const tx = db.transaction('files','readonly');
      const rq = tx.objectStore('files').get(key);
      rq.onsuccess = ()=> resolve(rq.result || null);
      rq.onerror = ()=> resolve(null);
    });
  }catch(e){ return null; }
}
async function xnIDBSet(key, val){
  try{
    const db = await xnIDBOpen();
    await new Promise((resolve)=>{
      const tx = db.transaction('files','readwrite');
      tx.objectStore('files').put(val, key);
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=> resolve();
    });
  }catch(e){ /* im lặng bỏ qua nếu trình duyệt không hỗ trợ */ }
}

async function xnFetchJSON(kind){
  const urls = [XINHUA_SOURCES[kind], ...(XINHUA_FALLBACK_SOURCES[kind]||[])];
  let lastErr = null;
  for(const url of urls){
    try{
      const res = await fetch(url);
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('fetch-failed');
}

/* ---------------- Nạp từ điển từng chữ (word.json) ---------------- */
async function loadXinhuaCharDict(onProgress){
  if(XinhuaCache.charMap) return XinhuaCache.charMap;
  if(XinhuaCache.loadingWord) return XinhuaCache.loadingWord;

  XinhuaCache.loadingWord = (async ()=>{
    let trimmed = await xnIDBGet('word-trimmed');
    if(!trimmed){
      if(onProgress) onProgress('Đang tải từ điển chữ Hán (lần đầu, cần mạng)...');
      const raw = await xnFetchJSON('word'); // [{word,oldword,strokes,pinyin,radicals,explanation,more}]
      trimmed = raw.map(e => ({
        word: e.word, pinyin: e.pinyin || '', radicals: e.radicals || '',
        strokes: e.strokes || '', explanation: e.explanation || '',
      }));
      xnIDBSet('word-trimmed', trimmed); // không await — lưu nền, đã cắt bớt "more"/"oldword" cho nhẹ
    }
    const map = new Map();
    for(const entry of trimmed){
      if(entry.word && entry.word.length===1) map.set(entry.word, entry);
    }
    XinhuaCache.charMap = map;
    return map;
  })();
  return XinhuaCache.loadingWord;
}

/* ---------------- Nạp kho thành ngữ (idiom.json) — dùng để ĐẶT CÂU ---------------- */
async function loadXinhuaIdiomDict(onProgress){
  if(XinhuaCache.idiomByChar) return XinhuaCache.idiomByChar;
  if(XinhuaCache.loadingIdiom) return XinhuaCache.loadingIdiom;

  XinhuaCache.loadingIdiom = (async ()=>{
    let list = await xnIDBGet('idiom.json');
    if(!list){
      if(onProgress) onProgress('Đang tải kho thành ngữ (lần đầu, cần mạng)...');
      list = await xnFetchJSON('idiom'); // [{word,pinyin,explanation,example,derivation,abbreviation}]
      xnIDBSet('idiom.json', list);
    }
    const byChar = new Map();
    for(const entry of list){
      const word = entry.word || '';
      if(!word) continue;
      for(const ch of new Set(word)){
        if(!/[\u4e00-\u9fff]/.test(ch)) continue;
        if(!byChar.has(ch)) byChar.set(ch, []);
        byChar.get(ch).push(entry);
      }
    }
    XinhuaCache.idiomList = list;
    XinhuaCache.idiomByChar = byChar;
    return byChar;
  })();
  return XinhuaCache.loadingIdiom;
}

/* ---------------- Nạp kho từ ghép (ci.json) — dùng để GHÉP TỪ ---------------- */
// File này rất lớn (264k dòng) nên KHÔNG dựng Map theo từng chữ (quá tốn bộ nhớ),
// chỉ giữ mảng thô trong bộ nhớ rồi filter trực tiếp khi cần (findComboWords bên dưới).
async function loadXinhuaCiList(onProgress){
  if(XinhuaCache.ciList) return XinhuaCache.ciList;
  if(XinhuaCache.loadingCi) return XinhuaCache.loadingCi;

  XinhuaCache.loadingCi = (async ()=>{
    let list = await xnIDBGet('ci.json');
    if(!list){
      if(onProgress) onProgress('Đang tải kho từ ghép (lần đầu, file lớn ~vài chục MB, nên dùng Wi-Fi)...');
      list = await xnFetchJSON('ci'); // [{ci, explanation}]
      xnIDBSet('ci.json', list);
    }
    XinhuaCache.ciList = list;
    return list;
  })();
  return XinhuaCache.loadingCi;
}
// Tìm tối đa `limit` từ ghép (2-3 chữ) có chứa `char`, ưu tiên từ ngắn (thông dụng hơn).
function findComboWords(char, limit){
  const list = XinhuaCache.ciList || [];
  const matches = [];
  for(let i=0;i<list.length && matches.length<limit*8;i++){
    const w = list[i].ci;
    if(w && w.length<=4 && w.length>=2 && w.includes(char)) matches.push(list[i]);
  }
  matches.sort((a,b)=>a.ci.length-b.ci.length);
  return matches.slice(0, limit);
}

/* ---------------- API dùng cho UI ---------------- */
// Trả về {pinyin, radicals, strokes, explanation, combos:[{word,pinyin}], sentence:{text,source}}
async function getVocabExplain(char, onProgress){
  const [charMap, idiomByChar] = await Promise.all([
    loadXinhuaCharDict(onProgress),
    loadXinhuaIdiomDict(onProgress),
    loadXinhuaCiList(onProgress),
  ]);
  const info = charMap.get(char) || null;

  const combosRaw = findComboWords(char, 5);
  const combos = combosRaw.map(c => {
    let py = '';
    if(typeof pinyinPro !== 'undefined' && pinyinPro.pinyin){
      try{ py = pinyinPro.pinyin(c.ci, {toneType:'symbol'}); }catch(e){}
    }
    return { word: c.ci, pinyin: py };
  });

  const idioms = idiomByChar.get(char) || [];
  let sentence = null;
  for(const it of idioms){
    const ex = it.example || it.derivation || '';
    if(ex && ex.trim()){ sentence = { text: ex.trim(), from: it.word || '' }; break; }
  }

  return {
    char,
    pinyin: info ? info.pinyin : '',
    radicals: info ? info.radicals : '',
    strokes: info ? info.strokes : '',
    explanation: info ? info.explanation : '',
    combos,
    sentence,
    hasData: !!(info || combos.length || sentence),
  };
}

// Lấy nhanh bộ thủ (部首) cho 1 chữ — dùng cho tính năng nhóm chữ cùng bộ ở 打卡.
// Trả về '' nếu chưa có dữ liệu trong bộ nhớ (không tự fetch để tránh chặn UI đồng bộ).
function getRadicalSync(char){
  if(!XinhuaCache.charMap) return '';
  const info = XinhuaCache.charMap.get(char);
  return info ? (info.radicals || '') : '';
}
function getStrokesSync(char){
  if(!XinhuaCache.charMap) return null;
  const info = XinhuaCache.charMap.get(char);
  const n = info ? parseInt(info.strokes) : NaN;
  return isNaN(n) ? null : n;
}

/* ---------------- Dịch tự động sang tiếng Việt ----------------
   Dùng MyMemory (api.mymemory.translated.net) — dịch vụ miễn phí có bật
   CORS chính thức cho gọi trực tiếp từ trình duyệt, không cần API key.
   Giới hạn ~5000 từ/ngày cho người dùng ẩn danh — đủ dùng cho 1 người.
   Nếu sau này thấy nút "Dịch" báo lỗi liên tục (ví dụ do vượt giới hạn
   ngày), đó là dấu hiệu cần đổi sang dịch vụ khác hoặc chờ sang ngày mới.
   Kết quả dịch được cache lại (IndexedDB) để không phải dịch lại chữ/câu
   đã dịch trước đó — tiết kiệm mạng, phản hồi tức thì các lần sau. */
async function translateZhToVi(text){
  if(!text) return '';
  const clean = text.slice(0, 350);
  const cacheKey = 'tr-vi:' + clean;
  const cached = await xnIDBGet(cacheKey);
  if(cached !== null) return cached;
  // Dùng MyMemory (api.mymemory.translated.net) — có bật CORS chính thức cho
  // gọi trực tiếp từ trình duyệt, không cần API key. (Trước dùng endpoint chui
  // của Google nhưng bị chặn CORS nên lúc nào cũng báo lỗi — đã đổi sang đây.)
  const url = 'https://api.mymemory.translated.net/get?langpair=zh-CN|vi&q=' + encodeURIComponent(clean);
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status);
  const data = await res.json();
  const translated = data && data.responseData && data.responseData.translatedText;
  if(!translated || /MYMEMORY WARNING/i.test(translated)) throw new Error('translate-failed');
  xnIDBSet(cacheKey, translated); // lưu nền
  return translated;
}
// Gắn 1 nút "🇻🇳 Dịch" vào block, bấm vào thì dịch `text` và hiện ngay dưới.
function wireTranslateButton(container, btnId, boxId, text){
  const btn = container.querySelector('#'+btnId);
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    const box = container.querySelector('#'+boxId);
    btn.disabled = true; btn.textContent = 'Đang dịch...';
    try{
      const vi = await translateZhToVi(text);
      box.textContent = vi || '(không dịch được đoạn này)';
      box.style.display = 'block';
      btn.style.display = 'none';
    }catch(e){
      btn.disabled = false; btn.textContent = '🇻🇳 Dịch (thử lại)';
    }
  });
}

/* ---------------- Render HTML cho khối "giải thích / ghép từ / đặt câu" ---------------- */
function renderVocabExplainHTML(data, uidPrefix){
  if(!data.hasData){
    return `<div class="vocab-explain-empty">Chưa có dữ liệu giải thích cho chữ này trong kho từ điển.</div>`;
  }
  const up = uidPrefix || ('vx'+Math.random().toString(36).slice(2,8));
  const parts = [];
  if(data.explanation){
    parts.push(`
      <div class="vx-block">
        <div class="vx-label">📖 Giải thích</div>
        <div class="vx-text">${escapeHTML(data.explanation).slice(0,400)}</div>
        <button class="btn btn-ghost btn-sm" id="${up}-tr-expl-btn" style="margin-top:6px;padding:4px 10px;font-size:11.5px;">🇻🇳 Dịch</button>
        <div class="vx-text vx-translated" id="${up}-tr-expl-box" style="display:none;"></div>
      </div>`);
  }
  if(data.radicals || data.strokes){
    parts.push(`
      <div class="vx-block">
        <div class="vx-label">🧩 Bộ thủ / số nét</div>
        <div class="vx-text">${escapeHTML(data.radicals||'?')} · ${escapeHTML(String(data.strokes||'?'))} nét</div>
      </div>`);
  }
  if(data.combos && data.combos.length){
    parts.push(`
      <div class="vx-block">
        <div class="vx-label">🔗 Ghép từ</div>
        <div class="vx-combos">${data.combos.map(c=>`<span class="vx-combo-chip">${escapeHTML(c.word)}${c.pinyin?` <em>${escapeHTML(c.pinyin)}</em>`:''}</span>`).join('')}</div>
      </div>`);
  }
  if(data.sentence){
    parts.push(`
      <div class="vx-block">
        <div class="vx-label">✏️ Đặt câu / ví dụ</div>
        <div class="vx-text">${escapeHTML(data.sentence.text).slice(0,300)}${data.sentence.from?` <span class="vx-source">(từ「${escapeHTML(data.sentence.from)}」)</span>`:''}</div>
        <button class="btn btn-ghost btn-sm" id="${up}-tr-sent-btn" style="margin-top:6px;padding:4px 10px;font-size:11.5px;">🇻🇳 Dịch</button>
        <div class="vx-text vx-translated" id="${up}-tr-sent-box" style="display:none;"></div>
      </div>`);
  }
  return parts.join('') || `<div class="vocab-explain-empty">Chưa có dữ liệu giải thích cho chữ này.</div>`;
}
// Sau khi đã innerHTML xong renderVocabExplainHTML(data, up), gọi hàm này để
// gắn hoạt động cho các nút "🇻🇳 Dịch" bên trong.
function wireVocabTranslateButtons(container, data, uidPrefix){
  if(!data.hasData) return;
  if(data.explanation) wireTranslateButton(container, uidPrefix+'-tr-expl-btn', uidPrefix+'-tr-expl-box', data.explanation);
  if(data.sentence) wireTranslateButton(container, uidPrefix+'-tr-sent-btn', uidPrefix+'-tr-sent-box', data.sentence.text);
}

// Gắn khối giải thích vào 1 container, tự lo loading / lỗi mạng.
async function mountVocabExplain(container, char){
  if(!container) return;
  container.innerHTML = `<div class="vocab-explain-loading"><span class="spinner"></span> <span id="vxLoadingMsg-${char}">Đang tra cứu...</span></div>`;
  try{
    const data = await getVocabExplain(char, (msg)=>{
      const el = container.querySelector(`#vxLoadingMsg-${CSS.escape(char)}`);
      if(el) el.textContent = msg;
    });
    const up = 'vx'+Math.random().toString(36).slice(2,8);
    container.innerHTML = renderVocabExplainHTML(data, up);
    wireVocabTranslateButtons(container, data, up);
  }catch(e){
    container.innerHTML = `<div class="vocab-explain-empty">⚠️ Không tải được dữ liệu (cần mạng cho lần tra đầu tiên). Thử lại khi có mạng.</div>`;
  }
}

// Tra 1 CỤM từ (vd trích từ 新闻精读, có thể 2-4 chữ): ưu tiên khớp đúng 1
// thành ngữ (idiom.json, có ví dụ câu thật) hoặc từ ghép (ci.json); nếu
// không khớp cụm nào, ghép giải thích từng chữ trong cụm lại làm dự phòng.
async function getVocabExplainForTerm(term, onProgress){
  await Promise.all([
    loadXinhuaCharDict(onProgress),
    loadXinhuaIdiomDict(onProgress),
    loadXinhuaCiList(onProgress),
  ]);
  if(term.length===1) return getVocabExplain(term, onProgress);

  const exactIdiom = (XinhuaCache.idiomList||[]).find(it => it.word===term);
  if(exactIdiom){
    return {
      char: term,
      pinyin: exactIdiom.pinyin || '',
      radicals: '', strokes: '',
      explanation: exactIdiom.explanation || '',
      combos: [],
      sentence: (exactIdiom.example||exactIdiom.derivation) ? { text: (exactIdiom.example||exactIdiom.derivation).trim(), from: term } : null,
      hasData: !!(exactIdiom.explanation || exactIdiom.example || exactIdiom.derivation),
    };
  }
  const exactCi = (XinhuaCache.ciList||[]).find(it => it.ci===term);
  if(exactCi){
    let py = '';
    if(typeof pinyinPro !== 'undefined' && pinyinPro.pinyin){
      try{ py = pinyinPro.pinyin(term, {toneType:'symbol'}); }catch(e){}
    }
    return {
      char: term, pinyin: py, radicals: '', strokes: '',
      explanation: exactCi.explanation || '',
      combos: [], sentence: null,
      hasData: !!exactCi.explanation,
    };
  }
  // dự phòng: gộp giải thích từng chữ trong cụm
  const perChar = [];
  for(const ch of term){
    if(!/[\u4e00-\u9fff]/.test(ch)) continue;
    const info = XinhuaCache.charMap.get(ch);
    if(info && info.explanation) perChar.push(`${ch}: ${info.explanation}`);
  }
  return {
    char: term, pinyin:'', radicals:'', strokes:'',
    explanation: perChar.join('\n'),
    combos: [], sentence: null,
    hasData: perChar.length>0,
  };
}
async function mountVocabExplainForTerm(container, term){
  if(!container) return;
  container.innerHTML = `<div class="vocab-explain-loading"><span class="spinner"></span> Đang tra cứu...</div>`;
  try{
    const data = await getVocabExplainForTerm(term);
    const up = 'vx'+Math.random().toString(36).slice(2,8);
    container.innerHTML = renderVocabExplainHTML(data, up);
    wireVocabTranslateButtons(container, data, up);
  }catch(e){
    container.innerHTML = `<div class="vocab-explain-empty">⚠️ Không tải được dữ liệu (cần mạng cho lần tra đầu tiên).</div>`;
  }
}

/* ---------------- Nhóm bằng bộ thủ + số nét (dùng cho 打卡) ---------------- */
// Trả về mảng chars đã chọn (tối đa n), ưu tiên: nhóm bộ thủ đông nhất trước,
// trong nhóm sắp theo số nét gần nhau nhất (chênh lệch nhỏ dần).
async function pickByRadicalAndStrokes(chars, n){
  await loadXinhuaCharDict();
  if(chars.length<=n) return chars.slice();

  const groups = new Map(); // radical -> [{ch,strokes}]
  const noData = [];
  for(const ch of chars){
    const rad = getRadicalSync(ch);
    const st = getStrokesSync(ch);
    if(!rad){ noData.push({ch, strokes: st}); continue; }
    if(!groups.has(rad)) groups.set(rad, []);
    groups.get(rad).push({ch, strokes: st});
  }
  // sắp các nhóm theo số lượng thành viên giảm dần
  const sortedGroups = [...groups.values()].sort((a,b)=>b.length-a.length);

  const picked = [];
  for(const g of sortedGroups){
    if(picked.length>=n) break;
    // trong nhóm: sắp theo số nét để các chữ gần số nét nhau đứng cạnh nhau,
    // rồi lấy 1 đoạn liên tiếp có độ chênh lệch nhỏ nhất vừa đủ n-picked.length phần tử
    const gs = [...g].sort((a,b)=>(a.strokes||99)-(b.strokes||99));
    const need = n - picked.length;
    let bestStart = 0, bestSpread = Infinity;
    for(let i=0;i+Math.min(need,gs.length)-1<gs.length;i++){
      const j = i+Math.min(need,gs.length)-1;
      const spread = (gs[j].strokes||99)-(gs[i].strokes||99);
      if(spread<bestSpread){ bestSpread=spread; bestStart=i; }
    }
    const slice = gs.slice(bestStart, bestStart+Math.min(need,gs.length));
    for(const it of slice) picked.push(it.ch);
  }
  // nếu vẫn chưa đủ n (do dữ liệu bộ thủ thiếu), lấp nốt từ danh sách còn lại
  if(picked.length<n){
    const rest = chars.filter(ch=>!picked.includes(ch));
    for(const ch of rest){ if(picked.length>=n) break; picked.push(ch); }
  }
  return picked.slice(0,n);
}
