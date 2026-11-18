// 旅行者（2026-11-16 用户要的）：中途加入、离开、流放；窃贼、官员、枪手、替罪羊、法官、巫毒师。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { Room, SCRIPT_TRAVELLERS } from '../src/server/room.js';
import { ROLES, SCRIPTS, rolesOf } from '../src/engine/roles.js';

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

test('官方：任何时刻都能加入；夜里加入的当晚不醒，下一晚才行动', () => {
  const g = mk(TB, 'tb');
  g.startNight();
  g.addTraveller({ id: 't1', name: '旅人' }, 'thief', false);
  assert.equal(g.nightPrompts().some((pr) => pr.playerId === 't1'), false, '当晚不醒');
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  assert.equal(g.nightPrompts().some((pr) => pr.playerId === 't1'), true, '下一晚醒');
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
    assert.equal(room.viewFor('late').canTravel, true, '官方：任何时刻都能加入（存活 7 人以上）');
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
      await sleep(3);
    }
    await until(() => g.phase === 'day', 15000); // 全量测试并发时第一夜会慢
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

test('房间（官方）：黯月初升只列它的五个旅行者；法官强制成功直接处决、结束白天', async () => {
  const room = new Room({ key: 'k2', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'bmr' } });
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
    await until(() => g.phase === 'day', 15000); // 全量测试并发时第一夜会慢
    assert.deepEqual(room.viewFor('ju').travellers.map((t) => t.name), ['法官', '女舍监', '巫毒师', '学徒', '主教']);
    await assert.rejects(room.act('gs', 'traveller', { role: 'gunslinger' }), /这个剧本不用/);
    await room.act('ju', 'traveller', { role: 'judge' });
    g.get('ju').evil = false;
    await until(() => room.roam || room.ended, 6000); // 天亮 3 秒后才开始自由活动（机器忙时更晚）
    if (room.roam) await room.act('u1', 'gather').catch(() => {});
    room.roamedToday = true; // 不等自由活动：直接到提名环节
    await until(() => !room.roam, 2000);
    for (const id of ['u1', 'bot-3']) { g.get(id).alive = true; g.get(id).apparentDead = false; }
    await room.act('u1', 'nominate', { target: 'bot-3' });
    await room.act('ju', 'judge', { pass: true });
    await until(() => g.phase !== 'day' || room.ended, 9000); // 机器人辩护要 3 秒
    assert.equal(g.get('bot-3').alive, false, '被法官强制处决');
    assert.ok(room.log.some((l) => /法官强制成功/.test(l.text)));
  } finally { await room.teardown(); }
});

// ───────────── 2026-11-16 补齐的九个旅行者 + 侏儒（照集石百科）─────────────
test('乞丐：没有标记不能投票；死人给了标记才能投、得知阵营，给了的人不能再投；投一次用掉一个', () => {
  const g = mk(TB, 'tb');
  night(g); g.dawn();
  g.addTraveller({ id: 'bg', name: '乞' }, 'beggar', false);
  assert.equal(g.canVote('bg'), false);
  assert.throws(() => g.giveBeggar('p2'), /只有死亡的玩家/);
  g.get('p1').alive = false;
  const r = g.giveBeggar('p1');
  assert.equal(r.evil, false);
  assert.equal(g.get('p1').ghostVote, false);
  assert.equal(g.canVote('p1'), false);
  assert.equal(g.canVote('bg'), true);
  g.recordVote('p6', ['bg']);
  assert.equal(g.get('bg').beggarTokens, 0);
  assert.equal(g.canVote('bg'), false);
  assert.equal(g.travellerOn(g.get('bg')), true, '乞丐不会中毒醉酒');
});

