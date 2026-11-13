// 甩头识别（0.8.0，0.8.9 改为平滑判定）：输入姿态四元数，输出一次“轻甩”的方向。纯计算，不碰传感器和 DOM，便于测试。
//
// 传感器是不带磁力计的游戏旋转向量（SkyMate 真机所用同一接口），绝对朝向会慢慢漂，
// 所以这里只看几百毫秒内的相对转动：
//   左右：相邻两次姿态的相对旋转在世界竖直轴上的分量（与设备哪根轴朝前无关），正 = 向左转。
//   上下：设备前向轴（默认 +Z，见 aiui-field-notes 的 Sensor Lab 记录）在世界里的仰角变化。
//
// 0.8.9 判定（不再响应系统点头，上下与左右同一套阈值）：
//   1. 角速度先做指数平滑（smooth），单个跳变读数不会起算；平滑后任一轴超过 start 才开始候选。
//   2. 候选的起点取 lead 毫秒之前的姿态，起甩前那一小段转动也算进幅度，轻甩更容易“偏够”。
//   3. 按两轴的合计偏移判方向：主轴偏出 minAmp 且是另一轴的 dominance 倍即触发；不要求回正。
//   4. 平均速度（偏移 / 用时）低于 minRate 的算慢慢转头，放弃。
//   5. 起点之前 pre 毫秒内若刚从这个方向摆回来超过 swing 度（走路颠簸这类来回晃），不算。
// 头回正的那一下是反方向的转动：触发后 opposite 毫秒内的反方向一律忽略。
// 阈值是初值，真机按日志 `imu stats` / `shake` 再调；方向若反了改 yawSign / pitchSign。

export const SHAKE = {
  start: 28,        // 平滑后的起算角速度（度/秒），左右上下相同
  smooth: 0.5,      // 角速度指数平滑系数（越小越稳、越慢）
  lead: 120,        // 候选起点往前回溯（毫秒）
  minAmp: 5,        // 主轴偏出这么多（度）即触发
  minRate: 18,      // 偏移的平均速度至少这么多（度/秒），否则算慢慢转头
  pre: 320,         // 起点之前检查来回晃的时长（毫秒）
  swing: 2.5,       // 起点前同轴反向摆动超过这么多（度）就当作颠簸
  dominance: 1.4,   // 主轴偏移须是另一轴的倍数
  window: 450,      // 起算后这么久还没偏够就放弃（毫秒）
  cooldown: 600,    // 触发后的冷却（毫秒）
  opposite: 1000,   // 触发后这么久内的反方向（回正动作）忽略（毫秒）
  gap: 250,         // 两次读数间隔超过它就重新开始（毫秒）
  minDt: 15         // 真机读数约 57 次/秒且偶有同一毫秒成批送达：间隔太短的读数先跳过，免得角速度被放大
};

const DEG = 180 / Math.PI;
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

export function qNormalize(q) {
  if (!q || q.length !== 4) return null;
  const v = [Number(q[0]), Number(q[1]), Number(q[2]), Number(q[3])];
  if (!v.every(Number.isFinite)) return null;
  const n = Math.hypot(v[0], v[1], v[2], v[3]);
  if (n < 1e-6) return null;
  return v.map(x => x / n);
}

