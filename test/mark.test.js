// 娱乐模式「暗印」：规则（engine/mark.js）、房间流程和机器人（server/mark.js）、生还排行（summarizeMark）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkGame, markRoles, evilCount, evilKnow, SUITS, JOKER, colorOf, summarizeMark, roleAbility } from '../src/engine/mark.js';
import { Room } from '../src/server/room.js';
import { SCRIPTS, DISTRIBUTION } from '../src/engine/roles.js';

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const T = 'mk_town'; const B = 'mk_boss'; const H = 'mk_hand';
const NOFX = { jokerChance: 0, fogChance: 0 };
/** 开好局、进到自由活动。 */
const make = (roles, rules = {}) => { const g = new MarkGame(ids(roles.length), { roles, rules: { ...NOFX, ...rules } }); g.begin(); g.openRoam(); return g; };
const other = (s) => SUITS.find((x) => x !== s);
/** 白天走完，入夜。 */
const toNight = (g) => { g.openTable(); g.dusk(); g.startNight(); };
/** 还没写的活人都写对，天亮。 */
const allRight = (g) => { for (const p of g.alive()) if (!(p.id in g.guesses)) g.guess(p.id, g.suits[p.id]); return g.dawn(); };
const town5 = [T, T, T, B, H];

test('人数照血染：坏人 = 爪牙 + 恶魔，1 个头头其余手下；7 人及以上坏人互相认识', () => {
  for (let n = 5; n <= 15; n++) {
    const r = markRoles(n);
    assert.equal(r.length, n);
    const e = DISTRIBUTION[n][2] + DISTRIBUTION[n][3];
    assert.equal(evilCount(n), e);
    assert.equal(r.filter((x) => x === B).length, 1);
    assert.equal(r.filter((x) => x === H).length, e - 1);
  }
  assert.deepEqual([5, 9, 10, 12, 13, 15].map(evilCount), [2, 2, 3, 3, 4, 4]);
  assert.deepEqual([6, 7].map(evilKnow), [false, true]);
  const small = make([T, T, T, T, B, H]);
  assert.deepEqual(small.allies('p5'), [], '6 人：坏人不认识同伴');
  const big = make([T, T, T, T, T, B, H]);
  assert.deepEqual(big.allies('p6'), ['p7']);
  assert.throws(() => new MarkGame(ids(4)), /5–15/);
  assert.deepEqual(SCRIPTS.mark.players, [5, 15]);
});

test('对视：看他的同时他看到你的；每天最多主动看两个人，再看同一个人不算次数', () => {
  const g = make([T, T, T, T, T, B, H]);
  const r = g.peek('p1', 'p2');
  assert.deepEqual(r, { seen: g.suits.p2, mutual: g.suits.p1 });
  assert.ok(g.sightings.some((x) => x.by === 'p2' && x.target === 'p1' && x.kind === 'mutual'), '被看的人同时看到看的人');
  assert.equal(g.peeksLeft('p1'), 1);
  assert.equal(g.peeksLeft('p2'), 2, '对视不占被看的人的次数');
  g.peek('p1', 'p2');
  assert.equal(g.peeksLeft('p1'), 1, '再看同一个人不算');
  g.peek('p1', 'p3');
  assert.throws(() => g.peek('p1', 'p4'), /2 个人/);
  assert.throws(() => g.peek('p2', 'p2'), /自己/);
  g.kill('p5', 'blast', 'n1');
  assert.throws(() => g.peek('p2', 'p5'), /死/);
});

test('鬼牌和雾天：鬼牌那晚要写鬼牌；雾天看背后只看得出红黑', () => {
  const g = make(town5, { jokerChance: 1 });
  assert.ok(Object.values(g.suits).every((s) => s === JOKER));
  toNight(g);
  g.guess('p1', JOKER);
  g.guess('p2', 'spade');
  for (const id of ['p3', 'p4', 'p5']) g.guess(id, JOKER);
  assert.deepEqual(g.resolveNight().ids, ['p2']);

  const f = make(town5, { fogChance: 1 });
  assert.equal(f.foggy, false, '第 1 天不起雾');
  toNight(f); allRight(f); f.openRoam();
  assert.equal(f.foggy, true);
  const { seen } = f.peek('p1', 'p2');
  assert.equal(seen, colorOf(f.suits.p2));
  assert.ok(['red', 'black'].includes(seen));
});

