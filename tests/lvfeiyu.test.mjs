// 旅行肥鱼：规则、存档、离线结算与全画面冒烟测试（Node 内置 test）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Game from '../lib/game.js';
import { createApp, parseReply } from '../lib/app.js';
import { createDecoder, SPRITE_ORDER, REQUIRED, ALIAS } from '../lib/sprites.js';
import { SPRITES } from '../lib/sprite-data.js';
import { QBAN } from '../lib/qban-data.js';
import { capturePhoto, bytesToBase64 } from '../lib/camera.js';
import { discoverFrame } from '../lib/scenes.js';
import { DESTS, ITEMS, speechText } from '../lib/content.js';

const MIN = 60000;
const T0 = new Date(2026, 10, 12, 9, 0, 0).getTime();

test('新存档初始资源', () => {
  const s = Game.newState(T0);
  assert.equal(s.scales, 120);
  assert.equal(s.stock.onigiri, 2);
  assert.equal(s.trip, null);
});

test('坏档与陌生字段不会污染状态', () => {
  const s = Game.normalize({ v: 1, scales: -50, stock: { onigiri: 'x', hack: 9 }, pack: { food: 'compass' }, trip: { dest: 'nowhere' }, souvenirs: { lantern: 3, fake: 2 }, postcards: [{ dest: 'moon', at: 1, line: 'a'.repeat(200) }, { dest: 'mars' }] }, T0);
  assert.equal(s.scales, 0);
  assert.equal(s.stock.onigiri, 0);
  assert.equal(s.stock.hack, undefined);
  assert.equal(s.pack.food, null, '护符不能放进便当格');
  assert.equal(s.trip, null);
  assert.deepEqual(s.souvenirs, { lantern: 3 });
  assert.equal(s.postcards.length, 1);
  assert.equal(s.postcards[0].line.length, 40);
  assert.equal(Game.normalize(null, T0).v, 1);
  assert.equal(Game.normalize({ v: 2 }, T0).scales, 120);
});

test('存档读写往返', () => {
  const store = new Map();
  const storage = { get: k => store.get(k), set: (k, v) => store.set(k, v) };
  const s = Game.newState(T0);
  s.scales = 777;
  s.souvenirs.pearl = 2;
  assert.ok(Game.save(storage, s, T0 + 5));
  const back = Game.load(storage, T0 + 10);
  assert.equal(back.scales, 777);
  assert.equal(back.souvenirs.pearl, 2);
  assert.equal(back.lastSeen, T0 + 5);
  const broken = { get: () => '{oops', set: () => { throw new Error('quota'); } };
  assert.equal(Game.load(broken, T0).scales, 120);
  assert.equal(Game.save(broken, s, T0), false);
});

test('浮光贝离线生长并封顶', () => {
  const s = Game.newState(T0);
  s.shells = { count: 0, lastAt: T0 };
  Game.settle(s, T0 + 44 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, 0);
  Game.settle(s, T0 + 95 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, 2);
  Game.settle(s, T0 + 30 * 60 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, Game.SHELL_MAX);
  const got = Game.collectShells(s, T0 + 30 * 60 * MIN, Game.makeRng(2));
  assert.ok(got >= 8 * Game.SHELL_MAX && got <= 20 * Game.SHELL_MAX);
  assert.equal(s.shells.count, 0);
  // 收满后从收取时刻重新计时
  Game.settle(s, T0 + 30 * 60 * MIN + 44 * MIN, Game.makeRng(3));
  assert.equal(s.shells.count, 0);
});

test('商店与行囊：扣费、换便当退回、取出', () => {
  const s = Game.newState(T0);
  const rng = Game.makeRng(4);
  assert.equal(Game.buy(s, 'taiyaki').ok, false);
  assert.equal(Game.buy(s, 'pudding').ok, true);
  assert.equal(s.scales, 60);
  assert.ok(Game.togglePack(s, 'onigiri', T0, rng).ok);
  assert.equal(s.stock.onigiri, 1);
  assert.ok(s.departAt >= T0 + Game.DEPART_DELAY_MS[0] && s.departAt <= T0 + Game.DEPART_DELAY_MS[1]);
  assert.ok(Game.togglePack(s, 'pudding', T0, rng).ok);
  assert.equal(s.pack.food, 'pudding');
  assert.equal(s.stock.onigiri, 2, '换下的便当回到仓库');
  assert.ok(Game.togglePack(s, 'pudding', T0, rng).ok);
  assert.equal(s.pack.food, null);
  assert.equal(s.departAt, 0);
  assert.equal(Game.togglePack(s, 'compass', T0, rng).ok, false, '没有罗盘');
});

