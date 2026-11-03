// 狼人杀（娱乐模式）：预女猎守 + 平民，屠边。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Werewolf, rollWerewolf, wwSetup, WW_SETUPS } from '../src/engine/werewolf.js';
import { SCRIPTS, ROLES, engineOf, playersOf, rolesOf } from '../src/engine/roles.js';
import { makeRng } from '../src/engine/game.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
// 默认 10 人：1 守卫 2 女巫 3 预言家 4 猎人 5-7 狼人 8-10 平民
const BOARD = ['ww_guard', 'ww_witch', 'ww_seer', 'ww_hunter', 'ww_wolf', 'ww_wolf', 'ww_wolf', 'ww_villager', 'ww_villager', 'ww_villager'];
const mk = (roles = BOARD) => new Werewolf(players(roles.length), { roles, rng: makeRng(7) });

/** 走一整夜：guard / knife / witch / seer 不给就按「不行动」。 */
function night(g, { guard = null, knife = null, save = false, poison = null, seer = null } = {}) {
  g.startNight();
  const id = (role) => g.alive().find((p) => p.role === role)?.id;
  if (g.stage === 'guard') { if (id('ww_guard')) g.guard(id('ww_guard'), guard); else g.timeout(); }
  assert.equal(g.stage, 'wolf');
  for (const w of g.alive().filter((p) => p.role === 'ww_wolf')) g.wolfVote(w.id, knife);
  g.settleKnife();
  if (g.stage === 'witch') { if (id('ww_witch')) g.witch(id('ww_witch'), { save, poison }); else g.timeout(); }
  if (g.stage === 'seer') { if (id('ww_seer')) g.seer(id('ww_seer'), seer); else g.timeout(); }
  assert.equal(g.stage, 'dawn');
  g.resolveNight();
  return g.dawn().deaths;
}
/** 白天跳过死者技能、遗言和发言，直接到投票。 */
function toVote(g) {
  for (let k = 0; k < 40 && !['vote', 'pkvote', 'ended', 'dusk'].includes(g.stage); k++) g.timeout();
}

test('狼人杀：注册成娱乐模式，人数表 6–15 人', () => {
  assert.equal(SCRIPTS.ww.name, '狼人杀');
  assert.equal(engineOf('ww'), 'ww');
  assert.deepEqual(playersOf('ww'), [6, 15]);
  assert.deepEqual(rolesOf('ww').sort(), ['ww_guard', 'ww_hunter', 'ww_seer', 'ww_villager', 'ww_witch', 'ww_wolf']);
  assert.ok(!rolesOf('tb').includes('ww_wolf') && !rolesOf('snv').includes('ww_witch'), '不混进血染的剧本');
  assert.equal(ROLES.witch.name, '女巫', '梦殒春宵的女巫不受影响');
  // 常见板子：9 人预女猎 3 狼 3 民，12 人预女猎守 4 狼 4 民
  assert.deepEqual(WW_SETUPS[9], { wolves: 3, villagers: 3, gods: ['ww_seer', 'ww_witch', 'ww_hunter'] });
  assert.deepEqual(WW_SETUPS[12], { wolves: 4, villagers: 4, gods: ['ww_seer', 'ww_witch', 'ww_hunter', 'ww_guard'] });
  for (let n = 6; n <= 15; n++) {
    const roles = rollWerewolf(n, makeRng(n));
    assert.equal(roles.length, n);
    assert.equal(roles.filter((r) => r === 'ww_wolf').length, WW_SETUPS[n].wolves);
    assert.equal(wwSetup(n).reduce((a, x) => a + x.count, 0), n);
  }
  assert.throws(() => rollWerewolf(5), /6–15/);
});