test('路上瞟到：同一天同一对只掷一次，瞟到的算看过背后', () => {
  const g = make(town5);
  assert.equal(g.glimpse('p1', 'p2', () => 0.9, 0.3), null, '没瞟到');
  assert.equal(g.glimpse('p1', 'p2', () => 0, 0.3), null, '这一对今天掷过了');
  assert.equal(g.glimpse('p1', 'p3', () => 0, 0.3), g.suits.p3);
  assert.deepEqual(g.viewers('p3'), ['p1']);
  assert.equal(g.peeksLeft('p1'), 2, '瞟到不占看背后的次数');
});

test('调包是手下的本事：看背后的那一刻把他今天的印记换掉；每两天一次，同一个人只被调包一次，不能调包自己人；头头不会', () => {
  const g = make([T, T, T, T, T, B, H]);
  assert.match(g.swapBlock('p7', 'p1'), /看他背后/);
  g.peek('p2', 'p1');               // 2 号先看了 1 号
  const before = g.suits.p1;
  g.tell('p2', 'p1', before);       // 说的时候是真话
  g.peek('p7', 'p1');
  assert.equal(g.swapBlock('p1', 'p2'), '只有手下能调包');
  assert.equal(g.swapBlock('p6', 'p1'), '只有手下能调包', '头头不会调包');
  g.swap('p7', 'p1', other(before));
  assert.equal(g.suits.p1, other(before));
  assert.equal(g.suitLog[1].p1, other(before));
  assert.equal(g.sightings.find((x) => x.by === 'p2' && x.target === 'p1').seen, before, '之前看过他的人记着的是旧的');
  g.peek('p6', 'p7');             // 头头看手下：对视，手下也看到了头头
  assert.equal(g.swapBlock('p7', 'p6'), '不能调包自己人');
  g.peek('p7', 'p2');
  assert.match(g.swapBlock('p7', 'p2'), /今天已经调包过/);
  // 1 号写了调包前的：算被 7 号调包骗死
  toNight(g);
  g.guess('p1', before);
  allRight(g);
  assert.ok(!g.get('p1').alive);
  assert.deepEqual(g.fooledLog.p1, [{ by: 'p7', how: 'swap' }], '2 号说的时候是真话，后来被调包，不算他骗的');
  assert.equal(g.nights[0].swaps, 1);
  g.openRoam();
  g.peek('p7', 'p2');
  assert.match(g.swapBlock('p7', 'p2'), /昨天调包过/);
  toNight(g); allRight(g); g.openRoam();
  g.peek('p7', 'p2');
  assert.equal(g.swapBlock('p7', 'p2'), null, '隔一天又能调');
});

test('同一个人整局只被调包一次（两个手下也一样）', () => {
  const g = make([T, T, T, T, T, T, T, B, H, H]);
  g.peek('p9', 'p1'); g.swap('p9', 'p1', other(g.suits.p1));
  g.peek('p10', 'p1');
  assert.match(g.swapBlock('p10', 'p1'), /只能被调包一次/);
  g.peek('p10', 'p2');
  assert.equal(g.swapBlock('p10', 'p2'), null, '各算各的：另一个手下今天还能调');
});

test('头头整局 2 次看自己的印记（同一天再看不算），手下没有；写下之后不能再看', () => {
  const g = make(town5);
  assert.throws(() => g.reveal('p5'), /只有头头/);
  assert.equal(g.reveal('p4'), g.suits.p4);
  assert.equal(g.reveal('p4'), g.suits.p4);
  assert.equal(g.revealsLeft('p4'), 1);
  toNight(g); allRight(g);
  toNight(g);
  assert.equal(g.reveal('p4'), g.suits.p4, '夜里写之前也能看');
  assert.equal(g.revealsLeft('p4'), 0);
  allRight(g);
  assert.throws(() => g.reveal('p4'), /用完/);
});

