// 疑心痢蛭（A Lleech of Distrust）：痢蛭寄生在一个人身上，谁都可能是宿主。借暗流涌动的钟楼广场，
// 换成阴沉的细雨天：不下雪、雾压得低，人人对着邻居起疑。色调是原图的自然色、压暗一点。
import TB from './tb.js';

export default {
  ...TB,
  id: 'lod',
  art: 'tb',
  place: '钟楼镇 · 阴雨里的疑心',
  weather: 'drizzle',
  roofSnow: 0,
  fog: { color: 0xb2b8b0, ground: 0.24, haze: 0.26, mist: 0.08 },
  tone: { map: { brightness: 0.88 }, houses: { brightness: 0.88 } },
};
