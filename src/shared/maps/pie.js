// 洋葱派（Onion Pies）：借暗流涌动的钟楼广场，换成家家烤派的冬夜。底子就是暗流涌动，只多了几个新角色，所以雪照下，
// 但色调往烤炉的暖褐里推、雾带一点烟火的黄：比暴雪夜暖，比无上愉悦的集市安静（没有烟花和灯笼）。
import TB from './tb.js';

export default {
  ...TB,
  id: 'pie',
  art: 'tb',
  place: '钟楼镇 · 烤派的冬夜',
  weather: 'snow',
  roofSnow: 0.7,
  fog: { color: 0xd6bf9c, ground: 0.18, haze: 0.22, mist: 0.05 },
  tone: { map: { brightness: 1.0, sepia: 0.3, saturate: 1.1, hue: -8 }, houses: { brightness: 1.02, sepia: 0.25, saturate: 1.1, hue: -6 } },
};
