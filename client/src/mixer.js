// 音量：总音量 + 四路（音乐、环境声、音效、播报），每路 0–1，存在本机。
// Web Audio 的声音都接到对应那一路的总线（bus）上，HTML <audio> 和系统朗读按 level() 乘上去。
// 各路原来的开关（播报 / 音效 / 音乐 开关）照旧；音量拉到 0 也等于静音。

const KEY = 'botc.mixer';
export const CHANNELS = [
  ['master', '总音量', '所有声音'],
  ['music', '音乐', '每个阶段的背景音乐'],
  ['ambient', '环境声', '风雪、湖水、远处的狼嚎和鸟'],
  ['sfx', '音效', '脚步、敲门、倒计时、破门这些'],
  ['voice', '播报', 'AI 房主读旁白'],
];
const DEFAULTS = { master: 1, music: 1, ambient: 1, sfx: 1, voice: 1 };

let levels = { ...DEFAULTS };
try { levels = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* 隐私模式 */ }
const listeners = new Set();
const buses = new Map(); // `${通道}` → GainNode（整页共用一个 AudioContext）

/** 某一路的实际音量（已经乘了总音量）。 */
export const level = (ch) => (ch === 'master' ? levels.master : levels.master * (levels[ch] ?? 1));
export const rawLevel = (ch) => levels[ch] ?? 1;

export function setLevel(ch, v) {
  levels = { ...levels, [ch]: Math.max(0, Math.min(1, v)) };
  try { localStorage.setItem(KEY, JSON.stringify(levels)); } catch { /* 隐私模式 */ }
  for (const [name, g] of buses) g.gain.setTargetAtTime(level(name), g.context.currentTime, 0.05);
  for (const f of listeners) f(levels);
}
export function onMix(f) { listeners.add(f); return () => listeners.delete(f); }

/** 这一路的总线：Web Audio 的声音接到这里而不是 ctx.destination。 */
export function bus(ctx, ch) {
  let g = buses.get(ch);
  if (!g || g.context !== ctx) {
    g = ctx.createGain();
    g.gain.value = level(ch);
    g.connect(ctx.destination);
    buses.set(ch, g);
  }
  return g;
}
