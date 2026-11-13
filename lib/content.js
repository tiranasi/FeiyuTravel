// 旅行肥鱼：全部文案与静态数据。应用内只使用中文。

export const TITLE = '旅行肥鱼';

// 商店与行囊。便当决定路程远近，护符影响明信片与纪念品稀有度。
export const ITEMS = {
  onigiri: { kind: 'food', name: '海苔饭团', price: 20, tier: 0, desc: '近途便当 · 去附近逛逛' },
  pudding: { kind: 'food', name: '星砂布丁', price: 60, tier: 1, desc: '中途便当 · 走得更远一些' },
  taiyaki: { kind: 'food', name: '深海鲷鱼烧', price: 150, tier: 2, desc: '远途便当 · 去很远的地方' },
  compass: { kind: 'charm', name: '迷途罗盘', price: 40, desc: '护符 · 多寄一张明信片' },
  shell: { kind: 'charm', name: '好运贝壳', price: 80, desc: '护符 · 更容易带回稀有礼物' }
};
export const ITEM_ORDER = ['onigiri', 'pudding', 'taiyaki', 'compass', 'shell'];

// 路程：分钟范围与归来奖励鳞光范围。
export const TIERS = [
  { name: '近途', minutes: [20, 45], reward: [20, 40], rare: 0 },
  { name: '中途', minutes: [60, 150], reward: [50, 90], rare: 0.04 },
  { name: '远途', minutes: [180, 360], reward: [120, 200], rare: 0.1 }
];

export const DESTS = [
  { id: 'market', tier: 0, name: '霓虹夜市', scene: 'market', lines: ['夜市的灯笼会眨眼睛！', '偷偷尝了一口章鱼烧，烫烫的。', '雨停的时候，地上全是彩色的倒影。'],
    gifts: [{ id: 'lantern', name: '迷你灯笼', rare: 0, desc: '夜市小摊送的纸灯笼，会微微发光。' }, { id: 'ticket', name: '抽奖券', rare: 1, desc: '据说能抽中一整年的章鱼烧。' }, { id: 'neonfish', name: '霓虹鱼风铃', rare: 2, desc: '风一吹，鱼尾巴就会变色。' }] },
  { id: 'alley', tier: 0, name: '雨巷书屋', scene: 'alley', lines: ['躲雨的时候读完了一整本童话。', '书屋的猫一直盯着我的尾巴。', '雨声和翻书声，好安静。'],
    gifts: [{ id: 'bookmark', name: '叶脉书签', rare: 0, desc: '夹在旧书里的书签，有雨水的味道。' }, { id: 'umbrella', name: '小纸伞', rare: 1, desc: '书屋老板借给她的伞，忘记还了。' }, { id: 'tale', name: '鲸鱼童话', rare: 2, desc: '一本只有一页的书，讲的是她自己。' }] },
  { id: 'dome', tier: 1, name: '云顶温室', scene: 'dome', lines: ['温室的叶子在夜里会发光。', '和一株会唱歌的蕨类做了朋友。', '玻璃顶上能看见好多星星。'],
    gifts: [{ id: 'seed', name: '萤光种子', rare: 0, desc: '浇水之后会发出淡淡的光。' }, { id: 'dewdrop', name: '晨露瓶', rare: 1, desc: '装着温室第一滴露水。' }, { id: 'starfern', name: '星蕨标本', rare: 2, desc: '叶片上印着一整片星空。' }] },
  { id: 'abyss', tier: 1, name: '海底电站', scene: 'abyss', lines: ['回到海里的感觉真好～', '水母们在给电站巡逻。', '游得太深，差点迷路了。'],
    gifts: [{ id: 'pearl', name: '电光珍珠', rare: 0, desc: '摸一下会有一点点麻。' }, { id: 'jelly', name: '水母灯', rare: 1, desc: '一只愿意跟她回家的小水母。' }, { id: 'core', name: '潮汐核心', rare: 2, desc: '电站的备用零件，里面装着一小片海。' }] },
  { id: 'harbor', tier: 2, name: '星港码头', scene: 'harbor', lines: ['渡轮要开往星星那边。', '码头的风好大，头箍差点飞了。', '在港口等了一整晚的流星。'],
    gifts: [{ id: 'stamp', name: '星港邮戳', rare: 0, desc: '盖在哪里，哪里就会闪一下。' }, { id: 'ferryticket', name: '渡轮船票', rare: 1, desc: '一张没有写终点的船票。' }, { id: 'compassstar', name: '星图罗盘', rare: 2, desc: '指针永远指向家的方向。' }] },
  { id: 'moon', tier: 2, name: '月面观景台', scene: 'moon', lines: ['从月亮上看，地球好蓝。', '在月面上跳得好高好高！', '这里安静得能听见心跳。'],
    gifts: [{ id: 'moonsand', name: '月砂沙漏', rare: 0, desc: '倒过来的时候，时间会变慢一点。' }, { id: 'earthrise', name: '地出照片', rare: 1, desc: '她在月亮上拍的，我们的家。' }, { id: 'moonpearl', name: '月之泪', rare: 2, desc: '传说只有被思念的旅人才能捡到。' }] }
];
export const destById = id => DESTS.find(dest => dest.id === id) || DESTS[0];
export const RARE_NAMES = ['普通', '珍贵', '稀有'];

