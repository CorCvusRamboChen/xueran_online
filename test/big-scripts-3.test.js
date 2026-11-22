// 2026-11-23 三个大剧本：延长线（Extension Cord）、百无禁忌（No Roles Barred）、米诺陶迷宫（The Minotaur's Labyrinth）。
// 新角色照集石百科 / 官方英文百科：解谜大师、军团；奇遇角色诡诈杰克。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, SCRIPTS, engineOf, fabledOf, travellersOf, DISTRIBUTION } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, NOT_STEPS, STEP_NAMES } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const NEW = ['ext', 'nrb', 'mino'];
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function mk(script, roles, st = {}) {
  const g = new Game(players(roles.length), { roles, rng: makeRng(7), script });
  Object.assign(g.st, st);
  return g;
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages ?? []), ...r.messages] };
}

test('三个新剧本：角色都在、梦殒春宵引擎、有地图和夜晚顺序；延长线有旅行者和哨兵，米诺陶迷宫有诡诈杰克', () => {
  for (const s of NEW) {
    assert.ok(rolesOf(s).every((r) => ROLES[r]), s);
    assert.equal(engineOf(s), 'snv');
    assert.equal(getMap(s).id, s);
    for (const [id] of [...NIGHT_ORDER[s].first, ...NIGHT_ORDER[s].other]) assert.ok(NOT_STEPS.has(id) || STEP_NAMES[id] || [...MIX_STEPS.first, ...MIX_STEPS.other].includes(id), `${s} ${id}`);
  }
  assert.equal(rolesOf('ext').length, 24);
  assert.deepEqual(travellersOf('ext'), ['bureaucrat', 'butcher', 'matron', 'bonecollector', 'bishop']);
  assert.deepEqual(fabledOf('ext'), ['sentinel']);
  assert.deepEqual(fabledOf('mino'), ['knaves']);
  assert.ok(!rolesOf('bmr').includes('legion') && !rolesOf('tb').includes('puzzlemaster'), '新角色不混进基础剧本');
});

test('三个新剧本：随机跑完整局不崩（各人数、各 60 局）', () => {
  for (const script of NEW) {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = makeRng(seed);
      const n = 5 + (seed % 11);
      const g = new Game(players(n), { roles: rollMixed(script, n, rng), rng, script });
      for (let d = 0; d < 20 && !g.winner; d++) {
        night(g);
        if (g.winner) break;
        g.dawn();
        if (g.pendingKlutz) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
        if (g.winner) break;
        g.knavesDusk?.();
        const al = g.alive();
        g.block = al[Math.floor(rng() * al.length)].id;
        g.endDay();
        if (g.pendingKlutz && !g.winner) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
      }
      assert.ok(g.winner, `${script} ${n} 人 seed ${seed} 打了 20 天没结束`);
    }
  }
});

test('军团：人数反过来（平常邪恶几个、善良就几个，其余都是军团，没有爪牙）', () => {
  let seen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const n = 7 + (seed % 9);
    const roles = rollMixed('nrb', n, makeRng(seed));
    if (!roles.includes('legion')) continue;
    seen++;
    const [, , m] = DISTRIBUTION[n];
    assert.equal(roles.filter((r) => r !== 'legion').length, m + 1, `${n} 人：善良 ${m + 1} 个`);
    assert.ok(roles.filter((r) => r !== 'legion').every((r) => ['townsfolk', 'outsider'].includes(ROLES[r].team)));
  }
  assert.ok(seen > 30, '有军团局');
});

test('军团：首夜所有军团互认、知道谁是善良；只有邪恶投票的提名算 0 票；夜里说书人让人死；只剩一名善良时邪恶获胜', () => {
  const roles = ['empath', 'artist', 'legion', 'legion', 'legion', 'legion', 'legion'];
  const g = mk('nrb', roles);
  const { messages } = night(g);
  assert.match(text(messages, 'p3'), /你们都是\*\*军团\*\*/);
  assert.match(text(messages, 'p3'), /善良玩家/);
  g.dawn();
  const r = g.recordVote('p1', ['p3', 'p4', 'p5', 'p6']);
  assert.equal(r.count, 0, '只有军团举手：投票无效');
  const r2 = g.recordVote('p2', ['p3', 'p4', 'p5', 'p1']);
  assert.equal(r2.count, 4, '有善良举手就照常算');
  g.endDay();
  const before = g.alive().length;
  night(g);
  assert.equal(g.alive().length, before - 1, '说书人让一人死');
  // 只剩一名善良：邪恶获胜
  const h = mk('nrb', roles);
  night(h); h.dawn();
  h.snvDie(h.get('p1'), 'storyteller', []);
  h.checkWinner();
  assert.equal(h.winner, 'evil');
});

