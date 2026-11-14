// 场景绘制：载入全息、主页角落、召唤近景、菜单、明信片、礼物。读取 app.js 的视图状态 v，不修改它。
import { blit, rectPath, W, H, TAU, G, BLACK, hash, ease, clamp01, text, glitchText, wrap, line, rect, fillRect, chamfer, brackets, circle, ellipse, heart, diamond, sparkle, shellIcon, sprite, scanlines, tear, dissolve, font, holoSprite } from './draw.js';
import { TITLE, BOOT_LINES, LINES, ITEMS, ITEM_ORDER, SHOP_ORDER, DESTS, DEX_ROWS, AFFINITY, bondGift, destById, RARE_NAMES, affinityName, IDLE_MUTTER } from './content.js';
import { formatSpan, collected, totalGifts, SHELL_MAX, callsLeft } from './game.js';
import { drawPostcardScene } from './postcards.js';
import { drawTitle, drawTutorial } from './title.js';
import { pick } from './sprites.js';

export const BOOT_MIN_MS = 4600;
// 停靠点：0–3 四个角（原有）、4/5 上中/下中（0.8.0 被甩过来时才会停在中间）
export const CORNERS = [{ x: 74, y: 168 }, { x: 406, y: 168 }, { x: 74, y: 278 }, { x: 406, y: 278 }, { x: 240, y: 168 }, { x: 240, y: 278 }];
// 停靠点在 3 列 × 2 行网格中的位置 [列, 行]
export const CELL_OF = [[0, 0], [2, 0], [0, 1], [2, 1], [1, 0], [1, 1]];
export function cornerAt(col, row) { return CELL_OF.findIndex(([c, r]) => c === col && r === row); }
// 晃一晃：飞行、落地、撞墙（毫秒）
export const SHAKE_MS = { fly: 520, land: 560, bump: 1000 };
export const PET_SCALE = 0.84;
export const TP = { out: 380, beam: 260, in: 440 };
export const DIAL_MS = 1800;   // 旅行通话的拨号动画时长
const CALL = { cx: 148, foot: 270 };
const CLOSE = { cx: 148, foot: 276, scale: 1.0 };

// ------------------------------------------------------------ 载入

// 霓虹夜景风格（参考赛博朋克夜景截图的氛围，只借光效，不借画面）：
// 远处虚焦的城市灯光、横向闪过的故障光条、投影像的错位残影、栏杆上跑动的霓虹光。
// 单色绿屏上没有红蓝分色，用左右错开的低亮度残影代替色差。

function bootRail(ctx, t, alpha) {
  // 人物趴在栏杆上：栏杆横在她的前臂前面，透视略收拢
  const y1 = 262;
  const y2 = 296;
  const railY = px => y1 + 6 - (px / W) * 10;
  ctx.strokeStyle = G(0.55 * alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y1 + 6); ctx.lineTo(W, y1 - 4);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = G(0.3 * alpha);
  ctx.beginPath();
  ctx.moveTo(0, y2 + 4); ctx.lineTo(W, y2 - 2);
  for (let i = 0; i < 7; i += 1) {
    const px = 30 + i * 72;
    ctx.moveTo(px, railY(px)); ctx.lineTo(px, H);
  }
  ctx.stroke();
  // 扶手上的霓虹灯管：一段亮光从左往右跑，拖着渐暗的尾巴
  const head = ((t / 2.4) % (W + 260)) - 60;
  for (let k = 0; k < 6; k += 1) {
    const x0 = head - k * 22;
    if (x0 < -22 || x0 > W) continue;
    const a = (k === 0 ? 0.95 : 0.5 - k * 0.08) * alpha;
    ctx.strokeStyle = G(a);
    ctx.lineWidth = k === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x0, railY(x0) - 1); ctx.lineTo(x0 + 22, railY(x0 + 22) - 1);
    ctx.stroke();
  }
  circle(ctx, head + 22, railY(head + 22) - 1, 7, 0.12 * alpha, true);
}

// 虚焦的城市灯光：大小不一的光斑，实心低亮度 + 稍亮的边，缓慢向左漂移、呼吸
function bootBokeh(ctx, t, alpha) {
  for (let i = 0; i < 14; i += 1) {
    const r = 3 + hash(i * 5) * 9;
    const speed = 0.004 + hash(i * 7) * 0.006;
    const x = ((hash(i * 3) * (W + 40) - t * speed) % (W + 40) + W + 40) % (W + 40) - 20;
    const y = 18 + hash(i * 11) * 210;
    const p = 0.6 + 0.4 * Math.sin(t / (700 + hash(i) * 900) + i);
    const a = (0.35 + hash(i * 13) * 0.65) * p * alpha;
    circle(ctx, x, y, r, 0.07 * a, true);
    circle(ctx, x, y, r, 0.16 * a);
  }
}

// 故障光条：每 120ms 换一批，长短不一的横向亮线，偶尔一条带亮头
function bootStreaks(ctx, t, alpha, burst) {
  const k = Math.floor(t / 120);
  const n = burst ? 6 : 2;
  for (let i = 0; i < n; i += 1) {
    if (hash(k * 17 + i) > (burst ? 0.85 : 0.45)) continue;
    const y = 10 + hash(k * 7 + i * 3) * (H - 30);
    const x = hash(k * 5 + i * 11) * W;
    const len = 8 + hash(k * 3 + i) * (burst ? 70 : 34);
    fillRect(ctx, x, y, len, 1, (0.25 + hash(k + i * 9) * 0.45) * alpha);
    if (hash(k * 23 + i) > 0.6) fillRect(ctx, x + len + 3, y - 0.5, 4, 2, 0.8 * alpha);
  }
}

// 霓虹灯牌式的标题：刚亮起时灯管不稳定地闪几下，之后偶尔“嗞”地暗一下
function neonFlicker(t, start) {
  const age = t - start;
  if (age < 0) return 0;
  if (age < 700) return hash(Math.floor(age / 55)) > 0.45 ? 1 : 0.15;
  const k = Math.floor(t / 90);
  return hash(k * 3 + 1) > 0.97 ? 0.35 : 1;
}

