// 娱乐模式阿瓦隆：规则（engine/avalon.js）和房间流程（server/avalon.js）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Avalon, avalonRoles, AVALON_TEAMS, QUEST_SIZES, failsNeeded, isGood } from '../src/engine/avalon.js';
import { Room } from '../src/server/room.js';

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const make = (roles, opts = {}) => new Avalon(ids(roles.length), { roles, leader: 0, ...opts });
const seesOf = (g, id) => g.knowledge(id).map((k) => k.id).sort();

test('阵营人数和任务人数照官方表', () => {
  for (let n = 5; n <= 10; n++) {
    const roles = avalonRoles(n);
    assert.equal(roles.length, n);
    assert.deepEqual([roles.filter(isGood).length, roles.filter((r) => !isGood(r)).length], AVALON_TEAMS[n]);
  }
  assert.deepEqual(AVALON_TEAMS, { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] });
  assert.deepEqual(QUEST_SIZES[5], [2, 3, 2, 3, 3]);
  assert.deepEqual(QUEST_SIZES[6], [2, 3, 4, 3, 4]);
  assert.deepEqual(QUEST_SIZES[7], [2, 3, 3, 4, 4]);
  for (const n of [8, 9, 10]) assert.deepEqual(QUEST_SIZES[n], [3, 4, 4, 5, 5]);
  assert.equal(failsNeeded(6, 4), 1);
  assert.equal(failsNeeded(7, 4), 2);
  assert.equal(failsNeeded(7, 3), 1);
});

test('默认配置：5 人梅林、派西维尔、忠臣 / 莫甘娜、刺客；7 人起放莫德雷德；奥伯伦要开了才有', () => {
  assert.deepEqual(avalonRoles(5).sort(), ['assassin', 'loyal', 'merlin', 'morgana', 'percival']);
  assert.deepEqual(avalonRoles(7).filter((r) => !isGood(r)).sort(), ['assassin', 'mordred', 'morgana']);
  assert.deepEqual(avalonRoles(10).filter((r) => !isGood(r)).sort(), ['assassin', 'minion', 'mordred', 'morgana']);
  assert.deepEqual(avalonRoles(10, { oberon: true }).filter((r) => !isGood(r)).sort(), ['assassin', 'mordred', 'morgana', 'oberon']);
  assert.deepEqual(avalonRoles(5, { percival: false, morgana: false, mordred: false }).sort(), ['assassin', 'loyal', 'loyal', 'merlin', 'minion']);
  assert.deepEqual(avalonRoles(5, { percival: false, morgana: false }).filter((r) => !isGood(r)).sort(), ['assassin', 'mordred'], '坏人有空位就放开着的角色');
});

test('信息：梅林看不到莫德雷德、看得到奥伯伦；坏人互认但不认识奥伯伦；派西维尔看到梅林和莫甘娜', () => {
  //            p1        p2          p3       p4       p5          p6         p7        p8        p9          p10
  const g = make(['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred', 'oberon']);
  assert.deepEqual(seesOf(g, 'p1'), ['p10', 'p7', 'p8'], '梅林：刺客、莫甘娜、奥伯伦，没有莫德雷德');
  assert.deepEqual(seesOf(g, 'p2'), ['p1', 'p8'], '派西维尔：梅林和莫甘娜');
  assert.ok(g.knowledge('p2').every((k) => k.as === 'merlin'), '派西维尔分不清谁是谁');
  assert.deepEqual(seesOf(g, 'p7'), ['p8', 'p9'], '刺客认识莫甘娜和莫德雷德，不认识奥伯伦');
  assert.deepEqual(seesOf(g, 'p9'), ['p7', 'p8'], '莫德雷德认识同伴');
  assert.deepEqual(seesOf(g, 'p10'), [], '奥伯伦谁都不认识');
  assert.deepEqual(seesOf(g, 'p3'), [], '忠臣什么都不知道');
});

test('身份确认：所有人看完才开始第一轮', () => {
  const g = make(['merlin', 'loyal', 'loyal', 'assassin', 'morgana']);
  assert.equal(g.phase, 'night');
  for (const id of ['p1', 'p2', 'p3', 'p4']) assert.equal(g.setReady(id), false);
  assert.equal(g.setReady('p5'), true);
  g.begin();
  assert.equal(g.stage, 'propose');
  assert.equal(g.phase, 'day');
});

