// 旅行肥鱼：规则、存档、离线结算与全画面冒烟测试（Node 内置 test）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Game from '../lib/game.js';
import { createApp, parseReply } from '../lib/app.js';
import { createDecoder, SPRITE_ORDER, REQUIRED, ALIAS, CARD_NAMES, CARD_SLOTS, STRIP_BANDS, SHEET } from '../lib/sprites.js';
import { drawPostcardScene } from '../lib/postcards.js';
import { SPRITES } from '../lib/sprite-data.js';
import { QBAN } from '../lib/qban-data.js';
import { capturePhoto, bytesToBase64 } from '../lib/camera.js';
import { discoverFrame } from '../lib/scenes.js';
import { DESTS, ITEMS, speechText, cardArtId, IDLE_MUTTER, AFFINITY, LINES, systemPrompt, touchLines, affinityMutter, affinityLevel } from '../lib/content.js';
import { createShakeDetector, qAxis, qMul } from '../lib/motion.js';
import { CORNERS } from '../lib/scenes.js';

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

test('浮光贝位置（0.8.13）：旧档换成原固定位置，新贝在活动范围内随机长，单颗捡起，满了捡掉一颗重新计时', () => {
  const old = Game.normalize({ v: 1, shells: { count: 3, lastAt: T0 } }, T0);
  assert.deepEqual(old.shells.spots, [{ x: 168, y: 58 }, { x: 312, y: 62 }, { x: 214, y: 250 }]);
  const v12 = Game.normalize({ v: 1, shells: { count: 2, lastAt: T0, spots: [3, 1] } }, T0);
  assert.deepEqual(v12.shells.spots, [{ x: 268, y: 246 }, { x: 312, y: 62 }], '0.8.12 的点位编号');
  const s = Game.newState(T0);
  s.shells = { count: 0, lastAt: T0 - 999 * MIN, spots: [] };
  Game.settle(s, T0, Game.makeRng(5));
  assert.equal(s.shells.spots.length, Game.SHELL_MAX);
  const [zone] = Game.SHELL_ZONES;
  for (const p of s.shells.spots) assert.ok(p.x >= zone.x[0] && p.x <= zone.x[1] && p.y >= zone.y[0] && p.y <= zone.y[1], JSON.stringify(p));
  const before = s.scales;
  const target = s.shells.spots[2];
  const got = Game.pickShell(s, { ...target }, T0, Game.makeRng(3));
  assert.ok(got >= 4 && got <= 8, '单颗 4–8 鳞光');
  assert.equal(s.scales, before + got);
  assert.equal(s.shells.count, 7);
  assert.equal(s.shells.lastAt, T0, '满了时捡掉一颗，从现在起重新计时');
  assert.equal(Game.pickShell(s, target, T0, Game.makeRng(3)), 0, '已捡走的捡不到');
  Game.settle(s, T0 + 21 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, 8);
  const again = Game.normalize(JSON.parse(JSON.stringify(s)), T0);
  assert.deepEqual(again.shells.spots, s.shells.spots, '位置随存档保存');
  Game.collectShells(s, T0, Game.makeRng(1));
  assert.deepEqual(s.shells.spots, []);
  // 随机分布：多次生长，左右上下都会出现，不是固定几个点
  const rng = Game.makeRng(9);
  const xs = [], ys = [];
  for (let i = 0; i < 200; i += 1) { const p = Game.randomShellSpot(rng, []); xs.push(p.x); ys.push(p.y); }
  assert.ok(Math.min(...xs) < 90 && Math.max(...xs) > 390 && Math.min(...ys) < 90 && Math.max(...ys) > 230);
  assert.ok(new Set(xs.map((x, i) => `${x},${ys[i]}`)).size > 150);
});

test('浮光贝离线生长并封顶', () => {
  const s = Game.newState(T0);
  s.shells = { count: 0, lastAt: T0 };
  Game.settle(s, T0 + 19 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, 0);
  Game.settle(s, T0 + 45 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, 2);
  Game.settle(s, T0 + 30 * 60 * MIN, Game.makeRng(1));
  assert.equal(s.shells.count, Game.SHELL_MAX);
  const got = Game.collectShells(s, T0 + 30 * 60 * MIN, Game.makeRng(2));
  assert.ok(got >= 4 * Game.SHELL_MAX && got <= 8 * Game.SHELL_MAX);
  assert.equal(s.shells.count, 0);
  // 收满后从收取时刻重新计时
  Game.settle(s, T0 + 30 * 60 * MIN + 19 * MIN, Game.makeRng(3));
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
  assert.ok(parseReply('长'.repeat(100)).text.length <= 72);
});

