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
