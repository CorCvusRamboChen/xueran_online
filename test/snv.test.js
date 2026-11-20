// 梦殒春宵 25 个角色逐个过一遍：每个角色至少一条按官方口径（references/sects-and-violets.md）的断言，大多取自官方百科的范例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollSNV, balancedSNV, setupScoreSNV, demonShift } from '../src/engine/snv.js';
import { buildRoles } from '../src/engine/assign.js';
import { ROLES, rolesOf, DISTRIBUTION } from '../src/engine/roles.js';
import { SETUPS } from '../src/shared/setups.js';
import { NIGHT_ORDER, SNV_STEPS } from '../src/shared/nightOrder.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function mk(roles, st = {}) {
  const g = new Game(players(roles.length), { roles, rng: makeRng(11), script: 'snv' });
  Object.assign(g.st, st);
  return g;
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
const submit = (g, choices) => {
  for (const [id, c] of Object.entries(choices)) {
    const v = Array.isArray(c) ? { targets: c } : c;
    g.submitChoice(id, v.targets ?? [], { role: v.role });
  }
};
/** 跑一晚。mids：暂停时依次补的选择。把分批发出的信息合起来返回。 */
function night(g, choices = {}, mids = []) {
  g.startNight();
  submit(g, choices);
  const messages = [];
  let r = g.resolveNight();
  messages.push(...r.messages);
  const queue = [...mids];
  while (r.pause) {
    const c = queue.shift();
    if (c) submit(g, { [r.pause]: c }); else g.autoChoose(r.pause);
    r = g.resolveNight();
    messages.push(...r.messages);
  }
  return { ...r, messages };
}
const day = (g) => g.dawn();
const covered = new Set();
const cover = (...r) => r.forEach((x) => covered.add(x));
const NINE = ['clockmaker', 'oracle', 'seamstress', 'artist', 'juggler', 'klutz', 'witch', 'nodashii'];

test('配置：方古 +1 外来者，亡骨魔 -1 外来者（没得减就不变）', () => {
  assert.deepEqual(demonShift('fanggu', 5, 1), [4, 2]);
  assert.deepEqual(demonShift('vigormortis', 5, 1), [6, 0]);
  assert.deepEqual(demonShift('vigormortis', 5, 0), [5, 0]);
  for (let seed = 1; seed < 80; seed++) {
    const roles = rollSNV(8, makeRng(seed));
    const outs = roles.filter((r) => ROLES[r].team === 'outsider').length;
    assert.equal(outs, roles.includes('fanggu') ? 2 : roles.includes('vigormortis') ? 0 : 1);
    assert.equal(roles.length, 8);
    assert.ok(roles.every((r) => ROLES[r].script === 'snv'));
  }
});

test('房主指定角色时也按方古、亡骨魔改人数', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const roles = buildRoles(ids, { p0: 'fanggu' }, 'snv', makeRng(3));
  assert.equal(roles.filter((r) => ROLES[r].team === 'outsider').length, 2);
  const r2 = buildRoles(ids, { p0: 'vigormortis' }, 'snv', makeRng(3));
  assert.equal(r2.filter((r) => ROLES[r].team === 'outsider').length, 0);
});

test('官方 5 套配置：人数按配置规则都对得上', () => {
  assert.equal(SETUPS.snv.length, 5);
  for (const s of SETUPS.snv) {
    assert.equal(s.roles.length, 8, s.name);
    assert.ok(s.roles.every((r) => ROLES[r]?.script === 'snv'), s.name);
    const demon = s.roles.find((r) => ROLES[r].team === 'demon');
    const [t, o] = demonShift(demon, DISTRIBUTION[8][0], DISTRIBUTION[8][1]);
    assert.equal(s.roles.filter((r) => ROLES[r].team === 'townsfolk').length, t, s.name);
    assert.equal(s.roles.filter((r) => ROLES[r].team === 'outsider').length, o, s.name);
  }
});

test('AI 配板去掉了两头最偏的', () => {
  const rng = makeRng(5);
  const all = Array.from({ length: 300 }, () => setupScoreSNV(rollSNV(9, rng))).sort((a, b) => a - b);
  for (let i = 0; i < 40; i++) {
    const s = setupScoreSNV(balancedSNV(9, rng));
    assert.ok(s >= all[6] && s <= all.at(-7), `平衡分 ${s}`);
  }
});

test('夜晚顺序：有选人的角色都排进了步骤；首夜不动的角色不在首夜', () => {
  for (const id of rolesOf('snv')) {
    const r = ROLES[id];
    if (r.choose && r.otherNight) assert.ok(SNV_STEPS.other.includes(id), id);
    if (r.choose && r.firstNight) assert.ok(SNV_STEPS.first.includes(id), id);
  }
  assert.ok(!SNV_STEPS.first.includes('pithag'));
  assert.ok(SNV_STEPS.other.indexOf('pithag') > SNV_STEPS.other.indexOf('cerenovus'), '麻脸巫婆在舞蛇人、女巫、洗脑师之后（官方英文总表；11-11 用户定）');
  assert.equal(NIGHT_ORDER.snv.other.at(-1)[0], 'mathematician');
});

test('钟表匠：取最近的爪牙；顺逆时针都算', () => {
  cover('clockmaker');
  const g = mk(['clockmaker', 'nodashii', 'dreamer', 'snakecharmer', 'eviltwin', 'sage', 'klutz', 'savant']);
  const r = night(g, { p3: ['p1'], p4: ['p3'] });
  assert.doesNotMatch(text(r.messages, 'p1'), /\*\*3\*\*/, '真实相隔 3'); // 钟表匠和诺-达鲺相邻，中毒，按假世界给错的
  const h = mk(['savant', 'nodashii', 'klutz', 'dreamer', 'eviltwin', 'sage', 'sweetheart', 'clockmaker']);
  assert.equal(h.clockDistance(), 3);
});

test('钟表匠：没有爪牙时是 0；死人也算', () => {
  const g = mk(['clockmaker', 'nodashii', 'dreamer', 'snakecharmer', 'savant', 'sage', 'klutz', 'artist']);
  assert.equal(g.clockDistance(), 0);
  const h = mk(['nodashii', 'eviltwin', 'dreamer', 'snakecharmer', 'savant', 'sage', 'klutz', 'artist']);
  h.get('p2').alive = false;
  assert.equal(h.clockDistance(), 1);
});

test('筑梦师：一善一恶，其中一个是真的；选爪牙时善良那个是假的', () => {
  cover('dreamer');
  const g = mk(['dreamer', 'artist', 'savant', 'mutant', 'cerenovus', 'fanggu', 'sage', 'oracle']);
  const r = night(g, { p1: ['p4'], p5: { targets: ['p2'], role: 'sage' } });
  const t = text(r.messages, 'p1');
  assert.match(t, /畸形秀演员/);
  const h = mk(['dreamer', 'artist', 'savant', 'mutant', 'cerenovus', 'fanggu', 'sage', 'oracle']);
  const s = text(night(h, { p1: ['p5'], p5: { targets: ['p2'], role: 'sage' } }).messages, 'p1');
  assert.match(s, /洗脑师/);
});

