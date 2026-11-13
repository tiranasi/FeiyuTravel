// 游戏首页与互动教程。只读视图状态 v；不依赖精灵是否解码完成（缺图时跳过人物）。
import { rectPath, W, H, TAU, G, hash, ease, clamp01, text, glitchText, wrap, line, rect, fillRect, chamfer, brackets, circle, ellipse, heart, diamond, sparkle, shellIcon, sprite, scanlines, dissolve } from './draw.js';
import { TITLE, TITLE_MENU, TUTORIAL, destById } from './content.js';
import { formatSpan } from './game.js';

const VERSION = '0.5.0';

function stars(ctx, t, alpha) {
  for (let i = 0; i < 34; i += 1) {
    const x = hash(i * 7 + 1) * W;
    const y = 14 + hash(i * 13 + 5) * 170;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / (900 + hash(i) * 1600) + i));
    fillRect(ctx, x, y, 1, 1, 0.5 * tw * alpha);
  }
}

function horizonScene(ctx, v, t, alpha) {
  // 远方的行星与地平线：她背对你眺望，呼应“旅行”
  const hx = 150;
  const hy = 232;
  ctx.save();
  ctx.beginPath();
  rectPath(ctx, 0, 0, 300, hy);
  ctx.clip();
  circle(ctx, hx + 30, hy + 30, 118, 0.22 * alpha, false, 1);
  ctx.setLineDash([2, 5]);
  circle(ctx, hx + 30, hy + 30, 132, 0.14 * alpha, false, 1);
  ctx.setLineDash([]);
  // 行星环
  ctx.strokeStyle = G(0.18 * alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * TAU;
    const px = hx + 30 + Math.cos(a) * 170;
    const py = hy - 40 + Math.sin(a) * 18 - Math.cos(a) * 10;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
  line(ctx, 0, hy, 300, hy, 0.45 * alpha);
  // 透视地面
  ctx.strokeStyle = G(0.1 * alpha);
  ctx.beginPath();
  for (let i = -5; i <= 5; i += 1) { ctx.moveTo(hx + i * 10, hy); ctx.lineTo(hx + i * 62, H); }
  for (let k = 0; k < 4; k += 1) {
    const yy = hy + Math.pow((k + ((t / 1400) % 1)) / 4, 2) * (H - hy);
    ctx.moveTo(0, yy); ctx.lineTo(300, yy);
  }
  ctx.stroke();
  // 栏杆
  line(ctx, 40, hy + 22, 262, hy + 22, 0.5 * alpha, 1.5);
  for (let x = 48; x <= 256; x += 26) line(ctx, x, hy + 22, x, hy + 48, 0.22 * alpha);
  // 栏杆边：趴栏杆远眺，偶尔回头（H 批 title_lean / title_turn）
  const turn = Math.floor((t - v.title.at) / 1000) % 7 === 6;
  const spr = (turn && v.cache.title_turn) || v.cache.title_lean || v.cache.back;
  if (spr) {
    const appear = clamp01((t - v.title.at - 300) / 900);
    const fy = hy + 20 + Math.sin(t / 900) * 1;
    const box = sprite(ctx, spr, hx, fy, 0.78, 0.95 * appear * alpha);
    sprite(ctx, spr, hx, fy, 0.78, 0.5 * appear * alpha);
    if (box) {
      scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.16, 4);
      if (appear < 1) dissolve(ctx, box, appear, 5);
    }
  }
}

function statusLine(v) {
  const g = v.g;
  if (!g) return '读取存档中';
  if (g.pending) return '她回来了，还带着礼物';
  if (g.trip) {
    const left = Math.max(0, (g.trip.returnAt - v.now) / (v.timeScale || 1));
    return `她在${destById(g.trip.dest).name}一带，约${formatSpan(left)}后回来`;
  }
  if (g.pack.food) return '行囊已备好，她随时会出发';
  return '她在等你';
}

export function titleMenu(v) {
  return TITLE_MENU.map(item => item.id === 'voice'
    ? { id: 'voice', label: `语音：${v.g && v.g.settings.voice ? '开' : '关'}` }
    : item);
}

