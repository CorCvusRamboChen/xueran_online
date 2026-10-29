// 血染钟楼（botc）语音代管模块 —— 给"旺财"这类已经在服务器里管语音的 Discord 机器人用（discord.js v14）。
// 整份复制到你的机器人项目里（比如 src/botc-voice.js），按 docs/WANGCAI_BOTC_HANDOVER.md 接三行就能用。
//
// 它做两件事：
//   1. 收血染钟楼服务器发来的语音操作：POST /botc/voice，body { op, ... }，Authorization: Bearer <共享密钥>
//      op：ping / state / edit / createRoom / allow / disallow / channel / deleteChannel
//   2. 你的服务器里有人进出语音、被闭麦闭耳时，把这个人的语音状态推给血染钟楼（同一个密钥）
//
// 安全边界（都在这个文件里卡死，血染钟楼那边就算出 bug 也越不过去）：
//   · 只认 guildIds 里的服务器；
//   · 拉人只能拉到这个服务器的语音频道里；
//   · 改权限、删频道只对"自己用 createRoom 建出来的私聊房间"生效，别的频道一律不碰；
//   · 密钥比对用定长比较，请求体限 20 KB。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';

const MEMBER_ALLOW = [P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.ReadMessageHistory];
const BOT_ALLOW = [P.ViewChannel, P.Connect, P.MoveMembers, P.ManageChannels, P.SendMessages];

class OpError extends Error {}

/**
 * client：你的 discord.js Client（要有 Guilds、GuildVoiceStates 两个 intent）
 * secret：和血染钟楼约定的共享密钥（双方配同一个值）
 * guildIds：允许血染钟楼操作的服务器 id 数组
 * pushUrl：血染钟楼收语音状态的地址，比如 https://botc.rambooo.com/api/partner/voice
 * roomsFile：记下自己建过的私聊房间（重启后还认得、还能删）
 */
