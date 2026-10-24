// 脚步声和敲门声：用 Web Audio 现场合成，不用音频文件（Discord 里加载外部资源麻烦，也省体积）。
// 不同地面不同声音：雪地咯吱、石板清脆、木地板闷响、石地发硬、瓷砖短促、地毯发闷、碎石沙沙、码头木板空响。
// 自己的脚步最响；别人的按距离变小、按左右声像，离太远就不放。开关存在本机。

const KEY = 'botc.sfx';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* 隐私模式 */ }
const listeners = new Set();
let ctx = null;
let noise = null;

/** 整个页面共用一个 AudioContext（脚步、风声都走它）。 */
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // 一秒白噪声，所有声音都从它裁一段
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 浏览器要求用户先点一下才能出声
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => audio(), { once: true });

const rand = (a, b) => a + Math.random() * (b - a);

/** 一小段滤过波的噪声。 */
function burst(out, t, { dur, type = 'bandpass', freq, q = 1, gain = 1, attack = 0.002 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.8, dur + 0.05);
}

/** 一声低沉的"咚"（落脚的重量感）。 */
function thump(out, t, { freq, dur, gain }) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

/** 一串细碎的颗粒（雪、碎石）。 */
function grains(out, t, { n, spread, freq, gain, dur = 0.012 }) {
  for (let i = 0; i < n; i++) burst(out, t + Math.random() * spread, { dur: dur * rand(0.6, 1.4), freq: freq * rand(0.7, 1.4), q: 3, gain: gain * rand(0.4, 1) });
}

const SURFACES = {
  snow: (o, t) => { grains(o, t, { n: 9, spread: 0.09, freq: 2600, gain: 0.5 }); burst(o, t, { dur: 0.12, type: 'lowpass', freq: 700, gain: 0.35, attack: 0.01 }); },
  cobble: (o, t) => { burst(o, t, { dur: 0.035, type: 'highpass', freq: 1800, gain: 0.55 }); thump(o, t, { freq: 110, dur: 0.06, gain: 0.35 }); },
  wood: (o, t) => { thump(o, t, { freq: 95, dur: 0.14, gain: 0.7 }); thump(o, t + 0.004, { freq: 210, dur: 0.07, gain: 0.25 }); burst(o, t, { dur: 0.05, freq: 600, q: 2, gain: 0.25 }); },
  stone: (o, t) => { burst(o, t, { dur: 0.05, freq: 2400, q: 1.5, gain: 0.6 }); thump(o, t, { freq: 140, dur: 0.05, gain: 0.3 }); burst(o, t + 0.02, { dur: 0.18, freq: 1800, q: 6, gain: 0.08, attack: 0.01 }); },
  tile: (o, t) => { burst(o, t, { dur: 0.025, type: 'highpass', freq: 3200, gain: 0.6 }); thump(o, t, { freq: 160, dur: 0.04, gain: 0.25 }); },
  carpet: (o, t) => { burst(o, t, { dur: 0.09, type: 'lowpass', freq: 320, gain: 0.55, attack: 0.012 }); thump(o, t, { freq: 80, dur: 0.08, gain: 0.3 }); },
  gravel: (o, t) => { grains(o, t, { n: 14, spread: 0.12, freq: 1200, gain: 0.45, dur: 0.018 }); thump(o, t, { freq: 90, dur: 0.06, gain: 0.2 }); },
  pier: (o, t) => { thump(o, t, { freq: 70, dur: 0.2, gain: 0.8 }); thump(o, t + 0.006, { freq: 150, dur: 0.12, gain: 0.3 }); burst(o, t, { dur: 0.06, freq: 450, q: 3, gain: 0.25 }); },
};

/** 一步。volume 0–1，pan -1（左）到 1（右）。 */
export function footstep(surface, volume = 1, pan = 0) {
  if (!enabled || volume < 0.03 || !SURFACES[surface]) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume * rand(0.8, 1);
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(a.destination); } else g.connect(a.destination);
  SURFACES[surface](g, a.currentTime + 0.005);
}

/** 敲门："叩、叩、叩"。 */
export function knock(volume = 1, pan = 0) {
  if (!enabled || volume < 0.03) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(a.destination); } else g.connect(a.destination);
  for (let i = 0; i < 3; i++) {
    const t = a.currentTime + 0.01 + i * 0.22;
    thump(g, t, { freq: 160, dur: 0.12, gain: 0.8 });
    burst(g, t, { dur: 0.04, freq: 900, q: 2, gain: 0.4 });
  }
}

/** 倒计时最后几秒的钟表滴答（urgent 时更高更响）。 */
export function tick(urgent = false) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = urgent ? 0.5 : 0.32;
  g.connect(a.destination);
  const t = a.currentTime + 0.01;
  thump(g, t, { freq: urgent ? 1400 : 1000, dur: 0.05, gain: 0.7 });
  burst(g, t, { dur: 0.02, freq: 3200, q: 4, gain: 0.35 });
}

export const sfxEnabled = () => enabled;
export function setSfx(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 隐私模式 */ }
  for (const f of listeners) f(on);
}
export function onSfx(f) { listeners.add(f); return () => listeners.delete(f); }
