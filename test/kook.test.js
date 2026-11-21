// KOOK 版：进入链接的签名、KOOK 语音接口接到闭麦账上、机器人的「/血染」和领链接按钮。
// 用一个假的 KOOK HTTP 接口（记下每次调用），不连真服务器。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signTicket, verifyTicket } from '../src/server/tickets.js';
import { KookBot } from '../src/server/kook.js';
import { VoiceHub } from '../src/server/voice.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'botc-kook-'));

test('进入链接：验签通过拿回身份；改过的、过期的、别的密钥签的都不认', () => {
  const t = signTicket('s1', { g: 'G', c: 'C', u: 'U', n: '小明', a: null }, 1000);
  const p = verifyTicket('s1', t, 2000);
  assert.deepEqual([p.g, p.c, p.u, p.n], ['G', 'C', 'U', '小明']);
  assert.throws(() => verifyTicket('s2', t, 2000), /不对/);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), u: 'ADMIN' })).toString('base64url');
  assert.throws(() => verifyTicket('s1', `${forged}.${sig}`, 2000), /不对/);
  assert.throws(() => verifyTicket('s1', t, 1000 + 13 * 3600_000), /过期/);
  assert.throws(() => verifyTicket('s1', 'garbage', 2000), /不完整/);
});

/** 假的 KOOK：语音状态、闭麦名单、频道都在内存里。 */
function fakeKook() {
  const calls = [];
  const voice = new Map([['A', 'square'], ['B', 'square'], ['C', 'other']]); // 用户 → 所在语音频道
  const mic = new Set(); const headset = new Set();
  const channels = new Map([['square', { id: 'square', guild_id: 'G', parent_id: 'cat', type: 2 }], ['text', { id: 'text', guild_id: 'G', type: 1 }]]);
  let seq = 0;
  const messages = new Map();
  const roles = [];
  const handlers = {
    'GET /user/me': () => ({ id: 'BOT', username: '血染机器人', identify_num: '0001' }),
    'GET /channel-user/get-joined-channel': (q) => ({ items: voice.get(q.user_id) ? [{ id: voice.get(q.user_id) }] : [] }),
    'GET /guild-mute/list': () => ({ mic: { type: 1, user_ids: [...mic] }, headset: { type: 2, user_ids: [...headset] } }),
    'POST /guild-mute/create': (b) => { (b.type === 1 ? mic : headset).add(b.user_id); return []; },
    'POST /guild-mute/delete': (b) => { (b.type === 1 ? mic : headset).delete(b.user_id); return []; },
    'POST /channel/move-user': (b) => { for (const u of b.user_ids) { if (!voice.get(u)) throw new Error('用户不在语音'); voice.set(u, b.target_id); } return []; },
    'GET /channel/view': (q) => { const c = channels.get(q.target_id); if (!c) throw new Error('频道不存在'); return c; },
    'POST /channel/create': (b) => { const c = { id: `room${++seq}`, guild_id: b.guild_id, name: b.name, parent_id: b.parent_id ?? '', type: b.is_category ? 0 : b.type ?? 1, is_category: !!b.is_category }; channels.set(c.id, c); return c; },
    'GET /guild/view': () => ({ id: 'G', user_id: 'OWNER', roles: [{ role_id: 7, permissions: 32 }, { role_id: 8, permissions: 2048 }], channels: [...channels.values()] }),
    'POST /channel/update': (b) => { const c = channels.get(b.channel_id); if (!c) throw new Error('频道不存在'); for (const k of ['name', 'parent_id', 'level', 'topic']) if (k in b) c[k] = b[k]; return c; },
    'POST /channel-role/update': (b) => { roles.push(b); return b; },
    'POST /message/update': (b) => { if (!messages.has(b.msg_id)) throw new Error('消息不存在'); messages.set(b.msg_id, b.content); return []; },
    'POST /channel/delete': (b) => { channels.delete(b.channel_id); return []; },
    'GET /channel/user-list': (q) => [...voice].filter(([, ch]) => ch === q.channel_id).map(([id]) => ({ id })),
    'POST /channel-role/create': () => ({}),
    'POST /channel-role/delete': () => [],
    'GET /user/view': (q) => ({ id: q.user_id, username: 'xiaoming', nickname: '小明', avatar: 'https://img.kookapp.cn/a.png', roles: q.user_id === 'MOD' ? [7] : [8] }),
    'POST /message/create': (b) => { const id = `m${++seq}`; messages.set(id, b.content); return { msg_id: id }; },
  };
  const fetch = async (url, opts) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/api\/v3/, '');
    const key = `${opts.method} ${p}`;
    const args = opts.method === 'GET' ? Object.fromEntries(u.searchParams) : JSON.parse(opts.body);
    calls.push([key, args]);
    const h = handlers[key];
    let body;
    try { body = { code: 0, message: 'ok', data: h ? h(args) : [] }; } catch (e) { body = { code: 40000, message: e.message }; }
    return { status: 200, json: async () => body };
  };
  return { fetch, calls, voice, mic, headset, channels, messages, roles };
}

