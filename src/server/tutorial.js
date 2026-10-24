// 新手教程：一局只有你和 6 个机器人的练习局，身份固定，保证每个环节都能演示到。
//   座位：1 你（共情者）· 2 老格（小恶魔）· 3 玛蒂娜（洗衣妇）· 4 卡拉（厨师）· 5 卢卡（投毒者）· 6 伊万（僧侣）· 7 汉娜（士兵）
//   你两侧是 2 号和 7 号，共情者第一晚会得知"有 1 个邪恶"；7 号是士兵，所以邪恶的是 2 号——提名他、投票处决，善良获胜。
// 机器人按剧本行动：投毒者毒厨师，小恶魔不刀你；白天不主动提名，投票时好人只给邪恶投票。
// 教程房间不存档，退出或断线后就删掉。界面上的分步提示在客户端（Tutorial.jsx）。
import { Room } from './room.js';

export const TUTORIAL_ROLES = ['empath', 'imp', 'washerwoman', 'chef', 'poisoner', 'monk', 'soldier'];
const BOT_NAMES = ['老格', '玛蒂娜', '卡拉', '卢卡', '伊万', '汉娜'];

export const TUTORIAL_SETTINGS = {
  mode: 'auto', shuffle: false, nightDeafen: false,
  chooseSeconds: 60, roamMinutes: 0, nominateMinutes: 10,
  accuseSeconds: 90, defendSeconds: 20, voteSeconds: 2, voteCountdown: 6, pauseMs: 3500,
};

/** 建一个教程房间并开局。 */
export async function startTutorial(user, onChange) {
  const room = new Room({ key: `tutorial:${user.id}`, guildId: 'tutorial', hostId: user.id, voice: null, onChange, settings: TUTORIAL_SETTINGS });
  room.tutorial = { roles: TUTORIAL_ROLES };
  room.users.set(user.id, user);
  room.online.add(user.id);
  room.join(user.id);
  room.addFakes(BOT_NAMES.length);
  room.lobby.slice(1).forEach((p, i) => { p.name = BOT_NAMES[i]; });
  await room.start();
  return room;
}
