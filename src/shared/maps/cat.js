// 冒名钓鱼（Catfishing）：借暗流涌动的钟楼广场（同一套手绘图、同样的房子和路），换成雪化成冷雨的港口雾夜。
// 剧本讲的是「顶着别人的身份」：舞蛇人、哲学家、麻脸巫婆、疯子……谁都可能不是他说的那个人。
// 浓雾、细雨、青灰的冷色，和暗流涌动的暴雪夜、无上愉悦的暖色集市、诸神黄昏都分得开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'cat',
  art: 'tb', // 用暗流涌动的手绘图（assets/world/）
  place: '钟楼镇 · 雾夜港口',
  weather: 'drizzle',
  roofSnow: 0.25,
  // 港口的海雾：青灰、比暴雪夜厚
  fog: { color: 0x9fb3b8, ground: 0.4, haze: 0.36, mist: 0.12 },
  // 雪夜的冷蓝往青绿里推一点，压暗：像没有月亮的雨夜
  tone: { map: { brightness: 0.88, contrast: 1.06, saturate: 0.85, hue: 12 }, houses: { brightness: 0.9, contrast: 1.04, saturate: 0.88, hue: 10 } },
};
