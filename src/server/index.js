// 后端：给 Activity 换 OAuth token、用 WebSocket 同步游戏状态、托管前端页面、驱动机器人管语音。
import 'dotenv/config';
import http from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Room, UserError } from './room.js';
import { VoiceHub } from './voice.js';
import { ttsHandler, ttsEnabled } from './tts.js';
import { saveSoon, flushAll, loadAll, archiveGame, listGames, getGame, statsFor } from './store.js';
import { startTutorial } from './tutorial.js';
import { KookBot, KOOK_PREFIX } from './kook.js';
import { verifyTicket } from './tickets.js';
import { partnerPlatform } from './partner.js';
import { voiceLaunchBlocked } from './launch.js';
import { timingSafeEqual } from 'node:crypto';

const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_TOKEN } = process.env;
const PORT = Number(process.env.PORT ?? 3001);
const DEV_LOGIN = process.env.DEV_LOGIN === '1';   // 允许在普通浏览器里不登录 Discord 测试
const { KOOK_TOKEN } = process.env;
const PUBLIC_URL = process.env.PUBLIC_URL ?? 'https://botc.rambooo.com'; // KOOK 进入链接指向的网页地址
// KOOK 进入链接的签名密钥：没单独配就从机器人 token 派生（换 token 旧链接就作废）；本地测试用固定值
const TICKET_SECRET = process.env.KOOK_TICKET_SECRET
  || (KOOK_TOKEN ? createHash('sha256').update(`botc-ticket|${KOOK_TOKEN}`).digest('hex') : DEV_LOGIN ? 'dev-ticket-secret' : null);

// ───────────── 机器人（管语音） ─────────────
let hub = null;
let botReady = Promise.resolve();
if (DISCORD_TOKEN) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  // 账上挂着闭麦的局：还在进行（没结束、没暂停）才算数，不然定时解开
  hub = new VoiceHub(client, { roomAlive: (key) => { const r = rooms.get(key); return !!(r?.game && !r.ended && !r.paused); } });
  botReady = new Promise((ok) => client.once(Events.ClientReady, ok));
  client.once(Events.ClientReady, (c) => console.log(`🤖 机器人已登录：${c.user.tag}`));
  client.login(DISCORD_TOKEN).catch((e) => console.error('机器人登录失败：', e.message));
} else {
  console.warn('⚠️ 没有 DISCORD_TOKEN：Discord 那边游戏能玩，但夜晚闭麦和拉人私聊不会生效');
}