test('精灵数据尺寸与镜像解码', () => {
  const all = { ...SPRITES, ...QBAN };
  for (const name of Object.keys(all)) assert.equal(Buffer.from(all[name].d, 'base64').length, all[name].w * all[name].h, name);
  // 用户确认的 80 格 Q 版原画 + 识图指认 8 帧 + 0.8.0 批次 J/K 16 格、叉腰生气、信标流量图标，全部进入解码顺序
  assert.equal(Object.keys(QBAN).length, 102);   // 0.8.6 停用 6 个 pc_* 明信片动作帧；0.8.7 加升级仪式 bond_give / bond_shy
  for (const name of Object.keys(QBAN)) assert.ok(SPRITE_ORDER.includes(name), `未使用的帧：${name}`);
  assert.equal(new Set(SPRITE_ORDER).size, SPRITE_ORDER.length, '解码顺序无重复');
  // 带像素存储的假 Canvas：putImageData(image, x, y) 写进对应位置
  class FakeCanvas {
    constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
    getContext() {
      const self = this;
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData(image, x, y) { for (let r = 0; r < image.height; r += 1) self.data.set(image.data.subarray(r * image.width * 4, (r + 1) * image.width * 4), ((y + r) * self.w + x) * 4); },
        flush() {}
      };
    }
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
  const a = decoder.cache.side;
  const b = decoder.cache.sideL;
  const px = (e, x, y) => e.canvas.data[((e.sy + y) * e.canvas.w + e.sx + x) * 4 + 3];
  const w = QBAN.body_side.w;
  let lit = 0;
  for (let x = 0; x < w; x += 7) { assert.equal(px(a, x, 60), px(b, w - 1 - x, 60)); if (px(a, x, 60)) lit += 1; }
  assert.ok(lit > 3, '取样处有亮像素');
  // 小图块：Canvas 数远少于帧数（真机每个 Canvas 约 1.2 MB 原生内存），
  // 每块面积有上限（真机 drawImage 的耗时按源 Canvas 整块面积计），子图互不重叠
  assert.ok(decoder.canvases.length <= 60, `图块数 ${decoder.canvases.length}`);
  for (const c of decoder.canvases) {
    const big = SPRITE_ORDER.some(n => { const e = decoder.cache[n]; return e.canvas === c && (e.w > SHEET || e.h > SHEET); });
    if (!big) assert.ok(c.w <= SHEET && c.h <= SHEET, `图块 ${c.w}×${c.h}`);
  }
  const boxes = Object.values(decoder.cache).filter((e, i, all) => all.indexOf(e) === i);
  for (const e of boxes) assert.ok(e.sx >= 0 && e.sy >= 0 && e.sx + e.w <= e.canvas.w && e.sy + e.h <= e.canvas.h, e.name);
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const p = boxes[i];
    const q = boxes[j];
    if (p.canvas === q.canvas) assert.ok(p.sx + p.w <= q.sx || q.sx + q.w <= p.sx || p.sy + p.h <= q.sy || q.sy + q.h <= p.sy, `${p.name} 与 ${q.name} 重叠`);
  }
  // 通话横条只是压暗副本里的行范围，不再一条一个 Canvas
  const before = decoder.canvases.length;
  const bands = decoder.cache.bust_neutral.makeStrips();
  assert.equal(bands.length, STRIP_BANDS);
  assert.ok(decoder.canvases.length - before <= 1, '一帧压暗副本至多新开一个通话图块');
  assert.ok(bands.every(band => band.src.canvas.w <= SHEET && band.src.canvas.h <= SHEET));
  assert.ok(px(bands[0].src, 40, 0) <= px(decoder.cache.bust_neutral, 40, 0), '每 3 行压暗一行');
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
        // 真机上 drawImage 会乘上当前 fillStyle 的透明度：画精灵前 fillStyle 必须不透明（经 draw.js blit）
        if (key === 'drawImage' && /rgba\([^)]*,\s*(0?\.\d+|0)\)\s*$/.test(String(obj.fillStyle))) throw new Error(`drawImage 时 fillStyle 半透明：${obj.fillStyle}`);
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
function harness({ store = new Map(), voiceReply = '[惊讶]你来啦！', vision = null, log } = {}) {
  let clock = T0;
  const timers = [];
  class FakeCanvas { constructor(w, h) { this.w = w; this.h = h; } getContext() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, flush() {} }; } }
  const h = { listenHandlers: null, spoken: [], speaking: false, listenWhileSpeaking: 0, store, systems: [], prompts: [] };
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
    chat: { create: async system => { h.systems.push(system); return {}; }, prompt: async (session, text) => { h.prompts.push(text); return typeof voiceReply === 'function' ? voiceReply(text) : voiceReply; }, destroy() {} },
    vision,
    log,
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
  // 0.7.1 之前的存档：设置一次性回到默认（语音开、快速旅行关）；之后的切换照常保存
  const old = JSON.parse(JSON.stringify(quick));
  old.settings = { voice: false, fast: true };
  const moved = Game.normalize(old, T0);
  assert.deepEqual([moved.settings.voice, moved.settings.fast], [true, false]);
  moved.settings.voice = false;
  assert.equal(Game.normalize(JSON.parse(JSON.stringify(moved)), T0).settings.voice, false);
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
  assert.ok(speechText('长'.repeat(100)).length <= 80);
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
  app.view.dockFocus = app.view.dock.findIndex(d => d.id === 'call');
  app.confirm();
  run(1500);
  assert.equal(app.view.screen, 'close', '呼唤');
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
  h.run(60000, 200);
  assert.equal(h.app.view.close.phase, 'discover', '指认姿势一直保持，不自动回到半身');
  h.app.back();
  assert.equal(h.app.view.close.phase, 'idle', '双击先结束指认');
});

test('看看与聊天共享当次上下文：看到的东西进聊天，聊过的话进识图', async () => {
  const f = fakeVision();
  const h = harness({ vision: f.vision });
  await toClose(h);
  const talk = async text => {
    h.app.view.dockFocus = h.app.view.dock.findIndex(d => d.id === 'talk');
    h.app.confirm();
    h.run(200);
    h.listenHandlers.onEnd(text);
    await flush(); await flush();
    h.run(400);
  };
  await talk('我在找奶茶');
  assert.equal(h.prompts.length, 1);
  assert.ok(!h.prompts[0].includes('系统备注'), '刚建会话时状态在系统提示里，不重复');
  h.app.view.dockFocus = h.app.view.dock.findIndex(d => d.id === 'look');
  h.app.confirm();
  f.shutter();
  await flush(); await flush(); await flush();
  h.run(200);
  assert.ok(f.log.prompts[0].system.includes('我在找奶茶'), '识图提示带上刚才聊的话');
  h.app.back();
  await talk('它是什么颜色');
  const told = h.prompts.at(-1);
  assert.ok(told.includes('系统备注') && told.includes('杯子') && told.endsWith('它是什么颜色'), '看到的东西作为备注附在这句话前');
  await talk('好吧');
  assert.ok(!h.prompts.at(-1).includes('杯子'), '同一次看看只告诉一次');
  assert.equal(h.systems.length, 1, '一直是同一个聊天会话');
  h.app.view.g.affinity += 500;
  await talk('我们关系怎么样');
  assert.ok(h.prompts.at(-1).includes('游戏状态更新'), '状态变了就附上最新状态');
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
  assert.ok(v.toast.text.includes('信标流量'), '提示去商店买信标流量');
  assert.ok(Object.values(v.cache).some(e => e.strips && e.strips.length === 10), '通话用到的帧已切成全息横条');
  // 信标流量：免费次数用完后每次通话消耗一个
  v.g.stock.beacon = 1;
  h.run(400);
  v.dockFocus = 0;
  h.app.confirm();
  assert.equal(v.screen, 'close', '用信标流量接通');
  assert.equal(v.g.stock.beacon, 0);
  assert.equal(v.g.trip.calls, 3, '免费次数不再增加');
  h.run(2200);
  h.app.back();
  h.run(800);
  v.dockFocus = 0;
  h.app.confirm();
  assert.equal(v.screen, 'home', '信标流量也用完后不再接通');
});

