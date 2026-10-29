// KOOK（开黑啦）版：机器人连 KOOK 网关收事件，用 HTTP 接口管语音；玩家在浏览器里玩，KOOK 里聊语音。
//
// 怎么开一局：在文字频道发「/血染」→ 机器人发一张卡片 → 每个人点「领取我的进入链接」→ 机器人只给他本人
// 发一条临时消息（别人看不到），里面是带签名的进入链接（见 tickets.js）。点开就进了这个频道的房间。
// 房主所在的语音频道就是广场；夜里闭麦闭耳、开私聊房间拉人，和 Discord 版一样（账和规矩在 voice.js）。
//
// 机器人需要的服务器权限：查看频道、发消息、频道管理、管理角色权限（给私聊房间设权限）、语音管理（拉人）、
// 服务器闭麦、服务器静音。接口文档：https://developer.kookapp.cn/doc/reference
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { signTicket, TICKET_HOURS } from './tickets.js';

const BASE = 'https://www.kookapp.cn/api/v3';
export const KOOK_PREFIX = 'kook-';  // 我们这边 KOOK 的用户 id 和房间的服务器 id 都带这个前缀，和 Discord 的分开

// 权限位（https://developer.kookapp.cn/doc/http/guild-role#权限说明）
const PERM = {
  manageChannels: 1 << 5, view: 1 << 11, send: 1 << 12, connect: 1 << 15, voiceManage: 1 << 16,
  freeMic: 1 << 22, speak: 1 << 23,
};
const MEMBER_ALLOW = PERM.view | PERM.send | PERM.connect | PERM.freeMic | PERM.speak;
const BOT_ALLOW = MEMBER_ALLOW | PERM.manageChannels | PERM.voiceManage;
const EVERYONE_DENY = PERM.view | PERM.connect;
const EVERYONE = '0'; // 角色 id 0 = @全体成员

const STALE_MS = 120_000;   // 谁在哪个语音频道：网关事件随时更新；太久没更新的再问一次接口
const MUTE_TTL_MS = 20_000; // 服务器闭麦名单的缓存
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export const raw = (uid) => (String(uid).startsWith(KOOK_PREFIX) ? String(uid).slice(KOOK_PREFIX.length) : String(uid));
export const ours = (id) => `${KOOK_PREFIX}${id}`;

