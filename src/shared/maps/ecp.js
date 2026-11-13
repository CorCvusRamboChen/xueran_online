// 人人可玩（Everyone Can Play）：借暗流涌动的钟楼广场（同一套手绘图、同样的房子和路），换成雪化以后的早春夜晚。
// 剧本的意思是新手老手都能玩：大部分是暗流涌动的老面孔，画面也用熟悉的钟楼镇，只是颜色明亮、温和一点。
// 花瓣在风里飘，淡粉的薄雾：和暗流涌动的暴雪夜、生死未卜的守灵夜、无上愉悦的灯火集市分得开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'ecp',
  art: 'tb', // 用暗流涌动的手绘图（assets/world/）
  place: '钟楼镇 · 早春夜',
  weather: 'petals',
  roofSnow: 0.2,
  // 淡粉的薄雾，远处看得清
  fog: { color: 0xd9c2cf, ground: 0.12, haze: 0.16, mist: 0.03 },
  // 雪夜的冷蓝往暖里推一点、提亮：像月亮很亮的春夜
  tone: { map: { brightness: 1.04, contrast: 1.02, saturate: 1.08, hue: -18 }, houses: { brightness: 1.05, contrast: 1.02, saturate: 1.06, hue: -14 } },
};
