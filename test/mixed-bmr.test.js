// 引擎统一：黯月初升的角色在通用引擎（engine/snv.js）里按原来的口径结算（对照 engine/bmr.js 和 references/bad-moon-rising.md）。
// 用一个只在测试里登记的自选剧本，把黯月初升的角色和别的剧本的角色混在一起。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { ROLES, rolesOf, SCRIPTS } from '../src/engine/roles.js';
import { MIX_STEPS } from '../src/shared/nightOrder.js';

SCRIPTS.mixtest = { id: 'mixtest', name: '混合测试', engine: 'snv', roles: [...rolesOf('bmr'), 'empath', 'monk', 'soldier', 'scarletwoman', 'imp', 'noble'] };

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'mixtest', misregister: 0 });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, Array.isArray(t) ? t : t.targets, Array.isArray(t) ? {} : t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 5; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...r.messages] };
}
const day = (g) => g.dawn();
const dusk = (g, id) => { if (id) g.block = id; return g.endDay(); };

test('黯月初升会醒的角色都在通用引擎的结算表里', () => {
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const id of rolesOf('bmr')) {
    if (id === 'lunatic' || !(ROLES[id].firstNight || ROLES[id].otherNight)) continue;
    assert.ok(steps.includes(id) || (id === 'godfather' && steps.includes('godfatherInfo')), id);
  }
});

test('水手不会死；茶艺师两侧善良不会死；弄臣第一次不死', () => {
  const g = mk(['sailor', 'tealady', 'empath', 'fool', 'noble', 'poisoner', 'imp']);
  night(g, { p1: ['p5'], p6: ['p5'] }); day(g); dusk(g);
  night(g, { p1: ['p5'], p6: ['p5'], p7: ['p1'] });
  assert.ok(g.get('p1').alive, '水手（没醉）不会死');
  day(g); dusk(g);
  night(g, { p1: ['p1'], p6: ['p5'], p7: ['p3'] }); // 茶艺师 p2 两侧是 p1、p3，都善良
  assert.ok(g.get('p3').alive, '茶艺师保护');
  day(g); dusk(g);
  night(g, { p1: ['p1'], p6: ['p5'], p7: ['p4'] });
  assert.ok(g.get('p4').alive, '弄臣第一次不死');
  day(g); dusk(g);
  night(g, { p1: ['p1'], p6: ['p5'], p7: ['p4'] });
  assert.equal(g.get('p4').alive, false, '第二次就死了');
});

test('僵怖：第一次死是假死（看起来死了），白天有人死就不醒；再死一次才真死', () => {
  const g = mk(['empath', 'noble', 'monk', 'soldier', 'fool', 'godfather', 'zombuul']);
  night(g); day(g);
  g.block = 'p7'; const r = g.endDay();
  assert.equal(r.result, 'fake');
  assert.ok(g.get('p7').alive && !g.visAlive(g.get('p7')));
  assert.equal(g.winner, null);
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p7'), '今天有人"死了"：僵怖不醒');
  for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId);
  g.resolveNight(); day(g);
  dusk(g, 'p7');
  assert.equal(g.get('p7').alive, false);
  assert.equal(g.winner, 'good');
});

test('沙巴洛斯一晚杀两个；珀上次没选人，这次杀三个', () => {
  const g = mk(['empath', 'noble', 'monk', 'chambermaid', 'gambler', 'goon', 'godfather', 'shabaloth', 'recluse'].slice(0, 8));
  night(g); day(g); dusk(g);
  night(g, { p8: ['p1', 'p2'], p3: ['p4'], p5: { targets: ['p3'], role: 'monk' } });
  assert.equal(g.get('p1').alive, false);
  assert.equal(g.get('p2').alive, false);

  const h = mk(['empath', 'noble', 'monk', 'chambermaid', 'sailor', 'innkeeper', 'godfather', 'po']);
  night(h); day(h); dusk(h);
  night(h, { p8: [], p3: ['p4'] });
  assert.equal(h.poCharged, true);
  day(h); dusk(h);
  const pr = (h.startNight(), h.nightPrompts().find((x) => x.playerId === 'p8'));
  assert.equal(pr.count, 3);
});

