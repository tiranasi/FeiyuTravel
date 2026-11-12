// 明信片：六个目的地的程序化线稿场景，角色使用Q版三视图精灵。
import { rectPath, G, TAU, hash, line, circle, ellipse, sparkle, sprite, text } from './draw.js';

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

export function drawPostcardScene(ctx, card, x, y, w, h, t, cache) {
  ctx.save();
  ctx.beginPath();
  rectPath(ctx, x, y, w, h);
  ctx.clip();
  const scene = SCENES[card.scene || card.dest] || SCENES.market;
  scene(ctx, x, y, w, h, t);
  const seed = Math.floor((card.at || 0) / 1000);
  const px = x + w * (0.18 + hash(seed) * 0.3);
  const bob = Math.sin(t / 500) * 1.5;
  const spr = cache && cache[POSE_SPRITE[card.pose] || 'side'];
  if (spr) sprite(ctx, spr, px, y + h - 10 + bob, 0.62, 0.95);
  ctx.restore();
}

export const SCENE_FOR = { market: 'market', alley: 'alley', dome: 'dome', abyss: 'abyss', harbor: 'harbor', moon: 'moon' };
export { text };
