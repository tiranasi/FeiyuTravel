// 旅行肥鱼：存档、离线结算与经济规则。纯函数风格，不依赖宿主；时间与随机数由调用方传入。
import { ITEMS, TIERS, DESTS, destById, FAST_TRAVEL, CALLS_PER_TRIP } from './content.js';

export const SAVE_KEY = 'lvfeiyu.save.v1';
export const SHELL_EVERY_MS = 45 * 60 * 1000;
export const SHELL_MAX = 4;
export const DEPART_DELAY_MS = [60 * 1000, 180 * 1000];
const DAY_MS = 24 * 3600 * 1000;
const POSTCARD_KEEP = 40;

const MIN = 60 * 1000;
export const clampInt = (value, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(value) || 0)));
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const dayKey = now => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function newState(now) {
  return {
    v: 1,
    createdAt: now,
    lastSeen: now,
    scales: 120,
    affinity: 0,
    stock: { onigiri: 2, pudding: 0, taiyaki: 0, compass: 0, shell: 0, beacon: 0 },
    pack: { food: null, charm: null },
    departAt: 0,
    trip: null,
    shells: { count: 1, lastAt: now },
    souvenirs: {},
    postcards: [],
    unread: 0,
    pending: null, // 归来后待领取的礼物
    daily: { day: dayKey(now), pats: 0, pokes: 0, chats: 0 },
    stats: { trips: 0, chats: 0, pats: 0 },
    // rev：设置项的默认值版本。存档的 rev 落后时，开关回到默认（语音开、快速旅行关）一次
    settings: { voice: true, fast: false, motion: true, rev: SETTINGS_REV },
    tutorialDone: false
  };
}

export const SETTINGS_REV = 2;

// 读档时容忍缺字段与脏数据，不信任任何外部值。
export function normalize(raw, now) {
  const base = newState(now);
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
  const s = base;
  s.createdAt = Number(raw.createdAt) || now;
  s.lastSeen = Math.min(Number(raw.lastSeen) || now, now);
  s.scales = clampInt(raw.scales, 0, 999999);
  s.affinity = clampInt(raw.affinity, 0, 9999);
  for (const key of Object.keys(s.stock)) s.stock[key] = clampInt(raw.stock && raw.stock[key], 0, 99);
  const pack = raw.pack || {};
  s.pack.food = ITEMS[pack.food] && ITEMS[pack.food].kind === 'food' ? pack.food : null;
  s.pack.charm = ITEMS[pack.charm] && ITEMS[pack.charm].kind === 'charm' ? pack.charm : null;
  s.departAt = s.pack.food ? Number(raw.departAt) || 0 : 0;
  if (raw.trip && typeof raw.trip === 'object' && DESTS.some(dest => dest.id === raw.trip.dest)) {
    const t = raw.trip;
    s.trip = {
      dest: t.dest,
      food: ITEMS[t.food] ? t.food : 'onigiri',
      charm: ITEMS[t.charm] ? t.charm : null,
      leftAt: Number(t.leftAt) || now,
      returnAt: Number(t.returnAt) || now,
      seed: Number(t.seed) >>> 0,
      cards: Array.isArray(t.cards) ? t.cards.map(Number).filter(Number.isFinite).slice(0, 4) : [],
      calls: clampInt(t.calls, 0, 9)
    };
  }
  s.shells.count = clampInt(raw.shells && raw.shells.count, 0, SHELL_MAX);
  s.shells.lastAt = Math.min(Number(raw.shells && raw.shells.lastAt) || now, now);
  if (raw.souvenirs && typeof raw.souvenirs === 'object') {
    for (const dest of DESTS) for (const gift of dest.gifts) {
      const count = clampInt(raw.souvenirs[gift.id], 0, 999);
      if (count) s.souvenirs[gift.id] = count;
    }
  }
  if (Array.isArray(raw.postcards)) {
    s.postcards = raw.postcards.filter(card => card && DESTS.some(dest => dest.id === card.dest)).slice(-POSTCARD_KEEP)
      .map(card => ({ dest: card.dest, at: Number(card.at) || now, line: String(card.line || '').slice(0, 40), pose: card.pose === 'back' ? 'back' : card.pose === 'front' ? 'front' : 'side', read: !!card.read }));
  }
  s.unread = s.postcards.filter(card => !card.read).length;
  if (raw.pending && raw.pending.gift) {
    const found = DESTS.flatMap(dest => dest.gifts).find(gift => gift.id === raw.pending.gift);
    if (found) s.pending = { gift: found.id, dest: destById(raw.pending.dest).id, scales: clampInt(raw.pending.scales, 0, 9999) };
  }
  if (raw.daily && raw.daily.day === dayKey(now)) {
    s.daily = { day: raw.daily.day, pats: clampInt(raw.daily.pats, 0, 999), pokes: clampInt(raw.daily.pokes, 0, 999), chats: clampInt(raw.daily.chats, 0, 999) };
  }
  if (raw.stats) for (const key of Object.keys(s.stats)) s.stats[key] = clampInt(raw.stats[key], 0, 1e6);
  if (raw.settings && raw.settings.rev === SETTINGS_REV) {
    s.settings.voice = raw.settings.voice !== false;
    s.settings.fast = raw.settings.fast === true;
  }
  // 体感互动（0.8.0）默认开，只有明确关掉才保存为关
  if (raw.settings && raw.settings.motion === false) s.settings.motion = false;
  s.tutorialDone = raw.tutorialDone === true;
  return s;
}