test('商店：信标流量可购买，不能放进行囊，存档保留', () => {
  const s = Game.normalize({}, T0);
  s.scales = 100;
  assert.equal(Game.buy(s, 'beacon').ok, true);
  assert.equal(s.stock.beacon, 1);
  assert.equal(s.scales, 40);
  assert.equal(Game.togglePack(s, 'beacon', T0, Game.makeRng(1)).ok, false, '不进行囊');
  assert.equal(Game.normalize(JSON.parse(JSON.stringify(s)), T0).stock.beacon, 1);
  assert.equal(Game.useCall(s).reason, 'home', '在家不能通话');
  const h = harness();
  h.run(800);
  const v = h.app.view;
  v.screen = 'menu';
  v.menu = { kind: 'shop', focus: 0, detail: null };
  for (let i = 0; i < 5; i += 1) h.app.swipe(1);
  v.g.scales = 60;
  h.app.confirm();
  assert.equal(v.g.stock.beacon, 1, '商店第 6 项是信标流量');
  h.run(300);
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

test('纪念品图标与明信片插画：图标进后台解码，明信片按需 4 位解码，文案对应插画', () => {
  for (const dest of DESTS) for (const gift of dest.gifts) assert.ok(SPRITE_ORDER.includes('gift_' + gift.id), gift.id);
  assert.equal(CARD_NAMES.length, 18);
  for (const dest of DESTS) dest.lines.forEach((line, i) => assert.equal(cardArtId({ dest: dest.id, line }), `card_${dest.id}_${i + 1}`));
  assert.equal(cardArtId({ dest: 'harbor', line: '码头的风好大，帽子差点飞了。' }), 'card_harbor_2', '旧文案');
  assert.equal(cardArtId({ dest: 'moon', line: '不存在的话' }), null);
  class FakeCanvas { constructor(w, h) { this.w = w; this.h = h; } getContext() { const c = this; return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(img) { c.img = img; }, flush() {} }; } }
  const dec = createDecoder(FakeCanvas, value => Buffer.from(value, 'base64').toString('latin1'));
  while (!dec.step());
  assert.ok(dec.cache.gift_lantern, '图标已解码');
  assert.equal(dec.cache.card_moon_3, undefined, '明信片默认不解码');
  dec.want('card_moon_3');
  assert.equal(dec.finished, false);
  while (!dec.step());
  const art = dec.cache.card_moon_3;
  assert.equal(art.w, 408);
  assert.ok(art.canvas.img.data.some((value, i) => i % 4 === 3 && value > 200), '有亮像素');
  // 有插画时画插画并叠动效，所有卡的动效都只用白名单方法
  const stats = {};
  const ctx = fakeCtx(stats);
  // 明信片只占固定槽位：一口气想要全部 18 张，只解最近想要的几张，常驻不超过槽位数
  for (const name of CARD_NAMES) { dec.want(name); }
  while (!dec.step());
  const resident = CARD_NAMES.filter(name => dec.cache[name]);
  assert.ok(resident.length <= CARD_SLOTS, `常驻明信片 ${resident.length}`);
  for (const name of CARD_NAMES.slice(-3)) assert.ok(dec.cache[name], `最近想要的 ${name} 已解码`);
  // 逐张翻：每张都能解出来
  for (const name of CARD_NAMES) { dec.want(name); while (!dec.step()); assert.ok(dec.cache[name], name); }
  // 每张：解好后连续绘制，从黑底显影到全亮，动效只用白名单方法
  const alphas = [];
  const probe = new Proxy(ctx, { set(obj, key, value) { if (key === 'globalAlpha') alphas.push(value); obj[key] = value; return true; } });
  let t = T0;
  for (const dest of DESTS) dest.lines.forEach(line => {
    const card = { dest: dest.id, line, at: T0 };
    dec.want(cardArtId(card)); while (!dec.step());
    alphas.length = 0;
    for (let i = 0; i < 30; i += 1) { t += 40; drawPostcardScene(probe, card, 36, 36, 408, 184, t, dec.cache); }
    const fade = alphas.filter(a => a < 1);
    assert.ok(fade.length && fade[0] < 0.2, `${line} 从暗处显影`);
    t += 1000;   // 离开一会儿，再看要重新显影
  });
  assert.ok(stats.drawImage >= 18 * 30);
  // 插画还没解好：只画冲印扫描线和小字，不画任何精灵（旧的程序线稿已移除）
  const bare = {};
  const ctx2 = fakeCtx(bare);
  drawPostcardScene(ctx2, { dest: 'moon', line: DESTS[5].lines[0], at: T0 }, 36, 36, 408, 184, T0, {});
  assert.ok(!bare.drawImage, '未解码时不画旧线稿或精灵');
  assert.ok(bare.fillText >= 1);
});

test('明信片列表：进入和移动焦点就预先解码当前与前后各一张', () => {
  const h = harness();
  h.run(800);
  const v = h.app.view;
  v.g.postcards = DESTS.slice(0, 5).map((dest, i) => ({ dest: dest.id, at: T0 + i, line: dest.lines[0], pose: 'side', read: true }));
  v.screen = 'home';
  v.pet.tp = null;
  v.dockFocus = v.dock.findIndex(d => d.id === 'album');
  h.app.confirm();
  assert.equal(v.screen, 'menu');
  h.run(400);
  const cards = v.g.postcards.slice().reverse();
  for (const i of [0, 1, cards.length - 1]) assert.ok(v.cache[cardArtId(cards[i])], `第 ${i} 张已预解码`);
  h.app.swipe(1); h.app.swipe(1);
  h.run(400);
  assert.ok(v.cache[cardArtId(cards[3])], '移动焦点后预解码下一张');
});

// ---------------------------------------------------------------- 晃一晃（0.8.0）
const BASE_Q = qAxis([1, 0, 0], 90);   // 设备 -Z 朝前、水平（0.8.17 真机核对）
function flickQ(dir, ms, amp = 15, go = 110, back = 170) {
  const k = ms < 0 ? 0 : ms < go ? ms / go : ms < go + back ? 1 - (ms - go) / back : 0;
  const a = amp * k;
  const yaw = dir === 'left' ? a : dir === 'right' ? -a : 0;
  const pitch = dir === 'up' ? a : dir === 'down' ? -a : 0;
  return qMul(qAxis([1, 0, 0], pitch), qMul(qAxis([0, 0, 1], yaw), BASE_Q));
}

test('甩头识别：甩够就触发、不要求回正，回正不算反向；慢转头、走路颠簸不触发', () => {
  const run = (fn, ms = 1500) => {
    const d = createShakeDetector();
    const out = [];
    for (let t = 0; t <= ms; t += 33) { const e = d.feed(T0 + t, fn(t)); if (e) out.push(e.dir); }
    return out;
  };
  for (const dir of ['left', 'right', 'up', 'down']) assert.deepEqual(run(t => flickQ(dir, t - 700)), [dir], dir);
  const yawQ = deg => qMul(qAxis([0, 0, 1], deg), BASE_Q);
  assert.deepEqual(run(t => yawQ(Math.min(30, t / 40))), [], '慢慢转头');
  assert.deepEqual(run(t => yawQ(t < 200 ? 0 : Math.min(25, (t - 200) / 6))), ['left'], '甩过去停住也算');
  assert.deepEqual(run(t => flickQ('left', t - 200, 70, 300, 400)), ['left'], '大幅甩头只算一次，回正不算向右');
  // 回正之后再往右甩：过了反向保护时间就算
  assert.deepEqual(run(t => flickQ('left', t - 200)[0] !== undefined && t < 1600 ? flickQ('left', t - 200) : flickQ('right', t - 1600), 2500), ['left', 'right']);
  assert.deepEqual(run(t => qMul(qAxis([1, 0, 0], 3 * Math.sin(t / 1000 * 4 * Math.PI)), BASE_Q), 3000), [], '走路颠簸');
  // 冷却：紧接着的第二次甩不触发
  assert.deepEqual(run(t => flickQ('left', t < 600 ? t - 200 : t - 700)), ['left']);
  assert.equal(run(() => [0, 0, 0, 0]).length, 0, '无效四元数被忽略');
  // 0.8.9：轻甩 6° 也能触发（不用猛甩），四个方向一样；读数 57 次/秒时同样
  for (const dir of ['left', 'right', 'up', 'down']) assert.deepEqual(run(t => flickQ(dir, t - 700, 6, 120, 200)), [dir], `轻甩 ${dir}`);
  const fast = fn => { const d = createShakeDetector(); const out = []; for (let t = 0; t <= 1500; t += 17) { const e = d.feed(T0 + t, fn(t)); if (e) out.push(e.dir); } return out; };
  assert.deepEqual(fast(t => flickQ('up', t - 700, 7, 150, 200)), ['up'], '57Hz 轻甩');
  const both = (yaw, pitch) => qMul(qAxis([1, 0, 0], pitch), qMul(qAxis([0, 0, 1], yaw), BASE_Q));
  assert.deepEqual(fast(t => both(1.5 * Math.sin(t / 300), 4 * Math.sin(t / 1000 * 4 * Math.PI))), [], '走路时上下来回晃');
  assert.deepEqual(fast(t => both(Math.min(40, t / 45), 0)), [], '慢慢转头看东西');
});

test('甩头识别 0.8.10：上下门槛更低、一摆只判一次、每次尝试报一行、lean 跟头走', () => {
  const light = (dir, amp, go = 120) => {
    const d = createShakeDetector();
    const out = [];
    for (let t = 0; t <= 1500; t += 17) { const e = d.feed(T0 + t, flickQ(dir, t - 700, amp, go, 200)); if (e) out.push(e.dir); }
    return out;
  };
  for (const dir of ['up', 'down']) assert.deepEqual(light(dir, 5.5), [dir], `上下轻点 5.5° ${dir}（0.8.14 起按幅度，门槛 4.5°）`);
  for (const dir of ['up', 'down']) assert.deepEqual(light(dir, 3.5), [], `上下 3.5° 不触发 ${dir}`);
  assert.deepEqual(light('left', 5), ['left'], '左右 5°');
  assert.deepEqual(light('left', 3.5), [], '左右 3.5° 仍不触发：转头看东西不会误甩');
  // 走路颠簸 2–8°，上下门槛降低后仍不误触
  for (const a of [2, 3, 4, 6, 8]) {
    const d = createShakeDetector();
    let n = 0;
    for (let t = 0; t <= 3000; t += 33) if (d.feed(T0 + t, qMul(qAxis([1, 0, 0], a * Math.sin(t / 1000 * 4 * Math.PI)), BASE_Q))) n += 1;
    assert.ok(n <= (a === 2 ? 1 : 0), `走路上下 ±${a}°`);
  }
  const tries = [];
  const d = createShakeDetector({ trace: e => tries.push(e) });
  const leans = [];
  for (let t = 0; t <= 1500; t += 17) {
    d.feed(T0 + t, flickQ('left', t - 400, 8, 150, 300));
    if (t >= 500 && leans.length === 0) leans.push(d.lean().x);
  }
  leans.push(d.lean().x);
  assert.ok(tries.some(e => e.result === 'left' && e.axis === 'yaw' && e.peakY > 28), '触发那次报了峰值角速度');
  assert.ok(leans[0] > 2, '甩的途中 lean 朝左');
  assert.ok(Math.abs(leans[1]) < 0.5, '头停下 lean 回零');
});

test('甩头识别 0.8.11：同一毫秒成批送到的读数只跳过，不清零（真机 0.8.10 因此丢了大半甩头）', () => {
  const yawQ = deg => qMul(qAxis([0, 0, 1], deg), BASE_Q);
  const k = ms => ms < 0 ? 0 : ms < 120 ? ms / 120 : ms < 320 ? 1 - (ms - 120) / 200 : 0;
  for (const back of [0, 3]) {
    const res = [];
    const d = createShakeDetector({ trace: e => res.push(e.result) });
    let t = 0;
    for (let i = 1; t < 2000; i += 1) {
      const dup = i % 3 === 0;
      if (!dup) t += 30;
      d.feed(T0 + t - (dup ? back : 0), yawQ(7 * k(t - 800)));
    }
    assert.deepEqual(res, ['left'], `每 3 条有 1 条同毫秒/略早（${back} ms）`);
  }
});

test('甩头识别 0.8.14：上下按幅度判定，抬一下头/点一下头就触发，不看快慢；回正、慢慢看东西、走路晃不触发', () => {
  const pitchQ = deg => qMul(qAxis([1, 0, 0], deg), BASE_Q);
  const both = (yaw, pitch) => qMul(qAxis([1, 0, 0], pitch), qMul(qAxis([0, 0, 1], yaw), BASE_Q));
  const run = (fn, ms = 3000, step = 17, trace) => {
    const d = createShakeDetector({ trace });
    const out = [];
    for (let t = 0; t <= ms; t += step) { const e = d.feed(T0 + t, fn(t)); if (e) out.push(e.dir); }
    return out;
  };
  // 从 400 ms 起用 go 毫秒偏到 amp 度，停 hold 毫秒，再用 back 毫秒回正
  const move = (amp, go, hold = 300, back = 300) => t => {
    const m = t - 800;
    const k = m < 0 ? 0 : m < go ? m / go : m < go + hold ? 1 : m < go + hold + back ? 1 - (m - go - hold) / back : 0;
    return amp * k;
  };
  for (const [amp, go] of [[6, 150], [6, 300], [8, 250], [12, 400], [5, 180]]) {
    assert.deepEqual(run(t => pitchQ(move(amp, go)(t))), ['up'], `抬头 ${amp}° 用 ${go} ms`);
    assert.deepEqual(run(t => pitchQ(move(-amp, go)(t))), ['down'], `点头 ${amp}° 用 ${go} ms`);
  }
  // 平均才 15–20°/s 的轻抬，0.8.13 的角速度门槛（起算 20°/s）抓不到，现在按幅度能触发
  assert.deepEqual(run(t => pitchQ(move(6, 350)(t))), ['up'], '慢一点的轻抬');
  // 抬上去停 2 秒再放下：放下不算向下
  assert.deepEqual(run(t => pitchQ(move(8, 200, 2000, 400)(t)), 4000), ['up']);
  // 连着点两次头（中间回正）都算
  assert.deepEqual(run(t => pitchQ(move(-7, 180, 200, 250)(t) + move(-7, 180, 200, 250)(t - 1500)), 3500), ['down', 'down']);
  // 慢慢低头看东西：30° 用 5 秒
  assert.deepEqual(run(t => pitchQ(-Math.min(30, t / 167)), 6000), [], '慢慢低头');
  // 走路上下晃（2 Hz、±2–8°），30 Hz 和 57 Hz 都不误触
  for (const a of [2, 3, 4, 6, 8]) for (const step of [17, 33]) {
    assert.deepEqual(run(t => both(1.5 * Math.sin(t / 300), a * Math.sin(t / 1000 * 4 * Math.PI)), 4000, step), [], `走路 ±${a}° 每 ${step} ms`);
  }
  // 左右甩不带出上下，斜着转头不判上下
  assert.deepEqual(run(t => flickQ('left', t - 400, 10, 120, 200)), ['left']);
  assert.deepEqual(run(t => both(move(12, 200)(t), move(6, 200)(t))), ['left'], '斜向以左右为主');
  // 每次上下尝试报一行
  const tries = [];
  run(t => pitchQ(move(6, 200)(t)), 3000, 17, e => tries.push(e));
  assert.ok(tries.some(e => e.axis === 'pitch' && e.result === 'up' && e.ep >= 4.5));
});

test('甩头识别 0.8.15：点头前往反方向带一下的小起势不算晃动（真机 0.8.14 大半快速点头被判 swing）', () => {
  const pitchQ = deg => qMul(qAxis([1, 0, 0], deg), BASE_Q);
  // 真机约 33 次/秒、点头峰值 100–300°/s：先往反方向带 wind 度，再 go 毫秒点到 amp 度，回正
  const nod = (amp, wind, go) => t => {
    const m = t - 1000;
    if (m < -120) return 0;
    if (m < 0) return wind * Math.sin((m + 120) / 120 * Math.PI / 2);
    const k = m < go ? m / go : m < go + 150 ? 1 : m < go + 400 ? 1 - (m - go - 150) / 250 : 0;
    return wind * Math.max(0, 1 - m / go) + amp * k;
  };
  for (const [amp, wind, go] of [[-15, 2.5, 60], [-10, 3, 80], [12, -2.5, 70], [8, -2, 100], [-6, 1.5, 120]]) {
    const tries = [];
    const d = createShakeDetector({ trace: e => tries.push(e.result) });
    const out = [];
    for (let t = 0; t <= 3000; t += 30) { const e = d.feed(T0 + t, pitchQ(nod(amp, wind, go)(t))); if (e) out.push(e.dir); }
    assert.deepEqual(out, [amp > 0 ? 'up' : 'down'], `${amp}° 起势 ${wind}° ${go} ms：${tries.join(',')}`);
  }
  // 每 1.5 秒连点三次（同向、带起势）都算
  const d = createShakeDetector();
  const out = [];
  for (let t = 0; t <= 6000; t += 30) {
    const p = nod(-10, 2, 70)(t) + nod(-10, 2, 70)(t - 1500) + nod(-10, 2, 70)(t - 3000);
    const e = d.feed(T0 + t, pitchQ(p)); if (e) out.push(e.dir);
  }
  assert.deepEqual(out, ['down', 'down', 'down']);
});

test('甩头识别 0.8.16：又大又快的点头（≥10°、0.3 秒内）不做晃动检查；一个来回取第一下；走路和慢低头仍不触发', () => {
  const pitchQ = deg => qMul(qAxis([1, 0, 0], deg), BASE_Q);
  const run = (fn, ms, step = 33) => {
    const tries = [];
    const d = createShakeDetector({ trace: e => tries.push(e) });
    const out = [];
    for (let t = 0; t <= ms; t += step) { const e = d.feed(T0 + t, pitchQ(fn(t))); if (e) out.push(e.dir); }
    return { out, tries };
  };
  // 真机 0.8.15：17–39° 的点头多被判 swing。这里点头前 0.6 秒头先上下晃过一下（±2.8°，0.8.15 的周期晃动规则会拒）
  const nod = (amp, go) => t => {
    if (t >= 400 && t < 1000) return 2.8 * Math.sin((t - 400) / 600 * 2 * Math.PI);
    const m = t - 1000;
    if (m < 0) return 0;
    return amp * (m < go ? m / go : m < go + 150 ? 1 : m < go + 400 ? 1 - (m - go - 150) / 250 : 0);
  };
  for (const [amp, go] of [[-20, 80], [25, 100], [-35, 120], [17, 60], [-12, 70], [11, 90]]) {
    const r = run(nod(amp, go), 3000);
    assert.deepEqual(r.out, [amp > 0 ? 'up' : 'down'], `${amp}° ${go} ms：${r.tries.map(e => e.result).join(',')}`);
    assert.ok(r.tries.some(e => e.big === 1 && Array.isArray(e.raw) && e.raw.length > 3), `${amp}° 走快速大点头路径并附原始仰角`);
  }
  // 同样晃过之后的 7° 小点头仍按晃动拒掉（小幅的规则不变）
  assert.deepEqual(run(nod(-7, 80), 3000).out, []);
  // 一个来回点头（±25°，0.7 秒）：只算第一下；回来那一下按回正忽略
  for (const a of [25, -25]) {
    const yesYes = t => (t < 1000 || t > 1700) ? 0 : a * Math.sin((t - 1000) / 700 * 2 * Math.PI);
    assert.deepEqual(run(yesYes, 4000).out, [a > 0 ? 'up' : 'down']);
  }
  // 慢慢低头 30°（每秒 6°）不算
  assert.deepEqual(run(t => -Math.min(30, Math.max(0, t - 1000) / 167), 7000).out, []);
  // 走路上下晃 ±10°、2 Hz，30 Hz 和 57 Hz 都不误触
  for (const step of [17, 33]) assert.deepEqual(run(t => 10 * Math.sin(t / 1000 * 4 * Math.PI), 6000, step).out, []);
});

test('甩头识别 0.8.17：眼镜 +Z 朝向佩戴者——+Z 往上翻（低头）算向下（真机 0.8.16 与系统点头事件对照）', () => {
  // 只用设备坐标描述：水平时 -Z 指北；低头时 -Z 朝下、+Z 朝上
  const level = qAxis([1, 0, 0], 90);
  const dz = q => { const v = [0, 0, -1]; const [x, y, z, w] = q; const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]; return v[2] + w * t[2] + (x * t[1] - y * t[0]); };
  assert.ok(Math.abs(dz(level)) < 1e-9, '水平时 -Z 不朝上下');
  const d = createShakeDetector();
  const out = [];
  for (let t = 0; t <= 2000; t += 33) {
    const deg = t < 1000 ? 0 : -Math.min(20, (t - 1000) / 5);   // 0.1 秒低头 20°
    const q = qMul(qAxis([1, 0, 0], deg), level);
    if (t === 2000) assert.ok(dz(q) < -0.3, '低头后 -Z 朝下');
    const e = d.feed(T0 + t, q); if (e) out.push(e.dir);
  }
  assert.deepEqual(out, ['down']);
});

