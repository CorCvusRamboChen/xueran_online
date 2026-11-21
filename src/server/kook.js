// KOOK（开黑啦）版：机器人连 KOOK 网关收事件，用 HTTP 接口管语音；玩家在浏览器里玩，KOOK 里聊语音。
//
// 布置桌子：管理员发「/血染 布置 3」，机器人建好几桌（每桌一个文字频道 + 广场语音，见下面 TABLE_NAMES），几桌可以同时玩。
// 怎么开一局：在文字频道发「/血染」→ 机器人发一张卡片 → 每个人点「领取我的进入链接」→ 机器人只给他本人
// 发一条临时消息（别人看不到），里面是带签名的进入链接（见 tickets.js）。点开就进了这个频道的房间。
// 房主所在的语音频道就是广场；夜里闭麦闭耳、开私聊房间拉人，和 Discord 版一样（账和规矩在 voice.js）。
//
// 机器人需要的服务器权限：查看频道、发消息、频道管理、管理角色权限（给私聊房间设权限）、语音管理（拉人）、
// 服务器闭麦、服务器静音。接口文档：https://developer.kookapp.cn/doc/reference
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
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
 * huts(guildId) → [{ ch, name, square }]：布置好的桌子预先建的「小屋」（隐藏的语音频道）。私聊先借空小屋，
 * 只开人的权限、拉进去（约 0.5 秒）；借完了才现建频道（建频道 + 一个个设权限要 2–3 秒，2026-11-21 用户嫌进屋等太久）。
 */
