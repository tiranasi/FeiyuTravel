// 把单通道亮度精灵逐块解码进离屏 Canvas 图集。真机已验证：new Canvas + putImageData + drawImage(缓存Canvas) 不闪。
// 来源：sprite-data.js（首页成年全息线稿 holo）与 qban-data.js（用户确认的黑底绿色 Q 版原画，tools-art/qban.py 生成）。
import { SPRITES } from './sprite-data.js';
import { QBAN } from './qban-data.js';
import { GIFT_ART } from './gift-data.js';
import { CARDS } from './card-data.js';

const SOURCE = { ...SPRITES, ...QBAN, ...GIFT_ART };

// 旧名字 → 新原画。场景代码里仍可用 front/side/back/smug… 这些短名。
export const ALIAS = {
  front: 'body_front', side: 'body_side', back: 'body_back',
  smug: 'bust_smug', wow: 'bust_wow', pout: 'bust_pout', think: 'bust_think'
};

// 进入游戏前必须解码完的帧；其余在游戏中后台继续解码，未就绪时场景回退到基础帧。
export const REQUIRED = ['holo', 'body_front', 'body_side', 'body_sideL', 'body_back', 'bust_neutral', 'bust_smug', 'bust_wow', 'bust_pout', 'bust_think'];
// 以 L 结尾且原表里没有的名字 = 运行时水平镜像，不依赖 ctx.scale。
const LATER = [
  'idle_blink', 'idle_breath', 'idle_tail_up', 'idle_tail_down', 'idle_ahoge', 'idle_look_side',
  'talk_open', 'talk_half', 'talk_smile', 'bust_listen', 'bust_pat', 'bust_poke', 'bust_bye', 'bust_happy',
  'pd1', 'pd2', 'pd3', 'pd4', 'pd5', 'pd6', 'pd7', 'pd8',
  'bust_sad', 'bust_confused', 'bust_sleepy', 'bust_tilt_left', 'bust_tilt_right', 'bust_nod_yes', 'bust_hmph', 'bust_dizzy',
  'gaze_back_look', 'gaze_shade', 'gaze_tiptoe', 'chase_reach', 'chase_crouch', 'chase_jump', 'chase_land', 'chase_spin',
  'gaze_shadeL', 'gaze_tiptoeL', 'chase_reachL', 'chase_jumpL', 'chase_spinL',
  'nap_sit', 'nap_nod', 'nap_curl', 'hum_left', 'hum_right', 'wave_a', 'wave_b', 'sit_edge',
  'tp_charge', 'tp_leave', 'tp_arrive', 'tp_stumble', 'walk_a', 'walk_b', 'walk_aL', 'walk_bL', 'body_34', 'body_34back',
  'trip_pack', 'trip_depart_a', 'trip_depart_b', 'trip_depart_aL', 'trip_depart_bL', 'trip_eat', 'gift_present', 'gift_proud', 'trip_tired',
  // pc_* 明信片动作帧只给旧的程序线稿用，0.8.6 起不再解码（数据仍在 qban-data.js 里）
  'title_lean', 'title_turn', 'peek_edge', 'peek_innocent', 'point_sky',
  'icon_onigiri', 'icon_pudding', 'icon_taiyaki', 'icon_compass', 'icon_shell', 'icon_glowshell', 'icon_gift', 'icon_postcard',
  // 0.8.0 晃一晃（批次 J）与新待机（批次 K）
  'shake_lift', 'shake_liftL', 'shake_fly', 'shake_flyL', 'shake_tumble_a', 'shake_tumble_b', 'shake_tumble_aL', 'shake_tumble_bL',
  'shake_brake', 'shake_brakeL', 'shake_bump', 'shake_bumpL', 'shake_float', 'shake_dizzy', 'shake_pout',
  'idle_stretch', 'idle_bubble', 'idle_fish', 'idle_fishL', 'idle_read', 'idle_tail_comb', 'idle_tail_combL', 'idle_sneeze_a', 'idle_sneeze_b', 'idle_postcard',
  'icon_beacon',
  ...Object.keys(GIFT_ART)
];
// 明信片插画不进 SPRITE_ORDER：打开明信片时 want(name) 排队，优先于后台解码。
export const CARD_NAMES = Object.keys(CARDS);
export const SPRITE_ORDER = REQUIRED.concat(LATER);
const GREEN = [64, 255, 94];
const CHUNK_PIXELS = 24000;
// 旅行通话的全息横条：每帧切成 STRIP_BANDS 条，每隔 3 行压暗一行（烘焙扫描线）。
// 只在通话里第一次用到某帧时生成一份压暗副本（放进图集），横条只是这份副本里的行范围。
export const STRIP_BANDS = 10;