test('甩头识别 0.8.18：越过原位又大又快算反方向；前一个动作的回程不算晃动；斜着转头不再延迟补判（真机 0.8.17 日志）', () => {
  const both = (yaw, pitch) => qMul(qAxis([1, 0, 0], pitch), qMul(qAxis([0, 0, 1], yaw), BASE_Q));
  const seg = pts => t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, va] = pts[i - 1]; const [b, vb] = pts[i]; return va + (vb - va) * (t - a) / (b - a); }
    return pts[pts.length - 1][1];
  };
  const run = (pitchFn, yawFn = () => 0, ms = 7000) => {
    const tries = [];
    const d = createShakeDetector({ trace: e => { if (e.axis === 'pitch') tries.push(e.result + (e.cross ? '·cross' : '')); } });
    const out = [];
    for (let t = 0; t <= ms; t += 33) { const e = d.feed(T0 + t, both(yawFn(t), pitchFn(t))); if (e) out.push(e.dir); }
    return { out, tries: tries.join(' ') };
  };
  const check = (pts, want, msg) => { const r = run(seg(pts)); assert.deepEqual(r.out, want, `${msg}：${r.tries}`); return r; };
  // ① 低头后停在下面 1.5 秒，再快速越过原位抬到 +20°：算向上（真机 16:58:29）
  assert.match(check([[0, 0], [1000, 0], [1080, -8], [1200, -11], [2700, -11], [2850, 0], [2950, 20], [3300, 20], [3600, 0]], ['down', 'up'], '越过原位抬头').tries, /up·cross/);
  // 同样停住后回正、顺势抬过 5°：不算
  check([[0, 0], [1000, 0], [1080, -8], [1200, -11], [2700, -11], [3000, 0], [3200, 5], [3800, 5], [4200, 0]], ['down'], '回正抬过头');
  // 抬头后 0.6 秒内就越过原位低下去：按回正忽略，一个来回只算第一下
  check([[0, 0], [1000, 0], [1100, 12], [1300, 12], [1450, 0], [1550, -12], [1900, -12], [2200, 0]], ['up'], '一个来回');
  // ② 低头、回正时冲过 2.7°、紧接着再低头 17°：两次都算（真机 16:57:54，0.8.17 判 swing）
  check([[0, 0], [1000, 0], [1080, -10], [1500, -10], [1800, 2.7], [2000, 2.5], [2300, -17], [2600, -17], [2900, 0]], ['down', 'down'], '回程后再点头');
  // ③ 向左甩时带抬头 7°，停住后慢慢转回、俯仰保持：只算向左，不再在转回来时补判向上（真机 16:58:54，ms 3658）
  const yawT = seg([[0, 0], [1000, 0], [1150, 30], [3500, 30], [5500, 0]]);
  const r = run(seg([[0, 0], [1000, 0], [1150, 7]]), yawT);
  assert.deepEqual(r.out, ['left'], r.tries);
  assert.match(r.tries, /turn/);
  // 走路 ±10–15°（停不稳，不算越过原位）仍不误触
  for (const a of [10, 15]) assert.deepEqual(run(t => a * Math.sin(t / 1000 * 4 * Math.PI)).out, [], `走路 ±${a}°`);
});