test('匿名信：每人每天一封、只写一个花色，收信人不知道是谁写的', () => {
  const g = make(town5);
  g.letter('p1', 'p2', 'heart');
  assert.throws(() => g.letter('p1', 'p3', 'heart'), /一封/);
  assert.throws(() => g.letter('p2', 'p3', 'star'), /一个花色/);
  assert.deepEqual(g.mail('p2').map((x) => [x.suit, 'from' in x]), [['heart', false]]);
  g.openTable();
  g.letter('p2', 'p1', JOKER);
  toNight(g);
  assert.throws(() => g.letter('p3', 'p1', 'heart'), /白天/);
});

test('圆桌：没有提名投票，所有活人说完了就散；坏人被看再多次也不会暴露', () => {
  const g = make([T, T, T, T, T, B, H]);
  g.peek('p1', 'p6'); g.peek('p2', 'p6');
  g.glimpse('p3', 'p6', () => 0, 1);
  g.peek('p1', 'p2'); g.peek('p3', 'p2'); g.peek('p4', 'p2');
  g.openTable();
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) assert.equal(g.finish(id), false);
  assert.equal(g.finish('p7'), true);
  g.dusk();
  assert.equal(g.stage, 'dusk');
  assert.ok(!('glow' in g), '没有发光暴露');
  g.startNight();
  assert.equal(g.stage, 'night');
});

test('夜里：写对活下来，写错或没写就炸；死讯天亮才算数；写了不能改', () => {
  const g = make([T, T, T, T, T, T, T, B, H]);
  toNight(g);
  g.guess('p1', g.suits.p1);
  g.guess('p2', other(g.suits.p2));
  assert.throws(() => g.guess('p1', 'heart'), /已经写下/);
  for (const id of ['p4', 'p5', 'p6', 'p7', 'p8', 'p9']) g.guess(id, g.suits[id]);
  const b = g.resolveNight();
  assert.deepEqual(b.ids.sort(), ['p2', 'p3']);
  assert.deepEqual(b.why, { p2: 'wrong', p3: 'timeout' });
  assert.ok(g.get('p2').alive, '天亮之前还没公布');
  assert.throws(() => g.guess('p3', 'heart'), /太晚/);
  assert.deepEqual(g.dawn().sort(), ['p2', 'p3']);
  assert.equal(g.get('p2').diedAt, 'n1');
  assert.equal(g.stage, 'morning');
});

test('遗言：昨晚炸死的人今天白天留一次，一句话或者公开一个看过的人', () => {
  const g = make([T, T, T, T, T, B, H]);
  g.peek('p1', 'p2');
  const p2 = g.suits.p2;
  toNight(g);
  g.guess('p1', other(g.suits.p1));
  allRight(g);
  assert.equal(g.canLastWord('p1'), true);
  assert.equal(g.canLastWord('p2'), false);
  assert.throws(() => g.lastWord('p1', { reveal: { target: 'p3', day: 1 } }), /看过的人/);
  const w = g.lastWord('p1', { reveal: { target: 'p2', day: 1 } });
  assert.deepEqual(w.reveal, { target: 'p2', day: 1, seen: p2 });
  assert.throws(() => g.lastWord('p1', { text: '再说一句' }), /不能留遗言/);
  toNight(g); allRight(g);
  assert.equal(g.canLastWord('p1'), false, '过了那天就不能留了');
});

test('胜负：坏人全死好人赢；活着的坏人追平好人坏人赢；全员炸死算好人赢', () => {
  let g = make(town5);
  toNight(g);
  for (const id of ['p1', 'p2', 'p3']) g.guess(id, g.suits[id]);
  g.dawn(); // 两个坏人没写
  assert.equal(g.winner, 'good');
  g = make(town5);
  toNight(g);
  g.guess('p1', g.suits.p1); g.guess('p4', g.suits.p4); g.guess('p5', g.suits.p5);
  g.dawn();
  assert.equal(g.winner, 'evil', '2 个坏人对 1 个好人');
  g = make(town5);
  toNight(g); g.dawn();
  assert.equal(g.winner, 'good');
  assert.equal(g.stage, 'ended');
});