test('关闭期间完成出发、明信片、归来', () => {
  const s = Game.newState(T0);
  const rng = Game.makeRng(5);
  Game.buy(s, 'compass');
  Game.togglePack(s, 'onigiri', T0, rng);
  Game.togglePack(s, 'compass', T0, rng);
  // 召唤中不出发
  assert.equal(Game.settle(s, T0 + 10 * MIN, rng, { hold: true }).length, 0);
  const events = Game.settle(s, T0 + 10 * MIN, rng);
  assert.equal(events[0].type, 'depart');
  assert.ok(DESTS.find(d => d.id === s.trip.dest).tier === 0);
  assert.equal(s.trip.cards.length, 3, '罗盘多寄两张');
  const later = Game.settle(s, T0 + 24 * 60 * MIN, rng);
  assert.deepEqual(later.map(e => e.type), ['shell', 'postcard', 'postcard', 'postcard', 'return']);
  assert.equal(s.postcards.length, 3);
  assert.equal(s.unread, 3);
  assert.ok(s.pending && s.pending.scales >= 20 && s.pending.scales <= 40);
  const before = s.scales;
  const gift = Game.claimGift(s);
  assert.equal(s.scales, before + gift.scales);
  assert.equal(s.souvenirs[gift.gift], 1);
  Game.readPostcard(s, 0);
  assert.equal(s.unread, 2);
});

test('远途时长与好运贝壳提高稀有度', () => {
  const s = Game.newState(T0);
  s.stock.taiyaki = 1;
  const rng = Game.makeRng(6);
  Game.togglePack(s, 'taiyaki', T0, rng);
  Game.startTrip(s, T0, rng);
  const minutes = (s.trip.returnAt - s.trip.leftAt) / MIN;
  assert.ok(minutes >= 180 && minutes <= 360);
  const dest = DESTS.find(d => d.id === 'moon');
  let normal = 0;
  let lucky = 0;
  const r1 = Game.makeRng(7);
  const r2 = Game.makeRng(7);
  for (let i = 0; i < 4000; i += 1) {
    if (Game.rollGift(dest, 2, null, r1).rare === 2) normal += 1;
    if (Game.rollGift(dest, 2, 'shell', r2).rare === 2) lucky += 1;
  }
  assert.ok(normal / 4000 > 0.13 && normal / 4000 < 0.21, `普通稀有率 ${normal / 4000}`);
  assert.ok(lucky > normal * 1.4);
});

test('每日互动奖励有上限', () => {
  const s = Game.newState(T0);
  let total = 0;
  for (let i = 0; i < 10; i += 1) total += Game.interact(s, 'pat', T0);
  assert.equal(total, 15);
  assert.equal(Game.interact(s, 'pat', T0 + 24 * 60 * MIN), 5, '第二天重置');
});

test('经济：一周的常规收入可以支撑远途旅行', () => {
  // 每天拾贝两次（各约3枚）、摸头3次、聊天5次，粗略估计
  const daily = 6 * 14 + 15 + 15;
  assert.ok(daily * 2 > ITEMS.taiyaki.price, '两天内可以攒出远途便当');
  assert.ok(daily < ITEMS.taiyaki.price * 2, '不会每天买很多远途便当');
});

test('模型回复解析心情标签', () => {
  assert.deepEqual(parseReply('[生气]哼，不理你了'), { mood: 'pout', text: '哼，不理你了' });
  assert.deepEqual(parseReply('【惊讶】真的吗'), { mood: 'wow', text: '真的吗' });
  assert.equal(parseReply('没有标签').mood, 'smug');
  assert.equal(parseReply('[开心]好耶').mood, 'happy');
  assert.equal(parseReply('[疑惑]这是啥').mood, 'confused');
  assert.ok(parseReply('长'.repeat(100)).text.length <= 60);
});

