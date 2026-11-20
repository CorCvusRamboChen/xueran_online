// 语音闭麦的账：只在本局频道里闭、自己闭的一定解开、别人闭的不碰、重启和掉线后也能解开。
// 用一个假的 Discord 客户端（只有语音状态和 members.edit），不连真服务器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Events } from 'discord.js';
import { VoiceHub } from '../src/server/voice.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'botc-voice-'));

function fakeClient() {
  const client = new EventEmitter();
  const states = new Map(); // userId → { channelId, serverMute, serverDeaf }
  const edits = [];
  const guild = {
    id: 'g',
    voiceStates: { cache: states },
    members: {
      async edit(id, patch) {
        const vs = states.get(id);
        if (!vs?.channelId) throw new Error('Target user is not connected to voice.');
        edits.push([id, patch]);
        if ('mute' in patch) vs.serverMute = patch.mute;
        if ('deaf' in patch) vs.serverDeaf = patch.deaf;
        if (patch.channel) vs.channelId = patch.channel;
      },
    },
  };
  client.guilds = { cache: new Map([['g', guild]]) };
  const put = (id, channelId, extra = {}) => {
    const vs = { channelId, serverMute: false, serverDeaf: false, ...states.get(id), ...extra, channelId };
    states.set(id, vs);
    client.emit(Events.VoiceStateUpdate, null, { guild, id, ...vs });
  };
  return { client, states, edits, put };
}

const settle = () => new Promise((ok) => setTimeout(ok, 20));
const mk = (client, dir, roomAlive = () => true) => new VoiceHub(client, { roomAlive, file: path.join(dir, 'held.json'), oldFile: path.join(dir, 'asleep.json'), sweepMs: 0 });

test('只闭本局频道里的人：在别的语音频道聊天的人不闭、不拉', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square', 'house1']));
  put('a', 'square'); put('b', 'house1'); put('c', 'other');
  await v.setMuted(['a', 'b', 'c'], true, 'speech');
  assert.equal(states.get('a').serverMute, true);
  assert.equal(states.get('b').serverMute, true);
  assert.equal(states.get('c').serverMute, false, '在别的频道的人不闭麦');
  await v.setAsleep(['c'], true, 'square');
  assert.equal(states.get('c').serverDeaf, false, '夜里也不闭别的频道的人');
  await v.moveAll(['b', 'c'], 'square');
  assert.equal(states.get('b').channelId, 'square', '房子里的拉回广场');
  assert.equal(states.get('c').channelId, 'other', '别的频道的人不拉');
  await v.setMuted(['a', 'b', 'c'], false, 'speech');
  assert.equal(states.get('a').serverMute, false);
  assert.equal(states.get('b').serverMute, false);
});

test('闭着麦退出语音：解除先记着，他回到语音（哪个频道都行）时解开', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setMuted(['a'], true, 'speech');
  assert.equal(states.get('a').serverMute, true);
  put('a', null); // 退出语音
  await v.setMuted(['a'], false, 'speech'); // 发言结束：这时解不开
  assert.ok(hub.held.has('g:a'), '账上还欠着');
  put('a', 'elsewhere'); // 回来了，进的是别的频道
  await settle();
  assert.equal(states.get('a').serverMute, false, '回到语音就解开（服务器闭麦跟着人走，在哪都要解）');
  assert.ok(!hub.held.has('g:a'));
});

test('几个原因叠在一起：发言结束了但还是夜里 → 继续闭；天亮才解开', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setAsleep(['a'], true, 'square');
  await v.setMuted(['a'], true, 'speech');
  await v.setMuted(['a'], false, 'speech');
  assert.equal(states.get('a').serverMute, true);
  assert.equal(states.get('a').serverDeaf, true);
  await v.setAsleep(['a'], false, 'square');
  assert.equal(states.get('a').serverMute, false);
  assert.equal(states.get('a').serverDeaf, false);
});

test('管理员事先闭上的人：机器人不闭也不解', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square', { serverMute: true }); // 管理员闭的麦
  await v.setMuted(['a'], true, 'speech');
  await v.setMuted(['a'], false, 'speech');
  assert.equal(states.get('a').serverMute, true, '别人闭上的麦还在');
});

test('机器人不大过管理员：闭上的人被管理员手动解开，这一段不再闭；下一段照常', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setMuted(['a'], true, 'speech');
  await v.setAsleep(['a'], true, 'square');
  assert.equal(states.get('a').serverMute, true);
  put('a', 'square', { serverMute: false, serverDeaf: false }); // 管理员右键解开
  await settle();
  assert.equal(states.get('a').serverMute, false, '不再闭回去');
  assert.equal(states.get('a').serverDeaf, false);
  await v.setMuted(['a'], false, 'speech');
  await v.setAsleep(['a'], false, 'square');
  assert.ok(!hub.held.has('g:a'), '这一段结束，账清掉');
  await v.setMuted(['a'], true, 'speech');
  assert.equal(states.get('a').serverMute, true, '下一个人发言时照常闭');
});

test('提名换人发言：闭和解几乎同时到，正在发言的人不会被闭上，结束后没人留着闭麦', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  for (const id of ['a', 'b', 'c']) put(id, 'square');
  // 和 Room.speakOnly 一样不等上一次做完：a 陈述（闭 b、c）→ b 辩护（解 b、闭 a）→ 投票（全解）
  const accuse = v.setMuted(['b', 'c'], true, 'speech');
  const defend = Promise.all([v.setMuted(['b'], false, 'speech'), v.setMuted(['a'], true, 'speech')]);
  await Promise.all([accuse, defend]);
  assert.equal(states.get('b').serverMute, false, '辩护的人能说话');
  assert.equal(states.get('a').serverMute, true);
  assert.equal(states.get('c').serverMute, true);
  const vote = v.setMuted(['a', 'c'], false, 'speech');
  const next = v.setMuted(['c'], true, 'speech'); // 紧接着下一个提名
  await Promise.all([vote, next, v.setMuted(['c'], false, 'speech')]);
  for (const id of ['a', 'b', 'c']) assert.equal(states.get(id).serverMute, false, `${id} 没被留着闭麦`);
});