test('狼人杀：夜晚顺序守卫 → 狼人 → 女巫 → 预言家；狼人互相认识', () => {
  const g = mk();
  g.startNight();
  const msgs = g.drain();
  assert.match(msgs.find((m) => m.to === 'p5').text, /6号.*7号/);
  assert.deepEqual(g.evilKnown.p5.map((a) => a.id), ['p6', 'p7']);
  assert.equal(g.stage, 'guard');
  g.guard('p1', 'p8');
  assert.equal(g.stage, 'wolf');
  assert.throws(() => g.witch('p2', {}), /不是这个阶段/);
  assert.equal(g.wolfVote('p5', 'p9'), false);
  g.wolfVote('p6', 'p9');
  assert.equal(g.wolfVote('p7', 'p9'), true, '所有狼人选同一个人就可以马上定下');
  g.settleKnife();
  assert.equal(g.stage, 'witch');
  assert.equal(g.witchInfo('p2').knife, 'p9', '女巫先看到刀口');
  g.witch('p2', {});
  assert.equal(g.stage, 'seer');
  g.seer('p3', 'p5');
  assert.match(g.drain().find((m) => m.to === 'p3').text, /5号.*狼人/);
  assert.equal(g.stage, 'dawn');
  g.resolveNight();
  assert.deepEqual(g.dawn().deaths, ['p9']);

  // 9 人板没有守卫：直接从狼人开始
  const h = new Werewolf(players(9), { roles: rollWerewolf(9, makeRng(3)), rng: makeRng(3) });
  h.startNight();
  assert.equal(h.stage, 'wolf');
});

test('狼人杀：狼人多数票；平票在并列的里随机；没人投 = 空刀', () => {
  const g = mk();
  g.startNight(); g.guard('p1', null);
  g.wolfVote('p5', 'p8'); g.wolfVote('p6', 'p8'); g.wolfVote('p7', 'p9');
  g.settleKnife();
  assert.equal(g.knife, 'p8', '多数票');

  const t = mk();
  t.startNight(); t.guard('p1', null);
  t.wolfVote('p5', 'p8'); t.wolfVote('p6', 'p9');
  t.settleKnife();
  assert.ok(['p8', 'p9'].includes(t.knife), '平票在并列的两个里挑');
  assert.equal(t.journal.at(-1).what, '狼人平票');

  const e = mk();
  e.startNight(); e.guard('p1', null);
  e.timeout(); // 狼人时间到，谁都没投
  assert.equal(e.knife, null);
  assert.equal(e.witchInfo('p2').knife, null);
  e.witch('p2', {}); e.seer('p3', null); e.resolveNight();
  assert.deepEqual(e.dawn().deaths, [], '空刀 = 平安夜');
});

test('狼人杀：同守同救 = 奶穿；只守或只救都能活', () => {
  assert.deepEqual(night(mk(), { guard: 'p8', knife: 'p8', save: true }), ['p8'], '奶穿');
  assert.deepEqual(night(mk(), { guard: 'p8', knife: 'p8' }), [], '守住');
  assert.deepEqual(night(mk(), { knife: 'p8', save: true }), [], '救下');
  assert.deepEqual(night(mk(), { knife: 'p8', poison: 'p9' }), ['p8', 'p9'], '刀 + 毒，按座位号公布');
  assert.deepEqual(night(mk(), { guard: 'p9', knife: 'p8', poison: 'p9' }), ['p8', 'p9'], '守卫挡不住毒药');
});

