// 旅行肥鱼控制器：状态机、输入、角落行为、召唤与对话。宿主能力全部经 host 注入，
// 同一份代码由 AIUI 页面和本机预览共用。
import { LINES, DOCK_HOME, DOCK_CLOSE, DOCK_CALL, CALLS_PER_TRIP, callContext, ITEMS, ITEM_ORDER, DESTS, IDLE_MUTTER, MOOD_TAGS, TUTORIAL, TUTORIAL_PRAISE, systemPrompt, visionPrompt, destById, affinityName, speechText, SETTINGS } from './content.js';
import { titleMenu } from './title.js';
import * as Game from './game.js';
import { render, BOOT_MIN_MS, CORNERS, TP, DIAL_MS } from './scenes.js';

const ACTS = ['idle', 'gaze', 'play', 'doze', 'hum', 'stroll'];
const ACT_WEIGHT = { idle: 3, gaze: 2, play: 2, doze: 1, hum: 2, stroll: 1 };
const SAVE_EVERY_MS = 15000;
const CHAT_TIMEOUT_MS = 15000;
const MAX_HISTORY = 8;
const TUTORIAL_OK_MS = 900;
const SPEECH_CHAR_MS = 230;
const VISION_TIMEOUT_MS = 30000;   // 义眼盯真真机：带图提问 2.5–3.6 秒返回
const DISCOVER_MIN_MS = 7000;      // 指认动画至少停留这么久，朗读更长时按朗读估计延长
export const LOOK_QUESTION = '看看我眼前这是什么？';
const CALL_MAX_MS = 150000;        // 一次通话最长 2.5 分钟（真实时间），之后信号飘走

function weighted(rng, avoid) {
  const pool = ACTS.filter(act => act !== avoid);
  const total = pool.reduce((n, act) => n + ACT_WEIGHT[act], 0);
  let r = rng() * total;
  for (const act of pool) { r -= ACT_WEIGHT[act]; if (r <= 0) return act; }
  return pool[0];
}

