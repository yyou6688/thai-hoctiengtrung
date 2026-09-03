/* ===================== Tập Viết — app.js =====================
   Dữ liệu lưu trong localStorage, hoạt động offline (trừ lần đầu tải
   dữ liệu nét viết cho 1 chữ mới — cần mạng 1 lần, HanziWriter tự
   cache lại sau đó nhờ service worker).
   Khoá lưu trữ: xnc_hanzi / xnc_checkins

   Thuật toán ôn tập: SRS kiểu Leitner đơn giản, tự viết, không phụ
   thuộc thư viện ngoài — mỗi chữ có "box" (0-7, cấp độ nhớ) và
   "dueDate". Trả lời tốt → box+1, khoảng ôn giãn ra theo BOX_INTERVALS.
   Trả lời "quên hẳn" → về box 0.
====================================================================== */

const STORE_KEYS = ['xnc_hanzi', 'xnc_checkins', 'xnc_pets'];
const BOX_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60]; // số ngày tới lần ôn kế tiếp ứng với mỗi box

function loadJSON(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDays(dateStr, n){
  const d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function escapeHTML(s){
  return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- HSK 3.0 (2025) — nguồn: OCR từ 新版HSK考试大纲 chính thức
   (kho: github.com/krmanik/HSK-3.0/New HSK (2025)/HSK Hanzi/). Lưu ý: HSK 3.0
   vẫn đang điều chỉnh tới 7/2026, số liệu có thể còn thay đổi nhẹ so với bản
   áp dụng cuối cùng. Riêng cấp 7-9: trang nguồn giới hạn hiển thị, mới lấy
   được 1000/1148 chữ (thiếu ~148 chữ cuối, sẽ bổ sung sau nếu cần). */
const HSK_LEVELS = {
'1': ['爱','二','姐','年','八','饭','今','您','爸','房','九','牛','吧','飞','觉','女','白','非','开','朋','百','分','看','漂','班','服','可','苹','半','高','客','七','包','哥','课','期','杯','歌','口','起','本','个','块','气','边','给','来','千','便','工','老','前','病','公','了','钱','不','狗','冷','请','菜','关','里','去','茶','贵','两','热','常','国','亮','人','唱','果','零','认','超','还','六','日','车','孩','妈','三','吃','汉','吗','商','出','好','买','上','穿','号','卖','少','床','喝','忙','谁','打','和','猫','什','大','很','么','生','蛋','后','没','师','到','候','妹','十','道','话','们','时','得','欢','米','识','的','回','面','士','弟','会','名','市','第','火','明','事','点','机','哪','视','电','鸡','那','是','东','几','奶','手','都','家','男','书','读','间','脑','水','对','见','呢','睡','多','件','能','说','儿','叫','你','司','四','西','样','怎','岁','息','要','找','他','习','也','这','它','喜','一','真','她','系','衣','正','太','下','医','知','题','先','宜','只','天','现','以','中','条','想','椅','钟','听','小','影','住','同','校','友','桌','外','些','有','子','玩','写','雨','字','晚','谢','语','租','喂','新','元','昨','文','星','院','作','问','兴','月','坐','我','休','再','做','五','学','在','午','雪','早'],
'2': ['啊','交','晴','希','帮','教','球','洗','备','介','然','笑','比','进','让','姓','笔','近','肉','颜','表','经','色','眼','别','睛','绍','药','步','酒','身','爷','场','就','始','已','词','咖','试','意','次','考','室','因','从','裤','舒','阴','错','快','思','泳','但','篮','送','游','地','乐','诉','右','等','累','虽','鱼','店','离','所','远','懂','留','疼','运','动','楼','踢','站','啡','路','体','长','夫','旅','跳','丈','告','绿','铁','周','跟','慢','头','着','馆','每','完','准','过','门','万','自','黑','拿','网','走','红','鸟','往','足','花','旁','忘','最','画','跑','望','左','坏','票','为','己','妻','位','记','情','舞'],
'3': ['阿','典','环','康','矮','调','换','渴','安','定','黄','刻','把','丢','婚','空','般','冬','活','哭','搬','短','或','筷','板','段','激','矿','办','锻','级','蓝','饱','朵','极','礼','报','饿','急','李','北','而','季','理','被','耳','绩','力','必','发','加','历','变','法','假','脸','遍','方','坚','练','宾','放','检','炼','冰','风','简','凉','才','封','健','辆','参','附','讲','聊','草','复','蕉','料','层','该','角','邻','查','概','饺','凌','差','感','脚','马','尝','干','较','码','衬','刚','接','满','成','糕','街','毛','城','根','节','冒','迟','更','结','末','持','共','解','目','初','故','界','南','除','顾','借','难','楚','瓜','斤','努','处','刮','净','爬','船','怪','静','怕','春','惯','境','拍','聪','海','久','盘','答','害','旧','胖','带','合','居','啤','担','河','句','片','单','乎','据','平','当','护','决','瓶','灯','化','卡','其','奇','收','香','用','骑','受','箱','邮','汽','瘦','响','又','铅','叔','向','于','且','束','像','羽','轻','树','鞋','育','清','数','心','遇','秋','刷','信','园','求','双','行','员','区','算','熊','愿','趣','糖','须','越','全','特','需','咱','泉','梯','选','脏','裙','提','牙','澡','容','甜','言','择','如','挺','演','展','赛','突','羊','张','伞','图','阳','照','扫','腿','养','者','沙','碗','业','直','山','卫','页','纸','衫','闻','姨','终','烧','屋','议','种','勺','务','易','重','声','物','音','主','实','戏','银','助','史','夏','饮','注','世','鲜','应','总','适','相','迎','嘴'],
'4': ['按','达','膏','即','案','待','胳','籍','傲','袋','格','计','巴','戴','各','纪','败','弹','功','技','棒','刀','供','际','保','导','购','济','抱','倒','够','既','背','登','估','继','倍','低','姑','寄','笨','底','鼓','价','鼻','递','挂','减','毕','掉','观','建','标','订','管','键','饼','堵','光','江','并','肚','广','将','播','度','逛','奖','博','断','规','降','膊','队','咳','郊','部','顿','寒','骄','擦','尔','喊','巾','猜','翻','汗','金','材','烦','航','仅','彩','反','何','尽','餐','费','盒','紧','操','份','贺','禁','厕','奋','厚','京','察','丰','呼','惊','产','否','忽','精','厂','肤','虎','景','晨','符','互','警','诚','幅','户','竞','乘','福','划','竟','程','父','怀','镜','厨','付','悔','究','础','负','伙','举','窗','傅','货','拒','吹','富','获','具','此','改','圾','剧','粗','赶','积','距','村','敢','基','聚','存','钢','及','绝','烤','秒','琴','死','科','民','青','松','棵','命','庆','嗽','克','默','取','速','肯','母','缺','塑','恐','慕','却','酸','苦','耐','确','随','况','恼','染','孙','困','闹','扰','台','垃','内','任','抬','拉','嗯','扔','态','辣','娘','仍','谈','懒','农','入','汤','浪','弄','散','躺','厉','暖','森','趟','丽','偶','伤','萄','励','排','稍','讨','利','牌','社','套','例','判','摄','堂','俩','乓','申','填','连','陪','深','厅','联','批','甚','庭','谅','皮','省','停','量','脾','剩','通','列','篇','失','童','林','频','拾','桶','龄','品','食','痛','另','聘','使','土','流','乒','氏','推','乱','评','示','脱','论','泼','式','袜','落','破','柿','危','律','葡','释','微','虑','普','匙','围','麻','戚','首','味','馒','弃','授','温','漫','签','售','污','帽','歉','输','无','貌','强','熟','误','美','敲','暑','吸','梦','桥','术','悉','迷','巧','帅','惜','密','切','顺','细','免','亲','硕','咸','险','研','愉','值','线','盐','与','职','羡','厌','预','植','乡','验','原','止','详','扬','约','址','项','洋','阅','指','象','邀','云','至','消','钥','允','志','效','叶','杂','质','辛','夜','仔','众','醒','疑','暂','洲','幸','艺','则','祝','性','忆','责','著','兄','译','增','专','修','谊','章','转','羞','引','账','赚','秀','印','招','装','许','赢','折','资','序','永','针','族','续','勇','争','组','血','优','整','尊','压','幽','证','座','亚','尤','之','烟','由','支','严','油','汁'],
'5': ['哎','翅','仿','汇','唉','冲','访','惠','暗','充','肥','慧','熬','虫','纷','祸','版','宠','疯','肌','扮','抽','扶','疾','伴','丑','佛','集','膀','臭','府','辑','傍','触','腐','挤','薄','传','妇','迹','宝','创','副','佳','暴','辞','盖','嘉','贝','刺','搞','甲','彼','促','革','驾','币','催','隔','架','闭','措','恭','艰','避','代','贡','捡','拨','胆','沟','剪','玻','旦','构','荐','补','淡','古','渐','布','挡','固','践','裁','档','冠','浆','采','蹈','瑰','浇','藏','敌','柜','阶','册','蝶','滚','届','测','冻','锅','谨','曾','洞','裹','敬','叉','斗','哈','救','插','豆','含','局','拆','独','憾','橘','倡','堆','衡','巨','朝','吨','猴','捐','吵','盾','胡','卷','炒','躲','湖','军','彻','乏','蝴','均','沉','罚','糊','靠','称','番','华','颗','承','繁','滑','控','橙','返','缓','扣','池','泛','灰','库','尺','范','挥','宽','齿','防','恢','款','狂','模','润','索','亏','陌','弱','锁','昆','漠','洒','桃','扩','某','傻','替','括','木','厦','挑','览','幕','晒','贴','郎','奈','删','统','劳','念','扇','投','姥','浓','善','途','泪','哦','擅','兔','类','欧','赏','团','厘','派','蛇','退','梨','培','舍','拖','璃','赔','设','弯','立','配','伸','威','恋','盆','神','违','良','碰','慎','唯','粮','匹','升','维','疗','骗','胜','伟','烈','拼','诗','尾','临','凭','施','未','灵','屏','湿','胃','铃','婆','石','慰','领','齐','驶','稳','令','企','似','卧','浏','器','势','握','龙','浅','饰','伍','漏','欠','守','武','陆','墙','殊','雾','录','抢','蔬','夕','碌','悄','属','析','逻','茄','鼠','席','络','勤','述','闲','率','穷','摔','显','骂','曲','税','县','矛','趋','私','限','玫','权','搜','献','媒','劝','俗','厢','魅','群','肃','享','秘','燃','素','橡','眠','绕','宿','销','描','忍','碎','肖','敏','荣','损','协','摸','软','缩','胁','斜','乙','赞','制','欣','亿','糟','治','形','义','造','致','型','益','赠','智','虚','营','炸','置','绪','映','摘','猪','宣','硬','窄','竹','寻','拥','占','逐','询','悠','战','煮','训','犹','涨','筑','迅','幼','掌','抓','押','余','召','状','鸭','娱','哲','撞','呀','玉','珍','追','延','域','诊','咨','沿','喻','阵','姿','腰','寓','震','紫','摇','豫','征','综','咬','圆','挣','阻','依','源','政','醉','移','怨','织','遵','遗','载','执'],
'6': ['碍','储','氛','恨','岸','串','粉','横','昂','闯','愤','宏','拔','垂','峰','虹','摆','纯','蜂','洪','拜','瓷','奉','壶','榜','匆','浮','幻','胞','醋','辅','患','爆','脆','赋','皇','悲','寸','覆','绘','辈','挫','尬','混','奔','搭','肝','惑','逼','呆','尴','击','壁','贷','岗','饥','臂','耽','港','吉','编','诞','稿','寂','兵','岛','割','夹','脖','稻','攻','嫁','捕','德','宫','稼','财','滴','巩','尖','踩','抵','孤','肩','残','帝','股','监','仓','吊','骨','兼','侧','钓','拐','剑','策','跌','官','鉴','柴','顶','贯','箭','肠','栋','罐','酱','偿','逗','归','胶','畅','督','龟','椒','抄','毒','轨','焦','嘲','渡','跪','杰','潮','端','棍','洁','撤','蹲','涵','捷','臣','夺','罕','截','尘','额','旱','戒','趁','恶','毫','劲','撑','帆','豪','井','呈','凡','耗','颈','惩','犯','核','径','崇','妨','嘿','纠','愁','肪','痕','舅','筹','肺','狠','菊','矩','煤','渠','铜','俱','弥','娶','筒','惧','蜜','圈','偷','菌','棉','券','透','刊','勉','壤','徒','砍','妙','绒','吐','抗','灭','融','吞','枯','摩','柔','托','酷','寞','撒','挖','夸','纳','塞','娃','馈','泥','嗓','哇','阔','拟','丧','歪','啦','扭','杀','顽','赖','怒','刹','亡','兰','诺','鲨','王','拦','盼','筛','委','栏','庞','闪','谓','烂','抛','尚','沃','狼','泡','舌','乌','廊','佩','射','晰','朗','喷','涉','媳','牢','捧','审','吓','雷','披','甥','嫌','粒','疲','盛','陷','怜','飘','狮','祥','链','贫','寿','宵','梁','坡','薯','歇','晾','迫','竖','谐','劣','扑','漱','携','淋','朴','衰','械','笼','铺','瞬','薪','露','欺','艘','胸','轮','棋','塔','雄','履','旗','踏','袖','略','启','汰','叙','蚂','恰','坛','蓄','嘛','牵','探','旋','埋','谦','碳','旬','迈','潜','烫','循','麦','枪','掏','讯','盲','腔','逃','讶','贸','瞧','淘','淹','眉','倾','添','炎','梅','屈','田','艳','宴','涌','粘','株','央','忧','崭','诸','仰','予','仗','砖','氧','浴','障','妆','痒','欲','枕','庄','遥','裕','镇','壮','野','誉','睁','椎','液','援','症','捉','仪','跃','枝','棕','蚁','晕','脂','踪','异','匀','侄','粽','抑','孕','殖','奏','疫','灾','秩','祖','姻','遭','肿','钻','隐','噪','州','罪','英','燥','粥','婴','扎','骤','颖','宅','珠'],
'7-9': ['哀','鄙','嘈','矗','挨','庇','槽','揣','癌','毙','蹭','踹','蔼','痹','岔','川','艾','碧','诧','喘','隘','蔽','掺','幢','暧','弊','搀','炊','凹','鞭','馋','捶','奥','贬','禅','锤','扒','扁','缠','唇','叭','辨','铲','淳','芭','辩','阐','醇','疤','辫','颤','蠢','靶','飙','昌','戳','坝','憋','猖','绰','罢','彬','敞','疵','霸','滨','钞','慈','掰','缤','巢','磁','柏','濒','扯','雌','扳','丙','澈','伺','颁','秉','辰','赐','斑','柄','陈','囱','拌','波','澄','葱','绊','剥','逞','丛','瓣','伯','秤','凑','绑','驳','痴','簇','谤','勃','弛','窜','磅','舶','驰','摧','煲','搏','侈','璀','褒','簸','耻','悴','雹','卜','斥','粹','堡','哺','赤','翠','豹','怖','憧','搓','卑','睬','仇','磋','碑','惭','绸','瘩','狈','惨','畴','歹','惫','灿','酬','逮','焙','璨','稠','怠','崩','苍','瞅','丹','绷','沧','锄','惮','迸','舱','橱','党','蹦','糙','畜','荡','叨','妒','辐','鬼','捣','兑','抚','桂','祷','敦','斧','骇','盗','盹','俯','酣','悼','炖','咐','憨','蹬','钝','赴','函','凳','哆','腹','捍','瞪','舵','缚','撼','堤','堕','丐','瀚','迪','惰','钙','夯','涤','讹','溉','浩','笛','鹅','甘','呵','嘀','厄','杆','禾','蒂','遏','竿','阂','缔','噩','纲','荷','颠','鳄','缸','赫','巅','恩','杠','鹤','甸','饵','戈','哼','垫','伐','疙','恒','淀','阀','鸽','轰','惦','贩','搁','哄','奠','坊','阁','烘','殿','芳','骼','弘','刁','纺','耕','喉','叼','绯','耿','吼','凋','匪','哽','狐','雕','诽','弓','唬','爹','废','躬','哗','迭','沸','拱','猾','谍','芬','勾','徊','叠','吩','钩','槐','碟','坟','苟','唤','丁','焚','咕','焕','叮','粪','菇','痪','盯','锋','辜','荒','钉','逢','谷','慌','鼎','讽','雇','凰','董','凤','寡','煌','兜','缝','卦','恍','抖','孵','乖','晃','陡','敷','棺','谎','赌','伏','灌','辉','睹','俘','闺','徽','杜','袱','诡','毁','卉','矫','慨','唠','讳','搅','楷','涝','贿','缴','勘','酪','秽','轿','堪','勒','昏','酵','坎','垒','荤','皆','侃','磊','浑','揭','槛','蕾','魂','劫','慷','棱','豁','竭','扛','愣','霍','诫','苛','狸','讥','津','磕','黎','缉','筋','壳','鲤','畸','锦','坷','吏','稽','晋','垦','隶','汲','浸','恳','莉','棘','茎','啃','莅','嫉','荆','坑','帘','脊','晶','吭','莲','忌','兢','孔','廉','剂','鲸','抠','敛','祭','阱','窟','辽','暨','憬','垮','僚','颊','窘','挎','寥','贾','揪','跨','潦','奸','灸','筐','咧','歼','拘','旷','猎','煎','鞠','框','裂','拣','咀','眶','拎','柬','沮','窥','麟','俭','炬','魁','吝','贱','倦','溃','赁','舰','诀','愧','陵','溅','抉','捆','聆','姜','倔','廓','岭','僵','掘','喇','溜','疆','崛','腊','瘤','桨','嚼','蜡','柳','匠','君','睐','遛','娇','钧','婪','咙','跤','俊','澜','胧','礁','峻','揽','聋','侥','骏','缆','隆','狡','竣','滥','窿','绞','凯','捞','拢','垄','眯','腻','譬','搂','谜','溺','偏','陋','觅','黏','撇','炉','泌','撵','坪','卤','绵','酿','萍','虏','缅','尿','泊','鲁','腼','捏','颇','赂','苗','宁','粕','鹿','瞄','拧','魄','孪','渺','凝','剖','卵','藐','泞','仆','抡','庙','纽','菩','伦','蔑','钮','谱','啰','鸣','奴','瀑','罗','铭','虐','曝','萝','谬','挪','沏','螺','膜','殴','栖','裸','磨','呕','凄','侣','蘑','趴','漆','屡','魔','帕','蹊','缕','抹','徘','歧','滤','茉','湃','祈','掠','沫','攀','崎','脉','莫','叛','乞','蛮','墨','畔','岂','瞒','谋','螃','迄','蔓','牡','刨','泣','芒','亩','袍','契','氓','拇','炮','砌','茫','姆','胚','掐','莽','沐','沛','洽','髦','牧','抨','迁','茂','募','烹','虔','枚','墓','棚','遣','霉','睦','蓬','谴','昧','暮','鹏','嵌','寐','呐','澎','呛','媚','乃','篷','跷','闷','囊','膨','侨','萌','挠','劈','憔','蒙','馁','屁','俏','盟','嫩','辟','峭','朦','逆','媲','窍','猛','匿','僻','翘','撬','煽','祀','剔','怯','膳','饲','屉','窃','赡','肆','剃','惬','裳','怂','涕','锲','捎','耸','惕','钦','梢','讼','嚏','侵','哨','诵','腆','禽','奢','颂','舔','寝','慑','苏','眺','擎','呻','酥','帖','顷','绅','溯','廷','丘','肾','蒜','亭','囚','渗','髓','艇','岖','牲','隧','捅','驱','绳','邃','凸','躯','圣','唆','秃','诠','尸','梭','涂','拳','蚀','嗦','屠','犬','矢','琐','颓','瘸','屎','塌','豚','雀','侍','拓','臀','攘','逝','蹋','驮','嚷','嗜','胎','妥','饶','誓','泰','椭','惹','兽','贪','唾','仁','抒','摊','蛙','韧','枢','滩','瓦','饪','梳','瘫','湾','溶','疏','痰','丸','冗','赎','潭','挽','揉','署','坦','惋','乳','曙','毯','婉','辱','恕','叹','腕','锐','墅','炭','汪','瑞','耍','唐','枉','若','甩','塘','妄','萨','拴','膛','旺','桑','涮','倘','帷','骚','霜','淌','伪','嫂','爽','涛','纬','涩','烁','滔','萎','啬','丝','陶','畏','僧','撕','腾','蔚','纱','寺','藤','瘟','纹','宪','炫','役','蚊','馅','削','绎','吻','镶','靴','弈','紊','翔','穴','逸','翁','巷','勋','裔','涡','萧','熏','溢','窝','潇','巡','毅','幄','嚣','汛','翼','呜','淆','驯','荫','诬','晓','逊','殷','侮','孝','丫','吟','捂','啸','鸦','瘾','兀','邪','芽','鹰','勿','挟','崖','荧','悟','泄','涯','盈','晤','泻','哑','莹','昔','卸','雅','蝇','牺','屑','揠','佣','奚','懈','岩','庸','稀','蟹','阎','恿','犀','芯','檐','踊','锡','馨','衍','佑','溪','衅','掩','诱','熙','猩','咽','淤','熄','腥','雁','渔','膝','刑','焰','逾','嬉','凶','燕','愚','袭','汹','殃','舆','徙','朽','秧','屿','隙','绣','杨','宇','虾','锈','漾','驭','瞎','嗅','妖','郁']
};


/* ---------------- seed data (chỉ chạy lần đầu) — lấy 10 chữ đầu HSK1 làm mẫu ---------------- */
const SEED_HANZI = HSK_LEVELS['1'].slice(0, 10);

function ensureSeed(){
  if(localStorage.getItem('xnc_hanzi')===null){
    const t = todayStr();
    const seed = SEED_HANZI.map(ch => ({
      id: uid(), char: ch, note: '', box: 0, dueDate: t, reviewCount: 0, createdAt: Date.now()
    }));
    saveJSON('xnc_hanzi', seed);
  }
  if(localStorage.getItem('xnc_checkins')===null) saveJSON('xnc_checkins', {});
}
ensureSeed();

let DB = {
  hanzi: loadJSON('xnc_hanzi', []),
  checkins: loadJSON('xnc_checkins', {}),
  pets: loadJSON('xnc_pets', null),
};
function persist(part){
  const map = {hanzi:'xnc_hanzi', checkins:'xnc_checkins', pets:'xnc_pets'};
  saveJSON(map[part], DB[part]);
}

/* ---------------- toast ---------------- */
let toastTimer=null;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ---------------- navigation ---------------- */
const VIEWS = ['home','write','deck','gendu','news','settings'];
function goView(name){
  VIEWS.forEach(v=>document.getElementById('view-'+v).classList.toggle('active', v===name));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  window.scrollTo(0,0);
  if(name==='home') renderHome();
  if(name==='write') renderWritePicker();
  if(name==='deck') renderDeck();
  if(name==='gendu') renderGenduSetup();
  if(name==='news') renderNewsView();
  if(name==='settings') loadWorkerCfgIntoForm();
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>goView(btn.dataset.view)));

/* ==================================================================
   HOME
================================================================== */
function checkinToday(){
  const t = todayStr();
  const already = !!DB.checkins[t];
  if(!already) DB.checkins[t] = true;
  persist('checkins');
  if(!already){
    const testInfo = getTodayTestInfo();
    const bonus = testInfo.attempted>0 && (testInfo.passed/testInfo.attempted)>=PET_QUALITY_BONUS_THRESHOLD;
    feedActivePet(bonus);
  }
  const events = refreshPetUnlocks();
  // hiện sau 1 nhịp để không bị các toast khác (vd "Đã ghi nhận...") đè mất ngay lập tức
  setTimeout(()=> showPetEvents(events), 1900);
}
function getStreak(){
  const dates = Object.keys(DB.checkins).filter(d=>DB.checkins[d]).sort();
  if(dates.length===0) return 0;
  const dateSet = new Set(dates);
  let streak=0;
  let cursor = new Date();
  const t = todayStr();
  if(!dateSet.has(t)) cursor.setDate(cursor.getDate()-1);
  while(true){
    const y=cursor.getFullYear(), m=String(cursor.getMonth()+1).padStart(2,'0'), d=String(cursor.getDate()).padStart(2,'0');
    const key=`${y}-${m}-${d}`;
    if(dateSet.has(key)){ streak++; cursor.setDate(cursor.getDate()-1); } else break;
  }
  return streak;
}
function getDueList(){
  const t = todayStr();
  return DB.hanzi.filter(h => h.dueDate <= t);
}

// Số chữ muốn hiển thị mỗi buổi 打卡 — cấu hình ở 生字库 (mặc định 15, như cũ)
function getCheckinQty(){
  const n = parseInt(localStorage.getItem('xnc_checkin_qty')||'15');
  return isNaN(n) ? 15 : n;
}
function setCheckinQty(n){ localStorage.setItem('xnc_checkin_qty', String(n)); }

// Lọc theo số nét chữ ở 打卡 (tuỳ chọn, mặc định không giới hạn — giữ hành vi cũ)
function getCheckinStrokeRange(){
  const raw = localStorage.getItem('xnc_checkin_stroke_range'); // "" | "1-5" | "custom:6:12"
  if(!raw) return null;
  const parts = raw.split(':');
  if(parts[0]==='custom'){
    const min = parts[1]!=='' ? parseInt(parts[1]) : null;
    const max = parts[2]!=='' ? parseInt(parts[2]) : null;
    if(min==null && max==null) return null;
    return {min, max};
  }
  const [a,b] = raw.split('-').map(Number);
  return {min:a, max:b};
}
function setCheckinStrokeRange(raw){ localStorage.setItem('xnc_checkin_stroke_range', raw); }

// Chọn ra danh sách chữ để hiển thị ở 打卡 hôm nay: nếu due nhiều hơn số đã
// cấu hình, ưu tiên nhóm CÙNG BỘ THỦ, trong nhóm thì SỐ NÉT gần nhau nhất
// (dùng dữ liệu xinhua nếu đã có sẵn trong bộ nhớ; nếu chưa có, dùng tạm
// thứ tự cũ rồi render lại ngay khi tải xong dữ liệu bộ thủ ở nền).
// Nếu có cấu hình lọc số nét, lọc trước — chữ ngoài khoảng vẫn còn hạn ôn
// bình thường (ngày ôn không đổi), chỉ tạm không hiện ở 打卡 hôm nay thôi.
async function pickCheckinList(due){
  const qty = getCheckinQty();
  const range = getCheckinStrokeRange();
  let pool = due;
  if(range){
    await loadXinhuaCharDict();
    const filtered = due.filter(h=>{
      const st = getStrokesSync(h.char);
      if(st==null) return false;
      if(range.min!=null && st<range.min) return false;
      if(range.max!=null && st>range.max) return false;
      return true;
    });
    if(filtered.length>0) pool = filtered;
    // nếu lọc xong không còn chữ nào khớp, tạm dùng lại danh sách gốc
    // (tránh 打卡 trống trơn chỉ vì khoảng nét chọn quá hẹp)
  }
  if(pool.length<=qty) return pool;
  const chars = pool.map(h=>h.char);
  const pickedChars = await pickByRadicalAndStrokes(chars, qty);
  const byChar = new Map(pool.map(h=>[h.char,h]));
  return pickedChars.map(ch=>byChar.get(ch)).filter(Boolean);
}

/* ---------------- 💡 Gợi ý chữ mới — dựa trên "lịch sử thao tác" ở 生字库
   (tức là bộ thủ + số nét của những chữ NGƯỜI DÙNG ĐÃ TỰ THÊM/NẠP vào kho),
   KHÔNG chọn ngẫu nhiên. Nếu kho đang trống (chưa thao tác gì) thì không
   suy đoán được gì cả — dẫn thẳng sang 生字库 để chọn chữ đầu tiên. ---------------- */
function getDeckRadicalFreq(){
  const freq = new Map(); // bộ thủ -> số lần xuất hiện trong kho hiện có
  for(const h of DB.hanzi){
    const r = getRadicalSync(h.char);
    if(r) freq.set(r, (freq.get(r)||0)+1);
  }
  return freq;
}
function suggestSimilarNewChars(n){
  if(DB.hanzi.length===0) return [];
  const freq = getDeckRadicalFreq();
  if(freq.size===0) return []; // dữ liệu bộ thủ chưa tải xong — chưa gợi ý được, không đoán bừa

  const existing = new Set(DB.hanzi.map(h=>h.char));
  const pool = [];
  for(const lvl of ['1','2','3','4','5','6','7-9']){
    for(const ch of HSK_LEVELS[lvl]){
      if(!existing.has(ch)) pool.push(ch);
    }
  }
  const strokesInDeck = DB.hanzi.map(h=>getStrokesSync(h.char)).filter(v=>v!=null);
  const avgStroke = strokesInDeck.length ? strokesInDeck.reduce((a,b)=>a+b,0)/strokesInDeck.length : null;
  // xếp hạng bộ thủ theo tần suất xuất hiện trong kho hiện có (nhiều nhất = ưu tiên nhất)
  const radicalRank = new Map([...freq.entries()].sort((a,b)=>b[1]-a[1]).map((e,i)=>[e[0], i]));

  const scored = [];
  const seen = new Set();
  for(const ch of pool){
    if(seen.has(ch)) continue;
    const r = getRadicalSync(ch);
    if(!r || !radicalRank.has(r)) continue; // chỉ gợi ý chữ CÙNG bộ thủ đã có trong kho
    seen.add(ch);
    const st = getStrokesSync(ch);
    const strokeDiff = (avgStroke!=null && st!=null) ? Math.abs(st-avgStroke) : 50;
    scored.push({ ch, rank: radicalRank.get(r), strokeDiff });
  }
  scored.sort((a,b)=> a.rank-b.rank || a.strokeDiff-b.strokeDiff);
  return scored.slice(0,n).map(s=>s.ch);
}
function renderSuggestNew(){
  const wrap = document.getElementById('suggestNewWrap');
  if(!wrap) return;
  if(DB.hanzi.length===0){
    wrap.innerHTML = `
      <h2 class="section-title">💡 Gợi ý chữ mới</h2>
      <div class="card" style="text-align:center;">
        <div class="rmeta" style="margin-bottom:10px;">Kho chữ đang trống nên chưa có gì để gợi ý — vào 生字库 chọn vài chữ đầu tiên đã nhé, lần sau app sẽ tự gợi ý chữ tương tự.</div>
        <button class="btn btn-primary btn-sm" id="btnGoDeckFromSuggest">Đi tới 生字库</button>
      </div>`;
    document.getElementById('btnGoDeckFromSuggest').addEventListener('click', ()=>goView('deck'));
    return;
  }
  const suggestions = suggestSimilarNewChars(8);
  if(suggestions.length===0){ wrap.innerHTML=''; return; }
  wrap.innerHTML = `
    <h2 class="section-title">💡 Gợi ý chữ mới</h2>
    <div class="section-sub">Cùng bộ thủ &amp; số nét gần với các chữ bạn đã thêm ở 生字库 — chạm để thêm ngay</div>
    <div class="hanzi-grid" id="suggestGrid">${suggestions.map(ch=>`<div class="hanzi-tile" data-suggest="${ch}">${ch}</div>`).join('')}</div>
  `;
  wrap.querySelectorAll('[data-suggest]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const ch = el.dataset.suggest;
      if(DB.hanzi.some(h=>h.char===ch)) return;
      DB.hanzi.push({ id: uid(), char: ch, note:'', box:0, dueDate: todayStr(), reviewCount:0, createdAt: Date.now() });
      persist('hanzi');
      toast('已添加 · Đã thêm '+ch+' vào kho!');
      renderHome();
    });
  });
}

