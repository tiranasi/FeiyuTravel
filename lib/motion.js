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
// 0.8.10：上下单独一套更低的门槛（startV / minAmpV，0.8.14 已移除）——低头抬头的幅度天生比转头小；
//   每次候选结束（触发或放弃）回调 trace 一行，真机日志按它调阈值；
//   lean() 给出“头相对慢基线偏了多少度”，画面上让她跟着头轻轻偏，甩之前就有反馈。
// 0.8.14（用户提出）：上下改为按幅度判定，不看角速度——抬一下头就向上，点一下头就向下：
//   基准仰角取之前 restMs 毫秒的平均；偏离基准超过 leaveV 起算，reachV 毫秒内偏够 ampV 即触发。
//   起算前 pre 毫秒内头在反方向偏出超过 swingV（走路上下晃的另一半）不算，0.8.15 起不再看总起伏，点头前的小起势不受影响；触发后等头回到基准附近（backV）
//   或停在新位置超过 hold 毫秒才再判，抬头后回正不会触发向下。左右仍按上面的角速度判定，不再判上下。
// 0.8.16（用户确认）：真机 0.8.15 大幅快速点头（17–39°）和连续来回点头多被判 swing。
//   bigMs 内偏够 bigV、平均角速度够 bigRate、且是之前晃动的 bigOver 倍以上的直接算点头，跳过晃动检查；小幅的仍按晃动规则。
//   每次上下尝试的 trace 附 raw（相对基准的原始仰角）。
// 阈值是初值，真机按日志 `imu stats` / `shake try` 再调；方向若反了改 yawSign / pitchSign。