test('筑梦师：涡流在场，两个角色都是错的，而且不给涡流', () => {
  const g = mk(['dreamer', 'artist', 'savant', 'mutant', 'cerenovus', 'vortox', 'sage', 'oracle']);
  const r = text(night(g, { p1: ['p6'], p5: { targets: ['p2'], role: 'sage' } }).messages, 'p1');
  assert.doesNotMatch(r, /涡流/);
  const h = mk(['dreamer', 'artist', 'savant', 'mutant', 'cerenovus', 'vortox', 'sage', 'oracle']);
  const s = text(night(h, { p1: ['p4'], p5: { targets: ['p2'], role: 'sage' } }).messages, 'p1');
  assert.doesNotMatch(s, /畸形秀演员/);
});

test('舞蛇人：选中恶魔互换角色和阵营，原恶魔中毒；不是恶魔无事发生', () => {
  cover('snakecharmer');
  const g = mk(['snakecharmer', 'artist', 'savant', 'mutant', 'cerenovus', 'vigormortis', 'sage', 'oracle']);
  night(g, { p1: ['p5'], p5: { targets: ['p2'], role: 'sage' } });
  assert.equal(g.get('p1').role, 'snakecharmer');
  day(g); g.endDay();
  const r = night(g, { p1: ['p6'], p5: { targets: ['p2'], role: 'sage' }, p6: ['p3'] }, [['p4']]);
  assert.equal(g.get('p1').role, 'vigormortis');
  assert.equal(g.evilOf(g.get('p1')), true);
  assert.equal(g.get('p6').role, 'snakecharmer');
  assert.equal(g.evilOf(g.get('p6')), false);
  assert.ok(g.isPoisoned(g.get('p6')), '原恶魔永久中毒');
  assert.ok(!g.get('p4').alive, '新恶魔当晚就行动');
  assert.ok(g.get('p3').alive, '原恶魔的选择作废');
  assert.match(text(r.messages, 'p1'), /亡骨魔/);
  assert.match(text(r.messages, 'p6'), /舞蛇人/);
  // 换不回来：新舞蛇人（原恶魔）一直中毒，选中新恶魔也不交换（官方百科：中毒标记到他死亡或离场为止）
  day(g); g.endDay();
  night(g, { p6: ['p1'], p5: { targets: ['p2'], role: 'sage' }, p1: ['p7'] });
  assert.equal(g.get('p1').role, 'vigormortis', '换不回来');
  assert.equal(g.get('p6').role, 'snakecharmer');
  assert.ok(g.isPoisoned(g.get('p6')));
});

test('舞蛇人：首夜换到恶魔，当晚不用杀人；失效的舞蛇人选中恶魔算没有正常生效', () => {
  const g = mk(['snakecharmer', 'artist', 'savant', 'mutant', 'cerenovus', 'fanggu', 'sage', 'oracle']);
  const r = night(g, { p1: ['p6'], p5: { targets: ['p2'], role: 'sage' } });
  assert.equal(r.pause, undefined);
  assert.equal(g.get('p1').role, 'fanggu');
  const h = mk(['snakecharmer', 'mathematician', 'savant', 'mutant', 'cerenovus', 'nodashii', 'sage', 'artist']);
  h.addFx('drunk', 'p1', null, 'never', '测试');
  const s = night(h, { p1: ['p6'], p5: { targets: ['p2'], role: 'sage' } });
  assert.equal(h.get('p1').role, 'snakecharmer');
  assert.match(text(s.messages, 'p2'), /\*\*1\*\*/);
});

