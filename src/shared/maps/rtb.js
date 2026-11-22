// 逐底竞赛（Race to the Bottom）：涡流在场时所有信息都是错的，大家比着往下掉。借黯月初升的驿站，
// 换成入冬前最后一场雨的黄昏：细雨、冷一点的雾，色调保持原图的自然色。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'rtb',
  art: 'bmr',
  place: '黯月驿站 · 入冬前的冷雨',
  weather: 'drizzle',
  roofSnow: 0,
  fog: { ...BMR.fog, color: 0xa6aeb6, ground: 0.4, haze: 0.32 },
  tone: { ...BMR.tone, map: { ...BMR.tone.map, brightness: 0.84 }, houses: { ...BMR.tone.houses, brightness: 0.86 } },
};