test('房主可以关掉调包和遗言', () => {
  const g = make([T, T, T, T, T, B, H], { swap: false, lastWords: false });
  g.peek('p6', 'p1');
  g.peek('p7', 'p1');
  assert.equal(g.swapBlock('p7', 'p1'), '这局关掉了调包');
  assert.throws(() => g.swap('p7', 'p1', other(g.suits.p1)), /关掉了调包/);
  toNight(g);
  g.guess('p1', other(g.suits.p1));
  allRight(g);
  assert.equal(g.canLastWord('p1'), false);
  assert.throws(() => g.lastWord('p1', { text: '再见' }), /不能留遗言/);
  assert.ok(!roleAbility('mk_hand', g.rules).includes('调包'), '手下的说明不再提调包');
  assert.ok(!roleAbility('mk_boss', g.rules).includes('调包'));
  assert.ok(!roleAbility('mk_town', g.rules).includes('调包'));
  assert.ok(roleAbility('mk_hand', {}).includes('调包'), '默认开着');
});

test('存档读档：状态原样回来', () => {
  const g = make([T, T, T, T, T, B, H]);
  g.peek('p7', 'p1'); g.swap('p7', 'p1', other(g.suits.p1)); g.letter('p2', 'p1', 'heart');
  toNight(g);
  g.guess('p1', 'spade');
  const back = MarkGame.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.ok(back.mark);
  assert.equal(back.stage, 'night');
  assert.deepEqual(back.guesses, { p1: 'spade' });
  assert.deepEqual(back.suits, g.suits);
  assert.equal(back.swaps.length, 1);
  assert.equal(back.rules.peeksPerDay, 2);
  assert.deepEqual(back.allies('p6'), ['p7']);
});

test('生还排行：真人平均活到第几天、被谁骗死（匿名信、调包分开记），机器人不算', () => {
  const games = [
    { endedAt: 1, players: [{ id: 'u1', name: '阿一', day: 3, alive: false, fooledBy: [{ by: 'u2', name: '阿二', how: 'tell' }] }, { id: 'u2', name: '阿二', day: 4, alive: true, evil: true }, { id: 'bot-1', name: 'b', day: 1 }] },
    { endedAt: 2, players: [{ id: 'u1', name: '阿一', day: 1, alive: false, fooledBy: [{ by: 'u2', name: '阿二', how: 'swap' }, { by: 'u3', name: '阿三', how: 'letter' }] }, { id: 'u2', name: '阿二', day: 2, alive: true }] },
  ];
  const s = summarizeMark(games, { minGames: 1 });
  assert.deepEqual(s.map((x) => x.id), ['u2', 'u1']);
  const u1 = s.find((x) => x.id === 'u1');
  assert.equal(u1.avgDay, 2);
  assert.equal(u1.games, 2);
  assert.deepEqual(u1.fooledBy, { 阿二: 1, '阿二（调包）': 1, 匿名信: 1 });
  assert.equal(s.find((x) => x.id === 'u2').survived, 2);
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
const FAST = { morning: 0.01, roam: 0.05, table: 0.06, night: 0.05, blast: 0.01, dusk: 0.01 };

async function markRoom(bots, limits = FAST, humans = []) {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { pauseMs: 5, shuffle: false, script: 'mark' } });
  room.mk.limits = limits;
  room.mk.speed = 0.002;
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  for (const h of humans) room.lobby.push({ id: h, name: h, avatar: null });
  await room.act('u1', 'addBots', { count: bots });
  return room;
}
/** 开局，把身份按 roles 摆好（真人在前），去掉鬼牌和雾，等到自由活动。 */
async function started(room, roles) {
  await room.act('u1', 'start');
  const g = room.game;
  if (roles) g.players.forEach((p, i) => { p.role = roles[i]; });
  Object.assign(g.rules, NOFX);
  for (const id of Object.keys(g.suits)) if (g.suits[id] === JOKER) g.suits[id] = 'spade';
  await until(() => g.stage === 'roam');
  room.mk.botRoam = () => {}; // 机器人别乱走
  room.mk.glimpseLoop = () => {};
  return g;
}
/** 把人直接放进某栋房子（测试里不等走路）。 */
const putIn = (room, id, hid) => {
  for (const st of room.roam.state.values()) st.ids.delete(id);
  room.roam.zone.set(id, hid); room.roam.state.get(hid).ids.add(id);
};