class NoWS { constructor() { this.readyState = 0; } on() {} send() {} terminate() {} }

async function mkBot(k) {
  const bot = new KookBot({ token: 't', publicUrl: 'https://botc.example/', ticketSecret: 'sec', fetch: k.fetch, WS: NoWS });
  bot.me = { id: 'BOT' };
  return bot;
}

test('KOOK 语音：夜里只闭广场里的人（麦和耳机两种），天亮解开；别的频道的人不动', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  const hub = new VoiceHub(bot.platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  const v = hub.forGuild('G', 'kook-G:text');
  v.setScope(() => new Set(['square']));
  await v.setAsleep(['kook-A', 'kook-B', 'kook-C'], true, 'square');
  assert.deepEqual([...k.mic].sort(), ['A', 'B']);
  assert.deepEqual([...k.headset].sort(), ['A', 'B']);
  await v.setAsleep(['kook-A', 'kook-B', 'kook-C'], false, 'square');
  assert.equal(k.mic.size + k.headset.size, 0, '天亮全部解开');
});

test('KOOK 语音：管理员事先闭了麦的人，机器人不闭也不解', async () => {
  const k = fakeKook();
  k.mic.add('A');
  const bot = await mkBot(k);
  const hub = new VoiceHub(bot.platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  const v = hub.forGuild('G', 'r');
  v.setScope(() => new Set(['square']));
  await v.setMuted(['kook-A'], true, 'speech');
  await v.setMuted(['kook-A'], false, 'speech');
  assert.ok(k.mic.has('A'), '别人闭上的麦还在');
});

test('KOOK 私聊房间：建在广场同一个分组里，先给人开权限再对全体成员关掉，拉进去；关房间时送回广场再删', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  const hub = new VoiceHub(bot.platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  const v = hub.forGuild('G', 'r');
  const scope = new Set(['square']);
  v.setScope(() => scope);
  const ch = await v.openRoom('私聊', ['kook-A', 'kook-C'], null, 'square');
  scope.add(ch);
  const create = k.calls.find(([key]) => key === 'POST /channel/create')[1];
  assert.equal(create.type, 2);
  assert.equal(create.parent_id, 'cat');
  const roles = k.calls.filter(([key]) => key === 'POST /channel-role/update').map(([, b]) => `${b.type}:${b.value}`);
  assert.deepEqual(roles, ['user_id:BOT', 'user_id:A', 'user_id:C', 'role_id:0'], '机器人和成员先开，最后关全体');
  assert.ok(k.calls.find(([key, b]) => key === 'POST /channel-role/update' && b.value === '0').at(1).deny & 2048, '全体成员看不到');
  assert.equal(k.voice.get('A'), ch, '广场里的人拉进去了');
  assert.equal(k.voice.get('C'), 'other', '在别的频道聊天的人不拉');
  await v.closeRoom(ch, 'square');
  assert.equal(k.voice.get('A'), 'square', '送回广场');
  assert.ok(!k.channels.has(ch), '房间删了');
});

test('KOOK 机器人：「/血染」发开局卡片；点按钮只给本人发一条带门票的临时消息', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  await bot.onEvent({ type: 9, channel_type: 'GROUP', target_id: 'text', author_id: 'A', content: '/血染', extra: { guild_id: 'G', author: { bot: false } } });
  const launch = k.calls.filter(([key]) => key === 'POST /message/create');
  assert.equal(launch.length, 1);
  assert.equal(launch[0][1].type, 10);
  assert.match(launch[0][1].content, /botc-join/);
  // 别的话不理
  await bot.onEvent({ type: 1, channel_type: 'GROUP', target_id: 'text', author_id: 'A', content: '今晚玩血染吗', extra: { guild_id: 'G' } });
  assert.equal(k.calls.filter(([key]) => key === 'POST /message/create').length, 1);

  await bot.onEvent({ type: 255, channel_type: 'PERSON', target_id: 'A', extra: { type: 'message_btn_click', body: { value: 'botc-join', user_id: 'A', target_id: 'text', msg_id: 'm1', user_info: { username: 'xiaoming' } } } });
  const wait = k.calls.filter(([key]) => key === 'POST /message/create').at(-1)[1];
  assert.equal(wait.temp_target_id, 'A', '临时消息：只有点按钮的人看得到');
  assert.equal(wait.target_id, 'text');
  assert.match(wait.content, /正在生成/, '先马上回一条「正在生成」');
  const sent = k.calls.filter(([key]) => key === 'POST /message/update').at(-1)[1];
  assert.equal(sent.temp_target_id, 'A');
  assert.equal(k.messages.get(sent.msg_id), sent.content, '生成好了把那一条改成链接');
  const url = JSON.parse(sent.content)[0].modules.find((m) => m.type === 'action-group').elements[0].value;
  assert.match(url, /^https:\/\/botc\.example\/\?kt=/);
  const p = verifyTicket('sec', new URL(url).searchParams.get('kt'));
  assert.deepEqual([p.g, p.c, p.u, p.n, p.a], ['G', 'text', 'A', '小明', 'https://img.kookapp.cn/a.png']);
});