const started = (roles, opts) => { const g = make(roles, opts); g.begin(); return g; };
const voteAll = (g, yes) => { for (const p of g.players) g.vote(p.id, typeof yes === 'function' ? yes(p.id) : yes); return g.tally(); };

test('组队：只有队长能提名、人数要对；过半赞成才通过，平票不通过', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana']);
  assert.throws(() => g.propose('p2', ['p1', 'p2']), /只有队长/);
  assert.throws(() => g.propose('p1', ['p1', 'p2', 'p3']), /要选 2 个人/);
  g.propose('p1', ['p3', 'p1']);
  assert.deepEqual(g.team, ['p1', 'p3'], '按座位排');
  const yes = new Set(['p1', 'p2', 'p3']); // 6 人里 3 票赞成：平票，不过半
  const rec = voteAll(g, (id) => yes.has(id));
  assert.equal(rec.approved, false);
  assert.equal(g.stage, 'propose');
  assert.equal(g.leaderId(), 'p2', '队长交给下一个座位');
  assert.equal(g.attempt, 2);
  g.propose('p2', ['p2', 'p3']);
  yes.add('p4');
  assert.equal(voteAll(g, (id) => yes.has(id)).approved, true);
  assert.equal(g.stage, 'quest');
});

test('同一轮连续 5 次组队被否决：坏人直接获胜', () => {
  const g = started(['merlin', 'percival', 'loyal', 'assassin', 'morgana']);
  for (let k = 1; k <= 5; k++) {
    assert.equal(g.attempt, k);
    g.propose(g.leaderId(), [g.leaderId(), g.players.find((p) => p.id !== g.leaderId()).id]);
    voteAll(g, false);
  }
  assert.equal(g.winner, 'evil');
  assert.match(g.winReason, /5 次/);
  assert.equal(g.stage, 'ended');
});

test('任务票：好人不能出失败；只记失败票张数；一张失败就失败', () => {
  const g = started(['merlin', 'percival', 'loyal', 'assassin', 'morgana']);
  g.propose('p1', ['p1', 'p4']);
  voteAll(g, true);
  assert.throws(() => g.play('p1', false), /好人只能出「成功」/);
  assert.throws(() => g.play('p2', true), /不在这次任务的队伍里/);
  g.play('p1', true);
  assert.throws(() => g.reveal(), /还有人没出/);
  assert.equal(g.play('p4', false), true);
  const out = g.reveal();
  assert.deepEqual(out, { round: 1, quest: 1, result: 'fail', fails: 1 });
  assert.equal(g.quests[0].result, 'fail');
  assert.deepEqual(g.quests[0].team, ['p1', 'p4']);
  assert.equal(g.round, 2);
  assert.equal(g.leaderId(), 'p2', '下一轮队长是下一个座位');
});

/** 跑一轮任务：队长带上 team，全体赞成，fails 个坏人出失败。 */
function quest(g, team, failers = []) {
  g.propose(g.leaderId(), team);
  voteAll(g, true);
  for (const id of g.team) g.play(id, !failers.includes(id));
  return g.reveal();
}

test('7 人及以上第 4 轮要 2 张失败票才失败', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred']);
  quest(g, ['p1', 'p2'], []);           // 第 1 轮 2 人 成功
  quest(g, ['p1', 'p2', 'p5'], ['p5']); // 第 2 轮 3 人 失败
  quest(g, ['p1', 'p2', 'p6'], ['p6']); // 第 3 轮 3 人 失败
  assert.equal(g.round, 4);
  assert.equal(g.quest().need, 2);
  const out = quest(g, ['p1', 'p2', 'p3', 'p5'], ['p5']); // 只有 1 张失败：仍然成功
  assert.equal(out.result, 'success');
  assert.equal(out.fails, 1);
  const g2 = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred']);
  quest(g2, ['p1', 'p2'], []);
  quest(g2, ['p1', 'p2', 'p5'], ['p5']);
  quest(g2, ['p1', 'p2', 'p3'], []);
  assert.equal(quest(g2, ['p1', 'p5', 'p6', 'p7'], ['p5', 'p6']).result, 'fail', '2 张失败票才失败');
});

test('6 人第 4 轮一张失败就失败', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana']);
  quest(g, ['p1', 'p2'], []);
  quest(g, ['p1', 'p2', 'p5'], ['p5']);
  quest(g, ['p1', 'p2', 'p3', 'p4'], []);
  assert.equal(quest(g, ['p1', 'p2', 'p5'], ['p5']).result, 'fail');
});