export const SHAKE = {
  start: 28,        // 平滑后的起算角速度（度/秒），左右
  ampV: 4.5,        // 上下：偏离基准这么多（度）即触发（0.8.14 按幅度）
  leaveV: 2,        // 上下：偏离基准超过它开始计时
  reachV: 250,      // 上下：开始计时后这么久还没偏够，算慢慢看东西（毫秒）
  restMs: 600,      // 上下：基准取之前这么久的平均仰角（毫秒）
  swingV: 3.5,      // 上下：起算前 pre 毫秒内头在反方向偏出这么多（度）算走路晃动（0.8.15）
  swingMin: 2.5,    // 上下：cycle 毫秒内同侧已偏出过这么多、反侧偏出过它的 0.6 倍，算周期性来回晃
  cycle: 700,
  bigV: 10,         // 上下（0.8.16）：bigMs 毫秒内偏够这么多（度）且够快，算明确点头，不再做晃动检查
  bigMs: 300,
  bigRate: 60,      // 上下：从离开基准前一条读数算起的平均角速度（度/秒），慢慢低头看东西到不了
  bigOver: 2,       // 上下：且至少是之前 cycle 毫秒内晃动幅度的这么多倍（走路每一下差不多大）
  backV: 2,         // 上下：触发后头回到基准这么近就可以再判
  hold: 2500,       // 上下：触发后头停在新位置这么久，以新位置为基准
  leanTau: 150,     // lean 的慢基线时间常数（毫秒）
  smooth: 0.5,      // 角速度指数平滑系数（越小越稳、越慢）
  lead: 120,        // 候选起点往前回溯（毫秒）
  minAmp: 4.5,        // 左右偏出这么多（度）即触发
  minRate: 18,      // 偏移的平均速度至少这么多（度/秒），否则算慢慢转头
  pre: 320,         // 起点之前检查来回晃的时长（毫秒）
  swing: 2.5,       // 起点前同轴反向摆动超过这么多（度）就当作颠簸
  fore: 1.6,        // 起点前头已在反侧超过 swing×fore（度）：这一摆早就开始了，也当作颠簸
  warm: 100,        // 读数刚开始这么久（毫秒）看不到起点之前，判断不了是不是颠簸，先不触发
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
  let by = 0;          // lean 慢基线
  let bp = 0;
  let lastPitch = 0;
  let since = 0;
  let armed = true;    // 候选被否掉后，等这一摆停下（角速度回落）才再起算，一摆只判一次
  let restP = 0;       // 上下：基准仰角
  let restY = 0;       // 上下：基准时的左右朝向（排除斜着转头）
  let leave = null;    // 上下：偏离基准开始的 {t, p, y}
  let vHold = null;    // 上下：触发后等回正 {home, at}
  let restFrom = 0;    // 上下：基准只取这之后的读数
  let restHome = null; // 上下：回正后、新读数攒够 restMs 之前，缺的那段按这个仰角补
  const trace = typeof cfg.trace === 'function' ? cfg.trace : null;
  const stats = { n: 0, maxYaw: 0, maxPitch: 0, pitch: 0, since: 0 };

  function reset() { prev = null; cand = null; last = null; trail = []; ry = 0; rp = 0; by = yaw; bp = lastPitch; leave = null; vHold = null; }

  // 候选结束时报一行：哪根轴、平滑角速度峰值、偏移、用时、结果
  function done(result, extra = {}) {
    if (trace && cand) {
      const ex = extra.ex ?? 0;
      const ep = extra.ep ?? 0;
      trace({ axis: Math.abs(ex) >= Math.abs(ep) ? 'yaw' : 'pitch', peakY: Math.round(cand.peakY), peakP: Math.round(cand.peakP), ex: Math.round(ex * 10) / 10, ep: Math.round(ep * 10) / 10, ms: extra.ms ?? 0, result });
    }
    if (!OPPOSITE[result]) armed = false;
    cand = null;
  }

  // 头相对慢基线的偏移（度）：x 正 = 向左，y 正 = 向上
  function lean() { return prev ? { x: yaw - by, y: lastPitch - bp } : { x: 0, y: 0 }; }

  function feed(t, raw) {
    const q = qNormalize(raw);
    if (!q) return null;
    const f = qRotate(q, cfg.forward);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f[2]))) * DEG * cfg.pitchSign;
    lastPitch = pitch;
    // 0.8.11：真机常把两条读数成批送到、时间戳同一毫秒（甚至略早）。这种只跳过这一条，
    // 不能当成“断流”清零——0.8.10 因此把大量真甩头判成 warmup。只有真的断了 gap 毫秒才重来。
    if (prev && t <= prev.t) return null;
    if (!prev || t - prev.t > cfg.gap) {
      prev = { t, q, pitch };
      cand = null; ry = 0; rp = 0; by = yaw; bp = pitch; since = t;
      restP = pitch; restY = yaw; leave = null; vHold = null; restFrom = t; restHome = null;
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
    const k = 1 - Math.exp(-dt * 1000 / cfg.leanTau);
    by += (yaw - by) * k;
    bp += (pitch - bp) * k;
    ry += (dyaw / dt - ry) * cfg.smooth;
    rp += (dpitch / dt - rp) * cfg.smooth;
    trail.push({ t, yaw, pitch });
    while (trail.length > 2 && t - trail[0].t > cfg.pre + cfg.lead + cfg.window) trail.shift();
    stats.n += 1;
    stats.maxYaw = Math.max(stats.maxYaw, Math.abs(ry));
    stats.maxPitch = Math.max(stats.maxPitch, Math.abs(rp));
    stats.pitch = pitch;
    const vertical = nodByAmp(t, pitch);
    if (vertical) return vertical;
    if (t < quietUntil) return null;
    if (!cand) {
      const calm = Math.abs(ry) < cfg.start;
      if (calm) armed = true;
      if (calm || !armed) return null;
      // 起点：lead 毫秒前（不早于上次触发）的姿态
      const from = Math.max(t - cfg.lead, last ? last.at : -Infinity);
      const base = trail.find(p => p.t >= from) || trail[0];
      cand = { t0: t, base, peakY: 0, peakP: 0 };
    }
    cand.peakY = Math.max(cand.peakY, Math.abs(ry));
    cand.peakP = Math.max(cand.peakP, Math.abs(rp));
    const ex = yaw - cand.base.yaw;
    const ep = pitch - cand.base.pitch;
    const ax = Math.abs(ex);
    const ap = Math.abs(ep);
    const ms = Math.max(1, t - cand.base.t);
    if (t - cand.t0 > cfg.window) { done('small', { ex, ep, ms }); return null; }
    // 0.8.14：这里只判左右，上下交给 nodByAmp
    const amp = ax;
    if (ax < cfg.minAmp || ax < ap * cfg.dominance) return null;
    // 平均速度从真正开始动（主轴偏出 0.3°）算起：起点往前回溯的那段静止不摊薄速度
    const key0 = 'yaw';
    const onset = trail.find(p => p.t >= cand.base.t && Math.abs(p[key0] - cand.base[key0]) > 0.3);
    const moving = Math.max(17, t - (onset ? onset.t : cand.base.t));
    if (amp / (moving / 1000) < cfg.minRate) { done('slow', { ex, ep, ms }); return null; }
    const dir = ex > 0 ? 'left' : 'right';
    const key = 'yaw';
    const sign = Math.sign(ex);
    const b = cand.base;
    // 来回晃：起点前不久她头刚在这个方向上，又摆回到起点
    const after = last ? last.at + cfg.opposite : -Infinity;
    // 0.8.10 另加：起点前头已经在反侧更远处（这一摆其实早就开始了，是周期晃动的中段）也不算
    let back = 0;
    let fore = 0;
    for (const p of trail) {
      if (p.t >= b.t || p.t < b.t - cfg.pre || p.t < after) continue;
      back = Math.max(back, (p[key] - b[key]) * sign);
      fore = Math.max(fore, (b[key] - p[key]) * sign);
    }
    if (back > cfg.swing || fore > cfg.swing * cfg.fore) { done('swing', { ex, ep, ms }); return null; }
    // 刚开始读数时看不到起点之前的样子，判断不了是不是颠簸：先攒够 pre 毫秒
    if (b.t - since < cfg.warm) { done('warmup', { ex, ep, ms }); return null; }
    if (last && t - last.at < cfg.opposite && OPPOSITE[dir] === last.dir) { done('return', { ex, ep, ms }); return null; }
    done(dir, { ex, ep, ms });
    const event = { dir, amp: Math.round(amp * 10) / 10, ms, at: t };
    quietUntil = t + cfg.cooldown;
    last = { dir, at: t };
    return event;
  }

  // 上下（0.8.14）：按偏离基准的幅度判定
  function nodByAmp(t, pitch) {
    if (vHold) {
      const back = Math.abs(pitch - vHold.home) < cfg.backV;
      vHold.peak = Math.max(vHold.peak || 0, Math.abs(pitch - vHold.home));
      if (back || t - vHold.at > cfg.hold) {
        // 真触发过的那一下不算进新基准；没触发的（走路晃、冷却中）照常用整段平均，不另起基准，免得基准被带偏
        // 0.8.16：没触发但偏过 bigV 的大点头也不算进去，否则回正那一下会被当成反方向的大点头
        if (vHold.fired || vHold.peak >= cfg.bigV) { restHome = back ? vHold.home : pitch; restFrom = t; }
        vHold = null;
      }
      return null;
    }
    if (!leave) {
      // 基准 = 之前 restMs 毫秒的平均仰角（走路上下晃时正好落在晃动中间）；读数刚开始、攒不够这么久先不判
      // 判过一次后，基准只取回正之后的读数（不把刚才那一下算进平均），不够 restMs 的部分按回正的位置补
      if (t - since < cfg.restMs) return null;
      let sum = 0;
      let n = 0;
      for (const p of trail) if (p.t < t && p.t >= Math.max(t - cfg.restMs, restFrom)) { sum += p.pitch; n += 1; }
      const missing = restHome === null ? 0 : Math.max(0, cfg.restMs - (t - restFrom)) / cfg.restMs;
      if (!n && !missing) return null;
      restP = n ? (sum / n) * (1 - missing) + (missing ? restHome * missing : 0) : restHome;
      restY = yaw;
      if (Math.abs(pitch - restP) < cfg.leaveV) return null;
      const before = trail.length > 1 ? trail[trail.length - 2].t : t;
      leave = { t, t0: before, p: restP, y: restY, swingy: false };
    }
    const ep = pitch - leave.p;
    const ex = yaw - leave.y;
    const ms = t - leave.t;
    const report = (result, extra) => {
      if (!trace) return;
      // 0.8.16：附上这次尝试前后的原始仰角（相对基准，[毫秒, 度]），真机日志据此核对走路和点头
      const raw = trail.filter(p => p.t >= leave.t - cfg.cycle).map(p => [p.t - leave.t, Math.round((p.pitch - leave.p) * 10) / 10]);
      trace({ axis: 'pitch', peakY: Math.round(Math.abs(ry)), peakP: Math.round(Math.abs(rp)), ex: Math.round(ex * 10) / 10, ep: Math.round(ep * 10) / 10, ms, result, ...extra, raw });
    };
    const restart = () => { leave = null; };
    // 看着像晃动、正在等它变成明确点头的：回落或超时就按晃动报掉
    if (leave.swingy && (Math.abs(ep) < cfg.ampV || ms > cfg.bigMs)) {
      report('swing');
      vHold = { home: leave.p, at: t, fired: false };
      leave = null;
      return null;
    }
    if (Math.abs(ep) < cfg.leaveV) { leave = null; return null; }   // 又回到基准附近
    if (Math.abs(ep) < cfg.ampV) {
      if (ms > cfg.reachV) { if (Math.abs(ep) >= 2.5) report('slow'); restart(); }
      return null;
    }
    if (Math.abs(ep) < Math.abs(ex) * cfg.dominance) return null;   // 斜着转头，交给左右判定
    const dir = ep > 0 ? 'up' : 'down';
    // 起算前 pre 毫秒头在反方向偏出超过 swingV（走路上下晃的另一半）：这一下不算。
    // 只看反方向：点头前往反方向带一下的小起势（真机 0.8.14 日志里很常见）不受影响
    const sign = Math.sign(ep);
    // 另外，0.7 秒内头已经往同一侧偏过一次、又往反侧偏过：周期性来回晃（走路），也不算
    let fore = 0;
    let same = 0;
    let away = 0;
    for (const p of trail) {
      if (p.t >= leave.t) continue;
      const d = (p.pitch - leave.p) * sign;
      if (p.t >= leave.t - cfg.pre) fore = Math.max(fore, -d);
      if (p.t >= leave.t - cfg.cycle) { away = Math.max(away, -d); if (p.t < leave.t - 150) same = Math.max(same, d); }
    }
    let result = dir;
    let big = false;
    if (fore > cfg.swingV || (same > cfg.swingMin && away > cfg.swingMin * 0.6)) {
      // 0.8.16：又大又快的（bigMs 内偏够 bigV、平均够 bigRate）是明确点头，不管之前晃没晃；
      // 走路上下晃到不了 10°，慢慢低头看东西不够快。还没到 bigV 的先等一等，看它会不会长成明确点头
      const rate = Math.abs(ep) / Math.max(0.001, (t - leave.t0) / 1000);
      // 还要比之前的晃动大得多（bigOver 倍）：走路每一下都差不多大，点头远大于它前面的小晃
      const prior = Math.max(fore, same, away);
      big = ms <= cfg.bigMs && Math.abs(ep) >= cfg.bigV && rate >= cfg.bigRate && Math.abs(ep) >= prior * cfg.bigOver;
      if (!big) {
        if (ms < cfg.bigMs) { leave.swingy = true; return null; }
        result = 'swing';
      }
    }
    if (result !== dir) { /* 已判晃动 */ } else if (t < quietUntil) result = 'quiet';
    else if (last && t - last.at < cfg.opposite && OPPOSITE[dir] === last.dir) result = 'return';
    report(result, big ? { big: 1 } : undefined);
    vHold = { home: leave.p, at: t, fired: result === dir };
    leave = null;
    if (result !== dir) return null;
    cand = null;
    quietUntil = t + cfg.cooldown;
    last = { dir, at: t };
    return { dir, amp: Math.round(Math.abs(ep) * 10) / 10, ms, at: t };
  }

  // 读出并清零统计（日志用）
  function takeStats(t) {
    const out = { n: stats.n, maxYaw: Math.round(stats.maxYaw), maxPitch: Math.round(stats.maxPitch), pitch: Math.round(stats.pitch), ms: t - (stats.since || t) };
    stats.n = 0; stats.maxYaw = 0; stats.maxPitch = 0; stats.since = t;
    return out;
  }

  return { feed, reset, takeStats, lean, config: cfg };
}
