// 生死未卜（Uncertain Death）：借暗流涌动的钟楼广场（同一套手绘图、同样的房子和路），换成守灵夜的深秋。
// 剧本讲的是「谁会死、怎么死都说不准」：刺客、教父、普卡的毒、诺-达鲺、月之子……死得不明不白。
// 枯叶落在雪地上，灰褐的冷雾，压暗压灰：和暗流涌动的暴雪夜、冒名钓鱼的青灰雨夜、无上愉悦的暖色集市分得开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'ucd',
  art: 'tb', // 用暗流涌动的手绘图（assets/world/）
  place: '钟楼镇 · 守灵夜',
  weather: 'leaves',
  roofSnow: 0.15,
  // 灰褐的冷雾：像烧纸的烟
  fog: { color: 0x9a8f80, ground: 0.32, haze: 0.3, mist: 0.1 },
  // 去掉大半饱和度、往褐色里推：老照片一样的守灵夜
  tone: { map: { brightness: 0.84, contrast: 1.1, saturate: 0.55, sepia: 0.3, hue: -6 }, houses: { brightness: 0.86, contrast: 1.08, saturate: 0.6, sepia: 0.25, hue: -4 } },
};