export function load(storage, now, log) {
  try {
    const raw = storage.get(SAVE_KEY);
    const parsed = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : null) : raw;
    return normalize(parsed, now);
  } catch (error) {
    if (log) log('save read failed', String(error && error.message || error));
    return newState(now);
  }
}

export function save(storage, state, now, log) {
  state.lastSeen = now;
  try {
    storage.set(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    if (log) log('save write failed', String(error && error.message || error));
    return false;
  }
}

function rollDaily(s, now) {
  const key = dayKey(now);
  if (s.daily.day !== key) s.daily = { day: key, pats: 0, pokes: 0, chats: 0 };
}

// 推进时间：浮光贝生长、定时出发、途中明信片、归来。返回发生的事件列表。
export function settle(s, now, rng, options = {}) {
  const events = [];
  const scale = options.timeScale || 1;
  rollDaily(s, now);
  // 浮光贝
  const shellEvery = SHELL_EVERY_MS / scale;
  if (s.shells.count >= SHELL_MAX) s.shells.lastAt = now;
  else {
    const grown = Math.floor((now - s.shells.lastAt) / shellEvery);
    if (grown > 0) {
      s.shells.count = Math.min(SHELL_MAX, s.shells.count + grown);
      s.shells.lastAt = s.shells.count >= SHELL_MAX ? now : s.shells.lastAt + grown * shellEvery;
      events.push({ type: 'shell' });
    }
  }
  // 出发（召唤中不出发，由调用方通过 options.hold 控制）
  if (!s.trip && s.pack.food && s.departAt && now >= s.departAt && !options.hold && !s.pending) {
    startTrip(s, Math.max(s.departAt, now - 1), rng, scale);
    events.push({ type: 'depart', dest: s.trip.dest });
  }
  if (s.trip) {
    const dest = destById(s.trip.dest);
    while (s.trip.cards.length && now >= s.trip.cards[0]) {
      const at = s.trip.cards.shift();
      const tripRng = makeRng(s.trip.seed + at);
      const card = { dest: dest.id, at, line: pick(tripRng, dest.lines), pose: pick(tripRng, ['side', 'back', 'front']), read: false };
      s.postcards.push(card);
      if (s.postcards.length > POSTCARD_KEEP) s.postcards.shift();
      s.unread = s.postcards.filter(item => !item.read).length;
      events.push({ type: 'postcard', dest: dest.id });
    }
    if (now >= s.trip.returnAt) {
      finishTrip(s, rng);
      events.push({ type: 'return', dest: dest.id });
    }
  }
  return events;
}

export function startTrip(s, now, rng, scale = 1) {
  const food = ITEMS[s.pack.food];
  const tier = TIERS[food.tier];
  const options = DESTS.filter(dest => dest.tier === food.tier);
  const dest = pick(rng, options);
  const fast = s.settings && s.settings.fast ? FAST_TRAVEL : 1;
  const duration = randInt(rng, tier.minutes[0], tier.minutes[1]) * MIN / scale / fast;
  const cards = [now + duration * (0.3 + rng() * 0.4)];
  if (s.pack.charm === 'compass') cards.push(now + duration * (0.15 + rng() * 0.1), now + duration * (0.75 + rng() * 0.15));
  cards.sort((a, b) => a - b);
  s.trip = { dest: dest.id, food: s.pack.food, charm: s.pack.charm, leftAt: now, returnAt: now + duration, seed: Math.floor(rng() * 4294967295) >>> 0, cards, calls: 0 };
  s.pack = { food: null, charm: null };
  s.departAt = 0;
  s.stats.trips += 1;
}

export function rollGift(dest, tierIndex, charm, rng) {
  const lucky = charm === 'shell';
  const rareP = (lucky ? 0.17 : 0.07) + TIERS[tierIndex].rare;
  const uncommonP = lucky ? 0.38 : 0.28;
  const r = rng();
  const level = r < rareP ? 2 : r < rareP + uncommonP ? 1 : 0;
  return dest.gifts.find(gift => gift.rare === level) || dest.gifts[0];
}

export function finishTrip(s, rng) {
  const trip = s.trip;
  const dest = destById(trip.dest);
  const tierIndex = ITEMS[trip.food] ? ITEMS[trip.food].tier : 0;
  const gift = rollGift(dest, tierIndex, trip.charm, rng);
  const tier = TIERS[tierIndex];
  s.pending = { gift: gift.id, dest: dest.id, scales: randInt(rng, tier.reward[0], tier.reward[1]) };
  s.trip = null;
}

// 领取归来礼物
export function claimGift(s) {
  if (!s.pending) return null;
  const p = s.pending;
  s.souvenirs[p.gift] = (s.souvenirs[p.gift] || 0) + 1;
  s.scales += p.scales;
  s.affinity += 3;
  s.pending = null;
  return p;
}

export function collectShells(s, now, rng) {
  if (!s.shells.count) return 0;
  let gained = 0;
  for (let i = 0; i < s.shells.count; i += 1) gained += randInt(rng, 8, 20);
  if (s.shells.count >= SHELL_MAX) s.shells.lastAt = now;
  s.shells.count = 0;
  s.scales += gained;
  return gained;
}

export function buy(s, id) {
  const item = ITEMS[id];
  if (!item) return { ok: false, reason: 'unknown' };
  if (s.scales < item.price) return { ok: false, reason: 'poor' };
  if (s.stock[id] >= 99) return { ok: false, reason: 'full' };
  s.scales -= item.price;
  s.stock[id] += 1;
  return { ok: true };
}

// 发起旅行通话：先用本次旅行的免费次数，用完后消耗一个信标流量。
export function useCall(s) {
  const trip = s.trip;
  if (!trip) return { ok: false, reason: 'home' };
  if ((trip.calls || 0) < CALLS_PER_TRIP) {
    trip.calls = (trip.calls || 0) + 1;
    return { ok: true, paid: false };
  }
  if ((s.stock.beacon || 0) > 0) {
    s.stock.beacon -= 1;
    return { ok: true, paid: true };
  }
  return { ok: false, reason: 'used' };
}

export function callsLeft(s) {
  return s.trip ? Math.max(0, CALLS_PER_TRIP - (s.trip.calls || 0)) : 0;
}

// 往行囊里放或取出物品。同类只放一个；取出时退回仓库。
export function togglePack(s, id, now, rng, scale = 1) {
  const item = ITEMS[id];
  if (!item || item.kind === 'call' || s.trip) return { ok: false, reason: s.trip ? 'traveling' : 'unknown' };
  const slot = item.kind;
  if (s.pack[slot] === id) {
    s.pack[slot] = null;
    s.stock[id] += 1;
  } else {
    if (s.stock[id] <= 0) return { ok: false, reason: 'empty' };
    if (s.pack[slot]) s.stock[s.pack[slot]] += 1;
    s.stock[id] -= 1;
    s.pack[slot] = id;
  }
  if (s.pack.food) {
    if (!s.departAt) s.departAt = now + randInt(rng, DEPART_DELAY_MS[0], DEPART_DELAY_MS[1]) / scale;
  } else s.departAt = 0;
  return { ok: true, packed: s.pack[slot] === id };
}

// 亲密互动：每日前几次给奖励。
export function interact(s, kind, now) {
  rollDaily(s, now);
  let reward = 0;
  if (kind === 'pat') {
    s.stats.pats += 1;
    if (s.daily.pats < 3) { reward = 5; s.affinity += 1; }
    s.daily.pats += 1;
  } else if (kind === 'poke') {
    if (s.daily.pokes < 2) { reward = 2; }
    s.daily.pokes += 1;
  } else if (kind === 'chat') {
    s.stats.chats += 1;
    if (s.daily.chats < 5) { reward = 3; s.affinity += 1; }
    s.daily.chats += 1;
  }
  s.scales += reward;
  return reward;
}

export function readPostcard(s, index) {
  const card = s.postcards[index];
  if (card && !card.read) {
    card.read = true;
    s.affinity += 1;
  }
  s.unread = s.postcards.filter(item => !item.read).length;
}

export const collected = s => DESTS.reduce((n, dest) => n + dest.gifts.filter(g => s.souvenirs[g.id]).length, 0);
export const totalGifts = () => DESTS.reduce((n, dest) => n + dest.gifts.length, 0);

export function formatSpan(ms) {
  const m = Math.max(0, Math.ceil(ms / MIN));
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}小时${m % 60}分` : `${h}小时`;
}

export function statusLine(s, now) {
  if (s.trip) return `正在${destById(s.trip.dest).name}一带旅行，大约${formatSpan(s.trip.returnAt - now)}后回来`;
  if (s.pending) return `刚旅行回来，带了礼物`;
  if (s.pack.food) return '行囊已备好，准备出门';
  return '在家里';
}

export { DAY_MS };