function homeHarness(store, log) {
  const h = harness({ store, log });
  h.run(800);
  h.app.view.title.focus = 0;
  h.app.confirm();
  h.run(7400);
  assert.equal(h.app.view.screen, 'home');
  h.run(2000);
  const pet = h.app.view.pet;
  // 停在待机、没有传送
  pet.tp = null; pet.act = 'idle'; pet.actUntil = h.app.view.now + 600000;
  h.flick = (dir, lead = 700) => {
    // 真机读数是连续的：先给一段静止读数再甩（0.8.14 上下判定要先攒 600 ms 基准）；接着上一下连续甩时 lead 给 0
    for (let t = -lead; t < 600; t += 33) { h.step(33); h.app.motion(h.app.view.now, flickQ(dir, t - 100)); }
  };
  return h;
}

test('晃一晃：甩向相邻停靠点，边上撞墙弹回，8 秒内连甩五次会晕再生气，期间不响应', () => {
  const h = homeHarness();
  const { app, run } = h;
  const v = app.view;
  assert.equal(app.wantsMotion(), true);
  v.pet.corner = 3;   // 右下
  h.flick('left');
  assert.equal(v.pet.tp && v.pet.tp.kind, 'shake');
  assert.deepEqual([v.pet.tp.dir, v.pet.tp.to, v.pet.tp.bump], ['left', 5, false]);
  run(900);
  assert.equal(v.pet.corner, 5, '到了下中');
  assert.equal(v.pet.tp, null);
  h.flick('up');
  run(100);
  assert.equal(v.pet.tp.to, 4, '到了上中');
  run(900);
  assert.equal(v.pet.corner, 4);
  h.flick('up');
  run(400);
  assert.ok(v.pet.tp.bump, '最上面再往上：撞墙');
  assert.equal(v.pet.tp.to, 4);
  assert.ok(!v.pet.dizzyNext, '0.8.16：8 秒内第 3 次还不晕');
  h.flick('right', 200);
  run(400);
  assert.ok(!v.pet.dizzyNext, '第 4 次还不晕');
  run(400);
  h.flick('right', 200);
  run(400);
  assert.ok(v.pet.dizzyNext, '8 秒内第 5 次（撞墙也算）');
  run(1200);
  assert.equal(v.pet.act, 'dizzy');
  h.flick('left');
  assert.equal(v.pet.tp, null, '晕的时候甩不动');
  run(3200);
  assert.equal(v.pet.act, 'pout');
  run(3000);
  assert.notEqual(v.pet.act, 'pout');
  assert.ok(CORNERS[v.pet.corner]);
  for (const w of [IDLE_MUTTER.shake, IDLE_MUTTER.bump, IDLE_MUTTER.dizzy, IDLE_MUTTER.pout]) assert.ok(w.length);
});

