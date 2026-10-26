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

/** 踹门：一记沉重的闷响 + 木头开裂 + 门闩哗啦 + 碎木屑。power 0–1 越来越狠；heavy=true 是门板整个被撞飞。 */
export function doorKick(volume = 0.8, heavy = false, power = 0.5) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  g.connect(a.destination);
  const t = a.currentTime + 0.005;
  thump(g, t, { freq: heavy ? 38 : 60 - power * 15, dur: heavy ? 0.7 : 0.28 + power * 0.15, gain: 1 });
  burst(g, t, { dur: heavy ? 0.45 : 0.16 + power * 0.1, type: 'lowpass', freq: 600 + power * 400, gain: 1 });
  burst(g, t + 0.01, { dur: 0.09, type: 'highpass', freq: 2200, gain: 0.5 + power * 0.4 }); // 开裂
  for (let i = 0; i < 4; i++) burst(g, t + 0.04 + i * 0.035, { dur: 0.03, freq: 3200 + i * 300, q: 6, gain: 0.35 }); // 门闩、铰链哗啦
  grains(g, t + 0.03, { n: heavy ? 26 : 6 + Math.round(power * 10), spread: heavy ? 0.5 : 0.18, freq: 1600, gain: 0.35, dur: 0.02 }); // 木屑
}

/** 心跳："咚—咚"，越来越急的时候用。 */
export function heartbeat(volume = 0.35) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  g.connect(a.destination);
  const t = a.currentTime + 0.005;
  thump(g, t, { freq: 48, dur: 0.16, gain: 1 });
  thump(g, t + 0.17, { freq: 42, dur: 0.2, gain: 0.7 });
}

/** 用身体顶门的一声闷响（QTE 每按一下）。 */
export function shove(volume = 0.4) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  g.connect(a.destination);
  const t = a.currentTime + 0.005;
  thump(g, t, { freq: 95, dur: 0.09, gain: 0.9 });
  burst(g, t, { dur: 0.05, type: 'lowpass', freq: 500, gain: 0.5 });
}

/** 一记爪击：撕破空气的"嘶——"（滤波噪声从高扫到低）+ 一声闷的击中。 */
export function slash(volume = 0.7) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  g.connect(a.destination);
  const t = a.currentTime + 0.005;
  const src = a.createBufferSource(); src.buffer = noise;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
  f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.16);
  const e = a.createGain();
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.03); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(f).connect(e).connect(g);
  src.start(t, Math.random() * 0.7, 0.25);
  thump(g, t + 0.13, { freq: 70, dur: 0.22, gain: 0.9 });
  burst(g, t + 0.13, { dur: 0.12, type: 'lowpass', freq: 380, gain: 0.7 });
}

/** 恶魔的低吼：两个失谐的低频锯齿波，压着嗓子往下沉。 */
export function growl(volume = 0.5) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = volume;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
  lp.connect(g).connect(a.destination);
  const t = a.currentTime + 0.005;
  for (const [hz, gain] of [[62, 0.5], [93, 0.3]]) {
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(hz * 1.15, t); o.frequency.exponentialRampToValueAtTime(hz * 0.8, t + 1.1);
    const e = a.createGain();
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + 0.15); e.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(e).connect(lp);
    o.start(t); o.stop(t + 1.25);
  }
  burst(g, t, { dur: 1.1, type: 'lowpass', freq: 300, gain: 0.35, attack: 0.15 });
}

/** 一路输出：音量 + 左右声像（远处的声音用）。 */
function outBus(a, volume, pan) {
  const g = a.createGain(); g.gain.value = volume;
  if (a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(a.destination); } else g.connect(a.destination);
  return g;
}

/** 远处的狼嚎：一声长嚎（音高先升后落、带颤音），常常还有另一只应和；低通加回声，像是从林子深处传来。 */
export function wolfHowl(volume = 0.2, pan = 0) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const out = outBus(a, volume, pan);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  const dly = a.createDelay(1); dly.delayTime.value = 0.27; const fb = a.createGain(); fb.gain.value = 0.38;
  lp.connect(out); lp.connect(dly); dly.connect(fb).connect(dly); dly.connect(out);
  const howl = (t0, f0, f1, f2, dur, gain) => {
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.28);
    env.gain.setValueAtTime(gain, t0 + dur * 0.72); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(lp);
    const vib = a.createOscillator(); vib.frequency.value = 5 + Math.random(); const vg = a.createGain(); vg.gain.value = f1 * 0.012;
    vib.connect(vg);
    for (const [type, mul, g] of [['sine', 1, 1], ['sawtooth', 1, 0.08], ['sine', 2, 0.18]]) {
      const o = a.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * mul, t0);
      o.frequency.linearRampToValueAtTime(f1 * mul, t0 + dur * 0.32);
      o.frequency.linearRampToValueAtTime(f1 * 1.03 * mul, t0 + dur * 0.7);
      o.frequency.linearRampToValueAtTime(f2 * mul, t0 + dur);
      vg.connect(o.frequency);
      const og = a.createGain(); og.gain.value = g;
      o.connect(og).connect(env);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    vib.start(t0); vib.stop(t0 + dur + 0.05);
  };
  const t = a.currentTime + 0.02;
  howl(t, 330, 560, 380, 2.8, 0.5);
  if (Math.random() < 0.6) howl(t + 1.2 + Math.random(), 380, 640, 420, 2.3, 0.32); // 另一只应和，离得更远
}

/** 鸟群惊飞：一阵扑棱棱的翅膀声由密到疏，夹着几声短促的惊叫。 */
export function birdsFlush(volume = 0.25, pan = 0) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const out = outBus(a, volume, pan);
  const t = a.currentTime + 0.02;
  for (let i = 0; i < 46; i++) {
    const dt = 1.5 * Math.random() * Math.random(); // 开头密、后面疏
    burst(out, t + dt, { dur: 0.025 + Math.random() * 0.02, freq: 800 + Math.random() * 1600, q: 1.4, gain: 0.5 * (1 - dt / 1.7) });
  }
  for (let i = 0; i < 7; i++) {
    const t0 = t + 0.05 + Math.random() * 1.1;
    const o = a.createOscillator(); o.type = 'sine';
    const f = 2600 + Math.random() * 1600;
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * (1.15 + Math.random() * 0.3), t0 + 0.05);
    const e = a.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(e).connect(out); o.start(t0); o.stop(t0 + 0.1);
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
