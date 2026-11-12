// 场景绘制：载入全息、主页角落、召唤近景、菜单、明信片、礼物。读取 app.js 的视图状态 v，不修改它。
import { rectPath, W, H, TAU, G, BLACK, hash, ease, clamp01, text, glitchText, wrap, line, rect, fillRect, chamfer, brackets, circle, ellipse, heart, diamond, sparkle, shellIcon, sprite, scanlines, tear, dissolve, font } from './draw.js';
import { TITLE, BOOT_LINES, ITEMS, ITEM_ORDER, DESTS, destById, RARE_NAMES, affinityName, IDLE_MUTTER } from './content.js';
import { formatSpan, collected, totalGifts, SHELL_MAX } from './game.js';
import { drawPostcardScene } from './postcards.js';
import { drawTitle, drawTutorial } from './title.js';

export const BOOT_MIN_MS = 4600;
export const CORNERS = [{ x: 74, y: 168 }, { x: 406, y: 168 }, { x: 74, y: 278 }, { x: 406, y: 278 }];
export const PET_SCALE = 0.84;
export const TP = { out: 380, beam: 260, in: 440 };
const CLOSE = { cx: 148, foot: 276, scale: 1.0 };

// ------------------------------------------------------------ 载入

function bootRail(ctx, t, alpha) {
  // 参考图里的栏杆：人物趴在栏杆上，透视略收拢
  const y1 = 262;
  const y2 = 296;
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
    const top = y1 + 6 - (px / W) * 10;
    ctx.moveTo(px, top); ctx.lineTo(px, H);
  }
  ctx.stroke();
}

function bootRain(ctx, t, alpha) {
  const chars = '鲸潮汐光旅行鱼泡贝星港夜市温室月面01';
  font(ctx, 10, 400, true);
  ctx.textAlign = 'center';
  for (let col = 0; col < 5; col += 1) {
    const x = col < 4 ? 10 + col * 13 : W - 7;
    const speed = 0.05 + hash(col) * 0.06;
    const head = ((t * speed + hash(col * 9) * 400) % 420) - 60;
    for (let k = 0; k < 9; k += 1) {
      const y = head - k * 13;
      if (y < 8 || y > H) continue;
      const ch = chars[Math.floor(hash(col * 31 + k + Math.floor(t / 180)) * chars.length)];
      ctx.fillStyle = G((k === 0 ? 0.7 : 0.32 - k * 0.03) * alpha);
      ctx.fillText(ch, x, y);
    }
  }
}

