// 拍照与压缩：移植自义眼盯真（yiyan-dingzhen/lib/capture.js）2026-11-10 RG_glasses 真机走通的路径。
//   getUserMedia({video:true}) → new ImageCapture(track) → 预热 2500ms（否则几乎全黑）→ takePhoto()（只用无参形式）
//   → Blob.arrayBuffer()；失败时退回 wx.media.createCameraContext().takePhoto()。
//   必须在用户按键的调用栈里开始调用（宿主有交互门禁），调用前不能有 await。
// 本模块不碰 DOM：宿主能力通过 root 对象注入，默认从裸标识符/globalThis 探测（真机上 ImageCapture 是裸标识符）。

export const CAMERA_WARMUP_MS = 2500;
export const IMAGE_MAX_EDGE = 1024;
export const IMAGE_QUALITY = 0.7;

const errorText = error => String(error && (error.message || error.name) || error || 'unknown');
const G = typeof globalThis !== 'undefined' ? globalThis : {};
export const hostScope = () => ({
  navigator: typeof navigator !== 'undefined' ? navigator : G.navigator,
  ImageCapture: typeof ImageCapture !== 'undefined' ? ImageCapture : G.ImageCapture,
  Blob: typeof Blob !== 'undefined' ? Blob : G.Blob,
  createImageBitmap: typeof createImageBitmap !== 'undefined' ? createImageBitmap : G.createImageBitmap,
  createImageBlob: typeof createImageBlob !== 'undefined' ? createImageBlob : G.createImageBlob,
  setTimeout: typeof setTimeout !== 'undefined' ? setTimeout : G.setTimeout,
  now: () => Date.now()
});

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const parts = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    chunk += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < bytes.length ? B64[c & 63] : '=');
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk);
  return parts.join('');
}

export function toDataUrl(photo, wx, log) {
  let base64 = '';
  try {
    if (wx && typeof wx.arrayBufferToBase64 === 'function') base64 = wx.arrayBufferToBase64(photo.buffer);
  } catch (error) {
    if (log) log('arrayBufferToBase64 failed', errorText(error));
  }
  if (!base64) base64 = bytesToBase64(photo.buffer);
  return `data:${photo.mimeType || 'image/jpeg'};base64,${base64}`;
}

function stopStream(stream, log) {
  try {
    const tracks = stream && typeof stream.getTracks === 'function' ? stream.getTracks() : [];
    for (const track of tracks) if (track && typeof track.stop === 'function') track.stop();
  } catch (error) {
    if (log) log('track stop ignored', errorText(error));
  }
}

async function blobBuffer(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  throw new Error('photo blob has no arrayBuffer()');
}

function aborted() {
  const error = new Error('capture canceled');
  error.name = 'AbortError';
  return error;
}

