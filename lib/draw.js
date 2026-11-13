// 低层绘制工具：单色绿、文字、全息精灵特效。只用真机已画出的 Canvas 能力：
// rgba、globalAlpha、虚线、clip、路径/弧线、measureText、drawImage(缓存Canvas, x, y, w, h)。不使用 ctx.scale。
export const W = 480;
export const H = 320;
export const TAU = Math.PI * 2;
export const G = a => `rgba(64,255,94,${Math.max(0, Math.min(1, a)).toFixed(3)})`;
export const BLACK = a => `rgba(0,0,0,${a})`;

// 用 moveTo/lineTo 描矩形路径（只依赖真机已画出的路径方法）。
export function rectPath(ctx, x, y, w, h) {
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x27d4eb2d, 0x165667b1);
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13;
  return ((x >>> 0) % 100000) / 100000;
}
export const ease = p => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
export const clamp01 = p => Math.max(0, Math.min(1, p));

export function font(ctx, size, weight = 400, mono = false) {
  ctx.font = `${weight >= 600 ? 'bold ' : ''}${size}px ${mono ? 'monospace' : 'sans-serif'}`;
}

export function text(ctx, value, x, y, size, alpha, align = 'left', weight = 400, mono = false) {
  font(ctx, size, weight, mono);
  ctx.fillStyle = G(alpha);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(value), x, y);
}

// 带错位残影的标题字，模拟全息信号不稳。
export function glitchText(ctx, value, x, y, size, alpha, t, align = 'left') {
  const k = Math.floor(t / 110);
  const jitter = hash(k) > 0.82 ? (hash(k + 7) - 0.5) * 8 : 0;
  text(ctx, value, x + jitter - 1.5, y, size, alpha * 0.35, align, 700);
  text(ctx, value, x - jitter + 1.5, y + 0.5, size, alpha * 0.35, align, 700);
  text(ctx, value, x, y, size, alpha, align, 700);
}

export function wrap(ctx, value, maxWidth, size, maxLines = 4) {
  font(ctx, size);
  const lines = [];
  let line = '';
  for (const ch of String(value)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const next = line + ch;
    // 句读不放在行首：标点允许略微超出行宽
    if (ctx.measureText(next).width > maxWidth && line && !'，。、：；！？…）」’”'.includes(ch)) {
      lines.push(line);
      line = ch;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].slice(0, -1) + '…';
    return cut;
  }
  return lines;
}

export function line(ctx, x1, y1, x2, y2, alpha, width = 1) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function rect(ctx, x, y, w, h, alpha, width = 1) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = width;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function fillRect(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = G(alpha);
  ctx.fillRect(x, y, w, h);
}

// 赛博朋克切角框：四角斜切，可选角标。
export function chamfer(ctx, x, y, w, h, c, alpha, fillAlpha = 0) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
  if (fillAlpha) {
    ctx.fillStyle = G(fillAlpha);
    ctx.fill();
  }
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function brackets(ctx, x, y, w, h, len, alpha, width = 1.5) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
  ctx.stroke();
}

export function circle(ctx, x, y, r, alpha, fill = false, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  if (fill) {
    ctx.fillStyle = G(alpha);
    ctx.fill();
  } else {
    ctx.strokeStyle = G(alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

export function ellipse(ctx, x, y, rx, ry, alpha, width = 1, dash = null) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * TAU;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

export function heart(ctx, x, y, s, alpha) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.7, y - s * 0.9, x, y - s * 0.25);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.4, y, x, y + s * 0.9);
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export function diamond(ctx, x, y, s, alpha, fill = false) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = G(alpha); ctx.fill(); } else { ctx.strokeStyle = G(alpha); ctx.lineWidth = 1; ctx.stroke(); }
}

export function sparkle(ctx, x, y, s, alpha) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
  ctx.stroke();
}

// 贝壳图标（浮光贝）
export function shellIcon(ctx, x, y, s, alpha) {
  ctx.strokeStyle = G(alpha);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.5);
  ctx.quadraticCurveTo(x - s * 1.1, y - s * 0.9, x, y - s);
  ctx.quadraticCurveTo(x + s * 1.1, y - s * 0.9, x + s, y + s * 0.5);
  ctx.closePath();
  ctx.moveTo(x, y - s); ctx.lineTo(x, y + s * 0.5);
  ctx.moveTo(x - s * 0.5, y - s * 0.75); ctx.lineTo(x - s * 0.3, y + s * 0.5);
  ctx.moveTo(x + s * 0.5, y - s * 0.75); ctx.lineTo(x + s * 0.3, y + s * 0.5);
  ctx.stroke();
}