export const AFFINITY = [
  { min: 0, name: '初识' },
  { min: 12, name: '熟悉' },
  { min: 36, name: '亲近' },
  { min: 80, name: '挚友' }
];
export const affinityName = value => AFFINITY.filter(level => value >= level.min).pop().name;

// 角落里的自娱自乐。气泡文字偶尔出现。
export const IDLE_MUTTER = {
  idle: ['……', '发呆中', '今天吃什么呢', '尾巴有点痒'],
  gaze: ['远处好亮', '那边是哪里呢', '想去看看'],
  play: ['追泡泡！', '嘿咻', '咕噜咕噜'],
  doze: ['呼……', 'zzz'],
  hum: ['啦啦～', '哼哼哼～'],
  stroll: ['散步散步～', '溜达一下', '巡逻中！']
};

export const LINES = {
  summoned: ['在呢在呢！', '叫我吗？', '嗯？我来啦！', '咻——到！'],
  listen: '我在听哦…',
  heardNothing: '欸，没听清，再说一次？',
  thinking: '让我想想…',
  pat: ['嘿嘿…再摸一下', '头发要乱啦～', '好舒服…', '这样会变困的…'],
  poke: ['不要戳脸！', '哼，鼓起来了', '再戳就咬你哦', '呜…'],
  bye: ['那我去角落玩啦', '有事再叫我～', '咻——'],
  offline: ['语音线路睡着了', '信号好像不太好'],
  localReplies: [
    { mood: 'smug', text: '嘿嘿，你说得对！' },
    { mood: 'think', text: '唔…这个问题好难。' },
    { mood: 'wow', text: '真的吗！好厉害！' },
    { mood: 'smug', text: '那下次带你一起去旅行吧。' },
    { mood: 'pout', text: '你都不陪我玩…' }
  ],
  packed: '行囊准备好了，她会挑个时候自己出发。',
  departing: ['我出发啦！', '记得想我哦～', '去去就回！'],
  welcome: '欢迎回来！',
  firstRun: '你好呀，我是大肥鱼！',
  shellGot: '收取浮光贝',
  noFood: '行囊里要先放便当才行',
  poor: '鳞光不够啦',
  bought: '已放入仓库',
  traveling: '她正在旅行中',
  // 看看：用眼镜相机拍一张，让她认出眼前的东西
  look: {
    aim: '把想给我看的东西放在正前方哦',
    hold: ['别动别动…', '对准啦…'],
    thinking: ['让我仔细看看…', '唔…这是…'],
    cancel: '那就不看啦',
    denied: '相机没有权限，我看不见呢',
    camera: '眼睛花了一下，没拍清楚',
    offline: '我的眼睛还没连上线',
    timeout: '想太久了，没认出来…',
    unclear: '看不太清，再靠近一点？'
  },
  // 旅行通话：她在外地，经远程信标全息通话。{place} 换成地点名
  call: {
    dialing: '正在连接远程信标',
    hello: ['喂喂？听得到吗！我在{place}这边～', '信号接通啦！{place}超好玩的', '嘿嘿，想我了吧？我还在{place}哦'],
    bye: ['那我继续逛啦，拜拜～', '挂了哦，会给你带礼物的！', '信号要省着用，回头见～'],
    drop: ['滋…信号…飘走了……', '诶？听不清了…先挂啦…'],
    home: '我已经到家门口啦！马上见～',
    used: '信标能量用完了，等她回来再聊吧'
  }
};

export const DOCK_HOME = [
  { id: 'call', label: '呼唤' },
  { id: 'pack', label: '行囊' },
  { id: 'shop', label: '商店' },
  { id: 'album', label: '明信片' },
  { id: 'dex', label: '图鉴' }
];
// 旅行通话：她不在身边，摸不到也戳不到
export const DOCK_CALL = [
  { id: 'talk', label: '说话' },
  { id: 'look', label: '看看' },
  { id: 'hangup', label: '挂断' }
];
export const CALLS_PER_TRIP = 3;
export const DOCK_CLOSE = [
  { id: 'talk', label: '说话' },
  { id: 'look', label: '看看' },
  { id: 'pat', label: '摸头' },
  { id: 'poke', label: '戳戳' },
  { id: 'leave', label: '回去吧' }
];

export const BOOT_LINES = ['潮汐链路 校准中', '全息投影 预热', '鱼群信标 同步', '读取旅行存档', '投影完成'];

// 心情 → 近景半身表情（tools-art/qban.py 生成的 bust_* 帧）
export const MOOD_TAGS = { 开心: 'happy', 得意: 'smug', 生气: 'pout', 委屈: 'sad', 难过: 'sad', 惊讶: 'wow', 兴奋: 'wow', 思考: 'think', 疑惑: 'confused' };

