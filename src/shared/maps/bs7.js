// 七步成诗：借黯月初升的驿站（同一套手绘图、同样的房子、石桥和吊板桥），换成月下的诗会。
// 剧本名来自「七号座位」——一张没人坐的椅子。色调从深秋的暖橙转成月光的冷蓝紫，落叶照下，薄薄一层银雾；
// 和黯月初升（暖橙黄昏）、窃窃私语（灰绿细雨）一眼分得开。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'bs7',
  art: 'bmr', // 用黯月初升的手绘图（assets/world-bmr/）
  place: '黯月驿站 · 七步诗会',
  weather: 'leaves',
  // 银蓝的月光薄雾：比黯月初升淡，远处还看得清
  fog: { ...BMR.fog, color: 0xb9c0d8, ground: 0.26, haze: 0.26, mist: 0.06, groundMul: 0.8, topMul: 0.7 },
  // 暖橙往蓝紫里推，压一点亮度和饱和度：像月亮底下
  tone: { ...BMR.tone, map: { brightness: 0.86, contrast: 1.08, saturate: 0.82, hue: -24 }, houses: { brightness: 0.88, contrast: 1.05, saturate: 0.86, hue: -18 } },
};