export function kookPlatform(api, bus, { botId = () => null, huts = () => [] } = {}) {
  const busy = new Set();    // 借出去的小屋
  const checked = new Set(); // 这次启动后看过里面有没有人的小屋（重启前借出去的还有人在里面，不能再借）
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
  const listOf = (d) => (Array.isArray(d) ? d : d?.items ?? []);
  const grant = (ch, ids) => Promise.all(ids.map((id) => overwrite(ch, 'user_id', raw(id), MEMBER_ALLOW, 0).catch((e) => console.warn('[kook] 开房间权限失败：', e.message))));
  const hutOf = (gid, ch) => huts(gid).find((h) => h.ch === ch) ?? null;

  /** 借一间这一桌的空小屋，改成这次私聊的名字；没有空的返回 null。 */
  async function takeHut(gid, squareId, name) {
    for (const h of huts(gid).filter((x) => x.square === squareId)) {
      if (busy.has(h.ch)) continue;
      if (!checked.has(h.ch)) {
        const inside = await api.get('/channel/user-list', { channel_id: h.ch }).catch(() => null);
        if (inside == null) continue; // 频道被删了
        checked.add(h.ch);
        if (listOf(inside).length) { busy.add(h.ch); continue; }
      }
      busy.add(h.ch);
      api.post('/channel/update', { channel_id: h.ch, name: name.slice(0, 100) }).catch(() => {}); // 改名不用等
      return h.ch;
    }
    return null;
  }

  /** 还回小屋：收回所有人的权限（机器人的留着），名字改回去。 */
  async function returnHut(h) {
    const r = await api.get('/channel-role/index', { channel_id: h.ch }).catch(() => null);
    const bot = String(botId() ?? '');
    await Promise.all((r?.permission_users ?? []).map((u) => String(u.user?.id ?? '')).filter((id) => id && id !== bot)
      .map((id) => api.post('/channel-role/delete', { channel_id: h.ch, type: 'user_id', value: id }).catch(() => {})));
    await api.post('/channel/update', { channel_id: h.ch, name: h.name }).catch(() => {});
    busy.delete(h.ch);
  }

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
      const hut = squareId ? await takeHut(gid, squareId, name) : null;
      if (hut) { await grant(hut, ids); return hut; }
      const sq = squareId ? await view(squareId).catch(() => null) : null;
      const c = await api.post('/channel/create', { guild_id: gid, name: name.slice(0, 100), type: 2, ...(sq?.parent_id ? { parent_id: sq.parent_id } : {}) });
      // 先给机器人和本局的人开权限，再对全体成员关掉（顺序反了机器人自己就进不去了）
      const bot = botId();
      if (bot) await overwrite(c.id, 'user_id', bot, BOT_ALLOW, 0).catch((e) => console.warn('[kook] 给机器人开房间权限失败：', e.message));
      await grant(c.id, ids);
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
    async deleteChannel(gid, ch) {
      const h = hutOf(gid, ch);
      if (h) { await returnHut(h); return; } // 小屋不删，还回去下次再借
      await api.post('/channel/delete', { channel_id: ch });
    },
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

// 「/血染」开卡片；「/血染 布置 3」「/血染 加桌」「/血染 帮助」见 KookBot.command
const LAUNCH_CMD = /^[/.。!！]?\s*(?:血染钟楼|血染|botc)(?:\s+(\S+)(?:\s+(\d+))?)?\s*$/i;
const JOIN_VALUE = 'botc-join';
const MAX_TABLES = 10;
const ADMIN_PERM = (1 << 0) | PERM.manageChannels; // 管理员、频道管理：才能布置桌子
const BOARD_MS = 30_000; // 桌子一览多久刷新一次（只在内容变了时才改消息，省机器人每天的发消息额度）

const card = (theme, modules) => JSON.stringify([{ type: 'card', theme, size: 'lg', modules }]);
const kmd = (content) => ({ type: 'section', text: { type: 'kmarkdown', content } });
const chn = (id) => `(chn)${id}(chn)`; // 只能提及文字频道：语音频道会显示成「#频道已删除」（2026-11-21 实测）
const voiceName = (t) => `**「${TABLE_NAMES(t.n).voice}」**`; // 语音频道只写名字

// 服务器里的布局（2026-11-21 用户：KOOK 服务器支持几桌同时玩，频道我们自己布置）：
//   📌 欢迎（新人必看、公告、桌子一览，只读）、💬 社区（闲聊、约局、复盘、反馈、闲聊语音），见 setup
//   每一桌一个分组「🎲 N号桌」：💬 N号桌（文字：领进入链接、聊天）+ 🔊 N号桌·广场（语音）
//   私聊房间开在这一桌的分组里（createRoom 跟着广场的分组走），一桌的东西都在一处，几桌同时玩互不打扰。
// 每一桌的文字频道就是一个房间（房间 key = 服务器:文字频道），广场固定是这一桌的语音频道。
export const TABLE_NAMES = (n) => ({ category: `🎲 ${n}号桌`, text: `💬 ${n}号桌`, voice: `🔊 ${n}号桌·广场`, hut: (i) => `🏠 ${n}号桌·小屋${i}` });
export const HUTS = 8; // 每桌预先建几间小屋（地图上的房子加私聊，一般用不了这么多）
const HUB_NAMES = { category: '📌 欢迎', welcome: '👋 新人必看', announce: '📢 公告', board: '📋 桌子一览' };
const COMMUNITY_NAMES = { category: '💬 社区', chat: '💬 闲聊', lfg: '🙋 约局', replay: '📖 复盘分享', feedback: '💡 建议反馈', voice: '🔊 闲聊语音' };

/** 布局存档：{ [服务器]: { hub: { category, welcome, announce, board, boardMsg }, community: {…}, tables: [{ n, category, text, voice, card }] } } */
function layoutStore(file) {
  let data = {};
  let seen = 0;
  // 文件被别的进程改了（比如在服务器上用脚本布置）就重新读，不用重启
  const fresh = () => {
    if (!file) return data;
    try { const m = fs.statSync(file).mtimeMs; if (m !== seen) { data = JSON.parse(fs.readFileSync(file, 'utf8')); seen = m; } } catch { /* 还没布置过 */ }
    return data;
  };
  return {
    get: (gid) => fresh()[gid] ?? null,
    set(gid, v) {
      fresh()[gid] = v;
      if (!file) return;
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); seen = fs.statSync(file).mtimeMs; } catch (e) { console.warn('[kook] 存布局失败：', e.message); }
    },
    guilds: () => Object.keys(fresh()),
  };
}

