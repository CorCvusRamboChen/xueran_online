// 延长线（Extension Cord）：借暗流涌动的钟楼广场，换成断了电的雨夜——路灯暗了，只剩窗户里的光。
import TB from './tb.js';

export default {
  ...TB,
  id: 'ext',
  art: 'tb',
  place: '钟楼镇 · 断电的雨夜',
  weather: 'drizzle',
  roofSnow: 0,
  fog: { color: 0x8e98a6, ground: 0.18, haze: 0.22, mist: 0.06 },
  tone: { map: { brightness: 0.74 }, houses: { brightness: 0.78 } },
};