// 退场（0.8.8）：信号断开、数据撕碎，共 700ms。
// 0–36% 干扰拉满（撕裂、残影拉开）；36–86% 人像切成 8 条横带各自向左右滑出、变暗，断口带亮边；
// 86–100% 只剩一个亮点闪一下。横带每条都要整张源图 drawImage 一次（真机开销按源图面积算），所以只切 8 条。
export const BOOT_LEAVE_MS = 700;
const SHRED = { jam: 0.36, cut: 0.86, bands: 8 };
function bootShred(ctx, holo, box, t, leaving) {
  const { x, y, w, h } = box;
  if (leaving < SHRED.jam) {
    const p = leaving / SHRED.jam;
    const k = Math.floor(t / 50);
    const off = 3 + 16 * ease(p);
    ctx.globalAlpha = 0.28;
    blit(ctx, holo, x - off, y, w, h);
    blit(ctx, holo, x + off, y + (hash(k + 3) > 0.5 ? 1 : 0), w, h);
    ctx.globalAlpha = hash(k) > 0.35 ? 0.92 : 0.45;
    blit(ctx, holo, x, y, w, h);
    ctx.globalAlpha = 1;
    tear(ctx, holo, box, t, 1);
    return;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (leaving < SHRED.cut) {
    const p = (leaving - SHRED.jam) / (SHRED.cut - SHRED.jam);
    const bh = holo.h / SHRED.bands;
    const k = h / holo.h;
    for (let i = 0; i < SHRED.bands; i += 1) {
      const q = clamp01((p - hash(i * 3 + 1) * 0.35) / 0.65);
      const dir = hash(i * 7 + 2) > 0.5 ? 1 : -1;
      const dx = dir * ease(q) * W * 0.5 + (hash(Math.floor(t / 40) + i) - 0.5) * 4;
      const by = y + i * bh * k;
      const fade = 1 - q * q;
      if (fade <= 0) continue;
      ctx.globalAlpha = 0.92 * fade;
      blit(ctx, holo, x + dx, by, w, bh * k, i * bh, bh);
      ctx.globalAlpha = 1;
      // 断口亮边：带子上沿一条细亮线，拖在移动方向的反侧
      if (q > 0) fillRect(ctx, x + dx - dir * 18, by, w * (0.5 + 0.5 * fade), 1, 0.85 * fade);
    }
    // 中心收拢的光点逐渐亮起
    circle(ctx, cx, cy, 2 + 3 * p, 0.5 * p, true);
    return;
  }
  const p = (leaving - SHRED.cut) / (1 - SHRED.cut);
  const on = hash(Math.floor(t / 35)) > 0.3 ? 1 : 0.3;
  fillRect(ctx, cx - 2, cy - 2, 4, 4, (1 - p) * on);
  fillRect(ctx, cx - 14 * (1 - p), cy, 28 * (1 - p), 1, 0.6 * (1 - p));
}

export function drawBoot(ctx, v) {
  const t = v.now - v.bootAt;
  const cache = v.cache;
  const holo = cache.holo;
  const leaving = v.bootLeaveAt ? clamp01((v.now - v.bootLeaveAt) / BOOT_LEAVE_MS) : 0;
  const jam = leaving > 0 && leaving < SHRED.jam;
  const cutP = clamp01((leaving - SHRED.jam) / (SHRED.cut - SHRED.jam));
  // 0–520ms：显像管开机线
  if (t < 520) {
    const p = ease(t / 520);
    const w = W * Math.min(1, p * 1.6);
    const h = Math.max(1, p > 0.6 ? (p - 0.6) * 60 : 1);
    fillRect(ctx, (W - w) / 2, H / 2 - h / 2, w, h, 0.9);
    fillRect(ctx, (W - w * 0.4) / 2, H / 2 - h * 3, w * 0.4, h * 6, 0.08);
    return;
  }
  // 退场时背景与栏杆在撕碎段淡出；右侧面板单独处理
  const a = 1 - cutP;
  const flicker = t < 900 ? (hash(Math.floor(t / 45)) > 0.4 ? 1 : 0.35) : 1;
  // 信号干扰：开场密集，之后每隔几秒来一阵短促的爆发
  const burst = t < 2600 || hash(Math.floor(t / 900)) > 0.7 || (leaving > 0 && leaving < SHRED.cut);
  bootBokeh(ctx, t, a);

  // 全息人像：扫描光束自上而下显现
  if (holo && leaving) {
    const h = holo.h * 0.94;
    bootShred(ctx, holo, { x: 18, y: 300 - h, w: holo.w * 0.94, h }, t, leaving);
  } else if (holo) {
    const scale = 0.94;
    const w = holo.w * scale;
    const h = holo.h * scale;
    const x = 18;
    const y = 300 - h;
    const reveal = clamp01((t - 520) / 1900);
    const beamY = y + h * ease(reveal);
    const breathe = 1 + Math.sin(t / 900) * 0.006;
    const dh = h * breathe;
    const dy = y + (h - dh) / 2;
    ctx.save();
    ctx.beginPath();
    rectPath(ctx, 0, 0, W, beamY);
    ctx.clip();
    // 外发光：放大的低亮度底影
    ctx.globalAlpha = 0.16 * a * flicker;
    blit(ctx, holo, x - 4, dy - 4, w + 8, dh + 8);
    // 干扰时左右错开两道残影（单色版的色差）
    if (burst) {
      const k = Math.floor(t / 70);
      const off = 2 + hash(k) * 4;
      ctx.globalAlpha = 0.22 * a;
      blit(ctx, holo, x - off, dy, w, dh);
      blit(ctx, holo, x + off, dy + (hash(k + 3) > 0.5 ? 1 : 0), w, dh);
    }
    ctx.globalAlpha = 0.92 * a * flicker;
    blit(ctx, holo, x, dy, w, dh);
    ctx.globalAlpha = 1;
    ctx.restore();
    const box = { x, y: dy, w, h: dh };
    const glitchAmount = t < 2600 ? 0.55 : burst ? 0.4 : 0.08;
    tear(ctx, holo, box, t, glitchAmount);
    scanlines(ctx, 0, y - 10, x + w + 20, h + 20, t, 0.32, 3);
    if (reveal < 1) {
      fillRect(ctx, 0, beamY - 1, x + w + 30, 2, 0.95);
      fillRect(ctx, 0, beamY - 7, x + w + 30, 6, 0.12);
      for (let i = 0; i < 12; i += 1) circle(ctx, x + hash(i + Math.floor(t / 60)) * w, beamY - hash(i * 3) * 24, 1, 0.7, true);
    }
  }
  bootRail(ctx, t, a);
  bootStreaks(ctx, t, leaving ? 1 - cutP * 0.6 : a, burst);

  // 右侧：霓虹灯牌标题与启动日志
  const tx = 300;
  if (t > 1400) {
    const p = clamp01((t - 1400) / 600);
    // 干扰段灯牌急闪，撕碎段熄灭
    const neon = (jam ? (hash(Math.floor(t / 40)) > 0.5 ? 1 : 0.2) : neonFlicker(t, 1400)) * a;
    font(ctx, 30, 700);
    const tw = ctx.measureText(TITLE).width;
    // 灯管外框：切角双线，内线随灯牌一起闪
    chamfer(ctx, tx - 10, 32, tw + 22, 46, 7, 0.75 * neon, 0.05 * neon);
    chamfer(ctx, tx - 14, 28, tw + 30, 54, 9, 0.2 * neon);
    // 灯管辉光：上下左右各偏 1.5px 的低亮度字
    for (const [ox, oy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) text(ctx, TITLE, tx + ox, 66 + oy, 30, 0.14 * neon, 'left', 700);
    glitchText(ctx, TITLE, tx, 66, 30, neon, t);
    text(ctx, '全 息 桌 宠  ·  第 一 号 投 影', tx + 1, 98, 10, 0.5 * p * a);
    line(ctx, tx, 106, tx + 150 * p, 106, 0.6 * a);
    fillRect(ctx, tx, 104, 18 * p, 4, 0.8 * a);
  }
  const step = Math.min(BOOT_LINES.length, Math.floor((t - 700) / 650) + 1);
  for (let i = 0; i < step; i += 1) {
    const ly = 128 + i * 19;
    const last = i === step - 1 && i < BOOT_LINES.length - 1;
    const chars = last ? Math.floor(((t - 700 - i * 650) / 650) * BOOT_LINES[i].length * 1.5) : BOOT_LINES[i].length;
    text(ctx, '›', tx, ly, 12, 0.8 * a, 'left', 700, true);
    text(ctx, BOOT_LINES[i].slice(0, Math.max(0, chars)), tx + 12, ly, 12, (last ? 0.9 : 0.55) * a);
    if (!last) text(ctx, '完成', tx + 168, ly, 10, 0.45 * a, 'right');
  }
  // 进度：取真实解码进度与时间轴较小者，二者都完成才显示 100%
  const timeP = clamp01((t - 520) / (BOOT_MIN_MS - 900));
  const p = Math.min(v.decodeProgress, timeP);
  const by = 236;
  rect(ctx, tx, by, 168, 8, 0.5 * a);
  // 退场时进度条从右往左一段段熄掉
  const segs = Math.floor(p * 21 * (1 - cutP));
  for (let i = 0; i < segs; i += 1) fillRect(ctx, tx + 2 + i * 7.8, by + 2, 6, 4, 0.85 * a);
  if (leaving) {
    // 进度条上方逐字打出转移提示，比其他内容晚一点熄
    const msg = '› 投影转移…';
    text(ctx, msg.slice(0, Math.ceil(clamp01(leaving / SHRED.jam) * msg.length)), tx, by - 6, 11, 0.95 * clamp01(1.4 - leaving * 1.4), 'left', 700, true);
  } else text(ctx, `载入 ${Math.floor(p * 100)}%`, tx, by - 6, 10, 0.7 * a, 'left', 400, true);
  if (v.bootReady && !leaving) text(ctx, '轻触进入', tx + 168, by - 6, 10, 0.5 + 0.4 * Math.sin(t / 250), 'right');
}

// ------------------------------------------------------------ 顶栏与底栏

function clock(now) {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function drawTopBar(ctx, v, alpha = 1) {
  const g = v.g;
  text(ctx, TITLE, 16, 18, 13, 0.85 * alpha, 'left', 700);
  text(ctx, affinityName(g.affinity), 76, 18, 10, 0.5 * alpha);
  text(ctx, clock(v.now), W / 2, 18, 12, 0.6 * alpha, 'center', 400, true);
  diamond(ctx, W - 74, 13, 5, 0.8 * alpha);
  text(ctx, `鳞光 ${g.scales}`, W - 16, 18, 12, 0.85 * alpha, 'right', 400);
  line(ctx, 16, 26, W - 16, 26, 0.18 * alpha);
  fillRect(ctx, 16, 25, 22, 2, 0.6 * alpha);
  fillRect(ctx, W - 38, 25, 22, 2, 0.6 * alpha);
}

export function drawDock(ctx, items, focus, now, alpha = 1, badges = {}) {
  const y = 304;
  const gap = Math.min(86, (W - 40) / items.length);
  const x0 = W / 2 - (gap * (items.length - 1)) / 2;
  line(ctx, 24, y - 18, W - 24, y - 18, 0.12 * alpha);
  items.forEach((item, i) => {
    const x = x0 + i * gap;
    const on = i === focus;
    font(ctx, 13, on ? 700 : 400);
    const tw = ctx.measureText(item.label).width;
    if (on) {
      chamfer(ctx, x - tw / 2 - 10, y - 15, tw + 20, 21, 5, 0.85 * alpha, 0.12 * alpha);
      fillRect(ctx, x - 4, y + 8, 8, 2, 0.9 * alpha);
    }
    text(ctx, item.label, x, y, 13, (on ? 1 : 0.45) * alpha, 'center', on ? 700 : 400);
    if (badges[item.id]) circle(ctx, x + tw / 2 + 5, y - 12, 2.5, 0.9 * alpha, true);
  });
}

export function drawToast(ctx, v) {
  const toast = v.toast;
  if (!toast) return;
  const age = v.now - toast.at;
  if (age > 2600) return;
  const a = age < 160 ? age / 160 : age > 2200 ? (2600 - age) / 400 : 1;
  font(ctx, 13);
  const tw = Math.min(380, ctx.measureText(toast.text).width);
  const ty = v.screen === 'menu' ? 255 : 34;
  ctx.fillStyle = '#000000';
  ctx.fillRect(W / 2 - tw / 2 - 14, ty, tw + 28, 24);
  chamfer(ctx, W / 2 - tw / 2 - 14, ty, tw + 28, 24, 6, 0.7 * a, 0.1 * a);
  text(ctx, toast.text, W / 2, ty + 16, 13, 0.95 * a, 'center');
}

// ------------------------------------------------------------ 主页角色

function platform(ctx, x, y, t, alpha) {
  ellipse(ctx, x, y + 2, 34, 6, 0.42 * alpha);
  ellipse(ctx, x, y + 2, 24, 4, 0.22 * alpha, 1, [3, 4]);
  const k = (t / 1400) % 1;
  ellipse(ctx, x, y + 2, 20 + k * 22, 3.5 + k * 4, 0.25 * (1 - k) * alpha);
}

// 角落姿势：用户确认的 Q 版动作帧（qban-v2）。侧身帧原画都朝右，朝左时用运行时镜像（名字加 L）。
// 帧还在后台解码时回退到基础三视图，任何时候都画得出。
function facing(name, right) { return right ? name : `${name}L`; }
// 左侧和中间的停靠点朝右（看向画面中央或前进方向），右侧朝左
function faceRight(corner) { return CORNERS[corner].x <= W / 2; }
// 待机循环（毫秒）：大部分时间正面，穿插眨眼、呼吸、摆尾、呆毛和侧看
const IDLE_LOOP = [[2400, 'body_front'], [150, 'idle_blink'], [1600, 'idle_breath'], [700, 'idle_tail_up'], [700, 'idle_tail_down'], [1200, 'body_front'], [140, 'idle_blink'], [900, 'idle_ahoge'], [1400, 'idle_look_side'], [900, 'body_34'], [900, 'sit_edge'], [2200, 'body_front'], [800, 'peek_innocent']];
const IDLE_LEN = IDLE_LOOP.reduce((n, [ms]) => n + ms, 0);
function loopFrame(list, total, ms) {
  let k = ms % total;
  for (const [len, name] of list) { if (k < len) return name; k -= len; }
  return list[0][1];
}

function petPose(v, t) {
  const pet = v.pet;
  const age = v.now - pet.actAt;
  const toCenter = faceRight(pet.corner);   // 左侧角落朝右看向画面中央
  let name = loopFrame(IDLE_LOOP, IDLE_LEN, age);
  let base = 'front';
  let dy = Math.sin(t / 650) * 1.2;
  let dx = 0;
  let alpha = 1;
  const sy = 1;
  switch (pet.act) {
    case 'gaze': {
      const k = Math.floor(age / 2600) % 5;
      name = k === 0 ? 'gaze_back_look' : k === 1 ? facing('gaze_shade', toCenter) : k === 2 ? facing('gaze_tiptoe', toCenter) : k === 3 ? 'point_sky' : 'body_34back';
      base = k >= 3 ? 'back' : facing('side', toCenter);
      dx = Math.sin(t / 1200) * 1;
      break;
    }
    case 'play': {
      // 追泡泡：伸手 → 下蹲 → 起跳 → 落地 → 转圈。跳跃高度已画在原画里
      const k = age % 3000;
      base = facing('side', toCenter);
      if (k < 800) { name = facing('chase_reach', toCenter); dx = Math.sin(k / 260) * 2; }
      else if (k < 1100) name = 'chase_crouch';
      else if (k < 1650) { name = facing('chase_jump', toCenter); dy = -Math.sin(((k - 1100) / 550) * Math.PI) * 8; }
      else if (k < 1950) name = 'chase_land';
      else name = facing('chase_spin', toCenter);
      break;
    }
    case 'doze':
      // 先打个哈欠（trip_tired），再坐下点头，最后蜷起来睡
      name = age < 1400 ? 'trip_tired' : age < 3600 ? 'nap_sit' : age < 7000 ? (Math.floor(age / 1300) % 2 ? 'nap_nod' : 'nap_sit') : 'nap_curl';
      alpha = 0.78 + Math.sin(t / 1400) * 0.06;
      dy = 0;
      break;
    case 'hum':
      name = Math.floor(age / 620) % 2 ? 'hum_right' : 'hum_left';
      dy = -Math.abs(Math.sin(t / 420)) * 2;
      break;
    case 'wave':
      // 挥两轮手，再回到待机
      name = age < 2400 ? (Math.floor(age / 280) % 2 ? 'wave_b' : 'wave_a') : name;
      break;
    case 'snack':
      name = 'trip_eat';
      dy = Math.floor(age / 420) % 3 === 0 ? -1 : 0;
      break;
    case 'proud':
      name = age < 3200 ? 'gift_proud' : name;
      break;
    case 'oops':
      // 练习瞬移：蓄力 → 闪一下 → 没站稳 → 装没事
      if (age < 1100) name = 'tp_charge';
      else if (age < 1400) { name = 'tp_charge'; alpha = Math.floor(age / 60) % 2 ? 0.25 : 0.9; }
      else if (age < 2400) { name = 'tp_stumble'; dx = Math.sin(age / 50) * 1.5; }
      else if (age < 4200) name = 'peek_innocent';
      break;
    case 'stretch':
      if (age < 2600) { name = 'idle_stretch'; dy = -Math.sin(clamp01(age / 2600) * Math.PI) * 2; }
      break;
    case 'bubble': {
      // 吹泡泡 2.4 秒，泡泡飘走后去追（复用追泡泡动作）
      const k = age % 5400;
      if (k < 2400) name = 'idle_bubble';
      else {
        const j = k - 2400;
        base = facing('side', toCenter);
        if (j < 800) name = facing('chase_reach', toCenter);
        else if (j < 1100) name = 'chase_crouch';
        else if (j < 1650) { name = facing('chase_jump', toCenter); dy = -Math.sin(((j - 1100) / 550) * Math.PI) * 8; }
        else if (j < 1950) name = 'chase_land';
        else name = 'idle_breath';
      }
      break;
    }
    case 'fish':
      name = facing('idle_fish', toCenter);
      base = 'sit_edge';
      dy = 0;
      break;
    case 'read':
      name = 'idle_read';
      dy = 0;
      break;
    case 'comb':
      name = facing('idle_tail_comb', toCenter);
      dy = Math.sin(t / 380) * 0.8;
      break;
    case 'sneeze':
      if (age < 1200) name = 'idle_breath';
      else if (age < 2300) { name = 'idle_sneeze_a'; dx = Math.sin(age / 40) * (age - 1200) / 700; dy = -1; }
      else if (age < 2800) { name = 'idle_sneeze_b'; dy = 2; }
      else if (age < 4800) name = 'peek_innocent';
      break;
    case 'postcard':
      name = 'idle_postcard';
      break;
    case 'dizzy':
      name = 'shake_dizzy';
      dx = Math.sin(t / 260) * 2;
      dy = 0;
      break;
    case 'pout':
      name = 'shake_pout';
      dy = Math.floor(age / 300) % 4 === 0 ? -2 : 0;
      break;
    case 'stroll': {
      // 在角落附近走一小段再走回来：walk_a/walk_b 交替，按行走方向镜像
      const k = (age % 6000) / 6000;
      const out = k < 0.5;
      const step = Math.sin(k * Math.PI * 2);
      dx = (toCenter ? 1 : -1) * Math.abs(Math.sin(k * Math.PI)) * 22;
      const right = out === toCenter;
      name = Math.abs(step) > 0.97 ? 'body_34' : facing(Math.floor(age / 260) % 2 ? 'walk_b' : 'walk_a', right);
      base = facing('side', right);
      dy = -Math.abs(Math.sin(age / 130)) * 1.5;
      break;
    }
    default:
      break;
  }
  return { name, base, dx, dy, alpha, sy };
}

function petEffects(ctx, v, box, t) {
  const pet = v.pet;
  const age = v.now - pet.actAt;
  const cx = box.x + box.w / 2;
  if (pet.act === 'doze') {
    for (let i = 0; i < 3; i += 1) {
      const k = ((age / 2200) + i / 3) % 1;
      text(ctx, 'z', cx + 22 + k * 16, box.y + 18 - k * 30, 9 + k * 6, 0.8 * (1 - k), 'left', 700);
    }
  } else if (pet.act === 'hum') {
    for (let i = 0; i < 2; i += 1) {
      const k = ((age / 1900) + i / 2) % 1;
      text(ctx, '♪', cx + (faceRight(pet.corner) ? 30 : -30) + Math.sin(k * 6) * 5, box.y + 20 - k * 34, 13, 0.85 * (1 - k), 'center');
    }
  } else if (pet.act === 'play') {
    for (let i = 0; i < 4; i += 1) {
      const k = ((age / 3000) + i / 4) % 1;
      const bx = cx + (faceRight(pet.corner) ? 1 : -1) * (26 + i * 9) + Math.sin(k * 8 + i) * 6;
      circle(ctx, bx, box.y + box.h - 10 - k * 90, 2 + i * 1.2, 0.7 * (1 - k));
    }
  } else if (pet.act === 'bubble') {
    const k = age % 5400;
    const mx = cx + (faceRight(pet.corner) ? 4 : -4);
    const my = box.y + box.h * 0.36;
    if (k < 2400) circle(ctx, mx + 6, my - 2, 1.5 + (k / 2400) * 7, 0.75);
    else for (let i = 0; i < 3; i += 1) {
      const j = clamp01((k - 2400 - i * 300) / 2600);
      if (j > 0 && j < 1) circle(ctx, mx + 6 + (faceRight(pet.corner) ? 1 : -1) * (j * 50 + i * 8) + Math.sin(j * 9 + i) * 5, my - 2 - j * 70, 8.5 - i * 2, 0.7 * (1 - j));
    }
  } else if (pet.act === 'fish') {
    // 钓竿竿尖约在原画右下角；朝左时镜像
    const right = faceRight(pet.corner);
    const tipX = right ? box.x + box.w * 0.97 : box.x + box.w * 0.03;
    const tipY = box.y + box.h * 0.94;
    const cyc = age % 7000;
    const bite = cyc > 5200 && cyc < 5900;
    const fy = tipY + 22 + Math.sin(t / 500) * 1.5 + (bite ? 4 + Math.sin(t / 45) * 2 : 0);
    line(ctx, tipX, tipY, tipX + (right ? 3 : -3), fy, 0.55);
    circle(ctx, tipX + (right ? 3 : -3), fy + 2, 2.2, 0.85);
    if (cyc >= 5900) {
      const j = (cyc - 5900) / 1100;
      sparkle(ctx, tipX + (right ? 3 : -3), fy - j * 50, 3 + j * 2, 0.9 * (1 - j));
    }
  } else if (pet.act === 'snack') {
    for (let i = 0; i < 3; i += 1) {
      const k = ((age / 1300) + i / 3) % 1;
      circle(ctx, cx + (hash(i + Math.floor(age / 1300)) - 0.5) * 14, box.y + box.h * 0.42 + k * box.h * 0.5, 0.9, 0.7 * (1 - k), true);
    }
  } else if (pet.act === 'proud' && age < 3200) {
    for (let i = 0; i < 3; i += 1) sparkle(ctx, cx + (i - 1) * 24, box.y + 6 + Math.abs(i - 1) * 10, 2.5 + 1.5 * Math.sin(t / 220 + i * 2), 0.8);
  } else if (pet.act === 'sneeze' && age > 2300 && age < 3200) {
    const k = (age - 2300) / 900;
    const dir = faceRight(pet.corner) ? 1 : -1;
    for (let i = -1; i <= 1; i += 1) line(ctx, cx + dir * (8 + k * 10), box.y + box.h * 0.35 + i * 6, cx + dir * (18 + k * 26), box.y + box.h * 0.35 + i * 10, 0.7 * (1 - k));
  } else if (pet.act === 'comb') {
    const k = (age / 900) % 1;
    sparkle(ctx, cx + (faceRight(pet.corner) ? 22 : -22), box.y + box.h * 0.55 - k * 12, 2 + k * 2, 0.7 * (1 - k));
  } else if (pet.act === 'dizzy') {
    // 头顶三颗小星星转圈
    for (let i = 0; i < 3; i += 1) {
      const a = t / 260 + (i * TAU) / 3;
      sparkle(ctx, cx + Math.cos(a) * 16, box.y + 8 + Math.sin(a) * 4, 2.6, 0.55 + 0.35 * Math.sin(a));
    }
  } else if (pet.act === 'pout') {
    const k = (age / 700) % 1;
    for (let i = 0; i < 2; i += 1) circle(ctx, cx + (i ? 18 : -18) + (i ? 1 : -1) * k * 8, box.y + 12 - k * 10, 2 + k * 3, 0.6 * (1 - k));
  } else if (pet.act === 'gaze') {
    const sx = cx + (faceRight(pet.corner) ? 46 : -46);
    for (let i = 0; i < 3; i += 1) sparkle(ctx, sx + (hash(i) - 0.5) * 30, box.y + 10 + hash(i + 5) * 30, 2 + 1.5 * Math.sin(t / 300 + i * 2), 0.6);
  }
  if (pet.mutter && v.now - pet.mutter.at < 2600) {
    const a = clamp01((2600 - (v.now - pet.mutter.at)) / 500);
    const right = faceRight(pet.corner);
    font(ctx, 11);
    const tw = ctx.measureText(pet.mutter.text).width;
    const bx = right ? box.x + box.w - 6 : box.x + 6 - tw - 16;
    const by = box.y + 2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx, by - 14, tw + 16, 19);
    chamfer(ctx, bx, by - 14, tw + 16, 19, 4, 0.55 * a, 0.08 * a);
    text(ctx, pet.mutter.text, bx + 8, by, 11, 0.9 * a);
  }
}

// override：传送等过场指定的帧名（未解码时回退到当前姿势）
function drawPetAt(ctx, v, corner, t, reveal, seed, override) {
  return drawPetXY(ctx, v, CORNERS[corner], t, reveal, seed, override);
}

// opts（晃一晃用）：alpha 残影透明度，sx/sy 压扁，platform:false 不画投影台，fx:false 不加扫描线和撕裂
function drawPetXY(ctx, v, pos, t, reveal, seed, override, opts = {}) {
  if (opts.platform !== false) platform(ctx, pos.x, pos.y, t, clamp01(reveal * 1.5));
  const pose = petPose(v, t);
  const spr = pick(v.cache, override, pose.name, pose.base, 'front');
  const lx = opts.lean ? opts.lean.x : 0;
  const ly = opts.lean ? opts.lean.y : 0;
  const box = sprite(ctx, spr, pos.x + lx + (opts.still ? 0 : pose.dx), pos.y + ly + (opts.still ? 0 : pose.dy), PET_SCALE, (opts.still ? 1 : pose.alpha) * (opts.alpha == null ? 1 : opts.alpha), opts.sx || 1, (opts.sy || 1) * (opts.still ? 1 : pose.sy));
  if (!box) return null;
  if (opts.fx === false) return box;
  if (!box) return null;
  // 0.7.1 起不再叠第二遍：之前单遍偏暗的真正原因是 drawImage 吃到了前一笔 fillStyle 的透明度（见 draw.js blit）
  scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.14, 4);
  if (hash(Math.floor(t / 1300)) > 0.86) tear(ctx, spr, box, t, 0.35);
  if (reveal < 1) dissolve(ctx, box, reveal, seed);
  return box;
}

// ------------------------------------------------------------ 晃一晃（0.8.0）
// 佩戴者轻甩头，她被甩向同一方向的相邻停靠点；已在边上则撞墙弹回。
// 画布不能旋转图片，翻滚、刹车、撞墙全靠原画帧（批次 J）；残影、速度线、灰尘由这里画。
const TUMBLE = ['shake_tumble_a', 'shake_tumble_b', 'shake_tumble_aL', 'shake_tumble_bL'];
function shakeFrame(tp, p) {
  const right = tp.dir === 'right';
  if (tp.dir === 'up') return 'shake_float';
  if (tp.dir === 'down') return 'chase_jump';
  if (p < 0.2) return facing('shake_lift', right);
  if (p < 0.55) return facing('shake_fly', right);
  return TUMBLE[Math.floor(p * 9) % 4];
}

function dust(ctx, x, y, k, alpha) {
  for (let i = 0; i < 4; i += 1) {
    const s = i < 2 ? -1 : 1;
    const r = 2 + k * 5 + (i % 2) * 2;
    circle(ctx, x + s * (8 + k * 18 + (i % 2) * 8), y - 2 - k * 6 - (i % 2) * 3, r, 0.5 * (1 - k) * alpha);
  }
}

function speedLines(ctx, x, y, dir, k) {
  const horiz = dir === 'left' || dir === 'right';
  const s = dir === 'left' || dir === 'up' ? -1 : 1;
  for (let i = 0; i < 4; i += 1) {
    const off = (i - 1.5) * 16 + (hash(i + Math.floor(k * 10)) - 0.5) * 6;
    const len = 18 + hash(i * 3) * 16;
    if (horiz) line(ctx, x - s * 34, y - 50 + off, x - s * (34 + len), y - 50 + off, 0.45 * (1 - k));
    else if (s < 0) line(ctx, x + off, y + 4, x + off, y + 4 + len, 0.45 * (1 - k));
    else line(ctx, x + off, y - 112, x + off, y - 112 - len, 0.45 * (1 - k));
  }
}

function drawShake(ctx, v, tp, t) {
  const age = v.now - tp.at;
  const A = CORNERS[tp.from];
  const B = CORNERS[tp.to];
  const horiz = tp.dir === 'left' || tp.dir === 'right';
  const right = tp.dir === 'right';
  const s = tp.dir === 'left' || tp.dir === 'up' ? -1 : 1;
  if (tp.bump) {
    // 撞墙：冲出去一小段 → 贴墙压扁 → 晃回原位
    const hit = 180;
    const stay = 620;
    let off;
    let name;
    let sx = 1;
    let sy = 1;
    if (age < hit) {
      off = ease(age / hit) * 16;
      name = horiz ? facing('shake_lift', right) : tp.dir === 'up' ? 'shake_float' : 'chase_crouch';
    } else if (age < stay) {
      off = 16 + Math.sin(age / 30) * (1 - (age - hit) / (stay - hit)) * 2;
      name = horiz ? facing('shake_bump', right) : tp.dir === 'up' ? 'shake_float' : 'chase_crouch';
      if (horiz) sx = 0.9; else sy = tp.dir === 'up' ? 1.06 : 0.9;
    } else {
      off = 16 * (1 - ease((age - stay) / (SHAKE_MS.bump - stay)));
      name = 'tp_stumble';
    }
    // 向下撞只压扁不下移（脚下就是地面）
    const pos = horiz ? { x: A.x + s * off, y: A.y } : { x: A.x, y: A.y + (tp.dir === 'up' ? -off : 0) };
    platform(ctx, A.x, A.y, t, 1);
    const box = drawPetXY(ctx, v, pos, t, 1, 0, name, { platform: false, still: true, sx, sy });
    if (box && age >= hit && age < stay + 120) {
      const k = clamp01((age - hit) / 420);
      // 撞击线画在碰撞的那一侧
      for (let i = -1; i <= 1; i += 1) {
        if (horiz) {
          const ex = s > 0 ? box.x + box.w + 4 : box.x - 4;
          line(ctx, ex + s * k * 4, box.y + box.h * 0.4 + i * 14, ex + s * (8 + k * 8), box.y + box.h * 0.4 + i * 20, 0.8 * (1 - k));
        } else if (tp.dir === 'up') {
          line(ctx, pos.x + i * 14, box.y - 4 - k * 3, pos.x + i * 22, box.y - 12 - k * 8, 0.8 * (1 - k));
        } else {
          line(ctx, pos.x + i * 22, pos.y + 1, pos.x + i * (30 + k * 10), pos.y - 4 - k * 4, 0.8 * (1 - k));
        }
      }
    }
    return;
  }
  // 横向落点前留一段刹车距离
  const brake = horiz ? 14 : 0;
  const end = { x: B.x - s * brake, y: B.y };
  if (age < SHAKE_MS.fly) {
    const p = age / SHAKE_MS.fly;
    const at = q => {
      const e = ease(q);
      return { x: A.x + (end.x - A.x) * e, y: A.y + (end.y - A.y) * e - (horiz ? Math.sin(clamp01(q) * Math.PI) * 22 : 0) };
    };
    platform(ctx, A.x, A.y, t, 1 - p);
    platform(ctx, B.x, B.y, t, p);
    const name = shakeFrame(tp, p);
    for (let i = 2; i >= 1; i -= 1) {
      const q = p - i * 0.09;
      if (q > 0) drawPetXY(ctx, v, at(q), t, 1, 0, name, { platform: false, still: true, fx: false, alpha: i === 1 ? 0.3 : 0.14 });
    }
    const pos = at(p);
    drawPetXY(ctx, v, pos, t, 1, 0, name, { platform: false, still: true });
    if (p > 0.1 && p < 0.85) speedLines(ctx, pos.x, pos.y, tp.dir, p);
    return;
  }
  const q = clamp01((age - SHAKE_MS.fly) / SHAKE_MS.land);
  if (horiz) {
    const slide = ease(q / 0.6);
    const pos = { x: end.x + s * brake * slide, y: B.y };
    drawPetXY(ctx, v, pos, t, 1, 0, q < 0.6 ? facing('shake_brake', right) : 'chase_land', { still: true });
    if (q < 0.75) dust(ctx, pos.x - s * 14, B.y, q / 0.75, 1);
  } else {
    drawPetXY(ctx, v, B, t, 1, 0, q < 0.55 ? 'chase_land' : 'idle_breath', { still: true });
    if (q < 0.6) dust(ctx, B.x, B.y, q / 0.6, 1);
  }
}

function beam(ctx, from, to, p, alpha = 1) {
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    const k = clamp01(p * 1.4 - (i / n) * 0.4);
    if (k <= 0 || k >= 1) continue;
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 30;
    circle(ctx, x, y, 2.4 - (i / n) * 1.8, (1 - i / n) * 0.9 * alpha, true);
  }
}

