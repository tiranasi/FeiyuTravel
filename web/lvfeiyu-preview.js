// 本机预览外壳：为共享 lib/ 提供浏览器版 Canvas、存储与模拟语音。
import { createApp } from '../lib/app.js';
import { createDecoder } from '../lib/sprites.js';
import { SAVE_KEY } from '../lib/game.js';

class Canvas {
  constructor(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
}
const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');
ctx.flush = () => {};
const params = new URLSearchParams(location.search);
const fast = document.getElementById('fast');
fast.checked = params.get('fast') === '1';
const storage = { get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value) };
const asrForm = document.getElementById('asr');
const asrText = document.getElementById('asr-text');
let asrHandlers = null;
const app = createApp({
  now: () => Date.now(),
  storage,
  decoder: createDecoder(Canvas, value => atob(value)),
  log: (...args) => console.log('[LVFY]', ...args),
  timeScale: fast.checked ? 120 : 1,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  listen(handlers) {
    asrHandlers = handlers;
    asrForm.hidden = false;
    asrText.value = '';
    asrText.focus();
    return { stop() { finish(); }, abort() { asrHandlers = null; asrForm.hidden = true; } };
  },
  chat: null,
  // 本机预览：用浏览器语音朗读，仅供试听节奏，不代表眼镜音色
  speech: {
    speak(value) {
      console.log('[LVFY] tts', value);
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(value);
      u.lang = 'zh-CN';
      window.speechSynthesis.speak(u);
    },
    stop() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  }
});
function finish() {
  const handlers = asrHandlers;
  asrHandlers = null;
  asrForm.hidden = true;
  stage.focus();
  if (handlers) handlers.onEnd(asrText.value);
}
asrText.addEventListener('input', () => asrHandlers && asrHandlers.onPartial(asrText.value));
asrForm.addEventListener('submit', event => { event.preventDefault(); finish(); });
window.__app = app;
const act = key => {
  if (key === 'up') app.swipe(-1);
  else if (key === 'down') app.swipe(1);
  else if (key === 'ok') app.confirm();
  else if (key === 'back') app.back();
  else if (key === 'wake') app.voiceWake();
  else if (key === 'nod') app.nod();
  else if (key === 'reset') { localStorage.removeItem(SAVE_KEY); location.reload(); }
};
document.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => act(button.dataset.key)));
fast.addEventListener('change', () => { params.set('fast', fast.checked ? '1' : '0'); location.search = params.toString(); });
document.addEventListener('keydown', event => {
  if (event.target === asrText) return;
  const map = { ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', Backspace: 'back', v: 'wake', V: 'wake', n: 'nod', N: 'nod' };
  if (map[event.key]) { event.preventDefault(); act(map[event.key]); }
});
stage.addEventListener('click', () => app.confirm());
let frames = 0;
let cost = 0;
function frame() {
  const t0 = performance.now();
  app.tick(Date.now());
  app.draw(ctx);
  cost += performance.now() - t0;
  frames += 1;
  window.__perf = { frames, avg: cost / frames };
  setTimeout(frame, 40);
}
frame();