test('解谜大师：开局一名镇民整局醉酒；猜对得知恶魔、猜错得知一个不是恶魔的人；每局一次', () => {
  const roles = ['empath', 'oracle', 'monk', 'puzzlemaster', 'poisoner', 'nodashii', 'soldier'];
  const g = mk('ext', roles);
  const drunk = g.puzzle.drunk;
  assert.ok(drunk && ROLES[g.get(drunk).role].team === 'townsfolk');
  assert.equal(g.snvBroken(g.get(drunk)), true, '整局醉酒');
  night(g); g.dawn();
  assert.deepEqual(g.puzzleGuess('p4', drunk), { shown: 'p6' }, '猜对了：得知恶魔');
  assert.throws(() => g.puzzleGuess('p4', drunk), /猜过了/);
  const h = mk('ext', roles);
  night(h); h.dawn();
  const wrong = h.players.find((q) => q.id !== h.puzzle.drunk && q.id !== 'p4').id;
  const res = h.puzzleGuess('p4', wrong);
  assert.notEqual(res.shown, 'p6', '猜错了：说的不是恶魔');
  // 解谜大师死了，醉酒照样
  h.snvDie(h.get('p4'), 'storyteller', []);
  assert.equal(h.snvBroken(h.get(h.puzzle.drunk)), true, '解谜大师死了也照样醉');
});

test('诡诈杰克：找说假话的那位，信息一定是错的；找说真话的照常；黄昏最多互换一次', () => {
  const roles = ['empath', 'investigator', 'clockmaker', 'monk', 'witch', 'imp', 'recluse'];
  const g = mk('mino', roles);
  const liar = g.knaves.liar; const honest = liar === 'A' ? 'B' : 'A';
  g.knavesPick('p1', liar);
  assert.equal(g.lieMode(g.get('p1')), 'must');
  g.knavesPick('p1', honest);
  assert.equal(g.lieMode(g.get('p1')), null);
  assert.throws(() => g.knavesPick('p1', 'C'), /甲或乙/);
  g.st.knavesSwap = () => true;
  assert.equal(g.knavesDusk(), true);
  assert.equal(g.knaves.liar, honest, '互换了');
  assert.equal(g.knavesDusk(), false, '整局只换一次');
});

test('房间：三个新剧本 8 人局（1 真人 + 7 机器人）能打完；视图里有新按钮的状态', async () => {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
  const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
  const voice = () => { let n = 0; return { async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} }; };
  for (const script of NEW) {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: voice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
    room.moonchildWaitMs = 5;
    room.judgeReady = () => false;
    room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
    await room.act('u1', 'join');
    await room.act('u1', 'addBots', { count: 7 });
    if (script === 'ext') await room.act('u1', 'assignRole', { player: 'u1', role: 'puzzlemaster' });
    await room.act('u1', 'start');
    const g = room.game;
    let days = 0;
    while (!g.winner && !room.ended && days < 20) {
      for (let k = 0; k < 400 && g.phase === 'night'; k++) {
        if (!room.resolving) for (const pr of g.nightPrompts()) {
          if (room.isFake(pr.playerId) || g.choices[pr.playerId] || pr.waiting) continue;
          await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count), role: pr.pickRole ? pr.roleOptions[0] : null }).catch(() => {});
        }
        if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id }).catch(() => {});
        await sleep(3);
      }
      if (g.winner || room.ended) break;
      days++;
      await until(() => room.roam || room.ended, 300);
      if (room.ended) break;
      const self = room.viewFor('u1').self;
      if (script === 'mino') { assert.ok(self.knaves, '诡诈杰克：找哪位说书人'); await room.act('u1', 'knaves', { pick: 'B' }); assert.equal(room.viewFor('u1').self.knaves.pick, 'B'); }
      if (script === 'ext' && days === 1 && self.canPuzzle) {
        await room.act('u1', 'puzzle', { target: g.players.find((q) => q.id !== 'u1').id });
        assert.match(room.viewFor('u1').self.inbox.at(-1).text, /是恶魔/);
      }
      await room.act('u1', 'gather');
      if (g.winner || room.ended) break;
      if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
      if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
      await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
    }
    assert.ok(g.winner, `${script} 分出了胜负（第 ${days} 天）`);
    await room.teardown();
  }
});