test('狼人杀：女巫首夜可以自救，之后不能；同一晚只能用一瓶；解药用掉后不再得知刀口', () => {
  const a = mk();
  assert.deepEqual(night(a, { knife: 'p2', save: true }), [], '首夜自救');
  assert.equal(a.potions.save, false);

  const b = mk();
  night(b, { knife: null });
  toVote(b); for (const p of b.alive()) b.castVote(p.id, null); b.settleVote(); // 无人出局
  b.timeout();
  b.startNight(); b.guard('p1', null);
  for (const w of ['p5', 'p6', 'p7']) b.wolfVote(w, 'p2');
  b.settleKnife();
  const info = b.witchInfo('p2');
  assert.equal(info.knife, 'p2');
  assert.equal(info.canSave, false);
  assert.equal(info.selfBlocked, true);
  assert.throws(() => b.witch('p2', { save: true }), /首夜之后不能救自己/);
  assert.throws(() => b.witch('p2', { save: true, poison: 'p5' }), /只能用一瓶/);
  assert.throws(() => b.witch('p2', { poison: 'p2' }), /不能毒自己/);
  b.witch('p2', { poison: 'p5' });
  assert.equal(b.potions.poison, false);

  // 解药用掉以后：不再得知刀口，也不能再救
  const c = mk();
  night(c, { knife: 'p8', save: true });
  toVote(c); for (const p of c.alive()) c.castVote(p.id, null); c.settleVote();
  c.startNight(); c.guard('p1', null);
  for (const w of ['p5', 'p6', 'p7']) c.wolfVote(w, 'p9');
  c.settleKnife();
  assert.equal(c.witchInfo('p2').knife, undefined);
  assert.equal(c.witchInfo('p2').knows, false);
  assert.throws(() => c.witch('p2', { save: true }), /不能用解药/);
});

test('狼人杀：守卫不能连续两晚守同一人，空守之后可以', () => {
  const g = mk();
  night(g, { guard: 'p8' });
  toVote(g); for (const p of g.alive()) g.castVote(p.id, null); g.settleVote();
  assert.equal(g.stage, 'dusk');
  g.startNight();
  assert.ok(!g.guardOptions().includes('p8'));
  assert.throws(() => g.guard('p1', 'p8'), /连续两晚/);
  g.guard('p1', null); // 空守
  g.timeout(); g.witch('p2', {}); g.seer('p3', null); g.resolveNight(); g.dawn();
  toVote(g); for (const p of g.alive()) g.castVote(p.id, null); g.settleVote();
  g.startNight();
  assert.ok(g.guardOptions().includes('p8'), '空守之后又能守他');
  g.guard('p1', 'p1'); // 可以守自己
  assert.equal(g.guardPick, 'p1');
});

test('狼人杀：猎人被刀可以开枪，被毒不能；被带走的人有遗言', () => {
  const g = mk();
  night(g, { knife: 'p4' }); // 首夜刀猎人
  assert.equal(g.stage, 'hunter');
  assert.equal(g.hunterId, 'p4');
  g.hunterShoot('p4', 'p5');
  assert.equal(g.get('p5').alive, false);
  assert.equal(g.get('p5').cause, 'shot');
  assert.equal(g.stage, 'words');
  assert.equal(g.speaker, 'p4', '首夜死者先说遗言');
  g.doneSpeaking('p4');
  assert.equal(g.speaker, 'p5', '被带走的人也有遗言');
  g.doneSpeaking('p5');
  assert.equal(g.stage, 'speech');
  assert.ok(!g.speakers.includes('p4') && !g.speakers.includes('p5'));
  assert.equal(g.speakers[0], 'p6', '从死者的下一位开始发言');

  const h = mk();
  night(h, { knife: 'p8', poison: 'p4' }); // 猎人被毒
  assert.equal(h.stage, 'hunter');
  assert.equal(h.hunterId, null, '被毒死的猎人不能开枪');
  assert.throws(() => h.hunterShoot('p4', 'p5'), /不能开枪/);
  assert.match(h.drain().find((m) => m.to === 'p4').text, /不能开枪/);

  const k = mk();
  night(k, { knife: 'p4', poison: 'p4' }); // 被刀又被毒：按毒死算
  assert.equal(k.get('p4').cause, 'poison');
  assert.equal(k.hunterId, null);
});