export function drawHome(ctx, v) {
  const t = v.now;
  const g = v.g;
  const pet = v.pet;
  drawTopBar(ctx, v);
  ambient(ctx, v);
  drawShells(ctx, v);
  if (g.trip) drawTravelRadar(ctx, v);
  if (pet.present || pet.tp) {
    const tp = pet.tp;
    // 0.8.10：待机时跟着头轻轻偏（投影台不动，只偏人）
    const lean = v.imu && v.imu.leanDraw;
    if (!tp) drawPetXY(ctx, v, CORNERS[pet.corner], t, 1, 0, undefined, { lean });
    else {
      const age = v.now - tp.at;
      const seed = Math.floor(tp.at / 7);
      if (tp.kind === 'shake') drawShake(ctx, v, tp, t);
      else if (tp.kind === 'move') {
        if (age < TP.out) drawPetAt(ctx, v, tp.from, t, 1 - age / TP.out, seed, 'tp_leave');
        else if (age < TP.out + TP.beam) beam(ctx, { x: CORNERS[tp.from].x, y: CORNERS[tp.from].y - 50 }, { x: CORNERS[tp.to].x, y: CORNERS[tp.to].y - 50 }, (age - TP.out) / TP.beam);
        else drawPetAt(ctx, v, tp.to, t, ease((age - TP.out - TP.beam) / TP.in), seed + 1, 'tp_arrive');
      } else if (tp.kind === 'return') {
        // 从近景回到角落
        const c = CORNERS[tp.to];
        if (age < TP.beam) beam(ctx, { x: CLOSE.cx, y: 180 }, { x: c.x, y: c.y - 50 }, age / TP.beam);
        else drawPetAt(ctx, v, tp.to, t, ease((age - TP.beam) / TP.in), seed, 'tp_arrive');
      } else if (tp.kind === 'depart') {
        const c = CORNERS[pet.corner];
        // 出发：挥手道别 → 背上行囊转身 → 蓄能消失
        if (age < 1500) drawPetAt(ctx, v, pet.corner, t, 1, seed, age < 700 ? (Math.floor(age / 280) % 2 ? 'wave_b' : 'wave_a') : facing(age < 1100 ? 'trip_depart_a' : 'trip_depart_b', faceRight(pet.corner)));
        else if (age < 1500 + TP.out) drawPetAt(ctx, v, pet.corner, t, 1 - (age - 1500) / TP.out, seed, 'tp_charge');
        else beam(ctx, { x: c.x, y: c.y - 50 }, { x: c.x + (c.x < W / 2 ? 60 : -60), y: -20 }, (age - 1500 - TP.out) / 500);
      } else if (tp.kind === 'arrive') {
        const c = CORNERS[pet.corner];
        if (age < 500) beam(ctx, { x: c.x + (c.x < W / 2 ? 60 : -60), y: -20 }, { x: c.x, y: c.y - 50 }, age / 500);
        else drawPetAt(ctx, v, pet.corner, t, ease((age - 500) / TP.in), seed, 'tp_stumble');
      }
    }
    if (!tp && pet.present) {
      const c = CORNERS[pet.corner];
      const pos = lean ? { x: c.x + lean.x, y: c.y + lean.y } : c;
      const spr = v.cache.front;
      if (spr) petEffects(ctx, v, { x: pos.x - (spr.w * PET_SCALE) / 2, y: pos.y - spr.h * PET_SCALE, w: spr.w * PET_SCALE, h: spr.h * PET_SCALE }, t);
    }
  }
  drawDock(ctx, v.dock, v.dockFocus, v.now, 1, { album: g.unread > 0, pack: !g.trip && !g.pack.food });
  drawToast(ctx, v);
}

