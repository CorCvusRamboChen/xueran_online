// 把钟楼的房间推到 SquadPool 组队大厅（方向：钟楼服务器 → 网站卡片）。
// 旺财把人拉进专区广场后，广场不是它管的房间，网站上就没有卡；所以由我们自己报：
//   POST /api/discord-sync/rooms           建卡（广场语音频道 id 当房间 id）
//   POST /api/discord-sync/rooms/:id/members  谁在桌上
//   POST /api/discord-sync/rooms/:id/state    第几夜 / 第几天 / 存活人数
//   POST /api/discord-sync/rooms/:id/close    收卡
// 只报公开信息：身份、谁死了都不出服务器，存活数按 visAlive 算（僵怖装死不露馅）。
// 定时比对、有变化才发，外加 30 分钟一次心跳：网站连不上时下一轮自然重试，服务器重启后建卡的 409 也当成功。
import { SCRIPTS } from '../engine/roles.js';

const TICK_MS = 8_000;
const CLOSE_AFTER_MS = 60_000; // 断线重连别把卡收了：连续没人一分钟才收
const HEARTBEAT_MS = 30 * 60_000; // 网站 12 小时没收到同步会收卡，内容没变也要定时报一声
const CDN = 'https://cdn.discordapp.com/';
const isDiscordId = (id) => /^\d{5,25}$/.test(String(id ?? ''));

/** 客户端用的头像走 Discord 的代理路径（/cdn/...），网站要完整地址。 */
function avatarUrl(avatar) {
  if (!avatar) return '';
  if (avatar.startsWith('/cdn/')) return CDN + avatar.slice('/cdn/'.length);
  return avatar.startsWith('https://') ? avatar : '';
}

function roomPhase(room) {
  const g = room.game;
  const script = SCRIPTS[g?.script ?? room.settings.script ?? 'tb']?.name ?? '';
  if (!g) return { phase: 'lobby', round: 0, seats: room.lobby.length, alive: 0, script };
  const alive = g.players.filter((p) => g.visAlive(p)).length;
  const round = g.phase === 'night' ? g.night : g.day;
  return { phase: room.ended ? 'ended' : g.phase, round, seats: g.players.length, alive, script };
}

function roomMembers(room) {
  const seated = room.game ? room.game.players : room.lobby;
  const ids = seated.length ? seated.map((p) => p.id) : [...room.online];
  return ids.filter(isDiscordId).slice(0, 50).map((id) => {
    const u = room.users.get(id) ?? seated.find((p) => p.id === id);
    return { discordUserId: id, name: u?.name ?? '玩家', avatar: avatarUrl(u?.avatar) };
  });
}

/** 这一桌该不该有卡、卡上是什么；不该有就返回 null。 */
export function tableCard(room) {
  const channelId = room.square ?? room.gameSquare ?? room.partnerSquare;
  // 真人全走了的局会暂停并留在存档里，重启后读回来也还是暂停：这种不算进行中，否则全是幽灵卡
  const live = !!room.game && !room.ended && !room.paused;
  if (room.tutorial || !channelId || (!live && room.online.size === 0)) return null;
  const members = roomMembers(room);
  const host = members.find((m) => m.discordUserId === room.hostId) ?? members[0];
  if (!host) return null;
  return { channelId, guildId: room.guildId, host, members, state: roomPhase(room) };
}

/**
 * 专区语音里有人、但这一桌还没人打开活动时的卡：只有谁在语音，阶段算等人入座。
 * voice：channels() 列出旺财推来过的专区频道（[channelId, guildId]），members(guildId, channelId) 问里面有谁，
 * profile(id) 查名字头像，forget(channelId) 忘掉空了的频道。
 */
async function voiceCard(voice, channelId, guildId) {
  const ids = (await voice.members(guildId, channelId)).filter(isDiscordId).slice(0, 50);
  const people = await Promise.all(ids.map(async (id) => ({ discordUserId: id, ...(await voice.profile(id)) })));
  const members = people.filter((p) => !p.bot).map(({ discordUserId, name, avatar }) => ({ discordUserId, name, avatar }));
  if (!members.length) return null;
  return { channelId, guildId, host: members[0], members, state: { phase: 'lobby', round: 0, seats: members.length, alive: 0, script: '' } };
}

