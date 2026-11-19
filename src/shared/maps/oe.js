// 横行霸道（Outed Evil）：借暗流涌动的钟楼广场，换成一个下着冷雨的夜。坏人在这个剧本里会「出头」——
// 恐惧之灵换目标全场都知道、精神病患者白天当街杀人、哥布林被提名时自曝，所以是一个人人关门闭户、只有坏人敢在街上走的雨夜。
// 色调用暗流涌动的自然色、压暗一点（2026-11-18 用户：别弄诡异的色调），和雪夜的暗流涌动、烤派的洋葱派靠雨和没有积雪分开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'oe',
  art: 'tb',
  place: '钟楼镇 · 恶人横行的雨夜',
  weather: 'drizzle',
  roofSnow: 0,
  fog: { color: 0xa9b0b8, ground: 0.2, haze: 0.24, mist: 0.07 },
  tone: { map: { brightness: 0.86 }, houses: { brightness: 0.86 } },
};
