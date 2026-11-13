// 明信片：优先画用户确认的插画（card_*，打开时按需解码），上面叠一层 Canvas 动效；
// 插画未就绪时画程序化线稿场景加 Q 版动作帧。
import { blit, rectPath, G, TAU, hash, ease, clamp01, line, circle, ellipse, sparkle, heart, sprite, text } from './draw.js';
import { cardArtId } from './content.js';

function stars(ctx, x, y, w, h, n, seed, t) {
  for (let i = 0; i < n; i += 1) {
    const sx = x + hash(seed + i * 3) * w;
    const sy = y + hash(seed + i * 7) * h;
    const tw = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t / 500 + i));
    if (hash(seed + i) > 0.85) sparkle(ctx, sx, sy, 2.5, tw);
    else circle(ctx, sx, sy, 0.8, tw, true);
  }
}

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

const SCENES = {
  market(ctx, x, y, w, h, t) {
    // 灯笼串、遮雨棚、湿地面倒影
    for (let row = 0; row < 2; row += 1) {
      const sy = y + 22 + row * 20;
      ctx.strokeStyle = G(0.35);
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.quadraticCurveTo(x + w / 2, sy + 22, x + w, sy);
      ctx.stroke();
      for (let i = 1; i < 9; i += 1) {
        const lx = x + (w * i) / 9;
        const ly = sy + Math.sin((i / 9) * Math.PI) * 11 + 6;
        const glow = 0.5 + 0.4 * Math.sin(t / 300 + i * 1.7 + row);
        ellipse(ctx, lx, ly, 4, 5.5, glow, 1.2);
        line(ctx, lx, ly - 5.5, lx, ly - 9, 0.4);
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const sx = x + 14 + i * (w / 3);
      const sw = w / 3 - 28;
      const top = y + h - 70;
      ctx.strokeStyle = G(0.55);
      ctx.beginPath();
      ctx.moveTo(sx - 6, top);
      for (let k = 0; k <= 5; k += 1) ctx.quadraticCurveTo(sx + (sw * (k - 0.5)) / 5, top + 9, sx + (sw * k) / 5, top);
      ctx.stroke();
      line(ctx, sx, top, sx, y + h - 24, 0.35);
      line(ctx, sx + sw, top, sx + sw, y + h - 24, 0.35);
      line(ctx, sx - 2, y + h - 40, sx + sw + 2, y + h - 40, 0.45);
    }
    line(ctx, x, y + h - 24, x + w, y + h - 24, 0.4);
    for (let i = 0; i < 10; i += 1) line(ctx, x + hash(i) * w, y + h - 18 + hash(i + 3) * 14, x + hash(i) * w + 16, y + h - 18 + hash(i + 3) * 14, 0.18);
    rain(ctx, x, y, w, h, t, 0.18);
  },
  alley(ctx, x, y, w, h, t) {
    // 一点透视的小巷与亮着灯的书屋窗
    const vx = x + w * 0.62;
    const vy = y + h * 0.42;
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) line(ctx, px, py, vx + (px - vx) * 0.18, vy + (py - vy) * 0.18, 0.28);
    for (let i = 1; i < 6; i += 1) {
      const k = 1 - i * 0.15;
      line(ctx, vx + (x - vx) * k, vy + (y + h * 0.15 - vy) * k, vx + (x - vx) * k, vy + (y + h - vy) * k, 0.25);
    }
    const wx = x + w * 0.70;
    const wy = y + h * 0.30;
    ctx.fillStyle = G(0.10 + 0.03 * Math.sin(t / 700));
    ctx.fillRect(wx, wy, 52, 40);
    ctx.strokeStyle = G(0.7);
    ctx.strokeRect(wx, wy, 52, 40);
    for (let i = 1; i < 4; i += 1) line(ctx, wx + 2, wy + i * 10, wx + 50, wy + i * 10, 0.4);
    for (let i = 0; i < 12; i += 1) line(ctx, wx + 4 + i * 4, wy + 30, wx + 4 + i * 4, wy + 22 + hash(i) * 6, 0.5);
    ellipse(ctx, x + w * 0.45, y + h - 16, 60, 6, 0.2);
    rain(ctx, x, y, w, h, t, 0.3);
  },
  dome(ctx, x, y, w, h, t) {
    const cx = x + w / 2;
    const base = y + h - 20;
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = G(0.45 - i * 0.07);
      ctx.beginPath();
      const rx = w * 0.46 - i * 26;
      const ry = h * 0.82 - i * 18;
      for (let k = 0; k <= 32; k += 1) {
        const a = Math.PI + (k / 32) * Math.PI;
        if (k) ctx.lineTo(cx + Math.cos(a) * rx, base + Math.sin(a) * ry); else ctx.moveTo(cx + Math.cos(a) * rx, base + Math.sin(a) * ry);
      }
      ctx.stroke();
    }
    for (let i = -3; i <= 3; i += 1) line(ctx, cx, base - h * 0.82, cx + i * w * 0.15, base, 0.2);
    stars(ctx, cx - w * 0.3, y + 8, w * 0.6, h * 0.35, 18, 41, t);
    for (let i = 0; i < 9; i += 1) {
      const px = x + 20 + i * ((w - 40) / 8);
      const ph = 16 + hash(i * 5) * 26;
      const sway = Math.sin(t / 900 + i) * 3;
      ctx.strokeStyle = G(0.55 + 0.25 * Math.sin(t / 600 + i));
      ctx.beginPath();
      ctx.moveTo(px, base);
      ctx.quadraticCurveTo(px + sway, base - ph / 2, px + sway * 2, base - ph);
      ctx.moveTo(px + sway, base - ph / 2);
      ctx.quadraticCurveTo(px + 9, base - ph * 0.7, px + 12, base - ph * 0.5);
      ctx.moveTo(px + sway * 1.5, base - ph * 0.75);
      ctx.quadraticCurveTo(px - 9, base - ph * 0.9, px - 11, base - ph * 0.7);
      ctx.stroke();
    }
    line(ctx, x, base, x + w, base, 0.5);
  },
  abyss(ctx, x, y, w, h, t) {
    for (let i = 0; i < 4; i += 1) {
      const py = y + h - 18 - i * 10;
      line(ctx, x, py, x + w * (0.3 + i * 0.1), py, 0.35);
      circle(ctx, x + w * (0.3 + i * 0.1), py, 3, 0.5);
    }
    ctx.strokeStyle = G(0.45);
    ctx.strokeRect(x + w * 0.72, y + h * 0.45, 46, h * 0.55 - 18);
    for (let i = 0; i < 3; i += 1) line(ctx, x + w * 0.72 + 6, y + h * 0.52 + i * 12, x + w * 0.72 + 40, y + h * 0.52 + i * 12, 0.3 + 0.3 * (Math.floor(t / 400 + i) % 2));
    for (let j = 0; j < 3; j += 1) {
      const jx = x + w * (0.25 + j * 0.22);
      const jy = y + 30 + Math.sin(t / 800 + j * 2) * 8 + j * 12;
      ctx.strokeStyle = G(0.65);
      ctx.beginPath();
      ctx.arc(jx, jy, 10, Math.PI, TAU);
      ctx.lineTo(jx - 10, jy);
      ctx.stroke();
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        const tx = jx - 7 + k * 4.5;
        ctx.moveTo(tx, jy);
        ctx.quadraticCurveTo(tx + Math.sin(t / 300 + k) * 3, jy + 8, tx, jy + 16);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 14; i += 1) {
      const bx = x + hash(i * 3) * w;
      const by = y + h - ((t / 25 + hash(i) * h) % h);
      circle(ctx, bx, by, 1.5 + hash(i * 7) * 2.5, 0.35);
    }
  },
  harbor(ctx, x, y, w, h, t) {
    stars(ctx, x, y + 4, w, h * 0.45, 30, 7, t);
    circle(ctx, x + w * 0.82, y + 26, 12, 0.7);
    const sea = y + h * 0.62;
    line(ctx, x, sea, x + w, sea, 0.45);
    for (let i = 0; i < 6; i += 1) {
      const wy = sea + 6 + i * 6;
      const off = (t / 40 + i * 13) % 30;
      ctx.setLineDash([10, 20]);
      ctx.lineDashOffset = -off;
      line(ctx, x, wy, x + w, wy, 0.22);
      ctx.setLineDash([]);
    }
    // 码头与渡轮
    line(ctx, x, y + h - 22, x + w * 0.45, y + h - 22, 0.65, 1.5);
    for (let i = 0; i < 5; i += 1) line(ctx, x + 10 + i * 24, y + h - 22, x + 10 + i * 24, y + h - 6, 0.4);
    const fx = x + w * 0.58 + Math.sin(t / 1600) * 3;
    ctx.strokeStyle = G(0.7);
    ctx.beginPath();
    ctx.moveTo(fx, sea - 2);
    ctx.lineTo(fx + 90, sea - 2);
    ctx.lineTo(fx + 80, sea + 8);
    ctx.lineTo(fx + 8, sea + 8);
    ctx.closePath();
    ctx.moveTo(fx + 22, sea - 2);
    ctx.lineTo(fx + 26, sea - 16);
    ctx.lineTo(fx + 62, sea - 16);
    ctx.lineTo(fx + 68, sea - 2);
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) circle(ctx, fx + 33 + i * 9, sea - 9, 1.6, 0.5 + 0.4 * Math.sin(t / 400 + i), true);
  },
  moon(ctx, x, y, w, h, t) {
    stars(ctx, x, y, w, h * 0.6, 36, 99, t);
    const ex = x + w * 0.72;
    const ey = y + h * 0.32;
    circle(ctx, ex, ey, 26, 0.75, false, 1.4);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, 26, 0, TAU);
    ctx.clip();
    for (let i = -3; i <= 3; i += 1) {
      const off = ((t / 120) % 20) - 10;
      ctx.strokeStyle = G(0.3);
      ctx.beginPath();
      ctx.moveTo(ex - 30 + off, ey + i * 8);
      ctx.quadraticCurveTo(ex + off, ey + i * 8 - 6, ex + 30 + off, ey + i * 8);
      ctx.stroke();
    }
    ctx.restore();
    const gy = y + h - 30;
    ctx.strokeStyle = G(0.6);
    ctx.beginPath();
    ctx.moveTo(x, gy + 8);
    ctx.quadraticCurveTo(x + w / 2, gy - 14, x + w, gy + 8);
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) ellipse(ctx, x + 30 + hash(i * 3) * (w - 60), gy + 10 + hash(i) * 12, 8 + hash(i * 5) * 10, 2.5 + hash(i) * 2, 0.35);
  }
};