/** 整个 KOOK 机器人：网关 + 接口 + 平台接口 + 发卡片、发进入链接、布置桌子。 */
export class KookBot extends EventEmitter {
  /**
   * publicUrl：网页地址（进入链接用）；ticketSecret：门票签名密钥；layoutFile：桌子布局存在哪（不给就只在内存里）。
   * tableStatus(guildId, 文字频道) → { state: 'free'|'lobby'|'game', n?, day?, host? }：桌子一览用，由 index.js 接上房间。
   */
  constructor({ token, publicUrl, ticketSecret, fetch: f, WS, layoutFile = null }) {
    super();
    this.api = kookApi(token, { fetch: f });
    this.publicUrl = publicUrl.replace(/\/$/, '');
    this.ticketSecret = ticketSecret;
    this.me = null;
    this.guildOf = new Map(); // 频道 → 服务器（按钮点击事件里没有服务器 id）
    this.layout = layoutStore(layoutFile);
    this.tableStatus = null;
    this.boardShown = new Map(); // 服务器 → 上次写进桌子一览的内容
    this.bus = new EventEmitter();
    const huts = (gid) => (this.layout.get(gid)?.tables ?? []).flatMap((t) => (t.huts ?? []).map((ch, i) => ({ ch, name: TABLE_NAMES(t.n).hut(i + 1), square: t.voice })));
    this.platform = kookPlatform(this.api, this.bus, { botId: () => this.me?.id ?? null, huts });
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
    this.boardTimer = setInterval(() => { for (const gid of this.layout.guilds()) this.refreshBoard(gid).catch((e) => console.warn('[kook] 刷新桌子一览失败：', e.message)); }, BOARD_MS);
    this.boardTimer.unref?.();
  }