test('KOOK 语音事件：有人进出语音频道，账上欠着的马上对一遍', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  const hub = new VoiceHub(bot.platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  const v = hub.forGuild('G', 'r');
  v.setScope(() => new Set(['square']));
  k.voice.delete('A'); // A 夜里不在语音
  await v.setAsleep(['kook-A'], true, 'square');
  assert.ok(!k.mic.has('A'));
  k.voice.set('A', 'square'); // 进了广场
  await bot.onEvent({ type: 255, channel_type: 'GROUP', target_id: 'G', extra: { type: 'joined_channel', body: { user_id: 'A', channel_id: 'square' } } });
  await new Promise((ok) => setTimeout(ok, 30));
  assert.ok(k.mic.has('A') && k.headset.has('A'), '进来就补上闭麦闭耳');
});

test('KOOK 网关：等 HELLO，事件按 sn 去重转发，握手失败断开重连', async () => {
  const { KookGateway } = await import('../src/server/kook.js');
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.OPEN = 1; this.readyState = 1; this.sent = []; this.h = {}; sockets.push(this); }
    on(ev, fn) { this.h[ev] = fn; }
    send(s) { this.sent.push(JSON.parse(s)); }
    terminate() { this.readyState = 3; this.h.close?.(); }
    push(m) { this.h.message(Buffer.from(JSON.stringify(m))); }
  }
  const api = { get: async (p, q) => { assert.equal(p, '/gateway/index'); assert.equal(q.compress, 0); return { url: 'wss://gw' }; } };
  const gw = new KookGateway(api, { WS: FakeWS });
  const events = []; let hellos = 0;
  gw.on('event', (d) => events.push(d.n));
  gw.on('hello', () => { hellos++; });
  await gw.connect();
  const ws = sockets[0];
  ws.push({ s: 1, d: { code: 0, session_id: 'x' } });
  assert.equal(hellos, 1);
  ws.push({ s: 0, sn: 1, d: { n: 'a' } });
  ws.push({ s: 0, sn: 2, d: { n: 'b' } });
  ws.push({ s: 0, sn: 2, d: { n: 'b-again' } }); // 重发的不再处理
  assert.deepEqual(events, ['a', 'b']);
  gw.stop();
  // 握手失败：断开（stop 以后不再重连）
  const gw2 = new KookGateway(api, { WS: FakeWS });
  await gw2.connect();
  gw2.stopped = true;
  sockets.at(-1).push({ s: 1, d: { code: 40101 } });
  assert.equal(sockets.at(-1).readyState, 3);
});

