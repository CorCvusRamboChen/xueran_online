// 瞒天过海（Boozling）：借黯月初升的驿站——它的中心本来就是一家旅店。剧本名带着酒气（booze），
// 所以是一个灯火通明、喝得醉醺醺的夜：琥珀色的暖光、带酒气的暖雾、几片落叶，和黯月初升的黄昏橙、大诚小镇的灰金分得开。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'booz',
  art: 'bmr',
  place: '黯月驿站 · 醉醺醺的旅店',
  weather: 'leaves',
  fog: { ...BMR.fog, color: 0xe0b878, ground: 0.24, haze: 0.26, mist: 0.06 },
  tone: { ...BMR.tone, map: { brightness: 1.0, contrast: 1.06, saturate: 1.15, sepia: 0.25, hue: -12 }, houses: { brightness: 1.03, contrast: 1.05, saturate: 1.15, sepia: 0.2, hue: -10 } },
};
