<script def>
{
  "navigationBarTitleText": "旅行肥鱼",
  "description": "旅行肥鱼：住在眼镜里的全息桌宠大肥鱼。主页互动、呼唤聊天、准备行囊让她去旅行，带回明信片和纪念品。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "debug": { "type": "string", "enum": ["fast"], "description": "调试：fast=时间加速120倍" },
        "reset": { "type": "string", "enum": ["1"], "description": "调试：清空存档重新开始" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { LanguageModel } from 'language-model';
import { createApp } from '../../lib/app.js';
import { createDecoder } from '../../lib/sprites.js';
import { SAVE_KEY } from '../../lib/game.js';

const FRAME_MS = 40;
const WAKE_GUARD_MS = 2500;
const ASR_IDLE_MS = 1500;
const ASR_SILENCE_MS = 8000;
const log = (...args) => console.log('[LVFY]', ...args);
const errorText = error => String(error && (error.message || error.name) || error || 'unknown');

function parseQuery(rawQuery) {
  let raw = rawQuery;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (error) { raw = null; } }
  if (!raw || typeof raw !== 'object') return {};
  let nested = raw.data;
  if (typeof nested === 'string') { try { nested = JSON.parse(nested); } catch (error) { nested = null; } }
  return Object.assign({}, raw, nested && typeof nested === 'object' ? nested : {});
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

// 语音识别：沿用义眼盯真真机路径（SpeechRecognition 裸全局）。返回 {stop, abort}。
function listen(handlers) {
  if (typeof SpeechRecognition === 'undefined') return null;
  let recognition = null;
  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
  } catch (error) {
    log('asr create failed', errorText(error));
    return null;
  }
  let finalText = '';
  let liveText = '';
  let ended = false;
  let idleTimer = null;
  let silenceTimer = null;
  const heard = () => (finalText || liveText).trim();
  const finish = () => {
    if (ended) return;
    ended = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (silenceTimer) clearTimeout(silenceTimer);
    recognition.onresult = null; recognition.onerror = null; recognition.onend = null;
    handlers.onEnd(heard());
  };
  const stop = () => {
    try { recognition.stop(); } catch (error) { log('asr stop', errorText(error)); }
    setTimeout(finish, 600);
  };
  recognition.onresult = event => {
    const results = event && event.results;
    const finals = [];
    const interim = [];
    if (results && typeof results.length === 'number') {
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i];
        const t = String((item && item.transcript) || (item && item[0] && item[0].transcript) || '').trim();
        if (!t) continue;
        if (item.isFinal === true) finals.push(t); else interim.push(t);
      }
    } else {
      const direct = String(event && (event.transcript || event.text) || '').trim();
      if (direct) finals.push(direct);
    }
    if (finals.length) finalText = finals.join('');
    liveText = finalText + interim.join('');
    handlers.onPartial(heard());
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, ASR_IDLE_MS);
  };
  recognition.onerror = event => { log('asr error', String(event && (event.error || event.message))); finish(); };
  recognition.onend = () => finish();
  try {
    recognition.start();
  } catch (error) {
    log('asr start failed', errorText(error));
    return null;
  }
  silenceTimer = setTimeout(() => { if (!heard()) stop(); }, ASR_SILENCE_MS);
  return {
    stop,
    abort() {
      ended = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition.onresult = null; recognition.onerror = null; recognition.onend = null;
      try { recognition.abort ? recognition.abort() : recognition.stop(); } catch (error) { log('asr abort', errorText(error)); }
    }
  };
}

// 语音播报：优先 synthesize + SpeechAudioPlayer（可随时停止），失败时退回 speak。
// 音色与音量来自 aiui-dev 文档；真机是否出声、音量是否合适需佩戴者确认。
const TTS_VOICE = 'female-tianmei';
const TTS_VOLUME = 3;
const speech = {
  token: 0,
  player: null,
  speak(value) {
    this.stop();
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    const Utterance = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null;
    if (!synth || !Utterance) { log('tts unavailable'); return; }
    const token = ++this.token;
    const utterance = new Utterance(value);
    try { utterance.voice = TTS_VOICE; utterance.volume = TTS_VOLUME; } catch (error) { log('tts option', errorText(error)); }
    const fallback = () => {
      try { synth.speak(utterance, 'immediate'); log('tts speak', value.length); } catch (error) { log('tts speak failed', errorText(error)); }
    };
    if (typeof synth.synthesize === 'function' && typeof SpeechAudioPlayer !== 'undefined') {
      try {
        Promise.resolve(synth.synthesize(utterance, { subtitles: 'none' })).then(task => {
          if (!task) return;
          if (token !== this.token) { try { task.abort && task.abort(); } catch (error) { /* ignore */ } return; }
          const player = new SpeechAudioPlayer(task);
          this.player = player;
          player.play();
          log('tts play', value.length, String(task.state || ''));
          setTimeout(() => {
            if (this.player !== player) return;
            try { log('tts state', JSON.stringify({ paused: player.paused, t: player.currentTime, d: player.duration })); } catch (error) { /* ignore */ }
          }, 2500);
        }).catch(error => {
          log('tts synthesize failed', errorText(error));
          if (token === this.token) fallback();
        });
        return;
      } catch (error) {
        log('tts synthesize threw', errorText(error));
      }
    }
    fallback();
  },
  stop() {
    this.token += 1;
    const player = this.player;
    this.player = null;
    if (!player) return;
    try {
      if (typeof player.stop === 'function') player.stop();
      if (typeof player.destroy === 'function') player.destroy();
    } catch (error) {
      log('tts stop ignored', errorText(error));
    }
  }
};

