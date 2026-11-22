// 话多成灾（Chatastrophe）：牙噶巴卜每说一次暗号就可能死一个人，大家越聊越危险。借梦殒春宵的紫罗兰花园，
// 换成茶会散场后的傍晚：花瓣还在飘，雾是暖一点的灰。
import SNV from './snv.js';

export default {
  ...SNV,
  id: 'chat',
  place: '鸦木布拉夫 · 茶会散场后',
  weather: 'petals',
  fog: { ...SNV.fog, color: 0xd8cfc6, ground: 0.18, haze: 0.2, mist: 0.05 },
};