function renderHome(){
  const streak = getStreak();
  document.getElementById('streakPillNum').textContent = streak;
  document.getElementById('heroStreak').textContent = streak+' ngày';
  const due = getDueList();
  const sub = document.getElementById('heroSub');
  if(DB.hanzi.length===0) sub.textContent = 'Thêm chữ đầu tiên vào 生字库 để bắt đầu 🌱';
  else if(due.length===0) sub.textContent = 'Hôm nay không có chữ cần ôn — có thể thêm chữ mới!';
  else sub.textContent = `Còn ${due.length} chữ cần ôn hôm nay`;

  const dotsWrap = document.getElementById('heroDots');
  dotsWrap.innerHTML='';
  for(let i=29;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const el=document.createElement('div');
    el.className='dot'+(DB.checkins[key]?' on':'');
    dotsWrap.appendChild(el);
  }

  const dueGrid = document.getElementById('dueGrid');
  if(due.length===0){
    dueGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="em">🎉</span><p>Không còn chữ nào đến hạn ôn hôm nay!</p></div>`;
  } else {
    // hiện tạm thời theo thứ tự cũ trong lúc chờ nhóm theo bộ thủ (nếu due > qty)
    dueGrid.innerHTML = due.slice(0, getCheckinQty()).map(h=>`
      <div class="hanzi-tile due" data-id="${h.id}">${h.char}<span class="badge"></span></div>
    `).join('');
    dueGrid.querySelectorAll('.hanzi-tile').forEach(el=>{
      el.addEventListener('click', ()=>{ goView('write'); openWriter(el.dataset.id); });
    });
    if(due.length>getCheckinQty() || getCheckinStrokeRange()){
      pickCheckinList(due).then(list=>{
        dueGrid.innerHTML = list.map(h=>`
          <div class="hanzi-tile due" data-id="${h.id}">${h.char}<span class="badge"></span></div>
        `).join('');
        dueGrid.querySelectorAll('.hanzi-tile').forEach(el=>{
          el.addEventListener('click', ()=>{ goView('write'); openWriter(el.dataset.id); });
        });
      }).catch(()=>{ /* giữ nguyên danh sách tạm nếu tải dữ liệu bộ thủ thất bại */ });
    }
  }

  document.getElementById('statTotal').textContent = DB.hanzi.length;
  document.getElementById('statMastered').textContent = DB.hanzi.filter(h=>h.box>=5).length;
  document.getElementById('statDue').textContent = due.length;

  renderPetCard();
  renderSuggestNew();
}

/* ==================================================================
   写字练习 WRITE — HanziWriter tích hợp
================================================================== */
let writer = null;
let currentHanziId = null;

function renderWritePicker(){
  const wrap = document.getElementById('writePicker');
  const sub = document.getElementById('writeSub');
  if(DB.hanzi.length===0){
    wrap.innerHTML = `<div class="empty-state"><span class="em">✍️</span><p>Chưa có chữ nào trong kho.</p><p>Vào 生字库 để thêm chữ đầu tiên!</p></div>`;
    sub.textContent = '';
    return;
  }
  sub.textContent = 'Chọn 1 chữ bất kỳ để luyện, hoặc bấm chữ cần ôn ở trang 打卡';
  wrap.innerHTML = `<div class="hanzi-grid">` + DB.hanzi.map(h=>{
    const due = h.dueDate <= todayStr();
    return `<div class="hanzi-tile${due?' due':''}" data-id="${h.id}">${h.char}${due?'<span class="badge"></span>':''}</div>`;
  }).join('') + `</div>`;
  wrap.querySelectorAll('.hanzi-tile').forEach(el=>{
    el.addEventListener('click', ()=>openWriter(el.dataset.id));
  });
}

function openWriter(id){
  const h = DB.hanzi.find(x=>x.id===id);
  if(!h) return;
  currentHanziId = id;
  document.getElementById('writerCard').style.display = 'flex';
  document.getElementById('reviewButtons').style.display = 'none';
  const timedStatusEl = document.getElementById('timedTestStatus');
  if(timedStatusEl){ timedStatusEl.style.display='none'; timedStatusEl.innerHTML=''; }
  clearInterval(timedTestTimer);
  document.getElementById('writerNote').textContent = h.note || '(chưa có ghi chú liên tưởng — thêm ở 生字库)';

  // phiên âm bằng pinyin-pro nếu tải được
  let py = '';
  if(typeof pinyinPro !== 'undefined' && pinyinPro.pinyin){
    try{ py = pinyinPro.pinyin(h.char, {toneType:'symbol'}); }catch(e){}
  }
  document.getElementById('writerPinyin').textContent = py;

  const target = document.getElementById('hanziTarget');
  target.innerHTML = '';

  if(typeof HanziWriter === 'undefined'){
    target.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Chưa tải được thư viện luyện viết (cần mạng lần đầu). Kiểm tra kết nối rồi thử lại.</div>`;
    return;
  }

  try{
    writer = HanziWriter.create('hanziTarget', h.char, {
      width: 260, height: 260, padding: 16,
      strokeAnimationSpeed: 1, delayBetweenStrokes: 200,
      strokeColor: '#2F8F86', radicalColor: '#F5B942',
      outlineColor: '#D3ECE9', drawingColor: '#2F8F86',
    });
  }catch(e){
    target.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Không tải được dữ liệu nét viết cho chữ này (có thể do mất mạng).</div>`;
    writer = null;
  }

  const vxWrap = document.getElementById('writerVocabExplain');
  if(vxWrap) mountVocabExplain(vxWrap, h.char);
}

document.getElementById('btnShowAnim').addEventListener('click', ()=>{
  if(writer) writer.animateCharacter();
});
document.getElementById('btnHint').addEventListener('click', ()=>{
  if(writer) writer.highlightStroke ? null : null; // no-op fallback
  if(writer && writer.quiz) {
    // nếu đang ở chế độ quiz, hint sẽ tự hoạt động qua showHintAfterMisses;
    // ngoài quiz, ta hiển thị animate 1 nét đầu làm gợi ý
  }
  if(writer) writer._hintRequested = true;
  if(writer) writer.animateCharacter({ onComplete(){} });
  toast('Xem lại nét mẫu để nhớ thứ tự viết');
});
document.getElementById('btnQuiz').addEventListener('click', ()=>{
  if(!writer) return;
  writer.quiz({
    onComplete: (summary)=>{
      document.getElementById('reviewButtons').style.display = 'flex';
      toast('Viết xong! Tự đánh giá mức độ nhớ bên dưới');
    }
  });
});

/* ---------------- ⏱ Kiểm tra viết tính giờ (2 lượt) — thưởng cho thú cưng ----------------
   Tách riêng khỏi "✍️ Tự viết (chấm điểm)" ở trên: cái đó dùng để TỰ ĐÁNH GIÁ
   cho hệ SRS (không đổi). Bài kiểm tra này khắt khe hơn (có giờ, tối đa 2 lượt)
   và chỉ ảnh hưởng tới việc thú cưng có được cho ăn thêm hay không — không
   đụng vào box/dueDate của chữ. */
let timedTestTimer = null;
document.getElementById('btnTimedTest').addEventListener('click', ()=>{
  if(!writer || !currentHanziId) return;
  const h = DB.hanzi.find(x=>x.id===currentHanziId);
  if(!h) return;
  startTimedTest(h, 1);
});
function startTimedTest(h, attempt){
  const statusEl = document.getElementById('timedTestStatus');
  const strokes = h.strokes || getStrokesSync(h.char) || 10;
  const limit = getTestTimeLimit(strokes);
  let remaining = limit;
  let finished = false;
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<div class="rmeta">⏱ Lượt ${attempt}/2 — còn <b id="timedTestClock">${remaining}</b>s để viết đúng ${strokes} nét</div>`;
  clearInterval(timedTestTimer);
  timedTestTimer = setInterval(()=>{
    remaining--;
    const clockEl = document.getElementById('timedTestClock');
    if(clockEl) clockEl.textContent = remaining;
    if(remaining<=0){
      clearInterval(timedTestTimer);
      if(!finished){ finished=true; try{ writer.cancelQuiz && writer.cancelQuiz(); }catch(e){}
        handleTimedTestResult(h, attempt, false, 'Hết giờ!'); }
    }
  }, 1000);
  try{
    writer.quiz({
      onComplete: (summary)=>{
        if(finished) return; finished=true; clearInterval(timedTestTimer);
        const allowedMistakes = Math.max(1, Math.ceil(strokes/4));
        const pass = (summary.totalMistakes||0) <= allowedMistakes;
        handleTimedTestResult(h, attempt, pass, pass?'':'Sai quá nhiều nét');
      }
    });
  }catch(e){
    clearInterval(timedTestTimer);
    statusEl.innerHTML = `<div class="rmeta">Không chạy được bài kiểm tra (thiếu dữ liệu nét viết).</div>`;
  }
}
function handleTimedTestResult(h, attempt, pass, reason){
  const statusEl = document.getElementById('timedTestStatus');
  if(pass){
    recordTestResult(true);
    statusEl.innerHTML = `<div class="rmeta" style="color:var(--primary-dark);font-weight:700;">🎉 Qua kiểm tra! Đã tính vào tỉ lệ nhớ tốt hôm nay cho thú cưng.</div>`;
    toast('Qua kiểm tra viết! 🐾');
  } else if(attempt<2){
    statusEl.innerHTML = `<div class="rmeta">${reason} — thử thêm 1 lượt nữa nhé!</div>`;
    setTimeout(()=> startTimedTest(h, 2), 1200);
  } else {
    recordTestResult(false);
    statusEl.innerHTML = `<div class="rmeta">${reason} — chưa qua kiểm tra lần này, không sao, cứ tiếp tục ôn 🌱</div>`;
  }
}

document.getElementById('reviewButtons').addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-grade]');
  if(!btn || !currentHanziId) return;
  gradeHanzi(currentHanziId, parseInt(btn.dataset.grade));
});