export function drawTitle(ctx, v) {
  const t = v.now;
  const age = t - v.title.at;
  const a = ease(age / 700) * (v.title.leaveAt ? 1 - clamp01((t - v.title.leaveAt) / 360) : 1);
  stars(ctx, t, a);
  horizonScene(ctx, v, t, a);
  const x = 318;
  glitchText(ctx, TITLE, x, 92, 32, a, t);
  text(ctx, '全 息 桌 宠  ·  原 创 旅 行', x + 1, 112, 10, 0.5 * a);
  line(ctx, x, 122, x + 140, 122, 0.5 * a);
  fillRect(ctx, x, 120, 18, 4, 0.8 * a);
  const status = statusLine(v);
  const lines = wrap(ctx, status, 148, 11, 2);
  lines.forEach((ln, i) => text(ctx, ln, x, 142 + i * 15, 11, 0.62 * a));
  if (v.g && v.g.pending) diamond(ctx, x - 8, 138, 3, (0.5 + 0.5 * Math.sin(t / 220)) * a, true);
  const items = titleMenu(v);
  items.forEach((item, i) => {
    const y = 182 + i * 34;
    const on = v.title.focus === i;
    const w = 146;
    if (on) {
      chamfer(ctx, x - 4, y - 18, w, 28, 7, 0.9 * a, 0.12 * a);
      fillRect(ctx, x - 4, y - 18, 3, 28, 0.95 * a);
      const k = (t / 900) % 1;
      fillRect(ctx, x - 4 + k * (w - 20), y + 9, 20, 1, 0.6 * a);
    } else chamfer(ctx, x - 4, y - 18, w, 28, 7, 0.28 * a);
    text(ctx, item.label, x + 10, y + 1, item.id === 'play' ? 15 : 13, (on ? 1 : 0.6) * a, 'left', on ? 700 : 400);
    if (item.id === 'tutorial' && v.g && !v.g.tutorialDone) text(ctx, '推荐', x + w - 14, y, 10, 0.55 * a, 'right');
  });
  text(ctx, '滑动选择 · 轻点确认 · 双击退出', x + 69, 300, 10, 0.38 * a, 'center');
  text(ctx, `v${VERSION}`, W - 8, 314, 9, 0.3 * a, 'right', 400, true);
  brackets(ctx, 6, 6, W - 12, H - 12, 14, 0.35 * a, 1);
}

// ------------------------------------------------------------ 教程

function temple(ctx, cx, cy, t, mode, alpha) {
  // 简化镜腿：一根圆角长条，手指光点演示操作
  const w = 150;
  ctx.strokeStyle = G(0.6 * alpha);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 8, cy - 9);
  ctx.lineTo(cx + w / 2 - 8, cy - 9);
  ctx.quadraticCurveTo(cx + w / 2, cy - 9, cx + w / 2, cy);
  ctx.quadraticCurveTo(cx + w / 2, cy + 9, cx + w / 2 - 8, cy + 9);
  ctx.lineTo(cx - w / 2 + 8, cy + 9);
  ctx.quadraticCurveTo(cx - w / 2, cy + 9, cx - w / 2, cy);
  ctx.quadraticCurveTo(cx - w / 2, cy - 9, cx - w / 2 + 8, cy - 9);
  ctx.stroke();
  text(ctx, '镜腿', cx - w / 2, cy - 16, 9, 0.4 * alpha);
  if (mode === 'swipe') {
    const k = (t / 1300) % 1;
    const dir = Math.floor(t / 1300) % 2 ? -1 : 1;
    const px = cx + dir * (ease(k) - 0.5) * 90;
    circle(ctx, px, cy, 5, 0.9 * alpha * (1 - k * 0.5), true);
    for (let i = 1; i < 6; i += 1) circle(ctx, px - dir * i * 7, cy, 4 - i * 0.6, 0.25 * alpha * (1 - i / 6), true);
  } else if (mode === 'tap') {
    const k = (t / 1100) % 1;
    circle(ctx, cx, cy, 4, 0.9 * alpha, true);
    circle(ctx, cx, cy, 6 + k * 16, 0.6 * (1 - k) * alpha);
  } else if (mode === 'double') {
    // 双击：一个周期里连点两下，各放一圈波纹
    const ms = t % 1600;
    const down = ms < 120 || (ms > 260 && ms < 380);
    circle(ctx, cx, cy, down ? 5 : 3.5, (down ? 1 : 0.55) * alpha, true);
    for (const start of [0, 260]) {
      const k = (ms - start) / 700;
      if (k > 0 && k < 1) circle(ctx, cx, cy, 6 + k * 18, 0.65 * (1 - k) * alpha);
    }
    text(ctx, '×2', cx + 14, cy - 12, 10, 0.7 * alpha);
  }
}

