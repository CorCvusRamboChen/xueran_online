// 心理博弈（Rochambeau）：借黯月初升的驿站（同一套手绘图、石桥和吊板桥），换成一个起了风的赌局之夜。
// 剧本讲「赌」：赌徒猜角色、杂技演员赌谁没中毒、半兽人赌谁是好人、造谣者赌自己的话。偏冷的青灰、风卷落叶、夜色压低；
// 和黯月初升的暖橙黄昏、大诚小镇的灰金晚钟、夜半狂欢的萤火虫夜分得开。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'roc',
  art: 'bmr',
  place: '黯月驿站 · 起风的赌局',
  weather: 'leaves',
  fog: { ...BMR.fog, color: 0x9aa6ad, ground: 0.24, haze: 0.22, mist: 0.06 },
  tone: { ...BMR.tone, map: { brightness: 0.84, contrast: 1.08, saturate: 0.72, sepia: 0.05, hue: -8 }, houses: { brightness: 0.86, contrast: 1.06, saturate: 0.78, sepia: 0.05, hue: -6 } },
};