function gradeHanzi(id, grade){
  const h = DB.hanzi.find(x=>x.id===id);
  if(!h) return;
  if(grade===0){ h.box = 0; }
  else if(grade===1){ h.box = Math.max(0, h.box); } // giữ nguyên box, ôn lại sớm
  else { h.box = Math.min(BOX_INTERVALS.length-1, h.box+1); }
  h.reviewCount = (h.reviewCount||0)+1;
  const interval = grade===1 ? 1 : BOX_INTERVALS[h.box];
  h.dueDate = addDays(todayStr(), interval);
  persist('hanzi');
  checkinToday();
  document.getElementById('reviewButtons').style.display = 'none';
  toast(`Đã ghi nhận — ôn lại sau ${interval} ngày`);
  renderWritePicker();
  renderHome();
}

/* ==================================================================
   生字库 DECK
================================================================== */
function renderDeck(){
  const qtySel = document.getElementById('deckCheckinQty');
  if(qtySel) qtySel.value = String(getCheckinQty());
  const rangeSel = document.getElementById('deckCheckinStrokeRange');
  if(rangeSel) rangeSel.value = localStorage.getItem('xnc_checkin_stroke_range') || '';
  const customWrap = document.getElementById('deckCheckinStrokeCustom');
  if(customWrap) customWrap.style.display = rangeSel && rangeSel.value==='custom' ? 'flex' : 'none';
  if(rangeSel && rangeSel.value==='custom'){
    const raw = (localStorage.getItem('xnc_checkin_stroke_range')||'').split(':');
    document.getElementById('deckCheckinStrokeMin').value = raw[1] || '';
    document.getElementById('deckCheckinStrokeMax').value = raw[2] || '';
  }
  const wrap = document.getElementById('deckList');
  if(DB.hanzi.length===0){
    wrap.innerHTML = `<div class="empty-state"><span class="em">📚</span><p>Kho chữ đang trống.</p><p>Bấm ＋ để thêm chữ đầu tiên!</p></div>`;
    return;
  }
  const sorted = [...DB.hanzi].sort((a,b)=>b.createdAt-a.createdAt);
  wrap.innerHTML = sorted.map(h=>{
    const due = h.dueDate <= todayStr();
    return `
    <div class="card" style="padding:14px 16px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="font-size:28px;font-weight:700;flex:none;">${h.char}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
            <span class="tag">Box ${h.box}</span>
            ${due?'<span class="tag accent">Đến hạn ôn</span>':`<span class="rmeta">Ôn lại: ${h.dueDate}</span>`}
          </div>
          ${h.note?`<div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${escapeHTML(h.note)}</div>`:''}
        </div>
        <button class="btn btn-ghost btn-sm" data-del="${h.id}" style="flex:none;">Xoá</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      DB.hanzi = DB.hanzi.filter(x=>x.id!==b.dataset.del);
      persist('hanzi'); renderDeck();
    });
  });
}

document.getElementById('deckCheckinQty').addEventListener('change', (e)=>{
  setCheckinQty(parseInt(e.target.value));
  toast('Đã lưu — 打卡 sẽ hiện tối đa '+e.target.value+' chữ, chọn theo cùng bộ thủ');
  renderHome();
});

document.getElementById('deckCheckinStrokeRange').addEventListener('change', (e)=>{
  const customWrap = document.getElementById('deckCheckinStrokeCustom');
  if(e.target.value==='custom'){
    customWrap.style.display = 'flex';
    return; // chờ nhập xong 2 ô rồi lưu qua listener bên dưới
  }
  customWrap.style.display = 'none';
  setCheckinStrokeRange(e.target.value); // "" hoặc "1-5" / "6-10" / ...
  toast(e.target.value ? 'Đã lưu — 打卡 chỉ ưu tiên chữ trong khoảng nét này' : 'Đã bỏ lọc theo số nét ở 打卡');
  renderHome();
});
function saveDeckCheckinStrokeCustom(){
  const min = document.getElementById('deckCheckinStrokeMin').value;
  const max = document.getElementById('deckCheckinStrokeMax').value;
  if(min==='' && max===''){ setCheckinStrokeRange(''); return; }
  if(min!=='' && max!=='' && parseInt(min)>parseInt(max)){ toast('Khoảng nét không hợp lệ (Từ lớn hơn Đến)'); return; }
  setCheckinStrokeRange(`custom:${min}:${max}`);
  toast('Đã lưu — 打卡 chỉ ưu tiên chữ trong khoảng nét này');
  renderHome();
}
document.getElementById('deckCheckinStrokeMin').addEventListener('change', saveDeckCheckinStrokeCustom);
document.getElementById('deckCheckinStrokeMax').addEventListener('change', saveDeckCheckinStrokeCustom);

document.getElementById('btnAddHanzi').addEventListener('click', ()=>{
  openModal(`
    <h3>Thêm chữ mới</h3>
    <label class="field-label">Chữ Hán (chỉ 1 chữ mỗi lần)</label>
    <input type="text" id="mHChar" maxlength="1" placeholder="VD: 谢" style="font-size:20px;text-align:center;">
    <label class="field-label">Câu chuyện liên tưởng (giúp nhớ mặt chữ)</label>
    <textarea id="mHNote" placeholder="VD: 讠(lời nói) + 射(bắn) — lời nói bắn ra như mũi tên cảm ơn"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Huỷ</button>
      <button class="btn btn-primary" id="mHSave">Lưu</button>
    </div>
  `);
  document.getElementById('mHSave').addEventListener('click', ()=>{
    const char = document.getElementById('mHChar').value.trim();
    if(!char){ toast('Chưa nhập chữ'); return; }
    if(!/[\u4e00-\u9fff]/.test(char)){ toast('Vui lòng nhập 1 chữ Hán'); return; }
    if(DB.hanzi.some(h=>h.char===char)){ toast('Chữ này đã có trong kho rồi'); return; }
    DB.hanzi.push({
      id: uid(), char, note: document.getElementById('mHNote').value.trim(),
      box: 0, dueDate: todayStr(), reviewCount: 0, createdAt: Date.now()
    });
    persist('hanzi');
    closeModal(); renderDeck(); renderHome();
    toast('已添加 · Đã thêm chữ mới!');
  });
});

/* ---------------- Đếm số nét chữ bằng HanziWriter (chạy 1 lần, cache lại) ---------------- */
function getStrokeCountCache(){ return loadJSON('xnc_strokecounts', {}); }
function saveStrokeCountCache(cache){ saveJSON('xnc_strokecounts', cache); }

async function fetchStrokeCount(char, cache){
  if(cache[char] !== undefined) return cache[char];
  if(typeof HanziWriter === 'undefined' || !HanziWriter.loadCharacterData){
    return 99; // không tải được thư viện — coi như "khó nhất", xếp cuối
  }
  try{
    const data = await HanziWriter.loadCharacterData(char);
    const count = (data && data.strokes) ? data.strokes.length : 99;
    cache[char] = count;
    return count;
  }catch(e){
    cache[char] = 99;
    return 99;
  }
}

// tải số nét cho 1 danh sách chữ, chạy song song theo từng đợt nhỏ để không quá tải mạng
async function loadStrokeCounts(chars, onProgress){
  const cache = getStrokeCountCache();
  const BATCH = 15;
  for(let i=0;i<chars.length;i+=BATCH){
    const batch = chars.slice(i, i+BATCH);
    await Promise.all(batch.map(ch => fetchStrokeCount(ch, cache)));
    if(onProgress) onProgress(Math.min(i+BATCH, chars.length), chars.length);
  }
  saveStrokeCountCache(cache);
  return cache;
}

document.getElementById('btnImportHSK1').addEventListener('click', ()=>{
  openModal(`
    <h3>Nạp bộ chữ theo HSK</h3>
    <label class="field-label">Chọn cấp độ</label>
    <select id="mImpLevel">
      <option value="1">HSK 1 (${HSK_LEVELS['1'].length} chữ)</option>
      <option value="2">HSK 2 (${HSK_LEVELS['2'].length} chữ)</option>
      <option value="3">HSK 3 (${HSK_LEVELS['3'].length} chữ)</option>
      <option value="4">HSK 4 (${HSK_LEVELS['4'].length} chữ)</option>
      <option value="5">HSK 5 (${HSK_LEVELS['5'].length} chữ)</option>
      <option value="6">HSK 6 (${HSK_LEVELS['6'].length} chữ)</option>
      <option value="7-9">HSK 7-9 (${HSK_LEVELS['7-9'].length}+ chữ)</option>
    </select>
    <label class="field-label">Số nét chữ</label>
    <select id="mImpStrokeRange">
      <option value="">Không giới hạn</option>
      <option value="1-5">1 – 5 nét (dễ)</option>
      <option value="6-10">6 – 10 nét (vừa)</option>
      <option value="11-15">11 – 15 nét (khó)</option>
      <option value="16-99">16+ nét (rất khó)</option>
      <option value="custom">Tùy chỉnh...</option>
    </select>
    <div id="mImpStrokeCustom" style="display:none;align-items:center;gap:8px;margin-top:8px;">
      <input type="number" id="mImpStrokeMin" placeholder="Từ" min="1" style="width:100%;">
      <span style="color:var(--text-muted);font-size:13px;flex:none;">đến</span>
      <input type="number" id="mImpStrokeMax" placeholder="Đến" min="1" style="width:100%;">
      <span style="color:var(--text-muted);font-size:13px;flex:none;white-space:nowrap;">nét</span>
    </div>
    <label class="field-label">Số chữ mới mỗi ngày</label>
    <select id="mImpQty">
      <option value="5">5 chữ/ngày (chậm, chắc)</option>
      <option value="10" selected>10 chữ/ngày (vừa)</option>
      <option value="20">20 chữ/ngày (nhanh)</option>
    </select>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">Chữ sẽ được lọc theo số nét đã chọn (nếu có), rồi tự xếp theo <b>số nét từ ít đến nhiều</b> (dễ trước, khó sau) trong khoảng đó. Chữ đã có trong kho sẽ được bỏ qua.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Huỷ</button>
      <button class="btn btn-primary" id="mImportConfirm">Nạp ngay</button>
    </div>
  `);
  document.getElementById('mImpStrokeRange').addEventListener('change', (e)=>{
    document.getElementById('mImpStrokeCustom').style.display = e.target.value==='custom' ? 'flex' : 'none';
  });
  document.getElementById('mImportConfirm').addEventListener('click', async ()=>{
    const level = document.getElementById('mImpLevel').value;
    const qtyPerDay = parseInt(document.getElementById('mImpQty').value);
    const rangeSel = document.getElementById('mImpStrokeRange').value;
    let strokeMin = null, strokeMax = null;
    if(rangeSel==='custom'){
      const a = parseInt(document.getElementById('mImpStrokeMin').value);
      const b = parseInt(document.getElementById('mImpStrokeMax').value);
      if(!isNaN(a)) strokeMin = a;
      if(!isNaN(b)) strokeMax = b;
      if(strokeMin!=null && strokeMax!=null && strokeMin>strokeMax){ toast('Khoảng nét không hợp lệ (Từ lớn hơn Đến)'); return; }
    } else if(rangeSel){
      const [a,b] = rangeSel.split('-').map(Number);
      strokeMin = a; strokeMax = b;
    }
    const existing = new Set(DB.hanzi.map(h=>h.char));
    const toAdd = HSK_LEVELS[level].filter(ch => !existing.has(ch));
    if(toAdd.length===0){ toast('Cấp này đã có đủ trong kho rồi'); closeModal(); return; }

    document.getElementById('modalBody').innerHTML = `
      <h3>Đang tính độ khó theo số nét...</h3>
      <p style="font-size:13px;color:var(--text-muted);" id="mImpProgress">0 / ${toAdd.length} chữ</p>
    `;
    const counts = await loadStrokeCounts(toAdd, (done,total)=>{
      const el = document.getElementById('mImpProgress');
      if(el) el.textContent = `${done} / ${total} chữ`;
    });

    // lọc theo khoảng số nét đã chọn (nếu có) trước khi sắp xếp
    let filtered = toAdd;
    if(strokeMin!=null || strokeMax!=null){
      filtered = toAdd.filter(ch=>{
        const st = counts[ch];
        if(!st || st===99) return false; // không xác định được số nét — bỏ qua khi có lọc theo nét
        if(strokeMin!=null && st<strokeMin) return false;
        if(strokeMax!=null && st>strokeMax) return false;
        return true;
      });
      if(filtered.length===0){ toast('Không có chữ nào trong khoảng nét đã chọn'); closeModal(); return; }
    }

    // sắp xếp theo số nét tăng dần (dễ → khó); nét bằng nhau thì giữ thứ tự gốc
    const sorted = [...filtered].sort((a,b)=> (counts[a]||99) - (counts[b]||99));

    sorted.forEach((ch, i)=>{
      DB.hanzi.push({
        id: uid(), char: ch, note: '',
        box: 0, dueDate: addDays(todayStr(), Math.floor(i/qtyPerDay)),
        reviewCount: 0, createdAt: Date.now(),
        strokes: counts[ch] || null
      });
    });
    persist('hanzi');
    closeModal(); renderDeck(); renderHome();
    toast(`Đã nạp ${sorted.length} chữ, xếp từ dễ→khó, ${qtyPerDay} chữ/ngày`);
  });
});

/* ==================================================================
   MODAL helper
================================================================== */
function openModal(html){
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', closeModal));
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); }
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='modalOverlay') closeModal();
});

/* ==================================================================
   SETTINGS: export / import / reset
================================================================== */
document.getElementById('btnExport').addEventListener('click', ()=>{
  const payload = { exportedAt: new Date().toISOString(), hanzi: DB.hanzi, checkins: DB.checkins };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `tap-viet-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('已导出备份 · Đã xuất file!');
});
document.getElementById('btnImport').addEventListener('click', ()=>document.getElementById('fileImport').click());
document.getElementById('fileImport').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const data = JSON.parse(ev.target.result);
      if(data.hanzi) DB.hanzi = data.hanzi;
      if(data.checkins) DB.checkins = data.checkins;
      persist('hanzi'); persist('checkins');
      toast('已恢复数据 · Đã khôi phục!');
      renderHome();
    }catch(err){ toast('File không hợp lệ'); }
  };
  reader.readAsText(file);
  e.target.value='';
});
document.getElementById('btnReset').addEventListener('click', ()=>{
  openModal(`
    <h3>Xoá toàn bộ dữ liệu?</h3>
    <p style="font-size:13px;color:var(--text-muted);">Hành động này không thể hoàn tác. Hãy chắc chắn bạn đã xuất bản sao lưu.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Huỷ</button>
      <button class="btn btn-primary" id="mResetConfirm" style="background:#C0637E;">Xoá hết</button>
    </div>
  `);
  document.getElementById('mResetConfirm').addEventListener('click', ()=>{
    localStorage.clear();
    DB = {hanzi:[], checkins:{}};
    persist('hanzi'); persist('checkins');
    closeModal(); goView('home');
    toast('已清空 · Đã xoá toàn bộ');
  });
});