test('狼人杀：第二夜起夜里死的人没有遗言；猎人被放逐可以开枪', () => {
  const g = mk();
  night(g, {});
  toVote(g);
  for (const p of g.alive()) g.castVote(p.id, p.id === 'p4' ? 'p8' : 'p4');
  const r = g.settleVote();
  assert.equal(r.exiled, 'p4');
  assert.equal(g.stage, 'hunter');
  assert.equal(g.hunterId, 'p4', '被放逐的猎人可以开枪');
  g.hunterShoot('p4', null);
  assert.equal(g.stage, 'hunter', '不开枪也要等时间到，免得看出谁是猎人');
  g.timeout();
  assert.equal(g.stage, 'words');
  assert.equal(g.speaker, 'p4', '被放逐的人有遗言');
  g.timeout();
  assert.equal(g.stage, 'dusk');

  night(g, { knife: 'p9' });
  assert.equal(g.stage, 'hunter');
  g.timeout();
  assert.equal(g.stage, 'speech', '第二夜死的人没有遗言');
});

test('狼人杀：放逐投票同时投；平票 PK，PK 台上的人不能投，再平无人出局', () => {
  const g = mk();
  night(g, {});
  toVote(g);
  assert.equal(g.stage, 'vote');
  assert.throws(() => g.castVote('p1', 'p1'), /不能投自己/);
  // 8、9 各 5 票
  const half = g.alive().map((p) => p.id);
  for (const [i, id] of half.entries()) g.castVote(id, i % 2 ? (id === 'p8' ? 'p9' : 'p8') : (id === 'p9' ? 'p8' : 'p9'));
  const r = g.settleVote();
  assert.equal(r.why, 'pk');
  assert.deepEqual(g.pk, ['p8', 'p9']);
  assert.equal(g.voteHistory[0].pk, false, '第一轮不是 PK');
  assert.deepEqual(g.voteHistory[0].pkList, ['p8', 'p9']);
  assert.equal(g.stage, 'pk');
  assert.deepEqual(g.speakers, ['p8', 'p9']);
  g.doneSpeaking('p8'); g.doneSpeaking('p9');
  assert.equal(g.stage, 'pkvote');
  assert.throws(() => g.castVote('p8', 'p9'), /PK 台上的人不能投票/);
  assert.throws(() => g.castVote('p1', 'p2'), /只能投 PK 台上的人/);
  const voters = g.voters;
  assert.equal(voters.length, 8);
  for (const [i, id] of voters.entries()) g.castVote(id, i % 2 ? 'p8' : 'p9');
  const r2 = g.settleVote();
  assert.equal(r2.why, 'tie2');
  assert.equal(g.stage, 'dusk', '再平票：无人出局，入夜');
  assert.equal(g.aliveCount(), 10);

  // PK 里分出胜负
  const h = mk();
  night(h, {});
  toVote(h);
  for (const p of h.alive()) h.castVote(p.id, p.id === 'p8' ? 'p9' : p.id === 'p9' ? 'p8' : ['p1', 'p3', 'p5', 'p7'].includes(p.id) ? 'p8' : 'p9');
  h.settleVote();
  h.timeout(); h.timeout();
  for (const id of h.voters) h.castVote(id, 'p8');
  assert.equal(h.settleVote().exiled, 'p8');
  assert.equal(h.get('p8').alive, false);

  // 全部弃票
  const k = mk();
  night(k, {});
  toVote(k);
  for (const p of k.alive()) k.castVote(p.id, null);
  assert.equal(k.settleVote().why, 'none');
  assert.equal(k.stage, 'dusk');

  // 超时没投的算弃票
  const t = mk();
  night(t, {});
  toVote(t);
  t.castVote('p1', 'p8');
  t.timeout();
  assert.equal(t.get('p8').alive, false);
});