export function createBotcVoice({ client, secret, guildIds, pushUrl, roomsFile = 'data/botc-rooms.json', log = console, fetch: f = globalThis.fetch }) {
  if (!secret) throw new Error('botc-voice：没配共享密钥');
  const allowed = new Set((guildIds ?? []).map(String));
  const file = path.resolve(roomsFile);
  let rooms = new Set();
  try { rooms = new Set(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* 第一次用 */ }
  const saveRooms = () => {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify([...rooms])); } catch (e) { log.warn?.('[botc-voice] 存房间表失败：', e.message); }
  };

  const guild = (id) => {
    if (!allowed.has(String(id))) throw new OpError('guild_not_allowed');
    const g = client.guilds.cache.get(String(id));
    if (!g) throw new OpError('guild_not_found');
    return g;
  };
  const channelOf = async (g, id) => g.channels.cache.get(String(id)) ?? await g.channels.fetch(String(id)).catch(() => null);
  const ourRoom = async (g, id) => {
    if (!rooms.has(String(id))) throw new OpError('not_botc_room'); // 只动自己建的私聊房间
    return channelOf(g, id);
  };

  const ops = {
    ping: async () => ({ botId: client.user?.id ?? null }),

    /** { guildId, userIds } → { states: { userId: { channelId, serverMute, serverDeaf } } } */
    state: async ({ guildId, userIds }) => {
      const g = guild(guildId);
      const states = {};
      for (const id of (userIds ?? []).slice(0, 50).map(String)) {
        const vs = g.voiceStates.cache.get(id);
        states[id] = { channelId: vs?.channelId ?? null, serverMute: !!vs?.serverMute, serverDeaf: !!vs?.serverDeaf };
      }
      return { states };
    },

    /** { guildId, userId, mute?, deaf?, channelId? }：服务器闭麦 / 闭耳 / 拉到某个语音频道。人得在语音里。 */
    edit: async ({ guildId, userId, mute, deaf, channelId }) => {
      const g = guild(guildId);
      const patch = {};
      if (typeof mute === 'boolean') patch.mute = mute;
      if (typeof deaf === 'boolean') patch.deaf = deaf;
      if (channelId) {
        const ch = await channelOf(g, channelId);
        if (!ch?.isVoiceBased?.()) throw new OpError('not_a_voice_channel');
        patch.channel = ch.id;
      }
      if (!Object.keys(patch).length) return {};
      await g.members.edit(String(userId), patch);
      return {};
    },

    /** { guildId, name, memberIds, squareChannelId } → { channelId }：建一个只有这几个人看得到的私聊语音房间（和广场同一个分组）。 */
    createRoom: async ({ guildId, name, memberIds, squareChannelId }) => {
      const g = guild(guildId);
      const square = squareChannelId ? await channelOf(g, squareChannelId) : null;
      const ch = await g.channels.create({
        name: String(name || '私聊').slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: square?.parentId ?? null,
        permissionOverwrites: [
          { id: g.roles.everyone.id, deny: [P.ViewChannel] },
          { id: client.user.id, allow: BOT_ALLOW },
          ...(memberIds ?? []).slice(0, 20).map((id) => ({ id: String(id), allow: MEMBER_ALLOW })),
        ],
        reason: '血染钟楼私聊房间',
      });
      rooms.add(ch.id);
      saveRooms();
      return { channelId: ch.id };
    },

    /** { guildId, channelId, userId }：把人加进私聊房间的权限里。 */
    allow: async ({ guildId, channelId, userId }) => {
      const ch = await ourRoom(guild(guildId), channelId);
      await ch?.permissionOverwrites.edit(String(userId), { ViewChannel: true, Connect: true, Speak: true, SendMessages: true, ReadMessageHistory: true });
      return {};
    },

    /** { guildId, channelId, userId }：收回这个人在私聊房间的权限。 */
    disallow: async ({ guildId, channelId, userId }) => {
      const ch = await ourRoom(guild(guildId), channelId);
      await ch?.permissionOverwrites.delete(String(userId)).catch(() => {});
      return {};
    },

    /** { guildId, channelId } → { exists, isVoice, memberIds }：频道在不在、是不是语音、里面有谁。 */
    channel: async ({ guildId, channelId }) => {
      const ch = await channelOf(guild(guildId), channelId);
      const isVoice = !!ch?.isVoiceBased?.();
      return { exists: !!ch, isVoice, memberIds: isVoice ? [...ch.members.keys()] : [] };
    },

    /** { guildId, channelId }：删掉私聊房间（只能删自己建的）。 */
    deleteChannel: async ({ guildId, channelId }) => {
      const ch = await ourRoom(guild(guildId), channelId);
      await ch?.delete('血染钟楼私聊结束').catch(() => {});
      rooms.delete(String(channelId));
      saveRooms();
      return {};
    },
  };

  const sendJson = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  const readBody = (req) => new Promise((ok) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 20_000) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok(null); } });
    req.on('error', () => ok(null));
  });
  const authed = (req) => {
    const got = Buffer.from(String(req.headers.authorization ?? ''));
    const want = Buffer.from(`Bearer ${secret}`);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  /** 处理一个 HTTP 请求。路径是 /botc/voice 就处理并返回 true；别的路径返回 false（交给你原来的处理）。 */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/botc/voice') return false;
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method_not_allowed' }); return true; }
    if (!authed(req)) { sendJson(res, 401, { ok: false, error: 'unauthorized' }); return true; }
    const body = await readBody(req);
    const op = ops[body?.op];
    if (!op) { sendJson(res, 400, { ok: false, error: 'unknown_op' }); return true; }
    try {
      sendJson(res, 200, { ok: true, ...(await op(body)) });
    } catch (e) {
      if (!(e instanceof OpError)) log.warn?.(`[botc-voice] ${body.op} 失败：`, e.message);
      sendJson(res, 200, { ok: false, error: e.message });
    }
    return true;
  }

  /** 单独开一个端口（不想改你原来的 HTTP 服务时用）。 */
  function listen(port, host = '0.0.0.0') {
    const server = http.createServer((req, res) => {
      handle(req, res).then((done) => { if (!done) sendJson(res, 404, { ok: false, error: 'not_found' }); })
        .catch((e) => sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }));
    });
    server.listen(port, host, () => log.log?.(`[botc-voice] listening on ${host}:${server.address().port}`));
    return server;
  }

  /** 开始推送语音状态（只推 guildIds 里的服务器，只在频道 / 闭麦 / 闭耳变了的时候推）。 */
  function start() {
    if (!pushUrl) { log.warn?.('[botc-voice] 没配 pushUrl：不推语音状态（血染钟楼会定时来问，只是慢一点）'); return; }
    client.on('voiceStateUpdate', (before, now) => {
      if (!allowed.has(now.guild.id)) return;
      if (before.channelId === now.channelId && before.serverMute === now.serverMute && before.serverDeaf === now.serverDeaf) return;
      f(pushUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ guildId: now.guild.id, userId: now.id, channelId: now.channelId ?? null, serverMute: !!now.serverMute, serverDeaf: !!now.serverDeaf }),
        signal: AbortSignal.timeout(5000),
      }).catch((e) => log.warn?.('[botc-voice] 推送语音状态失败：', e.message));
    });
  }

  return { handle, listen, start, ops, rooms };
}