const chat = {
  async create(system) {
    if (typeof LanguageModel === 'undefined' || !LanguageModel || typeof LanguageModel.create !== 'function') return null;
    if (typeof LanguageModel.availability === 'function' && (await LanguageModel.availability()) !== 'available') return null;
    return LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }] });
  },
  prompt(session, question, ms) { return withTimeout(session.prompt(question), ms); },
  destroy(session) { try { if (session && session.destroy) session.destroy(); } catch (error) { log('session destroy', errorText(error)); } }
};

export default {
  data: { message: '' },
  app: null,
  visible: false,
  ready: false,
  timer: null,
  retry: 0,
  shownAt: 0,
  armed: false,
  frames: 0,
  slowFrames: 0,
  costSum: 0,

  onLoad(rawQuery) {
    const query = parseQuery(rawQuery);
    log('load', JSON.stringify(query));
    const storage = {
      get: key => wx.getStorageSync(key),
      set: (key, value) => wx.setStorageSync(key, value)
    };
    if (query.reset === '1') {
      try { wx.setStorageSync(SAVE_KEY, ''); log('save reset'); } catch (error) { log('reset failed', errorText(error)); }
    }
    const decoder = createDecoder(Canvas, value => window.atob(value));
    this.app = createApp({
      now: () => Date.now(),
      storage,
      decoder,
      log,
      timeScale: query.debug === 'fast' ? 120 : 1,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: id => clearTimeout(id),
      listen,
      chat,
      speech
    });
    if (typeof this.enableWorldAwareness === 'function') {
      try { this.enableWorldAwareness(); log('world awareness on'); } catch (error) { log('world awareness unavailable', errorText(error)); }
    }
    this.visible = true;
    this.shownAt = Date.now();
  },
  onShow() {
    log('show');
    this.visible = true;
    this.shownAt = Date.now();
    if (this.app) this.app.show(Date.now());
    this.loop();
  },
  onReady() { this.ready = true; this.loop(); },
  onHide() { log('hide'); this.visible = false; this.stop(); if (this.app) this.app.hide(); },
  onUnload() { log('unload'); this.visible = false; this.stop(); if (this.app) this.app.hide(); speech.stop(); },
  stop() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  },
  loop() {
    if (!this.visible || !this.ready || this.timer !== null || !this.app) return;
    const started = Date.now();
    let ctx = null;
    try {
      this.app.tick(started);
      ctx = wx.createCanvasContext('stage');
      if (ctx) {
        this.app.draw(ctx);
        ctx.flush();
        this.frames += 1;
      }
    } catch (error) {
      log('frame error', errorText(error), String(error && error.stack || '').slice(0, 300));
      if (ctx) { try { ctx.flush(); } catch (e) { /* ignore */ } }
      this.retry += 1;
      if (this.retry > 30) { this.setData({ message: '画面出错：' + errorText(error).slice(0, 40) }); return; }
    }
    const cost = Date.now() - started;
    this.costSum += cost;
    if (cost > FRAME_MS) this.slowFrames += 1;
    if (this.frames % 250 === 1) log('perf', JSON.stringify({ frames: this.frames, avg: Math.round(this.costSum / Math.max(1, this.frames)), slow: this.slowFrames, screen: this.app.view.screen }));
    this.timer = setTimeout(() => { this.timer = null; this.loop(); }, Math.max(8, (ctx ? FRAME_MS : 80) - cost));
  },
  onHeadGesture(event) {
    const gesture = event && (event.gesture || event.type);
    log('head gesture', String(gesture));
    if (this.visible && this.app && gesture === 'nod') this.app.nod();
  },
  onVoiceWakeup(event) {
    if (!this.visible || !this.app) return;
    if (event && event.preventDefault) event.preventDefault();
    if (Date.now() - this.shownAt < WAKE_GUARD_MS) { log('wake ignored: launch guard'); return; }
    log('voice wakeup');
    this.app.voiceWake();
  },
  handleTap() { this.armed = false; if (this.app) this.app.confirm(); },
  onKeyDown(event) {
    const c = event && (event.code || event.key || event.keyCode);
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Select' || c === 'OK' || c === 13) this.armed = true;
  },
  onKeyUp(event) {
    if (!this.app) return;
    const c = event && (event.code || event.key || event.keyCode);
    log('key', String(c), this.app.view.screen);
    const isBack = c === 'Backspace' || c === 'Escape' || c === 'Back' || c === 'GoBack' || c === 4 || c === 8 || c === 27;
    if (isBack) {
      const handled = this.app.back();
      if (handled && event && event.preventDefault) event.preventDefault();
      if (!handled) { this.app.persist(); log('exit to host'); }
      return;
    }
    if (c === 'ArrowUp' || c === 'Up' || c === 19) { if (event.preventDefault) event.preventDefault(); this.app.swipe(-1); return; }
    if (c === 'ArrowDown' || c === 'Down' || c === 20) { if (event.preventDefault) event.preventDefault(); this.app.swipe(1); return; }
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Select' || c === 'OK' || c === 13) {
      const armed = this.armed;
      this.armed = false;
      if (event && event.preventDefault) event.preventDefault();
      if (armed) this.app.confirm();
    }
  }
};
</script>

<page>
  <view class="root" bindtap="handleTap">
    <canvas id="stage" width="480" height="320" class="stage"></canvas>
    <text class="message">{{message}}</text>
  </view>
</page>

<style>
.root { width: 480px; height: 320px; background-color: #000000; position: relative; }
.stage { width: 480px; height: 320px; }
.message { position: absolute; left: 16px; top: 140px; width: 448px; font-size: 14px; line-height: 20px; color: #40ff5e; text-align: center; }
</style>