/* ==================================================================
   NEWS WORKER CONFIG (dùng chung Worker với Xưởng Luyện Nói)

   Vì sao có người bị "tự động mất" URL + Token đã lưu:
   localStorage lưu theo TỪNG trình duyệt / TỪNG thiết bị, không đồng bộ
   qua lại. Trên iOS, app "Thêm vào MH chính" (PWA standalone) còn có thể
   bị hệ điều hành tự dọn dữ liệu web nếu lâu không mở, hoặc khi cài lại
   icon trên màn hình chính (tạo ra 1 "hồ sơ" lưu trữ mới, trống trơn).
   => Giải pháp: cho phép nhúng cấu hình NGAY TRONG LINK (query string
   ?wurl=...&wtoken=...). Mở link đó lần nào, cấu hình tự nạp lại lần đó
   — kể cả sau khi bị xoá dữ liệu hay đổi máy. Nút "Tạo link chia sẻ cấu
   hình" bên dưới sẽ tạo link này; hãy dùng CHÍNH link đó để "Thêm vào
   màn hình chính" thay vì link gốc, để mỗi lần cài lại app vẫn tự có
   cấu hình luôn.
================================================================== */
function getWorkerCfg(){
  return {
    url: (localStorage.getItem('xnc_worker_url')||'').trim(),
    token: (localStorage.getItem('xnc_worker_token')||'').trim()
  };
}
function saveWorkerCfg(url, token){
  localStorage.setItem('xnc_worker_url', url);
  localStorage.setItem('xnc_worker_token', token);
}
function loadWorkerCfgIntoForm(){
  const cfg = getWorkerCfg();
  document.getElementById('cfgWorkerUrl').value = cfg.url;
  document.getElementById('cfgWorkerToken').value = cfg.token;
}
document.getElementById('btnSaveWorkerCfg').addEventListener('click', ()=>{
  const url = document.getElementById('cfgWorkerUrl').value.trim().replace(/\/$/,'');
  const token = document.getElementById('cfgWorkerToken').value.trim();
  saveWorkerCfg(url, token);
  toast('已保存 · Đã lưu cấu hình!');
});

