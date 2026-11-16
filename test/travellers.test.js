// 旅行者（2026-11-16 用户要的）：中途加入、离开、流放；窃贼、官员、枪手、替罪羊、法官、巫毒师。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const TB = ['washerwoman', 'librarian', 'empath', 'chef', 'monk', 'poisoner', 'imp'];
const SNV = ['clockmaker', 'dreamer', 'oracle', 'seamstress', 'savant', 'witch', 'vigormortis'];
const BMR = ['grandmother', 'sailor', 'chambermaid', 'exorcist', 'gambler', 'godfather', 'zombuul'];
function night(g) {
  g.startNight();
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 5; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  return r;
}
const mk = (roles, script) => new Game(players(roles.length), { roles, rng: makeRng(5), script, misregister: 0 });

for (const [script, roles] of [['tb', TB], ['bmr', BMR], ['snv', SNV]]) {
  test(`${script}：白天加入旅行者，邪恶的得知恶魔；不算「只剩两人」；不能被提名；离开`, () => {
    const g = mk(roles, script);
    night(g); g.dawn();
    assert.throws(() => g.addTraveller({ id: 't1', name: '旅人' }, 'nobody', false), /没有这个旅行者/);
    const msg = g.addTraveller({ id: 't1', name: '旅人' }, 'scapegoat', true);
    assert.match(msg, /邪恶/);
    assert.match(msg, /恶魔是 \*\*7号 玩家7\*\*/);
    assert.throws(() => g.addTraveller({ id: 't2', name: '乙' }, 'scapegoat', false), /已经有人当了/);
    assert.equal(g.get('t1').seat, 8);
    assert.equal(g.evilOf(g.get('t1')), true);
    assert.throws(() => g.nominate('p1', 't1'), /旅行者不能被提名/);
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p6']) g.get(id).alive = false; // 只剩恶魔和 5 号，旅行者不算
    g.checkWinner();
    assert.equal(g.winner, 'evil');
    const h = mk(roles, script);
    night(h); h.dawn();
    h.addTraveller({ id: 't1', name: '旅人' }, 'thief', false);
    h.removeTraveller('t1');
    assert.equal(h.get('t1').left, true);
    assert.equal(h.canVote('t1'), false);
    assert.throws(() => h.nominate('t1', 'p1'), /离开了这局/);
  });
}

test('夜里不能加入', () => {
  const g = mk(TB, 'tb');
  g.startNight();
  assert.throws(() => g.addTraveller({ id: 't1', name: '旅人' }, 'thief', false), /夜里不能加入/);
});

test('窃贼和官员：昨晚选的人今天投票算负票 / 三票', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.addTraveller({ id: 'th', name: '窃' }, 'thief', true);
  g.addTraveller({ id: 'bu', name: '官' }, 'bureaucrat', false);
  g.endDay();
  g.startNight();
  g.submitChoice('th', ['p1']);
  g.submitChoice('bu', ['p2']);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  g.resolveNight(); g.dawn();
  const r = g.recordVote('p6', ['p1', 'p2', 'p3']);
  assert.equal(r.count, -1 + 3 + 1);
});

test('巫毒师：只有他和死人能投，死人不消耗票，不需要过半数', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.addTraveller({ id: 'vo', name: '巫' }, 'voudon', false);
  g.get('p1').alive = false;
  assert.equal(g.canVote('p2'), false);
  assert.equal(g.canVote('vo'), true);
  assert.equal(g.canVote('p1'), true);
  assert.equal(g.threshold(), 1);
  const r = g.recordVote('p6', ['p1', 'p2', 'vo']);
  assert.equal(r.count, 2);
  assert.equal(r.outcome, 'block');
  assert.equal(g.get('p1').ghostVote, true, '死人不消耗投票标记');
});

test('替罪羊：同阵营的人被处决，说书人可能让他替死', () => {
  let swapped = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = new Game(players(7), { roles: TB, rng: makeRng(seed), script: 'tb', misregister: 0 });
    night(g); g.dawn();
    g.addTraveller({ id: 'sg', name: '羊' }, 'scapegoat', false);
    g.block = 'p1'; g.endDay();
    if (!g.get('sg').alive) { swapped++; assert.equal(g.get('p1').alive, true); }
  }
  assert.ok(swapped > 0 && swapped < 30, `替了 ${swapped} 次`);
});

test('枪手：今天第一次投票后，打死一名投过票的人；每天一次', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.addTraveller({ id: 'gs', name: '枪' }, 'gunslinger', false);
  assert.throws(() => g.gunslinger('gs', 'p1', []), /还没有统计过投票/);
  assert.throws(() => g.gunslinger('gs', 'p2', ['p1']), /投过票的人/);
  assert.equal(g.gunslinger('gs', 'p1', ['p1']).died, true);
  assert.throws(() => g.gunslinger('gs', 'p3', ['p3']), /今天已经开过枪/);
});