// ───────────── 合作机器人代管语音（比如旺财，见 docs/WANGCAI_BOTC_HANDOVER.md） ─────────────
// 这些 Discord 服务器里不用请我们的机器人：语音操作发给对方的机器人去做。
const PARTNER_URL = process.env.PARTNER_BOT_URL ?? '';
const PARTNER_TOKEN = process.env.PARTNER_BOT_TOKEN ?? '';
const PARTNER_GUILDS = new Set((process.env.PARTNER_BOT_GUILDS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const PARTNER_NAME = process.env.PARTNER_BOT_NAME || '旺财'; // 只用在日志里
let partner = null;
let partnerHub = null;
let partnerReady = Promise.resolve();
if (PARTNER_URL && PARTNER_TOKEN && PARTNER_GUILDS.size) {
  partner = partnerPlatform({ url: PARTNER_URL, token: PARTNER_TOKEN, name: PARTNER_NAME });
  partnerHub = new VoiceHub(partner, {
    roomAlive: (key) => { const r = rooms.get(key); return !!(r?.game && !r.ended && !r.paused); },
    file: path.resolve('data/voice-held-partner.json'), oldFile: null,
  });
  partnerReady = partner.connect();
  console.log(`🤝 ${PARTNER_GUILDS.size} 个服务器的语音交给${PARTNER_NAME}代管`);
}

// ───────────── KOOK 机器人（发进入链接、管语音） ─────────────
let kookHub = null;
let kookReady = Promise.resolve();
if (KOOK_TOKEN) {
  const kook = new KookBot({ token: KOOK_TOKEN, publicUrl: PUBLIC_URL, ticketSecret: TICKET_SECRET });
  kookHub = new VoiceHub(kook.platform, {
    roomAlive: (key) => { const r = rooms.get(key); return !!(r?.game && !r.ended && !r.paused); },
    file: path.resolve('data/voice-held-kook.json'), oldFile: null,
  });
  kookReady = kook.ready;
  kook.start().catch((e) => console.error('KOOK 机器人登录失败：', e.message));
}

// ───────────── HTTP ─────────────
const app = express();
app.use(express.json());

app.get('/api/tts/:id', ttsHandler);

// 合作机器人推来的语音状态（有人进出语音、被闭麦）：{ guildId, userId, channelId, serverMute, serverDeaf }
app.post('/api/partner/voice', (req, res) => {
  const got = Buffer.from(String(req.headers.authorization ?? ''));
  const want = Buffer.from(`Bearer ${PARTNER_TOKEN}`);
  if (!partner || got.length !== want.length || !timingSafeEqual(got, want)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const list = Array.isArray(req.body) ? req.body : [req.body];
  let n = 0;
  for (const s of list.slice(0, 50)) if (PARTNER_GUILDS.has(String(s?.guildId)) && partner.push(s)) n++;
  res.json({ ok: true, accepted: n });
});

// 本地测试 KOOK 进入链接（不连 KOOK）：/api/dev/kook-ticket?g=服务器&c=频道&u=用户&n=名字 → 跳到带门票的页面
if (DEV_LOGIN && TICKET_SECRET) {
  const { signTicket } = await import('./tickets.js');
  app.get('/api/dev/kook-ticket', (req, res) => {
    const q = (k, d) => String(req.query[k] ?? d).slice(0, 40);
    res.redirect(`/?kt=${signTicket(TICKET_SECRET, { g: q('g', 'devguild'), c: q('c', 'devchannel'), u: q('u', 'devuser'), n: q('n', 'KOOK测试'), a: null })}`);
  });
}

// 开发用：小镇底稿页把导出的底稿直接存进 design/guides/（只在 DEV_LOGIN 下开放）
if (DEV_LOGIN) {
  // 色调编辑器（?preview=layout 的「色调」）：写回 src/shared/maps/<地图>-tone.js
  app.post('/api/dev/tone/:map', express.json({ limit: '16kb' }), async (req, res) => {
    const map = String(req.params.map);
    if (map !== 'bmr') return res.status(400).json({ error: '只有黯月初升能调' });
    const RANGE = { brightness: [0.3, 2], contrast: [0.3, 2], saturate: [0, 3], sepia: [0, 1], hue: [-180, 180] };
    const out = { map: {}, houses: {} };
    if (req.body?.square) out.square = {};
    for (const g of Object.keys(out)) {
      for (const [k, v] of Object.entries(req.body?.[g] ?? {})) {
        const r = RANGE[k];
        if (!r || typeof v !== 'number' || !Number.isFinite(v) || v < r[0] || v > r[1]) return res.status(400).json({ error: `${g}.${k} 不对` });
        out[g][k] = Math.round(v * 100) / 100;
      }
    }
    const { writeFile } = await import('node:fs/promises');
    const file = `src/shared/maps/${map}-tone.js`;
    const head = '// 黯月初升的色调（在 http://localhost:3001/?preview=layout 的「色调」里调，点保存就写回这个文件）。\n'
      + '// map：手绘底图（连同从底图里切出来的树、普通建筑）和集合广场；houses：7 间能进的房子。没写的项就是不调。\n';
    await writeFile(path.resolve(file), `${head}export default ${JSON.stringify(out, null, 2)};\n`);
    res.json({ ok: true, path: file });
  });

  // 地面雾编辑器（?preview=layout 的「地面雾」）：把雾团写回 src/shared/maps/<地图>-fog.js
  app.post('/api/dev/fog/:map', express.json({ limit: '256kb' }), async (req, res) => {
    const map = String(req.params.map);
    if (map !== 'bmr') return res.status(400).json({ error: '只有黯月初升能调' });
    const list = req.body;
    const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (!Array.isArray(list) || list.length > 600) return res.status(400).json({ error: '雾团太多或格式不对' });
    const out = [];
    for (const o of list) {
      if (!o || !num(o.x, -2000, 6000) || !num(o.y, -2000, 6000) || !num(o.w, 20, 3000) || !num(o.a, 0, 1) || (o.f != null && !num(o.f, 0.05, 1.5))) return res.status(400).json({ error: '有一团雾的数据不对' });
      out.push({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), a: Math.round(o.a * 100) / 100, f: Math.round((o.f ?? 0.36) * 100) / 100, ...(o.top === true ? { top: true } : {}) });
    }
    const { writeFile } = await import('node:fs/promises');
    const file = `src/shared/maps/${map}-fog.js`;
    const head = '// 黯月初升的地面雾团（在 http://localhost:3001/?preview=layout 的「地面雾」里摆，点保存就写回这个文件）。\n'
      + '// 每团 { x, y（地图坐标，放大以后的）, w（宽，世界像素）, a（浓度）, f（扁度）, top（盖在房子前面）}。空数组 = 用默认摆法（沿溪谷和林子边）。\n';
    await writeFile(path.resolve(file), `${head}export default [\n${out.map((o) => `  ${JSON.stringify(o)},`).join('\n')}\n];\n`);
    res.json({ ok: true, path: file, count: out.length });
  });

  // 房子摆放编辑器（?preview=layout）：把每间房子的微调写回 src/shared/maps/<地图>-layout.js
  app.post('/api/dev/layout/:map', express.json({ limit: '64kb' }), async (req, res) => {
    const map = String(req.params.map);
    if (map !== 'bmr') return res.status(400).json({ error: '只有黯月初升能调' });
    const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    const out = {};
    for (const [id, o] of Object.entries(req.body ?? {})) {
      if (!/^[a-z]{1,20}$/.test(id) || typeof o !== 'object' || !o) return res.status(400).json({ error: `房子 ${id} 的数据不对` });
      const e = {};
      if (o.dx != null) { if (!num(o.dx, -2000, 2000)) return res.status(400).json({ error: `${id}.dx 不对` }); e.dx = Math.round(o.dx); }
      if (o.dy != null) { if (!num(o.dy, -2000, 2000)) return res.status(400).json({ error: `${id}.dy 不对` }); e.dy = Math.round(o.dy); }
      for (const k of ['cdx', 'cdy']) if (o[k] != null) { if (!num(o[k], -2000, 2000)) return res.status(400).json({ error: `${id}.${k} 不对` }); e[k] = Math.round(o[k]); }
      for (const k of ['closed', 'open']) if (o[k] != null) { if (!num(o[k], 0.3, 3)) return res.status(400).json({ error: `${id}.${k} 不对` }); e[k] = Math.round(o[k] * 100) / 100; }
      out[id] = e;
    }
    const { writeFile } = await import('node:fs/promises');
    const file = `src/shared/maps/${map}-layout.js`;
    const head = '// 黯月初升 7 间能进的房子的手动微调（在 http://localhost:3001/?preview=layout 里拖、拉滑块，点保存就写回这个文件）。\n'
      + '// dx / dy：房子中心挪多少（世界坐标，放大以后的；室内图和能走的地面跟着挪）；cdx / cdy：外观图再单独挪多少；\n'
      + '// closed：外观缩放；open：室内缩放（走得到的地面也跟着缩放）。\n';
    await writeFile(path.resolve(file), `${head}export default ${JSON.stringify(out, null, 2)};\n`);
    res.json({ ok: true, path: file });
  });
  app.post('/api/dev/guide/:name', express.raw({ type: 'image/png', limit: '40mb' }), async (req, res) => {
    const name = String(req.params.name);
    if (!/^[a-z0-9-]{1,60}$/.test(name) || !req.body?.length) return res.status(400).json({ error: '文件名不对' });
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = path.resolve('design/guides');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${name}.png`), req.body);
    res.json({ ok: true, path: `design/guides/${name}.png` });
  });
}
console.log(ttsEnabled ? `🔊 AI 房主配音：Azure ${process.env.AZURE_TTS_VOICE || 'zh-CN-YunfengNeural'}` : '🔈 没配 AZURE_SPEECH_KEY：旁白用各人设备自带的语音');

// 客户端进入时卡住/出错会报过来（限长度、限频率）
const clientLogs = new Map();
app.post('/api/clientlog', express.json({ type: () => true, limit: '4kb' }), (req, res) => {
  const ip = req.headers['cf-connecting-ip'] ?? req.ip;
  const n = (clientLogs.get(ip) ?? 0) + 1;
  clientLogs.set(ip, n);
  if (n <= 20) {
    const b = req.body ?? {};
    console.log(`⚠️ [进入] ${String(b.stage).slice(0, 40)}：${String(b.error).slice(0, 300)} · ${b.t}ms · ${String(b.ua).slice(0, 160)}`);
  }
  res.status(204).end();
});
setInterval(() => clientLogs.clear(), 10 * 60_000).unref();

app.get('/api/config', (_req, res) => res.json({ clientId: DISCORD_CLIENT_ID ?? null, devLogin: DEV_LOGIN }));

app.post('/api/token', async (req, res) => {
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code: String(req.body?.code ?? ''),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.log(`⚠️ [登录] token 交换失败 ${r.status} ${data.error ?? ''} ${data.error_description ?? ''}`);
      return res.status(r.status === 429 || r.status >= 500 ? 503 : 400).json({ error: data.error_description ?? `token 交换失败（${r.status}）` });
    }
    res.json({ access_token: data.access_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const dist = path.resolve('client/dist');
// 前端版本：index.html 里引用的打包文件名每次构建都会变；客户端重连时发现变了就提示刷新
const BUILD = (() => { try { return fs.readFileSync(path.join(dist, 'index.html'), 'utf8').match(/assets\/index-([\w-]+)\.js/)?.[1] ?? 'dev'; } catch { return 'dev'; } })();
app.use(express.static(dist));
// 找不到的 /assets/ 文件直接 404（不要回首页 HTML，不然旧页面加载新版本里已删掉的模块时会报 MIME 错误）
app.get(/^\/(?!api\/|assets\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

// ───────────── 用户身份 ─────────────
async function discordUser(token, guildId) {
  const auth = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) };
  const r = await fetch('https://discord.com/api/v10/users/@me', auth);
  if (!r.ok) { console.log(`⚠️ [登录] users/@me ${r.status}`); throw new Error(`Discord 登录已失效（${r.status}），请重新打开活动`); }
  const u = await r.json();
  let nick = null; let guildAvatar = null;
  if (guildId) {
    const m = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, { ...auth, signal: AbortSignal.timeout(5000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    nick = m?.nick ?? null;
    guildAvatar = m?.avatar ? `/cdn/guilds/${guildId}/users/${u.id}/avatars/${m.avatar}.png?size=96` : null;
  }
  return {
    id: u.id,
    name: (nick ?? u.global_name ?? u.username).slice(0, 24),
    // 头像走 URL 映射 /cdn → cdn.discordapp.com（Activity 里不能直接访问外部域名）
    avatar: guildAvatar ?? (u.avatar ? `/cdn/avatars/${u.id}/${u.avatar}.png?size=96` : null),
  };
}

// ───────────── 房间与 WebSocket ─────────────
const rooms = new Map();   // "guild:channel" → Room
const sockets = new Map(); // Room → Set<ws>

function broadcast(room) {
  for (const ws of sockets.get(room) ?? []) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'state', state: room.viewFor(ws.uid) }));
  }
}

/** 走路只推一个人的位置，不推整份状态。 */
function broadcastPos(room, id, move) {
  const raw = JSON.stringify({ type: 'pos', id, move, now: Date.now() });
  for (const ws of sockets.get(room) ?? []) if (ws.readyState === ws.OPEN) ws.send(raw);
}

/**
 * 活动如果是从语音频道启动的，它就绑在那个语音频道上：机器人把谁拉去别的频道，谁的活动就会被 Discord 关掉。
 * 这种情况下不再拉人换频道（进房子、私聊、集合都只在小程序里生效），并提醒大家改从文字频道启动。
 */
function guardMoves(voice, channelId, room) {
  let bound = null; // null = 还没查到（机器人还没登录好时查不到，下次要拉人前再查）
  const check = async () => {
    if (bound === null) {
      bound = await voice.isVoiceChannel(channelId).catch(() => null);
      if (bound) {
        room.announce('这局是从语音频道里启动的：机器人一拉人换频道，被拉的人就会掉出小程序，所以进房子、私聊都不会切语音。想要房子里真的私聊，请大家关掉活动，从文字频道输入框旁的应用启动器重新打开。', 'clock');
        room.changed();
      }
    }
    return bound === true;
  };
  check();
  const skip = (name, ret) => async (...args) => ((await check()) ? ret : voice[name](...args));
  return { ...voice, openRoom: skip('openRoom', null), addToRoom: skip('addToRoom'), removeFromRoom: skip('removeFromRoom'), closeRoom: skip('closeRoom'), moveAll: skip('moveAll'), move: skip('move', false) };
}

/**
 * 合作机器人的服务器：有人打开活动就告诉对方（活动没写 Discord 状态，对方看不出谁在玩）。
 * 对方据此建「血染钟楼专区」把人拉进专区广场。每个人在这个活动实例里只说一次（断线重连不再说）。
 */
function openForPartner(room, guildId, user) {
  room.partnerOpened ??= new Set();
  if (room.partnerOpened.has(user.id)) return;
  room.partnerOpened.add(user.id);
  partner.open(guildId, user.id).then((j) => {
    console.log(`🩸 ${user.name} 打开了活动，${PARTNER_NAME}：${j.zoned ? `已在专区广场 ${j.squareChannelId}` : `没进专区（${j.reason ?? '?'}）`}`);
  }).catch((e) => {
    room.partnerOpened.delete(user.id);
    console.warn(`[partner] open 失败：${e.message}`);
  });
}

const isKook = (guildId) => guildId.startsWith(KOOK_PREFIX);

/** 这一局用哪个机器人管语音：KOOK 的房间（服务器 id 带 kook- 前缀）用 KOOK 机器人，其余用 Discord 的。 */
function voiceFor(guildId, key) {
  if (guildId === 'dev') return null;
  if (isKook(guildId)) return kookHub?.forGuild(guildId.slice(KOOK_PREFIX.length), key) ?? null;
  if (PARTNER_GUILDS.has(guildId)) return partnerHub?.forGuild(guildId, key) ?? null;
  return hub?.forGuild(guildId, key) ?? null;
}

function roomFor(guildId, channelId, hostId) {
  const key = `${guildId}:${channelId}`;
  let room = rooms.get(key);
  if (!room) {
    const voice = voiceFor(guildId, key);
    room = new Room({ key, guildId, hostId, voice, onChange: (r) => { broadcast(r); saveSoon(r); } });
    if (voice) {
      voice.setScope(() => room.managedChannels()); // 只在本局的频道里闭麦、拉人
      // Discord 活动从语音频道启动时拉人会把人踢出活动；KOOK 是浏览器里玩的，没有这个问题
      room.voice = isKook(guildId) ? voice : guardMoves(voice, channelId, room);
    }
    room.onPos = (r, id, move) => { broadcastPos(r, id, move); saveSoon(r); };
    room.onEnded = archiveGame;
    room.history = { list: listGames, get: getGame, stats: statsFor };
    room.peers = () => rooms.values(); // 开局时查同一个语音频道有没有别的局
    rooms.set(key, room);
    sockets.set(room, new Set());
  }
  return room;
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const reply = (body) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type: 'ack', reqId: msg.reqId, ...body }));
    try {
      if (msg.type === 'hello') {
        let user;
        let ticket = null;
        if (msg.kook) {
          // KOOK：机器人发的进入链接（见 tickets.js）
          if (!TICKET_SECRET) throw new UserError('服务器没接 KOOK');
          try { ticket = verifyTicket(TICKET_SECRET, msg.kook); } catch (e) { throw new UserError(e.message); }
          user = { id: `${KOOK_PREFIX}${ticket.u}`, name: String(ticket.n || 'KOOK 玩家').slice(0, 24), avatar: ticket.a || null };
        } else if (msg.dev) {
          if (!DEV_LOGIN) throw new UserError('服务器没开 DEV_LOGIN');
          user = { id: `dev-${String(msg.dev.id).slice(0, 12)}`, name: String(msg.dev.name || '测试玩家').slice(0, 24), avatar: null };
          if (msg.dev.role) user.devRole = String(msg.dev.role).slice(0, 20); // 测试：开局把这个角色换给自己
        } else {
          user = await discordUser(msg.accessToken, msg.guildId);
        }
        const guildId = ticket ? `${KOOK_PREFIX}${ticket.g}` : msg.dev ? 'dev' : msg.guildId;
        const channelId = ticket ? String(ticket.c) : msg.dev ? String(msg.dev.table || 'table') : msg.channelId;
        if (!guildId || !channelId) throw new UserError('请在服务器频道里打开（私信里玩不了）');
        if (!msg.dev && !ticket) { // Discord 活动才有这个问题；KOOK 是浏览器里玩的
          const key = `${guildId}:${channelId}`;
          if (await voiceLaunchBlocked({ room: rooms.get(key), voice: voiceFor(guildId, key), channelId })) {
            throw new UserError(PARTNER_GUILDS.has(guildId) ? '请从钟楼专区的开局文字频道进入' : '请从文字频道进入');
          }
        }
        const room = roomFor(guildId, channelId, user.id);
        ws.uid = user.id;
        ws.room = room;
        sockets.get(room).add(ws);
        room.users.set(user.id, user);
        room.online.add(user.id);
        // 大厅里的人改了昵称/头像就同步一下
        const seat = room.lobby.find((p) => p.id === user.id);
        if (seat && !room.game) Object.assign(seat, { name: user.name, avatar: user.avatar });
        reply({ ok: true, user, build: BUILD });
        room.presence?.();
        broadcast(room);
        room.syncWatchMute?.().catch?.(() => {});
        if (partner && PARTNER_GUILDS.has(guildId)) openForPartner(room, guildId, user);
        if (!msg.dev) console.log(`👤 ${user.name} 进入 ${guildId}:${channelId}（${room.game ? '游戏中' : '大厅'}）`);
        return;
      }
      // 新手教程：把这个连接切到一个只有自己和机器人的练习局；退出时切回原来的房间
      if (msg.type === 'tutorial') {
        if (!ws.uid) throw new UserError('还没连上房间');
        const leave = (room) => { sockets.get(room)?.delete(ws); if (![...(sockets.get(room) ?? [])].some((x) => x.uid === ws.uid)) room.online.delete(ws.uid); };
        if (msg.on) {
          if (ws.room?.tutorial) { reply({ ok: true }); return; }
          ws.home = ws.room;
          leave(ws.room);
          ws.home?.presence?.();
          broadcast(ws.home);
          const old = rooms.get(`tutorial:${ws.uid}`);
          if (old) { await old.teardown(); rooms.delete(old.key); sockets.delete(old); }
          const tut = await startTutorial(ws.home.users.get(ws.uid) ?? { id: ws.uid, name: '你', avatar: null }, (r) => broadcast(r));
          tut.onPos = broadcastPos;
          rooms.set(tut.key, tut);
          sockets.set(tut, new Set([ws]));
          ws.room = tut;
          broadcast(tut);
        } else if (ws.room?.tutorial) {
          const tut = ws.room;
          await tut.teardown();
          rooms.delete(tut.key); sockets.delete(tut);
          ws.room = ws.home;
          if (ws.room) { sockets.get(ws.room)?.add(ws); ws.room.online.add(ws.uid); ws.room.presence?.(); broadcast(ws.room); }
        }
        reply({ ok: true });
        return;
      }
      if (msg.type === 'act') {
        if (!ws.room) throw new UserError('还没连上房间');
        const result = await ws.room.act(ws.uid, msg.action, msg.payload ?? {});
        reply({ ok: true, ...(result ?? {}) });
      }
    } catch (e) {
      if (!(e instanceof UserError) && !/^[^\x00-\x7F]/.test(e.message)) console.error('[botc]', e);
      reply({ ok: false, error: e.message });
    }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (room.tutorial) {
      room.teardown().catch(() => {});
      rooms.delete(room.key); sockets.delete(room);
      if (ws.home) { ws.home.online.delete(ws.uid); ws.home.presence?.(); broadcast(ws.home); }
      return;
    }
    const set = sockets.get(room);
    set.delete(ws);
    if (![...set].some((x) => x.uid === ws.uid)) room.online.delete(ws.uid);
    room.presence?.();
    room.syncWatchMute?.().catch?.(() => {});
    broadcast(room);
  });
});

// 心跳：清掉断线的连接
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

// 没人在线且没开局的房间，过一阵清掉
setInterval(() => {
  for (const [key, room] of rooms) {
    if (room.online.size === 0 && (!room.game || room.ended)) {
      room.teardown().catch(() => {});
      rooms.delete(key);
      sockets.delete(room);
    }
  }
}, 10 * 60_000);

// ───────────── 读档：服务器重启前没打完的局接着玩 ─────────────
for (const snap of loadAll()) {
  const [guildId, ...rest] = snap.key.split(':');
  const room = roomFor(guildId, rest.join(':'), snap.hostId);
  room.restore(snap);
  const live = room.game && !room.ended;
  console.log(`💾 读回存档 ${snap.key}${live ? `（第${room.game.day}天 / 第${room.game.night}夜，进行中）` : ''}`);
  // 语音相关的恢复（夜里重新闭耳等）要等机器人登录好
  // 暂停着的局（真人全走了）不接着跑，等有人回来；接着跑的局几分钟内没人回来也会暂停
  if (live) (guildId === 'dev' ? Promise.resolve() : isKook(guildId) ? kookReady : PARTNER_GUILDS.has(guildId) ? partnerReady : botReady).then(() => { room.resume(); room.presence(); room.changed(); });
}

// 关服（部署、launchd 重启）前把没写完的存档写掉
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flushAll(); process.exit(0); });

server.listen(PORT, () => console.log(`🕰️ 血染钟楼 Activity 服务已启动：http://localhost:${PORT}${DEV_LOGIN ? '（已开启 DEV_LOGIN，可直接用浏览器测试）' : ''}`));
