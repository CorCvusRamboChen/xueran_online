// 语音播报：用浏览器/系统自带的中文语音把 AI 房主的旁白读出来。
// 每个人的小程序自己播放，所以不管在哪间房子的私聊语音里、夜里有没有被闭耳都听得到。
// 开关存在本机（localStorage），默认开；音量跟着混音器的「播报」那一路（mixer.js）。
// 浏览器要求先点一下页面才能出声，第一次点击时会解锁。
import { level } from './mixer.js';

const KEY = 'botc.tts';
const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* 隐私模式 */ }
let voice = null;
const listeners = new Set();

function pickVoice() {
  const vs = window.speechSynthesis.getVoices();
  const zh = vs.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || /^cmn/i.test(v.lang));
  // 优先自然一点的声音
  voice = zh.find((v) => /Xiaoxiao|Yunxi|Yunjian|Natural|Online/i.test(v.name))
    ?? zh.find((v) => /Huihui|Kangkang|Tingting|Google/i.test(v.name))
    ?? zh[0] ?? vs.find((v) => /^zh/i.test(v.lang)) ?? null;
}
if (ok) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  // 第一次点击页面时说一句空话，解锁自动播放
  const unlock = () => { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

/** 去掉 **粗体** 之类的标记，读起来更顺。 */
const clean = (text) => text.replace(/\*\*/g, '').replace(/[「」]/g, '');

// 播报的音量和语速（音量 0–1；语速 1 = 原速）。别盖过语音聊天，也别拖沓
const VOLUME = 0.5;
const RATE = 1.2;

// 服务器配了 Azure 配音时，旁白带 audio 地址：按顺序一句一句播放
let chain = Promise.resolve();
function play(url, text) {
  chain = chain.then(() => new Promise((done) => {
    const a = new Audio(url);
    a.volume = VOLUME * level('voice');
    a.playbackRate = RATE;
    a.preservesPitch = true; // 加速不变调
    // 配音没生成出来（比如玩家自己写的造谣者声明合成失败）：改用系统语音念，别整句静音
    let fell = false;
    const fallback = () => { if (!fell) { fell = true; synth(text); } done(); };
    a.onended = done; a.onerror = fallback;
    a.play().catch((e) => (e?.name === 'NotAllowedError' ? done() : fallback()));
  }));
}

export function speak(text, audio = null) {
  if (!enabled || !text) return;
  if (audio) { play(audio, text); return; }
  synth(text);
}

/** 用浏览器 / 系统自带的中文语音念。 */
function synth(text) {
  if (!ok || !text) return;
  const u = new SpeechSynthesisUtterance(clean(text));
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  u.rate = RATE;
  u.pitch = 0.82;
  u.volume = VOLUME * level('voice');
  window.speechSynthesis.speak(u);
}

export const ttsSupported = ok;
export const ttsEnabled = () => enabled;
export function setTts(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 隐私模式 */ }
  if (!on && ok) window.speechSynthesis.cancel();
  for (const f of listeners) f(on);
}
export function onTts(f) { listeners.add(f); return () => listeners.delete(f); }
