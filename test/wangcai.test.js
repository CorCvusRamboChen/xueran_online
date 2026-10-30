// 合作机器人代管语音（旺财）：我们这边的 partner.js ⇄ 对方要装的 integrations/wangcai/botc-voice.js，
// 中间走真的 HTTP（本机端口），Discord 用假的客户端。验证整条链路和对方模块的安全边界。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createBotcVoice } from '../integrations/wangcai/botc-voice.js';
import { partnerPlatform } from '../src/server/partner.js';
import { VoiceHub } from '../src/server/voice.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'botc-wc-'));

/** 假的 Discord：一个服务器 g，语音频道 square（在分组 cat 下）、other，用户 a、b 在广场，c 在 other。 */
function fakeDiscord() {
  const client = new EventEmitter();
  client.user = { id: 'wangcai' };
  const states = new Map(); // 用户 → { channelId, serverMute, serverDeaf }
  const channels = new Map();
  const mkChannel = (id, parentId = 'cat') => {
    const ch = {
      id, parentId, overwrites: new Map(), deleted: false,
      isVoiceBased: () => true,
      get members() { return new Map([...states].filter(([, s]) => s.channelId === id).map(([u]) => [u, {}])); },
      permissionOverwrites: {
        edit: async (u, p) => { ch.overwrites.set(u, p); },
        delete: async (u) => { ch.overwrites.delete(u); },
      },
      delete: async () => { ch.deleted = true; channels.delete(id); },
    };
    channels.set(id, ch);
    return ch;
  };
  mkChannel('square'); mkChannel('other');
  let seq = 0;
  const guild = {
    id: 'g',
    roles: { everyone: { id: 'everyone' } },
    voiceStates: { cache: states },
    members: {
      async edit(id, patch) {
        const s = states.get(id);
        if (!s?.channelId) throw new Error('Target user is not connected to voice.');
        if ('mute' in patch) s.serverMute = patch.mute;
        if ('deaf' in patch) s.serverDeaf = patch.deaf;
        if (patch.channel) s.channelId = patch.channel;
      },
    },
    channels: {
      cache: channels,
      fetch: async (id) => channels.get(id) ?? null,
      create: async (o) => { const ch = mkChannel(`room${++seq}`, o.parent); ch.created = o; return ch; },
    },
  };
  client.guilds = { cache: new Map([['g', guild]]) };
  for (const [u, ch] of [['a', 'square'], ['b', 'square'], ['c', 'other']]) states.set(u, { channelId: ch, serverMute: false, serverDeaf: false });
  return { client, states, channels };
}

