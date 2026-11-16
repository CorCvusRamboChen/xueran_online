// 网页单机试玩（打开 /play）：不用 Discord，每个访客一张自己的私桌，和机器人打完整一局。
// · 身份：浏览器第一次打开时生成一把随机钥匙存在本机（localStorage），服务器只认钥匙的哈希当 id（solo-xxxx）。
//   桌子按这个 id 开（solo:<id>），别人没有钥匙就进不来；换浏览器 / 清了数据就是新的一张桌子。
// · 和真实服务器分开：不接语音、不收音、不听语音判疯狂；打完不存档、不算战绩、不发金币，也没有钱包（不能扔烂番茄）。
// · 排行榜：大厅里看到的是全服排行榜（所有服务器合计，store.js statsAll），往期对局是空的。
// · 同时开着的私桌有上限（SOLO_MAX_TABLES，默认 40）：满了先清掉没人在的，还满就请稍后再来。
import { createHash } from 'node:crypto';
import { UserError } from './room.js';

export const SOLO_GUILD = 'solo';
export const SOLO_BOTS = 6; // 一进来先坐好 6 个机器人：7 人局，马上能开
export const soloMax = () => Number(process.env.SOLO_MAX_TABLES ?? 40);

/** 单机试玩开没开：默认开，SOLO_PLAY=0 关掉。 */
export const soloEnabled = () => process.env.SOLO_PLAY !== '0';

/** 钥匙 → 身份。钥匙不对就抛 UserError（客户端会重新生成一把）。 */
export function soloIdentity(raw) {
  const key = String(raw?.key ?? '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new UserError('单机试玩的钥匙不对，刷新一下页面');
  const id = `solo-${createHash('sha256').update(`botc-solo|${key}`).digest('hex').slice(0, 16)}`;
  const name = String(raw?.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || '旅人';
  return { user: { id, name, avatar: null }, guildId: SOLO_GUILD, channelId: id };
}

/**
 * 把一个刚建好的房间设成单机私桌。stats：全服排行榜（store.js statsAll）。
 * 不给 voice / micFor / hearingFor / wallet / onEnded / onMarkEnded / peers：没有语音、不存档、不发金币。
 */
export function setupSoloRoom(room, { stats }) {
  room.solo = true;
  room.wallet = null;
  room.onEnded = null;
  room.onMarkEnded = null;
  room.idlePauseMs = 60_000; // 关掉页面一分钟就暂停（反正只有你一个人）
  room.history = {
    list: () => [],
    get: () => null,
    stats: () => stats(),
    statsAll: () => stats(),
    markStats: () => [],
  };
  return room;
}

/** 第一次进来（大厅空着）：你坐下，再坐 6 个机器人。之后进来不动座位。 */
export function seatSolo(room, uid) {
  if (room.game || room.lobby.length) return;
  room.join(uid);
  room.addFakes(SOLO_BOTS);
}

/**
 * 要开一张新私桌前看看满没满：满了先清掉没人在线的私桌（返回要清的），还满就抛错。
 * rooms：所有房间（Map key → Room）。
 */
export function soloEvictions(rooms, key) {
  if (rooms.has(key)) return [];
  const solo = [...rooms.values()].filter((r) => r.solo);
  if (solo.length < soloMax()) return [];
  const idle = solo.filter((r) => r.online.size === 0);
  const drop = idle.slice(0, solo.length - soloMax() + 1);
  if (solo.length - drop.length >= soloMax()) throw new UserError('单机试玩的桌子都满了，过几分钟再来');
  return drop;
}
