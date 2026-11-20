// 夜半狂欢的恶魔开关（2026-11-19 用户）：亡骨魔可以换成小怪宝或利维坦；
// 哈迪寂亚口径（2026-11-20 改）：死人选活当场复活、夜里是活的，复活又死是新的死亡，死人票刷新（官方百科 How to run；11-19 那次「不刷新」作废）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { swapMoDemon } from '../src/engine/snv.js';
import { ROLES, rolesOf } from '../src/engine/roles.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, opts = {}) => new Game(players(roles.length), { roles, rng: makeRng(opts.seed ?? 7), script: 'mo', misregister: 0, ...opts });
const count = (roles, team) => roles.filter((r) => ROLES[r].team === team).length;

function night(g, choices = {}, answer = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, Array.isArray(t) ? t : t.targets, Array.isArray(t) ? {} : { role: t.role });
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  const msgs = [...r.messages];
  for (let k = 0; r.pause && k < 10; k++) {
    const a = answer[r.pause];
    if (a?.targets) g.submitChoice(r.pause, a.targets); else if (a) g.submitChoice(r.pause, [], { role: a }); else g.autoChoose(r.pause);
    r = g.resolveNight();
    msgs.push(...r.messages);
  }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...msgs] };
}

test('开局换恶魔：亡骨魔换成利维坦 / 小怪宝，补回亡骨魔少掉的那个外来者；小怪宝的位置换成一个爪牙', () => {
  const base = ['noble', 'savant', 'fisherman', 'professor', 'farmer', 'snakecharmer', 'drunk', 'poisoner', 'vigormortis'];
  for (let seed = 1; seed <= 20; seed++) {
    const levi = swapMoDemon(base, 'leviathan', makeRng(seed));
    assert.equal(levi.length, base.length);
    assert.ok(levi.includes('leviathan') && !levi.includes('vigormortis'));
    assert.equal(count(levi, 'outsider'), count(base, 'outsider') + 1, '外来者补回一个');
    assert.equal(count(levi, 'townsfolk'), count(base, 'townsfolk') - 1);
    const lm = swapMoDemon(base, 'lilmonsta', makeRng(seed));
    assert.equal(count(lm, 'demon'), 0, '小怪宝：没有恶魔玩家');
    assert.equal(count(lm, 'minion'), 2, '多一个爪牙');
    assert.equal(new Set(lm).size, lm.length, '不会出现重复角色');
  }
  assert.deepEqual(swapMoDemon(base, 'vigormortis', makeRng(1)), base);
  const ah = base.map((r) => (r === 'vigormortis' ? 'alhadikhia' : r));
  assert.deepEqual(swapMoDemon(ah, 'lilmonsta', makeRng(1)), ah, '抽到哈迪寂亚的局不换');
  assert.deepEqual(swapMoDemon(base, 'leviathan', makeRng(1), new Set([8])), base, '房主指定了亡骨魔的不换');
  assert.deepEqual(rolesOf('mo', 'demon', 'lilmonsta'), ['alhadikhia', 'lilmonsta']);
});

const LM = ['noble', 'savant', 'fisherman', 'professor', 'snakecharmer', 'poisoner', 'mezepheles'];

test('小怪宝：没有恶魔玩家，照看的爪牙「是恶魔」；首夜爪牙互认，不给伪装', () => {
  const g = mk(LM, { demonSwap: 'lilmonsta' });
  assert.ok(g.monsta);
  const holder = g.get(g.monsta.holder);
  assert.equal(ROLES[holder.role].team, 'minion');
  assert.equal(g.demon()?.id, holder.id);
  assert.ok(!g.winner);
  const r = night(g, {}, { [holder.id]: { targets: ['p7'] } });
  assert.match(r.messages.find((m) => m.playerId === 'p6')?.text ?? '', /小怪宝在场/);
  assert.equal(g.monsta.holder, 'p7', '照看的人换成选的那个爪牙');
  assert.equal(g.aliveCount(), 7, '首夜没人死');
  assert.ok(r.messages.some((m) => m.playerId === 'p7' && /由\*\*你\*\*照看小怪宝/.test(m.text)));
});

