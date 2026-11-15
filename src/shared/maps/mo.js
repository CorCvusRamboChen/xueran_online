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
  fog: { ...BMR.fog, color: 0xa88ad8, ground: 0.2, haze: 0.24, mist: 0.05 },
  tone: { ...BMR.tone, map: { brightness: 0.92, contrast: 1.08, saturate: 1.2, sepia: 0.1, hue: 40 }, houses: { brightness: 0.96, contrast: 1.06, saturate: 1.15, sepia: 0.08, hue: 32 } },
};