function miniDock(ctx, x, y, focus, alpha) {
  const labels = ['呼唤', '行囊', '商店', '图鉴'];
  labels.forEach((label, i) => {
    const bx = x + i * 50;
    const on = i === focus;
    if (on) chamfer(ctx, bx - 2, y - 14, 44, 20, 4, 0.85 * alpha, 0.1 * alpha);
    text(ctx, label, bx + 20, y, 11, (on ? 1 : 0.45) * alpha, 'center', on ? 700 : 400);
  });
}

function demo(ctx, v, step, t, alpha) {
  const cache = v.cache;
  const cx = 116;
  const st = t - v.tut.at;
  if (step.demo === 'hello') {
    const box = sprite(ctx, cache.front, cx, 262 - Math.abs(Math.sin(st / 220)) * 6, 1.25, alpha);
    if (box) scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.16, 4);
    for (let i = 0; i < 3; i += 1) {
      const k = ((st / 1800) + i / 3) % 1;
      heart(ctx, cx + 54 + Math.sin(k * 6 + i) * 6, 120 - k * 50, 4 + i, 0.8 * (1 - k) * alpha);
    }
    ellipse(ctx, cx, 264, 46, 7, 0.4 * alpha);
    temple(ctx, cx, 292, t, 'tap', alpha * 0.8);
  } else if (step.demo === 'swipe') {
    miniDock(ctx, cx - 92, 150, v.tut.focus % 4, alpha);
    line(ctx, cx - 96, 160, cx + 104, 160, 0.25 * alpha);
    temple(ctx, cx, 222, t, 'swipe', alpha);
    text(ctx, `已滑动 ${Math.min(v.tut.swipes, step.count)} / ${step.count}`, cx, 262, 11, 0.6 * alpha, 'center');
  } else if (step.demo === 'back') {
    const open = !v.tut.okAt;
    if (open) {
      chamfer(ctx, cx - 78, 96, 156, 108, 8, 0.6 * alpha, 0.05 * alpha);
      text(ctx, '行囊', cx - 64, 116, 13, 0.9 * alpha, 'left', 700);
      for (let i = 0; i < 3; i += 1) fillRect(ctx, cx - 64, 132 + i * 20, 90 - i * 18, 3, 0.35 * alpha);
    } else {
      const k = clamp01((t - v.tut.okAt) / 400);
      chamfer(ctx, cx - 78 * (1 - k), 96 + 54 * k, 156 * (1 - k) + 1, 108 * (1 - k) + 1, 4, 0.6 * (1 - k) * alpha);
      const box = sprite(ctx, cache.side, cx + 44, 212, 0.72, alpha * k);
      sprite(ctx, cache.side, cx + 44, 212, 0.72, alpha * k * 0.5);
      if (box) scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.16, 4);
    }
    // 双击镜腿演示
    temple(ctx, cx, 262, t, 'double', alpha * 0.85);
    text(ctx, '双击 = 返回', cx, 292, 11, 0.6 * alpha, 'center');
  } else if (step.demo === 'summon') {
    const cycle = st % 3600;
    if (cycle < 1200) {
      const reveal = 1 - clamp01((cycle - 700) / 400);
      const box = sprite(ctx, cache.front, 44, 150, 0.6, alpha);
      ellipse(ctx, 44, 150, 22, 4, 0.4 * alpha);
      if (box && reveal < 1) dissolve(ctx, box, reveal, 9);
      text(ctx, '呼唤', 44, 176, 10, 0.5 * alpha, 'center');
    } else if (cycle < 1600) {
      const p = (cycle - 1200) / 400;
      for (let i = 0; i < 12; i += 1) {
        const k = clamp01(p * 1.4 - i / 30);
        circle(ctx, 44 + (cx + 30 - 44) * k, 130 + (180 - 130) * k - Math.sin(k * Math.PI) * 30, 2 - i * 0.12, (1 - i / 12) * alpha, true);
      }
    } else {
      const reveal = clamp01((cycle - 1600) / 440);
      const bust = cache.smug;
      const box = sprite(ctx, bust, cx + 30, 284, 0.8, alpha);
      if (box) {
        scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.2, 3);
        if (reveal < 1) dissolve(ctx, box, reveal, 13);
      }
      if (cycle > 2200) {
        chamfer(ctx, 14, 100, 92, 26, 5, 0.6 * alpha, 0.06 * alpha);
        text(ctx, '在呢在呢！', 22, 118, 11, 0.85 * alpha);
      }
    }
  } else if (step.demo === 'travel') {
    const p = (st % 4200) / 4200;
    const from = { x: 40, y: 230 };
    const to = { x: 200, y: 150 };
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = G(0.4 * alpha);
    ctx.beginPath();
    for (let i = 0; i <= 30; i += 1) {
      const k = i / 30;
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 50;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    circle(ctx, from.x, from.y, 3, 0.8 * alpha, true);
    text(ctx, '家', from.x, from.y + 18, 10, 0.5 * alpha, 'center');
    diamond(ctx, to.x, to.y, 5, 0.9 * alpha);
    text(ctx, '远方', to.x, to.y + 20, 10, 0.5 * alpha, 'center');
    // 便当图标
    chamfer(ctx, 22, 252, 36, 22, 4, 0.7 * alpha, 0.08 * alpha);
    line(ctx, 22, 260, 58, 260, 0.5 * alpha);
    text(ctx, '便当', 40, 290, 10, 0.5 * alpha, 'center');
    const k = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 50;
    const spr = p < 0.5 ? cache.side : cache.sideL;
    const box = sprite(ctx, spr, x, y + 4, 0.42, alpha);
    if (box && p > 0.5) {
      // 回程：明信片
      rect(ctx, x + 14, y - 40, 24, 16, 0.8 * alpha);
      line(ctx, x + 26, y - 38, x + 26, y - 26, 0.4 * alpha);
    }
  } else if (step.demo === 'scales') {
    const box = sprite(ctx, cache.smug, cx - 10, 290, 0.72, alpha);
    if (box) scanlines(ctx, box.x, box.y, box.w, box.h, t, 0.2, 3);
    for (let i = 0; i < 3; i += 1) {
      const k = ((st / 1500) + i / 3) % 1;
      shellIcon(ctx, cx + 70 + i * 12, 200 - k * 70, 6, 0.85 * (1 - k) * alpha);
    }
    const gained = Math.floor(clamp01(st / 2400) * 36);
    diamond(ctx, cx + 56, 110, 4, 0.9 * alpha);
    text(ctx, `鳞光 ${120 + gained}`, cx + 66, 114, 13, 0.9 * alpha, 'left', 700);
  }
}

