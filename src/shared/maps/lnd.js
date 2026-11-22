// 深夜飞车（Late Night Drive By）：两个恶魔、一个精神病患者，深夜的街上随时有人出事。借暗流涌动的钟楼广场，
// 换成没有雪、没有雨的深夜：整体压暗，只剩窗户和路灯的光。
import TB from './tb.js';

export default {
  ...TB,
  id: 'lnd',
  art: 'tb',
  place: '钟楼镇 · 深夜的街头',
  weather: 'clear',
  roofSnow: 0,
  fog: { color: 0x5e6878, ground: 0.12, haze: 0.18, mist: 0.04 },
  tone: { map: { brightness: 0.62 }, houses: { brightness: 0.66 } },
};