test('精灵数据尺寸与镜像解码', () => {
  const all = { ...SPRITES, ...QBAN };
  for (const name of Object.keys(all)) assert.equal(Buffer.from(all[name].d, 'base64').length, all[name].w * all[name].h, name);
  // 用户确认的 80 格 Q 版原画 + 识图指认 8 帧，全部进入解码顺序
  assert.equal(Object.keys(QBAN).length, 88);
  for (const name of Object.keys(QBAN)) assert.ok(SPRITE_ORDER.includes(name), `未使用的帧：${name}`);
  assert.equal(new Set(SPRITE_ORDER).size, SPRITE_ORDER.length, '解码顺序无重复');
  const canvases = [];
  class FakeCanvas {
    constructor(w, h) { this.w = w; this.h = h; canvases.push(this); }
    getContext() { const self = this; return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(image) { self.data = image.data; }, flush() {} }; }
  }
  const decoder = createDecoder(FakeCanvas, value => Buffer.from(value, 'base64').toString('latin1'));
  let steps = 0;
  while (!decoder.ready) { decoder.step(); steps += 1; }
  for (const name of REQUIRED) assert.ok(decoder.cache[name], name);
  assert.ok(decoder.cache.front && decoder.cache.smug, '旧短名指向新原画');
  assert.equal(decoder.finished, false, '其余动作帧留到游戏中后台解码');
  while (!decoder.step()) steps += 1;
  assert.equal(Object.keys(decoder.cache).length, SPRITE_ORDER.length + Object.keys(ALIAS).length + 1);
  assert.ok(steps > 8, '分块解码');
  const side = decoder.cache.side.canvas.data;
  const mirror = decoder.cache.sideL.canvas.data;
  const w = QBAN.body_side.w;
  const y = 60;
  for (let x = 0; x < w; x += 7) assert.equal(side[(y * w + x) * 4 + 3], mirror[(y * w + (w - 1 - x)) * 4 + 3]);
});