test('晃一晃：上下甩立即生效（0.8.9 不再响应点头）；离开首页或关闭设置后不要传感器', () => {
  const h = homeHarness();
  const { app, run } = h;
  const v = app.view;
  v.pet.corner = 0;
  // 读数刚开始先给 700 毫秒静止读数（0.8.14 上下判定要先攒 600 ms 基准）
  for (let t = -700; t < 330; t += 33) { h.step(33); app.motion(v.now, flickQ('down', t - 60)); }
  assert.equal(v.pet.tp && v.pet.tp.kind, 'shake', '下甩直接移动');
  assert.equal(v.pet.tp.to, 2, '左上 → 左下');
  assert.equal(app.nod, undefined, '没有点头入口');
  run(1500);
  v.dockFocus = v.dock.findIndex(d => d.id === 'call');
  app.confirm();
  run(1500);
  assert.equal(v.screen, 'close');
  assert.equal(app.wantsMotion(), false, '近景不需要传感器');
  app.back();
  run(1500);
  assert.equal(v.screen, 'home');
  v.g.settings.motion = false;
  assert.equal(app.wantsMotion(), false);
  assert.equal(Game.normalize(JSON.parse(JSON.stringify(v.g)), T0).settings.motion, false, '关闭会保存');
  assert.equal(Game.normalize({}, T0).settings.motion, true, '默认打开');
});

