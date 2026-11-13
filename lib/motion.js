// 甩头识别（0.8.0）：输入姿态四元数，输出一次“轻甩”的方向。纯计算，不碰传感器和 DOM，便于测试。
//
// 传感器是不带磁力计的游戏旋转向量（SkyMate 真机所用同一接口），绝对朝向会慢慢漂，
// 所以这里只看几百毫秒内的相对转动：
//   左右：相邻两次姿态的相对旋转在世界竖直轴上的分量（与设备哪根轴朝前无关），正 = 向左转。
//   上下：设备前向轴（默认 +Z，见 aiui-field-notes 的 Sensor Lab 记录）在世界里的仰角变化。
// 一次“甩”= 角速度冲过阈值、偏出 minAmp 以上、并在 window 内往回摆 back 比例。
// 慢慢转头看东西（偏出后不回摆）、大幅转头（超过 maxAmp）、走路的小幅颠簸（角速度不够）都不算。
// 阈值是初值，真机按日志 `imu stats` / `shake` 再调；方向若反了改 yawSign / pitchSign。

export const SHAKE = {
  start: 80,        // 左右起甩角速度（度/秒）
  startV: 110,      // 上下起甩角速度：点头比摇头轻，上下要求更快，减少与系统点头的冲突
  dominance: 1.4,   // 主轴角速度须是另一轴的倍数
  minAmp: 6,        // 至少偏出（度）
  maxAmp: 45,       // 超过视为在转头看别处
  window: 650,      // 从起甩到回摆的最长时间（毫秒）
  back: 0.35,       // 回摆到峰值的这一比例即触发
  cooldown: 900,    // 触发后的冷却（毫秒）
  gap: 250,         // 两次读数间隔超过它就重新开始（毫秒）
  minDt: 15         // 真机读数约 57 次/秒且偶有同一毫秒成批送达：间隔太短的读数先跳过，免得角速度被放大
};

const DEG = 180 / Math.PI;

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
  let cand = null;
  let quietUntil = 0;
  const stats = { n: 0, maxYaw: 0, maxPitch: 0, pitch: 0, since: 0 };

  function reset() { prev = null; cand = null; }

  function feed(t, raw) {
    const q = qNormalize(raw);
    if (!q) return null;
    const f = qRotate(q, cfg.forward);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f[2]))) * DEG * cfg.pitchSign;
    if (!prev || t - prev.t > cfg.gap || t <= prev.t) {
      prev = { t, q, pitch };
      cand = null;
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
    const before = { yaw, pitch: prev.pitch };
    yaw += dyaw;
    prev = { t, q, pitch };
    const ry = dyaw / dt;
    const rp = dpitch / dt;
    stats.n += 1;
    stats.maxYaw = Math.max(stats.maxYaw, Math.abs(ry));
    stats.maxPitch = Math.max(stats.maxPitch, Math.abs(rp));
    stats.pitch = pitch;
    if (t < quietUntil) return null;
    if (!cand) {
      const ay = Math.abs(ry);
      const ap = Math.abs(rp);
      if (ay >= cfg.start && ay >= ap * cfg.dominance) cand = { axis: 'x', sign: Math.sign(ry), t0: t, base: before.yaw, peak: 0 };
      else if (ap >= cfg.startV && ap >= ay * cfg.dominance) cand = { axis: 'y', sign: Math.sign(rp), t0: t, base: before.pitch, peak: 0 };
      if (!cand) return null;
    }
    const value = cand.axis === 'x' ? yaw : pitch;
    const exc = (value - cand.base) * cand.sign;
    if (exc > cand.peak) cand.peak = exc;
    if (t - cand.t0 > cfg.window || cand.peak > cfg.maxAmp) {
      cand = null;
      quietUntil = t + 250;
      return null;
    }
    if (cand.peak >= cfg.minAmp && exc <= cand.peak * (1 - cfg.back)) {
      const dir = cand.axis === 'x' ? (cand.sign > 0 ? 'left' : 'right') : (cand.sign > 0 ? 'up' : 'down');
      const event = { dir, amp: Math.round(cand.peak * 10) / 10, ms: t - cand.t0, at: t };
      cand = null;
      quietUntil = t + cfg.cooldown;
      return event;
    }
    return null;
  }

  // 读出并清零统计（日志用）
  function takeStats(t) {
    const out = { n: stats.n, maxYaw: Math.round(stats.maxYaw), maxPitch: Math.round(stats.maxPitch), pitch: Math.round(stats.pitch), ms: t - (stats.since || t) };
    stats.n = 0; stats.maxYaw = 0; stats.maxPitch = 0; stats.since = t;
    return out;
  }

  return { feed, reset, takeStats, config: cfg };
}
