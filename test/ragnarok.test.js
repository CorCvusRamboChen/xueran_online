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

test('诸神黄昏：狼人追平好人狼人赢', () => {
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
  room.ragShotMs = 5;
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

test('诸神黄昏：猎手活着不能开枪；死了（被处决）开一枪打谁谁死，被打死的猎手接着开', async () => {
  const { Room } = await import('../src/server/room.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const voice = { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice, settings: { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, mode: 'auto', shuffle: false, script: 'rag' } });
  room.ragShotMs = 60;
  for (const id of ['u1', 'u2', 'u3']) room.users.set(id, { id, name: id, avatar: null });
  for (const id of ['u1', 'u2', 'u3']) await room.act(id, 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'start');
  const g = room.game;
  // 定好角色：u1、u2、u3 是猎手，两只狼人是机器人
  for (const id of ['u1', 'u2', 'u3']) if (g.get(id).role !== 'slayer') { const s = g.players.find((p) => p.role === 'slayer' && !['u1', 'u2', 'u3'].includes(p.id)); s.role = 'imp'; s.shownRole = 'imp'; g.get(id).role = 'slayer'; g.get(id).shownRole = 'slayer'; }
  const wolf = g.players.find((p) => p.role === 'imp');
  for (let k = 0; k < 400 && g.phase === 'night'; k++) await sleep(3);
  await room.act('u1', 'gather').catch(() => {});
  await assert.rejects(room.act('u1', 'slay', { target: wolf.id }), /死了才能开枪/);
  // 处决 u1：他开枪打 u2，u2 也是猎手，接着开枪打狼人
  if (g.phase === 'day') { g.block = 'u1'; await room.dusk(); }
  assert.equal(room.ragShot?.id ?? room.ragCur?.id, 'u1');
  await room.act('u1', 'ragShoot', { target: 'u2' });
  for (let k = 0; k < 100 && room.ragCur?.id !== 'u2'; k++) await sleep(5);
  assert.equal(g.get('u2').alive, false, 'u1 一枪打死了 u2');
  await room.act('u2', 'ragShoot', { target: wolf.id });
  for (let k = 0; k < 100 && g.get(wolf.id).alive; k++) await sleep(5);
  assert.equal(g.get(wolf.id).alive, false, 'u2 接着开枪打死了狼人');
  assert.ok(room.log.some((l) => /开枪带走了/.test(l.text)));
  await room.teardown();
});