test('三次任务失败：坏人获胜，不进刺杀', () => {
  const g = started(['merlin', 'percival', 'loyal', 'assassin', 'morgana']);
  quest(g, ['p1', 'p4'], ['p4']);
  quest(g, ['p1', 'p2', 'p4'], ['p4']);
  quest(g, ['p1', 'p5'], ['p5']);
  assert.equal(g.winner, 'evil');
  assert.match(g.winReason, /三次任务失败/);
});

test('三次任务成功进入刺杀：刺客指对梅林坏人赢，指错好人赢', () => {
  const run = () => {
    const g = started(['merlin', 'percival', 'loyal', 'assassin', 'morgana']);
    quest(g, ['p1', 'p2'], []);
    quest(g, ['p1', 'p2', 'p3'], []);
    quest(g, ['p2', 'p3'], []);
    assert.equal(g.stage, 'assassin');
    assert.equal(g.winner, null);
    assert.equal(g.assassinId(), 'p4');
    return g;
  };
  const g = run();
  assert.throws(() => g.assassinate('p5', 'p1'), /只有刺客/);
  assert.throws(() => g.assassinate('p4', 'p4'), /只能指认好人/);
  assert.throws(() => g.assassinate('p4', 'p5'), /只能指认好人/, '规则书：刺客指认一名好人，认识的同伴不能选');
  assert.deepEqual(g.assassinOptions(), ['p1', 'p2', 'p3']);
  assert.throws(() => g.suggestTarget('p5', 'p4'), /只能建议好人/);
  g.suggestTarget('p5', 'p2'); // 莫甘娜给刺客出主意
  assert.deepEqual(g.suggest, { p5: 'p2' });
  assert.throws(() => g.suggestTarget('p3', 'p1'), /同伴/);
  assert.deepEqual(g.assassinate('p4', 'p2'), { merlin: false });
  assert.equal(g.winner, 'good');
  const g2 = run();
  assert.deepEqual(g2.assassinate('p4', 'p1'), { merlin: true });
  assert.equal(g2.winner, 'evil');
});

test('刺杀阶段坏人亮明身份一起商量（大众玩法）：奥伯伦也能出主意，刺客不会指到他', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'oberon']);
  quest(g, ['p1', 'p2'], []);
  quest(g, ['p1', 'p2', 'p3'], []);
  quest(g, ['p1', 'p2', 'p3'], []);
  assert.ok(!g.assassinOptions().includes('p7'));
  assert.ok(!g.assassinOptions().includes('p6'));
  g.suggestTarget('p7', 'p1');
  assert.equal(g.suggest.p7, 'p1');
  assert.throws(() => g.assassinate('p5', 'p7'), /只能指认好人/);
  g.assassinate('p5', 'p2');
  assert.equal(g.winner, 'good');
});

test('梅林可以不放（基础局）：没有刺客、派西维尔、莫甘娜，三次任务成功好人直接赢', () => {
  const roles = avalonRoles(7, { merlin: false });
  assert.deepEqual(roles.filter(isGood), ['loyal', 'loyal', 'loyal', 'loyal']);
  assert.ok(!roles.includes('assassin') && !roles.includes('morgana'));
  assert.equal(roles.filter((r) => !isGood(r)).length, 3);
  const g = started(['loyal', 'loyal', 'loyal', 'minion', 'minion'], { options: { merlin: false } });
  quest(g, ['p1', 'p2'], []);
  quest(g, ['p1', 'p2', 'p3'], []);
  quest(g, ['p1', 'p2'], []);
  assert.equal(g.winner, 'good');
  assert.equal(g.stage, 'ended');
});

test('自选任务（官方可选规则）：队长挑任务，每个只做一次，第 5 个要先成功两个，第 4 个仍要 2 张失败', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'], { options: { targeting: true } });
  assert.equal(g.questNo, null);
  assert.deepEqual(g.questOptions(), [1, 2, 3, 4]);
  assert.throws(() => g.propose('p1', ['p1', 'p2']), /先选/);
  assert.throws(() => g.propose('p1', ['p1', 'p2'], 5), /第 5 个任务要先成功两个/);
  assert.throws(() => g.propose('p1', ['p1', 'p2'], 4), /要选 4 个人/);
  g.propose('p1', ['p1', 'p2', 'p3', 'p5'], 4);
  voteAll(g, false); // 否决：下一任队长重新挑
  assert.equal(g.questNo, null);
  g.propose('p2', ['p1', 'p2', 'p3', 'p5'], 4);
  voteAll(g, true);
  for (const id of g.team) g.play(id, id !== 'p5');
  assert.equal(g.reveal().result, 'success', '第 4 个任务 1 张失败不算失败');
  assert.equal(g.quests[3].round, 1);
  assert.deepEqual(g.questOptions(), [1, 2, 3]);
  g.propose(g.leaderId(), ['p1', 'p2'], 1);
  voteAll(g, true);
  for (const id of g.team) g.play(id, true);
  g.reveal();
  assert.deepEqual(g.questOptions(), [2, 3, 5], '成功两个之后才能做第 5 个');
  assert.equal(g.proposals.at(-1).quest, 1);
});