/** HTTP 接口。返回 data；code 不是 0 就抛错。被限速（429）稍等重试。 */
export function kookApi(token, { fetch: f = globalThis.fetch, base = BASE } = {}) {
  async function call(method, path, params) {
    for (let i = 0; ; i++) {
      const url = new URL(base + path);
      if (method === 'GET') for (const [k, v] of Object.entries(params ?? {})) if (v != null) url.searchParams.set(k, String(v));
      const r = await f(url, {
        method,
        headers: { Authorization: `Bot ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        body: method === 'POST' ? JSON.stringify(params ?? {}) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      if (r.status === 429 && i < 2) { await sleep(1000 * (i + 1)); continue; }
      const j = await r.json().catch(() => null);
      if (!j) throw new Error(`KOOK ${path} 返回 ${r.status}`);
      if (j.code !== 0) throw new Error(`KOOK ${path}：${j.message ?? j.code}`);
      return j.data;
    }
  }
  return { get: (p, q) => call('GET', p, q), post: (p, b) => call('POST', p, b) };
}

/**
 * KOOK 的平台接口（给 voice.js 的 VoiceHub 用）。
 * bus：'ready'（网关连上了）、'voice'(guildId, kook-用户id)、'reset'（网关重连了，缓存作废）。
 */
export function kookPlatform(api, bus, { botId = () => null } = {}) {
  const where = new Map(); // "guild:用户" → { ch, at }
  const mutes = new Map(); // guild → { mic: Set, headset: Set, at }
  bus.on('reset', () => { where.clear(); mutes.clear(); });
  bus.on('voice-raw', (gid, uid, ch) => { where.set(`${gid}:${uid}`, { ch, at: Date.now() }); });

  async function muteList(gid) {
    let m = mutes.get(gid);
    if (!m || Date.now() - m.at > MUTE_TTL_MS) {
      const d = await api.get('/guild-mute/list', { guild_id: gid, return_type: 'detail' }).catch((e) => { console.warn('[kook] 读闭麦名单失败：', e.message); return null; });
      m = { mic: new Set((d?.mic?.user_ids ?? []).map(String)), headset: new Set((d?.headset?.user_ids ?? []).map(String)), at: Date.now() };
      mutes.set(gid, m);
    }
    return m;
  }

  async function channelOf(gid, r) {
    const k = `${gid}:${r}`;
    let w = where.get(k);
    if (!w || Date.now() - w.at > STALE_MS) {
      const d = await api.get('/channel-user/get-joined-channel', { guild_id: gid, user_id: r }).catch(() => null);
      w = { ch: d?.items?.[0]?.id ?? null, at: Date.now() };
      where.set(k, w);
    }
    return w.ch;
  }

  /** 给一个人 / 角色设频道权限：先建一条覆写（已经有了会报错，不管），再改成想要的值。 */
  async function overwrite(channelId, type, value, allow, deny) {
    await api.post('/channel-role/create', { channel_id: channelId, type, value }).catch(() => {});
    await api.post('/channel-role/update', { channel_id: channelId, type, value, allow, deny });
  }

  const view = (id) => api.get('/channel/view', { target_id: id });

  return {
    onReady(fn) { bus.on('ready', fn); },
    onVoice(fn) { bus.on('voice', fn); },
    hasGuild: () => true, // 不在的服务器调接口会报错，由调用的地方兜着
    async state(gid, uid) {
      const r = raw(uid);
      const ch = await channelOf(gid, r);
      const m = await muteList(gid);
      return { channelId: ch, serverMute: m.mic.has(r), serverDeaf: m.headset.has(r) };
    },
    async edit(gid, uid, patch) {
      const r = raw(uid);
      for (const [key, type, list] of [['mute', 1, 'mic'], ['deaf', 2, 'headset']]) {
        if (!(key in patch)) continue;
        await api.post(patch[key] ? '/guild-mute/create' : '/guild-mute/delete', { guild_id: gid, user_id: r, type });
        const m = await muteList(gid);
        if (patch[key]) m[list].add(r); else m[list].delete(r);
      }
      if (patch.channel) {
        await api.post('/channel/move-user', { target_id: patch.channel, user_ids: [r] });
        where.set(`${gid}:${r}`, { ch: patch.channel, at: Date.now() });
      }
    },
    async isVoiceChannel(_gid, id) { return (await view(id).catch(() => null))?.type === 2; },
    async createRoom(gid, name, ids, squareId) {
      const sq = squareId ? await view(squareId).catch(() => null) : null;
      const c = await api.post('/channel/create', { guild_id: gid, name: name.slice(0, 100), type: 2, ...(sq?.parent_id ? { parent_id: sq.parent_id } : {}) });
      // 先给机器人和本局的人开权限，再对全体成员关掉（顺序反了机器人自己就进不去了）
      const bot = botId();
      if (bot) await overwrite(c.id, 'user_id', bot, BOT_ALLOW, 0).catch((e) => console.warn('[kook] 给机器人开房间权限失败：', e.message));
      for (const id of ids) await overwrite(c.id, 'user_id', raw(id), MEMBER_ALLOW, 0).catch((e) => console.warn('[kook] 开房间权限失败：', e.message));
      await overwrite(c.id, 'role_id', EVERYONE, 0, EVERYONE_DENY).catch((e) => console.warn('[kook] 关掉全体成员的房间权限失败：', e.message));
      return c.id;
    },
    async allow(_gid, ch, uid) { await overwrite(ch, 'user_id', raw(uid), MEMBER_ALLOW, 0); },
    async disallow(_gid, ch, uid) { await api.post('/channel-role/delete', { channel_id: ch, type: 'user_id', value: raw(uid) }); },
    async members(_gid, ch) {
      const list = await api.get('/channel/user-list', { channel_id: ch }).catch(() => []);
      return (Array.isArray(list) ? list : list?.items ?? []).map((u) => ours(u.id));
    },
    async exists(_gid, ch) { return !!(await view(ch).catch(() => null)); },
    async deleteChannel(_gid, ch) { await api.post('/channel/delete', { channel_id: ch }); },
  };
}

/**
 * 网关：拿地址 → 连上 → 等 HELLO → 每 30 秒 PING（带收到的最大 sn）→ 6 秒没 PONG 就断开重连。
 * 不做 RESUME：断了就重新拿网关（缓存清掉，按钮没收到的让人再点一次）。事件从 'event' 发出去。
 */
export class KookGateway extends EventEmitter {
  constructor(api, { WS = WebSocket } = {}) {
    super();
    this.api = api;
    this.WS = WS;
    this.backoff = 2000;
    this.stopped = false;
  }

  start() { this.connect().catch((e) => this.retry(e)); }
  stop() { this.stopped = true; clearInterval(this.pinger); this.ws?.terminate?.(); }

  retry(e) {
    if (this.stopped) return;
    if (e) console.warn('[kook] 网关：', e.message ?? e);
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60_000);
    setTimeout(() => this.connect().catch((err) => this.retry(err)), wait).unref?.();
  }

  async connect() {
    const { url } = await this.api.get('/gateway/index', { compress: 0 });
    const ws = new this.WS(url);
    this.ws = ws;
    let sn = 0;
    let helloed = false;
    let pongTimer = null;
    const helloTimer = setTimeout(() => { if (!helloed) ws.terminate(); }, 6000);
    const ping = () => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ s: 2, sn }));
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => { console.warn('[kook] 心跳超时，重连'); ws.terminate(); }, 6000);
    };
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (m.s === 1) {
        clearTimeout(helloTimer);
        if (m.d?.code !== 0) { console.warn('[kook] 网关握手失败：', m.d?.code); ws.terminate(); return; }
        helloed = true;
        this.backoff = 2000;
        this.emit('reset');
        this.emit('hello');
        clearInterval(this.pinger);
        this.pinger = setInterval(ping, 30_000 + Math.round((Math.random() - 0.5) * 10_000));
        this.pinger.unref?.();
      } else if (m.s === 0) {
        if (typeof m.sn === 'number') { if (m.sn <= sn) return; sn = m.sn; }
        try { this.emit('event', m.d); } catch (e) { console.warn('[kook] 处理事件出错：', e.message); }
      } else if (m.s === 3) {
        clearTimeout(pongTimer);
      } else if (m.s === 5) {
        ws.terminate(); // 服务器要求重连：重新拿网关
      }
    });
    ws.on('error', (e) => console.warn('[kook] 网关连接出错：', e.message));
    ws.on('close', () => {
      clearTimeout(helloTimer); clearTimeout(pongTimer); clearInterval(this.pinger);
      this.retry(null);
    });
  }
}

const LAUNCH_CMD = /^[/.。!！]?\s*(血染钟楼|血染|botc)\s*$/i;
const JOIN_VALUE = 'botc-join';

const card = (theme, modules) => JSON.stringify([{ type: 'card', theme, size: 'lg', modules }]);
const kmd = (content) => ({ type: 'section', text: { type: 'kmarkdown', content } });

/** 整个 KOOK 机器人：网关 + 接口 + 平台接口 + 发卡片、发进入链接。 */
export class KookBot extends EventEmitter {
  /** publicUrl：网页地址（进入链接用）；ticketSecret：门票签名密钥。 */
  constructor({ token, publicUrl, ticketSecret, fetch: f, WS }) {
    super();
    this.api = kookApi(token, { fetch: f });
    this.publicUrl = publicUrl.replace(/\/$/, '');
    this.ticketSecret = ticketSecret;
    this.me = null;
    this.guildOf = new Map(); // 频道 → 服务器（按钮点击事件里没有服务器 id）
    this.bus = new EventEmitter();
    this.platform = kookPlatform(this.api, this.bus, { botId: () => this.me?.id ?? null });
    this.gateway = new KookGateway(this.api, { WS });
    this.gateway.on('reset', () => this.bus.emit('reset'));
    this.gateway.on('hello', () => this.bus.emit('ready'));
    this.gateway.on('event', (d) => this.onEvent(d).catch((e) => console.warn('[kook] 事件处理失败：', e.message)));
    this.ready = new Promise((ok) => this.gateway.once('hello', ok));
  }

  async start() {
    this.me = await this.api.get('/user/me');
    console.log(`🤖 KOOK 机器人已登录：${this.me.username}#${this.me.identify_num}`);
    this.gateway.start();
  }

  async onEvent(d) {
    if (!d) return;
    if (d.type === 255) {
      const x = d.extra ?? {};
      const b = x.body ?? {};
      if (x.type === 'joined_channel' || x.type === 'exited_channel') {
        const gid = String(d.target_id);
        const uid = String(b.user_id);
        this.bus.emit('voice-raw', gid, uid, x.type === 'joined_channel' ? String(b.channel_id) : null);
        this.bus.emit('voice', gid, ours(uid));
      } else if (x.type === 'message_btn_click' && b.value === JOIN_VALUE) {
        await this.sendTicket(String(b.user_id), String(b.target_id), b.user_info ?? {});
      }
      return;
    }
    // 文字频道里的「/血染」：发开局卡片
    if ((d.type === 1 || d.type === 9) && d.channel_type === 'GROUP' && !d.extra?.author?.bot && d.author_id !== this.me?.id) {
      if (LAUNCH_CMD.test(String(d.content ?? '').trim())) {
        if (d.extra?.guild_id) this.guildOf.set(String(d.target_id), String(d.extra.guild_id));
        await this.postLauncher(String(d.target_id));
      }
    }
  }

  postLauncher(channelId) {
    return this.api.post('/message/create', {
      type: 10, target_id: channelId,
      content: card('secondary', [
        { type: 'header', text: { type: 'plain-text', content: '血染钟楼' } },
        kmd('想玩的人点下面的按钮，机器人会**只给你自己**发一条进入链接（别人看不到），在浏览器里打开就进了这个频道的房间。\n'
          + '开局前大家先进同一个语音频道：**房主所在的语音频道就是广场**，夜里机器人会闭麦闭耳，私聊时会把人拉进临时房间。'),
        { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: JOIN_VALUE, click: 'return-val', text: { type: 'plain-text', content: '领取我的进入链接' } }] },
      ]),
    });
  }

  async guildOfChannel(channelId) {
    if (!this.guildOf.has(channelId)) {
      const ch = await this.api.get('/channel/view', { target_id: channelId });
      this.guildOf.set(channelId, String(ch.guild_id));
    }
    return this.guildOf.get(channelId);
  }

  /** 给点了按钮的人发他自己的进入链接（临时消息：只有他看得到，也不存进聊天记录）。 */
  async sendTicket(userId, channelId, info) {
    const guildId = await this.guildOfChannel(channelId);
    const u = await this.api.get('/user/view', { user_id: userId, guild_id: guildId }).catch(() => info);
    const name = String(u?.nickname || u?.username || info.username || 'KOOK 玩家').slice(0, 24);
    const avatar = u?.avatar || info.avatar || null;
    const url = this.entryUrl({ g: guildId, c: channelId, u: userId, n: name, a: avatar });
    await this.api.post('/message/create', {
      type: 10, target_id: channelId, temp_target_id: userId,
      content: card('primary', [
        kmd(`**${name}**，这是你自己的进入链接（${TICKET_HOURS} 小时内有效，别转给别人——拿到的人会以你的身份进去）：`),
        { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: url, click: 'link', text: { type: 'plain-text', content: '进入血染钟楼' } }] },
        { type: 'context', elements: [{ type: 'plain-text', content: '打不开按钮的话，复制这个地址到浏览器：' }, { type: 'plain-text', content: url }] },
      ]),
    });
  }

  entryUrl(payload) {
    return `${this.publicUrl}/?kt=${signTicket(this.ticketSecret, payload)}`;
  }
}
