// 语音播报：用浏览器/系统自带的中文语音把 AI 房主的旁白读出来。
// 每个人的小程序自己播放，所以不管在哪间房子的私聊语音里、夜里有没有被闭耳都听得到。
// 开关存在本机（localStorage），默认开。浏览器要求先点一下页面才能出声，第一次点击时会解锁。

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
function play(url) {
  chain = chain.then(() => new Promise((done) => {
    const a = new Audio(url);
    a.volume = VOLUME;
    a.playbackRate = RATE;
    a.preservesPitch = true; // 加速不变调
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  }));
}

export function speak(text, audio = null) {
  if (!enabled || !text) return;
  if (audio) { play(audio); return; }
  if (!ok) return;
  const u = new SpeechSynthesisUtterance(clean(text));
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  u.rate = RATE;
  u.pitch = 0.82;
  u.volume = VOLUME;
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