const POSE_SPRITE = { side: 'side', back: 'back', front: 'front' };
// 每个目的地有专属的明信片动作帧（pc_*），未解码时回退到旧的三视图
const PLACE_SPRITE = { market: 'pc_market', alley: 'pc_alley', dome: 'pc_dome', abyss: 'pc_abyss', harbor: 'pc_harbor', moon: 'pc_moon' };

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

const seenAt = new Map();
// 插画淡入：第一次画出来的 380ms 内从程序场景过渡
function drawCardArt(ctx, art, id, x, y, w, h, t) {
  if (!seenAt.has(id)) seenAt.set(id, t);
  const k = ease(clamp01((t - seenAt.get(id)) / 380));
  ctx.globalAlpha = k;
  blit(ctx, art.canvas, x, y, w, h);
  ctx.globalAlpha = 1;
  const fx = FX[id];
  if (fx && k > 0.5) fx(ctx, x, y, w, h, t);
  return k;
}

export function drawPostcardScene(ctx, card, x, y, w, h, t, cache) {
  ctx.save();
  ctx.beginPath();
  rectPath(ctx, x, y, w, h);
  ctx.clip();
  const id = cardArtId(card);
  const art = id && cache && cache[id];
  if (art && drawCardArt(ctx, art, id, x, y, w, h, t) >= 1) { ctx.restore(); return; }
  if (art) ctx.globalAlpha = 1 - ease(clamp01((t - seenAt.get(id)) / 380));
  if (id && !art) {
    // 冲印中：一条扫描线从上往下
    const k = (t % 900) / 900;
    line(ctx, x, y + k * h, x + w, y + k * h, 0.35);
  }
  const scene = SCENES[card.scene || card.dest] || SCENES.market;
  scene(ctx, x, y, w, h, t);
  const seed = Math.floor((card.at || 0) / 1000);
  const px = x + w * (0.18 + hash(seed) * 0.3);
  const bob = Math.sin(t / 500) * 1.5;
  const spr = cache && (cache[PLACE_SPRITE[card.scene || card.dest]] || cache[POSE_SPRITE[card.pose] || 'side']);
  if (spr) sprite(ctx, spr, px, y + h - 10 + bob, 0.62, 0.95);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export const SCENE_FOR = { market: 'market', alley: 'alley', dome: 'dome', abyss: 'abyss', harbor: 'harbor', moon: 'moon' };
export { text };