test('驱魔人选中恶魔：恶魔今晚不能行动，并得知驱魔人是谁', () => {
  const g = mk(['exorcist', 'noble', 'monk', 'chambermaid', 'empath', 'godfather', 'imp']);
  night(g); day(g); dusk(g);
  const { messages } = night(g, { p1: ['p7'], p7: ['p2'] });
  assert.ok(g.get('p2').alive);
  assert.match(text(messages, 'p7'), /驱魔人 \*\*1号/);
});

test('刺客无视保护；教父：白天有外来者死了才醒来杀人', () => {
  const g = mk(['sailor', 'noble', 'monk', 'saint', 'empath', 'assassin', 'imp']);
  night(g); day(g); dusk(g);
  night(g, { p6: ['p1'], p7: ['p5'] });
  assert.equal(g.get('p1').alive, false, '刺客杀死了水手');

  const h = mk(['tinker', 'noble', 'monk', 'empath', 'sailor', 'godfather', 'imp']);
  const first = night(h);
  assert.match(text(first.messages, 'p6'), /在场的外来者：\*\*修补匠/);
  day(h); dusk(h);
  h.startNight(); assert.ok(!h.nightPrompts().some((x) => x.playerId === 'p6'), '没有外来者死：教父不醒');
  for (const pr of h.nightPrompts()) h.autoChoose(pr.playerId); h.resolveNight();
  day(h); dusk(h, 'p1'); // 外来者（修补匠）死于处决
  night(h, { p6: ['p4'], p7: ['p2'], p3: ['p5'] });
  assert.equal(h.get('p4').alive, false, '教父杀人');
});

test('教授复活死去的镇民；赌徒猜错就死', () => {
  const g = mk(['professor', 'noble', 'gambler', 'empath', 'sailor', 'devilsadvocate', 'imp']);
  night(g); day(g); dusk(g);
  night(g, { p7: ['p2'], p5: ['p5'], p6: ['p4'], p3: { targets: ['p7'], role: 'po' } }); // 还没有人死：教授不醒
  assert.equal(g.get('p2').alive, false);
  assert.equal(g.get('p3').alive, false, '赌徒猜错了');
  day(g); dusk(g);
  night(g, { p1: ['p2'], p7: ['p4'] });
  assert.ok(g.get('p2').alive, '教授复活了贵族');
});

test('魔鬼代言人：被选中的人明天被处决不会死；主谋：恶魔被处决，再来一天', () => {
  const g = mk(['noble', 'empath', 'monk', 'sailor', 'chambermaid', 'devilsadvocate', 'imp']);
  night(g, { p6: ['p2'] }); day(g);
  assert.equal(dusk(g, 'p2').result, 'saved');
  assert.ok(g.get('p2').alive);

  const h = mk(['noble', 'empath', 'monk', 'sailor', 'chambermaid', 'mastermind', 'imp']);
  night(h); day(h); dusk(h, 'p7');
  assert.equal(h.winner, null);
  assert.equal(h.mastermindDay, 2);
  night(h); day(h); dusk(h, 'p6');
  assert.equal(h.winner, 'good', '额外一天处决了邪恶');
});

test('吟游诗人：爪牙死于处决，其余所有人醉到明天黄昏', () => {
  const g = mk(['minstrel', 'empath', 'monk', 'sailor', 'chambermaid', 'godfather', 'imp']);
  night(g); day(g); dusk(g, 'p6');
  assert.ok(g.broken(g.get('p2')) && g.broken(g.get('p7')));
  assert.ok(!g.broken(g.get('p1')));
});