// 精灵：以脚底中点为锚。sprite = {canvas, w, h}
export function sprite(ctx, spr, cx, footY, scale, alpha = 1, sx = 1, sy = 1) {
  if (!spr) return null;
  const w = spr.w * scale * sx;
  const h = spr.h * scale * sy;
  const x = cx - w / 2;
  const y = footY - h;
  ctx.globalAlpha = clamp01(alpha);
  ctx.drawImage(spr.canvas, x, y, w, h);
  ctx.globalAlpha = 1;
  return { x, y, w, h };
}

// 全息扫描线：在已绘制区域上压暗细横线。黑色在眼镜上等于透明。
export function scanlines(ctx, x, y, w, h, t, strength = 0.38, gap = 3) {
  ctx.fillStyle = BLACK(strength);
  const off = Math.floor(t / 60) % gap;
  for (let yy = y + off; yy < y + h; yy += gap) ctx.fillRect(x, yy, w, 1);
  // 缓慢下行的亮带
  const band = y + ((t / 18) % (h + 40)) - 20;
  ctx.fillStyle = G(0.06);
  ctx.fillRect(x, band, w, 6);
}

// 横向撕裂：对少数窄条整体平移，用 clip 实现（真机已验证 clip）。
export function tear(ctx, spr, box, t, amount) {
  if (!spr || amount <= 0) return;
  const k = Math.floor(t / 70);
  const count = Math.floor(1 + amount * 4);
  for (let i = 0; i < count; i += 1) {
    if (hash(k * 13 + i) > amount) continue;
    const by = box.y + hash(k * 7 + i * 3) * box.h;
    const bh = 2 + hash(k * 5 + i) * 7;
    const dx = (hash(k * 11 + i * 17) - 0.5) * 22 * amount;
    ctx.save();
    ctx.beginPath();
    rectPath(ctx, box.x - 20, by, box.w + 40, bh);
    ctx.clip();
    ctx.fillStyle = '#000000';
    ctx.fillRect(box.x - 20, by, box.w + 40, bh);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(spr.canvas, box.x + dx, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// 远程全息投影：整幅精灵切成横带，每条按正弦左右错开，形成信号波动；外加错位残影与亮度闪烁。
// 只用 save/clip/restore 与 5 参数 drawImage（真机已验证），不复制像素。参数集中在 HOLO，便于按佩戴观感调。
// signal：1 = 信号好，越小波动越大、闪烁越多。
export const HOLO = { amp: 3, ghost: 0.22, ghostDx: 3 };
export function holoSprite(ctx, spr, cx, footY, scale, alpha, t, signal = 1) {
  if (!spr) return null;
  const w = spr.w * scale;
  const h = spr.h * scale;
  const x = cx - w / 2;
  const y = footY - h;
  const weak = 1 - clamp01(signal);
  const blink = hash(Math.floor(t / 90)) > 0.94 - weak * 0.2 ? 0.55 : 1;
  const a = clamp01(alpha * (0.84 + 0.1 * Math.sin(t / 37) * Math.sin(t / 113)) * blink);
  if (a <= 0) return { x, y, w, h };
  ctx.globalAlpha = a * HOLO.ghost;
  ctx.drawImage(spr.canvas, x + HOLO.ghostDx + Math.sin(t / 300) * 2, y - 1, w, h);
  ctx.globalAlpha = a;
  // 横条第一次用到时生成（见 sprites.js buildStrips）；生成前先画整幅
  if (!spr.strips && spr.makeStrips) spr.strips = spr.makeStrips();
  if (!spr.strips) {
    ctx.drawImage(spr.canvas, x, y, w, h);
  } else {
    const amp = HOLO.amp * (1 + weak * 2.5);
    const k = h / spr.h;
    spr.strips.forEach((band, i) => {
      const dx = Math.sin(t / 260 + i * 0.9) * amp + Math.sin(t / 97 + i * 2.3) * amp * 0.35;
      ctx.drawImage(band.canvas, x + dx, y + band.y * k, w, band.h * k);
    });
  }
  ctx.globalAlpha = 1;
  return { x, y, w, h };
}

// 传送溶解：p=0 完全不可见，p=1 完整。按横条随机显隐，未显示的条带压黑，边缘加亮线。
export function dissolve(ctx, box, p, seed) {
  if (p >= 1) return;
  const band = 3;
  const rows = Math.ceil(box.h / band);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < rows; r += 1) {
    const th = hash(seed * 31 + r) * 0.75 + (r / rows) * 0.25;
    if (p < th) ctx.fillRect(box.x - 2, box.y + r * band, box.w + 4, band);
    else if (p < th + 0.08) {
      ctx.fillStyle = G(0.85);
      ctx.fillRect(box.x + hash(r + seed) * box.w * 0.3, box.y + r * band + 1, box.w * (0.4 + hash(r * 3) * 0.5), 1);
      ctx.fillStyle = '#000000';
    }
  }
}
