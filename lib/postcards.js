// 明信片：只画用户确认的插画（card_*，打开时按需解码），上面叠一层 Canvas 动效。
// 插画没解好时只显示“冲印中”扫描线；解好后从黑底显影淡入（0.8.6 起不再画旧的程序线稿）。
import { blit, rectPath, G, TAU, hash, ease, clamp01, line, circle, ellipse, sparkle, heart, text } from './draw.js';
import { cardArtId } from './content.js';

function rain(ctx, x, y, w, h, t, alpha) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 34; i += 1) {
    const rx = x + hash(i * 5) * w;
    const ry = y + ((hash(i * 9) * h + t / 4) % h);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 2, ry + 7);
  }
  ctx.stroke();
}

// ---------------------------------------------------------- 插画动效
// 坐标都按画框比例（u, v ∈ 0..1），位置对照 build/art/souvenir/ 预览估出。
function rise(ctx, x, y, w, h, t, n, seed, region, alpha, size = 1.6) {
  const [u0, u1, v0, v1] = region;
  for (let i = 0; i < n; i += 1) {
    const k = (t / (2600 + hash(seed + i) * 2200) + hash(seed + i * 7)) % 1;
    const px = x + (u0 + hash(seed + i * 3) * (u1 - u0)) * w + Math.sin(t / 400 + i) * 3;
    const py = y + (v1 - k * (v1 - v0)) * h;
    circle(ctx, px, py, size + hash(i) * 1.2, alpha * Math.sin(k * Math.PI));
  }
}
function twinkle(ctx, x, y, w, h, t, n, seed, region, alpha) {
  const [u0, u1, v0, v1] = region;
  for (let i = 0; i < n; i += 1) {
    const sx = x + (u0 + hash(seed + i * 3) * (u1 - u0)) * w;
    const sy = y + (v0 + hash(seed + i * 7) * (v1 - v0)) * h;
    const tw = Math.max(0, Math.sin(t / (380 + hash(seed + i) * 500) + i * 1.7));
    if (hash(seed + i * 11) > 0.6) sparkle(ctx, sx, sy, 2 + tw * 1.5, alpha * tw);
    else circle(ctx, sx, sy, 0.9, alpha * (0.3 + 0.7 * tw), true);
  }
}
function meteor(ctx, x, y, w, h, t, period, u0, v0, alpha) {
  const k = (t % period) / 900;
  if (k > 1) return;
  const sx = x + (u0 + k * 0.28) * w;
  const sy = y + (v0 + k * 0.16) * h;
  const a = alpha * Math.sin(k * Math.PI);
  ctx.strokeStyle = G(a);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx - 0.1 * w, sy - 0.057 * h);
  ctx.stroke();
  sparkle(ctx, sx, sy, 3, a);
}
function ripples(ctx, x, y, w, h, t, points, alpha) {
  points.forEach(([u, v], i) => {
    const k = ((t + i * 900) % 2400) / 2400;
    ellipse(ctx, x + u * w, y + v * h, 4 + k * 22, 1 + k * 4, alpha * (1 - k));
  });
}
function wind(ctx, x, y, w, h, t, alpha) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 7; i += 1) {
    const k = (t / 900 + hash(i * 5)) % 1;
    const wx = x + (k * 1.3 - 0.2) * w;
    const wy = y + (0.15 + hash(i * 9) * 0.6) * h;
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 14, wy - 3, wx + 30, wy);
  }
  ctx.stroke();
}
function steam(ctx, x, y, w, h, t, u, v, alpha) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const k = (t / 1400 + i / 3) % 1;
    const sx = x + u * w + (i - 1) * 6;
    const sy = y + v * h - k * 26;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 4, sy - 5, sx, sy - 10);
    ctx.quadraticCurveTo(sx - 4, sy - 15, sx, sy - 20);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// 灯光：实心柔光晕（三层低亮度圆叠出由内到外的衰减），像烛火一样不规则地明暗，不画描边圈