const say = (bot, author, content, ch = 'text') => bot.onEvent({ type: 9, channel_type: 'GROUP', target_id: ch, author_id: author, content, extra: { guild_id: 'G', author: { bot: false } } });

test('KOOK 布置桌子：只有服务器主 / 频道管理能布置；每桌一个分组（文字 + 广场语音）、各发一张开局卡片，说明频道有桌子一览', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  await say(bot, 'NOBODY', '/血染 布置 3');
  assert.ok(!k.calls.some(([key]) => key === 'POST /channel/create'), '普通成员不能布置');
  await say(bot, 'MOD', '/血染 布置 3');
  const lay = bot.layout.get('G');
  assert.equal(lay.tables.length, 3);
  for (const t of lay.tables) {
    assert.equal(k.channels.get(t.category).is_category, true);
    assert.equal(k.channels.get(t.text).parent_id, t.category);
    assert.equal(k.channels.get(t.voice).parent_id, t.category);
    assert.equal(k.channels.get(t.voice).type, 2);
    assert.equal(bot.squareFor('G', t.text), t.voice);
  }
  assert.match(k.channels.get(lay.tables[1].voice).name, /2号桌·广场/);
  const cards = k.calls.filter(([key, b]) => key === 'POST /message/create' && b.type === 10 && /botc-join/.test(b.content)).map(([, b]) => b.target_id);
  assert.deepEqual(cards, lay.tables.map((t) => t.text), '每一桌的文字频道一张开局卡片');
  assert.match(k.messages.get(lay.hub.boardMsg), /桌子一览/);
  assert.equal(k.calls.find(([key, b]) => key === 'POST /message/create' && b.content.includes('桌子一览'))[1].target_id, lay.hub.board);
  assert.match(k.messages.get(lay.hub.boardMsg), /1号桌.*空着/);

  // 再发一次：不重复建；删掉的频道补回来
  const before = k.calls.filter(([key]) => key === 'POST /channel/create').length;
  k.channels.delete(lay.tables[0].voice);
  await say(bot, 'OWNER', '/血染 布置');
  const made = k.calls.filter(([key]) => key === 'POST /channel/create').slice(before);
  assert.equal(made.length, 1, '只补被删掉的那个语音频道');
  assert.equal(bot.layout.get('G').tables.length, 3, '不写数字不减桌');
  await say(bot, 'OWNER', '/血染 加桌');
  assert.equal(bot.layout.get('G').tables.length, 4);
});

test('KOOK 桌子：广场固定是这一桌的语音频道（不看房主在哪）；桌子一览跟着房间状态改', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  await say(bot, 'OWNER', '/血染 布置 2');
  const [t1, t2] = bot.layout.get('G').tables;
  const hub = new VoiceHub(bot.platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0, pinnedSquare: (gid, key) => bot.squareFor(gid, key.slice(key.indexOf(':') + 1)) });
  assert.equal(await hub.forGuild('G', 'kook-G:' + t2.text).findSquare('kook-A', ['kook-A']), t2.voice, '房主 A 在别的语音，广场还是 2 号桌的');
  assert.equal(await hub.forGuild('G', 'kook-G:text').findSquare('kook-A', ['kook-A']), 'square', '不是布置好的桌子：照旧用房主所在的语音');

  bot.tableStatus = (gid, ch) => (ch === t1.text ? { state: 'game', day: 2, n: 8 } : { state: 'lobby', n: 3, host: '小明' });
  await bot.refreshBoard('G');
  const board = k.messages.get(bot.layout.get('G').hub.boardMsg);
  assert.match(board, /1号桌.*正在玩（第 2 天，8 人）/);
  assert.match(board, /2号桌.*大厅里 3 人，房主 小明/);
  const n = k.calls.length;
  await bot.refreshBoard('G');
  assert.equal(k.calls.length, n, '内容没变不改消息');
});

