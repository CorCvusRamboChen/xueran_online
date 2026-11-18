// 2026-11-18 用户：实时显示谁被闭麦。机器人看语音状态（服务器闭麦 / 自己闭麦），变了就推给大家。
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceHub } from '../src/server/voice.js';
import { Room } from '../src/server/room.js';

function fakePlatform() {
  const states = new Map(); let voiceFn = () => {};
  return {
    states,
    fire: (gid, uid) => voiceFn(gid, uid),
    onReady() {}, onVoice(fn) { voiceFn = fn; }, hasGuild: () => true,
    state: (gid, uid) => states.get(uid) ?? null,
    edit: async () => {}, isVoiceChannel: async () => true, members: async () => [], exists: async () => true,
  };
}

test('语音：micStates 分出被服务器闭麦、自己闭麦、能说话、不在语音里；状态变了通知订阅的人', async () => {
  const p = fakePlatform();
  const hub = new VoiceHub(p, { file: null, oldFile: null, sweepMs: 0 });
  p.states.set('a', { channelId: 'sq', serverMute: true });
  p.states.set('b', { channelId: 'sq', selfMute: true });
  p.states.set('c', { channelId: 'sq' });
  p.states.set('d', { channelId: null, serverMute: true });
  const v = hub.forGuild('g', 'g:sq');
  assert.deepEqual(await v.micStates(['a', 'b', 'c', 'd', 'e']), { a: 'server', b: 'self', c: null, d: null, e: null });
  const got = [];
  hub.watch((gid, uid) => got.push(`${gid}:${uid}`));
  p.fire('g', 'b');
  assert.deepEqual(got, ['g:b']);
});

test('房间：查到谁闭着麦就放进玩家视图（mic），没变化不推', async () => {
  let pushed = 0;
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: { micStates: async () => ({ u1: 'server', u2: null }) }, onChange: () => { pushed++; } });
  room.users.set('u1', { id: 'u1', name: '阿一' }); room.users.set('u2', { id: 'u2', name: '阿二' });
  room.lobby = [{ id: 'u1', name: '阿一' }, { id: 'u2', name: '阿二' }];
  await room.refreshMics();
  assert.deepEqual(room.mics, { u1: 'server' });
  const before = pushed;
  await room.refreshMics();
  assert.equal(pushed, before, '没变化不推');
});
