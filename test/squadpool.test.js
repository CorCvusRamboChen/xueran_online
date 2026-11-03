import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableCard, squadpoolSync } from '../src/server/squadpool.js';

const HOST = '111111111111';
const GUEST = '222222222222';

function lobbyRoom(over = {}) {
  return {
    guildId: 'g1', hostId: HOST, settings: { script: 'tb' }, partnerSquare: 'square-1', tutorial: false,
    lobby: [{ id: HOST, name: '房主', avatar: `/cdn/avatars/${HOST}/a.png?size=96` }, { id: GUEST, name: '客人', avatar: null }, { id: 'bot-1', name: '机器人1', fake: true }],
    users: new Map(), online: new Set([HOST, GUEST]), game: null, ended: false, ...over,
  };
}

function gameRoom(phase, over = {}) {
  const players = [{ id: HOST, name: '房主', dead: false }, { id: GUEST, name: '客人', dead: true }, { id: 'bot-1', name: '机器人1', dead: false }];
  return lobbyRoom({ game: { script: 'bmr', phase, night: 2, day: 3, players, visAlive: (p) => !p.dead }, ...over });
}

function fakeSite() {
  const calls = [];
  const site = { calls, status: {}, fetch: async (url, opts) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, body: JSON.parse(opts.body), token: opts.headers['X-Sync-Token'] });
    return { status: site.status[pathname] ?? 200 };
  } };
  return site;
}

test('大厅：报等人入座、只报真人、头像补全成 Discord 地址', () => {
  const card = tableCard(lobbyRoom());
  assert.equal(card.channelId, 'square-1');
  assert.deepEqual(card.state, { phase: 'lobby', round: 0, seats: 3, alive: 0, script: '暗流涌动' });
  assert.deepEqual(card.members.map((m) => m.discordUserId), [HOST, GUEST]);
  assert.equal(card.members[0].avatar, `https://cdn.discordapp.com/avatars/${HOST}/a.png?size=96`);
  assert.equal(card.host.discordUserId, HOST);
});

test('对局中：夜和天报各自的序号，存活数不算已公开死亡的人', () => {
  assert.deepEqual(tableCard(gameRoom('night')).state, { phase: 'night', round: 2, seats: 3, alive: 2, script: '黯月初升' });
  assert.equal(tableCard(gameRoom('day')).state.round, 3);
  assert.equal(tableCard(gameRoom('day', { ended: true })).state.phase, 'ended');
});

test('卡片内容里没有身份信息', () => {
  const room = gameRoom('night');
  room.game.players[0].role = 'imp';
  assert.ok(!JSON.stringify(tableCard(room)).includes('imp'));
});

test('不该有卡：没广场、教程、没人在线且没开局', () => {
  assert.equal(tableCard(lobbyRoom({ partnerSquare: undefined })), null);
  assert.equal(tableCard(lobbyRoom({ tutorial: true })), null);
  assert.equal(tableCard(lobbyRoom({ online: new Set() })), null);
  assert.notEqual(tableCard(gameRoom('day', { online: new Set() })), null); // 局还在就留着
  assert.equal(tableCard(gameRoom('day', { online: new Set(), paused: true })), null); // 读回来的暂停旧局不上卡
});

test('建卡一次，内容不变不重发，阶段变了只发状态', async () => {
  const site = fakeSite();
  const rooms = new Map([['r', gameRoom('night')]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test/', token: 'tok', rooms, guildIds: new Set(['g1']), fetch: site.fetch, log: {} });
  await sync.tick();
  assert.deepEqual(site.calls.map((c) => c.pathname), ['/api/discord-sync/rooms', '/api/discord-sync/rooms/square-1/members', '/api/discord-sync/rooms/square-1/state']);
  assert.equal(site.calls[0].token, 'tok');
  assert.equal(site.calls[0].body.game, '血染钟楼');
  await sync.tick();
  assert.equal(site.calls.length, 3);
  rooms.get('r').game.phase = 'day';
  await sync.tick();
  assert.deepEqual(site.calls.slice(3).map((c) => c.pathname), ['/api/discord-sync/rooms/square-1/state']);
});

test('重启后建卡 409 也算有卡；别的服务器的房间不报', async () => {
  const site = fakeSite();
  site.status['/api/discord-sync/rooms'] = 409;
  const rooms = new Map([['r', lobbyRoom()], ['other', lobbyRoom({ guildId: 'g2', partnerSquare: 'square-2' })]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms, guildIds: new Set(['g1']), fetch: site.fetch, log: {} });
  await sync.tick();
  assert.ok(site.calls.some((c) => c.pathname.endsWith('/square-1/state')));
  assert.ok(!site.calls.some((c) => JSON.stringify(c).includes('square-2')));
});

test('内容不变也每 30 分钟报一次成员，免得被网站当失联收卡', async () => {
  const site = fakeSite();
  let clock = 1_000_000;
  const rooms = new Map([['r', lobbyRoom()]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms, guildIds: new Set(['g1']), fetch: site.fetch, log: {}, now: () => clock });
  const beats = () => site.calls.filter((c) => c.pathname.endsWith('/members')).length;
  await sync.tick();
  assert.equal(beats(), 1);
  clock += 29 * 60_000;
  await sync.tick();
  assert.equal(beats(), 1);
  clock += 60_000;
  await sync.tick();
  assert.equal(beats(), 2);
  assert.equal(site.calls.filter((c) => c.pathname.endsWith('/state')).length, 1);
});

test('心跳发现卡没了（404）就重新建卡，状态也重发', async () => {
  const site = fakeSite();
  let clock = 1_000_000;
  const rooms = new Map([['r', lobbyRoom()]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms, guildIds: new Set(['g1']), fetch: site.fetch, log: {}, now: () => clock });
  await sync.tick();
  clock += 30 * 60_000;
  site.status['/api/discord-sync/rooms/square-1/members'] = 404;
  await sync.tick();
  delete site.status['/api/discord-sync/rooms/square-1/members'];
  await sync.tick();
  assert.equal(site.calls.filter((c) => c.pathname === '/api/discord-sync/rooms').length, 2);
  assert.equal(site.calls.filter((c) => c.pathname.endsWith('/state')).length, 2);
});

function fakeVoice(channels) {
  const voice = {
    channels: () => [...channels],
    people: {},
    members: async (guildId, channelId) => {
      if (voice.down) throw new Error('连不上');
      return voice.people[channelId] ?? [];
    },
    forget: (channelId) => channels.delete(channelId),
    profile: async (id) => (id === 'x' ? {} : { name: `名字${id.slice(0, 1)}`, avatar: '', bot: id === '333333333333' }),
  };
  return voice;
}

test('专区语音有人、没人打开活动也上卡，只报真人', async () => {
  const site = fakeSite();
  const voice = fakeVoice(new Map([['square-9', 'g1']]));
  voice.people['square-9'] = [HOST, '333333333333'];
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms: new Map(), guildIds: new Set(['g1']), voice, fetch: site.fetch, log: {} });
  await sync.tick();
  assert.equal(site.calls[0].body.channelId, 'square-9');
  assert.equal(site.calls[0].body.creator.discordUserId, HOST);
  assert.deepEqual(site.calls[1].body.members, [{ discordUserId: HOST, name: '名字1', avatar: '' }]);
  assert.deepEqual(site.calls[2].body, { phase: 'lobby', round: 0, seats: 1, alive: 0, script: '' });
});

