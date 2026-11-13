// 暗流紫罗兰（Trouble with Violets）：暗流涌动的好人，梦殒春宵的坏人。借梦殒春宵的紫罗兰花园，
// 下起暗流涌动的雪：雪落在初夏的花园里，谁都不该在这里。
import SNV from './snv.js';

export default {
  ...SNV,
  id: 'twv',
  place: '鸦木布拉夫 · 紫罗兰下的雪',
  weather: 'snow',
  fog: { ...SNV.fog, color: 0xd0cde0, ground: 0.2, haze: 0.22, mist: 0.06 },
};