test('湖中仙女：第 2、3、4 轮后用，看阵营只有自己知道，不能查拿过的人', () => {
  const g = started(['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'], { options: { lady: true } });
  assert.equal(g.lady.holder, 'p7', '第一任队长右手边（上一个座位）');
  quest(g, ['p1', 'p2'], []);
  assert.equal(g.stage, 'propose', '第 1 轮后不用');
  quest(g, ['p1', 'p2', 'p5'], ['p5']);
  assert.equal(g.stage, 'lady');
  assert.ok(!g.ladyOptions().includes('p7'));
  assert.deepEqual(g.useLady('p7', 'p1'), { good: true });
  assert.equal(g.lady.holder, 'p1');
  assert.deepEqual(g.ladySeen.p7, [{ id: 'p1', good: true, round: 2 }]);
  assert.equal(g.stage, 'propose');
  assert.equal(g.round, 3);
  quest(g, ['p1', 'p2', 'p3'], []);
  assert.equal(g.stage, 'lady');
  assert.throws(() => g.useLady('p1', 'p7'), /不能查看/, '拿过湖中仙女的人不能查');
  assert.deepEqual(g.useLady('p1', 'p6'), { good: false });
});

test('存档读档：规则状态原样回来', () => {
  const g = started(['merlin', 'percival', 'loyal', 'assassin', 'morgana']);
  quest(g, ['p1', 'p4'], ['p4']);
  g.propose(g.leaderId(), ['p1', 'p2', 'p3']);
  g.vote('p1', true);
  const back = Avalon.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.equal(back.avalon, true);
  assert.equal(back.stage, 'vote');
  assert.equal(back.round, 2);
  assert.deepEqual(back.votes, { p1: true });
  assert.deepEqual(back.knowledge('p1'), g.knowledge('p1'));
  assert.equal(back.quests[0].result, 'fail');
});

// ───────────── 房间 ─────────────
function mockVoice() {
  let n = 0;
  return {
    async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; },
    async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {},
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };

async function avalonRoom(bots, settings = {}) {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { pauseMs: 5, shuffle: false, script: 'avalon', ...settings } });
  room.av.limits = { reveal: 0.05, propose: 0.05, vote: 0.05, quest: 0.05, lady: 0.05, assassin: 0.05 };
  room.av.pauseMs = 5;
  room.av.speed = 0.002;
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: bots });
  return room;
}

test('在场的角色按固定顺序列，不按座位（不然排第一的就是 1 号的角色）', async () => {
  const room = await avalonRoom(6);
  await room.act('u1', 'start');
  const g = room.game;
  const want = ['merlin', 'percival', 'loyal', 'assassin', 'morgana', 'mordred'];
  for (const seats of [['assassin', 'loyal', 'merlin', 'mordred', 'percival', 'loyal', 'morgana'], ['morgana', 'mordred', 'loyal', 'assassin', 'loyal', 'percival', 'merlin']]) {
    seats.forEach((role, i) => { g.players[i].role = role; });
    assert.deepEqual(room.viewFor('u1').avalon.roles.map((r) => r.id), want);
  }
  assert.ok(!/在场的特殊角色：(刺客|莫甘娜|莫德雷德)/.test(room.log.find((l) => l.kind === 'start').text), '开局公告也按固定顺序：梅林在最前');
  await room.teardown();
});

test('房间：阿瓦隆只能 5–10 人；加机器人加到 10 个为止', async () => {
  const room = await avalonRoom(20);
  assert.equal(room.lobby.length, 10);
  room.lobby.push({ id: 'bot-99', name: 'x', fake: true });
  await assert.rejects(room.act('u1', 'start'), /5–10 名玩家/);
  await room.teardown();
});

