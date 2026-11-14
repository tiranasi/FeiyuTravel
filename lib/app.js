// 旅行肥鱼控制器：状态机、输入、角落行为、召唤与对话。宿主能力全部经 host 注入，
// 同一份代码由 AIUI 页面和本机预览共用。
import { LINES, cardArtId, DOCK_HOME, DOCK_CLOSE, DOCK_CALL, CALLS_PER_TRIP, callContext, ITEMS, ITEM_ORDER, SHOP_ORDER, IDLE_MUTTER, MOOD_TAGS, TUTORIAL, TUTORIAL_PRAISE, systemPrompt, visionPrompt, chatNote, destById, affinityName, affinityMutter, touchLines, AFFINITY, DEX_ROWS, bondGift, speechText, SETTINGS } from './content.js';
import { titleMenu } from './title.js';
import * as Game from './game.js';
import { render, BOOT_MIN_MS, BOOT_LEAVE_MS, CORNERS, CELL_OF, cornerAt, SHAKE_MS, TP, DIAL_MS } from './scenes.js';
import { createShakeDetector } from './motion.js';

// 角落里的随机待机。0.8.0 起 6 → 17 个（含晃一晃后的 dizzy/pout，它们不进随机池）
const ACT_WEIGHT = {
  idle: 3, gaze: 2, play: 2, doze: 1, hum: 2, stroll: 1,
  wave: 1, snack: 1, proud: 0.8, oops: 0.6,
  stretch: 1, bubble: 1.2, fish: 1, read: 1, comb: 1, sneeze: 0.7, postcard: 0.8
};
const ACTS = Object.keys(ACT_WEIGHT);
// 动作本身较短的，到点就结束（其余 6–14 秒）
const ACT_MS = { wave: 4000, proud: 5000, oops: 5200, sneeze: 6000, stretch: 5000, dizzy: 3000, pout: 2600 };
const RECENT_ACTS = 2;
// 晃一晃
const SHAKE_DIZZY = { count: 3, within: 6000 };
const SHAKE_QUEUE_MS = 1500;
const LEAN = { px: 1.6, x: 8, y: 6, tau: 70 };   // 每度偏几像素、横竖上限（像素）、画面跟随时间常数（毫秒）   // 飞行途中记下的甩头，这么久之内落地才接着飞
const IMU_STATS_MS = 10000;
const SAVE_EVERY_MS = 15000;
const CHAT_TIMEOUT_MS = 15000;
const MAX_HISTORY = 8;        // 当次最近几轮对话
const VISION_RECENT = 3;      // 看看时带上最近几轮，帮她猜用户想看什么
const TUTORIAL_OK_MS = 900;
const SPEECH_CHAR_MS = 230;
const VISION_TIMEOUT_MS = 30000;   // 义眼盯真真机：带图提问 2.5–3.6 秒返回
export const LOOK_QUESTION = '看看我眼前这是什么？';
const CALL_MAX_MS = 150000;        // 一次通话最长 2.5 分钟（真实时间），之后信号飘走

function weighted(rng, avoid, allow = () => true) {
  const recent = Array.isArray(avoid) ? avoid : [avoid];
  const pool = ACTS.filter(act => !recent.includes(act) && allow(act));
  const total = pool.reduce((n, act) => n + ACT_WEIGHT[act], 0);
  let r = rng() * total;
  for (const act of pool) { r -= ACT_WEIGHT[act]; if (r <= 0) return act; }
  return pool[0];
}

export function parseReply(raw) {
  let textValue = String(raw || '').replace(/[*#`>]/g, '').trim();
  let mood = null;
  // 回忆标签（0.8.9）：[记住：…] / [忘记：…]，先取出再处理心情标签
  const memo = { remember: [], forget: [] };
  textValue = textValue.replace(/[\[【]\s*(记住|忘记|忘掉)\s*[:：]?\s*([^\]】]{0,30})[\]】]/g, (_, kind, body) => {
    (kind === '记住' ? memo.remember : memo.forget).push(body.trim());
    return '';
  }).trim();
  const tag = textValue.match(/^[\[【(（]\s*([^\]】)）]{1,4})\s*[\]】)）]/);
  if (tag) {
    mood = MOOD_TAGS[tag[1].trim()] || null;
    textValue = textValue.slice(tag[0].length).trim();
  }
  textValue = textValue.replace(/[\[【][^\]】]{1,4}[\]】]/g, '').replace(/\s+/g, ' ').trim();
  if (textValue.length > 72) textValue = `${textValue.slice(0, 70)}…`;
  const out = { mood: mood || 'smug', text: textValue };
  if (memo.remember.length || memo.forget.length) out.memo = memo;
  return out;
}