// ---- 小图块（0.8.1）
// 真机实测两条约束（docs/LVFEIYU.md）：
// 1. 每个 new Canvas 都会建一个共享 GL 上下文，不论多小都约占 1.2 MB 原生内存（一帧一个 Canvas 时 143 帧约 250 MB）；
// 2. drawImage 的耗时和临时内存随“源 Canvas 的整块面积”增长，与取多大的子区域无关：
//    每帧 30 次，128² 源约 25 ms，1024² 图集页约 355 ms，而且每次都留下一份整页大小的临时副本。
// 所以按 SPRITE_ORDER 的顺序（同一组动作挨在一起）装进约 SHEET×SHEET 的小图块：
// Canvas 从 140 多张降到 50 张左右，每次绘制的源面积不超过约 8 万像素。绘制用 9 参数 drawImage 取子区域（见 draw.js blit）。
export const SHEET = 288;
const PACK_WINDOW = 16;        // 每 16 帧内按高度排序再装，装得更紧又不打散同组动作
const GUTTER = 2;              // 子图之间留空，缩放采样时不串到隔壁
// 明信片插画不常驻：固定 CARD_SLOTS 个槽位轮换（明信片页只要当前和前后各一张）
export const CARD_SLOTS = 4;
const CARD_RECENT = 3;

function specOf(name) {
  if (SOURCE[name]) return { spec: SOURCE[name], flip: false };
  if (CARDS[name]) return { spec: CARDS[name], flip: false };
  if (name.endsWith('L') && SOURCE[name.slice(0, -1)]) return { spec: SOURCE[name.slice(0, -1)], flip: true };
  throw new Error(`缺少精灵：${name}`);
}

function bytesOf(list) {
  return list.reduce((n, name) => { const { spec } = specOf(name); return n + spec.w * spec.h; }, 0);
}
export function spriteBytes() { return bytesOf(SPRITE_ORDER); }

// 第 p 个像素的亮度（0–255）：8 位或 4 位单通道；flip 时按行水平镜像
function alphaAt(spec, binary, p, flip) {
  if (spec.bits === 4) return ((binary.charCodeAt(p >> 1) >> (p & 1 ? 0 : 4)) & 15) * 17;
  if (!flip) return binary.charCodeAt(p);
  const x = p % spec.w;
  return binary.charCodeAt(p - x + (spec.w - 1 - x));
}

// 货架式装箱：在当前图块里按行往右放，放不下另起一行，图块满了开新块。
// 超过 SHEET 的单帧独占一块。返回 place(w, h) → {sheet, x, y}；sizes[i] = 第 i 块实际用到的宽高 w/h 与上限 maxW/maxH。
function createPacker() {
  const sizes = [];
  let cur = null;
  function fits(W, H) {
    for (const shelf of cur.shelves) {
      if (shelf.x + W <= cur.maxW && H <= shelf.h) {
        const at = { x: shelf.x, y: shelf.y };
        shelf.x += W;
        cur.size.w = Math.max(cur.size.w, shelf.x);
        return at;
      }
    }
    if (cur.bottom + H <= cur.maxH && W <= cur.maxW) {
      const at = { x: 0, y: cur.bottom };
      cur.shelves.push({ y: cur.bottom, h: H, x: W });
      cur.bottom += H;
      cur.size.w = Math.max(cur.size.w, W);
      cur.size.h = cur.bottom;
      return at;
    }
    return null;
  }
  function place(w, h) {
    const W = w + GUTTER;
    const H = h + GUTTER;
    let at = cur && fits(W, H);
    if (!at) {
      cur = { shelves: [], bottom: 0, maxW: Math.max(SHEET, W), maxH: Math.max(SHEET, H), size: { w: 0, h: 0, maxW: Math.max(SHEET, W), maxH: Math.max(SHEET, H) } };
      sizes.push(cur.size);
      at = fits(W, H);
    }
    return { sheet: sizes.length - 1, x: at.x, y: at.y };
  }
  return { place, sizes };
}