export function drawBoot(ctx, v) {
  const t = v.now - v.bootAt;
  const cache = v.cache;
  const holo = cache.holo;
  const leaving = v.bootLeaveAt ? clamp01((v.now - v.bootLeaveAt) / 700) : 0;
  // 0–520ms：显像管开机线
  if (t < 520) {
    const p = ease(t / 520);
    const w = W * Math.min(1, p * 1.6);
    const h = Math.max(1, p > 0.6 ? (p - 0.6) * 60 : 1);
    fillRect(ctx, (W - w) / 2, H / 2 - h / 2, w, h, 0.9);
    fillRect(ctx, (W - w * 0.4) / 2, H / 2 - h * 3, w * 0.4, h * 6, 0.08);
    return;
  }
  const a = 1 - leaving;
  const flicker = t < 900 ? (hash(Math.floor(t / 45)) > 0.4 ? 1 : 0.35) : 1;
  bootRain(ctx, t, 0.55 * a);
  // 地面透视网格
  ctx.strokeStyle = G(0.12 * a);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -6; i <= 6; i += 1) { ctx.moveTo(W / 2 + i * 12, 236); ctx.lineTo(W / 2 + i * 70, H); }
  for (let k = 0; k < 4; k += 1) {
    const yy = 240 + Math.pow((k + ((t / 900) % 1)) / 4, 2) * 80;
    ctx.moveTo(0, yy); ctx.lineTo(W, yy);
  }
  ctx.stroke();

  // 全息人像：扫描光束自上而下显现
  if (holo) {
    const scale = 0.94;
    const w = holo.w * scale;
    const h = holo.h * scale;
    const x = 18;
    const y = 300 - h;
    const reveal = clamp01((t - 520) / 1900);
    const beamY = y + h * ease(reveal);
    const squash = leaving ? 1 - ease(leaving) : 1;
    const breathe = 1 + Math.sin(t / 900) * 0.006;
    const dh = h * squash * breathe;
    const dy = y + (h - dh) / 2;
    ctx.save();
    ctx.beginPath();
    rectPath(ctx, 0, 0, W, leaving ? H : beamY);
    ctx.clip();
    // 外发光：放大的低亮度底影
    ctx.globalAlpha = 0.16 * a * flicker;
    ctx.drawImage(holo.canvas, x - 4, dy - 4, w + 8, dh + 8);
    ctx.globalAlpha = 0.95 * a * flicker;
    ctx.drawImage(holo.canvas, x, dy, w, dh);
    ctx.globalAlpha = 1;
    ctx.restore();
    const box = { x, y: dy, w, h: dh };
    const glitchAmount = t < 2600 ? 0.55 : hash(Math.floor(t / 900)) > 0.7 ? 0.4 : 0.08;
    if (!leaving) tear(ctx, holo, box, t, glitchAmount);
    scanlines(ctx, 0, y - 10, x + w + 20, h + 20, t, 0.32, 3);
    if (reveal < 1) {
      fillRect(ctx, 0, beamY - 1, x + w + 30, 2, 0.95);
      fillRect(ctx, 0, beamY - 7, x + w + 30, 6, 0.12);
      for (let i = 0; i < 12; i += 1) circle(ctx, x + hash(i + Math.floor(t / 60)) * w, beamY - hash(i * 3) * 24, 1, 0.7, true);
    }
    if (leaving) {
      const cy = dy + dh / 2;
      fillRect(ctx, x + w * 0.5 * ease(leaving), cy - 1, w * (1 - ease(leaving)), 2, 0.9 * (1 - leaving));
    }
  }
  bootRail(ctx, t, a);

  // 右侧：标题与启动日志
  const tx = 300;
  if (t > 1400) {
    const p = clamp01((t - 1400) / 600);
    glitchText(ctx, TITLE, tx, 66, 30, p * a, t);
    text(ctx, '全 息 桌 宠  ·  第 一 号 投 影', tx + 1, 86, 10, 0.5 * p * a);
    line(ctx, tx, 96, tx + 150 * p, 96, 0.6 * a);
    fillRect(ctx, tx, 94, 18 * p, 4, 0.8 * a);
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
  const segs = Math.floor(p * 21);
  for (let i = 0; i < segs; i += 1) fillRect(ctx, tx + 2 + i * 7.8, by + 2, 6, 4, 0.85 * a);
  text(ctx, `载入 ${Math.floor(p * 100)}%`, tx, by - 6, 10, 0.7 * a, 'left', 400, true);
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

function petPose(v, t) {
  const pet = v.pet;
  const age = v.now - pet.actAt;
  let name = 'front';
  let dy = Math.sin(t / 650) * 1.6;
  let dx = 0;
  let alpha = 1;
  let sy = 1 + Math.sin(t / 650) * 0.008;
  switch (pet.act) {
    case 'gaze': {
      name = 'back';
      const turn = Math.floor(age / 2600) % 4 === 3;
      if (turn) name = pet.corner % 2 === 0 ? 'side' : 'sideL';
      dx = Math.sin(t / 1200) * 1;
      break;
    }
    case 'play': {
      const phase = Math.floor(age / 2200) % 3;
      if (phase === 2) {
        const spin = ['front', 'side', 'back', 'sideL'];
        name = spin[Math.floor(age / 140) % 4];
        dy = -Math.abs(Math.sin(age / 180)) * 6;
      } else {
        const toCenter = pet.corner % 2 === 0;
        name = (phase === 0) === toCenter ? 'side' : 'sideL';
        dy = -Math.abs(Math.sin(age / 210)) * 11;
        dx = (phase === 0 ? 1 : -1) * (toCenter ? 1 : -1) * Math.sin(age / 700) * 8;
        sy = dy > -1.5 ? 0.95 : 1.02;
      }
      break;
    }
    case 'doze':
      name = 'front';
      alpha = 0.72 + Math.sin(t / 1400) * 0.06;
      dy = Math.sin(t / 1400) * 1.2 + 2;
      sy = 0.985 + Math.sin(t / 1400) * 0.012;
      break;
    case 'hum':
      name = Math.floor(age / 1800) % 2 ? 'front' : (pet.corner % 2 === 0 ? 'side' : 'sideL');
      dx = Math.sin(t / 420) * 2.5;
      dy = -Math.abs(Math.sin(t / 420)) * 3;
      break;
    case 'wave':
      name = 'front';
      dy = -Math.abs(Math.sin(age / 150)) * 5;
      break;
    default:
      if (age % 7000 > 6200) name = pet.corner % 2 === 0 ? 'side' : 'sideL';
  }
  return { name, dx, dy, alpha, sy };
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
      text(ctx, '♪', cx + (pet.corner % 2 ? -30 : 30) + Math.sin(k * 6) * 5, box.y + 20 - k * 34, 13, 0.85 * (1 - k), 'center');
    }
  } else if (pet.act === 'play') {
    for (let i = 0; i < 4; i += 1) {
      const k = ((age / 3000) + i / 4) % 1;
      const bx = cx + (pet.corner % 2 ? -1 : 1) * (26 + i * 9) + Math.sin(k * 8 + i) * 6;
      circle(ctx, bx, box.y + box.h - 10 - k * 90, 2 + i * 1.2, 0.7 * (1 - k));
    }
  } else if (pet.act === 'gaze') {
    const sx = cx + (pet.corner % 2 ? -46 : 46);
    for (let i = 0; i < 3; i += 1) sparkle(ctx, sx + (hash(i) - 0.5) * 30, box.y + 10 + hash(i + 5) * 30, 2 + 1.5 * Math.sin(t / 300 + i * 2), 0.6);
  }
  if (pet.mutter && v.now - pet.mutter.at < 2600) {
    const a = clamp01((2600 - (v.now - pet.mutter.at)) / 500);
    const right = pet.corner % 2 === 0;
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

function drawPetAt(ctx, v, corner, t, reveal, seed) {
  const pos = CORNERS[corner];
  platform(ctx, pos.x, pos.y, t, clamp01(reveal * 1.5));
  const pose = petPose(v, t);
  const spr = v.cache[pose.name];
  const box = sprite(ctx, spr, pos.x + pose.dx, pos.y + pose.dy, PET_SCALE, pose.alpha, 1, pose.sy);
  if (!box) return null;
  // 小尺寸下线条被平均变暗：叠第二遍提高淡填充的亮度（真机截图显示单遍偏暗）。
  sprite(ctx, spr, pos.x + pose.dx, pos.y + pose.dy, PET_SCALE, pose.alpha * 0.5, 1, pose.sy);
  scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.14, 4);
  if (hash(Math.floor(t / 1300)) > 0.86) tear(ctx, spr, box, t, 0.35);
  if (reveal < 1) dissolve(ctx, box, reveal, seed);
  return box;
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
    if (!tp) drawPetAt(ctx, v, pet.corner, t, 1, 0);
    else {
      const age = v.now - tp.at;
      const seed = Math.floor(tp.at / 7);
      if (tp.kind === 'move') {
        if (age < TP.out) drawPetAt(ctx, v, tp.from, t, 1 - age / TP.out, seed);
        else if (age < TP.out + TP.beam) beam(ctx, { x: CORNERS[tp.from].x, y: CORNERS[tp.from].y - 50 }, { x: CORNERS[tp.to].x, y: CORNERS[tp.to].y - 50 }, (age - TP.out) / TP.beam);
        else drawPetAt(ctx, v, tp.to, t, ease((age - TP.out - TP.beam) / TP.in), seed + 1);
      } else if (tp.kind === 'return') {
        // 从近景回到角落
        const c = CORNERS[tp.to];
        if (age < TP.beam) beam(ctx, { x: CLOSE.cx, y: 180 }, { x: c.x, y: c.y - 50 }, age / TP.beam);
        else drawPetAt(ctx, v, tp.to, t, ease((age - TP.beam) / TP.in), seed);
      } else if (tp.kind === 'depart') {
        const c = CORNERS[pet.corner];
        if (age < 1500) drawPetAt(ctx, v, pet.corner, t, 1, seed);
        else if (age < 1500 + TP.out) drawPetAt(ctx, v, pet.corner, t, 1 - (age - 1500) / TP.out, seed);
        else beam(ctx, { x: c.x, y: c.y - 50 }, { x: c.x + (c.x < W / 2 ? 60 : -60), y: -20 }, (age - 1500 - TP.out) / 500);
      } else if (tp.kind === 'arrive') {
        const c = CORNERS[pet.corner];
        if (age < 500) beam(ctx, { x: c.x + (c.x < W / 2 ? 60 : -60), y: -20 }, { x: c.x, y: c.y - 50 }, age / 500);
        else drawPetAt(ctx, v, pet.corner, t, ease((age - 500) / TP.in), seed);
      }
    }
    if (!tp && pet.present) {
      const pos = CORNERS[pet.corner];
      const spr = v.cache.front;
      if (spr) petEffects(ctx, v, { x: pos.x - (spr.w * PET_SCALE) / 2, y: pos.y - spr.h * PET_SCALE, w: spr.w * PET_SCALE, h: spr.h * PET_SCALE }, t);
    }
  }
  drawDock(ctx, v.dock, v.dockFocus, v.now, 1, { album: g.unread > 0, pack: !!g.pack.food });
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

