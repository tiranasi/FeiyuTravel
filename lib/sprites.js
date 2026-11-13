// 把单通道亮度精灵逐块解码到离屏 Canvas。真机已验证：new Canvas + putImageData + drawImage(缓存Canvas) 不闪。
// 来源：sprite-data.js（首页成年全息线稿 holo）与 qban-data.js（用户确认的黑底绿色 Q 版原画，tools-art/qban.py 生成）。
import { SPRITES } from './sprite-data.js';
import { QBAN } from './qban-data.js';

const SOURCE = { ...SPRITES, ...QBAN };

// 旧名字 → 新原画。场景代码里仍可用 front/side/back/smug… 这些短名。
export const ALIAS = {
  front: 'body_front', side: 'body_side', back: 'body_back',
  smug: 'bust_smug', wow: 'bust_wow', pout: 'bust_pout', think: 'bust_think'
};

// 进入游戏前必须解码完的帧；其余在游戏中后台继续解码，未就绪时场景回退到基础帧。
export const REQUIRED = ['holo', 'body_front', 'body_side', 'body_sideL', 'body_back', 'bust_neutral', 'bust_smug', 'bust_wow', 'bust_pout', 'bust_think'];
// 以 L 结尾且原表里没有的名字 = 运行时水平镜像，不依赖 ctx.scale。
const LATER = [
  'idle_blink', 'idle_breath', 'idle_tail_up', 'idle_tail_down', 'idle_ahoge', 'idle_look_side',
  'talk_open', 'talk_half', 'talk_smile', 'bust_listen', 'bust_pat', 'bust_poke', 'bust_bye', 'bust_happy',
  'pd1', 'pd2', 'pd3', 'pd4', 'pd5', 'pd6', 'pd7', 'pd8',
  'bust_sad', 'bust_confused', 'bust_sleepy', 'bust_tilt_left', 'bust_tilt_right', 'bust_nod_yes', 'bust_hmph', 'bust_dizzy',
  'gaze_back_look', 'gaze_shade', 'gaze_tiptoe', 'chase_reach', 'chase_crouch', 'chase_jump', 'chase_land', 'chase_spin',
  'gaze_shadeL', 'gaze_tiptoeL', 'chase_reachL', 'chase_jumpL', 'chase_spinL',
  'nap_sit', 'nap_nod', 'nap_curl', 'hum_left', 'hum_right', 'wave_a', 'wave_b', 'sit_edge',
  'tp_charge', 'tp_leave', 'tp_arrive', 'tp_stumble', 'walk_a', 'walk_b', 'walk_aL', 'walk_bL', 'body_34', 'body_34back',
  'trip_pack', 'trip_depart_a', 'trip_depart_b', 'trip_depart_aL', 'trip_depart_bL', 'trip_eat', 'gift_present', 'gift_proud', 'trip_tired',
  'pc_market', 'pc_alley', 'pc_dome', 'pc_abyss', 'pc_harbor', 'pc_moon',
  'title_lean', 'title_turn', 'peek_edge', 'peek_innocent', 'point_sky',
  'icon_onigiri', 'icon_pudding', 'icon_taiyaki', 'icon_compass', 'icon_shell', 'icon_glowshell', 'icon_gift', 'icon_postcard'
];
export const SPRITE_ORDER = REQUIRED.concat(LATER);
const GREEN = [64, 255, 94];
const CHUNK_PIXELS = 24000;

function specOf(name) {
  if (SOURCE[name]) return { spec: SOURCE[name], flip: false };
  if (name.endsWith('L') && SOURCE[name.slice(0, -1)]) return { spec: SOURCE[name.slice(0, -1)], flip: true };
  throw new Error(`缺少精灵：${name}`);
}

function bytesOf(list) {
  return list.reduce((n, name) => { const { spec } = specOf(name); return n + spec.w * spec.h; }, 0);
}
export function spriteBytes() { return bytesOf(SPRITE_ORDER); }

// 返回一个解码器；step() 每次处理一小块并返回是否全部完成，便于在动画帧之间穿插执行。
// ready：REQUIRED 已解码完，可以进入游戏；progress 指的是 REQUIRED 部分的进度（载入动画用）。
export function createDecoder(CanvasCtor, decodeBase64) {
  const cache = {};
  let index = 0;
  let job = null;
  let done = 0;
  const required = bytesOf(REQUIRED);
  const total = spriteBytes();
  function publish(name, entry) {
    cache[name] = entry;
    for (const [short, full] of Object.entries(ALIAS)) {
      if (full === name) cache[short] = entry;
      if (`${full}L` === name) cache[`${short}L`] = entry;
    }
  }
  return {
    cache,
    get progress() { return Math.min(1, done / required); },
    get allProgress() { return done / total; },
    get ready() { return index >= REQUIRED.length; },
    get finished() { return index >= SPRITE_ORDER.length; },
    step() {
      if (index >= SPRITE_ORDER.length) return true;
      if (!job) {
        const name = SPRITE_ORDER[index];
        const { spec, flip } = specOf(name);
        const binary = decodeBase64(spec.d);
        if (binary.length !== spec.w * spec.h) throw new Error(`精灵数据长度错误：${name}`);
        const canvas = new CanvasCtor(spec.w, spec.h);
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(spec.w, spec.h);
        job = { name, spec, binary, canvas, ctx, image, p: 0, flip };
      }
      const { spec, binary, image } = job;
      const data = image.data;
      const end = Math.min(binary.length, job.p + CHUNK_PIXELS);
      const flip = job.flip;
      const w = spec.w;
      for (let p = job.p; p < end; p += 1) {
        const a = flip ? binary.charCodeAt(p - (p % w) + (w - 1 - (p % w))) : binary.charCodeAt(p);
        const o = p * 4;
        data[o] = GREEN[0];
        data[o + 1] = GREEN[1];
        data[o + 2] = GREEN[2];
        data[o + 3] = a;
      }
      done += end - job.p;
      job.p = end;
      if (end >= binary.length) {
        job.ctx.putImageData(image, 0, 0);
        if (typeof job.ctx.flush === 'function') job.ctx.flush();
        publish(job.name, { canvas: job.canvas, w: spec.w, h: spec.h });
        job = null;
        index += 1;
      }
      return index >= SPRITE_ORDER.length;
    }
  };
}

// 取帧：未解码完的帧依次回退，保证任何时候都画得出东西。
export function pick(cache, ...names) {
  for (const name of names) if (name && cache[name]) return cache[name];
  return null;
}