test('学徒（黯月初升）：首个夜晚善良拿镇民能力、邪恶拿爪牙能力，按那个能力醒；他还是学徒', () => {
  const g = mk(BMR, 'bmr');
  night(g); g.dawn();
  g.addTraveller({ id: 'ap', name: '徒' }, 'apprentice', true);
  g.endDay();
  g.startNight();
  const p = g.get('ap');
  assert.equal(ROLES[p.apprenticeAs].team, 'minion');
  assert.ok(rolesOf('bmr', 'minion').includes(p.apprenticeAs), '剧本里的爪牙');
  assert.equal(p.role, 'apprentice');
  assert.ok(g.evilMessages.some((m) => m.playerId === 'ap' && /学徒：你获得了/.test(m.text)));
  if (p.apprenticeAs === 'assassin' || p.apprenticeAs === 'devilsadvocate') assert.ok(g.nightPrompts().some((pr) => pr.playerId === 'ap'), '按获得的能力醒');
});

test('学徒（梦殒春宵引擎的剧本，比如冒名钓鱼）：能力按 gained 走', () => {
  const g = mk(SNV, 'snv');
  night(g); g.dawn();
  g.addTraveller({ id: 'ap', name: '徒' }, 'apprentice', false);
  g.endDay();
  g.startNight();
  assert.equal(ROLES[g.get('ap').gained].team, 'townsfolk');
  assert.equal(g.abilityOf(g.get('ap')), g.get('ap').gained);
});

