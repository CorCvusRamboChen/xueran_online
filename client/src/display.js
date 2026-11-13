// 显示设置：字号（文字多的界面整体缩放）、地图上的小人用什么模型（avatars：2d 线稿小人 / baked 3D 预渲染 / live 3D 实时），存在本机。字号的样式见 styles.css 的 --ui-zoom。

const KEY = 'botc.display';
const DEFAULTS = { scale: 1, avatars: '2d' };
let d = { ...DEFAULTS };
try { d = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* 隐私模式 */ }
// 地址栏带 ?scale=1.2 时临时用这个（截图用；不存）
try {
  const q = new URLSearchParams(location.search);
  if (q.get('scale')) d = { ...d, scale: Number(q.get('scale')) || 1 };
} catch { /* 没有 location */ }
const listeners = new Set();

export const SCALES = [0.85, 0.95, 1, 1.1, 1.2, 1.35, 1.5];

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-zoom', String(d.scale));
}
apply();

export const getDisplay = () => d;
export function setDisplay(patch) {
  d = { ...d, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 隐私模式 */ }
  apply();
  for (const f of listeners) f(d);
}
export function onDisplay(f) { listeners.add(f); return () => listeners.delete(f); }

export const AVATAR_MODES = [['2d', '2D 小人'], ['baked', '3D 预渲染'], ['live', '3D 实时']];
let url3d = null;
try { url3d = new URLSearchParams(location.search).get('avatar3d'); } catch { /* 没有 location */ }
/**
 * 3D 小人暂停开发（11-11）：设置里不出现「模型」、大厅不出现「你的形象」，地图一律 2D 小人。
 * 网址带 ?avatar3d 的打样不受影响。要重新开放就把这里改成 true。
 */
export const AVATAR_3D_ON = url3d !== null;
/**
 * 地图上的小人怎么画：'2d' 线稿 | 'baked' 3D 预渲染（每个动作几帧图）| 'live' 3D 实时渲染 | 'proc' 程序搭的 3D（开发用）。
 * 按设置；网址带 ?avatar3d=glb 时设置是 2D 也当 3D 实时（打样用），只带 ?avatar3d 是程序搭的小人。
 */
export function avatarMode() {
  const a = AVATAR_MODES.some(([k]) => k === d.avatars) ? d.avatars : '2d';
  if (url3d === null) return '2d'; // 暂停开发：存下来的设置先不管，一律 2D
  if (url3d === 'glb') return a === '2d' ? 'live' : a;
  return 'proc';
}
