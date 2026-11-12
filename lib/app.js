// 旅行肥鱼控制器：状态机、输入、角落行为、召唤与对话。宿主能力全部经 host 注入，
// 同一份代码由 AIUI 页面和本机预览共用。
import { LINES, DOCK_HOME, DOCK_CLOSE, ITEMS, ITEM_ORDER, DESTS, IDLE_MUTTER, MOOD_TAGS, systemPrompt, destById, affinityName } from './content.js';
import * as Game from './game.js';
import { render, BOOT_MIN_MS, CORNERS, TP } from './scenes.js';

const ACTS = ['idle', 'gaze', 'play', 'doze', 'hum'];
const ACT_WEIGHT = { idle: 3, gaze: 2, play: 2, doze: 1, hum: 2 };
const SAVE_EVERY_MS = 15000;
const CHAT_TIMEOUT_MS = 15000;
const MAX_HISTORY = 8;

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
    screen: 'boot',
    bootAt: host.now(),
    bootLeaveAt: 0,
    bootReady: false,
    decodeProgress: 0,
    cache: host.decoder.cache,
    g: null,
    pet: { corner: 3, act: 'idle', actAt: 0, actUntil: 0, present: true, tp: null, mutter: null, actsHere: 0 },
    close: { mood: 'wow', moodAt: 0, bubble: null, phase: 'idle', transcript: '', fx: null, enterAt: 0, leaveAt: 0 },
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
    if (!pet.present) return;
    if (v.g.pending) { openGift(); return; }
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
      if (v.screen === 'home') {
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
  }

  // ---------------------------------------------------------- 召唤与对话
  function homeDock() {
    const dock = DOCK_HOME.slice();
    if (v.g && v.g.shells.count > 0) dock.splice(1, 0, { id: 'shells', label: `拾贝×${v.g.shells.count}` });
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
    c.phase = 'idle';
    c.fx = null;
    v.screen = 'close';
    v.dock = DOCK_CLOSE;
    v.dockFocus = 0;
    log('summon', listenAfter ? 'voice' : 'tap');
    if (listenAfter) setTimeoutSafe(() => { if (v.screen === 'close' && !v.close.leaveAt) startListening(); }, TP.out + 700);
  }

  const timers = new Set();
  function setTimeoutSafe(fn, ms) {
    const id = host.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  function dismiss() {
    if (v.screen !== 'close' || v.close.leaveAt) return;
    stopListening(true);
    chatToken += 1;
    v.close.leaveAt = v.now;
    v.close.bubble = { text: Game.pick(rng, LINES.bye), at: v.now - 2000 };
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

  function say(textValue, mood) {
    if (mood) setMood(mood);
    v.close.bubble = { text: textValue, at: v.now };
  }

  function startListening() {
    const c = v.close;
    if (v.screen !== 'close' || c.phase !== 'idle') return;
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
    return `${Game.statusLine(g, v.now)}；亲密度“${affinityName(g.affinity)}”；已收集纪念品${gifts}件；现在${new Date(v.now).getHours()}点。`;
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

  function closeAction(id) {
    const c = v.close;
    if (c.leaveAt || v.now < c.enterAt) return;
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
    } else if (id === 'leave') dismiss();
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

  // ---------------------------------------------------------- 对外接口
  return {
    view: v,
    tick(time) {
      v.now = time;
      if (v.screen === 'boot') {
        const t = v.now - v.bootAt;
        // 解码与动画交错：每帧推进少量，保证开机动画连续
        const budget = host.decodeBudgetMs || 14;
        const started = host.now();
        try {
          while (!host.decoder.finished && host.now() - started < budget) host.decoder.step();
        } catch (error) {
          log('decode failed', String(error && error.stack || error));
          v.decodeError = String(error && error.message || error);
        }
        v.decodeProgress = host.decoder.progress;
        if (host.decoder.finished && !v.g) loadGame();
        v.bootReady = host.decoder.finished && t >= BOOT_MIN_MS;
        if (v.bootReady && !v.bootLeaveAt && t >= BOOT_MIN_MS + 1400) v.bootLeaveAt = v.now;
        if (v.bootLeaveAt && v.now - v.bootLeaveAt > 700) this.enterHome();
        return;
      }
      tickGame();
      if (v.screen === 'home') tickHome();
      if (v.screen === 'home' && !v.pet.tp && v.dock.length !== homeDock().length) setDock(homeDock());
      if (v.screen === 'close' && v.close.fx && v.now - v.close.fx.at > 1000) v.close.fx = null;
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
    },
    draw(ctx) { render(ctx, v); },
    swipe(direction) {
      if (v.screen === 'boot') return;
      if (v.screen === 'home' || v.screen === 'close') {
        if (v.screen === 'close' && v.close.phase === 'listening') return;
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
      if (v.screen === 'boot') return false;
      if (v.screen === 'close') {
        if (v.close.phase === 'listening') { stopListening(true); say('那就不说啦', 'think'); return true; }
        if (v.close.phase === 'thinking') { chatToken += 1; v.close.phase = 'idle'; say('嗯？不问了吗', 'think'); return true; }
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
      if (v.screen === 'home') summon(true);
      else if (v.screen === 'close' && v.close.phase === 'idle' && !v.close.leaveAt) startListening();
    },
    hide() {
      stopListening(true);
      chatToken += 1;
      if (chatSession && host.chat && host.chat.destroy) host.chat.destroy(chatSession);
      chatSession = null;
      history = [];
      if (v.close.phase !== 'idle') v.close.phase = 'idle';
      for (const id of timers) host.clearTimeout(id);
      timers.clear();
      persist(true);
    },
    show(time) {
      v.now = time;
      if (v.g) {
        const events = Game.settle(v.g, v.now, rng, { timeScale: scale, hold: true });
        for (const e of events) handleEvent(e);
        if (v.screen === 'close') { v.screen = 'home'; setDock(homeDock(), 'call'); v.pet.tp = null; }
        if (v.g.pending && v.screen === 'home') { v.pet.present = true; openGift(); }
        v.pet.present = !v.g.trip;
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