function ambient(ctx, v) {
  // 稀疏漂浮光尘，保持画面中央通透
  for (let i = 0; i < 14; i += 1) {
    const x = (hash(i * 3) * W + v.now / (90 + hash(i) * 80)) % W;
    const y = 40 + ((hash(i * 7) * 220 - v.now / (140 + hash(i * 5) * 120)) % 220 + 220) % 220;
    circle(ctx, x, y, 0.8, 0.12 + 0.12 * Math.sin(v.now / 700 + i), true);
  }
}

// 她的身体范围（以脚下为基准）碰到哪些贝的点位（0.8.12：甩飞途中、落地、换位到达时捡贝）
export const PET_REACH = { half: 34, up: 112, down: 6 };
export function shellsTouched(foot, spots) {
  return spots.filter(s => {
    return s && Math.abs(s.x - foot.x) <= PET_REACH.half && s.y >= foot.y - PET_REACH.up && s.y <= foot.y + PET_REACH.down;
  });
}

// 甩飞时她脚下的位置，与 drawShake 的轨迹一致（撞墙只冲出 16 像素，按原地算）
export function shakeFootAt(tp, age) {
  const A = CORNERS[tp.from];
  const B = CORNERS[tp.to];
  if (tp.bump) return A;
  const horiz = tp.dir === 'left' || tp.dir === 'right';
  const s = tp.dir === 'left' || tp.dir === 'up' ? -1 : 1;
  const brake = horiz ? 14 : 0;
  const end = { x: B.x - s * brake, y: B.y };
  if (age < SHAKE_MS.fly) {
    const q = age / SHAKE_MS.fly;
    const e = ease(q);
    return { x: A.x + (end.x - A.x) * e, y: A.y + (end.y - A.y) * e - (horiz ? Math.sin(clamp01(q) * Math.PI) * 22 : 0) };
  }
  if (!horiz) return B;
  const q = clamp01((age - SHAKE_MS.fly) / SHAKE_MS.land);
  return { x: end.x + s * brake * ease(q / 0.6), y: B.y };
}

