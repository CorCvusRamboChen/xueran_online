// 《心理博弈》（Rochambeau v11）的 5 个新角色，口径照集石百科（2026-11-20 用户：按 v11 做）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { SCRIPTS, ROLES } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, opts = {}) => new Game(players(roles.length), { roles, rng: makeRng(opts.seed ?? 7), script: 'roc', misregister: 0, ...opts });

function night(g, choices = {}, answer = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, Array.isArray(t) ? t : t.targets, Array.isArray(t) ? {} : { role: t.role });
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  const msgs = [...r.messages];
  for (let k = 0; r.pause && k < 10; k++) {
    const a = answer[r.pause];
    if (a?.targets) g.submitChoice(r.pause, a.targets); else if (a !== undefined) g.submitChoice(r.pause, [], { role: a }); else g.autoChoose(r.pause);
    r = g.resolveNight();
    msgs.push(...r.messages);
  }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...msgs] };
}
const said = (r, id) => r.messages.filter((m) => m.playerId === id).map((m) => m.text).join('\n');

test('心理博弈：25 个角色都有，人数表能开局', () => {
  assert.equal(SCRIPTS.roc.roles.length, 25);
  for (const r of SCRIPTS.roc.roles) assert.ok(ROLES[r], r);
  for (let n = 5; n <= 15; n++) assert.equal(new Game(players(n), { script: 'roc', rng: makeRng(n) }).players.length, n);
});

test('赏金猎人：一名镇民转成邪恶并在首夜得知；赏金猎人首夜得知一名邪恶；他得知的人死了，当晚再得知另一名', () => {
  const g = mk(['bountyhunter', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  const r1 = night(g);
  const tf = g.get(g.bhEvilTf);
  assert.ok(tf && ROLES[tf.role].team === 'townsfolk' && g.evilOf(tf), '一名镇民是邪恶的');
  assert.match(said(r1, tf.id), /你是邪恶阵营的/);
  const first = g.bh.p1.target;
  assert.ok(g.evilOf(g.get(first)));
  assert.match(said(r1, 'p1'), /是邪恶的/);
  g.dawn(); g.endDay();
  const r2 = night(g, { p7: ['p2'] });
  assert.equal(g.bh.p1.target, first, '他得知的人没死：没有新信息');
  assert.doesNotMatch(said(r2, 'p1'), /是邪恶的/);
  g.dawn();
  g.get(first).alive = false; // 白天被处决了
  g.endDay();
  const r3 = night(g, { ...(g.get('p6').alive ? { p6: ['p5'] } : {}), p7: ['p3'] }); // 投毒者别毒到赏金猎人
  assert.notEqual(g.bh.p1.target, first);
  assert.ok(g.evilOf(g.get(g.bh.p1.target)), '再得知另一名邪恶');
  assert.match(said(r3, 'p1'), /是邪恶的/);
});

test('杂技演员：选的人当晚醉酒或中毒，他死；选的人清醒就没事；他自己中毒不会死', () => {
  const g = mk(['acrobat', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  night(g, { p6: ['p2'] }); g.dawn(); g.endDay();
  night(g, { p1: ['p2'], p6: ['p2'], p7: ['p4'] });
  assert.equal(g.get('p1').alive, false, '选中了被毒的人');
  const h = mk(['acrobat', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  night(h, { p6: ['p3'] }); h.dawn(); h.endDay();
  night(h, { p1: ['p2'], p6: ['p3'], p7: ['p4'] });
  assert.equal(h.get('p1').alive, true, '选的人清醒');
  const k = mk(['acrobat', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  night(k, { p6: ['p1'] }); k.dawn(); k.endDay();
  night(k, { p1: ['p1'], p6: ['p1'], p7: ['p4'] });
  assert.equal(k.get('p1').alive, true, '杂技演员自己中毒：不会因自身能力死');
});

test('半兽人：杀了善良的人，当晚恶魔不杀；选中邪恶或失足的人不杀，恶魔照常', () => {
  const g = mk(['lycanthrope', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  night(g, { p6: ['p6'] }); g.dawn(); g.endDay();
  g.fauxPaw = null;
  night(g, { p1: ['p2'], p6: ['p6'], p7: ['p4'] });
  assert.equal(g.get('p2').alive, false, '半兽人杀了善良的');
  assert.equal(g.get('p4').alive, true, '当晚恶魔不造成死亡');
  g.dawn(); g.endDay();
  g.fauxPaw = 'p3';
  night(g, { p1: ['p3'], p6: ['p6'], p7: ['p4'] });
  assert.equal(g.get('p3').alive, true, '失足的人被当作邪恶：不死');
  assert.equal(g.get('p4').alive, false, '半兽人没杀成：恶魔照常');
  assert.equal(g.seenEvil(g.get('p3'), '测试'), true, '失足的人在检测里也是邪恶');
});

test('守夜人：每局一次，选的人得知谁是守夜人；失效时那人什么都不知道，能力照样用掉', () => {
  const g = mk(['nightwatchman', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  const r = night(g, { p1: ['p3'], p6: ['p6'] });
  assert.match(said(r, 'p3'), /玩家1.*守夜人/);
  g.dawn(); g.endDay();
  g.startNight();
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p1'), '用过就不再醒');
  const h = mk(['nightwatchman', 'noble', 'mayor', 'seamstress', 'tinker', 'poisoner', 'po']);
  const r2 = night(h, { p1: ['p3'], p6: ['p1'] });
  assert.doesNotMatch(said(r2, 'p3'), /守夜人/);
  assert.ok(h.used.p1, '失效也用掉');
});

test('帽匠：死了当晚开茶会，爪牙和恶魔可以换成同类型、不在场的角色，也可以不换', () => {
  const g = mk(['hatter', 'noble', 'mayor', 'seamstress', 'innkeeper', 'gambler', 'poisoner', 'widow', 'po']);
  night(g, { p7: ['p6'] }); g.dawn();
  g.snvDie(g.get('p1'), 'execution');
  assert.equal(g.hatterDue, g.night + 1, '白天死了：今晚开茶会');
  g.endDay();
  const r = night(g, { p7: ['p2'], p9: ['p3'] }, { p7: 'assassin', p8: null, p9: 'vigormortis' });
  assert.equal(g.get('p7').role, 'assassin');
  assert.equal(g.get('p8').role, 'widow', '不换');
  assert.equal(g.get('p9').role, 'vigormortis');
  assert.match(said(r, 'p7'), /帽匠的茶会.*刺客/);
});
