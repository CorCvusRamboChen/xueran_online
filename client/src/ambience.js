// 环境声和背景音乐：
// · 风雪：一直在刮。进了房子（或夜里待在自己的小屋）就像隔着墙——低通滤波，又闷又远。
//   素材：wind.mp3 暴风雪打底 + wind-howl.mp3 呼啸声（屋外），wind-indoor.mp3 屋里听到的风（隔着窗缝）。
//   缺素材就用噪声现场合成一段呼啸的风。
// · 湖边：走近南边结冰的海，能听到水拍岸（lake.mp3，滤掉高频显得冷、闷），再叠上程序合成的冰层咯吱和清响。
// · 背景音乐：每个阶段一首，换阶段时交叉淡入淡出。曲子放在 assets/music/<阶段>.mp3：
//   lobby 大厅、night 夜晚、day 白天自由活动、nominate 提名、vote 投票、end 终局；缺哪首就往下找替补。
// 开关和音量存在本机。
import { audio } from './world/footsteps.js';
import { bus, level, onMix } from './mixer.js';

const urls = (glob) => Object.fromEntries(Object.entries(glob).map(([p, u]) => [p.split('/').pop().replace(/\.(mp3|ogg|m4a)$/, ''), u]));
const MUSIC = urls(import.meta.glob('./assets/music/*.{mp3,ogg,m4a}', { eager: true, query: '?url', import: 'default' }));
const SFX = urls(import.meta.glob('./assets/sfx/*.{mp3,ogg,m4a}', { eager: true, query: '?url', import: 'default' }));

// 缺曲子时的替补顺序
const FALLBACK = { nominate: ['nominate', 'vote', 'day'], vote: ['vote', 'nominate', 'day'], day: ['day'], night: ['night'], lobby: ['lobby', 'night'], end: ['end', 'lobby', 'night'] };
export const musicFor = (stage) => (FALLBACK[stage] ?? [stage]).map((k) => MUSIC[k]).find(Boolean) ?? null;

const KEY = 'botc.music';
let musicOn = true;
try { musicOn = localStorage.getItem(KEY) !== 'off'; } catch { /* 隐私模式 */ }
const listeners = new Set();
export const musicEnabled = () => musicOn;
export function setMusic(on) {
  musicOn = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 隐私模式 */ }
  for (const f of listeners) f(on);
  apply();
}
export function onMusic(f) { listeners.add(f); return () => listeners.delete(f); }

const MUSIC_VOL = 0.32;
const musicVol = () => MUSIC_VOL * level('music');
const WIND_VOL = 0.22;

// ───────────── 背景音乐：两个 <audio> 轮流，交叉淡化 ─────────────
let current = null; // { el, url }
function fade(el, to, ms, done) {
  const from = el.volume; const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step); else done?.();
  };
  requestAnimationFrame(step);
}
function playMusic(url) {
  if (current?.url === url) return;
  const old = current;
  current = null;
  if (old) fade(old.el, 0, 2500, () => old.el.pause());
  if (!url || !musicOn) return;
  const el = new Audio(url);
  el.loop = true; el.volume = 0;
  el.play().then(() => fade(el, musicVol(), 3000)).catch(() => { pendingUrl = url; });
  current = { el, url };
}
let pendingUrl = null;
// 浏览器要求先点一下才能放声音：第一次点击时补放
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { if (pendingUrl && current) { current.el.play().then(() => fade(current.el, musicVol(), 3000)).catch(() => {}); pendingUrl = null; } startWind(); });
}

// ───────────── 风雪 ─────────────
let wind = null; // { gain, filter, inside }
function startWind() {
  if (wind) return;
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 16000; filter.Q.value = 0.4;
  filter.connect(gain).connect(bus(ctx, 'ambient'));
  const inside = ctx.createGain(); inside.gain.value = 0; inside.connect(bus(ctx, 'ambient'));
  wind = { gain, filter, inside };
  if (SFX.wind) loop(ctx, SFX.wind, filter).catch(() => synthWind(ctx, filter));
  else synthWind(ctx, filter);
  if (SFX['wind-howl']) { const h = ctx.createGain(); h.gain.value = 0.45; h.connect(filter); loop(ctx, SFX['wind-howl'], h).catch(() => {}); }
  if (SFX['wind-indoor']) loop(ctx, SFX['wind-indoor'], inside).catch(() => {});
  apply();
}

/** 把一段录音解码后无限循环（每层从随机位置开始，几层叠在一起不会每次同时重头）。 */
async function loop(ctx, url, out) {
  const buf = await fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(out);
  src.start(0, Math.random() * buf.duration);
  return src;
}