async function setup() {
  const d = fakeDiscord();
  const pushed = [];
  const wc = createBotcVoice({
    client: d.client, secret: 'shh', guildIds: ['g'], roomsFile: path.join(tmp(), 'rooms.json'), log: {},
    pushUrl: 'https://botc.example/api/partner/voice', fetch: async (_u, o) => { pushed.push(JSON.parse(o.body)); return { ok: true }; },
  });
  const server = wc.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  const platform = partnerPlatform({ url, token: 'shh', name: '旺财' });
  const hub = new VoiceHub(platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  return { ...d, wc, server, url, platform, hub, pushed };
}

test('旺财代管：夜里只闭广场里的人、天亮解开；私聊房间建在广场分组里、拉人、关房间送回广场再删', async () => {
  const t = await setup();
  try {
    const v = t.hub.forGuild('g', 'g:text');
    const scope = new Set(['square']);
    v.setScope(() => scope);
    await v.setAsleep(['a', 'b', 'c'], true, 'square');
    assert.deepEqual(['a', 'b', 'c'].map((u) => t.states.get(u).serverDeaf), [true, true, false], '别的频道的 c 不闭');
    await v.setAsleep(['a', 'b', 'c'], false, 'square');
    assert.equal(t.states.get('a').serverMute || t.states.get('a').serverDeaf, false);

    const room = await v.openRoom('私聊 · 1号 2号', ['a', 'c'], null, 'square');
    scope.add(room);
    const ch = t.channels.get(room);
    assert.equal(ch.created.parent, 'cat', '和广场同一个分组');
    assert.ok(ch.created.permissionOverwrites.some((o) => o.id === 'everyone' && o.deny.length), '别人看不到');
    assert.equal(t.states.get('a').channelId, room, '广场里的人拉进去了');
    assert.equal(t.states.get('c').channelId, 'other', '别的频道的人不拉');
    await v.addToRoom(room, 'b');
    assert.ok(ch.overwrites.has('b'));
    assert.equal(t.states.get('b').channelId, room);
    await v.closeRoom(room, 'square');
    assert.equal(t.states.get('a').channelId, 'square', '送回广场');
    assert.ok(ch.deleted, '房间删了');
  } finally { t.server.close(); }
});

test('旺财推来的语音状态：欠着的闭麦，人一进广场就补上', async () => {
  const t = await setup();
  try {
    const v = t.hub.forGuild('g', 'r');
    v.setScope(() => new Set(['square']));
    t.states.get('a').channelId = null; // a 夜里不在语音
    await v.setAsleep(['a'], true, 'square');
    assert.equal(t.states.get('a').serverDeaf, false);
    // a 进了广场：对方模块推状态 → 我们这边 push → 账上对一遍
    t.wc.start();
    const before = { channelId: null, serverMute: false, serverDeaf: false };
    t.states.get('a').channelId = 'square';
    t.client.emit('voiceStateUpdate', before, { guild: { id: 'g' }, id: 'a', ...t.states.get('a') });
    assert.deepEqual(t.pushed.at(-1), { guildId: 'g', userId: 'a', channelId: 'square', serverMute: false, serverDeaf: false });
    t.platform.push(t.pushed.at(-1));
    await new Promise((ok) => setTimeout(ok, 50));
    assert.equal(t.states.get('a').serverDeaf, true, '进来就补上闭耳');
  } finally { t.server.close(); }
});

test('对方模块的安全边界：密钥不对 401；别的服务器、别人的频道、不是语音频道的都不动', async () => {
  const t = await setup();
  try {
    const post = (body, token = 'shh') => fetch(`${t.url}/botc/voice`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal((await post({ op: 'ping' }, 'wrong')).status, 401);
    assert.deepEqual(await (await post({ op: 'ping' })).json(), { ok: true, botId: 'wangcai' });
    assert.equal((await (await post({ op: 'state', guildId: 'other-guild', userIds: ['a'] })).json()).error, 'guild_not_allowed');
    assert.equal((await (await post({ op: 'deleteChannel', guildId: 'g', channelId: 'square' })).json()).error, 'not_botc_room', '广场不是它建的，不能删');
    assert.ok(t.channels.has('square'));
    assert.equal((await (await post({ op: 'allow', guildId: 'g', channelId: 'other', userId: 'x' })).json()).error, 'not_botc_room');
    assert.equal((await (await post({ op: 'nuke' })).json()).error, 'unknown_op');
    assert.equal((await fetch(`${t.url}/rooms`, { method: 'POST' })).status, 404, '别的路径不归它管');
  } finally { t.server.close(); }
});

test('私聊房间表存盘：对方机器人重启后还认得自己建的房间、还能删', async () => {
  const d = fakeDiscord();
  const file = path.join(tmp(), 'rooms.json');
  const wc1 = createBotcVoice({ client: d.client, secret: 's', guildIds: ['g'], roomsFile: file, log: {} });
  const { channelId } = await wc1.ops.createRoom({ guildId: 'g', name: 'x', memberIds: ['a'], squareChannelId: 'square' });
  const wc2 = createBotcVoice({ client: d.client, secret: 's', guildIds: ['g'], roomsFile: file, log: {} });
  await wc2.ops.deleteChannel({ guildId: 'g', channelId });
  assert.ok(!d.channels.has(channelId));
});

test('旺财的 open / game：请求体照对方文档发', async () => {
  const sent = [];
  const platform = partnerPlatform({ url: 'http://wc', token: 't', fetch: async (_u, o) => { sent.push(JSON.parse(o.body)); return { json: async () => ({ ok: true, zoned: true, squareChannelId: 'sq' }) }; } });
  assert.equal((await platform.open('g', 'a')).squareChannelId, 'sq');
  await platform.game('g', { square: 'sq', active: true, speakerIds: ['a'], god: false, lock: true });
  await platform.game('g', { square: 'sq', active: false });
  assert.deepEqual(sent, [
    { op: 'open', guildId: 'g', userId: 'a' },
    { op: 'game', guildId: 'g', squareChannelId: 'sq', active: true, speakerIds: ['a'], god: false, lock: true },
    { op: 'game', guildId: 'g', squareChannelId: 'sq', active: false },
  ]);
});