export const SHELL_SPOTS = [{ x: 168, y: 58 }, { x: 312, y: 62 }, { x: 214, y: 250 }, { x: 268, y: 246 }];
function drawShells(ctx, v) {
  const n = Math.min(SHELL_MAX, v.g.shells.count);
  for (let i = 0; i < n; i += 1) {
    const s = SHELL_SPOTS[i];
    const bob = Math.sin(v.now / 700 + i * 1.3) * 3;
    const glow = 0.55 + 0.3 * Math.sin(v.now / 500 + i);
    circle(ctx, s.x, s.y + bob, 11, glow * 0.25, false);
    shellIcon(ctx, s.x, s.y + bob, 6, glow);
  }
}

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

const MOOD_SPRITE = { smug: 'smug', wow: 'wow', pout: 'pout', think: 'think' };

export function drawClose(ctx, v) {
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
  const spr = v.cache[MOOD_SPRITE[c.mood] || 'smug'];
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
  drawBubble(ctx, v, reveal);
  drawDock(ctx, v.dock, v.dockFocus, v.now, reveal);
  drawToast(ctx, v);
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
  if (v.speechUntil > v.now) {
    // 朗读指示：气泡上方三根跳动的短条（时长按字数估计，不代表播放器真实进度）
    for (let i = 0; i < 3; i += 1) {
      const amp = 3 + Math.abs(Math.sin(v.now / 130 + i * 1.3)) * 6;
      fillRect(ctx, x + w - 30 + i * 6, y - 6 - amp, 3, amp, 0.75 * alpha);
    }
  }
  const age = v.now - bubble.at;
  const shown = Math.floor(age / 45);
  const lines = wrap(ctx, bubble.text, w - 26, 14, 4);
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
    const spr = v.cache[g.pack.food ? 'front' : 'side'];
    if (spr && !g.trip) sprite(ctx, spr, 420, 128 + Math.sin(t / 600) * 1.5, 0.42, 0.85);
    ITEM_ORDER.forEach((id, i) => {
      const item = ITEMS[id];
      const packed = g.pack[item.kind] === id;
      row(ctx, 136 + i * 26, m.focus === i, item.name, packed ? '已放入' : `持有 ${g.stock[id]}`, item.desc, g.stock[id] || packed ? 1 : 0.5);
    });
  } else if (m.kind === 'shop') {
    panel(ctx, '商店', `鳞光 ${g.scales}`, v);
    ITEM_ORDER.forEach((id, i) => {
      const item = ITEMS[id];
      row(ctx, 96 + i * 32, m.focus === i, item.name, `${item.price} 鳞光`, item.desc, g.scales >= item.price ? 1 : 0.5);
    });
    text(ctx, '每天摸摸头、聊聊天、拾取浮光贝都能获得鳞光', W / 2, 270, 10, 0.4, 'center');
  } else if (m.kind === 'album') {
    const cards = g.postcards.slice().reverse();
    panel(ctx, '明信片', `共 ${cards.length} 张`, v);
    if (!cards.length) {
      text(ctx, '还没有收到明信片', W / 2, 160, 13, 0.55, 'center');
      text(ctx, '让她去旅行，她会从路上寄回来', W / 2, 182, 11, 0.4, 'center');
    }
    const start = Math.max(0, Math.min(m.focus - 2, cards.length - 6));
    cards.slice(start, start + 6).forEach((card, i) => {
      const index = start + i;
      const d = new Date(card.at);
      row(ctx, 94 + i * 30, m.focus === index, destById(card.dest).name, `${d.getMonth() + 1}月${d.getDate()}日`, card.read ? card.line : '新 · 未读', card.read ? 0.8 : 1);
    });
  } else if (m.kind === 'dex') {
    panel(ctx, '纪念品图鉴', `收集 ${collected(g)} / ${totalGifts()}`, v);
    DESTS.forEach((dest, di) => {
      const y = 92 + di * 25;
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
    const dest = DESTS[Math.floor(m.focus / 3)];
    const gift = dest.gifts[m.focus % 3];
    const have = g.souvenirs[gift.id];
    line(ctx, 32, 248, W - 32, 248, 0.2);
    text(ctx, have ? `${RARE_NAMES[gift.rare]} · ${gift.desc}` : `${RARE_NAMES[gift.rare]} · 去${dest.name}或许能找到`, 36, 268, 11, 0.7);
    if (have > 1) text(ctx, `×${have}`, W - 36, 268, 11, 0.6, 'right');
  }
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
  const dest = destById(pending.dest);
  const gift = dest.gifts.find(item => item.id === pending.gift);
  drawTopBar(ctx, v, 0.6);
  const spr = v.cache.wow;
  const reveal = ease(age / 520);
  const box = sprite(ctx, spr, 132, 296 + Math.sin(v.now / 800) * 2, 0.92, 0.95);
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
  for (let r = 0; r <= gift.rare; r += 1) diamond(ctx, x + 100 + (r - gift.rare / 2) * 14, y + 62, 6, 0.95 * p, true);
  text(ctx, `${dest.name}的礼物`, x + 100, y + 2, 12, 0.6 * p, 'center');
  glitchText(ctx, gift.name, x + 100, y + 124, 19, p, v.now, 'center');
  text(ctx, RARE_NAMES[gift.rare], x + 100, y + 144, 11, 0.6 * p, 'center');
  const lines = wrap(ctx, gift.desc, 190, 11, 2);
  lines.forEach((ln, i) => text(ctx, ln, x + 100, y + 166 + i * 16, 11, 0.7 * p, 'center'));
  text(ctx, `＋${pending.scales} 鳞光`, x + 100, y + 210, 13, 0.9 * p, 'center', 700);
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