test('晃一晃 0.8.10：飞行途中再甩一下，落地接着飞；转头时她跟着偏，停下弹回', () => {
  const logs = [];
  const h = homeHarness(undefined, (...a) => logs.push(a.join(' ')));
  const { app, run } = h;
  const v = app.view;
  v.pet.corner = 3;   // 右下
  h.flick('left');
  assert.equal(v.pet.tp && v.pet.tp.to, 5, '第一下：右下 → 下中');
  h.flick('left', 300);
  assert.ok(logs.includes('shake held left'), '飞行途中的第二下先记着');
  assert.ok(logs.includes('shake queued left'), '落地后接着执行');
  assert.equal(v.pet.tp && v.pet.tp.kind, 'shake');
  assert.deepEqual([v.pet.tp.from, v.pet.tp.to], [5, 2], '落地后接着飞到左下');
  assert.equal(v.imu.queued, null);
  assert.ok(logs.some(l => l.startsWith('shake try ') && l.includes('"result":"left"')), '每次尝试有一行日志');
  run(1500);
  assert.equal(v.pet.corner, 2);
  // 慢慢转头（不触发移动）：她往同侧偏几像素，头停下回到原位
  v.pet.act = 'idle'; v.pet.actUntil = v.now + 600000;
  const yawQ = deg => qMul(qAxis([0, 0, 1], deg), BASE_Q);
  for (let t = 0; t < 400; t += 33) { h.step(33); app.motion(v.now, yawQ(t / 60)); }
  assert.equal(v.pet.tp, null, '慢转头不移动');
  assert.ok(v.imu.leanDraw.x < -1, '头往左，她往左偏');
  assert.ok(v.imu.leanDraw.x >= -8, '偏移有上限');
  for (let t = 0; t < 1200; t += 33) { h.step(33); app.motion(v.now, yawQ(400 / 60)); }
  assert.ok(Math.abs(v.imu.leanDraw.x) < 0.5, '停下弹回');
});

test('晃一晃 0.8.12：甩飞途中碰到浮光贝顺手捡起；换位到下中也会捡', () => {
  const h = homeHarness();
  const { app, run } = h;
  const v = app.view;
  const P = [{ x: 168, y: 58 }, { x: 312, y: 62 }, { x: 214, y: 250 }, { x: 268, y: 246 }];
  v.g.shells = { count: 4, lastAt: v.now, spots: P.map(p => ({ ...p })) };
  const scales = v.g.scales;
  v.pet.corner = 0;   // 左上
  h.flick('right');
  run(1500);
  assert.equal(v.pet.corner, 4, '飞到上中');
  assert.deepEqual(v.g.shells.spots, P.slice(1), '路过左上方的那颗被捡起');
  assert.ok(v.g.scales > scales);
  assert.ok(v.toast && v.toast.text.includes('顺手捡到浮光贝'));
  assert.ok(v.shellPops.some(p => p.spot.x === 168), '有捡起的光圈');
  assert.ok(v.dock.some(d => d.label === '拾贝×3'), '底栏数量跟着变');
  // 自己换位到下中，脚边两颗都捡到
  v.pet.tp = { kind: 'move', from: 4, to: 5, at: v.now };
  run(1500);
  assert.deepEqual(v.g.shells.spots, [P[1]]);
  // 停在别的角落碰不到
  v.pet.tp = null; v.pet.corner = 1; v.pet.act = 'idle'; v.pet.actUntil = v.now + 600000;
  run(400);
  assert.deepEqual(v.g.shells.spots, [P[1]]);
});

test('浮光贝 0.8.13：随机位置，长在她身上当场捡；上排、下排横向甩飞路过的都能捡到', () => {
  const h = homeHarness();
  const { app, run } = h;
  const v = app.view;
  const onHer = { x: 90, y: 120 }, top = { x: 330, y: 100 }, bottom = { x: 150, y: 236 }, far = { x: 430, y: 258 };
  v.pet.corner = 0; v.pet.act = 'idle'; v.pet.actUntil = v.now + 600000;
  v.g.shells = { count: 4, lastAt: v.now, spots: [onHer, top, bottom, far].map(p => ({ ...p })) };
  run(100);
  assert.deepEqual(v.g.shells.spots, [top, bottom, far], '长在她身上的那颗当场捡起');
  v.pet.corner = 1;   // 右上 → 上中
  h.flick('left');
  run(1500);
  assert.equal(v.pet.corner, 4);
  assert.deepEqual(v.g.shells.spots, [bottom, far]);
  v.pet.corner = 2; v.pet.act = 'idle'; v.pet.actUntil = v.now + 600000;   // 左下 → 下中
  run(1600);
  h.flick('right');
  run(1500);
  assert.equal(v.pet.corner, 5);
  assert.deepEqual(v.g.shells.spots, [far]);
  assert.ok(v.dock.some(d => d.label === '拾贝×1'));
});

test('首页新待机：每个动作和每种甩法都能在 6 个停靠点绘制', () => {
  const h = homeHarness();
  const { app, step, stats } = h;
  const v = app.view;
  v.g.postcards.push({ dest: DESTS[0].id, line: 0, at: T0 });
  const acts = ['wave', 'snack', 'proud', 'oops', 'stretch', 'bubble', 'fish', 'read', 'comb', 'sneeze', 'postcard', 'dizzy', 'pout'];
  for (let corner = 0; corner < CORNERS.length; corner += 1) {
    for (const act of acts) {
      v.pet.corner = corner; v.pet.tp = null; v.pet.act = act; v.pet.actAt = v.now; v.pet.actUntil = v.now + 600000;
      for (let i = 0; i < 40; i += 1) step(160);
    }
    for (const dir of ['left', 'right', 'up', 'down']) {
      v.pet.tp = { kind: 'shake', from: corner, to: corner, dir, bump: true, at: v.now };
      for (let i = 0; i < 30; i += 1) step(40);
      v.pet.tp = { kind: 'shake', from: corner, to: (corner + 1) % CORNERS.length, dir, bump: false, at: v.now };
      for (let i = 0; i < 30; i += 1) step(40);
    }
  }
  assert.ok(stats.drawImage > 1000);
  // 随机池：17 种待机都可能出现（postcard 需要有明信片）
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) { v.pet.actUntil = v.now; v.pet.actsHere = 0; v.pet.tp = null; v.pet.corner = 0; step(40); seen.add(v.pet.act); }
  for (const act of ['idle', 'gaze', 'play', 'doze', 'hum', 'stroll', ...acts.slice(0, 11)]) assert.ok(seen.has(act), act);
});