test('房间：机器人能跑完整局（真人不写就炸），视图不漏别人的身份和印记', async () => {
  for (const n of [5, 9, 15]) {
    const room = await markRoom(n - 1);
    await room.act('u1', 'start');
    const g = room.game;
    assert.ok(g.mark);
    const v = room.viewFor('u1');
    assert.equal(v.script, 'mark');
    assert.equal(Object.keys(room.homes).length, n, '每人一栋家');
    assert.equal(v.self.suit, null, '一开始谁都不知道自己的印记');
    if (!v.self.role.evil) assert.ok(v.players.every((p) => p.id === 'u1' || p.role === undefined), '好人看不到别人的身份');
    assert.ok(!/"(spade|heart|diamond|club|joker)"/.test(JSON.stringify(v.mark)), '公开的部分不带任何印记');
    await until(() => room.ended, 20000);
    assert.ok(room.ended, `${n} 人局没跑完：停在 ${g.stage}`);
    assert.ok(['good', 'evil'].includes(g.winner));
    const end = room.viewFor('u1');
    assert.equal(end.phase, 'ended');
    assert.ok(end.players.every((p) => p.roleName), '终局公开所有身份');
    assert.ok(end.mark.review.suitLog && end.mark.review.survival.length === n, '终局复盘');
    await room.teardown();
  }
});

test('房间：同屋才能看后颈，对视双方都看到；被看的人知道是谁看的；调包他不知道；血染的提名不能用', async () => {
  const room = await markRoom(5, { ...FAST, roam: 60 }, ['u2']);
  const g = await started(room, [T, H, T, T, T, T, B]);
  const [h1, h2] = room.roam.houses;
  putIn(room, 'u1', h1.id); putIn(room, 'u2', h2.id);
  await assert.rejects(room.act('u2', 'mark', { kind: 'peek', target: 'u1' }), /同一栋房子/);
  putIn(room, 'u2', h1.id);
  await room.act('u2', 'mark', { kind: 'peek', target: 'u1' });
  const v2 = room.viewFor('u2');
  assert.deepEqual(v2.self.sightings.map((x) => [x.target, x.seen, x.kind]), [['u1', g.suits.u1, 'peek']]);
  assert.equal(v2.self.peeksLeft, 1);
  const v1 = room.viewFor('u1');
  assert.deepEqual(v1.self.sightings.map((x) => [x.target, x.seen, x.kind]), [['u2', g.suits.u2, 'mutual']], '对视：1 号同时看到 2 号的');
  assert.deepEqual(v1.self.seenBy.map((x) => [x.by, x.kind]), [['u2', 'peek']]);
  assert.ok(v1.self.inbox.some((m) => /对视/.test(m.text)));
  // u2 是手下：调包 u1
  assert.deepEqual(v2.self.swapTargets, { u1: null });
  const old = g.suits.u1;
  await room.act('u2', 'mark', { kind: 'swap', target: 'u1', suit: other(old) });
  assert.equal(g.suits.u1, other(old));
  assert.ok(!JSON.stringify(room.viewFor('u1')).includes('调包成'), '被调包的人不会被告知');
  assert.equal(room.viewFor('u1').self.swapTargets, null, '好人没有调包');
  await assert.rejects(room.act('u2', 'mark', { kind: 'reveal' }), /只有头头/, '手下不能看自己');
  assert.equal(room.viewFor('u2').self.reveals, null);
  await room.act('u1', 'mark', { kind: 'tell', target: 'u2', suit: 'heart' });
  assert.deepEqual(room.viewFor('u2').self.heard.map((t) => [t.from, t.suit]), [['u1', 'heart']]);
  assert.ok(!('lie' in room.viewFor('u2').self.heard[0]) && !('lie' in room.viewFor('u1').self.told[0]), '真假只进终局复盘');
  await room.act('u1', 'mark', { kind: 'letter', target: 'u2', suit: 'club' });
  const mail = room.viewFor('u2').self.mail;
  assert.equal(mail[0].suit, 'club');
  assert.ok(!('from' in mail[0]), '匿名信不带写信人');
  await assert.rejects(room.act('u1', 'nominate', { target: 'u2' }), /暗印里没有这个操作/);
  await room.teardown();
});

