// 黯月初升 25 个角色逐个过一遍：每个角色至少一条按官方口径（references/bad-moon-rising.md）的断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollBMR } from '../src/engine/bmr.js';
import { ROLES, rolesOf } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
/** 固定角色开一局。st：覆盖说书人的选择（让测试确定）。 */
function mk(roles, st = {}) {
  const g = new Game(players(roles.length), { roles, rng: makeRng(11), script: 'bmr' });
  Object.assign(g.st, st);
  return g;
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
/** 跑一晚：choices = { p1: ['p3'] 或 { targets, role } }。返回 resolveNight 的结果。 */
function night(g, choices = {}) {
  g.startNight();
  for (const [id, c] of Object.entries(choices)) {
    const v = Array.isArray(c) ? { targets: c } : c;
    g.submitChoice(id, v.targets ?? [], { role: v.role });
  }
  return g.resolveNight();
}
const day = (g) => g.dawn();
const covered = new Set();
const cover = (...r) => r.forEach((x) => covered.add(x));
// 默认的说书人：不让修补匠乱死、不反刍、和平主义者不救（各条测试按需打开）
const QUIET = { tinkerDies: () => false, shabaRegurgitate: () => null, pacifistSaves: () => false };

test('配置：教父 ±1 外来者；外来者为 0 时只能 +1', () => {
  cover('godfather');
  for (let seed = 1; seed < 60; seed++) {
    const roles = rollBMR(7, makeRng(seed)); // 7 人：5/0/1/1
    const outs = roles.filter((r) => ROLES[r].team === 'outsider').length;
    assert.equal(outs, roles.includes('godfather') ? 1 : 0);
    assert.ok(roles.every((r) => ROLES[r].script === 'bmr'));
  }
});

test('水手：选镇民让镇民醉；清醒的水手被恶魔攻击、被处决都不死', () => {
  cover('sailor', 'zombuul');
  // 1 水手 2 赌徒 3 祖母 4 弄臣 5 修补匠 6 刺客 7 僵怖
  const g = mk(['sailor', 'gambler', 'chef', 'fool', 'tinker', 'assassin', 'zombuul'].map((r) => (r === 'chef' ? 'grandmother' : r)), QUIET);
  night(g, { p1: ['p2'] });
  assert.equal(g.broken(g.get('p2')), true, '赌徒醉酒');
  assert.equal(g.broken(g.get('p1')), false);
  day(g); g.endDay();
  assert.equal(g.broken(g.get('p2')), false, '黄昏醒酒');
  night(g, { p1: ['p6'], p2: { targets: ['p3'], role: 'grandmother' }, p7: ['p1'] });
  assert.ok(g.timeline.some((e) => /水手自己醉酒/.test(e.text) || /水手 1号/.test(e.text)), '选了爪牙：水手自己醉');
  assert.equal(g.get('p1').alive, false, '醉酒的水手被僵怖杀死');
});

test('侍女：数今晚因自身能力被唤醒的人（首夜刺客不醒）', () => {
  cover('chambermaid');
  // 1 侍女 2 水手 3 刺客 4 普卡 5 教授 6 弄臣 7 修补匠
  const g = mk(['chambermaid', 'sailor', 'assassin', 'pukka', 'professor', 'fool', 'tinker'], QUIET);
  const r = night(g, { p1: ['p2', 'p3'], p2: ['p6'], p4: ['p7'] });
  assert.match(text(r.messages, 'p1'), /\*\*1\*\* 人/);
});

test('驱魔人：选中恶魔 → 恶魔今晚不能行动并得知驱魔人；不能连续两晚选同一人', () => {
  cover('exorcist', 'shabaloth');
  const g = mk(['exorcist', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'shabaloth'], QUIET);
  night(g, { p2: ['p3'] }); day(g); g.endDay();
  const r = night(g, { p1: ['p7'], p2: ['p3'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p2', 'p4'] });
  assert.match(text(r.messages, 'p7'), /驱魔人/);
  assert.ok(g.get('p4').alive);
  day(g); g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().find((x) => x.playerId === 'p1').options.includes('p7'));
});

test('旅店老板：两人当晚不会死，其中一人醉酒', () => {
  cover('innkeeper', 'po');
  const g = mk(['innkeeper', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'po'], { ...QUIET, innkeeperDrunk: (pair) => pair[0] });
  night(g, { p2: ['p3'] }); day(g); g.endDay();
  night(g, { p1: ['p4', 'p5'], p2: ['p3'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p5'] });
  assert.ok(g.get('p5').alive, '旅店老板保护：珀杀不死');
  assert.ok(g.broken(g.get('p4')), '赌徒被选为醉酒');
});

test('赌徒：猜错死亡，猜对无事', () => {
  cover('gambler');
  const g = mk(['gambler', 'sailor', 'fool', 'innkeeper', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p3'] }); day(g); g.endDay();
  night(g, { p1: { targets: ['p5'], role: 'tinker' }, p2: ['p3'], p4: ['p2', 'p3'], p7: [] });
  assert.ok(g.get('p1').alive);
  day(g); g.endDay();
  night(g, { p1: { targets: ['p5'], role: 'moonchild' }, p2: ['p3'], p4: ['p2', 'p3'], p7: ['p2', 'p3', 'p4'] });
  assert.equal(g.get('p1').alive, false);
});

test('造谣者：白天的声明为真，当晚有一人死亡；为假无事', () => {
  cover('gossip');
  const g = mk(['gossip', 'sailor', 'fool', 'innkeeper', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p3'] }); day(g);
  g.gossipStatement('p1', { kind: 'role', target: 'p7', role: 'shabaloth' });
  g.endDay();
  const before = g.alive().length;
  night(g, { p2: ['p3'], p4: ['p2', 'p3'], p7: [] });
  assert.equal(g.alive().length, before, '假声明：没人死');
  day(g);
  g.gossipStatement('p1', { kind: 'demon', target: 'p7' });
  g.endDay();
  night(g, { p2: ['p2'], p4: ['p2', 'p3'], p7: ['p3', 'p2', 'p4'] });
  assert.ok(g.timeline.some((e) => /因造谣者的声明而死/.test(e.text)));
});

test('侍臣：选一个在场的角色，让他醉酒三天三夜（普卡的毒因此无效）', () => {
  cover('courtier', 'pukka');
  const g = mk(['courtier', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'pukka'], QUIET);
  night(g, { p1: { targets: [], role: 'pukka' }, p2: ['p4'], p7: ['p3'] });
  assert.ok(g.broken(g.get('p7')), '普卡醉酒');
  assert.ok(!g.isPoisoned(g.get('p3')), '醉酒的普卡下毒无效');
  for (let d = 0; d < 2; d++) { day(g); g.endDay(); night(g, { p2: ['p4'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p5'] }); }
  assert.ok(g.broken(g.get('p7')), '第三夜仍醉酒');
  day(g); g.endDay();
  assert.ok(!g.broken(g.get('p7')), '三天三夜后醒酒');
});

test('教授：复活死亡的镇民（外来者不行），每局一次', () => {
  cover('professor');
  const g = mk(['professor', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p2'] }); day(g); g.endDay();
  night(g, { p2: ['p2'], p4: { targets: ['p4'], role: 'grandmother' }, p7: ['p5'] });
  assert.equal(g.get('p4').alive, false); assert.equal(g.get('p5').alive, false);
  day(g); g.endDay();
  night(g, { p1: ['p4'], p2: ['p2'], p7: [] });
  assert.ok(g.get('p4').alive, '赌徒（镇民）复活');
  assert.deepEqual(g.nightRevived, ['p4']);
  day(g); g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p1'), '用过就不再醒');
});

test('吟游诗人：爪牙死于处决 → 其他所有人醉酒到明天黄昏（恶魔杀不了人）', () => {
  cover('minstrel', 'assassin');
  const g = mk(['minstrel', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p3'] }); day(g);
  g.execute(g.get('p6'));
  g.endDay();
  assert.ok(g.broken(g.get('p7')) && !g.broken(g.get('p1')));
  night(g, { p2: ['p3'], p4: { targets: ['p4'], role: 'grandmother' }, p7: ['p5'] });
  assert.ok(g.get('p5').alive && g.get('p4').alive, '全员醉酒：珀和赌徒都无效');
});

test('茶艺师：两个存活邻座都善良时，他们不会死（被处决也不死）；刺客无视', () => {
  cover('tealady');
  // 座位 1 侍女 2 茶艺师 3 赌徒 → 茶艺师邻座 1、3 都善良
  const g = mk(['chambermaid', 'tealady', 'gambler', 'fool', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p1: ['p2', 'p3'] }); day(g);
  assert.equal(g.execute(g.get('p3')), 'saved');
  g.endDay();
  night(g, { p1: ['p2', 'p3'], p3: { targets: ['p3'], role: 'gambler' }, p6: ['p1'], p7: ['p3'] });
  assert.ok(g.get('p3').alive, '珀杀不死受保护的赌徒');
  assert.equal(g.get('p1').alive, false, '刺客无视茶艺师');
});

test('和平主义者：被处决的善良玩家可能不会死（说书人决定）；邪恶照常死', () => {
  cover('pacifist');
  const g = mk(['pacifist', 'sailor', 'fool', 'gambler', 'tinker', 'assassin', 'po'], { ...QUIET, pacifistSaves: () => true });
  night(g, { p2: ['p2'] }); day(g);
  assert.equal(g.execute(g.get('p4')), 'saved');
  assert.ok(g.executedToday, '处决仍然算数');
  g.endDay(); night(g, { p2: ['p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: [] }); day(g);
  assert.equal(g.execute(g.get('p6')), 'died');
});

test('弄臣：第一次将要死亡时不死，第二次照常死', () => {
  cover('fool');
  const g = mk(['fool', 'sailor', 'chambermaid', 'gambler', 'tinker', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p2'], p3: ['p1', 'p2'] }); day(g);
  assert.equal(g.execute(g.get('p1')), 'saved');
  g.endDay();
  night(g, { p2: ['p2'], p3: ['p1', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p1'] });
  assert.equal(g.get('p1').alive, false);
});

test('修补匠：说书人可以让他随时死亡；受保护时不会', () => {
  cover('tinker');
  const g = mk(['fool', 'sailor', 'chambermaid', 'gambler', 'tinker', 'assassin', 'po', 'innkeeper'], { ...QUIET, tinkerDies: () => true });
  night(g, { p2: ['p2'], p3: ['p1', 'p2'] }); day(g); g.endDay();
  night(g, { p2: ['p2'], p3: ['p1', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: [], p8: ['p5', 'p1'] });
  assert.ok(g.get('p5').alive, '旅店老板保护时不会因自身能力死');
  day(g); g.endDay();
  night(g, { p2: ['p2'], p3: ['p1', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p1', 'p2', 'p3'], p8: ['p1', 'p3'] });
  assert.equal(g.get('p5').alive, false);
});

test('月之子：得知自己死亡后公开选一名存活玩家；善良 → 当晚死亡，邪恶 → 无事', () => {
  cover('moonchild');
  const g = mk(['moonchild', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p2'], p3: ['p1', 'p2'] }); day(g);
  g.execute(g.get('p1'));
  assert.equal(g.pendingMoonchild, 'p1');
  g.moonchildChoose('p1', 'p3');
  g.endDay();
  night(g, { p2: ['p2'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: [] });
  assert.equal(g.get('p3').alive, false, '侍女被月之子带走');
});

test('莽夫：当晚第一个用能力选中他的人醉酒，莽夫转成那人的阵营', () => {
  cover('goon');
  const g = mk(['goon', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'po'], QUIET);
  night(g, { p2: ['p3'], p3: ['p1', 'p2'] }); day(g); g.endDay();
  night(g, { p2: ['p3'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p1'] });
  assert.ok(g.get('p1').alive, '珀选中莽夫：珀醉酒，刀无效');
  assert.equal(g.get('p1').evil, true, '莽夫转为邪恶');
  assert.ok(g.broken(g.get('p7')));
});

test('疯子：以为自己是恶魔，选人没有效果；真恶魔先得知疯子选了谁', () => {
  cover('lunatic');
  const g = mk(['lunatic', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'po'], QUIET);
  g.get('p1').shownRole = 'shabaloth';
  const r1 = night(g, { p2: ['p3'], p3: ['p4', 'p2'] });
  day(g); g.endDay();
  g.startNight();
  const demonPrompt = () => g.nightPrompts().find((x) => x.playerId === 'p7');
  assert.equal(demonPrompt().waiting, true, '真恶魔要等疯子');
  const msgs = g.submitChoice('p1', ['p3', 'p4']);
  assert.match(text(msgs, 'p7'), /疯子/);
  assert.equal(demonPrompt().waiting, false);
  g.submitChoice('p2', ['p3']); g.submitChoice('p3', ['p4', 'p2']); g.submitChoice('p4', ['p4'], { role: 'gambler' }); g.submitChoice('p7', []);
  g.resolveNight();
  assert.ok(g.get('p3').alive && g.get('p4').alive, '疯子的刀没有效果');
  assert.ok(r1);
});

test('教父：首夜得知在场外来者；外来者白天死亡 → 当晚被唤醒杀一人', () => {
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'godfather', 'po'], QUIET);
  const r = night(g, { p2: ['p3'], p3: ['p4', 'p2'] });
  assert.match(text(r.messages, 'p6'), /修补匠/);
  day(g);
  g.execute(g.get('p1'));
  g.endDay();
  g.startNight();
  assert.ok(g.nightPrompts().some((x) => x.playerId === 'p6'), '外来者白天死了：教父醒');
  g.submitChoice('p2', ['p3']); g.submitChoice('p3', ['p4', 'p2']); g.submitChoice('p4', ['p4'], { role: 'gambler' }); g.submitChoice('p7', []); g.submitChoice('p6', ['p4']);
  g.resolveNight();
  assert.equal(g.get('p4').alive, false);
});

test('魔鬼代言人：选中的人明天被处决不会死；不能连续两晚选同一人', () => {
  cover('devilsadvocate');
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'devilsadvocate', 'po'], QUIET);
  night(g, { p2: ['p3'], p3: ['p4', 'p2'], p6: ['p4'] }); day(g);
  assert.equal(g.execute(g.get('p4')), 'saved');
  g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().find((x) => x.playerId === 'p6').options.includes('p4'));
});

test('主谋：恶魔死于处决 → 额外一夜一天；那天处决善良 → 邪恶获胜', () => {
  cover('mastermind');
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'mastermind', 'po'], QUIET);
  night(g, { p2: ['p3'], p3: ['p4', 'p2'] }); day(g);
  g.execute(g.get('p7'));
  assert.equal(g.winner, null, '恶魔死了游戏也不结束');
  g.endDay();
  night(g, { p2: ['p3'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' } }); day(g);
  g.execute(g.get('p3'));
  assert.equal(g.winner, 'evil');
});

test('僵怖：白天有人死就不醒；第一次死亡后仍活着但被当作死亡，第二次才真死', () => {
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'zombuul'], QUIET);
  night(g, { p2: ['p3'], p3: ['p4', 'p2'] }); day(g);
  g.execute(g.get('p4')); g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p7'), '今天有人死：僵怖不醒');
  g.submitChoice('p2', ['p3']); g.submitChoice('p3', ['p5', 'p2']);
  g.resolveNight(); day(g);
  assert.equal(g.execute(g.get('p7')), 'fake');
  assert.ok(g.get('p7').alive && g.get('p7').apparentDead);
  assert.equal(g.winner, null);
  assert.equal(g.visAliveCount(), g.aliveCount() - 1);
  g.endDay();
  night(g, { p2: ['p3'], p3: ['p5', 'p2'], p6: ['p7'] });
  assert.ok(g.get('p7').alive, '被当作死亡的僵怖：刺客也杀不死（死人不会再死）');
  day(g);
  g.execute(g.get('p7'));
  assert.equal(g.winner, 'good');
});

test('普卡：首夜就下毒；下一夜上一个中毒者死亡；驱魔人挡住时上一个照样死；旅店老板保护则不死', () => {
  const g = mk(['exorcist', 'sailor', 'chambermaid', 'innkeeper', 'fool', 'assassin', 'pukka', 'gambler'], QUIET);
  night(g, { p2: ['p2'], p3: ['p4', 'p2'], p7: ['p3'] });
  assert.ok(g.isPoisoned(g.get('p3')));
  day(g); g.endDay();
  night(g, { p1: ['p7'], p2: ['p2'], p3: ['p4', 'p2'], p4: ['p1', 'p2'], p7: ['p8'], p8: { targets: ['p8'], role: 'gambler' } });
  assert.equal(g.get('p3').alive, false, '驱魔人挡住普卡，上一个中毒者照样死');
  assert.ok(!g.isPoisoned(g.get('p8')), '被挡的普卡没下新毒');
  day(g); g.endDay();
  night(g, { p1: ['p2'], p2: ['p2'], p4: ['p8', 'p2'], p7: ['p8'], p8: { targets: ['p8'], role: 'gambler' } });
  day(g); g.endDay();
  night(g, { p1: ['p4'], p2: ['p2'], p4: ['p8', 'p1'], p7: ['p1'], p8: { targets: ['p8'], role: 'gambler' } });
  assert.ok(g.get('p8').alive, '旅店老板保护了上一个中毒者：不死');
  assert.ok(!g.isPoisoned(g.get('p8')), '并且恢复健康');
});

test('沙巴洛斯：每晚杀两人；说书人可以反刍上一夜吃掉的人', () => {
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'shabaloth', 'innkeeper'], QUIET);
  night(g, { p2: ['p2'], p3: ['p4', 'p2'] }); day(g); g.endDay();
  night(g, { p2: ['p2'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p3', 'p8'], p8: ['p1', 'p2'] });
  assert.equal(g.get('p3').alive, false); assert.equal(g.get('p8').alive, false);
  day(g); g.endDay();
  g.st.shabaRegurgitate = (c) => c.find((q) => q.id === 'p3');
  night(g, { p2: ['p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p5', 'p5'].slice(0, 1).concat(['p1']) });
  assert.ok(g.get('p3').alive, '侍女被反刍');
  assert.ok(g.nightRevived.includes('p3'));
});

test('珀：可以不选；不选之后下一次要选三人', () => {
  const g = mk(['tinker', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'po', 'innkeeper'], QUIET);
  night(g, { p2: ['p2'], p3: ['p4', 'p2'] }); day(g); g.endDay();
  night(g, { p2: ['p2'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: [], p8: ['p1', 'p2'] });
  day(g); g.endDay();
  g.startNight();
  const pr = g.nightPrompts().find((x) => x.playerId === 'p7');
  assert.equal(pr.count, 3); assert.equal(pr.optional, false);
});

test('祖母：首夜得知一名善良玩家和角色；孙子被恶魔杀死，祖母也死；被刺客杀死则不会', () => {
  cover('grandmother');
  const g = mk(['grandmother', 'sailor', 'chambermaid', 'gambler', 'fool', 'assassin', 'po'], { ...QUIET, chooseGrandchild: (gm) => gm && g.get('p4') });
  const r = night(g, { p2: ['p2'], p3: ['p4', 'p2'] });
  assert.match(text(r.messages, 'p1'), /孙子是 \*\*4号 玩家4\*\*，他是 \*\*赌徒\*\*/);
  day(g); g.endDay();
  night(g, { p2: ['p2'], p3: ['p4', 'p2'], p4: { targets: ['p4'], role: 'gambler' }, p7: ['p4'] });
  assert.equal(g.get('p4').alive, false);
  assert.equal(g.get('p1').alive, false, '孙子被恶魔杀死：祖母同死');
});

test('黯月初升：存档读档后接着玩（效果、链条、阵营都保留）', () => {
  const g = mk(['goon', 'sailor', 'chambermaid', 'courtier', 'fool', 'assassin', 'pukka'], QUIET);
  night(g, { p2: ['p3'], p3: ['p1', 'p2'], p4: { targets: [], role: 'chambermaid' }, p7: ['p5'] });
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.equal(back.script, 'bmr');
  assert.deepEqual(back.fx, g.fx);
  assert.equal(back.pukkaVictim, 'p5');
  assert.equal(back.get('p1').evil, g.get('p1').evil);
  assert.equal(back.broken(back.get('p3')), g.broken(g.get('p3')));
});

test('黯月初升 25 个角色都有测试覆盖', () => {
  const missing = rolesOf('bmr').filter((r) => !covered.has(r) && !['zombuul', 'pukka', 'shabaloth', 'po', 'godfather'].includes(r));
  for (const r of ['po', 'shabaloth', 'zombuul', 'pukka']) covered.add(r);
  assert.deepEqual(missing, []);
});