function glow(ctx, x, y, w, h, t, points, alpha, r = 9) {
  points.forEach(([u, v], i) => {
    const p = 0.6 + 0.25 * Math.sin(t / 430 + i * 1.9) + 0.15 * Math.sin(t / 157 + i * 4.1);
    halo(ctx, x + u * w, y + v * h, r, alpha * p);
  });
}
function halo(ctx, cx, cy, r, alpha) {
  circle(ctx, cx, cy, r * 1.9, 0.08 * alpha, true);
  circle(ctx, cx, cy, r * 1.35, 0.12 * alpha, true);
  circle(ctx, cx, cy, r * 0.85, 0.18 * alpha, true);
}
function notes(ctx, x, y, w, h, t, u, v, alpha) {
  for (let i = 0; i < 3; i += 1) {
    const k = (t / 2200 + i / 3) % 1;
    const nx = x + u * w + k * 30 + Math.sin(t / 300 + i) * 3;
    const ny = y + v * h - k * 40;
    text(ctx, i % 2 ? '♪' : '♫', nx, ny, 11, alpha * Math.sin(k * Math.PI), 'center');
  }
}

const FX = {
  card_market_1(c, x, y, w, h, t) {
    // 四盏普通灯笼：柔光晕各自摇曳（位置按插画里灯笼身中心）
    glow(c, x, y, w, h, t, [[0.167, 0.2], [0.265, 0.23], [0.676, 0.2], [0.765, 0.17]], 0.9, 11);
    // 中间那盏会眨眼的灯笼：平时稳定发光，每 2.6 秒眨一下——光晕一亮，旁边蹦出两颗小火花
    const k = (t % 2600) / 2600;
    const wink = k < 0.09 ? Math.sin((k / 0.09) * Math.PI) : 0;
    const cx = x + 0.574 * w;
    const cy = y + 0.25 * h;
    halo(c, cx, cy, 15 + wink * 4, 0.9 + wink * 1.2);
    if (wink > 0) {
      sparkle(c, cx - 26 - wink * 4, cy - 14 - wink * 3, 2 + wink * 2.5, wink);
      sparkle(c, cx + 25 + wink * 4, cy - 17 - wink * 3, 1.5 + wink * 2, 0.8 * wink);
    }
  },
  card_market_2(c, x, y, w, h, t) { steam(c, x, y, w, h, t, 0.64, 0.44, 0.55); steam(c, x, y, w, h, t + 700, 0.28, 0.3, 0.4); },
  card_market_3(c, x, y, w, h, t) { ripples(c, x, y, w, h, t, [[0.44, 0.88], [0.58, 0.92], [0.7, 0.86]], 0.5); glow(c, x, y, w, h, t, [[0.15, 0.17], [0.85, 0.15]], 0.25, 6); },
  card_alley_1(c, x, y, w, h, t) { rain(c, x + w * 0.45, y, w * 0.55, h, t, 0.28); },
  card_alley_2(c, x, y, w, h, t) { rise(c, x, y, w, h, t, 8, 71, [0.2, 0.95, 0.2, 0.85], 0.35, 0.8); glow(c, x, y, w, h, t, [[0.39, 0.12]], 0.3, 6); },
  card_alley_3(c, x, y, w, h, t) { rain(c, x, y, w, h, t, 0.24); glow(c, x, y, w, h, t, [[0.11, 0.18]], 0.35, 7); },
  card_dome_1(c, x, y, w, h, t) { rise(c, x, y, w, h, t, 10, 31, [0.35, 0.8, 0.3, 0.9], 0.5, 1); },
  card_dome_2(c, x, y, w, h, t) { notes(c, x, y, w, h, t, 0.62, 0.38, 0.8); },
  card_dome_3(c, x, y, w, h, t) { twinkle(c, x, y, w, h, t, 14, 51, [0.15, 0.95, 0.05, 0.4], 0.7); meteor(c, x, y, w, h, t, 7000, 0.4, 0.08, 0.7); },
  card_abyss_1(c, x, y, w, h, t) { rise(c, x, y, w, h, t, 12, 11, [0.1, 0.95, 0.1, 0.95], 0.45); },
  card_abyss_2(c, x, y, w, h, t) { rise(c, x, y, w, h, t, 8, 21, [0.05, 0.95, 0.1, 0.95], 0.4); glow(c, x, y, w, h, t, [[0.5, 0.38], [0.6, 0.4], [0.7, 0.4]], 0.3, 6); },
  card_abyss_3(c, x, y, w, h, t) {
    rise(c, x, y, w, h, t, 5, 41, [0.3, 0.7, 0.2, 0.9], 0.35);
    // 远处一盏小灯，慢慢明灭
    const p = 0.5 + 0.5 * Math.sin(t / 900);
    circle(c, x + 0.86 * w, y + 0.62 * h, 2 + p * 3, 0.3 + 0.5 * p, true);
  },
  card_harbor_1(c, x, y, w, h, t) { twinkle(c, x, y, w, h, t, 12, 61, [0.4, 0.98, 0.05, 0.45], 0.7); ripples(c, x, y, w, h, t, [[0.78, 0.72], [0.9, 0.78]], 0.35); },
  card_harbor_2(c, x, y, w, h, t) { wind(c, x, y, w, h, t, 0.35); },
  card_harbor_3(c, x, y, w, h, t) { twinkle(c, x, y, w, h, t, 12, 81, [0.05, 0.95, 0.05, 0.45], 0.6); meteor(c, x, y, w, h, t, 4200, 0.12, 0.06, 0.85); },
  card_moon_1(c, x, y, w, h, t) { twinkle(c, x, y, w, h, t, 12, 91, [0.25, 0.98, 0.04, 0.45], 0.6); },
  card_moon_2(c, x, y, w, h, t) {
    twinkle(c, x, y, w, h, t, 8, 101, [0.05, 0.6, 0.05, 0.5], 0.5);
    // 她落地时脚下扬起月尘
    const k = (t % 1800) / 1800;
    for (let i = 0; i < 5; i += 1) circle(c, x + (0.4 + (i - 2) * 0.03 * (1 + k * 2)) * w, y + (0.93 - k * 0.06) * h, 1.2, 0.5 * (1 - k), true);
  },
  card_moon_3(c, x, y, w, h, t) {
    twinkle(c, x, y, w, h, t, 14, 111, [0.05, 0.95, 0.04, 0.5], 0.6);
    // 心跳：一次“咚咚”两下，胸口泛起圆环和小爱心
    const ms = t % 1400;
    for (const s of [0, 220]) {
      const k = (ms - s) / 700;
      if (k > 0 && k < 1) circle(c, x + 0.5 * w, y + 0.62 * h, 8 + k * 26, 0.5 * (1 - k));
    }
    heart(c, x + 0.56 * w, y + (0.42 - (ms / 1400) * 0.08) * h, 4, 0.6 * Math.sin((ms / 1400) * Math.PI));
  }
};

