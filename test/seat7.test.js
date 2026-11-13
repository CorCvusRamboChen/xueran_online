// 《七步成诗》（2025 剧本世界杯冠军）和引擎统一：暗流涌动的角色、普卡、旅店老板在通用引擎（engine/snv.js）里按官方口径结算，
// 9 个新角色各一条以上的断言，7 号空座的灯神规则。口径见 .claude/skills/botc-storyteller/references/seat7.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed, BOFFIN_POOL } from '../src/engine/snv.js';
import { buildRoles } from '../src/engine/assign.js';
import { ROLES, rolesOf, SCRIPTS, engineOf } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES, NOT_STEPS } from '../src/shared/nightOrder.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function mk(roles, { seed = 7, misregister = 0, script = 'bs7' } = {}) {
  return new Game(players(roles.length), { roles, rng: makeRng(seed), script, misregister });
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...r.messages] };
}
const toDay = (g) => g.dawn();
// 8 人：贵族 图书管理员 修行者 村夫 贞洁者 圣徒 鹰身女妖 小恶魔
const BASE = ['noble', 'librarian', 'shugenja', 'villageidiot', 'virgin', 'saint', 'harpy', 'imp'];

test('七步成诗：剧本表、引擎、人数；夜晚顺序里每个会醒的角色都在结算表里', () => {
  assert.equal(rolesOf('bs7').length, 25);
  assert.equal(engineOf('bs7'), 'snv');
  assert.deepEqual(rolesOf('bs7', 'demon'), ['pukka', 'imp', 'vigormortis']);
  assert.ok(SCRIPTS.bs7.seat7);
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const [id] of [...NIGHT_ORDER.bs7.first, ...NIGHT_ORDER.bs7.other]) {
    if (STEP_NAMES[id] || NOT_STEPS.has(id)) continue;
    assert.ok(steps.includes(id), id);
  }
  // 暗流涌动的角色也都在结算表里（引擎统一）
  for (const id of rolesOf('tb')) if (ROLES[id].firstNight || ROLES[id].otherNight) assert.ok(steps.includes(id), id);
});

test('配板：男爵 +2 外来者、亡骨魔 -1、村夫可以有多个；人数总是对的', () => {
  for (let seed = 1; seed < 300; seed++) {
    for (const n of [7, 9, 12, 15]) {
      const roles = rollMixed('bs7', n, makeRng(seed));
      assert.equal(roles.length, n);
      const others = roles.filter((r) => r !== 'villageidiot');
      assert.equal(new Set(others).size, others.length, '除了村夫，角色不重复');
      assert.ok(roles.filter((r) => r === 'villageidiot').length <= 3);
      assert.equal(roles.filter((r) => ROLES[r].team === 'demon').length, 1);
    }
  }
  const roles = buildRoles(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { a: 'baron', b: 'imp' }, 'bs7', makeRng(3));
  assert.equal(roles.filter((r) => ROLES[r].team === 'outsider').length, 2, '7 人 0 外来者 + 男爵 2');
});

test('多个村夫：其中一个整局醉酒；村夫每晚得知一名玩家的阵营', () => {
  const g = mk(['villageidiot', 'villageidiot', 'villageidiot', 'noble', 'saint', 'harpy', 'imp']);
  const drunk = g.players.filter((p) => p.role === 'villageidiot' && g.broken(p));
  assert.equal(drunk.length, 1);
  const healthy = g.players.find((p) => p.role === 'villageidiot' && !g.broken(p));
  const { messages } = night(g, { [healthy.id]: ['p7'], p6: ['p4', 'p5'] });
  assert.match(text(messages, healthy.id), /7号 玩家7 是 \*\*邪恶\*\* 的/);
});

test('多个村夫：死了一个，另一个的醉酒不变；醉酒的村夫变成别的角色就不再醉', () => {
  const g = mk(['villageidiot', 'villageidiot', 'noble', 'saint', 'virgin', 'harpy', 'imp']);
  const drunk = g.players.find((p) => p.role === 'villageidiot' && g.broken(p));
  const sober = g.players.find((p) => p.role === 'villageidiot' && !g.broken(p));
  sober.alive = false;
  assert.ok(g.broken(drunk), '清醒的村夫死了，醉酒的那个还是醉');
  g.changeRole(drunk, 'farmer');
  assert.ok(!g.broken(drunk), '不再是村夫，醉酒结束');
});