test('小怪宝：首夜以外说书人替恶魔杀一人（不杀邪恶）；照看的人被处决，善良获胜', () => {
  const g = mk(LM, { demonSwap: 'lilmonsta' });
  night(g); g.dawn(); g.endDay();
  night(g);
  assert.equal(g.aliveCount(), 6, '说书人杀了一人');
  assert.ok(g.players.filter((q) => !q.alive).every((q) => !g.evilOf(q)));
  g.dawn();
  const holder = g.monsta.holder;
  g.nominate(g.alive().find((q) => q.id !== holder).id, holder);
  g.recordVote(holder, g.alive().map((q) => q.id));
  g.endDay();
  assert.equal(g.winner, 'good');
});

test('小怪宝：舞蛇人选中照看的人，互换角色和阵营，舞蛇人接着照看', () => {
  const g = mk(LM, { demonSwap: 'lilmonsta' });
  night(g); g.dawn(); g.endDay();
  const holder = g.monsta.holder;
  const role = g.get(holder).role;
  night(g, { p5: [holder] });
  assert.equal(g.get('p5').role, role);
  assert.ok(g.evilOf(g.get('p5')));
  assert.equal(g.get(holder).role, 'snakecharmer');
  assert.equal(g.monsta.holder, 'p5');
  assert.ok(!g.winner);
});

test('小怪宝：读档后照看的人还在；工程师、麻脸巫婆不能造出小怪宝', () => {
  const g = mk([...LM.slice(0, 4), 'engineer', 'pithag', 'mezepheles'], { demonSwap: 'lilmonsta' });
  night(g);
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(back.monsta.holder, g.monsta.holder);
  assert.equal(back.demonSwap, 'lilmonsta');
  g.startNight();
  const pr = g.nightPrompts().find((x) => x.playerId === 'p5');
  assert.ok(pr && !pr.roleOptions.includes('lilmonsta') && !pr.roleOptions.includes('vigormortis'));
});

test('利维坦：夜半狂欢里照常——不杀人，第二名善良被处决邪恶获胜', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'drunk', 'poisoner', 'leviathan'], { demonSwap: 'leviathan' });
  night(g); g.dawn();
  assert.equal(g.aliveCount(), 8);
  for (const id of ['p1', 'p2']) {
    g.nominate('p3', id);
    g.recordVote(id, g.alive().map((q) => q.id));
    g.endDay();
    if (g.winner) break;
    night(g); g.dawn();
  }
  assert.equal(g.winner, 'evil');
});

test('哈迪寂亚：入夜是死的、复活又死——夜里是活过的，死人票刷新；新死的人照常有票', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'balloonist', 'farmer', 'poisoner', 'alhadikhia']); // 不放教授：他会把死人救回来
  night(g); g.dawn(); g.endDay();
  night(g, { p7: ['p1', 'p4', 'p5'] }, { p1: 'ah_die', p4: 'ah_live', p5: 'ah_live' });
  assert.equal(g.get('p1').alive, false);
  g.dawn();
  g.get('p1').ghostVote = false; // 白天用掉了死人票
  g.endDay();
  night(g, { p7: ['p1', 'p2', 'p3'] }, { p1: 'ah_live', p2: 'ah_live', p3: 'ah_live' });
  assert.equal(g.get('p1').alive, false, '复活后三个都活，一起死');
  assert.equal(g.get('p1').ghostVote, true, '夜里复活过，再死是新的死亡：死人票刷新');
  assert.equal(g.get('p2').ghostVote, true, '新死的人有死人票');
});

const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, rpsSeconds: 0.05 };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：设置里选小怪宝，开局的局记下换了恶魔、视图带给前端；不认识的值不收', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'mo' } });
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'settings', { moDemon: 'imp' });
  assert.equal(room.settings.moDemon, 'vigormortis');
  await room.act('u1', 'settings', { moDemon: 'lilmonsta' });
  await room.act('u1', 'addBots', { count: 7 });
  await room.act('u1', 'start');
  try {
    const g = room.game;
    assert.equal(g.demonSwap, 'lilmonsta');
    assert.ok(!g.players.some((q) => q.role === 'vigormortis'), '没有亡骨魔');
    assert.equal(room.viewFor('u1').demonSwap, 'lilmonsta');
    if (!g.atheist && !g.players.some((q) => q.role === 'alhadikhia')) assert.ok(g.monsta, '没抽到哈迪寂亚（也不是无神论者局）就是小怪宝局');
  } finally { await room.teardown(); }
});
