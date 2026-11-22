// 去外婆家（Over the River）：「过了河、穿过林子，去外婆家」——小红帽的路。借黯月初升的驿站（林子、溪谷、石桥），
// 换成去外婆家路上的秋日黄昏：落叶多一点、雾淡一点，色调是原图的自然色稍微压暗（用户 11-18：要正常色调）。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'otr',
  art: 'bmr',
  place: '黯月驿站 · 去外婆家的林间小路',
  weather: 'leaves',
  roofSnow: 0,
  fog: { ...BMR.fog, ground: 0.3, haze: 0.26 },
  tone: { ...BMR.tone, map: { ...BMR.tone.map, brightness: 0.9 }, houses: { ...BMR.tone.houses, brightness: 0.9 } },
};