test('贵族：三个人里恰好一个邪恶；修行者：最近的邪恶在哪一边；图书管理员：外来者', () => {
  const g = mk(BASE);
  const { messages } = night(g, { p4: ['p5'], p7: ['p5', 'p6'] });
  const noble = text(messages, 'p1');
  const named = [...noble.matchAll(/(\d+)号/g)].map((m) => g.players[Number(m[1]) - 1]);
  assert.equal(named.length, 3);
  assert.equal(named.filter((q) => g.evilOf(q)).length, 1);
  // p3 修行者：p7（鹰身女妖）往顺时针 4 步，往逆时针 4 步（8 人座）→ 一样近；p8 小恶魔顺时针 5、逆时针 3 → 逆时针更近
  assert.match(text(messages, 'p3'), /逆时针/);
  assert.match(text(messages, 'p2'), /有一人是 \*\*圣徒\*\*/);
});

test('魔术师：爪牙看到两个「恶魔」，恶魔的爪牙名单里也有他', () => {
  const g = mk(['magician', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  const { messages } = night(g, { p6: ['p2', 'p3'] });
  assert.match(text(messages, 'p6'), /恶魔是：.*1号 玩家1.*|恶魔是：.*7号 玩家7.*1号 玩家1/);
  assert.match(text(messages, 'p7'), /你的爪牙：.*1号 玩家1/);
  assert.ok(g.evilKnown.p6.some((x) => x.id === 'p1' && x.team === '恶魔'));
});

test('落难少女：爪牙首夜得知她在场；爪牙合计只有一次，猜中邪恶获胜，别人猜没有效果', () => {
  const g = mk(['damsel', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  const { messages } = night(g, { p6: ['p2', 'p3'] });
  assert.match(text(messages, 'p6'), /落难少女在场/);
  toDay(g);
  g.damselGuess('p2', 'p1'); // 善良玩家猜：没有效果，也不占爪牙的机会
  assert.equal(g.winner, null);
  assert.equal(g.damselGuessed, false);
  assert.throws(() => g.damselGuess('p2', 'p3'), /猜过了/);
  g.damselGuess('p6', 'p1');
  assert.equal(g.winner, 'evil');

  const h = mk(['damsel', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  night(h, { p6: ['p2', 'p3'] }); toDay(h);
  h.damselGuess('p6', 'p2'); // 猜错：爪牙再没有机会
  assert.equal(h.damselGuessed, true);
  assert.equal(h.winner, null);
});

test('鹰身女妖：第一人收到疯狂的要求；没公开指认的话黄昏时可能死人；公开指认了就没事', () => {
  const g = mk(BASE);
  const { messages } = night(g, { p7: ['p1', 'p2'], p4: ['p3'] });
  assert.match(text(messages, 'p1'), /疯狂.*2号 玩家2 是邪恶的/);
  toDay(g);
  g.st.roll = () => true; // 说书人判定：杀
  const { harpyDead } = g.endDay();
  assert.ok(harpyDead.length >= 1);
  assert.ok(harpyDead.includes('p1'));

  const h = mk(BASE);
  night(h, { p7: ['p1', 'p2'], p4: ['p3'] });
  toDay(h);
  h.harpyClaim('p1');
  h.st.roll = () => true;
  assert.deepEqual(h.endDay().harpyDead, []);
});

test('贞洁者：第一次被镇民提名，提名者立即被处决；圣徒被处决善良落败', () => {
  const g = mk(BASE);
  night(g, { p7: ['p2', 'p3'], p4: ['p1'] }); toDay(g);
  const r = g.nominate('p1', 'p5');
  assert.equal(r.virgin, true);
  assert.equal(g.get('p1').alive, false);
  assert.throws(() => g.nominate('p2', 'p8'), /今天已经处决过了/);
  // 第二次被提名不再触发（下一天）
  night(g, { p7: ['p2', 'p3'], p4: ['p2'], p8: ['p4'] }); toDay(g);
  assert.equal(g.nominate('p2', 'p5').virgin, false);

  const h = mk(BASE);
  night(h, { p7: ['p2', 'p3'], p4: ['p1'] }); toDay(h);
  h.block = 'p6';
  h.endDay();
  assert.equal(h.winner, 'evil');
});

test('旅店老板、僧侣、士兵挡刀；投毒者让信息失效到明天黄昏', () => {
  const g = mk(['innkeeper', 'monk', 'soldier', 'empath', 'chef', 'poisoner', 'imp'], { script: 'bs7' });
  night(g, { p6: ['p4'] }); toDay(g); g.endDay();
  assert.ok(g.broken(g.get('p4')) === false, '投毒到第一天黄昏结束');
  night(g, { p1: ['p4', 'p5'], p2: ['p3'], p6: ['p5'], p7: ['p4'] });
  assert.ok(g.get('p4').alive, '旅店老板保护');
  toDay(g); g.endDay();
  night(g, { p1: ['p1', 'p2'], p2: ['p4'], p6: ['p1'], p7: ['p4'] });
  assert.ok(g.get('p4').alive, '僧侣保护');
  toDay(g); g.endDay();
  night(g, { p1: ['p1', 'p2'], p2: ['p4'], p6: ['p1'], p7: ['p3'] });
  assert.ok(g.get('p3').alive, '士兵不会被恶魔杀死');
});

test('普卡：首夜只下毒；第二夜上一个中毒的人死亡并恢复健康', () => {
  const g = mk(['noble', 'librarian', 'empath', 'virgin', 'saint', 'harpy', 'pukka']);
  night(g, { p7: ['p3'], p6: ['p1', 'p2'] });
  assert.ok(g.get('p3').alive);
  assert.ok(g.broken(g.get('p3')));
  toDay(g); g.endDay();
  night(g, { p7: ['p1'], p6: ['p1', 'p2'] });
  assert.equal(g.get('p3').alive, false);
  assert.ok(g.broken(g.get('p1')));
});

test('农夫夜里死了：一名存活的善良玩家变成农夫', () => {
  const g = mk(['farmer', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  night(g, { p6: ['p2', 'p3'] }); toDay(g); g.endDay();
  const { messages } = night(g, { p6: ['p2', 'p3'], p7: ['p1'] });
  assert.equal(g.get('p1').alive, false);
  const heir = g.players.find((p) => p.alive && p.role === 'farmer');
  assert.ok(heir && !g.evilOf(heir));
  assert.match(text(messages, heir.id), /你现在是农夫/);
});

test('守鸦人（暗流涌动的角色）在通用引擎里：夜里死了醒来看一个人的角色', () => {
  const g = mk(['ravenkeeper', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  night(g, { p6: ['p2', 'p3'] }); toDay(g); g.endDay();
  const r = night(g, { p6: ['p2', 'p3'], p7: ['p1'] });
  assert.equal(r.ravenkeeper, 'p1');
  assert.match(g.resolveRavenkeeper('p7').text, /小恶魔/);
});

test('科学怪人：恶魔拿到一个不在场的善良能力，两人首夜都知道', () => {
  const g = mk(['noble', 'librarian', 'virgin', 'saint', 'damsel', 'boffin', 'imp']);
  assert.ok(BOFFIN_POOL.includes(g.boffin));
  assert.ok(!g.players.some((p) => p.role === g.boffin));
  const { messages } = night(g);
  assert.match(text(messages, 'p6'), new RegExp(`恶魔拿到了 \\*\\*${ROLES[g.boffin].name}`));
  assert.match(text(messages, 'p7'), new RegExp(`你还拥有${ROLES[g.boffin].name}的能力`));
  assert.equal(g.extraAbility(g.get('p7')), g.boffin);
  assert.ok(g.has(g.get('p7'), g.boffin));
});

test('炸弹人被处决：只剩包括恶魔在内的三人；倒数时被最多人指着的死，平票没人死', () => {
  const g = mk(['noble', 'librarian', 'shugenja', 'virgin', 'saint', 'empath', 'chef', 'boomdandy', 'imp']);
  night(g); toDay(g);
  g.block = 'p8';
  g.endDay();
  assert.equal(g.aliveCount(), 3);
  assert.ok(g.get('p9').alive, '恶魔留下');
  const [a, b] = g.boom.alive.filter((id) => id !== 'p9');
  for (const id of ['p1', 'p2', 'p3']) g.boomPoint(id, 'p9');
  g.boomPoint('p4', a);
  const who = g.boomResolve();
  assert.equal(who, 'p9');
  assert.equal(g.winner, 'good');
  void b;

  const h = mk(['noble', 'librarian', 'shugenja', 'virgin', 'saint', 'empath', 'chef', 'boomdandy', 'imp']);
  night(h); toDay(h); h.block = 'p8'; h.endDay();
  const [x, y] = h.boom.alive;
  h.boomPoint('p1', x); h.boomPoint('p2', y);
  assert.equal(h.boomResolve(), null, '平票没人死');
  assert.equal(h.aliveCount(), 3);
});

test('陌客可能被当作恶魔：占卜师、猎手', () => {
  const g = mk(['fortuneteller', 'slayer', 'recluse', 'virgin', 'saint', 'harpy', 'imp'], { misregister: 1 });
  const { messages } = night(g, { p1: ['p3', 'p4'], p6: ['p4', 'p5'] });
  assert.match(text(messages, 'p1'), /之中\*\*有\*\*恶魔/);
  toDay(g);
  assert.equal(g.slay('p2', 'p3').hit, true);
});

// ───────────── 房间：7 号空座 ─────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
function mockVoice() {
  let n = 0;
  return {
    async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; },
    async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {},
  };
}

test('房间：7 号座位是空座，照样发角色；不提名不投票，用掉一次发言；整局能跑完', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'bs7' } });
  room.moonchildWaitMs = 5;
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 3 });
  await assert.rejects(room.act('u1', 'start'), /6–14 名玩家/);
  await room.act('u1', 'addBots', { count: 2 });
  await room.act('u1', 'start');
  const g = room.game;
  assert.equal(g.players.length, 8);
  const s7 = g.players[6];
  assert.equal(s7.id, 'bot-seat7');
  assert.equal(s7.seat, 7);
  assert.ok(s7.seat7 && ROLES[s7.role]);
  g.st.roll = (kind) => kind === 'seat7Speak'; // 第一天就让它发言
  let days = 0;
  while (!g.winner && !room.ended && days < 15) {
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count) }).catch(() => {});
      }
      if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id }).catch(() => {});
      await sleep(3);
    }
    if (g.winner || room.ended) break;
    days++;
    await until(() => room.roam || room.ended, 300);
    if (room.ended) break;
    await room.act('u1', 'gather');
    await until(() => g.seat7?.spoke || room.ended, 15000);
    if (g.winner || room.ended) break;
    assert.ok(!g.nominators.has('bot-seat7'), '7 号空座不提名');
    if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
    if (g.boom) for (const p of g.players) g.boom && g.boomPoint(p.id, g.boom.alive[0]);
    if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
    await until(() => g.phase !== 'day' || g.winner || room.ended, 30000);
  }
  assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
  assert.ok(g.timeline.some((e) => /7 号空座用掉了唯一一次发言/.test(e.text)));
  assert.ok(room.log.some((e) => /7 号空座/.test(e.text ?? e)), '公告里有 7 号空座的发言');
  await room.teardown();
});