test('房间：路上从别人身后经过可能瞟到，被瞟的人只知道「有人从你背后经过」', async () => {
  const room = await markRoom(4, { ...FAST, roam: 60 }, ['u2']);
  const g = await started(room);
  const now = Date.now();
  room.roam.zone.clear();
  room.roam.pos.set('u1', { fx: 100, fy: 100, x: 300, y: 100, start: now - 100, dur: 10_000, path: [{ x: 100, y: 100 }, { x: 300, y: 100 }] });
  room.roam.pos.set('u2', { fx: 102, fy: 104, x: 102, y: 104, start: now - 5000, dur: 0 });
  for (const p of g.players) if (p.id.startsWith('bot-')) room.roam.pos.set(p.id, { fx: 2000, fy: 2000, x: 2000, y: 2000, start: 0, dur: 0 });
  room.mk.glimpseTick(() => 0);
  assert.deepEqual(room.viewFor('u1').self.sightings.map((x) => [x.target, x.kind]), [['u2', 'glimpse']]);
  const v2 = room.viewFor('u2');
  assert.deepEqual(v2.self.seenBy.map((x) => [x.kind, 'by' in x]), [['glimpse', false]], '不知道是谁');
  assert.ok(v2.self.inbox.some((m) => /有人从你背后经过/.test(m.text)));
  assert.equal(v2.self.sightings.length, 0, '站着不动的人不算经过');
  await room.teardown();
});

test('房间：圆桌没有投票，大家说完就回家；天亮公布昨天调包了几个人；没有发光', async () => {
  const room = await markRoom(5, { ...FAST, roam: 60, table: 60, night: 60 }, ['u2']);
  const g = await started(room, [T, T, T, T, T, B, H]);
  const [b1, b2] = g.players.slice(5).map((p) => p.id);
  const h = room.roam.houses[0];
  for (const id of ['u1', 'u2', g.players[2].id, b1]) putIn(room, id, h.id);
  await room.act('u1', 'mark', { kind: 'peek', target: b1 });
  await room.act('u2', 'mark', { kind: 'peek', target: b1 });
  room.mk.peek(g.players[2].id, b1);
  putIn(room, b2, h.id);
  room.mk.peek(b2, 'u1');
  room.mk.swap(b2, 'u1', other(g.suits.u1));
  await room.endRoam('时间到');
  await until(() => g.stage === 'table');
  assert.equal(g.stage, 'table');
  await room.act('u1', 'mark', { kind: 'done' });
  await room.act('u2', 'mark', { kind: 'done' });
  await until(() => g.stage === 'night', 5000);
  assert.equal(g.stage, 'night', '机器人也说完了，提前回家');
  assert.ok(!room.log.some((l) => /发光/.test(l.text)), '坏人被看了三次也不暴露');
  for (const id of g.aliveIds()) if (!(id in g.guesses)) room.mk.guess(id, g.suits[id]);
  await until(() => g.stage === 'morning', 5000);
  assert.ok(room.log.some((l) => /昨天有 \*\*1\*\* 个人被调包/.test(l.text)));
  await room.teardown();
});