test('机器人重启：上次闭上的全部解开（读档的局会再闭该闭的人）；旧版 asleep.json 也认', async () => {
  const dir = tmp();
  const { client, states, put } = fakeClient();
  const hub = mk(client, dir);
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square'); put('b', 'square');
  await v.setMuted(['a'], true, 'speech');
  fs.writeFileSync(path.join(dir, 'asleep.json'), JSON.stringify(['g:b']));
  states.get('b').serverDeaf = true; states.get('b').serverMute = true;
  // "重启"：新的 hub 读账，登录好以后对一遍
  const hub2 = mk(client, dir);
  client.emit(Events.ClientReady);
  await settle();
  assert.equal(states.get('a').serverMute, false, '发言时被闭的人重启后解开了');
  assert.equal(states.get('b').serverDeaf, false, '旧版记的夜里闭耳也解开了');
  assert.equal(hub2.held.size, 0);
});

test('局没了（结束 / 暂停 / 房间被清掉）还挂着的闭麦：定时清理解开', async () => {
  const { client, states, put } = fakeClient();
  let alive = true;
  const hub = mk(client, tmp(), () => alive);
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setMuted(['a'], true, 'watch');
  await hub.sweep();
  assert.equal(states.get('a').serverMute, true, '局还在：不动');
  alive = false;
  await hub.sweep();
  assert.equal(states.get('a').serverMute, false, '局没了：解开');
});

test('语音归位自救：只留下现在该闭的原因，其余解开', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setMuted(['a'], true, 'speech'); // 卡住的发言闭麦
  await v.releaseMine('a', []);
  assert.equal(states.get('a').serverMute, false);
});

test('闭着麦跑去别的频道：先解开（不影响他在别处聊天），回到本局频道再闭上', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setAsleep(['a'], true, 'square');
  assert.equal(states.get('a').serverDeaf, true);
  put('a', 'other');
  await settle();
  assert.equal(states.get('a').serverDeaf, false, '在别的频道不闭耳');
  assert.equal(states.get('a').serverMute, false, '在别的频道不闭麦');
  put('a', 'square');
  await settle();
  assert.equal(states.get('a').serverDeaf, true, '回到广场，夜里还没过：重新闭上');
  await v.setAsleep(['a'], false, 'square');
  assert.equal(states.get('a').serverDeaf, false);
});

// 2026-11-20 用户：天亮只解开了闭麦，没解开闭耳。
test('漏掉一次状态变化：过时的「没闭耳」让账以为是管理员解开的；天亮照样把机器人闭的耳朵解开', async () => {
  const { client, states, put } = fakeClient();
  const hub = mk(client, tmp());
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  put('a', 'square');
  await v.setAsleep(['a'], true, 'square');
  assert.equal(states.get('a').serverDeaf, true);
  // 一条过时的状态（耳朵没闭）到了，之后真实状态（闭着）那一条没来
  states.get('a').serverDeaf = false;
  client.emit(Events.VoiceStateUpdate, null, { guild: client.guilds.cache.get('g'), id: 'a', ...states.get('a') });
  await settle();
  states.get('a').serverDeaf = true;
  await v.setAsleep(['a'], false, 'square');
  assert.equal(states.get('a').serverMute, false);
  assert.equal(states.get('a').serverDeaf, false, '闭耳也解开了');
  assert.ok(!hub.held.has('g:a'));
});

test('合作机器人的推送先后颠倒：账对不上时再问一次最新状态，不会把机器人闭的耳朵当成管理员解开的', async () => {
  const truth = new Map(); const cache = new Map(); const bus = new EventEmitter();
  const platform = {
    onReady() {}, onVoice: (fn) => bus.on('voice', fn), hasGuild: () => true,
    async state(_g, uid) { return { ...cache.get(uid) }; },
    async fresh(_g, uid) { cache.set(uid, { ...truth.get(uid) }); return { ...truth.get(uid) }; },
    async edit(_g, uid, patch) {
      const t = truth.get(uid);
      if ('mute' in patch) t.serverMute = patch.mute;
      if ('deaf' in patch) t.serverDeaf = patch.deaf;
      cache.set(uid, { ...t });
    },
  };
  const hub = new VoiceHub(platform, { file: path.join(tmp(), 'held.json'), oldFile: null, sweepMs: 0 });
  const v = hub.forGuild('g', 'room1');
  v.setScope(() => new Set(['square']));
  truth.set('a', { channelId: 'square', serverMute: false, serverDeaf: false }); cache.set('a', { ...truth.get('a') });
  await v.setAsleep(['a'], true, 'square');
  assert.deepEqual(truth.get('a'), { channelId: 'square', serverMute: true, serverDeaf: true });
  cache.set('a', { channelId: 'square', serverMute: true, serverDeaf: false }); // 晚到的旧推送
  bus.emit('voice', 'g', 'a');
  await settle();
  assert.equal(hub.held.get('g:a').deaf, true, '问过最新状态：耳朵还是机器人闭的');
  cache.set('a', { channelId: 'square', serverMute: true, serverDeaf: false }); // 天亮前缓存又是旧的
  await v.setAsleep(['a'], false, 'square');
  assert.deepEqual(truth.get('a'), { channelId: 'square', serverMute: false, serverDeaf: false }, '麦和耳朵都解开');
});
