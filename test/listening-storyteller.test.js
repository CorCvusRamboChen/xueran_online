// 听场的说书人（2026-11-19 用户：用夜半狂欢的全员收音让 AI 听到所有人的发言、更懂场面，
// 目标是无神论者局里 AI 说书人的控场胜过真人说书人）。
// 两部分：① 无神论者局不露馅（每个会拿信息的角色都按说书人假装的邪恶阵营给，前后对得上）；
// ② 读场：黄昏把发言交给 AI 整理成场面，说书人照它挑人、配合伪装、算局势。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { worldTeam } from '../src/engine/storyteller.js';
import { parseTable, mechanicalTable, tableFeatures, tableLead, describeTable } from '../src/engine/tableRead.js';
import { Room } from '../src/server/room.js';
import { ROLES } from '../src/engine/roles.js';

const ROLE_NAME = (r) => ROLES[r].name;

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'mo', misregister: 0 });
const ATHEIST = ['atheist', 'snakecharmer', 'balloonist', 'savant', 'noble', 'farmer', 'professor', 'drunk', 'fisherman'];

function night(g) {
  g.startNight();
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 10; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  return r;
}

// ───────────── 读场结果的整理 ─────────────
test('读场：座位号、角色名都要在本局对得上；指控说书人记成 storyteller', () => {
  const g = mk(ATHEIST);
  const t = parseTable({
    claims: [{ seat: 2, role: '舞蛇人', info: '我昨晚选了 5 号' }, { seat: 3, role: '小恶魔' }, { seat: 99, role: '贵族' }, { seat: 5, role: 'Noble', info: '' }],
    suspects: [{ seat: 4, score: 1.7, as: 'demon' }, { seat: 40, score: 0.5 }],
    trusted: [{ seat: 2, score: 0.8 }],
    accusations: [{ from: 2, to: 4 }, { from: 6, to: 0 }, { from: 3, to: 3 }],
    atheist: 0.35, stVoices: [6, 6, 77], summary: '大家在怀疑 4 号',
  }, g);
  assert.deepEqual(Object.keys(t.claims).sort(), ['p2', 'p5'], '不在剧本里的角色（小恶魔）、不存在的座位都丢掉；英文名也认');
  assert.equal(t.claims.p5.role, 'noble');
  assert.deepEqual(t.suspects.p4, { score: 1, as: 'demon' }, '分数夹在 0 到 1');
  assert.deepEqual(t.accusations, [['p2', 'p4'], ['p6', 'storyteller']], '自己指控自己的丢掉');
  assert.deepEqual(t.stVoices, ['p6']);
  assert.match(describeTable(t, g), /最被怀疑：4号 玩家4/);
  assert.doesNotMatch(describeTable(t, g, { summary: false }), /大家在怀疑/, '写进手记的不带模型的概括');
});

test('读场兜底：没有发言时看提名——提名过说书人的算在推「没有邪恶」', () => {
  const g = mk(ATHEIST);
  night(g); g.dawn();
  g.nominate('p2', 'p4');
  g.nominate('p3', 'storyteller');
  const t = mechanicalTable(g);
  assert.ok(t.suspects.p4.score > 0);
  assert.deepEqual(t.stVoices, ['p3']);
  assert.ok(t.atheist > 0);
  assert.deepEqual(t.accusations, [['p2', 'p4']]);
});

// ───────────── 无神论者局：不露馅 ─────────────
test('无神论者局的博学者：一真一假都按假世界说，不会说出「0 名邪恶」，也不提无神论者', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = mk(ATHEIST, seed);
    assert.ok(g.atheist);
    night(g); g.dawn();
    const w = g.atheistWorld();
    const lines = g.st.savantLines(g.get('p4'), 'atheist');
    assert.equal(lines.length, 2);
    for (const l of lines) {
      assert.doesNotMatch(l, /无神论者/, l);
      assert.doesNotMatch(l, /存活的玩家里有 0 名邪恶/, `假世界里有 ${w.evil.size} 名邪恶活着：${l}`);
    }
  }
});

test('无神论者局：艺术家的答案不翻转、失忆者照实答（以前都被当成失效）', () => {
  const g = mk(['atheist', 'amnesiac', 'savant', 'noble', 'farmer', 'professor', 'drunk']);
  night(g); g.dawn();
  assert.equal(g.artistAnswer('p3', 'true'), 'true');
  const r = g.amnesiacGuess('p2', '我能拿信息');
  assert.equal(r.lie, null);
  assert.match(g.factsFake(), /场上没有无神论者/);
  assert.doesNotMatch(g.factsFake(), /无神论者局/);
});

test('无神论者局的气球驾驶员：按假世界的类型给，看得到「爪牙」「恶魔」类型的人，前后类型不重复', () => {
  let sawEvil = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = mk(ATHEIST, seed);
    const w = g.atheistWorld();
    let last = null;
    for (let k = 0; k < 4; k++) {
      const t = g.st.balloonPick(g.get('p3'), last, null, w);
      const type = worldTeam(w, t);
      if (last) assert.notEqual(type, last, '和上一晚的类型不同');
      if (type === 'minion' || type === 'demon') sawEvil++;
      last = type;
    }
  }
  assert.ok(sawEvil > 10, `看到假邪恶类型 ${sawEvil} 次`);
});

test('无神论者局：假恶魔被处决，换成和给过的信息都对得上的假邪恶，游戏照常进行', () => {
  const g = mk(ATHEIST);
  night(g); g.dawn();
  const w = g.atheistWorld();
  const [first, second] = [...w.evil];
  w.demon = first;
  w.demonOk = [first, second]; // 两个人当恶魔都对得上
  const p = g.get(first);
  g.snvDie(p, 'execution', []);
  assert.equal(w.demon, second, '换成另一个对得上的假邪恶');
  assert.ok(!g.winner, '游戏照常进行');
  assert.ok(g.timeline.some((e) => /之前给出的信息都对得上/.test(e.text)));
});

