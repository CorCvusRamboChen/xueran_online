// 夜半狂欢（The Midnight Oasis）：借黯月初升的驿站，换成午夜的游乐场——旋转木马的剧本，天上放烟花、紫色的灯雾。
// 和醉醺醺的旅店（琥珀暖光）、守信的晚钟（灰金）分得开：一眼是冷紫色的狂欢夜。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'mo',
  art: 'bmr',
  place: '黯月驿站 · 午夜的旋转木马',
  weather: 'festival',
  roofSnow: 0,
  // 2026-11-18 用户：太绿了。黯月初升的底图是深秋的橙色，原来色相转 +40 度把橙色转成了黄绿；改成往品红那边转、压暗、降饱和，再加浓一点的紫雾
  fog: { ...BMR.fog, color: 0x8a6ad8, ground: 0.26, haze: 0.3, mist: 0.06 },
  tone: { ...BMR.tone, map: { brightness: 0.8, contrast: 1.1, saturate: 0.8, sepia: 0, hue: -40 }, houses: { brightness: 0.86, contrast: 1.08, saturate: 0.9, sepia: 0, hue: -34 } },
};