// Nếu link được mở kèm ?wurl=...&wtoken=... thì tự nạp vào localStorage
// (chạy sớm ngay khi app khởi động, xem cuối file phần "init").
function applyWorkerCfgFromURL(){
  const params = new URLSearchParams(location.search);
  const url = params.get('wurl');
  const token = params.get('wtoken');
  if(url || token){
    const cur = getWorkerCfg();
    saveWorkerCfg(url ? url.trim().replace(/\/$/,'') : cur.url, token!==null ? token.trim() : cur.token);
    // xoá query khỏi thanh địa chỉ để không lộ token khi chia sẻ ảnh chụp màn hình,
    // nhưng vẫn giữ nguyên dữ liệu đã lưu vào localStorage ở trên
    history.replaceState(null, '', location.pathname + location.hash);
    toast('Đã tự nạp cấu hình Worker từ link');
  }
}
document.getElementById('btnMakeShareLink').addEventListener('click', ()=>{
  const cfg = getWorkerCfg();
  if(!cfg.url){ toast('Chưa có cấu hình để tạo link — lưu cấu hình trước đã'); return; }
  const link = location.origin + location.pathname
    + '?wurl=' + encodeURIComponent(cfg.url)
    + '&wtoken=' + encodeURIComponent(cfg.token);
  openModal(`
    <h3>Link chia sẻ cấu hình</h3>
    <p style="font-size:12.5px;color:var(--text-muted);">Mở link này ở bất kỳ máy/trình duyệt nào (và dùng đúng link này khi "Thêm vào màn hình chính") để tự động có sẵn cấu hình Worker — kể cả sau khi mất dữ liệu cũ. Link chứa Token, chỉ chia sẻ cho người bạn tin tưởng.</p>
    <textarea id="shareLinkText" readonly style="font-size:11.5px;min-height:90px;">${escapeHTML(link)}</textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Đóng</button>
      <button class="btn btn-primary" id="btnCopyShareLink">📋 Copy link</button>
    </div>
  `);
  document.getElementById('btnCopyShareLink').addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(link); toast('Đã copy link!'); }
    catch(e){ document.getElementById('shareLinkText').select(); document.execCommand('copy'); toast('Đã copy link!'); }
  });
});
// Xin trình duyệt "giữ" dữ liệu lâu hơn, giảm khả năng bị hệ điều hành tự dọn
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persist().catch(()=>{});
}