export function squadpoolSync({ baseUrl, token, rooms, guildIds, guildName = '', voice = null, fetch: f = globalThis.fetch, log = console, now = Date.now }) {
  const base = baseUrl.replace(/\/$/, '');
  const cards = new Map(); // channelId → { members, state, seenAt }：网站上现有的卡，存上次发过的内容

  async function post(pathname, body) {
    const r = await f(`${base}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(8000),
    });
    return r.status;
  }

  async function push(card) {
    const id = encodeURIComponent(card.channelId);
    let sent = cards.get(card.channelId);
    if (!sent) {
      const status = await post('/api/discord-sync/rooms', {
        channelId: card.channelId, game: '血染钟楼', guildId: card.guildId, guildName,
        emoji: '🕰️', creator: { discordUserId: card.host.discordUserId, name: card.host.name, avatar: card.host.avatar },
      });
      if (status !== 200 && status !== 409) throw new Error(`建卡返回 ${status}`);
      log.info?.(`[squadpool] 上卡 ${card.channelId} → ${status}`);
      sent = {};
      cards.set(card.channelId, sent);
    }
    sent.seenAt = now();
    const members = JSON.stringify(card.members);
    if (members !== sent.members || now() - (sent.beatAt ?? 0) >= HEARTBEAT_MS) {
      const status = await post(`/api/discord-sync/rooms/${id}/members`, { members: card.members });
      if (status === 404) { // 卡在网站上没了：下一轮重新建
        cards.delete(card.channelId);
        return;
      }
      if (status === 200) {
        sent.members = members;
        sent.beatAt = now();
      }
    }
    const state = JSON.stringify(card.state);
    if (state !== sent.state) {
      const status = await post(`/api/discord-sync/rooms/${id}/state`, card.state);
      if (status === 200) sent.state = state;
    }
  }

  // 活动已经在报的频道跳过；白天的房子、私聊房也是专区频道，但不是一桌，也跳过
  // （managedChannels 含房子：只看 room.rooms 漏了房子，上线头一晚每有人进房子就冒一张卡）
  async function pushVoiceCards(wanted) {
    const privateRooms = new Set();
    for (const room of rooms.values()) {
      const squares = new Set([room.square, room.gameSquare, room.partnerSquare]);
      for (const id of room.managedChannels?.() ?? room.rooms?.keys?.() ?? []) if (!squares.has(id)) privateRooms.add(id);
    }
    for (const [channelId, guildId] of voice.channels()) {
      if (wanted.has(channelId) || privateRooms.has(channelId) || !guildIds.has(guildId)) continue;
      try {
        const card = await voiceCard(voice, channelId, guildId);
        if (!card) {
          voice.forget(channelId);
          continue;
        }
        wanted.add(channelId);
        await push(card);
      } catch (e) {
        if (cards.has(channelId)) wanted.add(channelId); // 问不到不等于没人：别把卡收了，下一轮再问
        log.warn?.(`[squadpool] 专区语音 ${channelId} 失败：${e.message}`);
      }
    }
  }

  async function tick() {
    const wanted = new Set();
    for (const room of rooms.values()) {
      if (!guildIds.has(room.guildId)) continue;
      const card = tableCard(room);
      if (!card) continue;
      wanted.add(card.channelId);
      await push(card).catch((e) => log.warn?.(`[squadpool] 同步 ${card.channelId} 失败：${e.message}`));
    }
    if (voice) await pushVoiceCards(wanted);
    for (const [channelId, sent] of cards) {
      if (wanted.has(channelId) || now() - sent.seenAt < CLOSE_AFTER_MS) continue;
      const status = await post(`/api/discord-sync/rooms/${encodeURIComponent(channelId)}/close`).catch(() => 0);
      if (status === 200 || status === 404) cards.delete(channelId);
    }
  }

  return {
    tick,
    start() {
      const timer = setInterval(() => tick().catch((e) => log.warn?.(`[squadpool] ${e.message}`)), TICK_MS);
      timer.unref?.();
      return timer;
    },
  };
}