test('狼人杀：屠边——狼全死好人胜；神全死或民全死狼人胜；同时发生算好人', () => {
  // 屠民：三个平民
  const a = mk();
  night(a, { knife: 'p8' });
  toVote(a);
  for (const p of a.alive()) if (p.id !== 'p9') a.castVote(p.id, 'p9');
  a.castVote('p9', 'p1'); a.settleVote();
  assert.equal(a.winner, null);
  for (let k = 0; k < 5 && a.stage !== 'dusk'; k++) a.timeout(); // 被放逐的人：技能、遗言
  night(a, { knife: 'p10' });
  assert.equal(a.winner, 'evil');
  assert.match(a.winReason, /平民全部出局/);

  // 屠神
  const b = mk(['ww_seer', 'ww_witch', 'ww_wolf', 'ww_wolf', 'ww_villager', 'ww_villager']);
  night(b, { knife: 'p1', poison: null });
  assert.equal(b.winner, null);
  toVote(b);
  for (const p of b.alive()) b.castVote(p.id, p.id === 'p2' ? 'p5' : 'p2');
  b.settleVote();
  assert.equal(b.winner, 'evil');
  assert.match(b.winReason, /神职全部出局/);

  // 好人胜：毒死最后一只狼
  const c = mk(['ww_seer', 'ww_witch', 'ww_wolf', 'ww_villager', 'ww_villager', 'ww_hunter']);
  night(c, { knife: 'p5', poison: 'p3' });
  assert.equal(c.winner, 'good');
  assert.match(c.winReason, /狼人全部出局/);

  // 同时：狼刀死最后一个平民、女巫毒死最后一只狼 → 好人
  const d = mk(['ww_seer', 'ww_witch', 'ww_wolf', 'ww_villager', 'ww_hunter', 'ww_guard']);
  night(d, { knife: 'p4', poison: 'p3' });
  assert.equal(d.winner, 'good');

  // 猎人开枪带走最后一只狼
  const e = mk(['ww_seer', 'ww_witch', 'ww_wolf', 'ww_villager', 'ww_villager', 'ww_hunter']);
  night(e, { knife: 'p6' });
  e.hunterShoot('p6', 'p3');
  assert.equal(e.winner, 'good');
  assert.equal(e.stage, 'ended');
});

test('狼人杀：存档读回后接着打', () => {
  const g = mk();
  night(g, { knife: 'p8', save: true });
  const back = Werewolf.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), { rng: makeRng(1) });
  assert.equal(back.stage, g.stage);
  assert.equal(back.potions.save, false);
  assert.equal(back.get('p8').alive, true);
  toVote(back);
  assert.equal(back.stage, 'vote');
  assert.deepEqual(back.evilKnown.p5.map((a) => a.id), ['p6', 'p7']);
});

// ───────────── 房间：机器人跑完整局 ─────────────
const FAST = { chooseSeconds: 0.05, speechSeconds: 0.02, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, mode: 'auto', shuffle: false, script: 'ww' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms) { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); }
function mockVoice(log = []) {
  return {
    async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {},
    async setMuted(ids, on, reason) { log.push({ ids, on, reason }); },
  };
}

test('狼人杀：大厅能选，房间里机器人跑完一局', async (t) => {
  const { Room } = await import('../src/server/room.js');
  for (const n of [6, 9, 12]) {
    const mutes = [];
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(mutes), settings: FAST });
    room.users.set('u1', { id: 'u1', name: 'A', avatar: null });
    await room.act('u1', 'join');
    await room.act('u1', 'addBots', { count: n - 1 });
    await room.act('u1', 'start');
    t.after(() => room.teardown()); // 断言失败也要停掉计时器，不然测试进程不退出
    const g = room.game;
    assert.ok(g.werewolf);
    assert.equal(g.players.filter((p) => p.role === 'ww_wolf').length, WW_SETUPS[n].wolves);
    assert.ok(room.log.some((l) => /游戏开始！《狼人杀》/.test(l.text)));
    await assert.rejects(room.act('u1', 'nominate', { target: 'bot-1' }), /狼人杀里没有这个操作/);
    // 真人座位：轮到就随便做点什么（有时候不动，等超时）
    for (let k = 0; k < 6000 && !room.ended; k++) {
      const pr = room.wwPrompt('u1');
      const v = room.viewFor('u1');
      assert.equal(v.script, 'ww');
      if (pr && Math.random() < 0.7) {
        const t = pr.options?.[0] ?? null;
        const type = { guard: 'wwGuard', wolf: 'wwWolf', seer: 'wwSeer', hunter: 'wwShoot', vote: 'wwVote', speak: 'wwDone' }[pr.kind];
        if (type) await room.act('u1', type, { target: t }).catch(() => {});
        if (pr.kind === 'witch') await room.act('u1', 'wwWitch', { save: pr.canSave }).catch(() => {});
      }
      await sleep(2);
    }
    assert.ok(room.ended, `${n} 人局分出了胜负`);
    assert.ok(['good', 'evil'].includes(g.winner));
    assert.ok(room.log.some((l) => /好人阵营获胜|狼人阵营获胜/.test(l.text)));
    const end = room.viewFor('bot-1');
    assert.ok(end.players.every((p) => p.role), '终局公开所有身份');
    // 存档读回
    const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: FAST }).restore(JSON.parse(JSON.stringify(room.snapshot())));
    assert.ok(back.game.werewolf);
    assert.equal(back.game.winner, g.winner);
    assert.doesNotThrow(() => JSON.stringify(back.snapshot()), '读回来的局还能再存档（房间会往 game 上挂函数）');
    await room.teardown();
  }
});