test('房间：夜里写错的人只有自己看到爆炸，别人天亮才看到死讯；炸死的人第二天留遗言', async () => {
  const room = await markRoom(5, { ...FAST, night: 60, blast: 60 }, ['u2']);
  const g = await started(room, [T, T, T, T, T, B, H]);
  room.mk.botGuess = (id) => g.suits[id]; // 机器人都写对：天亮时这局还没结束
  await room.endRoam('时间到');
  await until(() => g.stage === 'night', 10000);
  await room.act('u1', 'mark', { kind: 'guess', suit: other(g.suits.u1) });
  await assert.rejects(room.act('u1', 'mark', { kind: 'guess', suit: g.suits.u1 }), /已经写下/);
  await room.act('u2', 'mark', { kind: 'guess', suit: g.suits.u2 });
  await until(() => !!g.blast, 5000);
  const v1 = room.viewFor('u1');
  assert.equal(v1.self.exploded, true);
  assert.equal(v1.self.blastSuit, g.suits.u1);
  const v2 = room.viewFor('u2');
  assert.equal(v2.self.exploded, false);
  assert.ok(v2.players.find((p) => p.id === 'u1').alive, '别人这时还看不到他死了');
  room.mk.dawn();
  assert.equal(room.viewFor('u2').players.find((p) => p.id === 'u1').alive, false);
  assert.ok(!room.log.some((l) => /写了|其实是/.test(l.text)), '不公布谁写错了什么');
  assert.equal(room.viewFor('u1').self.lastWord, true);
  await room.act('u1', 'mark', { kind: 'lastWord', text: '  别信 2 号  ' });
  assert.ok(room.log.some((l) => l.text.includes('的遗言：「别信 2 号」')));
  assert.equal(room.viewFor('u1').self.lastWord, false);
  await room.teardown();
});

test('机器人：调包、匿名信、头头看自己、遗言都会用；记得谁骗过自己', async () => {
  const room = await markRoom(6, { ...FAST, roam: 60 });
  const g = await started(room, [T, T, T, T, T, B, H]);
  const [a, b, c] = g.players.slice(1, 4).map((p) => p.id);
  const boss = g.players[5].id;
  const hand = g.players[6].id;
  const h = room.roam.houses[0];
  putIn(room, boss, h.id); putIn(room, hand, h.id); putIn(room, a, h.id);
  // 手下机器人：先看，然后有机会就调包（被看得越多越容易被调包）；头头不会调包
  g.peek(b, a); g.peek(c, a);
  for (let i = 0; i < 40; i++) room.mk.botStep(boss);
  assert.equal(g.swaps.length, 0, '头头机器人不调包');
  let swapped = false;
  for (let i = 0; i < 80 && !swapped; i++) { room.mk.botStep(hand); swapped = g.swaps.length > 0; }
  assert.ok(swapped, '手下机器人会调包');
  assert.equal(g.swaps[0].by, hand);
  assert.equal(g.swaps[0].target, a);
  assert.equal(room.mk.botClaim(hand, a), g.swaps[0].from, '调包过的人，手下说调包前的样子');
  // 匿名信：坏人写假的，好人写看到的
  g.letters = g.letters.filter((x) => x.from !== boss && x.from !== b);
  room.mk.botLetter(boss);
  const evilLetter = g.letters.find((x) => x.from === boss);
  assert.notEqual(evilLetter.suit, g.suits[evilLetter.to], '坏人写假的');
  room.mk.botLetter(b);
  assert.deepEqual([g.letters.find((x) => x.from === b).to, g.letters.find((x) => x.from === b).suit], [a, g.swaps[0].from], '好人写自己看到的（调包前看的）');
  // 记仇：活过一晚就知道前一天谁当面说了假话
  g.tell(boss, b, other(g.suits[b]));
  g.tell(c, b, g.suits[b]);
  toNight(g);
  assert.equal(room.mk.botGuess(boss), g.suits[boss], '头头没把握时用一次机会看自己');
  assert.equal(g.revealsLeft(boss), 1);
  for (const p of g.alive()) if (!(p.id in g.guesses)) g.guess(p.id, p.id === a ? other(g.suits[a]) : g.suits[p.id]);
  g.dawn();
  const mem = room.mk.memory(b);
  assert.ok(mem.liars.has(boss) && mem.honest.has(c));
  g.openRoam();
  g.tell(boss, b, 'spade'); g.tell(c, b, 'heart');
  assert.equal(room.mk.botGuess(b), 'heart', '信说过真话的人');
  room.mk.botLastWord(a);
  assert.ok(g.lastWords.some((w) => w.by === a), '炸死的机器人留遗言');
  await room.teardown();
});