test('房间：机器人能跑完整局（真人超时由系统代选），视图不漏别人的身份', async () => {
  const runs = [[5, {}], [7, { avalonLady: true, avalonTargeting: true }], [10, { avalonLady: true }], [6, { avalonRoles: { merlin: false } }]];
  for (const [n, extra] of runs) {
    const room = await avalonRoom(n - 1, extra);
    await room.act('u1', 'start');
    const g = room.game;
    assert.ok(g.avalon);
    assert.equal(room.viewFor('u1').phase, 'night');
    const v = room.viewFor('u1');
    assert.equal(v.script, 'avalon');
    assert.ok(v.self.role.name);
    assert.ok(v.players.every((p) => p.role === undefined), '开局后看不到别人的身份');
    await until(() => room.ended, 15000);
    assert.ok(room.ended, `${n} 人局没跑完：停在 ${g.stage}`);
    assert.ok(['good', 'evil'].includes(g.winner));
    const end = room.viewFor('u1');
    assert.equal(end.phase, 'ended');
    assert.ok(end.players.every((p) => p.roleName), '终局公开所有身份');
    assert.ok(g.proposals.length >= 1);
    await room.teardown();
  }
});

test('房间：真人当队长、投票、出任务票都走 act', async () => {
  const room = await avalonRoom(4);
  room.av.limits = { reveal: 30, propose: 30, speech: 30, vote: 30, quest: 30, lady: 30, assassin: 30 };
  room.av.speed = 0.002;
  await room.act('u1', 'start');
  const g = room.game;
  g.leader = g.players.findIndex((p) => p.id === 'u1'); // 让真人当第一任队长
  await assert.rejects(room.act('u1', 'avalon', { kind: 'propose', team: ['u1', 'bot-1'] }), /不是组队的时候/, '身份确认时还不能组队');
  await room.act('u1', 'avalon', { kind: 'ready' });
  assert.equal(g.stage, 'propose');
  await assert.rejects(room.act('bot-1', 'avalon', { kind: 'propose', team: ['u1', 'bot-1'] }), /只有队长/);
  await assert.rejects(room.act('u1', 'avalon', { kind: 'propose', team: ['u1'] }), /要选 2 个人/);
  await room.act('u1', 'avalon', { kind: 'propose', team: ['u1', 'bot-1'] });
  // 顺序发言：从队长的下一个座位起，队长最后归票
  assert.equal(g.stage, 'speech');
  const order = room.viewFor('u1').avalon.speakers;
  assert.equal(order.length, g.n);
  assert.equal(order.at(-1), 'u1', '队长最后发言');
  assert.equal(order[0], g.players[(g.leader + 1) % g.n].id, '从队长的下一个座位开始');
  await assert.rejects(room.act('u1', 'avalon', { kind: 'speechDone' }), /不是你发言/, '没轮到不能说完');
  await assert.rejects(room.act('u1', 'avalon', { kind: 'vote', yes: true }), /不是投票的时候/, '发言没结束不能投票');
  await until(() => g.speaker() === 'u1');
  await assert.rejects(room.act('u1', 'avalon', { kind: 'speechDone', team: ['u1'] }), /要选 2 个人/);
  await room.act('u1', 'avalon', { kind: 'speechDone', team: ['bot-2', 'u1'] });
  assert.equal(g.stage, 'vote', '队长归票完开始投票');
  assert.deepEqual([...g.team].sort(), ['bot-2', 'u1'], '归票时换了人');
  await room.act('u1', 'avalon', { kind: 'vote', yes: true });
  assert.equal(room.viewFor('u1').self.myVote, true);
  assert.equal(room.viewFor('bot-1').self.myVote, null, '开票前看不到别人投的什么');
  assert.ok(room.viewFor('bot-1').avalon.voted.includes('u1'), '看得到谁已经投了');
  await until(() => g.stage !== 'vote');
  const rec = g.proposals.at(-1);
  assert.equal(rec.votes.u1, true, '开票后公开每个人的票');
  if (rec.approved) {
    assert.equal(g.stage, 'quest');
    if (!isGood(g.roleOf('u1'))) assert.ok(room.viewFor('u1').self.canFail);
    else await assert.rejects(room.act('u1', 'avalon', { kind: 'quest', success: false }), /好人只能出/);
    await room.act('u1', 'avalon', { kind: 'quest', success: true });
    await until(() => g.quests[0].result);
    assert.ok(g.quests[0].result);
    assert.equal(room.viewFor('u1').avalon.quests[0].fails, g.quests[0].fails);
  }
  await room.teardown();
});