test('KOOK 桌子的进入链接：门票的频道是这一桌的文字频道，提醒进本桌广场', async () => {
  const k = fakeKook();
  const bot = await mkBot(k);
  await say(bot, 'OWNER', '/血染 布置 1');
  const [t] = bot.layout.get('G').tables;
  await bot.onEvent({ type: 255, channel_type: 'PERSON', target_id: 'A', extra: { type: 'message_btn_click', body: { value: 'botc-join', user_id: 'A', target_id: t.text, user_info: {} } } });
  const sent = k.calls.filter(([key]) => key === 'POST /message/update').at(-1)[1];
  assert.ok(sent.content.includes('1号桌·广场'), '提醒进本桌广场');
  assert.ok(!sent.content.includes(`(chn)${t.voice}(chn)`), '语音频道不能用 (chn) 提及：KOOK 显示成「频道已删除」');
  const url = JSON.parse(sent.content)[0].modules.find((m) => m.type === 'action-group').elements[0].value;
  assert.equal(verifyTicket('sec', new URL(url).searchParams.get('kt')).c, t.text);
});

test('KOOK 布置整个服务器：欢迎（只读）、社区、各桌三个分区；建服时默认的文字/语音频道收进社区，空掉的默认分组删掉', async () => {
  const k = fakeKook();
  for (const c of [
    { id: 'dcat1', name: '文字分组', is_category: true, type: 0, parent_id: '' },
    { id: 'dtext', name: '文字频道', type: 1, parent_id: 'dcat1' },
    { id: 'dcat2', name: '语音分组', is_category: true, type: 0, parent_id: '' },
    { id: 'dvoice', name: '语音频道', type: 2, parent_id: 'dcat2' },
  ]) k.channels.set(c.id, c);
  const bot = await mkBot(k);
  await say(bot, 'OWNER', '/血染 布置 2', 'dtext');
  const lay = bot.layout.get('G');
  assert.equal(lay.community.category, 'dcat1', '默认的文字分组改成社区');
  assert.equal(k.channels.get('dcat1').name, '💬 社区');
  assert.equal(lay.community.chat, 'dtext');
  assert.equal(k.channels.get('dtext').name, '💬 闲聊');
  assert.equal(lay.community.voice, 'dvoice');
  assert.equal(k.channels.get('dvoice').parent_id, 'dcat1', '默认语音频道搬进社区');
  assert.ok(!k.channels.has('dcat2'), '空掉的语音分组删了');
  for (const id of [lay.community.lfg, lay.community.replay, lay.community.feedback]) assert.equal(k.channels.get(id).parent_id, 'dcat1');
  for (const id of [lay.hub.welcome, lay.hub.announce, lay.hub.board]) {
    assert.equal(k.channels.get(id).parent_id, lay.hub.category);
    assert.ok(k.roles.some((r) => r.channel_id === id && r.type === 'role_id' && r.value === '0' && (r.deny & (1 << 12))), '全体成员不能发言');
    assert.ok(k.roles.some((r) => r.channel_id === id && r.type === 'user_id' && r.value === 'BOT' && (r.allow & (1 << 12))), '机器人能发');
  }
  const welcome = k.calls.filter(([key, b]) => key === 'POST /message/create' && b.target_id === lay.hub.welcome).map(([, b]) => b.content);
  assert.equal(welcome.length, 2, '欢迎 + 规则');
  assert.ok(welcome[0].includes(`(chn)${lay.hub.board}(chn)`));
  const order = [lay.hub.category, 'dcat1', ...lay.tables.map((t) => t.category)].map((id) => k.channels.get(id).level);
  assert.deepEqual(order, [1, 2, 3, 4], '欢迎、社区、各桌');

  // 再布置一次：什么都不新建，欢迎卡片不重发
  const n = k.calls.filter(([key]) => key === 'POST /channel/create').length;
  await say(bot, 'OWNER', '/血染 布置', 'dtext');
  assert.equal(k.calls.filter(([key]) => key === 'POST /channel/create').length, n);
  assert.equal(k.calls.filter(([key, b]) => key === 'POST /message/create' && b.target_id === lay.hub.welcome).length, 2);
  const cardIds = lay.tables.map((t) => t.card);
  assert.deepEqual(k.calls.filter(([key, b]) => key === 'POST /message/update' && cardIds.includes(b.msg_id)).map(([, b]) => b.msg_id), cardIds, '已经发出去的开局卡片改成最新写法，不重发');
  assert.ok(!k.messages.get(cardIds[0]).includes('(chn)' + lay.tables[0].voice), '开局卡片里语音频道只写名字');
});