// 返回一个解码器；step() 每次处理一小块并返回是否全部完成，便于在动画帧之间穿插执行。
// ready：REQUIRED 已解码完，可以进入游戏；progress 指的是 REQUIRED 部分的进度（载入动画用）。
// cache[name] = { canvas, sx, sy, w, h }：所在图块与子区域。canvases：创建过的全部 Canvas。
export function createDecoder(CanvasCtor, decodeBase64) {
  const cache = {};
  const canvases = [];
  // 预先排好全部帧的位置；某块第一次用到时才按实际用到的大小创建
  const packer = createPacker();
  const layout = {};
  for (let i = 0; i < SPRITE_ORDER.length; i += PACK_WINDOW) {
    const group = SPRITE_ORDER.slice(i, i + PACK_WINDOW).sort((a, b) => specOf(b).spec.h - specOf(a).spec.h);
    for (const name of group) {
      const { spec } = specOf(name);
      layout[name] = packer.place(spec.w, spec.h);
    }
  }
  const sheets = [];
  // 通话压暗副本另装一组图块（只在第一次通话用到时才建）
  const stripPacker = createPacker();
  const stripSheets = [];
  function surface(w, h) {
    const canvas = new CanvasCtor(w, h);
    canvases.push(canvas);
    return { canvas, ctx: canvas.getContext('2d') };
  }
  // 预排好的图块按实际用到的大小建；通话图块边用边装，按上限建
  function sheet(list, sizes, i, full = false) {
    const z = sizes[i];
    return list[i] || (list[i] = full ? surface(z.maxW, z.maxH) : surface(z.w, z.h));
  }

  // 明信片槽位：最近想要的几张不被换掉
  // 每个槽位一张卡片大小的 Canvas（合成一张大图会让每次绘制都按整张的面积计费）
  const cardW = Math.max(...Object.values(CARDS).map(c => c.w));
  const cardH = Math.max(...Object.values(CARDS).map(c => c.h));
  const slots = Array.from({ length: CARD_SLOTS }, () => ({ name: null, surface: null }));
  let recentCards = [];
  function cardTarget(name) {
    let i = slots.findIndex(s => !s.name);
    if (i < 0) i = slots.findIndex(s => !recentCards.includes(s.name));
    if (i < 0) i = 0;
    if (slots[i].name) delete cache[slots[i].name];
    slots[i].name = name;
    const slot = slots[i];
    if (!slot.surface) slot.surface = surface(cardW, cardH);
    return { canvas: slot.surface.canvas, ctx: slot.surface.ctx, x: 0, y: 0 };
  }
  function target(name) {
    if (CARDS[name]) return cardTarget(name);
    const at = layout[name];
    const sh = sheet(sheets, packer.sizes, at.sheet);
    return { canvas: sh.canvas, ctx: sh.ctx, x: at.x, y: at.y };
  }

  let index = 0;
  let job = null;
  const wanted = [];
  let done = 0;
  const required = bytesOf(REQUIRED);
  const total = spriteBytes();
  // 通话用的压暗副本：一次解完，放进通话图块；横条只记行范围
  function buildStrips(name) {
    const { spec, flip } = specOf(name);
    const binary = decodeBase64(spec.d);
    const at = stripPacker.place(spec.w, spec.h);
    const pg = sheet(stripSheets, stripPacker.sizes, at.sheet, true);
    const image = pg.ctx.createImageData(spec.w, spec.h);
    const data = image.data;
    for (let p = 0, n = spec.w * spec.h; p < n; p += 1) {
      const o = p * 4;
      data[o] = GREEN[0];
      data[o + 1] = GREEN[1];
      data[o + 2] = GREEN[2];
      data[o + 3] = alphaAt(spec, binary, p, flip) * (Math.floor(p / spec.w) % 3 === 0 ? 0.45 : 1);
    }
    pg.ctx.putImageData(image, at.x, at.y);
    if (typeof pg.ctx.flush === 'function') pg.ctx.flush();
    const src = { canvas: pg.canvas, sx: at.x, sy: at.y, w: spec.w, h: spec.h };
    const bandH = Math.ceil(spec.h / STRIP_BANDS);
    const bands = [];
    for (let y = 0; y < spec.h; y += bandH) bands.push({ src, y, h: Math.min(bandH, spec.h - y) });
    return bands;
  }
  function publish(name, entry) {
    entry.name = name;
    if (!CARDS[name]) entry.makeStrips = () => buildStrips(name);
    cache[name] = entry;
    for (const [short, full] of Object.entries(ALIAS)) {
      if (full === name) cache[short] = entry;
      if (`${full}L` === name) cache[`${short}L`] = entry;
    }
  }
  return {
    cache,
    canvases,
    get progress() { return Math.min(1, done / required); },
    get allProgress() { return done / total; },
    get ready() { return index >= REQUIRED.length; },
    get finished() { return index >= SPRITE_ORDER.length && !wanted.length && !(job && job.extra); },
    // 按需解码（明信片）：记为“最近想要”；已在槽位或已排队的不重复排队
    want(name) {
      if (!CARDS[name]) return;
      recentCards = recentCards.filter(n => n !== name).concat(name).slice(-CARD_RECENT);
      if (cache[name] || wanted.includes(name) || (job && job.name === name)) return;
      wanted.push(name);
    },
    step() {
      if (!job) {
        // 翻得快时，已经不在前后的明信片不再解码
        while (wanted.length && !recentCards.includes(wanted[0])) wanted.shift();
        if (!wanted.length && index >= SPRITE_ORDER.length) return true;
        const extra = wanted.length > 0;
        const name = extra ? wanted.shift() : SPRITE_ORDER[index];
        const { spec, flip } = specOf(name);
        const binary = decodeBase64(spec.d);
        const n = spec.w * spec.h;
        if (binary.length !== (spec.bits === 4 ? Math.ceil(n / 2) : n)) throw new Error(`精灵数据长度错误：${name}`);
        const to = target(name);
        const image = to.ctx.createImageData(spec.w, spec.h);
        job = { name, spec, binary, to, image, p: 0, flip, extra, n };
      }
      const { spec, binary, image, flip } = job;
      const data = image.data;
      const end = Math.min(job.n, job.p + CHUNK_PIXELS);
      for (let p = job.p; p < end; p += 1) {
        const o = p * 4;
        data[o] = GREEN[0];
        data[o + 1] = GREEN[1];
        data[o + 2] = GREEN[2];
        data[o + 3] = alphaAt(spec, binary, p, flip);
      }
      if (!job.extra) done += end - job.p;
      job.p = end;
      if (end >= job.n) {
        const { canvas, ctx, x, y } = job.to;
        ctx.putImageData(image, x, y);
        if (typeof ctx.flush === 'function') ctx.flush();
        publish(job.name, { canvas, sx: x, sy: y, w: spec.w, h: spec.h });
        if (!job.extra) index += 1;
        job = null;
      }
      return index >= SPRITE_ORDER.length && !wanted.length && !job;
    }
  };
}

// 取帧：未解码完的帧依次回退，保证任何时候都画得出东西。
export function pick(cache, ...names) {
  for (const name of names) if (name && cache[name]) return cache[name];
  return null;
}