export function drawTutorial(ctx, v) {
  const t = v.now;
  const tut = v.tut;
  const step = TUTORIAL[tut.step];
  const fade = ease((t - tut.at) / 360);
  stars(ctx, t, 0.6);
  // 顶部进度
  text(ctx, '教程', 18, 26, 12, 0.85, 'left', 700);
  for (let i = 0; i < TUTORIAL.length; i += 1) {
    const x = 58 + i * 16;
    if (i < tut.step) fillRect(ctx, x, 19, 10, 3, 0.75);
    else if (i === tut.step) { fillRect(ctx, x, 18, 10, 5, 0.95); }
    else rect(ctx, x, 18, 10, 5, 0.35);
  }
  text(ctx, `${tut.step + 1} / ${TUTORIAL.length}`, W - 18, 26, 10, 0.5, 'right', 400, true);
  line(ctx, 18, 34, W - 18, 34, 0.25);
  demo(ctx, v, step, t, fade);
  // 右侧说明
  const x = 248;
  glitchText(ctx, step.title, x, 78, 19, fade, t);
  line(ctx, x, 88, x + 100, 88, 0.5 * fade);
  const lines = wrap(ctx, step.text, 208, 13, 6);
  const shown = Math.floor((t - tut.at) / 45);
  let left = shown;
  lines.forEach((ln, i) => {
    const part = ln.slice(0, Math.max(0, left));
    left -= ln.length;
    text(ctx, part, x, 116 + i * 22, 13, 0.92 * fade);
  });
  if (tut.okAt) {
    const k = ease((t - tut.okAt) / 300);
    ctx.strokeStyle = G(0.95 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 266); ctx.lineTo(x + 7, 273); ctx.lineTo(x + 20, 258);
    ctx.stroke();
    text(ctx, tut.praise, x + 28, 272, 14, k, 'left', 700);
  } else {
    const pulse = 0.55 + 0.4 * Math.sin(t / 260);
    chamfer(ctx, x - 6, 254, 150, 26, 6, 0.6 * pulse, 0.06);
    text(ctx, step.hint, x + 8, 272, 12, pulse + 0.05, 'left', 700);
  }
  if (step.goal !== 'back') text(ctx, '双击镜腿：回到首页', W - 18, 306, 9, 0.32, 'right');
}