test('无神论者局：恶魔相关的是/否信息会限制以后能换成谁', () => {
  const g = mk(ATHEIST);
  night(g); g.dawn();
  const w = g.atheistWorld();
  const [a, b] = [...w.evil];
  w.demon = a; w.demonOk = null;
  // 某人得知「a 是恶魔」：以后只有 a 当恶魔才对得上
  const said = g.infoYes(g.get('p4'), false, (x) => x.demon === a);
  assert.equal(said, true);
  assert.deepEqual(w.demonOk, [a]);
  // a 死了：没有对得上的人，只能换成别的假邪恶，并记下风险
  g.snvDie(g.get(a), 'execution', []);
  assert.equal(w.demon, b);
  assert.ok(g.timeline.some((e) => /可能对不上/.test(e.text)));
});

test('无神论者局的舞蛇人：选中假恶魔时假恶魔换人，被选的人以后不会再当恶魔', () => {
  const g = mk(ATHEIST);
  night(g); g.dawn(); g.endDay();
  const w = g.atheistWorld();
  const demon = w.demon;
  g.startNight();
  g.submitChoice('p2', [demon]);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 10; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  assert.notEqual(w.demon, demon, '假恶魔换人了');
  assert.ok(!w.demonOk.includes(demon));
  assert.equal(g.get('p2').role, 'snakecharmer', '舞蛇人没有被换成别的角色');
});

test('无神论者局：假恶魔照读场杀人——几乎不杀在推处决说书人的人，多杀被信任的、指认假恶魔的', () => {
  const kills = {};
  for (let seed = 1; seed <= 150; seed++) {
    const g = mk(ATHEIST, seed);
    night(g); g.dawn();
    const w = g.atheistWorld();
    const good = g.alive().filter((q) => !w.evil.has(q.id));
    const [loud, trusted, accuser, suspect] = good;
    g.tableRead = () => ({ gameId: g.id, day: g.day, claims: {}, suspects: { [suspect.id]: { score: 0.9, as: 'demon' } }, trusted: { [trusted.id]: 0.9 }, accusations: [[accuser.id, w.demon]], atheist: 0.5, stVoices: [loud.id] });
    const v = g.st.atheistVictim(good, w);
    const tag = v.id === loud.id ? 'loud' : v.id === trusted.id ? 'trusted' : v.id === accuser.id ? 'accuser' : v.id === suspect.id ? 'suspect' : 'other';
    kills[tag] = (kills[tag] ?? 0) + 1;
  }
  assert.ok((kills.loud ?? 0) < 10, `推处决说书人的被杀 ${kills.loud ?? 0} 次`);
  assert.ok((kills.suspect ?? 0) < 10, `被怀疑的被杀 ${kills.suspect ?? 0} 次`);
  assert.ok((kills.trusted ?? 0) + (kills.accuser ?? 0) > 80, JSON.stringify(kills));
});

// ───────────── 读场接进说书人 ─────────────
test('读场：语音里报的身份说书人也知道（配合伪装）；大家怀疑真恶魔时局势偏善良', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'poisoner', 'vigormortis']);
  night(g); g.dawn();
  const before = g.st.balance();
  g.tableRead = () => ({ gameId: g.id, day: g.day, claims: { p6: { role: 'farmer', info: '' } }, suspects: { p7: { score: 0.95, as: 'demon' } }, trusted: {}, accusations: [], atheist: 0, stVoices: [] });
  assert.equal(g.st.claimOf('p6'), 'farmer');
  const lead = tableLead(g.tableRead(), g);
  assert.ok(lead > 0.5, `读场局势 ${lead}`);
  g.signals = () => ({ tableLead: lead });
  assert.ok(g.st.balance() > before, '局势往善良偏');
  assert.equal(tableFeatures(g.tableRead(), 'p7').suspected, 0.95);
});

const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, rpsSeconds: 0.05 };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：夜半狂欢黄昏读场——只给模型公开情况和发言，结果给说书人用、真人说书台看得到', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'mo' } });
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    let seen = null;
    room.tableJudge = async (facts, talk, roleNames) => {
      seen = { facts, talk, roleNames };
      return { claims: [{ seat: 1, role: '贵族', info: '三个人里有一个邪恶' }], suspects: [{ seat: 2, score: 0.7, as: 'demon' }], trusted: [], accusations: [{ from: 1, to: 2 }], atheist: 0.1, stVoices: [], summary: '' };
    };
    room.talk = [{ day: 1, lines: { u1: ['我是贵族，我觉得二号是恶魔'] } }];
    await room.readTableNow(g);
    assert.ok(seen, '问了模型');
    assert.match(seen.talk, /我是贵族/);
    for (const q of g.players) assert.ok(!seen.facts.includes(ROLE_NAME(q.role)) || g.claims?.[q.id], `公开情况里不能有真实身份：${q.role}`);
    assert.equal(room.tableRead.claims.u1.role, 'noble');
    assert.equal(g.st.claimOf('u1'), 'noble');
    assert.ok(g.st.journal.some((e) => /黄昏读场：.*最被怀疑：2号/.test(e.text)), 'AI 说书人的手记里有读场');
    assert.ok(!g.st.journal.some((e) => /我是贵族/.test(e.text)), '手记（会存档）里没有原话');
    // 读档后还在
    const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice() }).restore(JSON.parse(JSON.stringify(room.snapshot())));
    assert.equal(back.tableRead.claims.u1.role, 'noble');
    await back.teardown?.();
  } finally { await room.teardown(); }
});