export function createApp(host) {
  const log = host.log || (() => {});
  const scale = host.timeScale || 1;
  let rng = Game.makeRng((host.seed || Date.now()) >>> 0);
  const v = {
    now: host.now(),
    screen: 'title',
    timeScale: host.timeScale || 1,
    title: { focus: 0, at: host.now(), leaveAt: 0, panel: null },
    tut: { step: 0, at: 0, okAt: 0, swipes: 0, focus: 0, praise: '' },
    speechUntil: 0,
    summonPending: false,
    bootAt: host.now(),
    bootLeaveAt: 0,
    bootReady: false,
    decodeProgress: 0,
    cache: host.decoder.cache,
    g: null,
    pet: { corner: 3, act: 'idle', actAt: 0, actUntil: 0, present: true, tp: null, mutter: null, actsHere: 0, recent: [], shakes: [], dizzyNext: false },
    imu: { samples: 0, shakes: 0, statsAt: 0, queued: null, lean: { x: 0, y: 0 } },
    close: { mood: 'wow', moodAt: 0, bubble: null, phase: 'idle', transcript: '', fx: null, enterAt: 0, leaveAt: 0, look: null, call: null },
    dock: DOCK_HOME,
    dockFocus: 0,
    menu: { kind: 'pack', focus: 0 },
    toast: null,
    giftView: null,
    giftAt: 0
  };
  let savedAt = 0;
  let dirty = false;
  let chatToken = 0;
  let chatSession = null;
  // 当次对话的上下文（都不存档）：history = 最近几轮 {q, a}；sentContext = 聊天会话最后一次知道的游戏状态；
  // seen = 看看的结果，下次说话时作为系统备注告诉聊天会话（看看用的是独立的识图会话）。
  let history = [];
  let sentContext = '';
  let seen = [];
  let listenHandle = null;
  let pendingAfterBoot = [];
  let wakeAfterBoot = false;

  // ---------------------------------------------------------- 语音播报
  // 只朗读回应类台词；主页自言自语不出声。开始聆听前一定先停播，避免录进自己的声音。
  function speak(value) {
    if (!host.speech || !v.g || !v.g.settings.voice) return;
    const line = speechText(value);
    if (!line) return;
    try {
      host.speech.speak(line);
      v.speechUntil = v.now + 600 + line.length * SPEECH_CHAR_MS;
    } catch (error) {
      log('speak failed', String(error && error.message || error));
    }
  }
  function stopSpeech() {
    v.speechUntil = 0;
    if (!host.speech) return;
    try { host.speech.stop(); } catch (error) { log('speech stop ignored', String(error)); }
  }

  const now = () => v.now;
  const toast = text => { v.toast = { text, at: v.now }; };
  const markDirty = () => { dirty = true; };
  function persist(force) {
    if (!v.g) return;
    if (!force && !dirty) return;
    Game.save(host.storage, v.g, v.now, log);
    savedAt = v.now;
    dirty = false;
  }

  function loadGame() {
    v.g = Game.load(host.storage, v.now, log);
    const fresh = v.g.createdAt === v.now;
    // 调试 recall=1：正在进行的旅行立即结束（快速旅行只影响之后出发的旅程）
    if (host.recall && v.g.trip) { log('debug recall', v.g.trip.dest, Math.round((v.g.trip.returnAt - v.now) / 60000), 'min early'); v.g.trip.returnAt = v.now; }
    const events = Game.settle(v.g, v.now, rng, { timeScale: scale });
    if (fresh) pendingAfterBoot.push({ type: 'first' });
    for (const e of events) pendingAfterBoot.push(e);
    v.pet.present = !v.g.trip;
    v.pet.corner = Math.floor(rng() * 4);
    v.title.focus = v.g.tutorialDone ? 0 : 1;
    markDirty();
    persist(true);
    log('save loaded', JSON.stringify({ scales: v.g.scales, trip: v.g.trip && v.g.trip.dest, events: events.map(e => e.type) }));
  }

  // ---------------------------------------------------------- 主页行为
  function newAct(force) {
    const pet = v.pet;
    const allow = act => act !== 'postcard' || !!(v.g && v.g.postcards && v.g.postcards.length);
    pet.act = force || weighted(rng, pet.recent.concat(pet.act), allow);
    pet.recent = pet.recent.concat(pet.act).slice(-RECENT_ACTS);
    pet.actAt = v.now;
    pet.actUntil = v.now + (ACT_MS[pet.act] || (6000 + rng() * 8000));
    pet.actsHere += 1;
    if (rng() < 0.45) {
      // 熟起来以后，发呆和招手时偶尔说点只对你说的话
      const close = (pet.act === 'idle' || pet.act === 'wave') && v.g ? affinityMutter(v.g.affinity) : [];
      const list = close.length && rng() < 0.4 ? close : IDLE_MUTTER[pet.act];
      pet.mutter = { text: Game.pick(rng, list), at: v.now + 800 + rng() * 2500 };
    }
  }

  function moveCorner() {
    const pet = v.pet;
    let to = Math.floor(rng() * 4);
    if (to === pet.corner) to = (to + 1 + Math.floor(rng() * 3)) % 4;
    pet.tp = { kind: 'move', from: pet.corner, to, at: v.now };
    pet.actsHere = 0;
  }

  // 0.8.10：她跟着头轻轻偏（头往左她往左，和接下来被甩的方向一致），头停下就弹回；只是画面反馈，不触发移动
  function tickLean() {
    const im = v.imu;
    const dt = Math.min(100, Math.max(0, v.now - (im.leanAt || v.now)));
    im.leanAt = v.now;
    const live = motionWanted() && !v.pet.tp && v.pet.act !== 'dizzy';
    const tx = live ? Math.max(-LEAN.x, Math.min(LEAN.x, -im.lean.x * LEAN.px)) : 0;
    const ty = live ? Math.max(-LEAN.y, Math.min(LEAN.y, -im.lean.y * LEAN.px)) : 0;
    const k = 1 - Math.exp(-dt / LEAN.tau);
    const d = im.leanDraw || { x: 0, y: 0 };
    im.leanDraw = { x: d.x + (tx - d.x) * k, y: d.y + (ty - d.y) * k };
  }

  function tickHome() {
    const pet = v.pet;
    tickLean();
    if (pet.tp) {
      const age = v.now - pet.tp.at;
      const kind = pet.tp.kind;
      const end = kind === 'move' ? TP.out + TP.beam + TP.in : kind === 'return' ? TP.beam + TP.in : kind === 'depart' ? 1500 + TP.out + 520 : 500 + TP.in;
      const endAt = kind === 'shake' ? (pet.tp.bump ? SHAKE_MS.bump : SHAKE_MS.fly + SHAKE_MS.land) : end;
      if (age >= endAt) {
        if (kind === 'move' || kind === 'return' || kind === 'shake') pet.corner = pet.tp.to;
        if (kind === 'shake') {
          pet.tp = null;
          const queued = v.imu.queued;
          v.imu.queued = null;
          if (pet.dizzyNext) { pet.dizzyNext = false; newAct('dizzy'); pet.mutter = { text: Game.pick(rng, IDLE_MUTTER.dizzy), at: v.now + 300 }; }
          else newAct('idle');
          // 0.8.10：飞行途中又甩了一下，落地马上接着飞，不用等动画播完再甩
          if (queued && v.now - queued.at <= SHAKE_QUEUE_MS) { log('shake queued', queued.event.dir); applyShake(queued.event); }
          return;
        }
        if (kind === 'depart') pet.present = false;
        const finished = kind;
        pet.tp = null;
        newAct();
        if (finished === 'arrive' && v.g.pending) openGift();
        else if (finished === 'arrive' && Game.bondDue(v.g)) openBond();
      }
      return;
    }
    if (!pet.present) { if (v.summonPending) { v.summonPending = false; toast('她在旅行，信号太远啦'); } return; }
    if (v.g.pending) { openGift(); return; }
    if (Game.bondDue(v.g)) { openBond(); return; }
    if (v.summonPending) { v.summonPending = false; summon(true); return; }
    if (pet.mutter && pet.mutter.at > v.now + 4000) pet.mutter = null;
    if (v.now >= pet.actUntil) {
      if (pet.act === 'dizzy') { newAct('pout'); pet.mutter = { text: Game.pick(rng, IDLE_MUTTER.pout), at: v.now + 200 }; }
      // 被甩到中间的停靠点后，下一次换位一定回到角落
      else if ((pet.corner > 3 || pet.actsHere >= 2) && rng() < (pet.corner > 3 ? 0.8 : 0.6)) moveCorner();
      else newAct();
    }
  }

  // ---------------------------------------------------------- 晃一晃（IMU）
  // 每次候选结束都记一行（偏得太少的抖动不记），真机按它调阈值
  const shaker = createShakeDetector({
    ...(host.shakeConfig || {}),
    trace: e => { if (Math.max(Math.abs(e.ex), Math.abs(e.ep)) >= 2) log('shake try', JSON.stringify(e)); }
  });

  function motionWanted() {
    return !!(v.g && v.g.settings.motion !== false && v.screen === 'home' && v.pet.present);
  }

  function shakeRefused() {
    const pet = v.pet;
    if (!motionWanted()) return 'screen';
    if (pet.tp) return 'busy';
    if (v.g.pending || Game.bondDue(v.g)) return 'gift';
    if (pet.act === 'dizzy' || pet.act === 'pout') return 'dizzy';
    return '';
  }

  // 方向 → 相邻停靠点；走出网格就撞墙（to === from）
  function applyShake(event) {
    const pet = v.pet;
    const why = shakeRefused();
    if (why) {
      // 飞行途中的甩头先记着（只记最后一次），落地后接着执行
      if (why === 'busy' && pet.tp.kind === 'shake') { v.imu.queued = { event, at: v.now }; log('shake held', event.dir); return; }
      log('shake ignored', event.dir, why);
      return;
    }
    const [col, row] = CELL_OF[pet.corner];
    const nc = col + (event.dir === 'left' ? -1 : event.dir === 'right' ? 1 : 0);
    const nr = row + (event.dir === 'up' ? -1 : event.dir === 'down' ? 1 : 0);
    const to = nc >= 0 && nc <= 2 && nr >= 0 && nr <= 1 ? cornerAt(nc, nr) : pet.corner;
    const bump = to === pet.corner;
    pet.shakes = pet.shakes.filter(at => v.now - at < SHAKE_DIZZY.within).concat(v.now);
    pet.dizzyNext = pet.shakes.length >= SHAKE_DIZZY.count;
    if (pet.dizzyNext) pet.shakes = [];
    pet.tp = { kind: 'shake', from: pet.corner, to, dir: event.dir, bump, at: v.now };
    pet.actsHere = 0;
    pet.mutter = rng() < 0.5 ? { text: Game.pick(rng, bump ? IDLE_MUTTER.bump : IDLE_MUTTER.shake), at: v.now } : null;
    v.imu.shakes += 1;
    log('shake', JSON.stringify({ dir: event.dir, amp: event.amp, ms: event.ms, from: pet.tp.from, to, bump, dizzy: pet.dizzyNext }));
  }

  function motionSample(time, quaternion) {
    if (!motionWanted()) { shaker.reset(); v.imu.lean = { x: 0, y: 0 }; v.imu.queued = null; return; }
    v.imu.samples += 1;
    const event = shaker.feed(time, quaternion);
    v.imu.lean = shaker.lean();
    if (time - v.imu.statsAt >= IMU_STATS_MS) {
      if (v.imu.statsAt) log('imu stats', JSON.stringify(shaker.takeStats(time)));
      else shaker.takeStats(time);
      v.imu.statsAt = time;
    }
    if (!event) return;
    applyShake(event);
  }

  // ---------------------------------------------------------- 时间结算
  function tickGame() {
    if (!v.g) return;
    const holding = v.screen !== 'home' || !!v.pet.tp;
    const events = Game.settle(v.g, v.now, rng, { timeScale: scale, hold: holding });
    for (const e of events) handleEvent(e);
    if (events.length) markDirty();
    if (v.now - savedAt > SAVE_EVERY_MS) persist(false);
  }

  function handleEvent(e) {
    if (e.type === 'depart') {
      if (v.screen === 'home' && v.pet.present) {
        v.pet.act = 'wave';
        v.pet.actAt = v.now;
        v.pet.mutter = { text: Game.pick(rng, LINES.departing), at: v.now };
        v.pet.tp = { kind: 'depart', at: v.now };
      } else v.pet.present = false;
      log('depart', e.dest);
    } else if (e.type === 'postcard') {
      toast(`收到一张来自${destById(e.dest).name}的明信片`);
    } else if (e.type === 'return') {
      log('return', e.dest);
      const c = v.close;
      if (v.screen === 'close' && c.call && !c.leaveAt) {
        // 通话中她到家了：说一句，然后挂断并在主页现身
        c.call.returned = true;
        stopListening(true);
        chatToken += 1;
        endLook();
        say(LINES.call.home, 'happy');
        setTimeoutSafe(() => hangUp('home'), 2600);
        v.pet.present = true;
      } else if (v.screen === 'home') {
        v.pet.present = true;
        v.pet.tp = { kind: 'arrive', at: v.now };
      } else v.pet.present = true;
    } else if (e.type === 'shell') {
      // 静默生长
    } else if (e.type === 'first') {
      v.pet.mutter = { text: LINES.firstRun, at: v.now + 600 };
    }
  }

  function openGift() {
    if (!v.g.pending) return;
    v.giftView = { ...v.g.pending };
    v.giftAt = v.now;
    v.screen = 'gift';
    const dest = destById(v.giftView.dest);
    const gift = dest.gifts.find(item => item.id === v.giftView.gift);
    if (gift) speak(`我回来啦！从${dest.name}给你带了${gift.name}。`);
  }

  // 亲密度升级仪式：借用礼物画面，她送上这一级的信物
  function openBond() {
    const level = Game.bondDue(v.g);
    const gift = bondGift(level);
    if (!gift) return;
    v.giftView = { gift: gift.id, bond: level };
    v.giftAt = v.now;
    v.screen = 'gift';
    log('bond', JSON.stringify({ level, affinity: v.g.affinity, gift: gift.id }));
    speak(AFFINITY[level].up);
  }

  // ---------------------------------------------------------- 召唤与对话
  function homeDock() {
    const dock = DOCK_HOME.slice();
    if (v.g && v.g.shells.count > 0) dock.splice(1, 0, { id: 'shells', label: `拾贝×${v.g.shells.count}` });
    if (v.g && v.g.trip && !v.pet.present) dock[0] = { id: 'call', label: '通话' };
    return dock;
  }

  function setDock(list, keepId) {
    const id = keepId || (v.dock[v.dockFocus] && v.dock[v.dockFocus].id);
    v.dock = list;
    const index = list.findIndex(item => item.id === id);
    v.dockFocus = index >= 0 ? index : 0;
  }

  function summon(listenAfter) {
    if (v.screen !== 'home') return;
    if (v.g.trip && !v.pet.present && !v.pet.tp) { startCall(listenAfter); return; }
    if (!v.pet.present || v.g.trip) {
      toast(v.g.trip ? '她在旅行，信号太远啦' : LINES.traveling);
      return;
    }
    if (v.pet.tp) return;
    const c = v.close;
    c.enterAt = v.now + TP.out + 220;
    c.leaveAt = 0;
    c.mood = 'wow';
    c.moodAt = c.enterAt;
    c.bubble = { text: Game.pick(rng, LINES.summoned), at: c.enterAt + 300 };
    // 语音唤醒后马上要聆听，此时不朗读招呼语
    if (!listenAfter) { const greet = c.bubble.text; setTimeoutSafe(() => { if (v.screen === 'close' && c.phase === 'idle' && !c.leaveAt) speak(greet); }, TP.out + 300); }
    c.phase = 'idle';
    c.look = null;
    c.fx = null;
    v.screen = 'close';
    v.dock = DOCK_CLOSE;
    v.dockFocus = 0;
    log('summon', listenAfter ? 'voice' : 'tap');
    if (listenAfter) setTimeoutSafe(() => { if (v.screen === 'close' && !v.close.leaveAt) startListening(); }, TP.out + 700);
  }

  // ---------------------------------------------------------- 旅行通话
  // 她在外地时，“呼唤”变成“通话”：拨号后以全息投影出现，可以聊天和看看；每次旅行限 CALLS_PER_TRIP 次。
  function dropChat() {
    chatToken += 1;
    if (chatSession && host.chat && host.chat.destroy) host.chat.destroy(chatSession);
    chatSession = null;
    history = [];
    seen = [];
  }

  function startCall(listenAfter) {
    const trip = v.g.trip;
    const use = Game.useCall(v.g);
    if (!use.ok) { toast(LINES.call.used); log('call refused', use.reason); return; }
    if (use.paid) toast(LINES.call.paid);
    markDirty();
    dropChat();
    const dest = destById(trip.dest);
    const c = v.close;
    c.call = { dest: dest.id, at: v.now, until: v.now + DIAL_MS + CALL_MAX_MS, dropAt: 0, returned: false };
    c.enterAt = v.now + DIAL_MS;
    c.leaveAt = 0;
    c.mood = 'happy';
    c.moodAt = c.enterAt;
    c.bubble = { text: Game.pick(rng, LINES.call.hello).replace('{place}', dest.name), at: c.enterAt + 300 };
    c.phase = 'idle';
    c.look = null;
    c.fx = null;
    v.screen = 'close';
    v.dock = DOCK_CALL;
    v.dockFocus = 0;
    log('call start', JSON.stringify({ dest: dest.id, calls: trip.calls, paid: use.paid, beacon: v.g.stock.beacon, by: listenAfter ? 'voice' : 'tap' }));
    if (listenAfter) setTimeoutSafe(() => { if (v.screen === 'close' && c.call && !c.leaveAt) startListening(); }, DIAL_MS + 500);
    else { const greet = c.bubble.text; setTimeoutSafe(() => { if (v.screen === 'close' && c.call && c.phase === 'idle' && !c.leaveAt) speak(greet); }, DIAL_MS + 300); }
  }

  function hangUp(reason) {
    const c = v.close;
    if (v.screen !== 'close' || !c.call || c.leaveAt) return;
    stopListening(true);
    chatToken += 1;
    endLook();
    c.leaveAt = v.now;
    if (reason === 'bye') {
      c.bubble = { text: Game.pick(rng, LINES.call.bye), at: v.now - 2000 };
      speak(c.bubble.text);
    }
    log('call end', reason);
    setTimeoutSafe(() => {
      if (v.screen !== 'close') return;
      const returned = !!(c.call && c.call.returned) || !v.g.trip;
      c.call = null;
      dropChat();
      v.screen = 'home';
      if (returned) { v.pet.present = true; v.pet.tp = { kind: 'arrive', at: v.now }; }
      setDock(homeDock(), 'call');
    }, 520);
  }

  const timers = new Set();
  function setTimeoutSafe(fn, ms) {
    const id = host.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  function dismiss() {
    if (v.screen !== 'close' || v.close.leaveAt) return;
    if (v.close.call) { hangUp('bye'); return; }
    stopListening(true);
    chatToken += 1;
    endLook();
    v.close.leaveAt = v.now;
    v.close.bubble = { text: Game.pick(rng, LINES.bye), at: v.now - 2000 };
    speak(v.close.bubble.text);
    setTimeoutSafe(() => {
      if (v.screen !== 'close') return;
      v.screen = 'home';
      setDock(homeDock(), 'call');
      let to = Math.floor(rng() * 4);
      v.pet.tp = { kind: 'return', to, at: v.now };
      v.pet.actsHere = 0;
    }, 400);
  }

  function setMood(mood) {
    if (v.close.mood !== mood) v.close.moodAt = v.now;
    v.close.mood = mood;
  }

  function say(textValue, mood, voice = true) {
    if (mood) setMood(mood);
    v.close.bubble = { text: textValue, at: v.now };
    if (voice) speak(textValue);
  }

  function startListening() {
    const c = v.close;
    if (v.screen !== 'close' || c.phase !== 'idle') return;
    stopSpeech();
    if (!host.listen) {
      say(Game.pick(rng, LINES.offline), 'think');
      return;
    }
    c.phase = 'listening';
    c.transcript = '';
    setMood('think');
    listenHandle = host.listen({
      onPartial: textValue => { if (c.phase === 'listening') c.transcript = textValue; },
      onEnd: textValue => {
        listenHandle = null;
        if (c.phase !== 'listening') return;
        const heard = String(textValue || '').trim();
        if (!heard) {
          c.phase = 'idle';
          say(LINES.heardNothing, 'pout');
          return;
        }
        ask(heard);
      }
    });
    if (!listenHandle) {
      c.phase = 'idle';
      say(Game.pick(rng, LINES.offline), 'think');
    }
  }

  function stopListening(abort) {
    const handle = listenHandle;
    listenHandle = null;
    if (handle) {
      try { abort ? handle.abort() : handle.stop(); } catch (error) { log('listen stop ignored', String(error)); }
    }
    if (abort && v.close.phase === 'listening') v.close.phase = 'idle';
  }

  function contextLine() {
    const g = v.g;
    const gifts = Game.collected(g);
    const base = `${Game.statusLine(g, v.now)}；亲密度“${affinityName(g.affinity)}”；已收集纪念品${gifts}件；现在${new Date(v.now).getHours()}点。`;
    return v.close.call ? `${base}${callContext(destById(v.close.call.dest))}` : base;
  }

  // 回忆：模型给的记住 / 忘记标签。日志只记条数，不记内容
  function applyMemo(memo) {
    let added = null;
    let gone = 0;
    for (const k of memo.forget) gone += Game.forget(v.g, k);
    for (const t of memo.remember) added = Game.remember(v.g, t, v.now) || added;
    if (!added && !gone) return;
    markDirty();
    log('memory', JSON.stringify({ added: !!added, forgot: gone, size: v.g.memory.length }));
    if (added) toast(`她记住了：${added.slice(0, 14)}`);
    else toast(`她忘掉了 ${gone} 件事`);
  }

  async function ask(question) {
    const c = v.close;
    const token = ++chatToken;
    c.phase = 'thinking';
    c.transcript = '';
    const reward = Game.interact(v.g, 'chat', v.now);
    markDirty();
    log('chat ask', question.slice(0, 40));
    let reply = null;
    let told = null;
    if (host.chat) {
      try {
        const context = contextLine();
        if (!chatSession) {
          chatSession = await host.chat.create(systemPrompt(context, v.g.affinity, Game.memoryTexts(v.g)));
          sentContext = context;
        }
        if (token !== chatToken) return;
        if (chatSession) {
          // 系统提示只在建会话时写一次：之后状态变了、或刚看看过，就在这句话前附一段系统备注
          const note = chatNote({ context: context !== sentContext ? context : null, seen });
          if (note) log('chat note', JSON.stringify({ state: context !== sentContext, seen: seen.length }));
          sentContext = context;
          told = seen;
          seen = [];
          const raw = await host.chat.prompt(chatSession, note + question, CHAT_TIMEOUT_MS);
          if (token !== chatToken) { seen = told.concat(seen); return; }
          reply = parseReply(raw);
          if (!reply.text) reply = null;
          log('chat reply', raw && String(raw).slice(0, 60));
        }
      } catch (error) {
        if (told) seen = told.concat(seen);
        if (token !== chatToken) return;
        log('chat failed', String(error && error.message || error));
        host.chat.destroy && chatSession && host.chat.destroy(chatSession);
        chatSession = null;
      }
    }
    if (token !== chatToken || v.screen !== 'close') return;
    // 本地兜底台词不是她针对这句话的回答：不写进 history，免得之后被当成上下文带给看看（0.8.9）
    if (reply) {
      history.push({ q: question, a: reply.text });
      if (history.length > MAX_HISTORY) history.shift();
    } else reply = Game.pick(rng, LINES.localReplies);
    c.phase = 'idle';
    say(reply.text, reply.mood);
    if (reward) toast(`聊天 ＋${reward} 鳞光`);
    if (reply.memo) applyMemo(reply.memo);   // 记住了什么比鳞光提示更要紧，后写覆盖
  }

  // ---------------------------------------------------------- 看看（识图）
  // 拍照必须在按键调用栈里同步开始：look() 内调用 host.vision.shoot() 之前没有任何 await。
  function lookFailure(error) {
    const name = String(error && error.name || '');
    const msg = String(error && error.message || error || '');
    if (/NotAllowed|Permission|denied|SecurityError/i.test(name + msg)) return LINES.look.denied;
    if (msg === 'timeout') return LINES.look.timeout;
    if (msg === 'model unavailable') return LINES.look.offline;
    return LINES.look.camera;
  }

  function endLook() {
    const c = v.close;
    if (c.phase === 'looking' || c.phase === 'discover') c.phase = 'idle';
    c.look = null;
  }

  function look() {
    const c = v.close;
    if (c.phase === 'discover') endLook();
    if (c.phase !== 'idle') return;
    if (!host.vision) { say(LINES.look.offline, 'sad'); return; }
    stopSpeech();
    const token = ++chatToken;
    c.phase = 'looking';
    c.look = { stage: 'stream', at: v.now, shotAt: 0, revealAt: 0 };
    c.bubble = { text: LINES.look.aim, at: v.now };
    setMood('wow');
    log('look start');
    let shot;
    try {
      shot = host.vision.shoot({
        isCurrent: () => token === chatToken,
        onStage: stage => {
          if (token !== chatToken || !c.look) return;
          c.look.stage = stage;
          if (stage === 'warmup') c.bubble = { text: Game.pick(rng, LINES.look.hold), at: v.now };
          if (stage === 'shutter') c.look.shotAt = v.now;
          log('look stage', stage);
        }
      });
    } catch (error) {
      shot = Promise.reject(error);
    }
    runLook(token, shot);
  }

  async function runLook(token, shot) {
    const c = v.close;
    let reply = null;
    let failure = null;
    try {
      const url = await shot;
      if (token !== chatToken) return;
      log('look photo ready', String(url).length);
      if (c.look) { c.look.stage = 'thinking'; c.look.shotAt = c.look.shotAt || v.now; }
      c.bubble = { text: Game.pick(rng, LINES.look.thinking), at: v.now };
      setMood('think');
      const recent = history.slice(-VISION_RECENT).map(r => `你说“${r.q}”，她答“${r.a}”`);
      const session = await host.vision.create(visionPrompt(contextLine(), recent, Game.memoryTexts(v.g)));
      if (token !== chatToken) { if (session) host.vision.destroy(session); return; }
      if (!session) throw new Error('model unavailable');
      try {
        const raw = await host.vision.prompt(session, LOOK_QUESTION, url, VISION_TIMEOUT_MS);
        if (token !== chatToken) return;
        log('look reply', raw && String(raw).slice(0, 60));
        reply = parseReply(raw);
        if (!reply.text) reply = null;
      } finally {
        host.vision.destroy(session);
      }
    } catch (error) {
      if (token !== chatToken || (error && error.name === 'AbortError')) return;
      failure = lookFailure(error);
      log('look failed', String(error && (error.message || error.name) || error));
    }
    if (token !== chatToken || v.screen !== 'close') return;
    if (!reply) {
      endLook();
      say(failure || LINES.look.unclear, failure === LINES.look.denied ? 'sad' : 'confused');
      return;
    }
    const reward = Game.interact(v.g, 'chat', v.now);
    markDirty();
    seen = seen.concat(reply.text).slice(-2);
    c.phase = 'discover';
    c.look = { stage: 'reveal', at: v.now, shotAt: 0, revealAt: v.now };
    say(reply.text, reply.mood);
    if (reward) toast(`看看 ＋${reward} 鳞光`);
    if (reply.memo) applyMemo(reply.memo);
  }

  function closeAction(id) {
    const c = v.close;
    if (c.leaveAt || v.now < c.enterAt) return;
    if (id === 'look') { look(); return; }
    if (c.phase === 'looking') return;
    if (c.phase === 'discover') endLook();
    if (id === 'talk') {
      if (c.phase === 'listening') { stopListening(false); return; }
      if (c.phase === 'idle') startListening();
    } else if (id === 'pat') {
      if (c.phase !== 'idle') return;
      c.fx = { kind: 'pat', at: v.now };
      const reward = Game.interact(v.g, 'pat', v.now);
      say(Game.pick(rng, touchLines('pat', v.g.affinity)), 'smug');
      if (reward) toast(`摸头 ＋${reward} 鳞光`);
      markDirty();
    } else if (id === 'poke') {
      if (c.phase !== 'idle') return;
      c.fx = { kind: 'poke', at: v.now };
      const reward = Game.interact(v.g, 'poke', v.now);
      say(Game.pick(rng, touchLines('poke', v.g.affinity)), 'pout');
      if (reward) toast(`＋${reward} 鳞光`);
      markDirty();
    } else if (id === 'leave' || id === 'hangup') dismiss();
  }

  // ---------------------------------------------------------- 菜单
  function openMenu(kind) {
    v.screen = 'menu';
    v.menu = { kind, focus: 0, detail: null };
    // 明信片列表里就先解当前和前后各一张，点开时多半已经显影好
    if (kind === 'album') wantCards();
  }

  function wantCards() {
    if (!host.decoder.want) return;
    const cards = v.g.postcards.slice().reverse();
    const n = cards.length;
    for (const d of [0, 1, -1]) {
      const card = cards[(v.menu.focus + d + n) % n];
      const id = card && cardArtId(card);
      if (id) host.decoder.want(id);
    }
  }

  function giftAt(index) {
    return DEX_ROWS[Math.floor(index / 3)].gifts[index % 3];
  }

  function menuCount() {
    const m = v.menu;
    if (m.kind === 'pack') return ITEM_ORDER.length;
    if (m.kind === 'shop') return SHOP_ORDER.length;
    if (m.kind === 'album') return v.g.postcards.length;
    if (m.kind === 'dex') return DEX_ROWS.length * 3;
    return 0;
  }

  function menuConfirm() {
    const m = v.menu;
    const g = v.g;
    if (m.kind === 'shop') {
      const id = SHOP_ORDER[m.focus];
      const result = Game.buy(g, id);
      toast(result.ok ? `${ITEMS[id].name} ${LINES.bought}` : result.reason === 'poor' ? LINES.poor : '仓库满了');
      if (result.ok) markDirty();
    } else if (m.kind === 'pack') {
      const id = ITEM_ORDER[m.focus];
      const result = Game.togglePack(g, id, v.now, rng, scale);
      if (!result.ok) toast(result.reason === 'traveling' ? LINES.traveling : '仓库里没有了，去商店看看');
      else {
        toast(result.packed ? `放入${ITEMS[id].name}${g.pack.food ? '' : '，还需要便当'}` : `取出${ITEMS[id].name}`);
        if (result.packed && g.pack.food && ITEMS[id].kind === 'food') setTimeoutSafe(() => toast(LINES.packed), 1400);
        markDirty();
      }
    } else if (m.kind === 'dex') {
      // 图鉴：轻点打开纪念品详情，再点或双击关闭；详情里滑动切换上一件/下一件
      if (m.detail) m.detail = null;
      else { m.detail = { at: v.now }; log('dex detail', giftAt(m.focus).id); }
    } else if (m.kind === 'album') {
      if (!g.postcards.length) return;
      const index = g.postcards.length - 1 - m.focus;
      Game.readPostcard(g, index);
      markDirty();
      v.screen = 'postcard';
      wantCards();
    }
  }

  function homeAction(id) {
    if (id === 'call') summon(false);
    else if (id === 'shells') {
      const gained = Game.collectShells(v.g, v.now, rng);
      if (gained) {
        toast(`${LINES.shellGot} ＋${gained} 鳞光`);
        markDirty();
      }
      setDock(homeDock(), 'call');
    } else openMenu(id);
  }

  // ---------------------------------------------------------- 首页与教程
  function startBoot(summonAfter) {
    stopSpeech();
    wakeAfterBoot = !!summonAfter;
    v.screen = 'boot';
    v.bootAt = v.now;
    v.bootLeaveAt = 0;
    v.bootReady = false;
    log('boot', summonAfter ? 'voice' : 'menu');
  }

  function openTitle() {
    stopSpeech();
    stopListening(true);
    v.screen = 'title';
    v.title.at = v.now;
    v.title.leaveAt = 0;
    v.title.panel = null;
    v.title.focus = v.g && !v.g.tutorialDone ? 1 : 0;
    persist(true);
  }

  function enterTutorialStep(index) {
    const tut = v.tut;
    tut.step = index;
    tut.at = v.now;
    tut.okAt = 0;
    tut.swipes = 0;
    speak(TUTORIAL[index].text);
  }

  function openTutorial() {
    v.screen = 'tutorial';
    v.tut.focus = 0;
    enterTutorialStep(0);
    log('tutorial start');
  }

  function tutorialInput(kind) {
    const tut = v.tut;
    const step = TUTORIAL[tut.step];
    if (tut.okAt) return kind !== 'back' || step.goal === 'back';
    if (kind === 'swipe') {
      tut.focus += 1;
      if (step.goal === 'swipe') {
        tut.swipes += 1;
        if (tut.swipes >= (step.count || 1)) passStep();
      }
      return true;
    }
    if (kind === 'back') {
      if (step.goal === 'back') { passStep(); return true; }
      openTitle();
      return true;
    }
    if (kind === 'confirm' && step.goal === 'confirm') {
      if (v.now - tut.at < 400) return true; // 防止上一步的确认连带跳过
      if (tut.step === TUTORIAL.length - 1) {
        v.g.tutorialDone = true;
        markDirty();
        persist(true);
        log('tutorial done');
        startBoot(false);
      } else enterTutorialStep(tut.step + 1);
      return true;
    }
    return true;
  }

  function passStep() {
    const tut = v.tut;
    tut.okAt = v.now;
    tut.praise = Game.pick(rng, TUTORIAL_PRAISE);
    const index = tut.step;
    setTimeoutSafe(() => {
      if (v.screen === 'tutorial' && v.tut.step === index && v.tut.okAt) enterTutorialStep(index + 1);
    }, TUTORIAL_OK_MS);
  }

  function titleConfirm() {
    if (!v.g || v.now - v.title.at < 350) return;
    if (v.title.panel) { if (!v.title.panel.closeAt) settingsConfirm(); return; }
    const item = titleMenu(v)[v.title.focus];
    if (item.id === 'play') { v.title.leaveAt = v.now; setTimeoutSafe(() => { if (v.screen === 'title') startBoot(false); }, 360); }
    else if (item.id === 'tutorial') openTutorial();
    else if (item.id === 'settings') { v.title.panel = { focus: 0, at: v.now, closeAt: 0, flipAt: 0 }; log('settings open'); }
  }

  // 首页设置弹窗：滑动选择，轻点切换，双击关闭
  function settingsConfirm() {
    const p = v.title.panel;
    const item = SETTINGS[p.focus];
    if (item.id === 'memory') {
      // 清空回忆要连点两下：第一下提示，3 秒内再点才清
      if (!v.g.memory.length) return;
      if (p.armAt && v.now - p.armAt < 3000) {
        const n = Game.forget(v.g, '');
        p.armAt = 0; p.flipAt = v.now;
        dropChat();
        markDirty(); persist(true);
        toast(`已清除 ${n} 条回忆`);
        log('memory cleared', n);
      } else p.armAt = v.now;
      return;
    }
    v.g.settings[item.id] = !v.g.settings[item.id];
    p.flipAt = v.now;
    if (item.id === 'voice') {
      if (v.g.settings.voice) speak('语音已开启');
      else stopSpeech();
    }
    markDirty();
    persist(true);
    log('setting', item.id, v.g.settings[item.id]);
  }

  function closeSettings() {
    const p = v.title.panel;
    if (!p || p.closeAt) return;
    p.closeAt = v.now;
    setTimeoutSafe(() => { if (v.title.panel === p) v.title.panel = null; }, 220);
  }

  // ---------------------------------------------------------- 对外接口
  return {
    view: v,
    tick(time) {
      v.now = time;
      if (!v.g) loadGame();
      if (!host.decoder.finished && !v.decodeError) {
        // 首页和教程期间后台解码，载入动画时加大预算；每帧只推进少量，保证动画连续
        // 载入完成后剩余的 Q 版动作帧继续在后台解码，未就绪的帧由场景回退到基础姿势
        const budget = host.decodeBudgetMs || (v.screen === 'boot' ? 14 : host.decoder.ready ? 6 : 8);
        const started = host.now();
        try {
          while (!host.decoder.finished && host.now() - started < budget) host.decoder.step();
        } catch (error) {
          log('decode failed', String(error && error.stack || error));
          v.decodeError = String(error && error.message || error);
        }
        v.decodeProgress = host.decoder.progress;
      }
      if (v.screen === 'title' || v.screen === 'tutorial') {
        tickGame();
        return;
      }
      if (v.screen === 'boot') {
        const t = v.now - v.bootAt;
        v.bootReady = (host.decoder.ready || !!v.decodeError) && t >= BOOT_MIN_MS;
        if (v.bootReady && !v.bootLeaveAt && t >= BOOT_MIN_MS + 1400) v.bootLeaveAt = v.now;
        if (v.bootLeaveAt && v.now - v.bootLeaveAt > BOOT_LEAVE_MS) this.enterHome();
        return;
      }
      tickGame();
      if (v.screen === 'home') tickHome();
      if (v.screen === 'home' && !v.pet.tp) { const want = homeDock(); if (want.map(d => d.label).join() !== v.dock.map(d => d.label).join()) setDock(want); }
      if (v.screen === 'close' && v.close.fx && v.now - v.close.fx.at > 1000) v.close.fx = null;
      const call = v.screen === 'close' && v.close.call;
      if (call && !call.dropAt && !call.returned && !v.close.leaveAt && v.now > call.until && v.close.phase === 'idle') {
        call.dropAt = v.now;
        say(Game.pick(rng, LINES.call.drop), 'confused');
        setTimeoutSafe(() => hangUp('drop'), 2400);
      }
      // 识图结果出来后一直保持指认姿势（0.7.2），直到重新拍照、点底栏其他项或双击返回，不再定时回到半身
    },
    enterHome() {
      v.screen = 'home';
      setDock(homeDock(), 'call');
      v.pet.present = !v.g.trip;
      if (v.pet.present) v.pet.tp = { kind: 'arrive', at: v.now };
      newAct('idle');
      for (const e of pendingAfterBoot) if (e.type === 'postcard' || e.type === 'first') handleEvent(e);
      if (pendingAfterBoot.some(e => e.type === 'return') || v.g.pending) {
        v.pet.present = true;
      }
      if (pendingAfterBoot.some(e => e.type === 'depart')) toast('她趁你不在的时候出门旅行了');
      pendingAfterBoot = [];
      if (wakeAfterBoot) { wakeAfterBoot = false; v.summonPending = true; }
    },
    draw(ctx) { render(ctx, v); },
    swipe(direction) {
      if (v.screen === 'boot') return;
      if (v.screen === 'title') {
        const p = v.title.panel;
        if (p) { p.focus = (p.focus + direction + SETTINGS.length) % SETTINGS.length; return; }
        const n = titleMenu(v).length;
        v.title.focus = (v.title.focus + direction + n) % n;
        return;
      }
      if (v.screen === 'tutorial') { tutorialInput('swipe'); return; }
      if (v.screen === 'home' || v.screen === 'close') {
        if (v.screen === 'close' && (v.close.phase === 'listening' || v.close.phase === 'looking')) return;
        v.dockFocus = (v.dockFocus + direction + v.dock.length) % v.dock.length;
      } else if (v.screen === 'menu') {
        const n = menuCount();
        if (n) v.menu.focus = (v.menu.focus + direction + n) % n;
        if (v.menu.detail) v.menu.detail = { at: v.now, dir: direction };
        if (v.menu.kind === 'album' && n) wantCards();
      } else if (v.screen === 'postcard') {
        const n = v.g.postcards.length;
        v.menu.focus = (v.menu.focus + direction + n) % n;
        Game.readPostcard(v.g, n - 1 - v.menu.focus);
        markDirty();
        wantCards();
      }
    },
    confirm() {
      if (v.screen === 'title') { titleConfirm(); return; }
      if (v.screen === 'tutorial') { tutorialInput('confirm'); return; }
      if (v.screen === 'boot') {
        if (v.bootReady && !v.bootLeaveAt) v.bootLeaveAt = v.now;
        return;
      }
      if (v.screen === 'home') homeAction(v.dock[v.dockFocus].id);
      else if (v.screen === 'close') closeAction(v.dock[v.dockFocus].id);
      else if (v.screen === 'menu') menuConfirm();
      else if (v.screen === 'postcard') v.screen = 'menu';
      else if (v.screen === 'gift' && v.now - v.giftAt > 900) {
        const bond = v.giftView && v.giftView.bond;
        const got = bond ? Game.claimBond(v.g) : Game.claimGift(v.g);
        markDirty();
        persist(true);
        v.giftView = null;
        v.screen = 'home';
        setDock(homeDock(), 'dex');
        if (bond) {
          // 关系变了：下次聊天用新等级的口吻重新开始
          dropChat();
          if (got && got.gift) toast(`收下了${got.gift.name} · 亲密度“${AFFINITY[got.level].name}”`);
        } else if (got) toast(`收下了礼物 ＋${got.scales} 鳞光`);
      }
    },
    // 返回值：true 表示页面内消费，false 表示交给宿主退出
    back() {
      if (v.screen === 'title') { if (v.title.panel) { closeSettings(); return true; } return false; }
      if (v.screen === 'tutorial') return tutorialInput('back');
      if (v.screen === 'boot') { openTitle(); return true; }
      if (v.screen === 'home') {
        const tp = v.pet.tp;
        if (tp) {
          // 传送中离开：直接落到终点状态
          if (tp.kind === 'move' || tp.kind === 'return' || tp.kind === 'shake') v.pet.corner = tp.to;
          if (tp.kind === 'depart') v.pet.present = false;
          v.pet.tp = null;
        }
        openTitle();
        return true;
      }
      if (v.screen === 'close') {
        if (v.close.phase === 'listening') { stopListening(true); say('那就不说啦', 'think'); return true; }
        if (v.close.phase === 'thinking') { chatToken += 1; v.close.phase = 'idle'; say('嗯？不问了吗', 'think'); return true; }
        if (v.close.phase === 'looking') { chatToken += 1; endLook(); say(LINES.look.cancel, 'think'); return true; }
        if (v.close.phase === 'discover') { endLook(); return true; }
        dismiss();
        return true;
      }
      if (v.screen === 'postcard') { v.screen = 'menu'; return true; }
      if (v.screen === 'menu') {
        if (v.menu.detail) { v.menu.detail = null; return true; }
        v.screen = 'home';
        setDock(homeDock(), v.menu.kind);
        return true;
      }
      if (v.screen === 'gift') return true;
      return false;
    },
    voiceWake() {
      if (v.screen === 'title' || v.screen === 'tutorial') { if (v.g) startBoot(true); return; }
      if (v.screen === 'boot') { wakeAfterBoot = true; return; }
      if (v.screen === 'home') summon(true);
      else if (v.screen === 'close' && v.close.phase === 'idle' && !v.close.leaveAt) startListening();
    },
    // 宿主每帧询问是否需要姿态传感器：只在首页、她在场、设置打开时开启
    wantsMotion: motionWanted,
    motion: motionSample,
    hide() {
      shaker.reset();
      stopSpeech();
      stopListening(true);
      chatToken += 1;
      if (chatSession && host.chat && host.chat.destroy) host.chat.destroy(chatSession);
      chatSession = null;
      history = [];
      seen = [];
      if (v.close.phase !== 'idle') v.close.phase = 'idle';
      v.close.look = null;
      for (const id of timers) host.clearTimeout(id);
      timers.clear();
      persist(true);
    },
    show(time) {
      v.now = time;
      // 隐藏时计时器已清空：补完被打断的首页离场与教程过关
      if (v.screen === 'title' && v.title.leaveAt) startBoot(false);
      if (v.screen === 'tutorial' && v.tut.okAt) enterTutorialStep(Math.min(v.tut.step + 1, TUTORIAL.length - 1));
      if (v.g) {
        const events = Game.settle(v.g, v.now, rng, { timeScale: scale, hold: true });
        for (const e of events) handleEvent(e);
        if (v.screen === 'close') { v.screen = 'home'; v.close.call = null; v.pet.tp = null; }
        if (v.g.pending && v.screen === 'home') { v.pet.present = true; openGift(); }
        v.pet.present = !v.g.trip;
        if (v.screen === 'home') setDock(homeDock(), 'call');
        markDirty();
      }
    },
    persist: () => persist(true),
    // 调试：重置存档
    reset() {
      v.g = Game.newState(v.now);
      persist(true);
    },
    fastFrames() {
      return true;
    }
  };
}
