// 显示设置：字号（文字多的界面整体缩放）和主题（深色 / 浅色），存在本机。
// 浅色主题只换"读字"的界面（右栏、操作面板、大厅设置、弹窗、菜单），地图、广场、过场这些画面不变。
// 样式见 styles.css 末尾的「浅色主题」和 --ui-zoom。

const KEY = 'botc.display';
const DEFAULTS = { scale: 1, theme: 'dark' };
let d = { ...DEFAULTS };
try { d = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* 隐私模式 */ }
// 地址栏带 ?theme=light / ?theme=dark、?scale=1.2 时临时用这个（截图、检查对比度用；不存）
try {
  const q = new URLSearchParams(location.search);
  if (q.get('theme')) d = { ...d, theme: q.get('theme') === 'light' ? 'light' : 'dark' };
  if (q.get('scale')) d = { ...d, scale: Number(q.get('scale')) || 1 };
} catch { /* 没有 location */ }
const listeners = new Set();

export const SCALES = [0.85, 0.95, 1, 1.1, 1.2, 1.35, 1.5];

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-zoom', String(d.scale));
  root.classList.toggle('theme-light', d.theme === 'light');
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