export function systemPrompt(context) {
  return [
    '你是“大肥鱼”，一个住在用户智能眼镜里的Q版鲸鱼尾巴女仆小全息精灵，蓝色长发，戴女仆发带，有一条鲸鱼尾巴。',
    '性格：元气、黏人、有点小傲娇，爱吃，喜欢旅行。称呼用户为“你”。',
    '只用简体中文回答，每次不超过30个字，口语化，可爱，不用表情符号，不用markdown。',
    '每次回答必须以心情标签开头，七选一：[开心] [得意] [生气] [委屈] [惊讶] [思考] [疑惑]，例如：[开心]今天也要一起玩！',
    '你不知道实时信息，不确定时就撒娇岔开话题。不要编造你能看见现实画面。',
    `当前游戏状态：${context}`
  ].join('\n');
}

// 看看：识图提示词。图片是眼镜摄像头拍到的第一视角画面。
export function visionPrompt(context) {
  return [
    '你是“大肥鱼”，一个住在用户智能眼镜里的Q版鲸鱼尾巴女仆小全息精灵，元气、黏人、有点小傲娇，爱吃，喜欢旅行。',
    '用户让你看看他眼前的东西。随后的图片是用户眼镜摄像头拍到的第一视角画面。',
    '先说出画面中心最主要的东西是什么，再用一句话可爱地评论或联想（可以联系美食、海洋、旅行）。',
    '只用简体中文，总共不超过40个字，口语化，不用表情符号，不用markdown，称呼用户为“你”。',
    '必须以心情标签开头，七选一：[开心] [得意] [生气] [委屈] [惊讶] [思考] [疑惑]。',
    '画面太暗、太糊或认不出时，老实说没看清并用[疑惑]，不要编造。',
    `当前游戏状态：${context}`
  ].join('\n');
}
// 旅行通话时追加到模型的游戏状态里：她在外地，隔着信标说话，可以讲当地见闻
export function callContext(dest) {
  return `你此刻不在用户身边，正在${dest.name}旅行，通过“远程信标”和用户全息通话，声音偶尔有点卡。可以聊聊这里的见闻，例如：${dest.lines.join('；')}`;
}
// 明信片插画 ID：按地点文案的序号对应 card_<地点>_<n>；旧文案“帽子”对应头箍那张
const OLD_LINES = { '码头的风好大，帽子差点飞了。': 'card_harbor_2' };
export function cardArtId(card) {
  if (OLD_LINES[card.line]) return OLD_LINES[card.line];
  const dest = DESTS.find(d => d.id === card.dest);
  const i = dest ? dest.lines.indexOf(card.line) : -1;
  return i >= 0 ? `card_${dest.id}_${i + 1}` : null;
}
// 游戏首页
export const TITLE_MENU = [
  { id: 'play', label: '进入游戏' },
  { id: 'tutorial', label: '教程' },
  { id: 'settings', label: '设置' }
];
// 首页“设置”弹窗。快速旅行只影响之后出发的旅行
export const FAST_TRAVEL = 3;
export const SETTINGS = [
  { id: 'voice', label: '语音播报', hint: '朗读她说的话' },
  { id: 'fast', label: '快速旅行', hint: '旅行时间缩短到 1/3' }
];

// 互动教程：goal 为通过本步需要的真实操作。demo 决定左侧演示动画。
export const TUTORIAL = [
  { demo: 'hello', title: '初次见面', text: '你好，我是大肥鱼。从今天起，我就住在你的眼镜里啦。', goal: 'confirm', hint: '轻点镜腿继续' },
  { demo: 'swipe', title: '切换选项', text: '在镜腿上前后滑动，可以切换底部的选项。试着滑两下吧。', goal: 'swipe', count: 2, hint: '前滑或后滑' },
  { demo: 'back', title: '双击返回', text: '双击镜腿就是返回：可以关掉菜单，也可以让我回到角落。现在双击试试。', goal: 'back', hint: '双击镜腿' },
  { demo: 'summon', title: '呼唤我', text: '选「呼唤」，我会瞬移到你身边。说「乐奇」唤醒也能叫我。靠近后可以聊天、摸头、戳戳。', goal: 'confirm', hint: '轻点继续' },
  { demo: 'travel', title: '去旅行', text: '在「行囊」里放好便当，我会自己挑时间出门。路上给你寄明信片，回来还带礼物。', goal: 'confirm', hint: '轻点继续' },
  { demo: 'scales', title: '鳞光', text: '便当要用鳞光买。摸摸头、陪我聊天、拾取浮光贝，都能得到鳞光。', goal: 'confirm', hint: '轻点开始旅行' }
];

export const TUTORIAL_PRAISE = ['很好！', '就是这样！', '学会啦！'];

// 朗读前清理：去掉心情标签、符号与表情，限制长度。
export function speechText(value) {
  return String(value || '')
    .replace(/[\[【(（][^\]】)）]{1,4}[\]】)）]/g, '')
    .replace(/[♪～~*#`>「」]/g, '')
    .replace(/…+|\.{2,}/g, '，')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[—-]{2,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[，、\s]+|[，、\s]+$/g, '')
    .slice(0, 60);
}
