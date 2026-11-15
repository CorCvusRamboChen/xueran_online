// 裁缝与暴乱：借暗流涌动的钟楼广场（同一套手绘图），换成暴乱的第三夜——街上的火堆、飘着的火星和灰，
// 烟熏成橘红色的雾。剧本最多打三天，镇子从第一天起就在吵：颜色要一眼看出来「这里出事了」，和其他钟楼镇的变体分得开。
import TB from './tb.js';

export default {
  ...TB,
  id: 'sar',
  art: 'tb',
  place: '钟楼镇 · 暴乱的三天',
  weather: 'embers',
  roofSnow: 0.1,
  fog: { color: 0xc0703f, ground: 0.3, haze: 0.3, mist: 0.08 },
  tone: { map: { brightness: 0.9, contrast: 1.12, saturate: 1.15, sepia: 0.3, hue: -22 }, houses: { brightness: 0.95, contrast: 1.08, saturate: 1.12, sepia: 0.25, hue: -18 } },
};
