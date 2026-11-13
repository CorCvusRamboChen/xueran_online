// 大诚小镇（Trust）：借黯月初升的驿站（同一套手绘图、石桥和吊板桥），换成晚钟响起的守信之夜。
// 剧本讲「信谁」：政客、灵言师、提线木偶都让人不敢信。灰金色、干净的夜，没有雨雾，落叶很少——安静得让人起疑；
// 和黯月初升的暖橙黄昏、窃窃私语的灰绿细雨、七步成诗的月光蓝紫分得开。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'trust',
  art: 'bmr',
  place: '黯月驿站 · 守信的晚钟',
  weather: 'leaves',
  fog: { ...BMR.fog, color: 0xc8bfa4, ground: 0.2, haze: 0.2, mist: 0.04 },
  tone: { ...BMR.tone, map: { brightness: 0.95, contrast: 1.05, saturate: 0.7, sepia: 0.2, hue: 6 }, houses: { brightness: 0.96, contrast: 1.04, saturate: 0.75, sepia: 0.15, hue: 4 } },
};