function drawShells(ctx, v) {
  const sh = v.g.shells;
  const spots = sh.spots || [];
  for (const s of spots) {
    const i = s.x * 0.37 + s.y * 0.11;   // 每颗的浮动相位不同
    const bob = Math.sin(v.now / 700 + i * 1.3) * 3;
    const glow = 0.55 + 0.3 * Math.sin(v.now / 500 + i);
    circle(ctx, s.x, s.y + bob, 11, glow * 0.25, false);
    const icon = v.cache.icon_glowshell;
    if (icon) sprite(ctx, icon, s.x, s.y + bob + icon.h * 0.32, 0.62, 0.55 + glow * 0.45);
    else shellIcon(ctx, s.x, s.y + bob, 6, glow);
  }
  // 被她碰到捡起：光圈散开、往上飘一颗小亮点
  for (const pop of v.shellPops || []) {
    const k = clamp01((v.now - pop.at) / SHELL_POP_MS);
    if (k >= 1) continue;
    const s = pop.spot;
    circle(ctx, s.x, s.y, 8 + k * 18, 0.7 * (1 - k), false);
    circle(ctx, s.x, s.y - k * 26, 2.4, 0.9 * (1 - k), true);
  }
}
export const SHELL_POP_MS = 600;

function drawTravelRadar(ctx, v) {
  const g = v.g;
  const trip = g.trip;
  const dest = destById(trip.dest);
  const p = clamp01((v.now - trip.leftAt) / Math.max(1, trip.returnAt - trip.leftAt));
  const x = 132;
  const y = 92;
  const w = 216;
  const h = 128;
  brackets(ctx, x, y, w, h, 10, 0.5);
  text(ctx, '远程信标', x + 12, y + 20, 11, 0.55);
  text(ctx, `${dest.name}一带`, x + w - 12, y + 20, 12, 0.9, 'right', 700);
  // 航线弧
  const ax = x + 24;
  const bx = x + w - 24;
  const ay = y + 86;
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = G(0.35);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, ay - 60, bx, ay);
  ctx.stroke();
  ctx.setLineDash([]);
  circle(ctx, ax, ay, 3, 0.7);
  diamond(ctx, bx, ay, 5, 0.8);
  text(ctx, '家', ax, ay + 16, 10, 0.5, 'center');
  text(ctx, '目的地', bx, ay + 16, 10, 0.5, 'center');
  // 去程到达后在目的地附近游荡，最后返程
  const k = p < 0.35 ? p / 0.35 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
  const qx = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * ((ax + bx) / 2) + k * k * bx;
  const qy = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * (ay - 60) + k * k * ay;
  const pulse = (v.now / 900) % 1;
  circle(ctx, qx, qy, 3, 1, true);
  circle(ctx, qx, qy, 4 + pulse * 10, 0.6 * (1 - pulse));
  text(ctx, `预计 ${formatSpan(trip.returnAt - v.now)} 后回来`, x + w / 2, y + h - 10, 11, 0.7, 'center');
}

// ------------------------------------------------------------ 召唤近景

const MOOD_SPRITE = { smug: 'bust_smug', wow: 'bust_wow', pout: 'bust_pout', think: 'bust_think', happy: 'bust_happy', sad: 'bust_sad', confused: 'bust_confused' };
// 识图指认 8 帧（photo-discover-8f）：先播 reveal 一次，再循环 hold。时长取自素材清单
const PD_REVEAL = [[1, 180], [2, 110], [3, 100], [4, 100], [5, 280]];
const PD_HOLD = [[5, 1500], [6, 220], [5, 1200], [7, 90], [8, 180], [5, 1200], [6, 220], [8, 180]];
const PD_REVEAL_MS = PD_REVEAL.reduce((n, [, ms]) => n + ms, 0);
const PD_HOLD_MS = PD_HOLD.reduce((n, [, ms]) => n + ms, 0);
export function discoverFrame(age) {
  let k = age;
  if (k < PD_REVEAL_MS) { for (const [f, ms] of PD_REVEAL) { if (k < ms) return `pd${f}`; k -= ms; } }
  k = (age - PD_REVEAL_MS) % PD_HOLD_MS;
  for (const [f, ms] of PD_HOLD) { if (k < ms) return `pd${f}`; k -= ms; }
  return 'pd5';
}
const DISCOVER = { cx: 352, foot: 284 };

// 近景半身帧：按阶段与心情选择。说话时在张嘴/半张嘴/当前心情之间切换
function closeFrame(v) {
  const c = v.close;
  const fx = c.fx && v.now - c.fx.at < 900 ? c.fx : null;
  const mood = MOOD_SPRITE[c.mood] || 'bust_smug';
  if (c.leaveAt) return ['bust_bye', mood];
  if (fx && fx.kind === 'pat') return ['bust_pat', 'bust_happy', mood];
  if (fx && fx.kind === 'poke') return [v.now - fx.at < 450 ? 'bust_poke' : (v.g && v.g.daily.pokes > 3 ? 'bust_dizzy' : 'bust_hmph'), 'bust_pout', mood];
  if (fx && fx.kind === 'nod') return ['bust_nod_yes', mood];
  if (c.phase === 'listening') return ['bust_listen', 'bust_think'];
  if (c.phase === 'thinking') return [Math.floor(v.now / 1600) % 3 === 2 ? 'bust_tilt_left' : 'bust_think', 'bust_think'];
  if (c.phase === 'looking') return [c.look && c.look.stage === 'thinking' ? 'bust_think' : 'bust_wow', 'bust_wow'];
  if (v.speechUntil > v.now && c.bubble && v.now - c.bubble.at < 16000) {
    const k = Math.floor(v.now / 140) % 4;
    return [k === 0 ? 'talk_open' : k === 2 ? 'talk_half' : (c.mood === 'happy' || c.mood === 'smug' ? 'talk_smile' : mood), mood];
  }
  if (v.now - c.moodAt > 9000) {
    const hour = new Date(v.now).getHours();
    if (hour >= 23 || hour < 6) return ['bust_sleepy', 'bust_neutral'];
    return [Math.floor(v.now / 3800) % 5 === 4 ? 'bust_tilt_right' : 'bust_neutral', mood];
  }
  return [mood];
}

export function drawClose(ctx, v) {
  if (v.close.call) { drawCall(ctx, v); return; }
  const c = v.close;
  const t = v.now;
  drawTopBar(ctx, v, 0.7);
  const enter = v.now - c.enterAt;
  // 角落溶解与光束
  if (enter < 0) {
    const age = enter + TP.out + 220;
    const corner = v.pet.corner;
    if (age < TP.out) drawPetAt(ctx, v, corner, t, 1 - age / TP.out, 3);
    else beam(ctx, { x: CORNERS[corner].x, y: CORNERS[corner].y - 50 }, { x: CLOSE.cx, y: 170 }, (age - TP.out) / 220);
    drawDock(ctx, v.dock, v.dockFocus, v.now, 0.4);
    return;
  }
  const leave = c.leaveAt ? clamp01((v.now - c.leaveAt) / 380) : 0;
  const reveal = ease(enter / 520) * (1 - leave);
  if (c.phase === 'discover' && c.look) {
    drawDiscover(ctx, v, reveal);
    drawBubble(ctx, v, reveal);
    drawDock(ctx, v.dock, v.dockFocus, v.now, reveal);
    drawToast(ctx, v);
    return;
  }
  // 投影底座与光锥
  const baseY = CLOSE.foot - 4;
  ellipse(ctx, CLOSE.cx, baseY, 70, 9, 0.5 * reveal);
  ellipse(ctx, CLOSE.cx, baseY, 50, 6, 0.25 * reveal, 1, [4, 4]);
  ctx.strokeStyle = G(0.08 * reveal);
  ctx.beginPath();
  ctx.moveTo(CLOSE.cx - 70, baseY); ctx.lineTo(CLOSE.cx - 104, 96);
  ctx.moveTo(CLOSE.cx + 70, baseY); ctx.lineTo(CLOSE.cx + 104, 96);
  ctx.stroke();
  // 表情切换时短暂撕裂
  const moodAge = v.now - c.moodAt;
  let sx = 1;
  let sy = 1;
  let dx = 0;
  let dy = Math.sin(t / 900) * 2;
  const fx = c.fx && v.now - c.fx.at < 900 ? c.fx : null;
  if (fx && fx.kind === 'pat') {
    const k = (v.now - fx.at) / 900;
    const s = Math.sin(k * Math.PI * 3) * (1 - k);
    sy = 1 - s * 0.03;
    sx = 1 + s * 0.02;
  } else if (fx && fx.kind === 'poke') {
    const k = (v.now - fx.at) / 900;
    dx = Math.sin(k * 40) * 4 * (1 - k);
  }
  const spr = pick(v.cache, ...closeFrame(v), 'smug');
  const box = sprite(ctx, spr, CLOSE.cx + dx, CLOSE.foot + dy, CLOSE.scale, 0.97, sx, sy);
  if (box) {
    scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.3, 3);
    const glitch = moodAge < 320 ? 0.9 : enter < 700 ? 0.6 : hash(Math.floor(t / 1700)) > 0.85 ? 0.3 : 0;
    tear(ctx, spr, box, t, glitch);
    if (reveal < 1) dissolve(ctx, box, reveal, 9);
  }
  if (fx && box) {
    const k = (v.now - fx.at) / 900;
    if (fx.kind === 'pat') for (let i = 0; i < 4; i += 1) heart(ctx, box.x + 50 + i * 34, box.y + 30 - k * 40 - i * 6, 5 + i, 0.9 * (1 - k));
    if (fx.kind === 'poke') {
      for (let i = 0; i < 3; i += 1) {
        const a = -0.6 + i * 0.6;
        line(ctx, box.x + box.w - 30 + Math.cos(a) * 14, box.y + 100 + Math.sin(a) * 14, box.x + box.w - 30 + Math.cos(a) * (22 + k * 8), box.y + 100 + Math.sin(a) * (22 + k * 8), 0.9 * (1 - k), 2);
      }
    }
  }
  if (c.phase === 'looking') drawViewfinder(ctx, v, reveal);
  drawBubble(ctx, v, reveal);
  drawDock(ctx, v.dock, v.dockFocus, v.now, reveal);
  drawToast(ctx, v);
}

