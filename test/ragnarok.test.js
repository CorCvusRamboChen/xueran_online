// 诸神黄昏（娱乐模式）：好人全是猎手，坏人全是小恶魔（狼人）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng, rollRagnarok } from '../src/engine/game.js';
import { ragnarokWolves, rolesOf, engineOf } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles) => new Game(players(roles.length), { roles, rng: makeRng(5), script: 'rag' });

test('诸神黄昏：按人数定狼人数量，其余全是猎手', () => {
  assert.deepEqual(rolesOf('rag'), ['slayer', 'imp']);
  assert.equal(engineOf('rag'), 'tb');
  for (let n = 5; n <= 15; n++) {
    const roles = rollRagnarok(n, makeRng(n));
    assert.equal(roles.filter((r) => r === 'imp').length, ragnarokWolves(n));
    assert.equal(roles.filter((r) => r === 'slayer').length, n - ragnarokWolves(n));
  }
  assert.deepEqual([5, 6, 7, 9, 10, 12, 13, 15].map(ragnarokWolves), [1, 1, 2, 2, 3, 3, 4, 4]);
});

test('诸神黄昏：狼人人少也互相认识；每只狼人各刀一人', () => {
  const g = mk(['imp', 'imp', 'slayer', 'slayer', 'slayer', 'slayer', 'slayer']);
  g.startNight();
  assert.match(g.evilMessages.find((m) => m.playerId === 'p1').text, /2号/);
  g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  g.submitChoice('p1', ['p3']); g.submitChoice('p2', ['p4']);
  g.resolveNight();
  assert.deepEqual([g.get('p3').alive, g.get('p4').alive], [false, false]);
});

test('诸神黄昏：每个猎手各开一枪；狼人全死好人赢，狼人追平好人狼人赢', () => {
  const g = mk(['imp', 'imp', 'slayer', 'slayer', 'slayer', 'slayer', 'slayer']);
  g.startNight(); g.resolveNight(); g.dawn();
  assert.equal(g.slay('p3', 'p1').hit, true);
  assert.equal(g.slay('p4', 'p5').hit, false, '打好人没事');
  assert.throws(() => g.slay('p3', 'p2'), /已经开过枪/);
  assert.equal(g.slay('p2', 'p6').hit, false, '狼人假装开枪没有效果');
  assert.equal(g.slay('p5', 'p2').hit, true, '另一个猎手照样能开');
  assert.equal(g.winner, 'good');

  const h = mk(['imp', 'imp', 'slayer', 'slayer', 'slayer']);
  h.startNight(); h.resolveNight(); h.dawn();
  h.block = 'p3'; h.endDay(); // 剩 2 狼 2 好人
  assert.equal(h.winner, 'evil');
  assert.match(h.winReason, /狼人/);
});

test('诸神黄昏：房间里整局能跑完', async () => {
  const { Room } = await import('../src/server/room.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const voice = { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice, settings: { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, mode: 'auto', shuffle: false, script: 'rag' } });
  room.moonchildWaitMs = 5;
  room.users.set('u1', { id: 'u1', name: 'A', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 8 });
  await room.act('u1', 'start');
  const g = room.game;
  assert.equal(g.players.filter((p) => p.role === 'imp').length, 2);
  assert.ok(room.log.some((l) => /7 名猎手 · 2 只狼人/.test(l.text)));
  for (let day = 0; day < 15 && !g.winner; day++) {
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId] && pr.playerId === 'u1') await room.act('u1', 'choose', { night: g.night, targets: pr.options.slice(0, 1) }).catch(() => {});
      await sleep(3);
    }
    if (g.winner) break;
    await until(() => room.roam || room.ended, 300, sleep);
    if (room.ended) break;
    await room.act('u1', 'gather').catch(() => {});
    if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[day % g.aliveCount()].id;
    if (g.phase === 'day' && !g.winner) await room.dusk().catch(() => {});
    await until(() => g.phase !== 'day' || g.winner, 500, sleep);
  }
  assert.ok(g.winner, '分出了胜负');
  await room.teardown();
});

async function until(cond, ms, sleep) { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); }