// [x,y,z,w]
export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
export const qConj = q => [-q[0], -q[1], -q[2], q[3]];
export function qRotate(q, v) {
  const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q));
  return [r[0], r[1], r[2]];
}
// 绕世界轴 axis 转 deg 度的四元数（测试与本机模拟用）
export function qAxis(axis, deg) {
  const h = deg / DEG / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

export function createShakeDetector(options = {}) {
  const cfg = { ...SHAKE, forward: [0, 0, 1], yawSign: 1, pitchSign: 1, ...options };
  let prev = null;
  let yaw = 0;
  let ry = 0;
  let rp = 0;
  let trail = [];      // 最近 lead+window 毫秒的 {t, yaw, pitch}
  let cand = null;
  let quietUntil = 0;
  let last = null;
  const stats = { n: 0, maxYaw: 0, maxPitch: 0, pitch: 0, since: 0 };

  function reset() { prev = null; cand = null; last = null; trail = []; ry = 0; rp = 0; }

  function feed(t, raw) {
    const q = qNormalize(raw);
    if (!q) return null;
    const f = qRotate(q, cfg.forward);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f[2]))) * DEG * cfg.pitchSign;
    if (!prev || t - prev.t > cfg.gap || t <= prev.t) {
      prev = { t, q, pitch };
      cand = null; ry = 0; rp = 0;
      trail = [{ t, yaw, pitch }];
      return null;
    }
    if (t - prev.t < cfg.minDt) return null;
    const dt = (t - prev.t) / 1000;
    // 世界坐标下的相对旋转 d = q · prev⁻¹，取旋转向量的竖直分量
    let d = qMul(q, qConj(prev.q));
    if (d[3] < 0) d = d.map(x => -x);
    const w = Math.min(1, d[3]);
    const ang = 2 * Math.acos(w);
    const sn = Math.sqrt(Math.max(0, 1 - w * w));
    const dyaw = (sn > 1e-6 ? (d[2] / sn) * ang : 0) * DEG * cfg.yawSign;
    const dpitch = pitch - prev.pitch;
    yaw += dyaw;
    prev = { t, q, pitch };
    ry += (dyaw / dt - ry) * cfg.smooth;
    rp += (dpitch / dt - rp) * cfg.smooth;
    trail.push({ t, yaw, pitch });
    while (trail.length > 2 && t - trail[0].t > cfg.pre + cfg.lead + cfg.window) trail.shift();
    stats.n += 1;
    stats.maxYaw = Math.max(stats.maxYaw, Math.abs(ry));
    stats.maxPitch = Math.max(stats.maxPitch, Math.abs(rp));
    stats.pitch = pitch;
    if (t < quietUntil) return null;
    if (!cand) {
      if (Math.max(Math.abs(ry), Math.abs(rp)) < cfg.start) return null;
      // 起点：lead 毫秒前（不早于上次触发）的姿态
      const from = Math.max(t - cfg.lead, last ? last.at : -Infinity);
      const base = trail.find(p => p.t >= from) || trail[0];
      cand = { t0: t, base };
    }
    const ex = yaw - cand.base.yaw;
    const ep = pitch - cand.base.pitch;
    const ax = Math.abs(ex);
    const ap = Math.abs(ep);
    if (t - cand.t0 > cfg.window) { cand = null; return null; }
    const amp = Math.max(ax, ap);
    if (amp < cfg.minAmp || amp < Math.min(ax, ap) * cfg.dominance) return null;
    const ms = Math.max(1, t - cand.base.t);
    if (amp / (ms / 1000) < cfg.minRate) { cand = null; return null; }
    const dir = ax >= ap ? (ex > 0 ? 'left' : 'right') : (ep > 0 ? 'up' : 'down');
    const key = ax >= ap ? 'yaw' : 'pitch';
    const sign = Math.sign(ax >= ap ? ex : ep);
    const b = cand.base;
    cand = null;
    // 来回晃：起点前不久她头刚在这个方向上，又摆回到起点
    const after = last ? last.at + cfg.opposite : -Infinity;
    let back = 0;
    for (const p of trail) if (p.t < b.t && p.t >= b.t - cfg.pre && p.t >= after) back = Math.max(back, (p[key] - b[key]) * sign);
    if (back > cfg.swing) return null;
    if (last && t - last.at < cfg.opposite && OPPOSITE[dir] === last.dir) return null;
    const event = { dir, amp: Math.round(amp * 10) / 10, ms, at: t };
    quietUntil = t + cfg.cooldown;
    last = { dir, at: t };
    return event;
  }

  // 读出并清零统计（日志用）
  function takeStats(t) {
    const out = { n: stats.n, maxYaw: Math.round(stats.maxYaw), maxPitch: Math.round(stats.maxPitch), pitch: Math.round(stats.pitch), ms: t - (stats.since || t) };
    stats.n = 0; stats.maxYaw = 0; stats.maxPitch = 0; stats.since = t;
    return out;
  }

  return { feed, reset, takeStats, config: cfg };
}
