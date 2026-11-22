// 谁都别动（Nobody Fucking Move）：戏法师一句话就能定胜负，炸弹人、精神病患者随时让人当场死——谁都不敢乱动。
// 借暗流涌动的钟楼广场，换成下着雪、四下无声的夜：屋顶积着雪，雾很淡。
import TB from './tb.js';

export default {
  ...TB,
  id: 'nfm',
  art: 'tb',
  place: '钟楼镇 · 屏住呼吸的雪夜',
  weather: 'snow',
  roofSnow: 0.8,
  fog: { color: 0xc9d2dc, ground: 0.16, haze: 0.2, mist: 0.05 },
  tone: { map: { brightness: 0.92 }, houses: { brightness: 0.92 } },
};
