// 2026-11-18 用户：游戏结束之后做一个 MVP 投票；惩罚场外里加鲜花，扔的时候全场都看得到动画。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';
import { PELT_ITEMS } from '../src/shared/pelt.js';

function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };

async function endedRoom() {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', script: 'tb' } });
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二'], ['u3', '阿三']]) room.users.set(id, { id, name, avatar: null });
  for (const id of ['u1', 'u2', 'u3']) await room.act(id, 'join');
  await room.act('u1', 'addBots', { count: 4 });
  await room.act('u1', 'start');
  room.game.winner = 'good'; room.game.winReason = '测试';
  await room.endGame();
  return room;
}

test('MVP：游戏结束后这局的真人每人一票，不能投自己；都投完就公布', async () => {
  const room = await endedRoom();
  try {
    assert.ok(room.mvp);
    assert.deepEqual(room.viewFor('u1').mvp.need, 3);
    await assert.rejects(room.act('u1', 'mvp', { target: 'u1' }), /不能投自己/);
    await assert.rejects(room.act('bot-1', 'mvp', { target: 'u1' }), /只有这局的玩家/);
    await room.act('u1', 'mvp', { target: 'u2' });
    await room.act('u2', 'mvp', { target: 'u3' });
    await room.act('u1', 'mvp', { target: 'u3' }); // 改票
    assert.equal(room.mvp.result, null);
    await room.act('u3', 'mvp', { target: 'u2' });
    assert.deepEqual(room.mvp.result.ids, ['u3']); // u3 得 u1（改票后）和 u2 的票
    assert.equal(room.mvp.result.votes, 2);
  } finally { await room.teardown(); }
});

test('鲜花：是叫好不是惩罚；扔的东西进 peltFx 给全场播动画', () => {
  assert.equal(PELT_ITEMS.flower.praise, true);
  assert.equal(PELT_ITEMS.flower.cost, 1);
});
