// 夜半狂欢（The Midnight Oasis）：借黯月初升的驿站，换成午夜的游乐场——旋转木马的剧本，天上放烟花。
// 色调就是黯月初升的原色、压暗一点（11-18 用户：要正常色调），和别的变体靠天上的烟花分开。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'mo',
  art: 'bmr',
  place: '黯月驿站 · 午夜的旋转木马',
  weather: 'festival',
  roofSnow: 0,
  // 2026-11-18 用户：先是太绿（色相 +40 把橙色转成黄绿），改品红后又太诡异 → 用黯月初升原图的自然色调，只压暗一点表示午夜；
  // 雾用中性的冷灰，游乐场的感觉交给天上的烟花（weather: festival）
  fog: { ...BMR.fog, color: 0xb4b8c4 },
  tone: { ...BMR.tone, map: { ...BMR.tone.map, brightness: 0.78 }, houses: { ...BMR.tone.houses, brightness: 0.76 } },
};