test('房间：阿瓦隆没有自由活动和私聊，一直在圆桌（旧设置里的自由活动分钟数也不管）', async () => {
  const room = await avalonRoom(4, { avalonRoamMinutes: 2 });
  room.av.limits = { reveal: 0.05, propose: 30, vote: 30, quest: 30, lady: 30, assassin: 30 };
  await room.act('u1', 'start');
  const g = room.game;
  await until(() => !!room.deadline && g.stage !== 'reveal', 3000);
  assert.equal(room.roam, null, '不进小镇地图');
  assert.ok(room.deadline, '确认身份后直接组队计时');
  for (const type of ['roam', 'roamVote', 'pull', 'gather', 'invite', 'nominate']) {
    await assert.rejects(room.act('u1', type, {}), /阿瓦隆里没有这个操作/, type);
  }
  assert.equal(room.viewFor('u1').roam, null);
  await room.teardown();
});

test('房间：旧存档停在自由活动里，读档后回圆桌接着组队', async () => {
  const room = await avalonRoom(4);
  room.av.limits = { reveal: 0.05, propose: 30, vote: 30, quest: 30, lady: 30, assassin: 30 };
  await room.act('u1', 'start');
  await until(() => room.game.stage === 'propose' && !!room.deadline, 3000);
  room.deadline = null;
  room.startRoam(1); // 模拟上一版的「每轮前自由活动」
  const snap = JSON.parse(JSON.stringify(room.snapshot()));
  await room.teardown();
  const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice() }).restore(snap);
  back.av.speed = 0.002;
  assert.ok(back.roam);
  back.resume();
  await until(() => !back.roam && !!back.deadline, 3000);
  assert.equal(back.roam, null);
  assert.ok(back.deadline);
  await back.teardown();
});

test('房间：存档读档后接着跑完', async () => {
  const room = await avalonRoom(5);
  room.av.limits = { reveal: 0.05, propose: 0.05, vote: 30, quest: 0.05, lady: 0.05, assassin: 0.05 };
  await room.act('u1', 'start');
  await until(() => room.game.stage === 'vote');
  const snap = JSON.parse(JSON.stringify(room.snapshot()));
  await room.teardown();
  const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice() }).restore(snap);
  back.av.limits = { reveal: 0.05, propose: 0.05, vote: 0.05, quest: 0.05, lady: 0.05, assassin: 0.05 };
  back.av.pauseMs = 5;
  back.av.speed = 0.002;
  assert.ok(back.game.avalon);
  assert.equal(back.game.stage, 'vote');
  back.resume();
  await back.act('u1', 'avalon', { kind: 'vote', yes: false }); // 真人接着投（机器人读档后自己会投）
  await until(() => back.ended, 15000);
  assert.ok(back.ended);
  await back.teardown();
});

test('顺序发言：队长提名后从下一个座位起每人一轮，队长最后归票（可以换人），然后投票；被否决后下一任队长重新来', () => {
  const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
  const g = new Avalon(players, { options: { speech: true }, leader: 2 });
  for (const p of players) g.setReady(p.id);
  g.begin();
  g.propose('p3', ['p3', 'p5']);
  assert.equal(g.stage, 'speech');
  assert.deepEqual(g.speakers, ['p4', 'p5', 'p6', 'p1', 'p2', 'p3'], '队长 3 号：从 4 号起，队长最后');
  assert.throws(() => g.endSpeech('p5'), /不是你发言/);
  assert.throws(() => g.vote('p1', true), /不是投票的时候/);
  for (const id of ['p4', 'p5', 'p6', 'p1', 'p2']) assert.equal(g.endSpeech(id, ['p1', 'p2']).vote, false, '不是队长：带队伍也不改');
  assert.deepEqual(g.team, ['p3', 'p5']);
  const out = g.endSpeech('p3', ['p6', 'p3']);
  assert.deepEqual(out, { vote: true, changed: true });
  assert.deepEqual(g.team, ['p3', 'p6'], '归票换了人，按座位排');
  assert.equal(g.stage, 'vote');
  for (const p of players) g.vote(p.id, false);
  g.tally();
  assert.equal(g.stage, 'propose');
  assert.equal(g.leaderId(), 'p4');
  g.propose('p4', ['p4', 'p1']);
  assert.equal(g.speaker(), 'p5', '新队长的下一个座位先说');
  const back = Avalon.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.equal(back.speaker(), 'p5', '存档读回来接着发言');
});