// 只允许真机已验证的方法；出现其他方法即失败。
const ALLOWED = new Set(['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'quadraticCurveTo', 'bezierCurveTo', 'stroke', 'fill', 'setLineDash', 'save', 'restore', 'clip', 'fillText', 'measureText', 'drawImage', 'flush']);
function fakeCtx(stats) {
  const target = { font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic', lineDashOffset: 0 };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (typeof key !== 'string') return undefined;
      if (!ALLOWED.has(key)) throw new Error(`未验证的Canvas方法：${key}`);
      return (...args) => {
        stats[key] = (stats[key] || 0) + 1;
        if (key === 'measureText') return { width: String(args[0]).length * 12 };
        if (key === 'drawImage' && !args[0]) throw new Error('drawImage 缺少来源');
        for (const value of args) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${key} 收到非数值参数`);
        return undefined;
      };
    },
    set(obj, key, value) {
      if (key === 'globalAlpha' && !(value >= 0 && value <= 1)) throw new Error(`globalAlpha 越界 ${value}`);
      obj[key] = value;
      return true;
    }
  });
}


// 测试宿主：假时钟、假计时器、可观察的聆听与朗读。
function harness({ store = new Map(), voiceReply = '[惊讶]你来啦！', vision = null } = {}) {
  let clock = T0;
  const timers = [];
  class FakeCanvas { constructor(w, h) { this.w = w; this.h = h; } getContext() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, flush() {} }; } }
  const h = { listenHandlers: null, spoken: [], speaking: false, listenWhileSpeaking: 0, store, systems: [] };
  const app = createApp({
    now: () => clock,
    storage: { get: k => store.get(k), set: (k, v) => store.set(k, v) },
    decoder: createDecoder(FakeCanvas, value => Buffer.from(value, 'base64').toString('latin1')),
    timeScale: 120,
    seed: 42,
    decodeBudgetMs: 1e9,
    setTimeout: (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length; },
    clearTimeout: () => {},
    listen: handlers => {
      if (h.speaking) h.listenWhileSpeaking += 1;
      h.listenHandlers = handlers;
      return { stop() { handlers.onEnd('你好呀'); }, abort() { h.listenHandlers = null; } };
    },
    chat: { create: async system => { h.systems.push(system); return {}; }, prompt: async () => voiceReply, destroy() {} },
    vision,
    speech: { speak(text) { h.spoken.push(text); h.speaking = true; }, stop() { h.speaking = false; } }
  });
  const stats = {};
  const ctx = fakeCtx(stats);
  const screens = new Set();
  const step = ms => {
    clock += ms;
    for (const t of timers.splice(0)) if (t.at <= clock) t.fn(); else timers.push(t);
    app.tick(clock);
    app.draw(ctx);
    screens.add(app.view.screen);
  };
  const run = (ms, frame = 40) => { for (let t = 0; t < ms; t += frame) step(frame); };
  return Object.assign(h, { app, stats, screens, step, run });
}

test('首页：新档默认停在教程，返回键交给宿主退出', () => {
  const h = harness();
  h.run(800);
  assert.equal(h.app.view.screen, 'title');
  assert.equal(h.app.view.title.focus, 1, '新档推荐教程');
  assert.equal(h.app.back(), false);
  h.app.swipe(1);
  h.app.confirm();
  assert.ok(h.app.view.title.panel, '设置弹窗打开');
  h.app.confirm();
  h.run(200);
  assert.equal(h.app.view.g.settings.voice, false, '语音开关');
  assert.equal(h.spoken.length, 0, '关闭语音后不朗读');
  h.app.confirm();
  assert.equal(h.app.view.g.settings.voice, true);
  h.app.swipe(1);
  h.app.confirm();
  assert.equal(h.app.view.g.settings.fast, true, '快速旅行开关');
  h.run(200);
  assert.equal(h.app.back(), true, '双击先关弹窗');
  h.run(400);
  assert.equal(h.app.view.title.panel, null);
  assert.equal(h.app.view.screen, 'title');
  assert.equal(h.app.back(), false, '再双击才退出');
});

test('图鉴：轻点打开纪念品详情，滑动切换，双击先关详情', () => {
  const h = harness();
  h.run(800);
  const v = h.app.view;
  v.g.souvenirs.lantern = 2;
  v.screen = 'menu';
  v.menu = { kind: 'dex', focus: 0, detail: null };
  h.app.confirm();
  assert.ok(v.menu.detail, '详情打开');
  h.run(300);
  h.app.swipe(1);
  assert.equal(v.menu.focus, 1);
  assert.ok(v.menu.detail, '滑动后仍在详情');
  h.run(300);
  assert.equal(h.app.back(), true);
  assert.equal(v.menu.detail, null);
  assert.equal(v.screen, 'menu', '双击先关详情，仍在图鉴');
});

test('快速旅行：开启后新旅行时长为 1/3，存档保留开关', () => {
  const base = Game.normalize({}, T0);
  base.pack.food = 'onigiri';
  const slow = Game.normalize(JSON.parse(JSON.stringify(base)), T0);
  const quick = Game.normalize(JSON.parse(JSON.stringify(base)), T0);
  quick.settings.fast = true;
  slow.pack.food = 'onigiri';
  quick.pack.food = 'onigiri';
  Game.startTrip(slow, T0, Game.makeRng(7));
  Game.startTrip(quick, T0, Game.makeRng(7));
  assert.ok(Math.abs((quick.trip.returnAt - T0) * 3 - (slow.trip.returnAt - T0)) < 2);
  assert.equal(Game.normalize(JSON.parse(JSON.stringify(quick)), T0).settings.fast, true);
  assert.equal(Game.normalize({}, T0).settings.fast, false);
});

test('教程：每步需要真实操作，完成后记录并进入载入动画', () => {
  const h = harness();
  h.run(800);
  h.app.confirm();
  assert.equal(h.app.view.screen, 'tutorial');
  assert.ok(h.spoken[0].startsWith('你好，我是大肥鱼'), '朗读教程');
  h.run(500); h.app.confirm();
  assert.equal(h.app.view.tut.step, 1);
  h.run(500); h.app.confirm();
  assert.equal(h.app.view.tut.step, 1, '滑动步骤不能用单击跳过');
  h.app.swipe(1); h.run(100);
  assert.equal(h.app.view.tut.step, 1);
  h.app.swipe(-1); h.run(1000);
  assert.equal(h.app.view.tut.step, 2, '滑两下过关');
  assert.ok(h.app.back(), '返回步骤消费返回键');
  h.run(1000);
  assert.equal(h.app.view.tut.step, 3);
  for (let i = 3; i < 6; i += 1) { h.run(500); h.app.confirm(); }
  assert.equal(h.app.view.screen, 'boot');
  assert.equal(h.app.view.g.tutorialDone, true);
  h.run(7000);
  assert.equal(h.app.view.screen, 'home');
  // 回到首页后默认“进入游戏”
  assert.ok(h.app.back());
  assert.equal(h.app.view.screen, 'title');
  assert.equal(h.app.view.title.focus, 0);
  assert.equal(JSON.parse(h.store.get(Game.SAVE_KEY)).tutorialDone, true);
});

test('教程中途返回回到首页，不记录完成', () => {
  const h = harness();
  h.run(800);
  h.app.confirm();
  h.run(500); h.app.confirm();
  assert.ok(h.app.back());
  assert.equal(h.app.view.screen, 'title');
  assert.equal(h.app.view.g.tutorialDone, false);
});

test('首页语音唤醒：直接载入并瞬移聆听，聆听时从不朗读', async () => {
  const h = harness();
  h.run(800);
  h.app.voiceWake();
  assert.equal(h.app.view.screen, 'boot');
  h.run(9000);
  assert.equal(h.app.view.screen, 'close');
  assert.equal(h.app.view.close.phase, 'listening');
  assert.equal(h.spoken.length, 0, '语音唤醒后不朗读招呼语');
  h.listenHandlers.onEnd('今天去哪');
  await new Promise(resolve => setImmediate(resolve));
  h.run(200);
  assert.equal(h.spoken.at(-1), '你来啦！', '朗读去掉心情标签');
  assert.ok(h.speaking);
  h.app.confirm(); // 说话：先停播再聆听
  h.run(100);
  assert.equal(h.app.view.close.phase, 'listening');
  assert.equal(h.listenWhileSpeaking, 0);
  h.app.hide();
  assert.equal(h.speaking, false, '隐藏时停播');
});

test('朗读文本清理', () => {
  assert.equal(speechText('[开心]嘿嘿…再摸一下♪'), '嘿嘿，再摸一下');
  assert.equal(speechText('咻——到！'), '咻到！');
  assert.equal(speechText('选「呼唤」'), '选呼唤');
  assert.ok(speechText('长'.repeat(100)).length <= 60);
});

test('全流程冒烟：首页 → 载入 → 主页 → 召唤 → 菜单 → 旅行 → 礼物 → 明信片，所有画面可绘制', async () => {
  const h = harness();
  const { app, run, step, stats, screens } = h;
  run(800);
  app.view.title.focus = 0;
  app.confirm();
  run(7400);
  assert.equal(app.view.screen, 'home');
  run(1200);
  app.confirm();
  run(1500);
  assert.equal(app.view.screen, 'close');
  assert.ok(h.spoken.length >= 1, '点按呼唤会朗读招呼');
  app.confirm();
  run(200);
  assert.equal(app.view.close.phase, 'listening');
  h.listenHandlers.onPartial('你好');
  run(200);
  h.listenHandlers.onEnd('你好呀');
  await new Promise(resolve => setImmediate(resolve));
  run(400);
  assert.equal(app.view.close.bubble.text, '你来啦！');
  assert.equal(app.view.close.mood, 'wow');
  for (const id of ['pat', 'poke']) {
    app.view.dockFocus = app.view.dock.findIndex(d => d.id === id);
    app.confirm(); run(1000);
  }
  assert.ok(app.back());
  run(1500);
  assert.equal(app.view.screen, 'home');
  for (const id of ['shop', 'pack', 'album', 'dex']) {
    app.view.dockFocus = app.view.dock.findIndex(d => d.id === id);
    app.confirm();
    assert.equal(app.view.screen, 'menu');
    for (let i = 0; i < 20; i += 1) { app.swipe(1); step(40); }
    assert.ok(app.back());
    step(40);
  }
  app.view.dockFocus = app.view.dock.findIndex(d => d.id === 'pack');
  app.confirm();
  app.confirm();
  assert.equal(app.view.g.pack.food, 'onigiri');
  app.back();
  run(4000);
  assert.ok(app.view.g.trip, '已经出发');
  run(30000, 200);
  assert.equal(app.view.screen, 'gift');
  assert.ok(h.spoken.at(-1).startsWith('我回来啦'), '归来朗读');
  run(1200);
  app.confirm();
  assert.equal(app.view.screen, 'home');
  assert.equal(Object.keys(app.view.g.souvenirs).length, 1);
  app.view.dockFocus = app.view.dock.findIndex(d => d.id === 'album');
  app.confirm();
  app.confirm();
  assert.equal(app.view.screen, 'postcard');
  for (let i = 0; i < 30; i += 1) step(40);
  app.back(); app.back();
  run(1500);
  app.nod();
  run(1500);
  assert.equal(app.view.screen, 'close', '点头呼唤');
  app.back();
  run(120000, 120);
  app.hide();
  assert.ok(h.store.get(Game.SAVE_KEY));
  for (const name of ['title', 'boot', 'home', 'close', 'menu', 'gift', 'postcard']) assert.ok(screens.has(name), name);
  assert.ok(stats.drawImage > 100 && stats.clip > 0);
});

// 假相机与假模型：记录调用顺序，验证拍照在按键调用栈内同步开始。
function fakeVision({ reply = '[惊讶]这是一个杯子！装满奶茶就好了', fail = null } = {}) {
  const log = { shots: 0, prompts: [], destroyed: 0, aborted: 0 };
  let release = null;
  const vision = {
    shoot(options) {
      log.shots += 1;
      options.onStage('stream');
      options.onStage('warmup');
      return new Promise((resolve, reject) => {
        release = () => {
          if (!options.isCurrent()) { log.aborted += 1; const e = new Error('canceled'); e.name = 'AbortError'; reject(e); return; }
          options.onStage('shutter');
          if (fail) reject(fail); else resolve('data:image/jpeg;base64,/9j/AAAA');
        };
      });
    },
    create: async system => ({ system }),
    prompt: async (session, question, url, ms) => { log.prompts.push({ system: session.system, question, url, ms }); return reply; },
    destroy() { log.destroyed += 1; }
  };
  return { vision, log, shutter: () => release && release() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

async function toClose(h) {
  h.run(800);
  h.app.view.title.focus = 0;
  h.app.confirm();
  h.run(7400);
  assert.equal(h.app.view.screen, 'home');
  h.run(1200);
  h.app.confirm();
  h.run(1500);
  assert.equal(h.app.view.screen, 'close');
  h.app.view.dockFocus = h.app.view.dock.findIndex(d => d.id === 'look');
  assert.ok(h.app.view.dockFocus > 0, '近景有「看看」');
}

test('看看：按键内同步开始拍照，带图提问后播放指认动画并朗读', async () => {
  const f = fakeVision();
  const h = harness({ vision: f.vision });
  await toClose(h);
  h.app.confirm();
  assert.equal(f.log.shots, 1, '拍照必须在 confirm() 调用栈内开始');
  assert.equal(h.app.view.close.phase, 'looking');
  assert.equal(h.speaking, false, '取景时不朗读');
  h.run(1000);
  h.app.swipe(1);
  assert.equal(h.app.view.dock[h.app.view.dockFocus].id, 'look', '取景时不切换选项');
  f.shutter();
  await flush(); await flush(); await flush();
  h.run(200);
  assert.equal(f.log.prompts.length, 1);
  const p = f.log.prompts[0];
  assert.ok(p.url.startsWith('data:image/jpeg;base64,'));
  assert.equal(p.ms, 30000);
  assert.ok(p.system.includes('摄像头') && p.system.includes('大肥鱼'));
  assert.equal(f.log.destroyed, 1, '用完即销毁会话');
  assert.equal(h.app.view.close.phase, 'discover');
  assert.equal(h.app.view.close.mood, 'wow');
  assert.ok(h.spoken.at(-1).includes('杯子'));
  assert.deepEqual([0, 200, 300, 400, 600, 2300, 2600].map(discoverFrame), ['pd1', 'pd2', 'pd3', 'pd4', 'pd5', 'pd6', 'pd5']);
  const holdFrames = new Set();
  for (let ms = 770; ms < 770 + 4790; ms += 10) holdFrames.add(discoverFrame(ms));
  assert.deepEqual([...holdFrames].sort(), ['pd5', 'pd6', 'pd7', 'pd8']);
  h.run(3000, 80);
  assert.equal(h.app.view.close.phase, 'discover');
  h.run(20000, 200);
  assert.equal(h.app.view.close.phase, 'idle', '指认结束回到半身');
});

test('看看：返回键取消拍照，相机失败给出提示，不调用模型', async () => {
  const f = fakeVision();
  const h = harness({ vision: f.vision });
  await toClose(h);
  h.app.confirm();
  h.run(400);
  assert.ok(h.app.back());
  assert.equal(h.app.view.close.phase, 'idle');
  assert.equal(h.app.view.screen, 'close', '取消拍照不离开近景');
  f.shutter();
  await flush(); await flush();
  assert.equal(f.log.aborted, 1);
  assert.equal(f.log.prompts.length, 0);

  const denied = new Error('Permission denied'); denied.name = 'NotAllowedError';
  const g = fakeVision({ fail: denied });
  const h2 = harness({ vision: g.vision });
  await toClose(h2);
  h2.app.confirm();
  g.shutter();
  await flush(); await flush();
  h2.run(200);
  assert.equal(h2.app.view.close.phase, 'idle');
  assert.ok(h2.app.view.close.bubble.text.includes('权限'));
  assert.equal(g.log.prompts.length, 0);

  const h3 = harness();
  await toClose(h3);
  h3.app.confirm();
  assert.equal(h3.app.view.close.phase, 'idle', '宿主没有相机时不进入取景');
});

test('相机模块：getUserMedia → ImageCapture → 预热 → 无参 takePhoto，并停止视频轨', async () => {
  let clock = 0;
  const calls = [];
  const track = { stop() { calls.push('stop'); } };
  const root = {
    navigator: { mediaDevices: { getUserMedia: async c => { calls.push(['gum', c]); return { getVideoTracks: () => [track], getTracks: () => [track] }; } } },
    ImageCapture: class { constructor(t) { calls.push('ic'); } takePhoto(...args) { calls.push(['take', args.length, clock]); return Promise.resolve({ type: 'image/jpeg', arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer }); } },
    setTimeout: (fn, ms) => { clock += ms; fn(); },
    now: () => clock
  };
  const stages = [];
  const photo = await capturePhoto(null, { onStage: s => stages.push(s) }, null, root);
  assert.deepEqual(calls[0], ['gum', { video: true }]);
  const take = calls.find(c => Array.isArray(c) && c[0] === 'take');
  assert.equal(take[1], 0, 'takePhoto 只用无参形式');
  assert.ok(take[2] >= 2500, '预热 2.5 秒后再拍');
  assert.ok(calls.includes('stop'));
  assert.deepEqual(stages, ['stream', 'warmup', 'shutter']);
  assert.equal(photo.source, 'ImageCapture');
  assert.equal(bytesToBase64(new Uint8Array([255, 216, 255])), '/9j/');
  let current = true;
  const p2 = capturePhoto(null, { isCurrent: () => current, onStage: s => { if (s === 'warmup') current = false; } }, null, root);
  await assert.rejects(p2, e => e.name === 'AbortError');
});

// ---------------------------------------------------------- 旅行通话
async function toTripHome(h, returnAt = 1e15) {
  h.run(800);
  h.app.view.title.focus = 0;
  h.app.confirm();
  h.run(7400);
  h.run(1500);
  const v = h.app.view;
  assert.equal(v.screen, 'home');
  v.g.trip = { dest: 'market', food: 'onigiri', charm: null, leftAt: 0, returnAt, seed: 7, cards: [], calls: 0 };
  v.pet.present = false;
  v.pet.tp = null;
  h.run(200);
  assert.equal(v.dock[0].label, '通话', '旅行中呼唤变成通话');
  v.dockFocus = 0;
}

test('旅行通话：拨号后全息出现，可聊天和看看，挂断后她仍在旅行；每次旅行限 3 次', async () => {
  const f = fakeVision();
  const h = harness({ vision: f.vision });
  await toTripHome(h);
  const v = h.app.view;
  h.app.confirm();
  assert.equal(v.screen, 'close');
  assert.ok(v.close.call, '进入通话');
  assert.equal(v.g.trip.calls, 1);
  assert.deepEqual(v.dock.map(d => d.id), ['talk', 'look', 'hangup'], '通话中没有摸头、戳戳');
  h.run(2400);
  assert.ok(h.spoken.at(-1).includes('霓虹夜市'), '接通后招呼语带地点');
  // 聊天：提示词说明她在外地通话
  h.app.confirm();
  h.listenHandlers.onEnd('那边好玩吗');
  await flush(); await flush();
  h.run(200);
  assert.ok(h.systems.at(-1).includes('远程信标') && h.systems.at(-1).includes('霓虹夜市'));
  // 看看：识图提示词同样带通话状态
  v.dockFocus = 1;
  h.app.confirm();
  f.shutter();
  await flush(); await flush(); await flush();
  h.run(200);
  assert.ok(f.log.prompts[0].system.includes('远程信标'));
  assert.equal(v.close.phase, 'discover');
  h.run(500);
  assert.equal(h.app.back(), true);
  h.app.back();
  h.run(800);
  assert.equal(v.screen, 'home', '挂断回到主页');
  assert.equal(v.close.call, null);
  assert.equal(v.pet.present, false, '她还在旅行');
  assert.ok(v.g.trip);
  for (let i = 0; i < 2; i += 1) {
    v.dockFocus = 0;
    h.app.confirm();
    h.run(2200);
    h.app.back();
    h.run(800);
  }
  assert.equal(v.g.trip.calls, 3);
  v.dockFocus = 0;
  h.app.confirm();
  assert.equal(v.screen, 'home', '次数用完不再接通');
  assert.ok(v.toast.text.includes('能量用完'));
  assert.ok(Object.values(v.cache).some(e => e.strips && e.strips.length === 10), '通话用到的帧已切成全息横条');
});

test('旅行通话：通话中她到家会挂断并现身，超时信号飘走', async () => {
  const h = harness();
  await toTripHome(h);
  const v = h.app.view;
  h.app.confirm();
  h.run(2400);
  h.run(150000, 400);
  assert.ok(v.close.call && v.close.call.dropAt, '超时后信号飘走');
  h.run(3200);
  assert.equal(v.screen, 'home');
  assert.equal(v.pet.present, false);
  // 再打一通，期间旅行结束
  v.dockFocus = 0;
  h.app.confirm();
  h.run(2400);
  v.g.trip.returnAt = 0;
  h.run(400);
  assert.ok(v.close.call.returned);
  h.run(3600);
  assert.equal(v.screen === 'home' || v.screen === 'gift', true);
  assert.equal(v.pet.present, true, '回家后现身');
  h.run(3000);
  assert.equal(v.screen, 'gift', '落地后弹出礼物');
});

test('教程所有步骤可绘制', () => {
  const h = harness();
  h.run(800);
  h.app.confirm();
  for (let s = 0; s < 6; s += 1) {
    h.app.view.tut.step = s;
    h.app.view.tut.at = h.app.view.now;
    h.run(4000, 80);
  }
  assert.ok(h.screens.has('tutorial'));
});
