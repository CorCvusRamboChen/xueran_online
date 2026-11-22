// 抢椅子（Musical Chairs）：人人都可能换角色。借黯月初升的驿站，换成一场换座位的晚会：暖一点的灯光、落叶，色调是原图的自然色。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'mc',
  art: 'bmr',
  place: '黯月驿站 · 换座位的晚会',
  weather: 'leaves',
  roofSnow: 0,
  fog: { ...BMR.fog, ground: 0.26, haze: 0.22 },
  tone: { ...BMR.tone, map: { ...BMR.tone.map, brightness: 0.92 }, houses: { ...BMR.tone.houses, brightness: 0.94 } },
};
