// 米诺陶迷宫（The Minotaur's Labyrinth）：两位说书人一真一假，信息像迷宫一样绕。借梦殒春宵的花园，
// 换成起雾的细雨夜：雾浓一点，远处看不清。
import SNV from './snv.js';

export default {
  ...SNV,
  id: 'mino',
  place: '鸦木布拉夫 · 迷宫一样的雾夜',
  weather: 'drizzle',
  fog: { ...SNV.fog, color: 0xb6b2c4, ground: 0.3, haze: 0.3, mist: 0.1 },
};