test('狼人杀：视图只给该看的人看；死人闭麦，说遗言时解开', async (t) => {
  const { Room } = await import('../src/server/room.js');
  const mutes = [];
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(mutes), settings: { ...FAST, chooseSeconds: 30, speechSeconds: 30 } });
  for (const id of ['u1', 'u2']) room.users.set(id, { id, name: id, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 7 });
  room.users.get('u1').devRole = 'ww_wolf';
  room.users.get('u2').devRole = 'ww_seer';
  await room.act('u1', 'start');
  t.after(() => room.teardown());
  const g = room.game;
  assert.equal(g.get('u1').role, 'ww_wolf');
  assert.equal(g.get('u2').role, 'ww_seer');
  const wolfView = room.viewFor('u1');
  assert.equal(wolfView.players.filter((p) => p.role === 'ww_wolf').length, 3, '狼人看得到同伴');
  assert.equal(wolfView.self.allies.length, 2);
  const seerView = room.viewFor('u2');
  assert.deepEqual(seerView.players.filter((p) => p.role).map((p) => p.id), ['u2'], '好人只看得到自己');
  assert.equal(room.viewFor('watcher').players.filter((p) => p.role).length, 0, '观战看不到身份');
  // 狼人阶段：真人狼人刀预言家 u2，机器人狼人跟着
  await until(() => g.stage === 'wolf', 2000);
  assert.equal(room.wwPrompt('u1').kind, 'wolf');
  assert.equal(seerView.deadline ?? room.viewFor('u2').deadline, null, '不行动的人夜里看不到倒计时');
  await room.act('u1', 'wwWolf', { target: 'u2' });
  await until(() => g.stage !== 'wolf', 8000);
  assert.equal(g.knife, 'u2');
  // 女巫是机器人，首夜会救人：抢在它前面替它「不用药」
  assert.equal(g.stage, 'witch');
  g.witch(g.holder('ww_witch').id, {}); room.wwStep();
  await until(() => g.stage === 'seer', 8000);
  await room.act('u2', 'wwSeer', { target: 'u1' });
  assert.match(room.inbox.get('u2').at(-1).text, /狼人/);
  await until(() => g.phase === 'day', 3000);
  assert.equal(g.get('u2').alive, false, '预言家被刀死了');
  {
    assert.equal(g.stage, 'hunter');
    g.timeout(); room.wwStep(); // 跳过发动技能的时间
    assert.equal(g.speaker, 'u2');
    assert.ok(!room.wwMuted.includes('u2'), '说遗言时不闭麦');
    await room.act('u2', 'wwDone');
    assert.ok(room.wwMuted.includes('u2'), '说完遗言，死人闭麦');
    assert.ok(mutes.some((m) => m.reason === 'dead' && m.on && m.ids.includes('u2')));
  }
  await room.teardown();
  assert.ok(mutes.some((m) => m.reason === 'dead' && !m.on), '回大厅解开死人闭麦');
});
