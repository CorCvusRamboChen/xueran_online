// 百无禁忌（No Roles Barred）：恶魔可能是小怪宝、军团或涡流，什么都可能发生。借黯月初升的驿站，
// 换成落叶纷飞的秋夜，色调是原图的自然色、压暗一点。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'nrb',
  art: 'bmr',
  place: '黯月驿站 · 无所顾忌的秋夜',
  weather: 'leaves',
  roofSnow: 0,
  fog: { ...BMR.fog, ground: 0.34, haze: 0.28 },
  tone: { ...BMR.tone, map: { ...BMR.tone.map, brightness: 0.82 }, houses: { ...BMR.tone.houses, brightness: 0.84 } },
};
