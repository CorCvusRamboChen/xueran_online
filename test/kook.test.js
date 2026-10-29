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
  const handlers = {
    'GET /user/me': () => ({ id: 'BOT', username: '血染机器人', identify_num: '0001' }),
    'GET /channel-user/get-joined-channel': (q) => ({ items: voice.get(q.user_id) ? [{ id: voice.get(q.user_id) }] : [] }),
    'GET /guild-mute/list': () => ({ mic: { type: 1, user_ids: [...mic] }, headset: { type: 2, user_ids: [...headset] } }),
    'POST /guild-mute/create': (b) => { (b.type === 1 ? mic : headset).add(b.user_id); return []; },
    'POST /guild-mute/delete': (b) => { (b.type === 1 ? mic : headset).delete(b.user_id); return []; },
    'POST /channel/move-user': (b) => { for (const u of b.user_ids) { if (!voice.get(u)) throw new Error('用户不在语音'); voice.set(u, b.target_id); } return []; },
    'GET /channel/view': (q) => { const c = channels.get(q.target_id); if (!c) throw new Error('频道不存在'); return c; },
    'POST /channel/create': (b) => { const c = { id: `room${++seq}`, guild_id: b.guild_id, parent_id: b.parent_id ?? '', type: b.type }; channels.set(c.id, c); return c; },
    'POST /channel/delete': (b) => { channels.delete(b.channel_id); return []; },
    'GET /channel/user-list': (q) => [...voice].filter(([, ch]) => ch === q.channel_id).map(([id]) => ({ id })),
    'POST /channel-role/create': () => ({}),
    'POST /channel-role/update': (b) => b,
    'POST /channel-role/delete': () => [],
    'GET /user/view': (q) => ({ id: q.user_id, username: 'xiaoming', nickname: '小明', avatar: 'https://img.kookapp.cn/a.png' }),
    'POST /message/create': () => ({ msg_id: 'm1' }),
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
  return { fetch, calls, voice, mic, headset, channels };
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
  const sent = k.calls.filter(([key]) => key === 'POST /message/create').at(-1)[1];
  assert.equal(sent.temp_target_id, 'A', '临时消息：只有点按钮的人看得到');
  assert.equal(sent.target_id, 'text');
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
