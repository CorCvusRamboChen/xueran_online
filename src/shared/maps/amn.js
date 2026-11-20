// 全员失忆：借暗流涌动的钟楼广场，换成一场浓雾的夜——谁都看不清自己是谁。雾最浓、颜色偏冷白，没有雪；
// 和暴雪夜的暗流涌动、雾夜港口的瓦釜雷鸣、雨夜的横行霸道分得开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'amn',
  art: 'tb',
  place: '钟楼镇 · 浓雾里的失忆夜',
  weather: 'drizzle',
  roofSnow: 0,
  fog: { color: 0xc4c9cc, ground: 0.34, haze: 0.34, mist: 0.12 },
  tone: { map: { brightness: 0.9, saturate: 0.7 }, houses: { brightness: 0.9, saturate: 0.72 } },
};
