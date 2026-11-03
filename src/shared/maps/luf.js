// 窃窃私语：借黯月初升的驿站（同一套手绘图、同样的房子、石桥和吊板桥），换成雾锁溪谷的夜。
// 利维坦不杀人，只是在水底等五天：雾比黯月初升浓、下着细雨；色调从深秋的暖橙转成河谷、柳树和葡萄园的灰绿（角色背景故事里的河边小镇）。
import BMR from './bmr.js';

export default {
  ...BMR,
  id: 'luf',
  art: 'bmr', // 用黯月初升的手绘图（assets/world-bmr/）
  place: '黯月驿站 · 雾锁溪谷',
  weather: 'drizzle',
  // 灰绿的河雾：比黯月初升厚一点
  fog: { ...BMR.fog, color: 0xb3c4b0, ground: 0.44, haze: 0.38, mist: 0.12, groundMul: 1.05, topMul: 0.85 },
  // 暖橙往绿里推一点，饱和度只降一点（不要整张发灰）
  tone: { ...BMR.tone, map: { brightness: 0.9, contrast: 1.06, saturate: 0.9, hue: 16 }, houses: { brightness: 0.88, contrast: 1.04, saturate: 0.92, hue: 12 } },
};