test('机器人：坏人七成说谎；好人说看到的（雾天挑同色的花色）', async () => {
  const room = await markRoom(4, { ...FAST, roam: 60 });
  const g = await started(room, [T, T, T, B, H]);
  const [t1, t2] = g.players.slice(1, 3).map((p) => p.id);
  const boss = g.players[3].id;
  g.peek(boss, 'u1'); g.peek(t1, 'u1');
  let lies = 0;
  for (let i = 0; i < 300; i++) if (room.mk.botClaim(boss, 'u1') !== g.suits.u1) lies++;
  assert.ok(lies > 160 && lies < 260, `说谎 ${lies}/300`);
  assert.equal(room.mk.botClaim(t1, 'u1'), g.suits.u1);
  g.fog[g.day] = true;
  g.peek(t2, 'u1');
  for (let i = 0; i < 20; i++) assert.equal(colorOf(room.mk.botClaim(t2, 'u1')), colorOf(g.suits.u1));
  await room.teardown();
});

test('房间：房主关掉调包和遗言后，开局的规则跟着关，界面和公告都不提', async () => {
  const room = await markRoom(5, { ...FAST, roam: 60, night: 60, blast: 60 }, ['u2']);
  await room.act('u1', 'settings', { markSwap: false, markLastWords: false });
  await assert.rejects(room.act('u2', 'settings', { markSwap: true }), /房主/);
  assert.equal(room.settings.markSwap, false);
  const g = await started(room, [T, B, T, T, T, T, H]);
  assert.deepEqual([g.rules.swap, g.rules.lastWords], [false, false]);
  assert.ok(room.log.some((l) => /这局没有调包。这局没有遗言/.test(l.text)));
  const h = room.roam.houses[0];
  putIn(room, 'u1', h.id); putIn(room, 'u2', h.id);
  await room.act('u2', 'mark', { kind: 'peek', target: 'u1' });
  assert.equal(room.viewFor('u2').self.swapTargets, null, '坏人没有调包按钮');
  await assert.rejects(room.act('u2', 'mark', { kind: 'swap', target: 'u1', suit: other(g.suits.u1) }), /关掉了调包/);
  assert.ok(!room.viewFor('u2').self.role.ability.includes('调包'));
  room.mk.botGuess = (id) => g.suits[id];
  await room.endRoam('时间到');
  await until(() => g.stage === 'night', 10000);
  await room.act('u1', 'mark', { kind: 'guess', suit: other(g.suits.u1) });
  await room.act('u2', 'mark', { kind: 'guess', suit: g.suits.u2 });
  await until(() => !!g.blast, 5000);
  room.mk.dawn();
  assert.equal(room.viewFor('u1').self.lastWord, false, '炸死了也不能留遗言');
  assert.ok(!room.log.some((l) => /被调包了|留一句遗言/.test(l.text)), '天亮不公布调包人数、不提遗言');
  await room.teardown();
});

test('房间：存档读档后接着跑完', async () => {
  const room = await markRoom(6, { ...FAST, night: 60 });
  await room.act('u1', 'start');
  const g = room.game;
  await until(() => g.stage === 'night', 10000);
  const snap = JSON.parse(JSON.stringify(room.snapshot()));
  snap.deadline = Date.now(); // 重启时夜里已经到点
  await room.teardown();
  const back = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice() }).restore(snap);
  back.mk.limits = FAST;
  back.mk.speed = 0.002;
  assert.ok(back.game.mark);
  back.resume();
  await until(() => back.ended, 20000);
  assert.ok(back.ended, `读档后没跑完：停在 ${back.game.stage}`);
  await back.teardown();
});

test('房间：终局时记下生还排行（onMarkEnded），markStats 能取到', async () => {
  const room = await markRoom(4);
  let archived = null;
  room.onMarkEnded = (r) => { archived = r.game.survival(); };
  room.history = { markStats: () => summarizeMark([{ endedAt: 1, players: archived ?? [] }], { minGames: 1 }) };
  await room.act('u1', 'start');
  await until(() => room.ended, 20000);
  assert.equal(archived?.length, 5);
  const { stats } = await room.act('u1', 'markStats');
  assert.deepEqual(stats.map((s) => s.id), ['u1'], '机器人不进排行');
  await room.teardown();
});