// 显影：每次重新看到这张插画（打开、翻页、换槽后重新解码）都从黑底淡入
const FADE_MS = 380;
const REOPEN_MS = 250;   // 超过这么久没画过，就算重新打开
const shown = new Map();

export function drawPostcardScene(ctx, card, x, y, w, h, t, cache) {
  const id = cardArtId(card);
  const art = id && cache && cache[id];
  ctx.save();
  ctx.beginPath();
  rectPath(ctx, x, y, w, h);
  ctx.clip();
  if (art) {
    let seen = shown.get(id);
    if (!seen || t - seen.last > REOPEN_MS || t < seen.start) seen = { start: t, last: t };
    seen.last = t;
    shown.set(id, seen);
    const k = ease(clamp01((t - seen.start) / FADE_MS));
    ctx.globalAlpha = k;
    blit(ctx, art, x, y, w, h);
    ctx.globalAlpha = 1;
    const fx = FX[id];
    if (fx && k > 0.5) fx(ctx, x, y, w, h, t);
    // 显影线：从上往下扫过，扫完消失
    if (k < 1) line(ctx, x, y + k * h, x + w, y + k * h, 0.5 * (1 - k));
  } else {
    if (id) shown.delete(id);
    // 冲印中：一条扫描线从上往下，中间一行小字
    const k = (t % 900) / 900;
    line(ctx, x, y + k * h, x + w, y + k * h, 0.35);
    text(ctx, id ? '冲印中…' : '这张明信片的插画找不到了', x + w / 2, y + h / 2 + 4, 12, 0.4, 'center');
  }
  ctx.restore();
}