test('月之子死了公开选人，选中善良当晚死亡；莽夫让第一个选他的人醉、变成那人的阵营', () => {
  const g = mk(['moonchild', 'empath', 'monk', 'noble', 'chambermaid', 'godfather', 'imp']);
  night(g); day(g); dusk(g, 'p1');
  assert.equal(g.pendingMoonchild, 'p1');
  day(g); g.phase = 'day'; // 月之子在白天选
  g.moonchildChoose('p1', 'p4');
  night(g, { p3: ['p2'], p7: ['p5'] });
  assert.equal(g.get('p4').alive, false);

  const h = mk(['goon', 'empath', 'monk', 'noble', 'chambermaid', 'godfather', 'imp']);
  night(h); day(h); dusk(h);
  const r = night(h, { p7: ['p1'], p3: ['p2'] });
  assert.ok(h.evilOf(h.get('p1')), '莽夫变邪恶');
  assert.ok(h.broken(h.get('p7')), '小恶魔醉了，没杀成');
  assert.ok(h.get('p1').alive);
  assert.match(text(r.messages, 'p1'), /阵营变了/);
});

test('祖母首夜得知孙子；孙子被恶魔杀死，祖母随之死亡', () => {
  const g = mk(['grandmother', 'empath', 'noble', 'sailor', 'chambermaid', 'godfather', 'imp']);
  const first = night(g);
  const gc = g.get(g.grandchild);
  assert.match(text(first.messages, 'p1'), new RegExp(`你的孙子是 \\*\\*${gc.seat}号.*${ROLES[gc.role].name}`));
  day(g); dusk(g);
  night(g, { p7: [gc.id], p4: ['p4'] });
  if (!gc.alive) assert.equal(g.get('p1').alive, false);
});

test('侍臣：选一个在场的角色，他醉三天三夜', () => {
  const g = mk(['courtier', 'empath', 'noble', 'sailor', 'chambermaid', 'godfather', 'imp']);
  night(g, { p1: { targets: [], role: 'godfather' } });
  assert.ok(g.broken(g.get('p6')));
  assert.ok(g.used.p1);
});

// ───────────── 规则审查（2026-11-04）找出来的问题，修完的回归测试 ─────────────
test('猎手打中僵怖：第一次是假死，游戏继续', () => {
  const g = mk(['slayer', 'empath', 'monk', 'soldier', 'chef', 'godfather', 'zombuul']);
  night(g); day(g);
  assert.equal(g.slay('p1', 'p7').hit, true);
  assert.ok(g.get('p7').alive && g.get('p7').apparentDead);
  assert.equal(g.winner, null);
});

test('普卡毒不到士兵', () => {
  const g = mk(['soldier', 'empath', 'monk', 'chef', 'gambler', 'godfather', 'pukka']);
  night(g, { p7: ['p1'] }); day(g); dusk(g);
  assert.ok(!g.broken(g.get('p1')), '士兵没中毒');
  night(g, { p7: ['p2'], p3: ['p4'], p5: { targets: ['p7'], role: 'po' } });
  assert.ok(g.get('p1').alive);
});

test('处决一个已经死了的人：送葬者没有信息', () => {
  SCRIPTS.mixtest.roles.push('undertaker');
  const g = mk(['undertaker', 'empath', 'monk', 'chef', 'sailor', 'godfather', 'imp']);
  night(g); day(g); dusk(g);
  night(g, { p7: ['p4'], p3: ['p2'], p5: ['p5'] });
  day(g); const r = dusk(g, 'p4');
  assert.notEqual(r.result, 'died');
  const n = night(g, { p7: ['p2'], p3: ['p5'], p5: ['p5'] });
  assert.equal(text(n.messages, 'p1'), '');
});

test('恶魔被处决、红唇女郎接任：之后新恶魔死了不触发主谋', () => {
  SCRIPTS.mixtest.roles.push('slayer');
  const g = mk(['slayer', 'empath', 'monk', 'chef', 'sailor', 'scarletwoman', 'mastermind', 'imp']);
  night(g); day(g); dusk(g, 'p8');
  assert.equal(g.get('p6').role, 'imp');
  assert.equal(g.mastermindDay, null);
  night(g, { p6: ['p2'], p3: ['p4'], p5: ['p5'] }); day(g);
  g.slay('p1', 'p6');
  assert.equal(g.winner, 'good');
});