test('语音走光：忘掉频道，一分钟后收卡', async () => {
  const site = fakeSite();
  let clock = 0;
  const channels = new Map([['square-9', 'g1']]);
  const voice = fakeVoice(channels);
  voice.people['square-9'] = [HOST];
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms: new Map(), guildIds: new Set(['g1']), voice, fetch: site.fetch, log: {}, now: () => clock });
  await sync.tick();
  voice.people['square-9'] = [];
  clock = 30_000;
  await sync.tick();
  assert.equal(channels.size, 0);
  assert.ok(!site.calls.some((c) => c.pathname.endsWith('/close')));
  clock = 61_000;
  await sync.tick();
  assert.equal(site.calls.filter((c) => c.pathname.endsWith('/square-9/close')).length, 1);
});

test('问不到语音时不收卡', async () => {
  const site = fakeSite();
  let clock = 0;
  const voice = fakeVoice(new Map([['square-9', 'g1']]));
  voice.people['square-9'] = [HOST];
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms: new Map(), guildIds: new Set(['g1']), voice, fetch: site.fetch, log: {}, now: () => clock });
  await sync.tick();
  voice.down = true;
  clock = 120_000;
  await sync.tick();
  assert.ok(!site.calls.some((c) => c.pathname.endsWith('/close')));
});

test('活动在报的广场、私聊房、别的服务器不走语音这条路', async () => {
  const site = fakeSite();
  const voice = fakeVoice(new Map([['square-1', 'g1'], ['private-1', 'g1'], ['square-2', 'g2']]));
  voice.people = { 'square-1': [GUEST], 'private-1': [GUEST], 'square-2': [GUEST] };
  const rooms = new Map([['r', lobbyRoom({ rooms: new Map([['private-1', {}]]) })]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms, guildIds: new Set(['g1']), voice, fetch: site.fetch, log: {} });
  await sync.tick();
  assert.deepEqual(site.calls.filter((c) => c.pathname === '/api/discord-sync/rooms').map((c) => c.body.channelId), ['square-1']);
  assert.equal(site.calls.find((c) => c.pathname.endsWith('/members')).body.members.length, 2); // 还是活动的名单，不是语音的
});

test('白天的房子不当成一桌：暂停的局里有人在房子，只有广场上卡', async () => {
  const site = fakeSite();
  const voice = fakeVoice(new Map([['house-1', 'g1'], ['square-1', 'g1']]));
  voice.people = { 'house-1': [GUEST], 'square-1': [HOST] };
  const room = gameRoom('day', { online: new Set(), paused: true, square: 'square-1', managedChannels: () => new Set(['square-1', 'house-1']) });
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms: new Map([['r', room]]), guildIds: new Set(['g1']), voice, fetch: site.fetch, log: {} });
  await sync.tick();
  assert.deepEqual(site.calls.filter((c) => c.pathname === '/api/discord-sync/rooms').map((c) => c.body.channelId), ['square-1']);
});

test('人走光一分钟才收卡，中途回来不收', async () => {
  const site = fakeSite();
  let clock = 0;
  const room = lobbyRoom();
  const rooms = new Map([['r', room]]);
  const sync = squadpoolSync({ baseUrl: 'https://site.test', token: 't', rooms, guildIds: new Set(['g1']), fetch: site.fetch, log: {}, now: () => clock });
  await sync.tick();
  rooms.clear();
  clock = 30_000;
  await sync.tick();
  assert.ok(!site.calls.some((c) => c.pathname.endsWith('/close')));
  rooms.set('r', room);
  clock = 40_000;
  await sync.tick();
  rooms.clear();
  clock = 101_000;
  await sync.tick();
  assert.equal(site.calls.filter((c) => c.pathname.endsWith('/square-1/close')).length, 1);
  await sync.tick();
  assert.equal(site.calls.filter((c) => c.pathname.endsWith('/close')).length, 1);
});
