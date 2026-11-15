// 金币（2026-11-16 用户：给每个赢过的人发一个金币；有人聊场外就花钱给他丢东西，叠在他头上）。
// 钱包 src/server/wallet.js，道具 src/shared/pelt.js，扔 room.pelt()。
import test from 'node:test';
import assert from 'node:assert/strict';
import { useWalletFile, seedWallet, balance, addCoins, spendCoins, awardWins, WALLET } from '../src/server/wallet.js';
import { PELT_PER_DAY } from '../src/shared/pelt.js';
import { Room } from '../src/server/room.js';

useWalletFile(null); // 只放内存，别写 data/wallet.json

test('补发：赢过的真人各一枚，只发一次；机器人和没赢过的不发', () => {
  assert.equal(seedWallet([{ id: 'a', wins: 3 }, { id: 'b', wins: 0 }, { id: 'bot-1', wins: 5 }, { id: 'c', wins: 1 }]), 2);
  assert.equal(balance('a'), 1); assert.equal(balance('b'), 0); assert.equal(balance('bot-1'), 0); assert.equal(balance('c'), 1);
  assert.equal(seedWallet([{ id: 'a', wins: 3 }]), 0, '第二次不发');
  assert.equal(balance('a'), 1);
});

test('花钱：不够就不扣', () => {
  addCoins('d', 2, '测试');
  assert.equal(spendCoins('d', 2, '测试'), 0);
  assert.throws(() => spendCoins('d', 1, '测试'), /金币不够/);
  assert.equal(balance('d'), 0);
});

test('赢一局：赢的一方的真人各 +1；不到 4 个真人、教程不发', () => {
  const players = (ids) => ids.map((id, i) => ({ id, seat: i + 1, evil: i === 0 }));
  const room = (ids, winner, extra = {}) => ({ isFake: (id) => id.startsWith('bot-'), tutorial: false, ...extra, game: { winner, winReason: '测试', players: players(ids), evilOf: (p) => p.evil } });
  const got = awardWins(room(['e1', 'g1', 'g2', 'g3', 'bot-1'], 'good'));
  assert.deepEqual(got.sort(), ['g1', 'g2', 'g3']);
  assert.equal(balance('g1'), 1); assert.equal(balance('e1'), 0);
  assert.deepEqual(awardWins(room(['e2', 'g4', 'g5', 'bot-1', 'bot-2'], 'good')), [], '只有 3 个真人');
  assert.deepEqual(awardWins(room(['e3', 'g6', 'g7', 'g8'], 'evil', { tutorial: true })), [], '教程');
  assert.deepEqual(awardWins(room(['e4', 'g9', 'g10', 'g11'], 'evil')), ['e4']);
});

// ───────────── 房间里扔东西 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：白天花金币朝人扔东西，叠在他头上；每天最多 3 次；不能扔自己；夜里不能扔；钱不够不能扔', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'tb' } });
  room.wallet = WALLET;
  room.judgeReady = () => false;
  room.botsConsider = () => {};
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    await assert.rejects(room.act('u1', 'pelt', { target: 'u2', item: 'tomato' }), /只能在白天/);
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
      await sleep(3);
    }
    await until(() => g.phase === 'day', 2000);
    await assert.rejects(room.act('u1', 'pelt', { target: 'u2', item: 'tomato' }), /金币不够/);
    addCoins('u1', 10, '测试');
    await assert.rejects(room.act('u1', 'pelt', { target: 'u1', item: 'tomato' }), /不能扔自己/);
    await room.act('u1', 'pelt', { target: 'u2', item: 'tomato' });
    await room.act('u1', 'pelt', { target: 'u2', item: 'raven' });
    await room.act('u1', 'pelt', { target: 'u2', item: 'bridle' });
    assert.equal(balance('u1'), 10 - 1 - 1 - 2);
    await assert.rejects(room.act('u1', 'pelt', { target: 'u2', item: 'tomato' }), new RegExp(`每天最多扔 ${PELT_PER_DAY} 次`));
    assert.deepEqual(room.pelted.u2.map((x) => x.item), ['tomato', 'raven', 'bridle']);
    assert.ok(room.log.some((l) => /阿一.*嫌.*阿二.*聊场外/.test(l.text)));
    const v = room.viewFor('u2');
    assert.equal(v.pelted.u2.length, 3);
    assert.equal(room.viewFor('u1').coins, 6);
    assert.equal(room.viewFor('u1').peltLeft, 0);
    // 存档读档后还叠着
    const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice() }).restore(JSON.parse(JSON.stringify(room.snapshot())));
    assert.equal(back.pelted.u2.length, 3);
    await back.teardown?.();
  } finally { await room.teardown(); }
});