test('法官：别人的提名，强制成功或失败；每局一次', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.addTraveller({ id: 'ju', name: '法' }, 'judge', false);
  assert.throws(() => g.judgeUse('ju', 'ju', true), /别人发起/);
  assert.equal(g.judgeUse('ju', 'p1', true), true);
  const r = g.recordVote('p6', [], 'pass');
  assert.equal(r.outcome, 'block');
  assert.throws(() => g.judgeUse('ju', 'p1', false), /已经用过/);
});

// ───────────── 房间：观战的人加入、流放举手 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, exileSeconds: 0.05 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：观战的人白天以旅行者加入，公开角色；提议流放、全体举手过一半就流放', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'tb' } });
  room.judgeReady = () => false;
  room.botsConsider = () => {};
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二'], ['late', '迟到的']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    assert.equal(room.viewFor('late').canTravel, false, '夜里不能加入');
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
      await sleep(3);
    }
    await until(() => g.phase === 'day', 2000);
    assert.equal(room.viewFor('late').canTravel, true);
    await room.act('late', 'traveller', { role: 'gunslinger' });
    assert.equal(g.get('late').traveller, true);
    assert.ok(room.log.some((l) => /迟到的.*以旅行者身份加入.*枪手/.test(l.text)));
    assert.equal(room.viewFor('u1').players.find((p) => p.id === 'late').travellerRole, '枪手');
    await room.act('u1', 'exile', { target: 'late' });
    assert.ok(room.exile);
    await assert.rejects(room.act('u2', 'exile', { target: 'late' }), /等这一轮结束/);
    for (const id of g.players.map((p) => p.id)) if (id !== 'late') room.exile.yes.add(id);
    await until(() => !room.exile, 2000);
    assert.equal(g.get('late').alive, false, '过一半，被流放');
    assert.ok(g.timeline.some((e) => /被流放/.test(e.text)));
    await assert.rejects(room.act('u1', 'exile', { target: 'late' }), /只能流放活着的旅行者/);
  } finally { await room.teardown(); }
});

// ───────────── 2026-11-16 对照官方百科改的 ─────────────
test('替罪羊（官方）：邪恶替罪羊大多数时候替恶魔挡下处决', () => {
  let swapped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Game(players(7), { roles: TB, rng: makeRng(seed), script: 'tb', misregister: 0 });
    night(g); g.dawn();
    g.addTraveller({ id: 'sg', name: '羊' }, 'scapegoat', true);
    g.block = 'p7'; g.endDay(); // 7 号是小恶魔
    if (!g.get('sg').alive) swapped++;
  }
  assert.ok(swapped >= 28, `40 次里替了 ${swapped} 次`);
});

test('法官（官方）：强制失败算 0 票，台上的人不变', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.recordVote('p1', ['p1', 'p2', 'p3', 'p4']);
  assert.equal(g.block, 'p1');
  const r = g.recordVote('p2', ['p1', 'p2', 'p3', 'p4', 'p5'], 'fail');
  assert.equal(r.count, 0);
  assert.equal(g.block, 'p1');
});

test('房间（官方）：推荐的旅行者排在前面；枪手只能打第一次投票里投过票的人；法官强制成功直接处决、结束白天', async () => {
  const room = new Room({ key: 'k2', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'tb' } });
  room.judgeReady = () => false;
  room.botsConsider = () => {};
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二'], ['ju', '法官'], ['gs', '枪手']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
      await sleep(3);
    }
    await until(() => g.phase === 'day', 2000);
    const list = room.viewFor('ju').travellers;
    assert.deepEqual(list.filter((t) => t.rec).map((t) => t.name), ['窃贼', '官员', '枪手', '替罪羊']);
    assert.equal(list.findIndex((t) => !t.rec), 4, '推荐的在前');
    assert.deepEqual(room.viewFor('ju').travellerRecMissing, ['乞丐']);
    await room.act('ju', 'traveller', { role: 'judge' });
    await room.act('gs', 'traveller', { role: 'gunslinger' });
    g.get('ju').evil = false; g.get('gs').evil = false;
    await until(() => room.roam || room.ended, 500);
    await room.act('u1', 'gather').catch(() => {});
    await until(() => room.noms, 500);
    // 枪手：第一次投票投过票的人才能打
    room.voteHistory = [{ day: g.day, voters: ['bot-1'], exile: false }, { day: g.day, voters: ['bot-2'], exile: false }];
    await assert.rejects(room.act('gs', 'gunslinger', { target: 'bot-2' }), /投过票/);
    room.voteHistory = [];
    // 法官：别人的提名，强制成功 → 直接处决，白天结束
    for (const id of ['u1', 'bot-3']) g.get(id).alive = true;
    await room.act('u1', 'nominate', { target: 'bot-3' });
    await room.act('ju', 'judge', { pass: true });
    await until(() => g.phase !== 'day' || room.ended, 9000); // 机器人辩护要 3 秒
    assert.equal(g.get('bot-3').alive, false, '被法官强制处决');
    assert.ok(room.log.some((l) => /法官强制成功/.test(l.text)));
  } finally { await room.teardown(); }
});