test('女舍监：一天一次换至多三对座位，相邻关系跟着变', () => {
  const g = mk(BMR, 'bmr');
  night(g); g.dawn();
  g.addTraveller({ id: 'mt', name: '舍' }, 'matron', false);
  assert.throws(() => g.matronSwap('mt', [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p1', 'p3']]), /一到三对/);
  g.matronSwap('mt', [['p1', 'p3']]);
  if (g.travellerOn(g.get('mt'))) {
    assert.equal(g.get('p3').seat, 1);
    assert.equal(g.get('p1').seat, 3);
    assert.equal(g.players[0].id, 'p3');
  }
  assert.throws(() => g.matronSwap('mt', [['p2', 'p4']]), /今天已经换过/);
  assert.equal(g.matronOn(), true);
});

test('集骨者（每局一次）：选一个死人，他重新获得能力到黄昏', () => {
  const g = mk(SNV, 'snv');
  night(g); g.dawn();
  g.addTraveller({ id: 'bc', name: '骨' }, 'bonecollector', false);
  g.get('p2').alive = false; // 筑梦师
  g.endDay();
  g.startNight();
  g.submitChoice('bc', ['p2']);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 6; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  assert.equal(g.used.bc, true);
  assert.ok(g.timeline.some((e) => /集骨者/.test(e.text)));
  if (g.travellerOn(g.get('bc'))) assert.ok(g.get('p2').regained, '重新获得了能力');
  g.dawn(); g.endDay(); g.startNight();
  assert.equal(g.get('p2').regained, undefined, '到黄昏为止');
});

test('咖啡师：每晚说书人让一名玩家清醒且健康、拿正确信息，并告诉他', () => {
  const g = mk(SNV, 'snv');
  night(g); g.dawn();
  g.addTraveller({ id: 'ba', name: '咖' }, 'barista', false);
  g.endDay();
  const r = night(g);
  if (!g.travellerOn(g.get('ba'))) return;
  assert.ok(g.baristaFx);
  assert.equal(g.snvBroken(g.get(g.baristaFx.id)), false);
  assert.equal(g.lieMode(g.get(g.baristaFx.id)), null);
});

test('流莺：选人后叫醒对方问同不同意；同意就得知他的角色；不会因此杀死恶魔', () => {
  let asked = 0; let learned = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game(players(7), { roles: SNV, rng: makeRng(seed), script: 'snv', misregister: 0 });
    night(g); g.dawn();
    g.addTraveller({ id: 'hl', name: '莺' }, 'harlot', false);
    g.endDay();
    g.startNight();
    g.submitChoice('hl', ['p7']); // 恶魔
    for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
    let r = g.resolveNight(); const msgs = [...(r.messages ?? [])];
    for (let k = 0; r.pause && k < 6; k++) { if (r.pause === 'p7') asked++; g.autoChoose(r.pause); r = g.resolveNight(); msgs.push(...(r.messages ?? [])); }
    if (msgs.some((m) => m.playerId === 'hl' && /同意了/.test(m.text))) learned++;
    assert.equal(g.get('p7').alive, true, '流莺不会让恶魔死');
  }
  assert.ok(asked >= 10, `问了 ${asked} 次`);
  assert.ok(learned > 0, '有人同意');
});

test('侏儒：加入时公开一名同阵营的同伴；同伴被提名时可以杀死提名者', () => {
  const g = mk(SNV, 'snv');
  night(g); g.dawn();
  g.addTraveller({ id: 'gn', name: '侏' }, 'gnome', false);
  const a = g.gnomePickAmigo(g.get('gn'));
  assert.equal(g.evilOf(a), false);
  assert.equal(g.get('gn').gnomeAmigo, a.id);
  const n = g.players.find((q) => q.id !== a.id && !q.traveller && q.alive);
  assert.equal(g.gnomeKill('gn', n.id), g.travellerOn(g.get('gn')));
  if (g.travellerOn(g.get('gn'))) assert.equal(g.get(n.id).alive, false);
});

test('房间：各剧本只列官方的旅行者；没列旅行者的社区剧本不开', () => {
  const ok = (script) => {
    const room = new Room({ key: `l-${script}`, guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { mode: 'auto', script } });
    return room.travellersOk({ engine: SCRIPTS[script].engine, script });
  };
  assert.equal(ok('tb'), true);
  assert.equal(ok('bs7'), true);
  assert.equal(ok('cat'), true);
  assert.equal(ok('ecp'), false);
  assert.equal(ok('ngj'), false);
  assert.deepEqual(SCRIPT_TRAVELLERS.snv, ['deviant', 'bonecollector', 'barista', 'harlot', 'butcher']);
});

/** 开一桌（2 真人 + 5 机器人）打到第一天白天。 */
async function dayRoom(script, extra = []) {
  const room = new Room({ key: `d-${script}`, guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
  room.judgeReady = () => false;
  room.botsConsider = () => {};
  for (const id of ['u1', 'u2', ...extra]) room.users.set(id, { id, name: id, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  for (let k = 0; k < 400 && g.phase === 'night'; k++) {
    if (!room.resolving) for (const pr of g.nightPrompts()) {
      if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
      await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count), role: pr.pickRole ? pr.roleOptions?.[0] : undefined }).catch(() => {});
    }
    await sleep(3);
  }
  await until(() => g.phase === 'day', 15000); // 全量测试并发时第一夜会慢
  return { room, g };
}

test('房间：主教在场只有说书人提名，说书人提名后被提名者辩护、大家投票', async () => {
  const { room, g } = await dayRoom('bmr', ['bi']);
  try {
    await room.act('bi', 'traveller', { role: 'bishop' });
    g.get('bi').evil = false;
    if (!g.bishopOn()) return; // 主教失效时玩家照常提名
    await assert.rejects(room.act('u1', 'nominate', { target: 'u2' }), /只有说书人/);
    room.roam = null; room.noms = null;
    room.bishopDay();
    assert.equal(room.pendingNom?.nominator, 'storyteller');
    const evilIds = g.players.filter((p) => g.evilOf(p) && !p.traveller && p.alive).map((p) => p.id);
    assert.ok([room.pendingNom.nominee, ...room.bishopQueue].some((id) => evilIds.includes(id)), '至少提名一名对立阵营（邪恶）的玩家');
  } finally { await room.teardown(); }
});

test('房间：怪咖今天被一半的人觉得有趣，流放就不成立', async () => {
  const { room, g } = await dayRoom('snv', ['dv']);
  try {
    await room.act('dv', 'traveller', { role: 'deviant' });
    if (!g.travellerOn(g.get('dv'))) return;
    await room.act('u1', 'exile', { target: 'dv' });
    for (const p of g.players) if (p.id !== 'dv') { room.exile.yes.add(p.id); (room.exile.laughs ??= new Set()).add(p.id); }
    await until(() => !room.exile, 2000);
    assert.equal(g.get('dv').alive, true, '有趣：不能被流放');
    assert.ok(room.log.some((l) => /表现得很有趣/.test(l.text)));
  } finally { await room.teardown(); }
});

test('房间：屠夫在首次处决后再提名一次，过存活玩家一半就再处决', async () => {
  const { room, g } = await dayRoom('snv', ['bu']);
  try {
    await room.act('bu', 'traveller', { role: 'butcher' });
    if (!g.travellerOn(g.get('bu'))) return;
    g.executedToday = true;
    const target = g.players.find((p) => !p.traveller && p.alive && !['u1', 'u2'].includes(p.id) && ROLES[p.role].team !== 'demon');
    const done = room.butcherRound(g);
    await room.act('bu', 'butcherNominate', { target: target.id });
    for (const p of g.players) if (g.canVote(p.id)) room.butcher.yes.add(p.id);
    await done;
    assert.equal(g.butcherDay, g.day);
    assert.ok(room.log.some((l) => /屠夫的提名/.test(l.text)));
    assert.equal(g.get(target.id).alive, false, '被屠夫的提名处决');
  } finally { await room.teardown(); }
});

test('学徒（官方）：拿到被动能力也照那个能力结算（善良学徒拿到弄臣：第一次死亡不死）', () => {
  const g = mk(BMR, 'bmr');
  night(g); g.dawn();
  g.addTraveller({ id: 'ap', name: '徒' }, 'apprentice', false);
  const p = g.get('ap');
  p.apprenticeAs = 'fool'; p.apprenticeTold = true; p.gained = 'fool';
  assert.equal(g.abHolder(p, 'fool'), true);
  assert.equal(g.abHolder(p, 'apprentice'), true);
});

test('咖啡师第二种（官方）：每晚选人的能力，这一步结算完再叫醒他选一次', () => {
  let twice = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Game(players(7), { roles: SNV, rng: makeRng(seed), script: 'snv', misregister: 0 });
    night(g); g.dawn();
    g.addTraveller({ id: 'ba', name: '咖' }, 'barista', false);
    g.endDay();
    g.startNight();
    for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
    let r = g.resolveNight(); const paused = [];
    for (let k = 0; r.pause && k < 8; k++) { paused.push(r.pause); g.autoChoose(r.pause); r = g.resolveNight(); }
    if (g.baristaFx?.twice && g.get(g.baristaFx.id).alive) { twice++; assert.ok(paused.includes(g.baristaFx.id), '被叫醒再选一次'); assert.equal(g.baristaFx.done, true); }
  }
  assert.ok(twice > 0, `20 局里用了 ${twice} 次第二种`);
});

test('房间：女舍监在场时，屋里有不是你邻座的人就不能进去私聊', () => {
  const room = new Room({ key: 'mt', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { mode: 'auto', script: 'bmr' } });
  const g = mk(BMR, 'bmr');
  night(g); g.dawn();
  g.addTraveller({ id: 'mt', name: '舍' }, 'matron', false);
  room.game = g;
  assert.equal(room.matronBlocks('p1', { ids: new Set(['p2']) }), false, '2 号是 1 号的邻座');
  assert.equal(room.matronBlocks('p1', { ids: new Set(['mt']) }), false, '旅行者坐在最后：和 1 号相邻');
  assert.equal(room.matronBlocks('p1', { ids: new Set(['p4']) }), true, '4 号不是邻座');
  assert.equal(room.matronBlocks('p1', { ids: new Set(['p2', 'p4']) }), true);
});