// ---------------------------------------------------------- 旅行通话
// 她在外地：拨号 → 底部信标发出光锥 → 全息投影带横向波动、残影、闪烁和偶发撕裂。
function callSignal(v) {
  const call = v.close.call;
  if (call.dropAt) return 0.15;
  const left = call.until - v.now;
  const base = left < 20000 ? 0.45 : 0.85;
  return clamp01(base + (hash(Math.floor(v.now / 1500)) - 0.5) * 0.3);
}

function drawCallHud(ctx, v, alpha) {
  const call = v.close.call;
  const dest = destById(call.dest);
  const signal = callSignal(v);
  const connected = Math.max(0, v.now - v.close.enterAt);
  const s = Math.floor(connected / 1000);
  const clockText = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const phase = v.close.phase;
  if (phase === 'looking' || phase === 'discover') {
    // 取景提示和“我看到的”气泡占左上：通话信息收成右上角一行
    const rx = W - 16;
    text(ctx, clockText, rx, 44, 10, 0.6 * alpha, 'right', 400, true);
    for (let i = 0; i < 4; i += 1) fillRect(ctx, rx - 70 + i * 5, 44 - (3 + i * 2), 3, 3 + i * 2, (signal > i * 0.25 + 0.05 ? 0.8 : 0.18) * alpha);
    text(ctx, dest.name, rx - 76, 44, 10, 0.7 * alpha, 'right');
    return;
  }
  const x = 16;
  const y = 44;
  text(ctx, '远程通话', x, y, 10, 0.55 * alpha);
  text(ctx, dest.name, x + 50, y, 11, 0.85 * alpha, 'left', 700);
  // 信号格
  for (let i = 0; i < 4; i += 1) {
    const on = signal > i * 0.25 + 0.05;
    fillRect(ctx, x + 4 + i * 6, y + 18 - (4 + i * 3), 4, 4 + i * 3, (on ? 0.8 : 0.18) * alpha);
  }
  text(ctx, clockText, x + 34, y + 18, 10, 0.6 * alpha, 'left', 400, true);
  const free = callsLeft(v.g);
  text(ctx, free ? `剩余 ${free} 次` : `信标流量 ×${v.g.stock.beacon || 0}`, x + 74, y + 18, 9, 0.45 * alpha);
}

// 底部信标：一个小发射器向上张开光锥，光点上浮。和在家时的投影台不同，表示人不在这里。
function drawCallCone(ctx, cx, foot, alpha, t, signal) {
  const y = foot + 6;
  diamond(ctx, cx, y, 5, 0.85 * alpha, true);
  ellipse(ctx, cx, y, 26, 4, 0.4 * alpha, 1, [3, 3]);
  const flick = 0.75 + 0.25 * Math.sin(t / 53) * Math.sin(t / 151);
  ctx.strokeStyle = G(0.14 * alpha * flick);
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -(t / 40) % 11;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y); ctx.lineTo(cx - 108, foot - 210);
  ctx.moveTo(cx + 6, y); ctx.lineTo(cx + 108, foot - 210);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  for (let i = 0; i < 9; i += 1) {
    const k = ((t / 2600) + hash(i * 7)) % 1;
    const px = cx + (hash(i * 13) - 0.5) * 160 * k;
    const py = y - k * 200;
    fillRect(ctx, px, py, 2, 2, (1 - k) * 0.6 * alpha * (signal > 0.3 ? 1 : 0.4));
  }
}