test('数学家：只数真出了错的；中毒碰巧说对不算', () => {
  cover('mathematician');
  const g = mk(['mathematician', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  const r = night(g, { p3: ['p2'] });
  assert.match(text(r.messages, 'p1'), /\*\*0\*\*/);
  g.abnormal = ['p2', 'p2x'];
  g.flag(g.get('p2'));
  assert.equal(g.abnormal.filter((x) => x === 'p2').length, 1, '同一个人只算一次');
  const h = mk(['mathematician', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(h, { p3: ['p2'] });
  day(h);
  assert.deepEqual(h.abnormal, [], '黎明清零');
});

test('数学家：女巫失效时被诅咒的人提名没死，记一次', () => {
  const g = mk(['mathematician', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  g.addFx('drunk', 'p3', null, 'never', '测试');
  night(g, { p3: ['p2'] });
  day(g);
  const res = g.nominate('p2', 'p4');
  assert.equal(res.cursed, false);
  assert.ok(g.get('p2').alive);
  assert.ok(g.abnormal.includes('p3'));
});

test('卖花女孩：恶魔投过票才是；死恶魔的幽灵票也算', () => {
  cover('flowergirl');
  const g = mk(['flowergirl', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.recordVote('p2', ['p1', 'p4']);
  g.endDay();
  assert.match(text(night(g, { p3: ['p2'], p5: ['p6'] }, []).messages, 'p1'), /\*\*没有\*\*/);
  const h = mk(['flowergirl', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(h, { p3: ['p2'] }); day(h);
  h.recordVote('p2', ['p5']);
  h.endDay();
  assert.match(text(night(h, { p3: ['p2'], p5: ['p4'] }).messages, 'p1'), /\*\*有\*\*/);
});

test('城镇公告员：爪牙发起过提名才是', () => {
  cover('towncrier');
  const g = mk(['towncrier', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.nominate('p3', 'p4');
  g.endDay();
  assert.match(text(night(g, { p3: ['p2'], p5: ['p6'] }).messages, 'p1'), /\*\*有\*\*/);
  const h = mk(['towncrier', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(h, { p3: ['p2'] }); day(h);
  h.nominate('p4', 'p3');
  h.endDay();
  assert.match(text(night(h, { p3: ['p2'], p5: ['p6'] }).messages, 'p1'), /\*\*没有\*\*/);
});

test('神谕者：按阵营数死人，变邪恶的也算', () => {
  cover('oracle');
  const g = mk(['oracle', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  g.get('p2').alive = false; g.get('p2').evil = true;
  g.get('p3').alive = false;
  night(g, {}); day(g); g.endDay();
  assert.match(text(night(g, { p5: ['p4'] }).messages, 'p1'), /\*\*2\*\*/);
});

test('博学者：一真一假；每天一次；不是博学者问不了', () => {
  cover('savant');
  const g = mk(['savant', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  night(g, { p3: ['p2'] }); day(g);
  assert.equal(g.savantAsk('p1').lines.length, 2);
  assert.throws(() => g.savantAsk('p1'), /问过/);
  assert.throws(() => g.savantAsk('p2'), /只有博学者/);
});

test('博学者的模板句：真的就是真的、假的就是假的', () => {
  const g = mk(['savant', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  for (let i = 0; i < 40; i++) {
    for (const x of g.st.savantFacts()) assert.notEqual(x.t, x.f);
  }
  const lines = g.st.savantFacts();
  assert.ok(lines.length >= 7);
  const outs = lines.find((x) => x.t.startsWith('场上有 ') && x.t.includes('外来者'));
  assert.equal(outs.t, '场上有 2 名外来者');
});

test('博学者：涡流在场两条都假', () => {
  const g = mk(['savant', 'artist', 'witch', 'sage', 'vortox', 'klutz', 'sweetheart', 'oracle']);
  night(g, { p3: ['p2'] }); day(g);
  const real = g.st.savantFacts.bind(g.st);
  let pair;
  g.st.savantFacts = () => { pair = real(); return pair; };
  const { lines } = g.savantAsk('p1');
  assert.deepEqual([...lines].sort(), [pair[0].f, pair[1].f].sort());
});

test('女裁缝：看阵营不看角色；每局一次；不用不算用掉', () => {
  cover('seamstress');
  const g = mk(['seamstress', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  const r = night(g, { p1: { targets: ['p2', 'p3'] }, p3: ['p2'] });
  assert.match(text(r.messages, 'p1'), /\*\*不是\*\*/);
  day(g); g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p1'), '用过了不再醒');
  const h = mk(['seamstress', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  night(h, { p1: { targets: [] }, p3: ['p2'] });
  day(h); h.endDay(); h.startNight();
  assert.ok(h.nightPrompts().some((x) => x.playerId === 'p1'));
});

test('哲学家：获得能力，在场的持有者醉酒；哲学家死后恢复', () => {
  cover('philosopher');
  const g = mk(['philosopher', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p1: { role: 'oracle' }, p3: ['p2'] });
  assert.equal(g.abilityOf(g.get('p1')), 'oracle');
  assert.equal(g.get('p1').role, 'philosopher');
  assert.ok(g.broken(g.get('p2')));
  day(g); g.endDay();
  const r = night(g, { p3: ['p2'], p5: ['p4'] });
  assert.match(text(r.messages, 'p1'), /死亡的玩家里/);
  g.get('p1').alive = false;
  assert.ok(!g.broken(g.get('p2')));
});

test('哲学家：选首夜能力当晚就用；选了不在场的角色，之后出现也醉酒', () => {
  const g = mk(['philosopher', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  const r = night(g, { p1: { role: 'clockmaker' }, p3: ['p2'] });
  assert.match(text(r.messages, 'p1'), /相隔/);
  g.changeRole(g.get('p4'), 'clockmaker');
  g.afterChange(null);
  assert.ok(g.broken(g.get('p4')));
});

test('哲学家：要选人的能力当晚现选（选不到前面的步骤）', () => {
  const g = mk(['philosopher', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  const r = night(g, { p1: { role: 'dreamer' }, p3: ['p2'] }, [['p5']]);
  assert.match(text(r.messages, 'p1'), /方古/);
});

test('哲学家：失效时选的能力没有真正到手，拿到的是假信息', () => {
  const g = mk(['philosopher', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  g.addFx('drunk', 'p1', null, 'never', '测试');
  night(g, { p1: { role: 'oracle' }, p3: ['p2'] });
  assert.ok(!g.broken(g.get('p2')), '选的人不醉');
  g.fx = [];
  assert.ok(g.broken(g.get('p1')), '之后恢复了也没有能力');
});

test('艺术家：每局一次；失效时答案翻转，不知道不翻', () => {
  cover('artist');
  const g = mk(['artist', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  assert.equal(g.artistAsk('p1', '恶魔是 5 号吗？').text, '恶魔是 5 号吗？');
  assert.throws(() => g.artistAsk('p1', '再问一个'), /问过/);
  assert.equal(g.artistAnswer('p1', 'true'), 'true');
  g.addFx('drunk', 'p1', null, 'never', '测试');
  assert.equal(g.artistAnswer('p1', 'true'), 'false');
  assert.equal(g.artistAnswer('p1', 'unknown'), 'unknown');
});

test('杂耍艺人：首个白天猜，当晚得知猜对几个；别人第一天可以假装', () => {
  cover('juggler');
  const g = mk(['juggler', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.juggle('p1', [{ target: 'p2', role: 'oracle' }, { target: 'p3', role: 'witch' }, { target: 'p4', role: 'klutz' }]);
  assert.throws(() => g.juggle('p1', [{ target: 'p2', role: 'oracle' }]), /猜过/);
  assert.equal(g.juggle('p2', [{ target: 'p3', role: 'witch' }]).text.includes('女巫'), true);
  g.endDay();
  const r = night(g, { p3: ['p2'], p5: ['p6'] });
  assert.match(text(r.messages, 'p1'), /\*\*2\*\*/);
  assert.equal(text(r.messages, 'p2').includes('猜对'), false);
  day(g);
  assert.throws(() => g.juggle('p6', [{ target: 'p2', role: 'oracle' }]), /第一天/);
});

test('杂耍艺人：一次最多五个', () => {
  const g = mk(['juggler', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  const six = Array.from({ length: 6 }, () => ({ target: 'p2', role: 'oracle' }));
  assert.throws(() => g.juggle('p1', six), /最多猜 5/);
});

test('贤者：被恶魔杀死得知两人，其中一个是恶魔；被处决不触发', () => {
  cover('sage');
  const g = mk(['sage', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g); g.endDay();
  const r = night(g, { p3: ['p2'], p5: ['p1'] });
  assert.match(text(r.messages, 'p1'), /5号/);
  const h = mk(['sage', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(h, { p3: ['p2'] }); day(h);
  h.execute(h.get('p1')); h.endDay();
  assert.equal(text(night(h, { p3: ['p2'], p5: ['p2'] }).messages, 'p1'), '');
});

test('贤者：涡流在场，两个人都不是恶魔', () => {
  const g = mk(['sage', 'oracle', 'witch', 'artist', 'vortox', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g); g.execute(g.get('p2')); g.endDay();
  const t = text(night(g, { p3: ['p4'], p5: ['p1'] }).messages, 'p1');
  assert.match(t, /中的一个/);
  assert.doesNotMatch(t, /5号/);
});

test('畸形秀演员：声称外来者可能被处决，算当天的处决；声称镇民没事', () => {
  cover('mutant');
  const g = mk(['mutant', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant'], { mutantExecuted: () => true });
  night(g, { p3: ['p2'] }); day(g);
  assert.equal(g.declare('p1', 'oracle').mutant, false);
  assert.ok(g.get('p1').alive);
  assert.equal(g.declare('p1', 'klutz').mutant, true);
  assert.ok(!g.get('p1').alive);
  assert.ok(g.executedToday);
  assert.throws(() => g.nominate('p2', 'p3'), /处决过/);
});

test('畸形秀演员：别人声称外来者没事；每天声明次数有上限', () => {
  const g = mk(['mutant', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant'], { mutantExecuted: () => true });
  night(g, { p3: ['p2'] }); day(g);
  assert.equal(g.declare('p2', 'klutz').mutant, false);
  g.declare('p2', 'klutz');
  assert.throws(() => g.declare('p2', 'klutz'), /最多/);
});

test('心上人：死亡时一人从此醉酒；被方古转化没死不触发', () => {
  cover('sweetheart');
  const g = mk(['sweetheart', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'mutant', 'savant'], { sweetheartDrunk: (s) => s.g.get('p2') });
  g.st.sweetheartDrunk = () => g.get('p2');
  night(g, { p3: ['p2'] }); day(g);
  g.execute(g.get('p1'));
  assert.ok(g.broken(g.get('p2')));
  const h = mk(['sweetheart', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'mutant', 'savant']);
  night(h, { p3: ['p2'] }); day(h); h.endDay();
  night(h, { p3: ['p2'], p5: ['p1'] });
  assert.equal(h.get('p1').role, 'fanggu');
  assert.ok(!h.fx.some((f) => f.why === '心上人'));
});

test('理发师：死亡当晚恶魔可以换两人角色，阵营不变；可以放弃', () => {
  cover('barber');
  const g = mk(['barber', 'oracle', 'witch', 'artist', 'nodashii', 'klutz', 'mutant', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.execute(g.get('p1')); g.endDay();
  const r = night(g, { p3: ['p2'], p5: ['p6'] }, [{ targets: ['p3', 'p4'] }]);
  assert.equal(g.get('p3').role, 'artist');
  assert.equal(g.get('p4').role, 'witch');
  assert.equal(g.evilOf(g.get('p3')), true);
  assert.equal(g.evilOf(g.get('p4')), false);
  assert.match(text(r.messages, 'p3'), /艺术家/);
  const h = mk(['barber', 'oracle', 'witch', 'artist', 'nodashii', 'klutz', 'mutant', 'savant']);
  night(h, { p3: ['p2'] }); day(h);
  h.execute(h.get('p1')); h.endDay();
  night(h, { p3: ['p2'], p5: ['p6'] }, [{ targets: [] }]);
  assert.equal(h.get('p3').role, 'witch');
});

test('理发师：夜里被恶魔杀死，当晚恶魔就能换；不能选其他恶魔', () => {
  const g = mk(['barber', 'oracle', 'witch', 'artist', 'nodashii', 'klutz', 'mutant', 'savant']);
  night(g, { p3: ['p2'] }); day(g); g.endDay();
  g.startNight();
  submit(g, { p3: ['p2'], p5: ['p1'] });
  const r = g.resolveNight();
  assert.equal(r.pause, 'p5');
  const pr = g.nightPrompts()[0];
  assert.equal(pr.role, 'barber');
  assert.equal(pr.count, 2);
  assert.ok(pr.options.includes('p5'), '可以选自己');
});

test('呆瓜：选中邪恶己方落败；选中善良继续；邪恶的呆瓜选中邪恶善良胜', () => {
  cover('klutz');
  const g = mk(['klutz', 'oracle', 'witch', 'artist', 'fanggu', 'sage', 'mutant', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.execute(g.get('p1'));
  assert.equal(g.pendingKlutz, 'p1');
  g.klutzChoose('p1', 'p2');
  assert.equal(g.winner, null);
  const h = mk(['klutz', 'oracle', 'witch', 'artist', 'fanggu', 'sage', 'mutant', 'savant']);
  night(h, { p3: ['p2'] }); day(h);
  h.execute(h.get('p1'));
  h.klutzChoose('p1', 'p3');
  assert.equal(h.winner, 'evil');
  const k = mk(['klutz', 'oracle', 'witch', 'artist', 'fanggu', 'sage', 'mutant', 'savant']);
  night(k, { p3: ['p2'] }); day(k);
  k.get('p1').evil = true;
  k.execute(k.get('p1'));
  k.klutzChoose('p1', 'p3');
  assert.equal(k.winner, 'good');
});

test('镜像双子：互知角色；善良的被处决邪恶胜；邪恶的被处决继续', () => {
  cover('eviltwin');
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  const r = night(g, {});
  const good = g.twin.b;
  assert.match(text(r.messages, 'p3'), new RegExp(`${g.get(good).seat}号`));
  assert.match(text(r.messages, good), /3号/);
  day(g);
  g.execute(g.get('p3'));
  assert.equal(g.winner, null);
  const h = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(h, {}); day(h);
  h.execute(h.get(h.twin.b));
  assert.equal(h.winner, 'evil');
});

test('镜像双子：两人都活着时恶魔死了也继续，杀掉邪恶双子善良才赢', () => {
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g);
  g.execute(g.get('p5'));
  assert.equal(g.winner, null);
  g.endDay(); night(g, {}); day(g);
  g.execute(g.get('p3'));
  assert.equal(g.winner, 'good');
});

test('镜像双子：死了就失去能力，再处决善良双子邪恶不赢', () => {
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g);
  g.get('p3').alive = false;
  g.execute(g.get(g.twin.b));
  assert.equal(g.winner, null);
});

test('镜像双子：同阵营了重新配对；善良玩家变成双子时对立双子是邪恶的', () => {
  const g = mk(['oracle', 'artist', 'savant', 'witch', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p4: ['p1'] }); day(g); g.endDay();
  night(g, { p4: ['p1'], p5: ['p6'] });
  g.changeRole(g.get('p1'), 'eviltwin');
  g.afterChange(null);
  assert.equal(g.twin.a, 'p1');
  assert.equal(g.evilOf(g.get(g.twin.b)), true);
  assert.equal(g.twinGoodId(), 'p1');
});

test('女巫：被诅咒的人提名就死，提名照常；诅咒到黄昏结束', () => {
  cover('witch');
  const g = mk(['oracle', 'artist', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g);
  const res = g.nominate('p1', 'p2');
  assert.equal(res.cursed, true);
  assert.ok(!g.get('p1').alive);
  assert.ok(g.nominees.has('p2'));
  const h = mk(['oracle', 'artist', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(h, { p3: ['p1'] }); day(h);
  h.endDay();
  night(h, { p3: ['p2'], p5: ['p6'] }); day(h);
  assert.equal(h.nominate('p1', 'p4').cursed, false);
});

test('女巫：只剩三人存活时失去能力，诅咒解除，不再醒', () => {
  const g = mk(['oracle', 'artist', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g);
  for (const id of ['p2', 'p4', 'p6', 'p7', 'p8']) g.get(id).alive = false;
  assert.equal(g.nominate('p1', 'p3').cursed, false);
  assert.ok(g.get('p1').alive);
  g.endDay(); g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p3'));
});

test('洗脑师：目标当天声明了要求的角色算尽力；不声明要判', () => {
  cover('cerenovus');
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'], { madnessPenalty: () => true });
  const r = night(g, { p3: { targets: ['p1'], role: 'sage' } });
  assert.match(text(r.messages, 'p1'), /贤者/);
  day(g);
  assert.deepEqual(g.madnessDue().map((x) => x.id), ['p1']);
  g.declare('p1', 'oracle');
  assert.equal(g.madnessDue().length, 1, '声明别的角色不算');
  g.declare('p1', 'sage');
  assert.equal(g.madnessDue().length, 0);
});

test('洗脑师：不够疯狂被处决，算当天的处决；失效时目标不疯狂', () => {
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: { targets: ['p1'], role: 'sage' } }); day(g);
  assert.equal(g.madExecute('p1', '没有声明'), true);
  assert.ok(!g.get('p1').alive);
  assert.ok(g.executedToday);
  assert.equal(g.madExecute('p2', '第二个'), false, '一天只处决一次');
  const h = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  h.addFx('drunk', 'p3', null, 'never', '测试');
  night(h, { p3: { targets: ['p1'], role: 'sage' } }); day(h);
  assert.equal(h.madnessDue().length, 0);
});

test('疯狂处决会让邪恶当场赢（善良双子）就放过；恶魔没疯狂照样可能处决（《给说书人的建议》第 6 条）', () => {
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g);
  assert.equal(g.st.madnessPenalty(g.get(g.twinGoodId())), false, '善良双子：处决就是邪恶赢，放过');
  let punished = 0;
  for (let k = 0; k < 60; k++) if (g.st.madnessPenalty(g.get('p5'))) punished++;
  assert.ok(punished > 0, '恶魔不再一律放过');
});

test('麻脸巫婆：角色不在场才变，阵营不变；首夜不行动', () => {
  cover('pithag');
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p3'));
  g.resolveNight(); day(g); g.endDay();
  night(g, { p3: { targets: ['p2'], role: 'sage' }, p5: ['p4'] });
  assert.equal(g.get('p2').role, 'artist', '贤者在场，无事发生');
  g.dawn(); g.endDay();
  const r = night(g, { p3: { targets: ['p2'], role: 'witch' }, p5: ['p8'] }, [['p1']]);
  assert.equal(g.get('p2').role, 'witch');
  assert.equal(g.evilOf(g.get('p2')), false);
  assert.match(text(r.messages, 'p2'), /善良/);
  // 官方英文总表：麻脸巫婆在女巫之后，今晚变出来的女巫要明晚才下咒（11-11 用户定以英文表为准）
  assert.ok(!g.fx.some((f) => f.kind === 'curse'), '造出的爪牙今晚不行动');
  assert.ok(!r.pause, '没有为新女巫停下来等选人');
});

test('麻脸巫婆：死人的角色也算在场', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g); g.endDay();
  g.get('p8').alive = false;
  night(g, { p3: { targets: ['p2'], role: 'sage' }, p5: ['p6'] });
  assert.equal(g.get('p2').role, 'artist');
});

test('麻脸巫婆：恶魔换成另一种恶魔，当晚没有人死', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g); g.endDay();
  night(g, { p3: { targets: ['p5'], role: 'vortox' }, p5: ['p1'] }, [['p1']]);
  assert.equal(g.get('p5').role, 'vortox');
  assert.equal(g.nightDeaths.length, 0);
  assert.ok(g.get('p1').alive);
});

test('麻脸巫婆：造出邪恶的新恶魔，老恶魔死，新恶魔当晚杀人；贤者不因此触发', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'witch', 'sage']);
  night(g, { p7: ['p1'] }); day(g); g.endDay();
  night(g, { p3: { targets: ['p7'], role: 'nodashii' }, p5: ['p1'], p7: ['p2'] }, [['p4']]);
  assert.equal(g.get('p7').role, 'nodashii');
  assert.ok(!g.get('p5').alive, '老恶魔死亡');
  assert.ok(!g.get('p4').alive, '新恶魔的目标死亡');
  assert.equal(g.winner, null);
});

test('麻脸巫婆：造出善良的恶魔，两个恶魔一起杀人，要都死善良才赢', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, {}); day(g); g.endDay();
  night(g, { p3: { targets: ['p2'], role: 'vortox' }, p5: ['p1'] }, [['p4']]);
  assert.equal(g.demonsAlive().length, 2);
  assert.equal(g.evilOf(g.get('p2')), false);
  assert.ok(!g.get('p1').alive && !g.get('p4').alive);
  day(g);
  g.execute(g.get('p5'));
  assert.equal(g.winner, null, '还有一个善良的恶魔');
});

test('方古：第一个被杀的外来者变邪恶方古，老方古死；只转化一次', () => {
  cover('fanggu');
  const g = mk(['oracle', 'artist', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g); g.endDay();
  const r = night(g, { p3: ['p1'], p5: ['p6'] });
  assert.equal(g.get('p6').role, 'fanggu');
  assert.equal(g.evilOf(g.get('p6')), true);
  assert.ok(g.get('p6').alive);
  assert.ok(!g.get('p5').alive);
  assert.match(text(r.messages, 'p6'), /方古/);
  assert.equal(g.winner, null);
  day(g); g.endDay();
  night(g, { p3: ['p1'], p6: ['p7'] });
  assert.ok(!g.get('p7').alive, '第二次外来者正常死亡');
  assert.equal(g.get('p7').role, 'mutant');
});

test('方古：选到死的外来者不算转化，转化还在', () => {
  const g = mk(['oracle', 'artist', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g); g.endDay();
  g.get('p6').alive = false;
  night(g, { p3: ['p1'], p5: ['p6'] });
  assert.equal(g.fangUsed, false);
  assert.ok(g.get('p5').alive);
});

test('亡骨魔：杀死的爪牙保留能力、还能夜里行动，邻近一名镇民中毒；亡骨魔死后都恢复', () => {
  cover('vigormortis');
  const g = mk(['oracle', 'witch', 'artist', 'savant', 'vigormortis', 'sage', 'clockmaker', 'seamstress'], { vigSide: () => 1 });
  g.st.vigSide = () => 1;
  night(g, { p2: ['p1'] }); day(g); g.endDay();
  night(g, { p2: ['p1'], p5: ['p2'] });
  assert.ok(!g.get('p2').alive);
  assert.ok(g.kept(g.get('p2')));
  assert.ok(g.isPoisoned(g.get('p3')), '邻近的镇民中毒');
  g.startNight();
  assert.ok(g.nightPrompts().some((x) => x.playerId === 'p2'), '死了的女巫还要行动');
  g.get('p5').alive = false;
  assert.ok(!g.isPoisoned(g.get('p3')));
  assert.ok(!g.kept(g.get('p2')));
});

test('诺-达鲺：两侧最近的镇民中毒，跳过非镇民，死了也算；不是相邻的存活玩家', () => {
  cover('nodashii');
  const g = mk(['philosopher', 'mathematician', 'sage', 'mutant', 'seamstress', 'witch', 'nodashii', 'klutz']);
  // 7 号诺-达鲺：一侧 6 号女巫、5 号女裁缝；另一侧 8 号呆瓜、1 号哲学家
  assert.ok(g.isPoisoned(g.get('p5')));
  assert.ok(g.isPoisoned(g.get('p1')));
  assert.ok(!g.isPoisoned(g.get('p2')));
  g.get('p5').alive = false;
  assert.ok(g.isPoisoned(g.get('p5')));
  assert.ok(!g.isPoisoned(g.get('p3')), '不会换到更远的活人身上');
  g.get('p7').alive = false;
  assert.ok(!g.isPoisoned(g.get('p1')));
});

test('诺-达鲺：中毒的镇民变成非镇民，毒按新位置改', () => {
  const g = mk(['philosopher', 'mathematician', 'sage', 'mutant', 'seamstress', 'witch', 'nodashii', 'klutz']);
  g.changeRole(g.get('p5'), 'barber');
  assert.ok(g.isPoisoned(g.get('p3')));
});

test('涡流：镇民的信息都错；白天没人被处决邪恶获胜', () => {
  cover('vortox');
  const g = mk(['oracle', 'flowergirl', 'witch', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g);
  g.endDay();
  assert.equal(g.winner, 'evil');
  const h = mk(['oracle', 'flowergirl', 'witch', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  night(h, { p3: ['p1'] }); day(h);
  h.execute(h.get('p6'));
  h.klutzChoose('p6', 'p1');
  h.endDay();
  assert.equal(h.winner, null);
  const r = night(h, { p3: ['p1'], p5: ['p7'] });
  assert.doesNotMatch(text(r.messages, 'p1'), /\*\*0\*\*/, '真实是 0，涡流下不能说 0');
  assert.match(text(r.messages, 'p2'), /\*\*有\*\*/, '恶魔没投票，涡流下要说有');
});

// ───────────── 假信息前后一致（假世界） ─────────────

/** 让 p 一直醉酒：把它加进一条永远生效的效果。 */
const drunkForever = (g, id) => g.addFx('drunk', id, null, 'never', '测试');

test('假世界：失效的神谕者每晚的数字都和同一套假世界对得上', () => {
  const g = mk(['oracle', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  drunkForever(g, 'p1');
  const told = [];
  night(g, { p3: ['p7'] }); day(g);
  for (const id of ['p4', 'p8']) {
    g.execute(g.get(id));
    g.endDay();
    const r = night(g);
    told.push(Number(/\*\*(\d+)\*\*/.exec(text(r.messages, 'p1'))[1]));
    const w = g.st.worlds.get('p1');
    assert.ok(w, '有假世界');
    assert.equal(told.at(-1), g.players.filter((q) => !q.alive && w.evil.has(q.id)).length, `第 ${g.night} 夜的数字要和假世界一致`);
    day(g);
    if (g.winner) break;
  }
  assert.ok(told.length >= 2);
});

test('假世界：失效的女裁缝用假世界回答，不是简单反过来；存档后假世界还在', () => {
  const g = mk(['seamstress', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  drunkForever(g, 'p1');
  const r = night(g, { p1: ['p3', 'p5'] });
  const w = g.st.worlds.get('p1');
  assert.ok(w);
  const said = /\*\*是\*\*/.test(text(r.messages, 'p1'));
  assert.equal(said, w.evil.has('p3') === w.evil.has('p5'));
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), { rng: makeRng(3) });
  assert.deepEqual([...back.st.worlds.get('p1').evil].sort(), [...w.evil].sort());
});

test('假世界：真实是 2 时不会有人被假世界算成自己是邪恶', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = new Game(players(9), { roles: ['seamstress', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle', 'juggler'], rng: makeRng(seed), script: 'snv' });
    const p = g.get('p1');
    const w = g.st.buildSnvWorld(p);
    assert.ok(!w.evil.has('p1'), '假世界里自己是好人');
    assert.equal(w.evil.size, 2 + 0 * seed, '邪恶人数和真的一样');
    assert.ok(w.evil.has(w.demon));
  }
});

test('假世界：涡流在场时镇民共用一套，答案永远是错的', () => {
  const g = mk(['oracle', 'flowergirl', 'witch', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g);
  g.execute(g.get('p6'));
  g.klutzChoose('p6', 'p1');
  g.endDay();
  const r = night(g, { p3: ['p1'], p5: ['p7'] });
  assert.ok(g.st.worlds.get('vortox'), '共用一套');
  assert.ok(!g.st.worlds.get('p1') && !g.st.worlds.get('p2'), '不是各编各的');
  assert.doesNotMatch(text(r.messages, 'p1'), /\*\*0\*\*/);
  assert.match(text(r.messages, 'p2'), /\*\*有\*\*/);
});

test('假世界：失效的筑梦师看同一个人，每晚的两个角色一样', () => {
  const g = mk(['dreamer', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'oracle']);
  drunkForever(g, 'p1');
  const a = text(night(g, { p1: ['p2'], p3: ['p7'] }).messages, 'p1');
  day(g); g.endDay();
  const b = text(night(g, { p1: ['p2'], p5: ['p7'] }).messages, 'p1');
  assert.equal(a, b);
});

// ───────────── 自评审核发现的问题 ─────────────

test('审核回归：假答案里的角色后来成真了，不能再给（涡流下不能说真话）', () => {
  const g = mk(['dreamer', 'philosopher', 'witch', 'sage', 'vortox', 'klutz', 'sweetheart', 'oracle']);
  const t = g.get('p2'); const dreamer = g.get('p1');
  const w = g.st.snvWorld(dreamer, 'must');
  const [good] = g.st.dreamerRoles(t, true, w);
  t.role = good;
  for (let i = 0; i < 40; i++) assert.ok(!g.st.dreamerRoles(t, true, w).includes(t.role));
});

test('审核回归：涡流不起作用时，筑梦师的假选项里可以有涡流', () => {
  const g = mk(['dreamer', 'philosopher', 'witch', 'sage', 'nodashii', 'klutz', 'sweetheart', 'oracle']);
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(g.st.dreamerRoles(g.get('p2'), true)[1]);
  assert.ok(seen.has('vortox'), '不然一听到涡流就必定是真的');
});

test('审核回归：涡流下神谕者在 0 人死亡时也不能说真话', () => {
  const g = mk(['oracle', 'flowergirl', 'witch', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  assert.notEqual(g.infoNumber(g.get('p1'), 0, { min: 0, max: 0 }, (w) => 0 * w.evil.size), 0);
});

test('审核回归：第二夜才获得钟表匠能力的人当晚就拿到信息，原来的钟表匠不重复', () => {
  const g = mk(['philosopher', 'clockmaker', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  const a = night(g);
  assert.match(text(a.messages, 'p2'), /相隔/);
  day(g); g.endDay();
  const r = night(g, { p1: { role: 'clockmaker' } });
  assert.match(text(r.messages, 'p1'), /相隔/, '首夜类能力当晚就用');
  assert.doesNotMatch(text(r.messages, 'p2'), /相隔/, '原来的钟表匠只报一次');
});

test('审核回归：呆瓜夜里死了要等天亮才能选人', () => {
  const g = mk(['oracle', 'artist', 'witch', 'sage', 'nodashii', 'klutz', 'sweetheart', 'savant']);
  night(g); day(g); g.endDay();
  g.startNight();
  g.pendingKlutz = 'p6';
  assert.throws(() => g.klutzChoose('p6', 'p3'), /天亮/);
  assert.equal(g.phase, 'night');
  assert.equal(g.winner, null);
});

test('审核回归：两个恶魔时，理发师的交换不会因为重新抽恶魔而作废', () => {
  const g = mk(['barber', 'fanggu', 'nodashii', 'witch', 'artist', 'sage', 'klutz', 'savant']);
  night(g); day(g);
  g.execute(g.get('p1')); g.endDay();
  let calls = 0;
  g.st.barberDemon = (ds) => ds[calls++ % ds.length];
  const before = [g.get('p5').role, g.get('p6').role];
  g.startNight();
  let r = g.resolveNight();
  assert.ok(r.pause, '恶魔要选');
  g.submitChoice(r.pause, ['p5', 'p6']);
  r = g.resolveNight();
  while (r.pause) { g.autoChoose(r.pause); r = g.resolveNight(); }
  assert.deepEqual([g.get('p5').role, g.get('p6').role], [before[1], before[0]], '交换生效');
});

test('审核回归：理发师换完两个人，两个人当晚都要被叫起来', () => {
  const g = mk(['barber', 'fanggu', 'seamstress', 'dreamer', 'witch', 'sage', 'klutz', 'savant']);
  night(g); day(g);
  g.execute(g.get('p1')); g.endDay();
  g.startNight();
  let r = g.resolveNight();
  g.submitChoice(r.pause, ['p3', 'p4']);
  r = g.resolveNight();
  const asked = [];
  while (r.pause) { asked.push(r.pause); g.autoChoose(r.pause); r = g.resolveNight(); }
  assert.ok(asked.includes('p3') && asked.includes('p4'), `只叫了 ${asked}`);
});

test('涡流：疯狂处决也算处决，不判邪恶胜；涡流失效时不起作用', () => {
  const g = mk(['oracle', 'flowergirl', 'cerenovus', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  night(g, { p3: { targets: ['p1'], role: 'sage' } }); day(g);
  g.madExecute('p1', '测试');
  g.endDay();
  assert.equal(g.winner, null);
  const h = mk(['oracle', 'flowergirl', 'witch', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  h.addFx('drunk', 'p5', null, 'never', '测试');
  night(h, { p3: ['p1'] }); day(h);
  h.endDay();
  assert.equal(h.winner, null);
});

test('胜负：恶魔死了善良胜；只剩两人邪恶胜', () => {
  const g = mk(['oracle', 'flowergirl', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: ['p1'] }); day(g);
  g.execute(g.get('p5'));
  assert.equal(g.winner, 'good');
  const h = mk(['oracle', 'flowergirl', 'witch', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(h, { p3: ['p1'] }); day(h);
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p6', 'p7']) h.get(id).alive = false;
  h.checkWinner();
  assert.equal(h.winner, 'evil');
});

test('存档：一局中途存了再读，舞蛇人的毒、双子、亡骨魔的爪牙都在', () => {
  const g = mk(['oracle', 'witch', 'eviltwin', 'savant', 'vigormortis', 'sage', 'snakecharmer', 'seamstress']);
  g.st.vigSide = () => 1;
  night(g, { p2: ['p1'], p7: ['p1'] }); day(g); g.endDay();
  night(g, { p2: ['p1'], p5: ['p2'], p7: ['p1'] });
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)), { rng: makeRng(1) });
  assert.deepEqual(back.twin, g.twin);
  assert.ok(back.kept(back.get('p2')));
  assert.deepEqual(back.vigKept, g.vigKept);
  assert.equal(back.abilityOf(back.get('p2')), 'witch');
});

test('全部 25 个角色都有测试', () => {
  assert.deepEqual(rolesOf('snv').filter((r) => !covered.has(r)), []);
  assert.equal(rolesOf('snv').length, 25);
});

test('模糊测试：随机对局都能打完，不会卡住也不报错', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const rng = makeRng(seed);
    const n = 5 + (seed % 11);
    const g = new Game(players(n), { rng, script: 'snv' });
    let guard = 0;
    while (!g.winner && guard++ < 30) {
      g.startNight();
      for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
      let r = g.resolveNight();
      let k = 0;
      while (r.pause && k++ < 12) { g.autoChoose(r.pause); r = g.resolveNight(); }
      assert.ok(!r.pause, `第 ${seed} 局一直在暂停`);
      g.dawn();
      if (g.winner) break;
      if (g.pendingKlutz) g.klutzChoose(g.pendingKlutz, g.alive()[Math.floor(rng() * g.aliveCount())].id);
      if (g.winner) break;
      for (const p of g.players) { assert.ok(ROLES[p.role]); g.broken(p); }
      if (g.alive().length && rng() < 0.7) {
        const a = g.alive()[Math.floor(rng() * g.aliveCount())];
        const b = g.players[Math.floor(rng() * n)];
        if (!g.nominees.has(b.id)) {
          g.nominate(a.id, b.id);
          if (!g.winner) g.recordVote(b.id, g.alive().map((q) => q.id));
        }
      }
      if (g.winner) break;
      if (!g.demonsAlive().length && g.twinBlocks()) break; // 规则：恶魔死了、两个双子都活着，游戏继续，要靠处决双子结束
      g.endDay();
    }
    assert.ok(guard < 30, `第 ${seed} 局 30 轮还没打完`);
    assert.ok(['good', 'evil'].includes(g.winner) || g.demonsAlive().length === 0, `第 ${seed} 局没有胜者`);
  }
});

test('审查回归：哲学家选了每局一次的能力还用得上；换了角色后被他弄醉的人恢复', () => {
  const g = mk(['philosopher', 'artist', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p1: { role: 'artist' }, p3: ['p2'] });
  day(g);
  assert.equal(g.artistAsk('p1', '恶魔活着吗').text, '恶魔活着吗', '艺术家的问题问得出去');
  assert.throws(() => g.artistAsk('p1', '再问一次'), /已经问过/);

  const s = mk(['philosopher', 'seamstress', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(s, { p1: { role: 'seamstress' }, p3: ['p2'] }, [[]]);
  day(s); s.endDay(); s.startNight();
  assert.ok(s.nightPrompts().some((x) => x.playerId === 'p1'), '第一晚放弃了，第二晚还能用女裁缝');

  const o = mk(['philosopher', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(o, { p1: { role: 'oracle' }, p3: ['p2'] });
  assert.ok(o.broken(o.get('p2')));
  o.changeRole(o.get('p1'), 'mutant');
  o.afterChange(null);
  assert.ok(!o.broken(o.get('p2')), '真神谕者醒了');
});

test('审查回归：麻脸巫婆把死掉的邪恶玩家变成恶魔，不杀真恶魔', () => {
  const g = mk(['oracle', 'pithag', 'witch', 'sage', 'nodashii', 'klutz', 'sweetheart', 'savant']);
  const t = g.get('p3');
  t.alive = false;
  t.role = 'vortox';
  assert.deepEqual(g.st.pitPlan(t, false, [g.get('p5')]).kill, []);
});

test('疯狂处决：剩 3 人时处决非恶魔就是邪恶赢，放过（官方：别让邪恶靠这个获胜）', () => {
  const g = mk(['mutant', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  for (const id of ['p4', 'p6', 'p7', 'p8', 'p3']) g.get(id).alive = false;
  assert.equal(g.aliveCount(), 3);
  assert.equal(g.st.mutantExecuted(g.get('p1')), false, '畸形秀演员（善良）：处决就是邪恶赢，放过');
  assert.equal(g.st.madnessPenalty(g.get('p2')), false);
});

test('审查回归：真人说书时畸形秀演员不被 AI 处决；呆瓜黄昏不被静默代选', () => {
  const g = mk(['mutant', 'oracle', 'witch', 'artist', 'fanggu', 'klutz', 'sweetheart', 'savant']);
  night(g, { p3: ['p2'] }); day(g);
  g.st.mutantExecuted = () => assert.fail('真人说书不该问 AI');
  const r = g.declare('p1', 'klutz', { auto: false });
  assert.equal(r.mutant, false);
  assert.equal(r.mutantClaim, true);
  assert.equal(g.get('p1').alive, true);

  const k = mk(['klutz', 'oracle', 'witch', 'artist', 'fanggu', 'sage', 'mutant', 'savant']);
  night(k, { p3: ['p2'] }); day(k);
  k.execute(k.get('p1'));
  k.endDay();
  assert.equal(k.pendingKlutz, 'p1', '房间层留时间让他自己选');
});

test('审查回归：黯月初升没被梦殒春宵的同名方法盖掉', () => {
  const g = new Game(players(8), { roles: ['innkeeper', 'gambler', 'courtier', 'tealady', 'pacifist', 'moonchild', 'assassin', 'po'], rng: makeRng(11), script: 'bmr' });
  g.addFx('safe', g.players[0].id, g.players[1].id, 'dawn', '旅店老板');
  assert.doesNotMatch(g.timeline.at(-1).text, /undefined/);
  g.midNight = { revived: 'p1' };
  assert.equal(g.pauseText('p1'), null, '黯月的复活用房间层默认提示');
});

test('审查回归：恶魔死了但双子挡着，只剩两人时邪恶获胜（官方的邪恶胜利条件只看人数）', () => {
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g); day(g);
  for (const p of g.players) if (![g.twin.a, g.twin.b].includes(p.id)) p.alive = false;
  g.checkWinner();
  assert.equal(g.winner, 'evil');
});

test('审查回归：麻脸巫婆造成的死亡等到恶魔行动前，女巫这一步还按四人算', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'witch', 'sage']);
  night(g, { p7: ['p1'] }); day(g); g.endDay();
  for (const id of ['p2', 'p4', 'p6', 'p8']) g.get(id).alive = false;
  night(g, { p3: { targets: ['p3'], role: 'nodashii' }, p5: ['p1'], p7: ['p1'] }, [['p2']]);
  assert.ok(!g.get('p5').alive, '老恶魔死亡');
  assert.ok(g.fx.some((f) => f.kind === 'curse' && f.target === 'p1'), '女巫行动时还有四人，能诅咒');
});

test('审查回归：假装猜过的人后来变成杂耍艺人，在新身份的首个白天还能猜；假数字不超过猜测次数', () => {
  const g = mk(['oracle', 'artist', 'pithag', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g); day(g);
  g.juggle('p1', [{ target: 'p2', role: 'artist' }]);
  g.endDay();
  night(g, { p3: { targets: ['p1'], role: 'juggler' }, p5: ['p4'] }); day(g);
  g.juggle('p1', [{ target: 'p3', role: 'pithag' }]);
  g.addFx('drunk', 'p1', null, 'never', '测试');
  g.endDay();
  assert.match(text(night(g, { p3: { targets: ['p2'], role: 'artist' }, p5: ['p6'] }).messages, 'p1'), /猜对了 \*\*0\*\* 个/);
});

test('审查回归：洗脑师白天死了，就不再因疯狂处决', () => {
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g, { p3: { targets: ['p1'], role: 'sage' } }); day(g);
  assert.deepEqual(g.madnessDue().map((x) => x.id), ['p1']);
  g.execute(g.get('p3'));
  assert.deepEqual(g.madnessDue(), []);
});

test('洗脑师：目标当晚死了仍然疯狂，处决死人算当天的处决但不再死一次', () => {
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g); day(g); g.endDay();
  night(g, { p3: { targets: ['p1'], role: 'sage' }, p5: ['p1'] }); day(g);
  assert.ok(!g.get('p1').alive);
  assert.deepEqual(g.madnessDue().map((x) => x.id), ['p1'], '官方：可以让恶魔要杀的人疯狂');
  assert.equal(g.madExecute('p1', '没有声明'), true);
  assert.ok(g.executedToday, '死人也占当天的处决');
  assert.equal(g.lastExecuted, null, '他不是今天死的');
  assert.equal(g.madExecute('p2', '第二个'), false, '今天的处决用掉了');
  assert.deepEqual(g.madnessDue(), [], '判过了不再判');
});

test('洗脑师：处决死掉的善良双子会定胜负，AI 说书放过；别的死人照常', () => {
  const g = mk(['oracle', 'eviltwin', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  const good = g.get(g.twinGoodId());
  const other = g.players.find((q) => q.id !== good.id && q.role === 'klutz');
  good.alive = false; other.alive = false;
  assert.equal(g.st.decidesGame(good), true);
  assert.equal(g.st.decidesGame(other), false);
  g.phase = 'day';
  g.madExecute(good.id, '测试');
  assert.equal(g.winner, 'evil');
});

test('夜里的疯狂处决：当场生效，不等天亮公布，不占白天的处决；死人没有意义', () => {
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g); day(g);
  g.executeSNV(g.get('p2'));
  assert.equal(g.madExecute('p1', '第二个'), false, '白天还是一天一次');
  assert.equal(g.madExecute('p1', '入夜', { night: true }), true);
  assert.ok(!g.get('p1').alive);
  assert.equal(g.madExecute('p1', '再来', { night: true }), false);
  g.endDay();
  g.startNight();
  assert.equal(g.madExecute('p4', '夜里', { night: true }), true);
  assert.equal(g.executedToday, true, '这是昨天白天的');
  submit(g, { p3: { targets: ['p8'], role: 'sage' }, p5: ['p8'] });
  let r = g.resolveNight();
  while (r.pause) { g.autoChoose(r.pause); r = g.resolveNight(); }
  assert.deepEqual(g.dawn().deaths, ['p8'], '只有恶魔这一刀等天亮');
  assert.equal(g.executedToday, false, '第二天还能处决');
});

test('畸形秀演员：今天已有处决时声称外来者，留到入夜处决', () => {
  const g = mk(['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'], { mutantExecuted: () => true });
  night(g); day(g);
  g.executeSNV(g.get('p1'));
  assert.equal(g.declare('p7', 'klutz').mutant, false);
  assert.deepEqual(g.madNight.map((x) => x.id), ['p7']);
  assert.ok(g.get('p7').alive, '白天不再处决');
});

test('杂耍艺人：可以一个都不猜，当晚得知 0；涡流下听到 1', () => {
  const g = mk(['juggler', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  night(g); day(g);
  assert.equal(g.juggle('p1', []).text, '');
  assert.equal(g.claims.p1, 'juggler');
  assert.throws(() => g.juggle('p1', []), /猜过/);
  g.endDay();
  assert.match(text(night(g, { p3: { targets: ['p2'], role: 'sage' }, p5: ['p2'] }).messages, 'p1'), /猜对了 \*\*0\*\* 个/);

  const h = mk(['juggler', 'artist', 'cerenovus', 'savant', 'vortox', 'klutz', 'mutant', 'sage']);
  night(h); day(h);
  h.juggle('p1', []);
  h.executeSNV(h.get('p8'));
  h.endDay();
  assert.match(text(night(h, { p3: { targets: ['p2'], role: 'sage' }, p5: ['p2'] }).messages, 'p1'), /猜对了 \*\*1\*\* 个/);
});

test('两个呆瓜同时死：一个一个选，第一个定了胜负第二个就不用选；存档带着排队的人', () => {
  const g = mk(['klutz', 'artist', 'cerenovus', 'savant', 'fanggu', 'oracle', 'mutant', 'sage']);
  night(g); day(g);
  g.get('p2').gained = 'klutz';
  g.snvDie(g.get('p1'), 'storyteller');
  g.snvDie(g.get('p2'), 'storyteller');
  assert.equal(g.pendingKlutz, 'p1');
  assert.throws(() => g.klutzChoose('p2', 'p4'), /不需要/);
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(back.klutzQueue, ['p2']);
  g.klutzChoose('p1', 'p4');
  assert.equal(g.pendingKlutz, 'p2', '轮到第二个');
  g.klutzChoose('p2', 'p6');
  assert.equal(g.pendingKlutz, null);
  assert.equal(g.winner, null);
  back.klutzChoose('p1', 'p5');
  assert.equal(back.winner, 'evil');
});

test('夜里被处决的呆瓜：死讯已经公开，当场选；夜里被杀的还是等天亮', () => {
  const g = mk(['klutz', 'artist', 'cerenovus', 'savant', 'fanggu', 'oracle', 'mutant', 'sage']);
  g.startNight();
  g.madExecute('p1', '测试', { night: true });
  g.klutzChoose('p1', 'p4');
  assert.equal(g.pendingKlutz, null);
  const h = mk(['klutz', 'artist', 'cerenovus', 'savant', 'fanggu', 'oracle', 'mutant', 'sage']);
  h.startNight();
  h.snvDie(h.get('p1'), 'demon');
  assert.throws(() => h.klutzChoose('p1', 'p4'), /天亮/);
});
