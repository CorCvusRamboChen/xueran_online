// 诸神黄昏（娱乐模式）：狼人杀的板子，只有狼人和猎人，走狼人杀的引擎（2026-11-11 用户：它是狼人杀的板子，猎人和狼人都是狼人杀的）。
// 玩法沿用 2026-11-04 用户定的：猎人出局开一枪打谁谁死，被带走的猎人接着开。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Werewolf, rollWerewolf, wwSetup } from '../src/engine/werewolf.js';
import { ragnarokWolves, rolesOf, engineOf, playersOf, SCRIPTS } from '../src/engine/roles.js';
import { makeRng } from '../src/engine/game.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
// 7 人：1-5 猎人，6、7 狼人
const BOARD = ['ww_hunter', 'ww_hunter', 'ww_hunter', 'ww_hunter', 'ww_hunter', 'ww_wolf', 'ww_wolf'];
const mk = (roles = BOARD) => new Werewolf(players(roles.length), { roles, rng: makeRng(5), script: 'rag' });

/** 走一整夜：只有狼人这一步。 */
function night(g, knife = null) {
  g.startNight();
  assert.equal(g.stage, 'wolf', '没有守卫、女巫、预言家，直接到狼人');
  for (const w of g.alive().filter((p) => p.role === 'ww_wolf')) g.wolfVote(w.id, knife);
  g.settleKnife();
  assert.equal(g.stage, 'dawn');
  g.resolveNight();
  return g.dawn().deaths;
}

test('诸神黄昏：狼人杀的板子——狼人杀引擎，狼人杀的猎人和狼人；按人数定狼人，其余全是猎人', () => {
  assert.equal(engineOf('rag'), 'ww');
  assert.ok(SCRIPTS.rag.werewolf);
  assert.deepEqual(rolesOf('rag'), ['ww_hunter', 'ww_wolf']);
  assert.deepEqual(playersOf('rag'), [5, 15]);
  for (let n = 5; n <= 15; n++) {
    const roles = rollWerewolf(n, makeRng(n), 'rag');
    assert.equal(roles.length, n);
    assert.equal(roles.filter((r) => r === 'ww_wolf').length, ragnarokWolves(n));
    assert.equal(roles.filter((r) => r === 'ww_hunter').length, n - ragnarokWolves(n));
    assert.equal(wwSetup(n, 'rag').reduce((a, x) => a + x.count, 0), n);
  }
  assert.deepEqual([5, 6, 7, 9, 10, 12, 13, 15].map(ragnarokWolves), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.throws(() => rollWerewolf(4, makeRng(1), 'rag'), /5–15/);
});

test('诸神黄昏：狼人互相认识，一起刀一人；被刀的猎人开枪，被带走的猎人接着开', () => {
  const g = mk();
  g.startNight();
  assert.deepEqual(g.evilKnown.p6.map((a) => a.id), ['p7']);
  g.drain();
  for (const w of ['p6', 'p7']) g.wolfVote(w, 'p1');
  g.settleKnife();
  g.resolveNight();
  assert.deepEqual(g.dawn().deaths, ['p1']);
  assert.equal(g.stage, 'hunter');
  assert.equal(g.hunterId, 'p1');
  g.hunterShoot('p1', 'p2'); // 带走另一个猎人
  assert.equal(g.get('p2').alive, false);
  for (let k = 0; k < 5 && g.stage !== 'hunter'; k++) g.timeout(); // 先走完 p1 的遗言
  assert.equal(g.stage, 'hunter', '被带走的猎人也有发动技能的时间');
  assert.equal(g.hunterId, 'p2', '被带走的猎人接着开枪');
  g.hunterShoot('p2', 'p6');
  assert.equal(g.get('p6').alive, false);
  assert.equal(g.winner, null);
});

test('诸神黄昏：狼人全部出局好人胜；猎人全部出局狼人胜', () => {
  const g = mk(['ww_hunter', 'ww_hunter', 'ww_wolf', 'ww_hunter', 'ww_hunter']);
  for (const id of ['p1', 'p2', 'p4']) g.get(id).alive = false;
  assert.equal(g.checkWinner(), null, '还有一个猎人');
  g.get('p5').alive = false;
  assert.equal(g.checkWinner(), 'evil');
  assert.match(g.winReason, /猎人全部出局/);
  const h = mk(['ww_hunter', 'ww_hunter', 'ww_wolf', 'ww_hunter', 'ww_hunter']);
  h.get('p3').alive = false;
  assert.equal(h.checkWinner(), 'good');
});

test('诸神黄昏：夜里只有狼人这一步，白天照狼人杀放逐', () => {
  const g = mk();
  assert.deepEqual(night(g, 'p3'), ['p3']);
  for (let k = 0; k < 40 && !['vote', 'ended', 'dusk'].includes(g.stage); k++) g.timeout();
  assert.equal(g.stage, 'vote');
});

const FAST = { chooseSeconds: 0.05, speechSeconds: 0.02, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, mode: 'auto', shuffle: false, script: 'rag' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mockVoice() {
  return {
    async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {},
    async setMuted() {},
  };
}

test('诸神黄昏：房间里机器人跑完一局，用的是狼人杀的流程', async (t) => {
  const { Room } = await import('../src/server/room.js');
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: FAST });
  room.users.set('u1', { id: 'u1', name: 'A', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 7 });
  await room.act('u1', 'start');
  t.after(() => room.teardown());
  const g = room.game;
  assert.ok(g.werewolf && g.ragnarok);
  assert.equal(g.players.filter((p) => p.role === 'ww_wolf').length, ragnarokWolves(8));
  assert.ok(g.players.every((p) => ['ww_wolf', 'ww_hunter'].includes(p.role)));
  assert.ok(room.log.some((l) => /游戏开始！《诸神黄昏》/.test(l.text)));
  assert.equal(room.viewFor('u1').script, 'rag');
  await assert.rejects(room.act('u1', 'nominate', { target: 'bot-1' }), /没有这个操作/);
  const end = Date.now() + 60_000;
  while (!room.ended && Date.now() < end) {
    const pr = room.wwPrompt('u1');
    if (pr && Math.random() < 0.7) {
      const tg = pr.options?.[0] ?? null;
      const type = { wolf: 'wwWolf', hunter: 'wwShoot', vote: 'wwVote', speak: 'wwDone', badge: 'wwBadge', withdraw: 'wwWithdraw' }[pr.kind];
      if (type) await room.act('u1', type, { target: tg }).catch(() => {});
      if (pr.kind === 'signup' && pr.mine === undefined) await room.act('u1', 'wwSignup', { yes: Math.random() < 0.5 }).catch(() => {});
      if (pr.kind === 'order') await room.act('u1', 'wwOrder', { dir: 'down' }).catch(() => {});
    }
    await sleep(2);
  }
  assert.ok(room.ended, '分出了胜负');
  assert.ok(['good', 'evil'].includes(g.winner));
  const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: FAST }).restore(JSON.parse(JSON.stringify(room.snapshot())));
  assert.ok(back.game.werewolf && back.game.ragnarok, '存档读回来还是诸神黄昏');
  await room.teardown();
});