function drawDial(ctx, v, p) {
  const call = v.close.call;
  const dest = destById(call.dest);
  const cx = CALL.cx;
  const cy = 160;
  const t = v.now;
  for (let i = 0; i < 3; i += 1) {
    const k = ((t - call.at) / 900 + i / 3) % 1;
    circle(ctx, cx, cy, 10 + k * 70, (1 - k) * 0.6);
  }
  diamond(ctx, cx, cy, 6, 0.9, true);
  // 信号从远方沿弧线飞来
  const fx = W - 40;
  const fy = 60;
  ctx.strokeStyle = G(0.25);
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo((fx + cx) / 2, fy - 30, cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  const q = ease(p);
  const bx = (1 - q) * (1 - q) * fx + 2 * (1 - q) * q * ((fx + cx) / 2) + q * q * cx;
  const by = (1 - q) * (1 - q) * fy + 2 * (1 - q) * q * (fy - 30) + q * q * cy;
  circle(ctx, bx, by, 3, 0.95, true);
  text(ctx, dest.name, fx, fy - 10, 11, 0.7, 'right');
  const dots = '.'.repeat(1 + Math.floor(t / 300) % 3);
  text(ctx, `${LINES.call.dialing}${dots}`, cx, cy + 96, 12, 0.75, 'center');
  // 雪花噪点
  for (let i = 0; i < 40; i += 1) {
    const n = hash(Math.floor(t / 60) * 97 + i);
    fillRect(ctx, cx - 90 + n * 180, cy - 80 + hash(i * 31 + Math.floor(t / 60)) * 160, 2, 1, 0.35 * hash(i));
  }
  if (p > 0.85) { ctx.fillStyle = G(0.12 * (1 - p) / 0.15); ctx.fillRect(0, 0, W, H); }
}

function holoEffects(ctx, spr, box, v, signal, extraTear) {
  // 扫描线已烘焙进横条，这里只画下行亮带
  const band = box.y + ((v.now / 18) % (box.h + 40)) - 20;
  fillRect(ctx, box.x, band, box.w, 6, 0.07);
  const burst = hash(Math.floor(v.now / 2300)) > 0.78 - (1 - signal) * 0.4 ? 0.8 : 0;
  tear(ctx, spr, box, v.now, Math.max(burst, extraTear));
}

function drawCall(ctx, v) {
  const c = v.close;
  const t = v.now;
  drawTopBar(ctx, v, 0.7);
  const enter = v.now - c.enterAt;
  drawCallHud(ctx, v, enter < 0 ? 0.6 : 1);
  if (enter < 0) {
    drawDial(ctx, v, 1 + enter / DIAL_MS);
    drawDock(ctx, v.dock, v.dockFocus, v.now, 0.4);
    return;
  }
  const leave = c.leaveAt ? clamp01((v.now - c.leaveAt) / 460) : 0;
  const reveal = ease(enter / 700) * (1 - leave);
  const signal = callSignal(v);
  const discovering = c.phase === 'discover' && c.look;
  drawCallCone(ctx, discovering ? DISCOVER.cx : CALL.cx, discovering ? DISCOVER.foot - 6 : CALL.foot, reveal, t, signal);
  let spr;
  let box;
  if (discovering) {
    const age = v.now - c.look.revealAt;
    spr = pick(v.cache, discoverFrame(age), 'pd5', 'bust_wow', 'wow');
    box = holoSprite(ctx, spr, DISCOVER.cx, DISCOVER.foot, 1, ease(age / 360) * reveal, t, signal);
  } else {
    spr = pick(v.cache, ...closeFrame(v), 'smug');
    box = holoSprite(ctx, spr, CALL.cx, CALL.foot + Math.sin(t / 900) * 2, 1, 0.97 * reveal, t, signal);
  }
  if (box) {
    const moodAge = v.now - c.moodAt;
    holoEffects(ctx, spr, box, v, signal, moodAge < 320 || enter < 900 ? 0.8 : 0);
    if (reveal < 1) dissolve(ctx, box, reveal, 21);
  }
  if (c.phase === 'looking') drawViewfinder(ctx, v, reveal);
  drawBubble(ctx, v, reveal);
  drawDock(ctx, v.dock, v.dockFocus, v.now, Math.max(reveal, 0.4));
  drawToast(ctx, v);
}

// 取景框：画面中央留空（眼镜上黑色透明，用户直接看见现实里的东西），只画四角和进度
function drawViewfinder(ctx, v, alpha) {
  const look = v.close.look;
  if (!look) return;
  const x = 196;
  const y = 66;
  const w = 248;
  const h = 170;
  const age = v.now - look.at;
  const breathe = 0.6 + 0.3 * Math.sin(v.now / 260);
  brackets(ctx, x, y, w, h, 18, breathe * alpha, 2);
  if (look.stage === 'thinking') {
    // 已拍下：快门闪光后，横向扫描线来回扫
    const flash = look.shotAt ? clamp01(1 - (v.now - look.shotAt) / 260) : 0;
    if (flash > 0) { ctx.fillStyle = G(0.22 * flash * alpha); ctx.fillRect(x, y, w, h); }
    const sy = y + ((v.now / 6) % h);
    line(ctx, x + 6, sy, x + w - 6, sy, 0.55 * alpha, 1.5);
    text(ctx, '识别中', x + w / 2, y + h + 18, 11, 0.7 * alpha, 'center');
    return;
  }
  // 对焦中：中心小十字 + 预热进度条（时长来自义眼盯真真机：2.5 秒）
  sparkle(ctx, x + w / 2, y + h / 2, 6, 0.45 * alpha);
  const p = clamp01(age / 2800);
  line(ctx, x + 20, y + h + 12, x + w - 20, y + h + 12, 0.2 * alpha, 2);
  line(ctx, x + 20, y + h + 12, x + 20 + (w - 40) * p, y + h + 12, 0.8 * alpha, 2);
  text(ctx, look.stage === 'shutter' ? '咔嚓' : '对焦中', x + w / 2, y + h + 28, 11, 0.7 * alpha, 'center');
}

// 识图指认：大肥鱼站到右侧，指向左上方的说明气泡
function drawDiscover(ctx, v, alpha) {
  const age = v.now - v.close.look.revealAt;
  const name = discoverFrame(age);
  const spr = pick(v.cache, name, 'pd5', 'bust_wow', 'wow');
  const appear = ease(age / 360) * alpha;
  const box = sprite(ctx, spr, DISCOVER.cx, DISCOVER.foot + Math.sin(v.now / 900) * 1.5, 1, 0.97 * appear);
  if (!box) return;
  scanlines(ctx, box.x, box.y, box.w, box.h, v.now, 0.28, 3);
  if (age < 420) tear(ctx, spr, box, v.now, 0.7);
  if (appear < 1) dissolve(ctx, box, appear, 13);
}

function drawBubble(ctx, v, alpha) {
  const c = v.close;
  const x = 268;
  const y = 66;
  const w = 196;
  let h = 96;
  if (alpha <= 0.05) return;
  if (c.phase === 'listening') {
    chamfer(ctx, x, y, w, h, 8, 0.8 * alpha, 0.07 * alpha);
    text(ctx, '我在听哦…', x + 12, y + 22, 12, 0.6 * alpha);
    for (let i = 0; i < 17; i += 1) {
      const amp = 4 + Math.abs(Math.sin(v.now / 120 + i * 0.7)) * (c.transcript ? 16 : 7) * (0.5 + hash(i) * 0.5);
      fillRect(ctx, x + 16 + i * 10, y + 52 - amp / 2, 3, amp, 0.75 * alpha);
    }
    if (c.transcript) {
      const lines = wrap(ctx, c.transcript, w - 24, 11, 1);
      text(ctx, lines[0] || '', x + 12, y + h - 12, 11, 0.8 * alpha);
    }
    return;
  }
  if (c.phase === 'thinking') {
    chamfer(ctx, x, y, w, 46, 8, 0.7 * alpha, 0.06 * alpha);
    for (let i = 0; i < 3; i += 1) circle(ctx, x + 22 + i * 14, y + 24, 3, (0.3 + 0.7 * ((Math.floor(v.now / 220) % 3) === i ? 1 : 0)) * alpha, true);
    text(ctx, '让我想想…', x + w - 12, y + 28, 11, 0.5 * alpha, 'right');
    return;
  }
  const bubble = c.bubble;
  if (!bubble || !bubble.text) return;
  if (c.phase === 'looking') {
    // 取景时提示放在左上，不挡取景框
    const tip = wrap(ctx, bubble.text, 150, 12, 3);
    tip.forEach((ln, i) => text(ctx, ln, 18, 46 + i * 17, 12, 0.85 * alpha));
    return;
  }
  if (c.phase === 'discover') {
    // 指认时气泡在左上，大肥鱼在右侧指向它
    const bw = 210;
    const shownD = Math.floor((v.now - bubble.at) / 45);
    const linesD = wrap(ctx, bubble.text, bw - 26, 14, 6);
    const bh = 26 + linesD.length * 21;
    text(ctx, '我看到的', 18, 72, 10, 0.5 * alpha);
    chamfer(ctx, 18, 78, bw, bh, 8, 0.8 * alpha, 0.07 * alpha);
    let leftD = shownD;
    linesD.forEach((ln, i) => {
      text(ctx, ln.slice(0, Math.max(0, leftD)), 31, 104 + i * 21, 14, 0.95 * alpha);
      leftD -= ln.length;
    });
    return;
  }
  if (v.speechUntil > v.now) {
    // 朗读指示：气泡上方三根跳动的短条（时长按字数估计，不代表播放器真实进度）
    for (let i = 0; i < 3; i += 1) {
      const amp = 3 + Math.abs(Math.sin(v.now / 130 + i * 1.3)) * 6;
      fillRect(ctx, x + w - 30 + i * 6, y - 6 - amp, 3, amp, 0.75 * alpha);
    }
  }
  const age = v.now - bubble.at;
  const shown = Math.floor(age / 45);
  const lines = wrap(ctx, bubble.text, w - 26, 14, 5);
  h = 26 + lines.length * 21;
  chamfer(ctx, x, y, w, h, 8, 0.8 * alpha, 0.07 * alpha);
  // 指向角色的小尾巴
  ctx.strokeStyle = G(0.8 * alpha);
  ctx.beginPath();
  ctx.moveTo(x, y + 26); ctx.lineTo(x - 12, y + 34); ctx.lineTo(x, y + 40);
  ctx.stroke();
  let left = shown;
  lines.forEach((ln, i) => {
    const part = ln.slice(0, Math.max(0, left));
    left -= ln.length;
    text(ctx, part, x + 13, y + 26 + i * 21, 14, 0.95 * alpha);
  });
  if (shown < bubble.text.length && Math.floor(v.now / 250) % 2) fillRect(ctx, x + w - 16, y + h - 12, 6, 2, 0.8 * alpha);
}

// ------------------------------------------------------------ 菜单

function panel(ctx, title, sub, v) {
  drawTopBar(ctx, v, 0.6);
  chamfer(ctx, 16, 34, W - 32, 248, 12, 0.5, 0.03);
  brackets(ctx, 12, 30, W - 24, 256, 12, 0.8);
  glitchText(ctx, title, 32, 60, 17, 0.95, v.now);
  if (sub) text(ctx, sub, W - 32, 60, 11, 0.55, 'right');
  line(ctx, 32, 68, W - 32, 68, 0.25);
}

// 信标流量占位图标（icon_beacon 美术未交付前）：底座上的菱形发射器，向上一圈圈发出信号弧。
// 待补素材见 docs/ART-HANDOFF-PENDING.md
function beaconIcon(ctx, cx, cy, t, alpha) {
  ctx.strokeStyle = G(0.75 * alpha);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 13); ctx.lineTo(cx + 9, cy + 13);
  ctx.moveTo(cx - 5, cy + 13); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx + 5, cy + 13);
  ctx.stroke();
  diamond(ctx, cx, cy + 2, 4, 0.95 * alpha, true);
  for (let i = 0; i < 3; i += 1) {
    const k = ((t / 1200) + i / 3) % 1;
    const r = 6 + k * 12;
    ctx.strokeStyle = G(0.8 * alpha * (1 - k));
    ctx.beginPath();
    ctx.arc(cx, cy + 2, r, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
}

function row(ctx, y, on, left, right, sub, alpha = 1) {
  if (on) {
    chamfer(ctx, 28, y - 17, W - 56, 26, 5, 0.85, 0.1);
    fillRect(ctx, 28, y - 17, 3, 26, 0.9);
  }
  text(ctx, left, 42, y, 13, (on ? 1 : 0.65) * alpha, 'left', on ? 700 : 400);
  if (sub) text(ctx, sub, 150, y, 10, (on ? 0.7 : 0.4) * alpha);
  if (right) text(ctx, right, W - 40, y, 12, (on ? 0.95 : 0.55) * alpha, 'right');
}

export function drawMenu(ctx, v) {
  const m = v.menu;
  const g = v.g;
  const t = v.now;
  if (m.kind === 'pack') {
    panel(ctx, '行囊', g.trip ? '她正在旅行中' : '放好便当，她会自己挑时间出发', v);
    const slots = [['便当', g.pack.food], ['护符', g.pack.charm]];
    slots.forEach(([label, id], i) => {
      const sx = 32 + i * 120;
      chamfer(ctx, sx, 78, 110, 34, 6, id ? 0.8 : 0.35, id ? 0.1 : 0);
      text(ctx, label, sx + 10, 92, 10, 0.5);
      text(ctx, id ? ITEMS[id].name : '空', sx + 10, 106, 12, id ? 0.95 : 0.35, 'left', id ? 700 : 400);
    });
    const focusItem = ITEMS[ITEM_ORDER[m.focus]];
    const spr = g.pack.food ? pick(v.cache, 'trip_pack', 'front') : focusItem.kind === 'food' ? pick(v.cache, 'trip_eat', 'side') : v.cache.side;
    const packIcon = v.cache[`icon_${ITEM_ORDER[m.focus]}`];
    if (packIcon) sprite(ctx, packIcon, 92, 66, 0.6, 0.9);
    if (spr && !g.trip) sprite(ctx, spr, 420, 128 + Math.sin(t / 600) * 1.5, 0.42, 0.85);
    // 信标流量不进行囊，这里只显示持有数
    text(ctx, `信标流量 ×${g.stock.beacon || 0}`, 272, 92, 10, 0.5);
    text(ctx, '旅行中通话用', 272, 106, 9, 0.35);
    ITEM_ORDER.forEach((id, i) => {
      const item = ITEMS[id];
      const packed = g.pack[item.kind] === id;
      row(ctx, 136 + i * 26, m.focus === i, item.name, packed ? '已放入' : `持有 ${g.stock[id]}`, item.desc, g.stock[id] || packed ? 1 : 0.5);
    });
  } else if (m.kind === 'shop') {
    panel(ctx, '商店', `鳞光 ${g.scales}`, v);
    SHOP_ORDER.forEach((id, i) => {
      const item = ITEMS[id];
      row(ctx, 96 + i * 30, m.focus === i, item.name, `${item.price} 鳞光`, item.desc, g.scales >= item.price ? 1 : 0.5);
    });
    text(ctx, '每天摸摸头、聊聊天、拾取浮光贝都能获得鳞光', W / 2, 270, 10, 0.4, 'center');
    const shopId = SHOP_ORDER[m.focus];
    const shopIcon = v.cache[`icon_${shopId}`];
    if (shopIcon) sprite(ctx, shopIcon, 92, 66, 0.6, 0.9);
    else if (shopId === 'beacon') beaconIcon(ctx, 92, 52, t, 0.9);
    // 从面板右缘探出头来看你买东西
    const peek = v.cache.peek_edge;
    if (peek) sprite(ctx, peek, W - 34, 250 + Math.sin(t / 700) * 1.5, 0.5, 0.8);
  } else if (m.kind === 'album') {
    const cards = g.postcards.slice().reverse();
    panel(ctx, '明信片', `共 ${cards.length} 张`, v);
    if (!cards.length) {
      if (v.cache.icon_postcard) sprite(ctx, v.cache.icon_postcard, W / 2, 138, 1, 0.7);
      text(ctx, '还没有收到明信片', W / 2, 160, 13, 0.55, 'center');
      text(ctx, '让她去旅行，她会从路上寄回来', W / 2, 182, 11, 0.4, 'center');
    }
    const start = Math.max(0, Math.min(m.focus - 2, cards.length - 6));
    cards.slice(start, start + 6).forEach((card, i) => {
      const index = start + i;
      const d = new Date(card.at);
      row(ctx, 94 + i * 30, m.focus === index, destById(card.dest).name, `${d.getMonth() + 1}月${d.getDate()}日`, card.read ? card.line : '新 · 未读', card.read ? 0.8 : 1);
    });
  } else if (m.kind === 'dex' && m.detail) {
    drawGiftDetail(ctx, v);
  } else if (m.kind === 'dex') {
    panel(ctx, '纪念品图鉴', `收集 ${collected(g)} / ${totalGifts()}`, v);
    // 七行：六个目的地 + 亲密信物（0.8.5 起行距 25 → 22）
    DEX_ROWS.forEach((dest, di) => {
      const y = 90 + di * 22;
      text(ctx, dest.name, 36, y, 11, 0.55);
      dest.gifts.forEach((gift, gi) => {
        const index = di * 3 + gi;
        const x = 128 + gi * 108;
        const have = g.souvenirs[gift.id];
        const on = m.focus === index;
        if (on) chamfer(ctx, x - 6, y - 15, 102, 21, 4, 0.85, 0.1);
        for (let r = 0; r <= gift.rare; r += 1) diamond(ctx, x + 2 + r * 7, y - 4, 3, have ? 0.8 : 0.25, !!have);
        text(ctx, have ? gift.name : '？？？', x + 26, y, 11, have ? (on ? 1 : 0.75) : 0.3);
      });
    });
    const dest = DEX_ROWS[Math.floor(m.focus / 3)];
    const gift = dest.gifts[m.focus % 3];
    const have = g.souvenirs[gift.id];
    line(ctx, 32, 248, W - 32, 248, 0.2);
    text(ctx, have ? `${RARE_NAMES[gift.rare]} · ${gift.desc}` : `${RARE_NAMES[gift.rare]} · ${giftHint(dest, gift)}`, 36, 268, 11, 0.7);
    if (have > 1) text(ctx, `×${have}`, W - 36, 268, 11, 0.6, 'right');
    text(ctx, '轻点查看', W - 36, 290, 10, 0.4, 'right');
  }
  drawToast(ctx, v);
}

// ------------------------------------------------------------ 纪念品详情
// 还没收集到时的提示：旅行纪念品说去哪里找，亲密信物说要到哪一级
function giftHint(row, gift) {
  return gift.level ? `亲密度到“${AFFINITY[gift.level].name}”时她会送给你` : `去${row.name}或许能找到`;
}

// 物品图优先用 gift_<id> 精灵（待美术交付），没有时画占位：切角八边框里放名字末字（灯笼→笼）
export function drawGiftIcon(ctx, v, gift, cx, cy, size, alpha, have = true) {
  const spr = have ? v.cache['gift_' + gift.id] : null;
  if (spr) {
    const s = size / Math.max(spr.w, spr.h);
    return sprite(ctx, spr, cx, cy + (spr.h * s) / 2, s, alpha);
  }
  const r = size / 2;
  const c = r * 0.42;
  ctx.strokeStyle = G((have ? 0.75 : 0.3) * alpha);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - r + c, cy - r); ctx.lineTo(cx + r - c, cy - r); ctx.lineTo(cx + r, cy - r + c); ctx.lineTo(cx + r, cy + r - c);
  ctx.lineTo(cx + r - c, cy + r); ctx.lineTo(cx - r + c, cy + r); ctx.lineTo(cx - r, cy + r - c); ctx.lineTo(cx - r, cy - r + c);
  ctx.closePath();
  ctx.stroke();
  if (have) {
    ctx.fillStyle = G(0.08 * alpha);
    ctx.fill();
  }
  text(ctx, have ? gift.name.slice(-1) : '？', cx, cy + size * 0.16, Math.round(size * 0.42), (have ? 0.9 : 0.35) * alpha, 'center', 700);
  return null;
}