/** 没有素材时现场合成：褐噪声打底 + 随阵风起伏的带通 + 一点高处的呼啸。 */
function synthWind(ctx, out) {
  const len = ctx.sampleRate * 6;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 420; body.Q.value = 0.7;
  const whistle = ctx.createBiquadFilter(); whistle.type = 'bandpass'; whistle.frequency.value = 1300; whistle.Q.value = 9;
  const wg = ctx.createGain(); wg.gain.value = 0.18;
  // 阵风：两个很慢的振荡器推着频率和音量走
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
  lfo.connect(lfoAmt).connect(body.frequency); lfoAmt.connect(whistle.frequency);
  const gust = ctx.createOscillator(); gust.frequency.value = 0.13;
  const gustAmt = ctx.createGain(); gustAmt.gain.value = 0.35;
  const level = ctx.createGain(); level.gain.value = 0.75;
  gust.connect(gustAmt).connect(level.gain);
  src.connect(body).connect(level);
  src.connect(whistle).connect(wg).connect(level);
  level.connect(out);
  src.start(); lfo.start(); gust.start();
}

// ───────────── 湖边 ─────────────
let lake = null; // { gain }
let lakeLevel = 0;
function startLake() {
  if (lake) return;
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const gain = ctx.createGain(); gain.gain.value = 0;
  gain.connect(bus(ctx, 'ambient'));
  lake = { gain };
  if (SFX.lake) {
    // 录音是港口碎浪，滤掉高频、压低一点，像水在冰缝间闷闷地拍
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0.8;
    lp.connect(g).connect(gain);
    loop(ctx, SFX.lake, lp).catch(() => synthLake(ctx, gain, true));
    synthLake(ctx, gain, false);
  } else synthLake(ctx, gain, true);
}

/** 冰层：隔一阵来一声咯吱或清响；water 为真时再合成一层水声（没有录音时用）。 */
function synthLake(ctx, out, water) {
  if (water) synthWater(ctx, out);
  const creak = () => {
    if (lakeLevel > 0.05) {
      const t = ctx.currentTime + 0.05;
      if (Math.random() < 0.6) { // 冰层受力的低沉咯吱
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(70 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.9);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 6;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
        o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 1.05);
      } else { // 远处冰面"叮——"的一声清响
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(1900 + Math.random() * 600, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.75);
      }
    }
    setTimeout(creak, 5000 + Math.random() * 9000);
  };
  setTimeout(creak, 3000);
}

/** 没素材时合成的水声：低沉的褐噪声随两个慢振荡起伏。 */
function synthWater(ctx, out) {
  const len = ctx.sampleRate * 5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0); let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const swell = ctx.createGain(); swell.gain.value = 0.5;
  for (const [f, amt] of [[0.17, 0.25], [0.31, 0.18]]) {
    const o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = amt;
    o.connect(g).connect(swell.gain); o.start();
  }
  src.connect(lp).connect(swell).connect(out);
  src.start();
}

/** 离湖多近：0（听不到）到 1（就在岸边），小镇画面每帧算好传进来。 */
export function setLake(level) {
  if (Math.abs(level - lakeLevel) < 0.02) return;
  lakeLevel = level;
  startLake();
  if (lake) lake.gain.gain.setTargetAtTime(musicOn && state.wind && !state.indoors ? level * 0.35 : 0, audio().currentTime, 0.8);
}

// ───────────── 状态 → 声音 ─────────────
let state = { stage: 'lobby', indoors: false, wind: false };
function apply() {
  if (wind) {
    const ctx = audio(); const t = ctx.currentTime;
    const vol = state.wind && musicOn ? (state.indoors ? WIND_VOL * 0.35 : WIND_VOL) : 0;
    wind.gain.gain.setTargetAtTime(vol, t, 0.6);
    // 室内：像隔着墙，高频全被吃掉
    wind.filter.frequency.setTargetAtTime(state.indoors ? 420 : 16000, t, 0.35);
    // 屋里另有一层"窗缝里漏进来的风"
    wind.inside.gain.setTargetAtTime(state.wind && musicOn && state.indoors ? WIND_VOL * 0.7 : 0, t, 0.6);
  }
  if (lake) lake.gain.gain.setTargetAtTime(musicOn && state.wind && !state.indoors ? lakeLevel * 0.35 : 0, audio().currentTime, 0.8);
  playMusic(musicOn ? musicFor(state.stage) : null);
}

// 拖音量条时，正在放的曲子跟着变（风声、湖水走 Web Audio 总线，自己会变）
onMix(() => { if (current && !current.el.paused) current.el.volume = musicVol(); });

/** 每次状态变化时调用：stage 是阶段，indoors 是不是在屋里，wind 要不要风声。 */
export function setAmbience(next) {
  if (next.stage === state.stage && next.indoors === state.indoors && next.wind === state.wind) return;
  state = next;
  startWind();
  apply();
}