// ───────────── 规则审查（2026-11-04）的回归测试 ─────────────
test('落难少女死了：被爪牙猜中也不算；死了的爪牙也能猜', () => {
  const g = mk(['damsel', 'noble', 'librarian', 'virgin', 'saint', 'harpy', 'imp']);
  night(g, { p6: ['p2', 'p3'] }); toDay(g);
  g.block = 'p1'; g.endDay();
  assert.equal(g.get('p1').alive, false);
  night(g, { p6: ['p2', 'p3'], p7: ['p2'] }); toDay(g);
  g.damselGuess('p6', 'p1');
  assert.equal(g.winner, null);
});

test('科学怪人给恶魔的能力：恶魔醉了照样有效', () => {
  const g = mk(['noble', 'librarian', 'virgin', 'saint', 'damsel', 'boffin', 'imp']);
  g.boffin = 'soldier';
  g.addFx('drunk', 'p7', null, 'never', '测试');
  assert.ok(g.abilityOn(g.get('p7'), 'soldier'));
  assert.equal(g.lieMode(g.get('p7')), null);
});

test('7 号空座的发言方式：公开、私聊（只有那个人收到）、提名（邪恶的拿来提名善良玩家）', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'bs7' } });
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join'); await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  g.phase = 'day'; g.day = 1;
  const told = [];
  room.tell = (id, text) => told.push({ id, text });
  g.st.roll = () => true;
  room.seat7Mode = () => 'private';
  room.seat7Target = () => g.get('u2');
  await room.seat7Speak();
  assert.ok(told.some((t) => t.id === 'u2' && /7 号空座\*\*私下对你说/.test(t.text)));
  assert.ok(g.timeline.some((e) => /私聊/.test(e.text)));
  assert.ok(g.seat7.spoke);
  await room.teardown();
});