  /** 这一桌（文字频道）固定的广场语音频道；不是布置好的桌子返回 null。 */
  tableOf(gid, textChannel) {
    return this.layout.get(gid)?.tables.find((t) => t.text === textChannel) ?? null;
  }
  squareFor(gid, textChannel) { return this.tableOf(gid, textChannel)?.voice ?? null; }

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
    // 文字频道里的「/血染 ……」
    if ((d.type === 1 || d.type === 9) && d.channel_type === 'GROUP' && !d.extra?.author?.bot && d.author_id !== this.me?.id) {
      const m = String(d.content ?? '').trim().match(LAUNCH_CMD);
      if (!m) return;
      const ch = String(d.target_id);
      if (d.extra?.guild_id) this.guildOf.set(ch, String(d.extra.guild_id));
      await this.command(ch, String(d.author_id), (m[1] ?? '').toLowerCase(), m[2] ? Number(m[2]) : null);
    }
  }

  async command(ch, uid, verb, num) {
    if (!verb) { await this.postLauncher(ch); return; }
    if (/^(帮助|help|\?|？)$/.test(verb)) { await this.say(ch, this.helpText()); return; }
    if (/^(布置|setup)$/.test(verb) || /^(加桌|add)$/.test(verb)) {
      const gid = await this.guildOfChannel(ch);
      if (!(await this.isAdmin(gid, uid))) { await this.say(ch, '只有服务器主和有「频道管理」权限的人能布置桌子。'); return; }
      const have = this.layout.get(gid)?.tables.length ?? 0;
      // 不写数字：已有几桌就几桌（第一次 3 桌）；写了数字只加不减（减桌要管理员自己删频道）
      const want = /^(加桌|add)$/.test(verb) ? have + 1 : num ? Math.max(have, Math.min(MAX_TABLES, Math.max(1, num))) : have || 3;
      if (want > MAX_TABLES) { await this.say(ch, `最多 ${MAX_TABLES} 桌。`); return; }
      try {
        const lay = await this.setup(gid, want);
        await this.say(ch, `布置好了：${lay.tables.length} 桌。新人必看在 ${chn(lay.hub.welcome)}，桌子一览在 ${chn(lay.hub.board)}；想玩的人进一桌的文字频道点按钮领链接。`);
      } catch (e) {
        console.warn('[kook] 布置桌子失败：', e.message);
        await this.say(ch, `布置失败：${e.message}（机器人要有「频道管理」「管理角色权限」权限）`);
      }
      return;
    }
    await this.say(ch, this.helpText());
  }

  helpText() {
    return '**血染钟楼机器人**\n'
      + '`/血染`：在这个频道发一张开局卡片\n'
      + `\`/血染 布置 3\`：管理员用，布置整个服务器（欢迎、社区分区）并建好 3 桌（每桌一个文字频道 + 一个广场语音，最多 ${MAX_TABLES} 桌）；再发一次会补上被删掉的频道\n`
      + '`/血染 加桌`：管理员用，再加一桌';
  }

  say(ch, content) { return this.api.post('/message/create', { type: 9, target_id: ch, content }); }

  /** 服务器主，或者有管理员 / 频道管理权限的角色。 */
  async isAdmin(gid, uid) {
    const g = await this.api.get('/guild/view', { guild_id: gid });
    if (String(g.user_id) === String(uid)) return true;
    const u = await this.api.get('/user/view', { user_id: uid, guild_id: gid }).catch(() => null);
    const mine = new Set((u?.roles ?? []).map(String));
    return (g.roles ?? []).some((r) => mine.has(String(r.role_id)) && (Number(r.permissions) & ADMIN_PERM));
  }

  /**
   * 建（或补齐）整个服务器的布局，按 Discord 社区常见的分区（欢迎 → 社区 → 游戏），每个分组四五个频道：
   *   📌 欢迎：👋 新人必看（欢迎 + 怎么玩 + 规则）、📢 公告、📋 桌子一览 —— 都只读，只有管理员和机器人能发
   *   💬 社区：💬 闲聊、🙋 约局、📖 复盘分享、💡 建议反馈、🔊 闲聊语音
   *   🎲 N号桌 × n：💬 N号桌、🔊 N号桌·广场（私聊房间也开在这里）
   * 已有的频道还在就沿用（名字、分组对不上的改回来），被删掉的重建；服务器建好时默认的「文字频道」「语音频道」
   * 收进社区当闲聊，空下来的默认分组删掉。返回布局。
   */
  async setup(gid, n) {
    const old = this.layout.get(gid) ?? {};
    const g = await this.api.get('/guild/view', { guild_id: gid });
    const all = (g.channels ?? []).map((c) => ({ ...c, id: String(c.id), parent_id: String(c.parent_id ?? '') }));
    const byId = new Map(all.map((c) => [c.id, c]));
    const used = new Set();
    // 一个位置：先认存档里的 id，再按名字认（含默认频道的旧名），都没有就建
    const ensure = async (id, { name, parent = null, cat = false, type = 1, alias = [], extra = {} }) => {
      let c = id && byId.get(String(id));
      if (id && !c) { const v = await this.api.get('/channel/view', { target_id: id }).catch(() => null); if (v) { c = { ...v, id: String(v.id), parent_id: String(v.parent_id ?? '') }; byId.set(c.id, c); } } // 接口给的列表里不一定有分组
      if (!c) c = all.find((x) => !used.has(x.id) && !!x.is_category === cat && (x.name === name || alias.includes(x.name)) && (cat || x.type === type));
      if (c) {
        used.add(c.id);
        const patch = {};
        if (c.name !== name) patch.name = name;
        if (!cat && parent && c.parent_id !== parent) patch.parent_id = parent;
        if (Object.keys(patch).length) await this.api.post('/channel/update', { channel_id: c.id, ...patch }).catch((e) => console.warn('[kook] 改频道失败：', e.message));
        return { id: c.id, fresh: false };
      }
      const made = await this.api.post('/channel/create', cat ? { guild_id: gid, name, is_category: 1 } : { guild_id: gid, name, type, ...(parent ? { parent_id: parent } : {}), ...extra });
      used.add(String(made.id));
      return { id: String(made.id), fresh: true };
    };

    // 📌 欢迎
    const hub = { ...(old.hub ?? {}) };
    hub.category = (await ensure(hub.category, { name: HUB_NAMES.category, cat: true, alias: ['🕯 血染钟楼'] })).id;
    const welcome = await ensure(hub.welcome, { name: HUB_NAMES.welcome, parent: hub.category });
    const announce = await ensure(hub.announce, { name: HUB_NAMES.announce, parent: hub.category });
    const board = await ensure(hub.board, { name: HUB_NAMES.board, parent: hub.category, alias: ['📜 怎么玩'] });
    Object.assign(hub, { welcome: welcome.id, announce: announce.id, board: board.id });
    if (board.fresh) hub.boardMsg = null;
    for (const ch of [hub.welcome, hub.announce, hub.board]) await this.readOnly(ch).catch((e) => console.warn('[kook] 设只读失败：', e.message));

    // 💬 社区（收编默认的「文字分组 / 文字频道 / 语音频道」）
    const com = { ...(old.community ?? {}) };
    com.category = (await ensure(com.category, { name: COMMUNITY_NAMES.category, cat: true, alias: ['文字分组'] })).id;
    com.chat = (await ensure(com.chat, { name: COMMUNITY_NAMES.chat, parent: com.category, alias: ['文字频道'] })).id;
    const lfg = await ensure(com.lfg, { name: COMMUNITY_NAMES.lfg, parent: com.category });
    com.lfg = lfg.id;
    com.replay = (await ensure(com.replay, { name: COMMUNITY_NAMES.replay, parent: com.category })).id;
    com.feedback = (await ensure(com.feedback, { name: COMMUNITY_NAMES.feedback, parent: com.category })).id;
    com.voice = (await ensure(com.voice, { name: COMMUNITY_NAMES.voice, parent: com.category, type: 2, alias: ['语音频道'], extra: { limit_amount: 50 } })).id;

    // 🎲 每一桌
    const tables = [];
    for (let i = 1; i <= n; i++) {
      const names = TABLE_NAMES(i);
      const t = { n: i, ...((old.tables ?? []).find((x) => x.n === i) ?? {}) };
      t.category = (await ensure(t.category, { name: names.category, cat: true })).id;
      const text = await ensure(t.text, { name: names.text, parent: t.category });
      t.text = text.id;
      t.voice = (await ensure(t.voice, { name: names.voice, parent: t.category, type: 2, extra: { limit_amount: 30 } })).id;
      const huts = [];
      for (let j = 1; j <= HUTS; j++) {
        const h = await ensure(t.huts?.[j - 1], { name: names.hut(j), parent: t.category, type: 2, extra: { limit_amount: 20 } });
        if (h.fresh) await this.hide(h.id).catch((e) => console.warn('[kook] 藏小屋失败：', e.message));
        huts.push(h.id);
      }
      t.huts = huts;
      tables.push(t);
      this.guildOf.set(t.text, gid);
      // 卡片已经发过：改成最新的写法（改不了就重发）；新频道发一张
      const fixed = !text.fresh && t.card && await this.api.post('/message/update', { msg_id: t.card, content: this.launcherCard(t) }).then(() => true, () => false);
      if (!fixed) t.card = (await this.postLauncher(t.text, t).catch(() => null))?.msg_id ?? null;
    }

    // 默认的「语音分组」里的频道都搬走了：空分组删掉
    for (const c of all) {
      if (c.is_category && c.name === '语音分组' && !used.has(c.id) && !all.some((x) => x.parent_id === c.id && !used.has(x.id))) {
        await this.api.post('/channel/delete', { channel_id: c.id }).catch(() => {});
      }
    }
    // 分组排序：欢迎、社区、各桌
    const order = [hub.category, com.category, ...tables.map((t) => t.category)];
    for (const [i, id] of order.entries()) await this.api.post('/channel/update', { channel_id: id, level: i + 1 }).catch(() => {});
    // 分组里的频道也排好（建服时的默认频道 level 是 200，不排的话新建的会跑到它前面）
    const inner = [[hub.welcome, hub.announce, hub.board], [com.chat, com.lfg, com.replay, com.feedback, com.voice], ...tables.map((t) => [t.text, t.voice, ...t.huts])];
    for (const list of inner) for (const [i, id] of list.entries()) await this.api.post('/channel/update', { channel_id: id, level: i + 1 }).catch(() => {});

    const lay = { hub, community: com, tables };
    this.layout.set(gid, lay);
    if (welcome.fresh) for (const c of [this.welcomeCard(lay), this.rulesCard()]) await this.api.post('/message/create', { type: 10, target_id: hub.welcome, content: c }).catch((e) => console.warn('[kook] 发新人必看失败：', e.message));
    if (lfg.fresh) await this.api.post('/channel/update', { channel_id: com.lfg, topic: '想开一局在这里喊：几点、几个人、想玩哪个剧本' }).catch(() => {});
    this.boardShown.delete(gid);
    await this.refreshBoard(gid).catch((e) => console.warn('[kook] 发桌子一览失败：', e.message));
    return lay;
  }

  /** 小屋：全体成员看不见、进不去，机器人能管；借出去时再给进屋的人开权限。 */
  async hide(ch) {
    const set = async (type, value, allow, deny) => {
      await this.api.post('/channel-role/create', { channel_id: ch, type, value }).catch(() => {});
      await this.api.post('/channel-role/update', { channel_id: ch, type, value, allow, deny });
    };
    if (this.me?.id) await set('user_id', String(this.me.id), BOT_ALLOW, 0);
    await set('role_id', EVERYONE, 0, EVERYONE_DENY);
  }

  /** 只读频道：全体成员能看不能发，机器人能发（管理员本来就能发）。 */
  async readOnly(ch) {
    const set = async (type, value, allow, deny) => {
      await this.api.post('/channel-role/create', { channel_id: ch, type, value }).catch(() => {});
      await this.api.post('/channel-role/update', { channel_id: ch, type, value, allow, deny });
    };
    if (this.me?.id) await set('user_id', String(this.me.id), PERM.view | PERM.send, 0);
    await set('role_id', EVERYONE, PERM.view, PERM.send);
  }

  welcomeCard(lay) {
    return card('secondary', [
      { type: 'header', text: { type: 'plain-text', content: '欢迎来到血染钟楼' } },
      kmd('这里用 KOOK 语音 + 网页玩《血染钟楼》，**AI 说书人**主持，不用真人说书人也能开。\n\n'
        + '**三步开一局**\n'
        + `1. 看 ${chn(lay.hub.board)}，挑一桌空着的，进这一桌的 🔊 广场语音。\n`
        + '2. 在这一桌的 💬 文字频道点「领取我的进入链接」，机器人只发给你自己，用浏览器打开。\n'
        + '3. 第一个进来的是房主，人齐了在网页里开局。第一次玩可以先点网页里的「新手教程」。\n\n'
        + `人不够就去 ${chn(lay.community.lfg)} 喊一声；打完可以在 ${chn(lay.community.replay)} 晒复盘；有问题、想要新功能去 ${chn(lay.community.feedback)}。`),
      { type: 'context', elements: [{ type: 'plain-text', content: '夜里机器人会在本桌广场闭麦闭耳，白天私聊会把人拉进本桌分组下的临时房间，聊完送回广场。几桌同时玩互不打扰。' }] },
    ]);
  }

  rulesCard() {
    return card('warning', [
      { type: 'header', text: { type: 'plain-text', content: '规则' } },
      kmd('1. **友善**：对事不对人。骗人是游戏的一部分，游戏外不翻旧账。\n'
        + '2. **不聊场外**：游戏中不在别的频道、私信、别的语音里透露角色和信息；死了也别剧透给还活着的人。\n'
        + '3. **不晒身份**：不截图、不拍屏证明自己的角色，只能用嘴说。\n'
        + '4. **玩完再走**：进了桌就打完；有事要走先跟房主说一声。\n'
        + '5. **夜里闭麦是正常的**：机器人闭的麦和耳机别自己解，天亮会自动解开。\n'
        + '6. **对新人耐心**：规则问题帮忙解释；说书人的裁决有疑问，赛后去建议反馈里说。'),
    ]);
  }

  /** 桌子一览的卡片内容。 */
  boardCard(gid) {
    const lay = this.layout.get(gid);
    const line = (t) => {
      const s = this.tableStatus?.(gid, t.text) ?? { state: 'free' };
      const what = s.state === 'game' ? `🔴 正在玩${s.day ? `（第 ${s.day} 天` : '（'}，${s.n ?? '?'} 人）`
        : s.state === 'lobby' ? `🟡 大厅里 ${s.n ?? 0} 人${s.host ? `，房主 ${s.host}` : ''}，可以加入`
          : '🟢 空着';
      return `**${t.n}号桌** ${what}　文字 ${chn(t.text)} · 语音 ${voiceName(t)}`;
    };
    return card('info', [
      { type: 'header', text: { type: 'plain-text', content: '桌子一览' } },
      kmd(lay.tables.map(line).join('\n')),
      { type: 'context', elements: [{ type: 'plain-text', content: `每 ${BOARD_MS / 1000} 秒自动更新。桌子不够用请管理员发「/血染 加桌」。` }] },
    ]);
  }

  /** 桌子一览：内容变了才改（第一次发一条新的，记下消息 id）。 */
  async refreshBoard(gid) {
    const lay = this.layout.get(gid);
    if (!lay?.hub?.board || !lay.tables.length) return;
    const content = this.boardCard(gid);
    if (this.boardShown.get(gid) === content) return;
    if (lay.hub.boardMsg) {
      const ok = await this.api.post('/message/update', { msg_id: lay.hub.boardMsg, content }).then(() => true).catch(() => false);
      if (ok) { this.boardShown.set(gid, content); return; }
    }
    const m = await this.api.post('/message/create', { type: 10, target_id: lay.hub.board, content });
    lay.hub.boardMsg = m?.msg_id ?? null;
    this.layout.set(gid, lay);
    this.boardShown.set(gid, content);
  }

  /** 开局卡片。table：布置好的桌子（卡片上写明进哪个语音）；不是桌子的频道就是通用的说法。 */
  postLauncher(channelId, table = null) {
    const gid = this.guildOf.get(channelId);
    table ??= gid ? this.tableOf(gid, channelId) : null;
    return this.api.post('/message/create', { type: 10, target_id: channelId, content: this.launcherCard(table) });
  }

  launcherCard(table) {
    const how = table
      ? `这里是 **${table.n}号桌**。先进语音 ${voiceName(table)}（这一桌的广场），再点下面的按钮，机器人会**只给你自己**发一条进入链接（别人看不到），在浏览器里打开就进了这一桌。\n`
        + '夜里机器人会在这一桌的广场里闭麦闭耳，私聊时把人拉进这一桌分组下的临时房间。'
      : '想玩的人点下面的按钮，机器人会**只给你自己**发一条进入链接（别人看不到），在浏览器里打开就进了这个频道的房间。\n'
        + '开局前大家先进同一个语音频道：**房主所在的语音频道就是广场**，夜里机器人会闭麦闭耳，私聊时会把人拉进临时房间。';
    return card('secondary', [
      { type: 'header', text: { type: 'plain-text', content: table ? `血染钟楼 · ${table.n}号桌` : '血染钟楼' } },
      kmd(how),
      { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: JOIN_VALUE, click: 'return-val', text: { type: 'plain-text', content: '领取我的进入链接' } }] },
      { type: 'context', elements: [{ type: 'plain-text', content: '点了以后马上会出现一条「正在生成」，一两秒后变成你的链接。' }] },
    ]);
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
    const temp = { target_id: channelId, temp_target_id: userId };
    const wait = await this.api.post('/message/create', { type: 10, ...temp, content: card('secondary', [kmd('⏳ 正在生成你的进入链接，一两秒就好……')]) })
      .catch((e) => { console.warn('[kook] 发「正在生成」失败：', e.message); return null; });
    const guildId = await this.guildOfChannel(channelId);
    const u = await this.api.get('/user/view', { user_id: userId, guild_id: guildId }).catch(() => info);
    const name = String(u?.nickname || u?.username || info.username || 'KOOK 玩家').slice(0, 24);
    const avatar = u?.avatar || info.avatar || null;
    const url = this.entryUrl({ g: guildId, c: channelId, u: userId, n: name, a: avatar });
    const table = this.tableOf(guildId, channelId);
    const content = card('primary', [
        kmd(`**${name}**，这是你自己的进入链接（${TICKET_HOURS} 小时内有效，别转给别人——拿到的人会以你的身份进去）：`
          + (table ? `\n记得进语音 ${voiceName(table)}，不然夜里闭麦、私聊拉人都管不到你。` : '')),
        { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: url, click: 'link', text: { type: 'plain-text', content: '进入血染钟楼' } }] },
        { type: 'context', elements: [{ type: 'plain-text', content: '打不开按钮的话，复制这个地址到浏览器：' }, { type: 'plain-text', content: url }] },
    ]);
    if (wait?.msg_id && await this.api.post('/message/update', { msg_id: wait.msg_id, content, temp_target_id: userId }).then(() => true, () => false)) return;
    await this.api.post('/message/create', { type: 10, ...temp, content });
  }

  entryUrl(payload) {
    return `${this.publicUrl}/?kt=${signTicket(this.ticketSecret, payload)}`;
  }
}
