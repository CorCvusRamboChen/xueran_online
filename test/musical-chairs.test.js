// 2026-11-23 抢椅子（Musical Chairs，Chuji）：异教领袖、国王、唱诗男孩，旅行者黑帮（集石百科）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, travellersOf } from '../src/engine/roles.js';
import { NIGHT_ORDER, MIX_STEPS, NOT_STEPS, STEP_NAMES } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, st = {}) => { const g = new Game(players(roles.length), { roles, rng: makeRng(7), script: 'mc' }); Object.assign(g.st, st); return g; };
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages ?? []), ...r.messages] };
}

test('抢椅子：角色、旅行者、地图、夜晚顺序都在', () => {
  assert.equal(rolesOf('mc').length, 25);
  assert.ok(rolesOf('mc').every((r) => ROLES[r]));
  assert.deepEqual(travellersOf('mc'), ['gangster', 'harlot', 'matron', 'deviant', 'apprentice']);
  assert.equal(getMap('mc').id, 'mc');
  for (const [id] of [...NIGHT_ORDER.mc.first, ...NIGHT_ORDER.mc.other]) assert.ok(NOT_STEPS.has(id) || STEP_NAMES[id] || [...MIX_STEPS.first, ...MIX_STEPS.other].includes(id), id);
  assert.ok(!rolesOf('snv').includes('cultleader'));
});

test('唱诗男孩 [+国王]：发了唱诗男孩就一定有国王', () => {
  let seen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const roles = rollMixed('mc', 7 + (seed % 9), makeRng(seed));
    if (roles.includes('choirboy')) { seen++; assert.ok(roles.includes('king'), `seed ${seed}`); }
  }
  assert.ok(seen > 20);
});

test('异教领袖：两个活邻座都邪恶时变邪恶；所有善良都加入教派，他的阵营获胜；假的、没全加入都没用', () => {
  const g = mk(['poisoner', 'cultleader', 'fanggu', 'empath', 'investigator', 'librarian', 'sailor']);
  const { messages } = night(g);
  assert.equal(g.evilOf(g.get('p2')), true, '邻座投毒者、方古都是邪恶');
  assert.match(text(messages, 'p2'), /邪恶/);
  g.dawn();
  const goods = g.players.filter((q) => !g.evilOf(q)).map((q) => q.id);
  assert.deepEqual(g.cultResolve('p4', goods), { won: false }, '共情者不是异教领袖');
  assert.deepEqual(g.cultResolve('p2', goods.slice(1)), { won: false }, '有善良没加入');
  assert.deepEqual(g.cultResolve('p2', goods), { won: true });
  assert.equal(g.winner, 'evil', '他现在是邪恶的：邪恶获胜');
});

test('国王：恶魔首夜就知道谁是国王；死人不少于活人时每晚得知一个存活的角色；唱诗男孩在恶魔杀死国王那晚得知恶魔', () => {
  const g = mk(['king', 'choirboy', 'empath', 'poisoner', 'nodashii', 'librarian', 'sailor'], { kingSees: (p) => 'nodashii' });
  const first = night(g);
  assert.match(text(first.messages, 'p5'), /\*\*1号 玩家1\*\* 是\*\*国王\*\*/);
  g.dawn(); g.endDay();
  for (const id of ['p3', 'p6', 'p7']) g.snvDie(g.get(id), 'storyteller', []);
  const second = night(g, { p5: ['p4'] });
  assert.match(text(second.messages, 'p1'), /存活的角色里有/, '恶魔今晚又杀一人：死 4 活 3，国王醒来');
  g.dawn(); g.endDay();
  const third = night(g, { p5: ['p1'] }); // 恶魔杀国王
  assert.equal(g.get('p1').alive, false);
  assert.match(text(third.messages, 'p2'), /\*\*5号 玩家5\*\* 是恶魔/, '唱诗男孩得知恶魔');
});

test('黑帮：只能杀活邻座，另一边同意才死；每天一次', () => {
  const g = mk(['empath', 'investigator', 'librarian', 'poisoner', 'fanggu', 'sailor', 'fool']);
  g.addTraveller({ id: 't1', name: '黑帮' }, 'gangster', false);
  night(g); g.dawn();
  const me = g.get('t1');
  const nb = g.aliveNeighbours(me).map((q) => q.id);
  assert.throws(() => g.gangsterCheck('t1', g.players.find((q) => !nb.includes(q.id) && q.id !== 't1').id), /活着的邻座/);
  const other = g.gangsterCheck('t1', nb[0]);
  assert.equal(other, nb[1]);
  const r = g.gangsterKill('t1', nb[0]);
  assert.equal(r.died !== undefined, true);
  assert.throws(() => g.gangsterCheck('t1', nb[1]), /今天已经用过了/);
});

test('抢椅子：随机跑完整局不崩（各人数 80 局）', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const rng = makeRng(seed);
    const n = 5 + (seed % 11);
    const g = new Game(players(n), { roles: rollMixed('mc', n, rng), rng, script: 'mc' });
    for (let d = 0; d < 20 && !g.winner; d++) {
      night(g);
      if (g.winner) break;
      g.dawn();
      if (g.winner) break;
      const al = g.alive();
      g.block = al[Math.floor(rng() * al.length)].id;
      g.endDay();
    }
    assert.ok(g.winner, `${n} 人 seed ${seed} 打了 20 天没结束`);
  }
});

test('房间：发起教派后大家举手、到点结算，一轮里不能再发起', async () => {
  const { Room } = await import('../src/server/room.js');
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
  const voice = () => { let n = 0; return { async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} }; };
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: voice(), settings: { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, exileSeconds: 0.05, mode: 'auto', shuffle: false, script: 'mc' } });
  room.moonchildWaitMs = 5; room.judgeReady = () => false;
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 7 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'cultleader' });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    for (let k = 0; k < 400 && g.phase === 'night'; k++) { if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count) }).catch(() => {}); await sleep(3); }
    await until(() => g.phase === 'day', 3000);
    assert.equal(room.viewFor('u1').self.canCult, true);
    await room.act('u1', 'cult');
    assert.ok(room.viewFor('u1').cult, '全场看得到教派举手');
    await assert.rejects(room.act('u1', 'cult'), /等这一轮结束|今天已经/);
    await until(() => !room.cult, 3000);
    assert.ok(room.log.some((l) => /教派：\d+ 人加入/.test(l.text)));
  } finally { await room.teardown(); }
});

test('酒鬼不重身份：以为的镇民不在场，也不和提线木偶以为的撞', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const roles = ['marionette', 'drunk', 'fanggu', 'empath', 'investigator', 'librarian', 'sailor'];
    const g = new Game(players(7), { roles, rng: makeRng(seed), script: 'mc' });
    const d = g.players.find((q) => q.role === 'drunk'); const m = g.players.find((q) => q.role === 'marionette');
    assert.ok(!g.players.some((q) => q.role === d.shownRole), `seed ${seed}：酒鬼以为的 ${d.shownRole} 在场`);
    assert.notEqual(d.shownRole, m.shownRole, `seed ${seed}：酒鬼和提线木偶都以为自己是 ${d.shownRole}`);
  }
});