/* ==================================================================
   NEWS: dán link → AI tóm tắt + phiên âm + trích từ (gọi chung Worker)
================================================================== */
let newsCache = { detail: null };

function renderNewsView(){
  const cfg = getWorkerCfg();
  document.getElementById('newsConfigWarning').style.display = cfg.url ? 'none' : 'block';
  renderNewsDetail();
}

document.getElementById('btnNewsGo').addEventListener('click', doNewsFromUrl);
document.getElementById('newsUrl').addEventListener('keydown', (e)=>{
  if(e.key==='Enter') doNewsFromUrl();
});

function doNewsFromUrl(){
  const link = document.getElementById('newsUrl').value.trim();
  if(!link){ toast('Dán link bài báo trước đã'); return; }
  if(!/^https?:\/\//i.test(link)){ toast('Link phải bắt đầu bằng http:// hoặc https://'); return; }
  const cfg = getWorkerCfg();
  if(!cfg.url){ toast('Chưa cấu hình Worker — vào ⚙️ 设置'); return; }
  doNewsSummarize({ link, title: link });
}

async function doNewsSummarize(item){
  const cfg = getWorkerCfg();
  const detailEl = document.getElementById('newsDetail');
  detailEl.innerHTML = `<div class="card"><span class="spinner"></span> Đang lấy nội dung + tóm tắt bằng AI... (có thể mất 10-20s)</div>`;
  try{
    const res = await fetch(cfg.url.replace(/\/$/,'')+'/summarize', {
      method:'POST',
      headers: { 'Authorization':'Bearer '+cfg.token, 'Content-Type':'application/json' },
      body: JSON.stringify({ url: item.link })
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    newsCache.detail = { source: item, summary: data.summary || '', vocab: data.vocab || [] };
    renderNewsDetail();
  }catch(err){
    detailEl.innerHTML = `<div class="card">⚠️ Lỗi: ${escapeHTML(err.message)} (kiểm tra URL/Token ở 设置)</div>`;
  }
}

function pinyinRuby(text){
  if(typeof pinyinPro === 'undefined' || !pinyinPro.pinyin) return escapeHTML(text);
  let out = '';
  for(const ch of text){
    if(/[\u4e00-\u9fff]/.test(ch)){
      const py = pinyinPro.pinyin(ch, {toneType:'symbol'});
      out += `<ruby>${ch}<rt>${py}</rt></ruby>`;
    } else out += escapeHTML(ch);
  }
  return out;
}

function renderNewsDetail(){
  const detailEl = document.getElementById('newsDetail');
  const d = newsCache.detail;
  if(!d){ detailEl.innerHTML=''; return; }
  detailEl.innerHTML = `
    <h2 class="section-title">摘要 · Tóm tắt</h2>
    <div class="card"><div class="pinyin-passage">${pinyinRuby(d.summary)}</div></div>
    <h2 class="section-title">专业词汇 · Từ chuyên ngành</h2>
    <div class="card">
      ${d.vocab.length===0 ? '<div class="rmeta">Không trích được từ chuyên ngành nào.</div>' :
        d.vocab.map((v,i)=>`
          <div class="vocab-extract-item">
            <div class="term">${escapeHTML(v.term)} <span style="font-weight:600;color:var(--text-muted);font-size:12px;">${pinyinRuby(v.term)}</span></div>
            <div class="expl">${escapeHTML(v.explanation)}</div>
            <div class="writer-controls" style="justify-content:flex-start;margin-top:8px;gap:8px;">
              <button class="btn btn-soft btn-sm" data-add-chars="${i}">＋ Thêm chữ vào 生字库</button>
              <button class="btn btn-ghost btn-sm" data-vx-term="${i}">📖 Giải thích/ghép từ/đặt câu (từ điển)</button>
            </div>
            <div class="vocab-explain" id="newsVx-${i}" style="display:none;"></div>
          </div>
        `).join('')
      }
    </div>
  `;
  detailEl.querySelectorAll('[data-vx-term]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = btn.dataset.vxTerm;
      const box = document.getElementById('newsVx-'+i);
      const showing = box.style.display !== 'none';
      box.style.display = showing ? 'none' : 'block';
      if(!showing && !box.dataset.loaded){
        box.dataset.loaded = '1';
        mountVocabExplainForTerm(box, d.vocab[i].term);
      }
    });
  });
  detailEl.querySelectorAll('[data-add-chars]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const v = d.vocab[btn.dataset.addChars];
      let added = 0;
      for(const ch of v.term){
        if(!/[\u4e00-\u9fff]/.test(ch)) continue;
        if(DB.hanzi.some(h=>h.char===ch)) continue;
        DB.hanzi.push({
          id: uid(), char: ch, note: `Từ「${v.term}」: ${v.explanation}`,
          box: 0, dueDate: todayStr(), reviewCount: 0, createdAt: Date.now()
        });
        added++;
      }
      persist('hanzi');
      toast(added>0 ? `Đã thêm ${added} chữ mới vào kho!` : 'Các chữ này đã có trong kho rồi');
      renderHome();
    });
  });
}