test('亲密度：口吻、摸头戳戳台词、碎碎念随等级增加', () => {
  assert.deepEqual([0, 11, 12, 35, 36, 79, 80, 9999].map(affinityLevel), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.ok(systemPrompt('状态', 0).includes('初识') && systemPrompt('状态', 0).includes('怕生'));
  assert.ok(systemPrompt('状态', 90).includes('挚友'));
  for (const kind of ['pat', 'poke']) {
    const counts = [0, 12, 36, 80].map(value => touchLines(kind, value).length);
    assert.equal(counts[0], LINES[kind].length, '初识只有基础台词');
    for (let i = 1; i < counts.length; i += 1) assert.ok(counts[i] > counts[i - 1], `${kind} 每升一级都多几句`);
    assert.ok(touchLines(kind, 80).every(line => line.length <= 16), '台词放得进气泡');
  }
  assert.equal(affinityMutter(0).length, 0);
  assert.ok(affinityMutter(80).length > affinityMutter(12).length);
});

test('亲密度存档：旧档没有 bond 时从 0 开始，信物计入图鉴', () => {
  const old = Game.normalize({ v: 1, affinity: 50, souvenirs: { ribbon: 4, lantern: 1 } }, T0);
  assert.equal(old.bond, 0);
  assert.equal(Game.bondDue(old), 1, '已经到亲近：从熟悉开始补办');
  assert.equal(old.souvenirs.ribbon, 4, '读档不改数量');
  assert.equal(Game.normalize({ v: 1, bond: 99 }, T0).bond, AFFINITY.length - 1);
  assert.equal(Game.totalGifts(), 21);
  const s = Game.newState(T0);
  assert.equal(Game.bondDue(s), 0, '新档不办仪式');
  s.affinity = 12;
  const got = Game.claimBond(s);
  assert.equal(got.level, 1);
  assert.equal(s.souvenirs.ribbon, 1);
  assert.equal(Game.claimBond(s), null, '同一级只送一次');
  assert.equal(Game.collected(s), 1);
});

test('亲密度升级仪式：回到主页时依次补办，收下后进图鉴，不动鳞光', async () => {
  const h = homeHarness();
  const v = h.app.view;
  const scales = v.g.scales;
  while (!h.app.view.cache.bond_shy) h.run(200);   // 等后台解完仪式帧
  v.g.affinity = 40;
  h.run(400);
  assert.equal(v.screen, 'gift');
  for (const id of ['gift_ribbon', 'gift_badge', 'gift_letter', 'bond_give', 'bond_shy']) assert.ok(v.cache[id], `${id} 已解码`);
  assert.equal(v.giftView.bond, 1);
  assert.equal(h.spoken.at(-1), AFFINITY[1].up);
  h.run(1000);
  h.app.confirm();
  assert.equal(v.screen, 'home');
  assert.equal(v.g.bond, 1);
  assert.equal(v.g.souvenirs.ribbon, 1);
  h.run(400);
  assert.equal(v.screen, 'gift', '还差一级，接着办');
  assert.equal(v.giftView.bond, 2);
  h.run(1000);
  h.app.confirm();
  h.run(2000);
  assert.equal(v.screen, 'home', '办完不再弹出');
  assert.equal(v.g.souvenirs.badge, 1);
  assert.equal(v.g.scales, scales, '仪式不给也不扣鳞光');
  // 图鉴第七行可绘制、可打开详情
  v.screen = 'menu';
  v.menu = { kind: 'dex', focus: 18, detail: null };
  h.run(80);
  h.app.confirm();
  h.run(300);
  assert.ok(v.menu.detail);
  v.menu.focus = 20;
  h.run(80);
  assert.ok(h.screens.has('gift') && h.screens.has('menu'));
});

// ---------------------------------------------------------------- 回忆（0.8.9）
test('回忆：模型标签记下、过滤隐私、去重、上限，忘记与清空；进提示词和存档', () => {
  const s = Game.newState(T0);
  const r = parseReply('[开心]好呀，记住啦！[记住：你喜欢猫]');
  assert.equal(r.text, '好呀，记住啦！');
  assert.equal(r.mood, 'happy');
  assert.deepEqual(r.memo.remember, ['你喜欢猫']);
  assert.equal(parseReply('[开心]嗯').memo, undefined, '没有标签不带 memo');
  assert.equal(Game.remember(s, '你喜欢猫', T0), '你喜欢猫');
  assert.equal(Game.remember(s, '你的手机号是13800138000', T0), null, '号码不记');
  assert.equal(Game.remember(s, '你家地址在幸福路', T0), null, '地址不记');
  Game.remember(s, '你喜欢猫和狗', T0 + 1);
  assert.deepEqual(Game.memoryTexts(s), ['你喜欢猫和狗'], '互相包含的旧条目被替换');
  for (let i = 0; i < 8; i += 1) Game.remember(s, `爱好${i}号`, T0 + 2 + i);
  assert.equal(s.memory.length, Game.MEMORY_MAX);
  assert.equal(Game.forget(s, '爱好7'), 1);
  const saved = Game.normalize(JSON.parse(JSON.stringify(s)), T0);
  assert.deepEqual(Game.memoryTexts(saved), Game.memoryTexts(s), '存档往返');
  assert.equal(Game.normalize({}, T0).memory.length, 0, '旧档没有回忆');
  assert.ok(systemPrompt('状态', 0, ['你喜欢猫']).includes('你喜欢猫'));
  assert.ok(!systemPrompt('状态', 0, []).includes('你记得关于用户的事'));
  assert.equal(Game.forget(s, '全部'), Game.MEMORY_MAX - 1);
  assert.equal(s.memory.length, 0);
});

test('回忆：聊天回复里的标签生效并提示；本地兜底台词不进上下文；旅行剩余时间只给粗档', async () => {
  const f = fakeVision();
  const h = harness({ vision: f.vision, voiceReply: text => text.includes('吉他') ? '[开心]知道啦[记住：你在学吉他]' : '' });
  await toClose(h);
  const v = h.app.view;
  const talk = async text => {
    v.dockFocus = v.dock.findIndex(d => d.id === 'talk');
    h.app.confirm();
    h.run(200);
    h.listenHandlers.onEnd(text);
    await flush(); await flush();
    h.run(400);
  };
  await talk('我最近在学吉他');
  assert.deepEqual(Game.memoryTexts(v.g), ['你在学吉他']);
  assert.ok(v.toast && v.toast.text.includes('你在学吉他'), '提示她记住了');
  assert.ok(!v.close.bubble.text.includes('记住'), '标签不显示');
  await talk('随便说说');
  v.dockFocus = v.dock.findIndex(d => d.id === 'look');
  h.app.confirm();
  f.shutter();
  await flush(); await flush(); await flush();
  h.run(200);
  const sys = f.log.prompts[0].system;
  assert.ok(sys.includes('我最近在学吉他') && !sys.includes('随便说说'), '模型失败时的本地台词不当成上下文');
  assert.ok(sys.includes('你在学吉他'), '识图也带上回忆');
  assert.equal(Game.roughSpan(3 * 60000), '一会儿');
  assert.equal(Game.roughSpan(70 * 60000), '一小时左右');
  v.g.trip = { dest: DESTS[0].id, returnAt: T0 + 25 * 60000 };
  assert.equal(Game.statusLine(v.g, T0), Game.statusLine(v.g, T0 + 60000), '一分钟后状态不变');
});

test('回忆：首页设置里连点两下才清除，单点只提示', () => {
  const h = harness();
  h.run(800);
  const v = h.app.view;
  Game.remember(v.g, '你喜欢猫', T0);
  v.title.panel = { focus: 3, at: v.now, closeAt: 0, flipAt: 0 };
  h.app.confirm();
  h.run(100);
  assert.equal(v.g.memory.length, 1, '第一下只提示');
  h.app.confirm();
  assert.equal(v.g.memory.length, 0, '3 秒内第二下清除');
  assert.equal(Game.normalize(JSON.parse(h.store.get(Game.SAVE_KEY)), T0).memory.length, 0, '已存档');
  Game.remember(v.g, '你喜欢狗', T0);
  h.app.confirm();
  h.run(3500);
  h.app.confirm();
  assert.equal(v.g.memory.length, 1, '隔太久重新计');
});
