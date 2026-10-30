// 从语音频道打开活动：新房间不让进，进行中的局不拦，查不到频道类型就放行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceLaunchBlocked } from '../src/server/launch.js';

const voice = (isVoice) => ({ isVoiceChannel: async () => isVoice });

test('从语音频道打开：没有进行中的局就拦下', async () => {
  assert.equal(await voiceLaunchBlocked({ room: undefined, voice: voice(true), channelId: 'c' }), true);
  assert.equal(await voiceLaunchBlocked({ room: { game: null }, voice: voice(true), channelId: 'c' }), true, '只有大厅的房间也拦');
  assert.equal(await voiceLaunchBlocked({ room: { game: {}, ended: true }, voice: voice(true), channelId: 'c' }), true, '打完的局也拦');
});

test('从文字频道打开：放行', async () => {
  assert.equal(await voiceLaunchBlocked({ room: undefined, voice: voice(false), channelId: 'c' }), false);
});

test('语音频道里进行中的局：不拦，重连不会被踢出去', async () => {
  assert.equal(await voiceLaunchBlocked({ room: { game: {}, ended: false }, voice: voice(true), channelId: 'c' }), false);
});

test('查不到频道类型：放行（没有语音控制器、接口报错、接口一直不回）', async () => {
  assert.equal(await voiceLaunchBlocked({ room: undefined, voice: null, channelId: 'c' }), false);
  const broken = { isVoiceChannel: async () => { throw new Error('机器人不在这个服务器里'); } };
  assert.equal(await voiceLaunchBlocked({ room: undefined, voice: broken, channelId: 'c' }), false);
  const stuck = { isVoiceChannel: () => new Promise(() => {}) };
  assert.equal(await voiceLaunchBlocked({ room: undefined, voice: stuck, channelId: 'c', timeoutMs: 20 }), false);
});