/* ==================================================================
   跟读 GENDU — luyện đọc đúng những chữ đang có trong 生字库
   (Text-to-Speech + ghi âm tự so sánh, chạy offline hoàn toàn)
================================================================== */
let genduState = { list: [], recordings: {}, mediaRecorder: null, activeIdx: null, chunks: [] };

function renderGenduSetup(){
  const savedQty = localStorage.getItem('xnc_gendu_qty');
  const savedSpeed = localStorage.getItem('xnc_gendu_speed');
  const savedGroup = localStorage.getItem('xnc_gendu_group');
  if(savedQty) document.getElementById('genduQty').value = savedQty;
  if(savedSpeed) document.getElementById('genduSpeed').value = savedSpeed;
  if(savedGroup) document.getElementById('genduGroup').value = savedGroup;
  document.getElementById('genduSession').innerHTML = '';
  renderToudiaoLibrary();
}

// thanh mẫu (声母) / vận mẫu (韵母) của 1 chữ, dùng pinyin-pro
function getInitialFinal(char){
  if(typeof pinyinPro === 'undefined' || !pinyinPro.pinyin) return {initial:'', final:''};
  try{
    const initial = pinyinPro.pinyin(char, {pattern:'initial', toneType:'none'}) || '';
    const final = pinyinPro.pinyin(char, {pattern:'final', toneType:'none'}) || '';
    return {initial: initial.trim(), final: final.trim()};
  }catch(e){ return {initial:'', final:''}; }
}

// chọn session theo cùng thanh mẫu hoặc cùng vận mẫu với 1 chữ "gốc" ngẫu nhiên
// trong kho — trả về ít nhất chữ gốc, nhiều nhất qty chữ.
function buildGroupedGenduSession(chars, qty, mode){
  if(chars.length===0) return [];
  const anchor = chars[Math.floor(Math.random()*chars.length)];
  const anchorIF = getInitialFinal(anchor);
  const key = mode==='initial' ? anchorIF.initial : anchorIF.final;
  if(!key) return chars.slice(0, qty); // không lấy được pinyin thì rơi về danh sách thường
  const matched = chars.filter(ch => {
    const f = getInitialFinal(ch);
    return (mode==='initial' ? f.initial : f.final) === key;
  });
  // ưu tiên các chữ cùng nhóm; nếu chưa đủ qty thì lấp thêm chữ khác trong kho
  const rest = chars.filter(ch=>!matched.includes(ch));
  return [...matched, ...rest].slice(0, qty);
}

document.getElementById('btnGenduStart').addEventListener('click', ()=>{
  if(DB.hanzi.length===0){ toast('生字库 đang trống — thêm chữ trước đã'); return; }
  const qty = parseInt(document.getElementById('genduQty').value);
  const speed = document.getElementById('genduSpeed').value;
  const group = document.getElementById('genduGroup').value; // 'none' | 'initial' | 'final'
  localStorage.setItem('xnc_gendu_qty', qty);
  localStorage.setItem('xnc_gendu_speed', speed);
  localStorage.setItem('xnc_gendu_group', group);

  const chars = DB.hanzi.map(h=>h.char);
  let session;
  if(group==='initial' || group==='final'){
    session = buildGroupedGenduSession(chars, qty, group);
  } else {
    const cursor = parseInt(localStorage.getItem('xnc_gendu_cursor') || '0');
    session = [];
    for(let i=0;i<Math.min(qty, chars.length);i++){
      session.push(chars[(cursor+i) % chars.length]);
    }
    localStorage.setItem('xnc_gendu_cursor', (cursor + qty) % chars.length);
  }
  genduState = { list: session, recordings: {}, mediaRecorder: null, activeIdx: null, chunks: [] };
  renderGenduSession(qty, parseFloat(speed), group);
});