// 拍一张照片。options.isCurrent() 返回 false 时中止；options.onStage(stage) 报告 'stream' | 'warmup' | 'shutter'。
// 返回 { buffer, mimeType, blob|null, source }。
export async function capturePhoto(wx, options = {}, log, root = hostScope()) {
  const check = () => { if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw aborted(); };
  const stage = name => { if (typeof options.onStage === 'function') options.onStage(name); };
  const media = root.navigator && root.navigator.mediaDevices;
  let firstError = null;
  if (log) log('camera probe', JSON.stringify({ getUserMedia: !!(media && typeof media.getUserMedia === 'function'), ImageCapture: typeof root.ImageCapture, wxCamera: !!(wx && wx.media && typeof wx.media.createCameraContext === 'function') }));
  if (media && typeof media.getUserMedia === 'function' && typeof root.ImageCapture !== 'undefined') {
    let stream = null;
    try {
      stage('stream');
      stream = await media.getUserMedia({ video: true });
      check();
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('no video track');
      const capture = new root.ImageCapture(track);
      const warmupMs = Number.isFinite(options.warmupMs) ? Math.max(0, Math.min(5000, options.warmupMs)) : CAMERA_WARMUP_MS;
      stage('warmup');
      if (log) log('camera warmup', warmupMs);
      const readyAt = root.now() + warmupMs;
      while (root.now() < readyAt) {
        check();
        await new Promise(resolve => root.setTimeout(resolve, Math.min(50, Math.max(1, readyAt - root.now()))));
      }
      check();
      stage('shutter');
      const blob = await capture.takePhoto();
      check();
      const buffer = await blobBuffer(blob);
      if (log) log('photo via ImageCapture', JSON.stringify({ bytes: buffer.byteLength, type: blob.type || '' }));
      return { buffer, mimeType: blob.type || 'image/jpeg', blob, source: 'ImageCapture' };
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      firstError = error;
      if (log) log('ImageCapture failed', errorText(error));
    } finally {
      stopStream(stream, log);
    }
  }
  check();
  const camera = wx && wx.media && typeof wx.media.createCameraContext === 'function' ? wx.media.createCameraContext() : null;
  if (camera && typeof camera.takePhoto === 'function') {
    stage('shutter');
    const result = await camera.takePhoto({ mode: 'default' });
    const buffer = result && result.data;
    if (!buffer || !(buffer.byteLength > 0)) throw new Error('camera returned no data');
    const mimeType = result.mimeType || 'image/jpeg';
    let blob = null;
    try { if (typeof root.Blob !== 'undefined') blob = new root.Blob([buffer], { type: mimeType }); } catch (error) { /* 无 Blob 也能上传 */ }
    if (log) log('photo via wx camera', JSON.stringify({ bytes: buffer.byteLength, type: mimeType }));
    return { buffer, mimeType, blob, source: 'wx.media' };
  }
  throw firstError || new Error('camera unavailable');
}

async function decodeBitmap(photo, resize, log, root) {
  if (typeof root.createImageBitmap !== 'function' || !photo.blob) return null;
  try {
    return resize ? await root.createImageBitmap(photo.blob, resize) : await root.createImageBitmap(photo.blob);
  } catch (error) {
    if (log) log('createImageBitmap failed', errorText(error));
    return null;
  }
}

function closeBitmap(bitmap) {
  try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch (error) { /* 已关闭 */ }
}

// 尽量压小再交给模型；任何一步不行就保留原图（真机原图约 60KB，可直接上传）。
export async function shrinkPhoto(photo, maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY, log, root = hostScope()) {
  if (typeof root.createImageBlob !== 'function') return photo;
  let bitmap = await decodeBitmap(photo, null, log, root);
  if (!bitmap) return photo;
  try {
    const width = Number(bitmap.width);
    const height = Number(bitmap.height);
    if (width > 0 && height > 0 && Math.max(width, height) > maxEdge) {
      const k = maxEdge / Math.max(width, height);
      const small = await decodeBitmap(photo, { resizeWidth: Math.round(width * k), resizeHeight: Math.round(height * k), resizeQuality: 'medium' }, log, root);
      // 宿主可能忽略缩放参数（真机实测 resizeWidth 被忽略）：只有尺寸真的变小才采用
      if (small && Number(small.width) > 0 && Number(small.width) < width) { closeBitmap(bitmap); bitmap = small; } else closeBitmap(small);
    }
    const blob = await root.createImageBlob(bitmap, { type: 'image/jpeg', quality });
    const buffer = await blobBuffer(blob);
    if (log) log('shrink', JSON.stringify({ from: photo.buffer.byteLength, to: buffer.byteLength, width, height }));
    if (buffer.byteLength > 0 && buffer.byteLength < photo.buffer.byteLength) return { buffer, mimeType: 'image/jpeg', blob, source: `${photo.source}+jpeg` };
    return photo;
  } catch (error) {
    if (log) log('shrink failed', errorText(error));
    return photo;
  } finally {
    closeBitmap(bitmap);
  }
}
