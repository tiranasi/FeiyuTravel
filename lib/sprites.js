// 把单通道亮度精灵逐块解码到离屏 Canvas。真机已验证：new Canvas + putImageData + drawImage(缓存Canvas) 不闪。
import { SPRITES } from './sprite-data.js';

// 以 L 结尾的是运行时水平镜像，不依赖 ctx.scale。
export const SPRITE_ORDER = ['holo', 'front', 'side', 'sideL', 'back', 'smug', 'wow', 'pout', 'think'];
const GREEN = [64, 255, 94];
const CHUNK_PIXELS = 24000;

export function spriteBytes() {
  return SPRITE_ORDER.reduce((n, name) => { const spec = SPRITES[name.replace(/L$/, '')]; return n + spec.w * spec.h; }, 0);
}

// 返回一个解码器；step() 每次处理一小块并返回是否完成，便于在加载动画帧之间穿插执行。
export function createDecoder(CanvasCtor, decodeBase64) {
  const cache = {};
  let index = 0;
  let job = null;
  let done = 0;
  const total = spriteBytes();
  return {
    cache,
    get progress() { return done / total; },
    get finished() { return index >= SPRITE_ORDER.length; },
    step() {
      if (index >= SPRITE_ORDER.length) return true;
      if (!job) {
        const name = SPRITE_ORDER[index];
        const flip = name.endsWith('L');
        const spec = SPRITES[flip ? name.slice(0, -1) : name];
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
        cache[job.name] = { canvas: job.canvas, w: spec.w, h: spec.h };
        job = null;
        index += 1;
      }
      return index >= SPRITE_ORDER.length;
    }
  };
}