function drawGiftDetail(ctx, v) {
  const g = v.g;
  const m = v.menu;
  const dest = DEX_ROWS[Math.floor(m.focus / 3)];
  const gift = dest.gifts[m.focus % 3];
  const have = g.souvenirs[gift.id] || 0;
  const age = v.now - m.detail.at;
  const a = ease(age / 260);
  const slide = (1 - a) * 14 * (m.detail.dir || 0);
  drawTopBar(ctx, v, 0.5);
  chamfer(ctx, 24, 40, W - 48, 252, 12, 0.7, 0.05);
  brackets(ctx, 18, 34, W - 36, 264, 12, 0.35, 1);
  // 左侧：物品图与稀有度光环
  const cx = 128 + slide;
  const cy = 150;
  const spin = v.now / 2400;
  ctx.setLineDash([3, 5]);
  circle(ctx, cx, cy, 72, (have ? 0.35 : 0.15) * a);
  ctx.setLineDash([]);
  for (let r = 0; r <= gift.rare; r += 1) {
    const ang = spin + (r / (gift.rare + 1)) * TAU;
    diamond(ctx, cx + Math.cos(ang) * 72, cy + Math.sin(ang) * 72, 4, (have ? 0.9 : 0.3) * a, !!have);
  }
  const box = drawGiftIcon(ctx, v, gift, cx, cy + Math.sin(v.now / 700) * 2, 96, a, !!have);
  if (box) scanlines(ctx, box.x, box.y, box.w, box.h, v.now, 0.25);
  // 右侧：名称、稀有度、来源、介绍
  const x = 236 + slide;
  text(ctx, `${dest.name} · ${m.focus % 3 + 1} / 3`, x, 74, 10, 0.5 * a);
  if (have) glitchText(ctx, gift.name, x, 104, 20, a, v.now);
  else text(ctx, '？？？', x, 104, 20, 0.35 * a, 'left', 700);
  for (let r = 0; r <= gift.rare; r += 1) diamond(ctx, x + 4 + r * 10, 122, 3.5, (have ? 0.85 : 0.3) * a, !!have);
  text(ctx, RARE_NAMES[gift.rare], x + 14 + (gift.rare + 1) * 10, 126, 11, 0.6 * a);
  line(ctx, x, 138, W - 44, 138, 0.25 * a);
  const body = have ? gift.desc : gift.level ? `还没有收到。${giftHint(dest, gift)}。` : `还没有收集到。去${dest.name}旅行，或许能带回来。`;
  wrap(ctx, body, W - 44 - x, 13, 4).forEach((ln, i) => text(ctx, ln, x, 162 + i * 20, 13, (have ? 0.88 : 0.5) * a));
  if (have) text(ctx, gift.level ? '独一无二' : `已收集 ×${have}`, x, 252, 11, 0.6 * a);
  text(ctx, '滑动切换 · 轻点或双击返回', W / 2, 284, 10, 0.4, 'center');
  drawToast(ctx, v);
}

// ------------------------------------------------------------ 明信片与礼物

export function drawPostcard(ctx, v) {
  const cards = v.g.postcards.slice().reverse();
  const card = cards[v.menu.focus];
  if (!card) return;
  const dest = destById(card.dest);
  const x = 30;
  const y = 30;
  const w = W - 60;
  const h = 196;
  rect(ctx, x, y, w, h, 0.7);
  rect(ctx, x + 4, y + 4, w - 8, h - 8, 0.25);
  drawPostcardScene(ctx, { ...card, scene: dest.id }, x + 6, y + 6, w - 12, h - 12, v.now, v.cache);
  // 邮戳
  circle(ctx, x + w - 40, y + 36, 22, 0.55);
  circle(ctx, x + w - 40, y + 36, 18, 0.3, false);
  text(ctx, dest.name.slice(0, 2), x + w - 40, y + 34, 10, 0.75, 'center', 700);
  text(ctx, dest.name.slice(2), x + w - 40, y + 46, 9, 0.6, 'center');
  const d = new Date(card.at);
  text(ctx, `来自 ${dest.name}`, x, y + h + 24, 13, 0.6);
  text(ctx, `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x + w, y + h + 24, 11, 0.5, 'right', 400, true);
  text(ctx, `“${card.line}”`, x, y + h + 50, 14, 0.95);
  text(ctx, `${v.menu.focus + 1} / ${cards.length}`, x + w, y + h + 50, 11, 0.45, 'right');
}

export function drawGift(ctx, v) {
  const pending = v.giftView;
  if (!pending) return;
  const age = v.now - v.giftAt;
  // 亲密度升级仪式（0.8.5）借用这个画面：没有鳞光，标题换成新的等级
  const bond = pending.bond || 0;
  const dest = bond ? null : destById(pending.dest);
  const gift = bond ? bondGift(bond) : dest.gifts.find(item => item.id === pending.gift);
  if (!gift) return;
  drawTopBar(ctx, v, 0.6);
  // 礼物：先递出礼物，再得意地站着（全身帧放大到与半身近景相近的高度）
  // 升级仪式用专属两帧（批次 L，0.8.7）：害羞地递出 → 捂脸偷看；没解码好时回退到礼物帧
  const spr = bond
    ? pick(v.cache, age < 2600 ? 'bond_give' : 'bond_shy', 'bond_give', age < 2600 ? 'gift_present' : 'gift_proud', 'gift_present', 'wow')
    : pick(v.cache, age < 2600 ? 'gift_present' : 'gift_proud', 'gift_present', 'wow');
  const reveal = ease(age / 520);
  const big = spr && spr.h < 160 ? 1.6 : 0.92;
  const box = sprite(ctx, spr, 132, 296 + Math.sin(v.now / 800) * 2, big, 0.95);
  if (box) {
    scanlines(ctx, box.x, box.y, box.w, box.h, v.now, 0.3);
    if (reveal < 1) dissolve(ctx, box, reveal, 21);
  }
  const p = ease((age - 400) / 500);
  if (p <= 0) return;
  const x = 252;
  const y = 70;
  // 礼盒光芒
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * TAU + v.now / 3000;
    line(ctx, x + 100 + Math.cos(a) * 30, y + 62 + Math.sin(a) * 30, x + 100 + Math.cos(a) * (40 + 8 * Math.sin(v.now / 300 + i)), y + 62 + Math.sin(a) * (40 + 8 * Math.sin(v.now / 300 + i)), 0.35 * p);
  }
  circle(ctx, x + 100, y + 62, 24 * p, 0.8 * p);
  // 升级仪式：礼盒周围慢慢升起小爱心
  if (bond) for (let i = 0; i < 5; i += 1) {
    const k = ((v.now / 2200) + i / 5) % 1;
    heart(ctx, x + 100 + Math.sin(i * 2.3 + k * 3) * 46, y + 96 - k * 80, 3 + (i % 3), 0.7 * p * (1 - k));
  }
  const art = v.cache['gift_' + gift.id];
  if (art && p > 0.6) { const s = 56 / Math.max(art.w, art.h); sprite(ctx, art, x + 100, y + 62 + (art.h * s) / 2, s, 0.95 * p); }
  else if (v.cache.icon_gift && p > 0.6) sprite(ctx, v.cache.icon_gift, x + 100, y + 62 + 14, 0.7, 0.9 * p);
  // 稀有度菱形放在图标下方，不盖住图标中心（0.8.7）
  for (let r = 0; r <= gift.rare; r += 1) diamond(ctx, x + 100 + (r - gift.rare / 2) * 14, y + 100, 5, 0.95 * p, true);
  text(ctx, bond ? `亲密度升到“${AFFINITY[bond].name}”` : `${dest.name}的礼物`, x + 100, y + 2, 12, (bond ? 0.85 : 0.6) * p, 'center', bond ? 700 : 400);
  glitchText(ctx, gift.name, x + 100, y + 124, 19, p, v.now, 'center');
  text(ctx, RARE_NAMES[gift.rare], x + 100, y + 144, 11, 0.6 * p, 'center');
  const lines = wrap(ctx, gift.desc, 190, 11, 2);
  lines.forEach((ln, i) => text(ctx, ln, x + 100, y + 166 + i * 16, 11, 0.7 * p, 'center'));
  if (bond) text(ctx, '亲密信物 · 已放进图鉴', x + 100, y + 210, 12, 0.75 * p, 'center');
  else text(ctx, `＋${pending.scales} 鳞光`, x + 100, y + 210, 13, 0.9 * p, 'center', 700);
  if (age > 1200) text(ctx, '轻触收下', W / 2 + 100, 306, 11, 0.5 + 0.4 * Math.sin(v.now / 260), 'center');
}

export function render(ctx, v) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  if (v.screen === 'title') drawTitle(ctx, v);
  else if (v.screen === 'tutorial') drawTutorial(ctx, v);
  else if (v.screen === 'boot') drawBoot(ctx, v);
  else if (v.screen === 'home') drawHome(ctx, v);
  else if (v.screen === 'close') drawClose(ctx, v);
  else if (v.screen === 'menu') drawMenu(ctx, v);
  else if (v.screen === 'postcard') drawPostcard(ctx, v);
  else if (v.screen === 'gift') drawGift(ctx, v);
}