export function parseReply(raw) {
  let textValue = String(raw || '').replace(/[*#`>]/g, '').trim();
  let mood = null;
  const tag = textValue.match(/^[\[【(（]\s*([^\]】)）]{1,4})\s*[\]】)）]/);
  if (tag) {
    mood = MOOD_TAGS[tag[1].trim()] || null;
    textValue = textValue.slice(tag[0].length).trim();
  }
  textValue = textValue.replace(/[\[【][^\]】]{1,4}[\]】]/g, '').replace(/\s+/g, ' ').trim();
  if (textValue.length > 60) textValue = `${textValue.slice(0, 58)}…`;
  return { mood: mood || 'smug', text: textValue };
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
    pet: { corner: 3, act: 'idle', actAt: 0, actUntil: 0, present: true, tp: null, mutter: null, actsHere: 0 },
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
  let history = [];
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
    pet.act = force || weighted(rng, pet.act);
    pet.actAt = v.now;
    pet.actUntil = v.now + (6000 + rng() * 8000);
    pet.actsHere += 1;
    if (rng() < 0.45) {
      const list = IDLE_MUTTER[pet.act];
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

  function tickHome() {
    const pet = v.pet;
    if (pet.tp) {
      const age = v.now - pet.tp.at;
      const kind = pet.tp.kind;
      const end = kind === 'move' ? TP.out + TP.beam + TP.in : kind === 'return' ? TP.beam + TP.in : kind === 'depart' ? 1500 + TP.out + 520 : 500 + TP.in;
      if (age >= end) {
        if (kind === 'move' || kind === 'return') pet.corner = pet.tp.to;
        if (kind === 'depart') pet.present = false;
        const finished = kind;
        pet.tp = null;
        newAct();
        if (finished === 'arrive' && v.g.pending) openGift();
      }
      return;
    }
    if (!pet.present) { if (v.summonPending) { v.summonPending = false; toast('她在旅行，信号太远啦'); } return; }
    if (v.g.pending) { openGift(); return; }
    if (v.summonPending) { v.summonPending = false; summon(true); return; }
    if (pet.mutter && pet.mutter.at > v.now + 4000) pet.mutter = null;
    if (v.now >= pet.actUntil) {
      if (pet.actsHere >= 2 && rng() < 0.6) moveCorner();
      else newAct();
    }
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
  }

  function startCall(listenAfter) {
    const trip = v.g.trip;
    if ((trip.calls || 0) >= CALLS_PER_TRIP) { toast(LINES.call.used); return; }
    trip.calls = (trip.calls || 0) + 1;
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
    log('call start', JSON.stringify({ dest: dest.id, calls: trip.calls, by: listenAfter ? 'voice' : 'tap' }));
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

  async function ask(question) {
    const c = v.close;
    const token = ++chatToken;
    c.phase = 'thinking';
    c.transcript = '';
    const reward = Game.interact(v.g, 'chat', v.now);
    markDirty();
    log('chat ask', question.slice(0, 40));
    let reply = null;
    if (host.chat) {
      try {
        if (!chatSession) chatSession = await host.chat.create(systemPrompt(contextLine()));
        if (token !== chatToken) return;
        if (chatSession) {
          const raw = await host.chat.prompt(chatSession, question, CHAT_TIMEOUT_MS);
          if (token !== chatToken) return;
          reply = parseReply(raw);
          if (!reply.text) reply = null;
          log('chat reply', raw && String(raw).slice(0, 60));
        }
      } catch (error) {
        if (token !== chatToken) return;
        log('chat failed', String(error && error.message || error));
        host.chat.destroy && chatSession && host.chat.destroy(chatSession);
        chatSession = null;
      }
    }
    if (token !== chatToken || v.screen !== 'close') return;
    if (!reply) reply = Game.pick(rng, LINES.localReplies);
    history.push(question);
    if (history.length > MAX_HISTORY) history.shift();
    c.phase = 'idle';
    say(reply.text, reply.mood);
    if (reward) toast(`聊天 ＋${reward} 鳞光`);
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
      const session = await host.vision.create(visionPrompt(contextLine()));
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
    c.phase = 'discover';
    c.look = { stage: 'reveal', at: v.now, shotAt: 0, revealAt: v.now };
    say(reply.text, reply.mood);
    if (reward) toast(`看看 ＋${reward} 鳞光`);
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
      say(Game.pick(rng, LINES.pat), 'smug');
      if (reward) toast(`摸头 ＋${reward} 鳞光`);
      markDirty();
    } else if (id === 'poke') {
      if (c.phase !== 'idle') return;
      c.fx = { kind: 'poke', at: v.now };
      const reward = Game.interact(v.g, 'poke', v.now);
      say(Game.pick(rng, LINES.poke), 'pout');
      if (reward) toast(`＋${reward} 鳞光`);
      markDirty();
    } else if (id === 'leave' || id === 'hangup') dismiss();
  }

  // ---------------------------------------------------------- 菜单
  function openMenu(kind) {
    v.screen = 'menu';
    v.menu = { kind, focus: 0 };
  }

  function menuCount() {
    const m = v.menu;
    if (m.kind === 'pack' || m.kind === 'shop') return ITEM_ORDER.length;
    if (m.kind === 'album') return v.g.postcards.length;
    if (m.kind === 'dex') return DESTS.length * 3;
    return 0;
  }

  function menuConfirm() {
    const m = v.menu;
    const g = v.g;
    if (m.kind === 'shop') {
      const id = ITEM_ORDER[m.focus];
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
    } else if (m.kind === 'album') {
      if (!g.postcards.length) return;
      const index = g.postcards.length - 1 - m.focus;
      Game.readPostcard(g, index);
      markDirty();
      v.screen = 'postcard';
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
        if (v.bootLeaveAt && v.now - v.bootLeaveAt > 700) this.enterHome();
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
      if (v.screen === 'close' && v.close.phase === 'discover' && v.close.look) {
        const hold = Math.max(DISCOVER_MIN_MS, v.speechUntil - v.close.look.revealAt + 1500);
        if (v.now - v.close.look.revealAt > hold) endLook();
      }
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
      } else if (v.screen === 'postcard') {
        const n = v.g.postcards.length;
        v.menu.focus = (v.menu.focus + direction + n) % n;
        Game.readPostcard(v.g, n - 1 - v.menu.focus);
        markDirty();
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
        const got = Game.claimGift(v.g);
        markDirty();
        persist(true);
        v.giftView = null;
        v.screen = 'home';
        setDock(homeDock(), 'dex');
        if (got) toast(`收下了礼物 ＋${got.scales} 鳞光`);
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
          if (tp.kind === 'move' || tp.kind === 'return') v.pet.corner = tp.to;
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
    hide() {
      stopSpeech();
      stopListening(true);
      chatToken += 1;
      if (chatSession && host.chat && host.chat.destroy) host.chat.destroy(chatSession);
      chatSession = null;
      history = [];
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
    // 头部手势：主页点头＝呼唤（真机是否送达 nod 尚未验证）
    nod() {
      if (v.screen === 'home') summon(false);
      else if (v.screen === 'close' && v.close.phase === 'idle' && !v.close.leaveAt) v.close.fx = { kind: 'nod', at: v.now };
      else if (v.screen === 'title') titleConfirm();
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