function renderGenduSession(qty, speed, group){
  const wrap = document.getElementById('genduSession');
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const groupLabel = group==='initial' ? ' · nhóm theo cùng thanh mẫu (声母)' : group==='final' ? ' · nhóm theo cùng vận mẫu (韵母)' : '';
  wrap.innerHTML = `
    <h2 class="section-title">Buổi hôm nay (${genduState.list.length} chữ)${groupLabel}</h2>
  ` + genduState.list.map((ch,i)=>{
    let py = '';
    if(typeof pinyinPro !== 'undefined' && pinyinPro.pinyin){
      try{ py = pinyinPro.pinyin(ch, {toneType:'symbol'}); }catch(e){}
    }
    return `
    <div class="card gendu-card-wrap">
      <div class="gendu-card" style="border:none;padding:0;margin:0;box-shadow:none;">
        <div style="flex:1;">
          <div class="gendu-char">${ch}</div>
          <div class="gendu-py">${py}</div>
        </div>
        <div class="gendu-controls">
          <button class="gendu-btn-play" data-play="${i}" title="Nghe mẫu">▶</button>
          ${canRecord ? `
          <button class="gendu-btn-rec" data-rec="${i}" title="Ghi âm">🎙</button>
          <button class="gendu-btn-replay" data-replay="${i}" disabled title="Nghe lại">⟳</button>
          ` : ''}
          <button class="gendu-btn-play" data-explain="${i}" title="Giải thích / ghép từ / đặt câu">📖</button>
        </div>
      </div>
      <div class="vocab-explain" id="genduVx-${i}" style="display:none;"></div>
    </div>`;
  }).join('') + `
    <button class="btn btn-primary btn-block" id="btnGenduDone" style="margin-top:8px;">✓ Hoàn thành buổi này</button>
    ${!canRecord ? '<div class="rmeta" style="text-align:center;margin-top:8px;">Trình duyệt này không hỗ trợ ghi âm — vẫn nghe mẫu được bình thường.</div>' : ''}
  `;

  wrap.querySelectorAll('[data-play]').forEach(btn=>{
    btn.addEventListener('click', ()=> speakChar(genduState.list[btn.dataset.play], speed));
  });
  wrap.querySelectorAll('[data-rec]').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleRecord(parseInt(btn.dataset.rec)));
  });
  wrap.querySelectorAll('[data-replay]').forEach(btn=>{
    btn.addEventListener('click', ()=> replayRecording(parseInt(btn.dataset.replay)));
  });
  wrap.querySelectorAll('[data-explain]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = btn.dataset.explain;
      const box = document.getElementById('genduVx-'+i);
      const showing = box.style.display !== 'none';
      box.style.display = showing ? 'none' : 'block';
      if(!showing && !box.dataset.loaded){
        box.dataset.loaded = '1';
        mountVocabExplain(box, genduState.list[i]);
      }
    });
  });
  document.getElementById('btnGenduDone').addEventListener('click', ()=>{
    checkinToday();
    toast('已完成 · Đã hoàn thành buổi luyện hôm nay!');
    renderHome();
  });
}

/* ==================================================================
   绕口令库 — thư viện luyện phát âm theo 3 cấp độ + tự thêm
================================================================== */
const TOUDIAO_LIBRARY = {
  easy: [
    { text: '四是四，十是十，十四是十四，四十是四十。', note: 'Phân biệt 4 (sì) và 10 (shí) — âm tr sát/uốn lưỡi cơ bản.' },
    { text: '妈妈骑马，马慢，妈妈骂马。', note: 'Luyện thanh mẫu m / âm mã, mắng.' },
    { text: '红鲤鱼绿鲤鱼与驴。', note: 'Câu ngắn, phân biệt l và r/lǘ.' },
  ],
  medium: [
    { text: '八百标兵奔北坡，炮兵并排北坡跑，炮兵怕把标兵碰，标兵怕碰炮兵炮。', note: 'Phân biệt b / p, âm bật hơi vs không bật hơi.' },
    { text: '黑化肥发灰，灰化肥发黑，黑化肥发灰会挥发，灰化肥挥发会发黑。', note: 'Luyện h / f xen kẽ liên tục, tốc độ vừa.' },
  ],
  hard: [
    { text: '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮。', note: 'Chi/chī vs tǔ, cực nhanh dễ vấp âm cong lưỡi.' },
    { text: '打南边来了个哑巴，腰里别着个喇叭；打北边来了个喇嘛，手里提了个獭犸；提着獭犸的喇嘛要拿獭犸换别着喇叭的哑巴的喇叭，别着喇叭的哑巴不愿拿喇叭换提着獭犸的喇嘛的獭犸。', note: 'Câu dài, nhiều âm gần giống nhau, thử thách phản xạ.' },
  ],
};
function getCustomToudiao(){ return loadJSON('xnc_toudiao_custom', []); }
function saveCustomToudiao(list){ saveJSON('xnc_toudiao_custom', list); }

let toudiaoTab = 'easy';
function renderToudiaoLibrary(){
  const wrap = document.getElementById('toudiaoLibrary');
  if(!wrap) return;
  wrap.innerHTML = `
    <h2 class="section-title">绕口令库</h2>
    <div class="section-sub">Luyện phản xạ phát âm theo 3 cấp độ, hoặc tự thêm câu riêng</div>
    <div class="toudiao-tabs">
      <button class="btn ${toudiaoTab==='easy'?'btn-primary':'btn-ghost'} btn-sm" data-ttab="easy">初级</button>
      <button class="btn ${toudiaoTab==='medium'?'btn-primary':'btn-ghost'} btn-sm" data-ttab="medium">中级</button>
      <button class="btn ${toudiaoTab==='hard'?'btn-primary':'btn-ghost'} btn-sm" data-ttab="hard">高级</button>
      <button class="btn ${toudiaoTab==='custom'?'btn-primary':'btn-ghost'} btn-sm" data-ttab="custom">自选</button>
    </div>
    <div id="toudiaoList"></div>
  `;
  wrap.querySelectorAll('[data-ttab]').forEach(b=>{
    b.addEventListener('click', ()=>{ toudiaoTab = b.dataset.ttab; renderToudiaoLibrary(); });
  });
  renderToudiaoList();
}
function renderToudiaoList(){
  const listEl = document.getElementById('toudiaoList');
  if(!listEl) return;
  if(toudiaoTab==='custom'){
    const custom = getCustomToudiao();
    listEl.innerHTML = `
      <div class="card" style="padding:12px;">
        <label class="field-label">Thêm câu 绕口令 của bạn</label>
        <textarea id="ttCustomInput" placeholder="Dán câu chữ Hán vào đây..."></textarea>
        <button class="btn btn-primary btn-sm btn-block" id="btnAddToudiao" style="margin-top:8px;">＋ Thêm vào 自选</button>
      </div>
    ` + (custom.length===0 ? `<div class="empty-state"><span class="em">📝</span><p>Chưa có câu tự thêm nào.</p></div>` :
      custom.map((t,i)=>toudiaoCardHTML(t, 'c'+i)).join(''));
    document.getElementById('btnAddToudiao').addEventListener('click', ()=>{
      const text = document.getElementById('ttCustomInput').value.trim();
      if(!text){ toast('Chưa nhập câu nào'); return; }
      const list = getCustomToudiao();
      list.push({ text, note: '' });
      saveCustomToudiao(list);
      renderToudiaoList();
      toast('Đã thêm vào 自选');
    });
    listEl.querySelectorAll('[data-tt-del]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const list = getCustomToudiao();
        list.splice(parseInt(b.dataset.ttDel), 1);
        saveCustomToudiao(list);
        renderToudiaoList();
      });
    });
  } else {
    const items = TOUDIAO_LIBRARY[toudiaoTab] || [];
    listEl.innerHTML = items.map((t,i)=>toudiaoCardHTML(t, toudiaoTab+i)).join('');
  }
  listEl.querySelectorAll('[data-tt-play]').forEach(b=>{
    b.addEventListener('click', ()=> speakChar(b.dataset.ttPlay, 0.75));
  });
}
function toudiaoCardHTML(t, key){
  const isCustom = key.startsWith('c');
  const idx = isCustom ? key.slice(1) : null;
  return `
    <div class="card" style="padding:14px 16px;">
      <div class="pinyin-passage">${pinyinRuby(t.text)}</div>
      ${t.note?`<div class="rmeta" style="margin-top:8px;">${escapeHTML(t.note)}</div>`:''}
      <div class="writer-controls" style="justify-content:flex-start;margin-top:10px;">
        <button class="btn btn-soft btn-sm" data-tt-play="${escapeHTML(t.text)}">▶ Nghe đọc</button>
        ${isCustom?`<button class="btn btn-ghost btn-sm" data-tt-del="${idx}">Xoá</button>`:''}
      </div>
    </div>`;
}

let zhVoice = null;
function pickZhVoice(){
  if(!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  return voices.find(v=>v.lang && v.lang.toLowerCase().startsWith('zh')) || null;
}
if('speechSynthesis' in window){
  speechSynthesis.onvoiceschanged = ()=>{ zhVoice = pickZhVoice(); };
  zhVoice = pickZhVoice();
}
function speakChar(text, rate){
  if(!('speechSynthesis' in window)){ toast('Trình duyệt không hỗ trợ đọc mẫu (TTS)'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if(zhVoice) u.voice = zhVoice;
  u.rate = rate || 0.85;
  speechSynthesis.speak(u);
}

async function toggleRecord(idx){
  const btn = document.querySelector(`[data-rec="${idx}"]`);
  if(genduState.activeIdx === idx){
    genduState.mediaRecorder.stop();
    return;
  }
  if(genduState.activeIdx !== null){
    toast('Đang ghi chữ khác, dừng lại trước đã');
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    genduState.mediaRecorder = mr;
    genduState.activeIdx = idx;
    genduState.chunks = [];
    mr.ondataavailable = e => genduState.chunks.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(genduState.chunks, { type: 'audio/webm' });
      genduState.recordings[idx] = URL.createObjectURL(blob);
      stream.getTracks().forEach(t=>t.stop());
      genduState.activeIdx = null;
      btn.classList.remove('recording');
      const replayBtn = document.querySelector(`[data-replay="${idx}"]`);
      if(replayBtn) replayBtn.disabled = false;
    };
    mr.start();
    btn.classList.add('recording');
    toast('Đang ghi âm — bấm 🎙 lần nữa để dừng');
  }catch(e){
    toast('Không truy cập được micro (kiểm tra quyền trình duyệt)');
  }
}
function replayRecording(idx){
  const url = genduState.recordings[idx];
  if(!url) return;
  new Audio(url).play();
}

/* ---------------- service worker ---------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js?v=5').catch(()=>{});
  });
}

/* ---------------- init ---------------- */
applyWorkerCfgFromURL();
renderHome();
// tải trước dữ liệu bộ thủ ở nền (không chặn UI) để 打卡 nhóm được ngay
// từ lần vào app đầu tiên nếu có mạng, và để phần giải thích mở nhanh hơn.
if(typeof loadXinhuaCharDict === 'function'){
  loadXinhuaCharDict().then(()=>{ if(document.getElementById('view-home').classList.contains('active')) renderHome(); }).catch(()=>{});
}
