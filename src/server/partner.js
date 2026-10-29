// 合作机器人代管语音（比如旺财）：别人家的 Discord 服务器里已经有一个管着语音的机器人，
// 就不用再把我们的机器人请进去——活动（小程序）照常从那个服务器打开，夜里闭麦闭耳、开私聊房间、拉人
// 这些语音操作由我们发 HTTP 请求给合作机器人，让它代我们做。
//
// 两个方向（对方要做的事见 docs/WANGCAI_BOTC_HANDOVER.md）：
//   我们 → 合作机器人：POST {url}/botc/voice，body { op, ... }，Authorization: Bearer <共享密钥>
//   合作机器人 → 我们：POST /api/partner/voice，有人进出语音 / 被闭麦时推一条语音状态（同一个密钥）
// 账和规矩（只动本局频道里的人、别人闭的麦不碰、重启后解开）还是 voice.js 的 VoiceHub 管，这里只是平台接口。
import { EventEmitter } from 'node:events';

const STALE_MS = 120_000; // 语音状态：对方推送随时更新；太久没更新的再问一次

/** 合作机器人的平台接口（给 VoiceHub 用），外加 push()：收到对方推来的语音状态时调用。 */
export function partnerPlatform({ url, token, fetch: f = globalThis.fetch, name = '合作机器人' }) {
  const base = url.replace(/\/$/, '');
  const bus = new EventEmitter();
  const states = new Map(); // "guild:user" → { channelId, serverMute, serverDeaf, at }

  async function call(op, body = {}) {
    const r = await f(`${base}/botc/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ op, ...body }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error(`${name} ${op} 返回 ${r.status}`);
    if (!j.ok) throw new Error(`${name} ${op}：${j.error ?? r.status}`);
    return j;
  }

  const put = (gid, uid, s) => states.set(`${gid}:${uid}`, {
    channelId: s?.channelId ?? null, serverMute: !!s?.serverMute, serverDeaf: !!s?.serverDeaf, at: Date.now(),
  });

  const platform = {
    call,
    onReady(fn) { bus.on('ready', fn); },
    onVoice(fn) { bus.on('voice', fn); },
    hasGuild: () => true, // 哪些服务器交给合作机器人由 index.js 按配置决定
    async state(gid, uid) {
      let s = states.get(`${gid}:${uid}`);
      if (!s || Date.now() - s.at > STALE_MS) {
        const j = await call('state', { guildId: gid, userIds: [uid] });
        put(gid, uid, j.states?.[uid]);
        s = states.get(`${gid}:${uid}`);
      }
      return { channelId: s.channelId, serverMute: s.serverMute, serverDeaf: s.serverDeaf };
    },
    async edit(gid, uid, patch) {
      const body = { guildId: gid, userId: uid };
      if ('mute' in patch) body.mute = patch.mute;
      if ('deaf' in patch) body.deaf = patch.deaf;
      if (patch.channel) body.channelId = patch.channel;
      await call('edit', body);
      const s = states.get(`${gid}:${uid}`);
      if (s) {
        if ('mute' in patch) s.serverMute = patch.mute;
        if ('deaf' in patch) s.serverDeaf = patch.deaf;
        if (patch.channel) s.channelId = patch.channel;
      }
    },
    async isVoiceChannel(gid, ch) { return !!(await call('channel', { guildId: gid, channelId: ch })).isVoice; },
    async createRoom(gid, name, ids, squareId) {
      return (await call('createRoom', { guildId: gid, name, memberIds: ids, squareChannelId: squareId ?? null })).channelId;
    },
    async allow(gid, ch, uid) { await call('allow', { guildId: gid, channelId: ch, userId: uid }); },
    async disallow(gid, ch, uid) { await call('disallow', { guildId: gid, channelId: ch, userId: uid }); },
    async members(gid, ch) { return (await call('channel', { guildId: gid, channelId: ch })).memberIds ?? []; },
    async exists(gid, ch) { return !!(await call('channel', { guildId: gid, channelId: ch })).exists; },
    async deleteChannel(gid, ch) { await call('deleteChannel', { guildId: gid, channelId: ch }); },

    /** 对方推来一条语音状态：{ guildId, userId, channelId, serverMute, serverDeaf }。 */
    push(s) {
      const gid = String(s?.guildId ?? ''); const uid = String(s?.userId ?? '');
      if (!gid || !uid) return false;
      put(gid, uid, { channelId: s.channelId ? String(s.channelId) : null, serverMute: s.serverMute, serverDeaf: s.serverDeaf });
      bus.emit('voice', gid, uid);
      return true;
    },

    /** 启动时：ping 通了算登录好（VoiceHub 这时把上次留下的闭麦解开）；不通就过一会儿再试。 */
    connect({ retryMs = 30_000 } = {}) {
      const once = () => call('ping').then((j) => {
        console.log(`🤝 ${name}已接上（机器人 ${j.botId ?? '?'}）`);
        bus.emit('ready');
      }).catch((e) => {
        console.warn(`[partner] ${name}连不上：${e.message}，${retryMs / 1000} 秒后再试`);
        setTimeout(once, retryMs).unref?.();
      });
      once();
      return new Promise((ok) => bus.once('ready', ok));
    },
  };
  return platform;
}
