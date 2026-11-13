// 哈罗德的复仇（Harold Holt's Revenge）：借暗流涌动的钟楼广场（同一套手绘图），换成涨潮的海港雨夜。
// 剧本名来自一位在海边下水后再没回来的人；恶魔是不杀人、在水底等五天的利维坦——所以是一座被海雾和潮水包围的港口。
// 深蓝的海雾比冒名钓鱼的青灰更冷更重，屋顶积雪少：一眼看得出是海边的雨夜。
import TB from './tb.js';

export default {
  ...TB,
  id: 'hhr',
  art: 'tb',
  place: '钟楼镇 · 涨潮的海港',
  weather: 'drizzle',
  roofSnow: 0.2,
  fog: { color: 0x7d93ad, ground: 0.42, haze: 0.38, mist: 0.14 },
  tone: { map: { brightness: 0.82, contrast: 1.08, saturate: 0.8, hue: 22 }, houses: { brightness: 0.85, contrast: 1.05, saturate: 0.82, hue: 18 } },
};
