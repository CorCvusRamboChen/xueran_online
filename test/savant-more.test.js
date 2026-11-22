// 博学者的更多种类（2026-11-20 用户给的真人说书人口径）：每条「真」的说法要真、「假」的要假；无神论者局不说中毒醉酒和恶魔状态。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { ROLES } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function night(g) {
  g.startNight();
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 10; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
}
const ROLESETS = [
  ['savant', 'noble', 'fisherman', 'snakecharmer', 'barber', 'drunk', 'poisoner', 'vigormortis'],
  ['savant', 'noble', 'fisherman', 'snakecharmer', 'balloonist', 'professor', 'mezepheles', 'alhadikhia'],
  ['savant', 'noble', 'huntsman', 'damsel', 'golem', 'farmer', 'pithag', 'psychopath', 'vigormortis'],
];

/** 照真实情况重新判一条说法是真是假（只判这次新加的几类），不认识的返回 null。 */
function check(g, s) {
  const ps = g.players; const n = ps.length;
  const evil = (q) => g.evilOf(q);
  let m;
  if ((m = s.match(/^坐在双数号的邪恶玩家比单数号的(更多|更少|一样多)$/))) {
    const e = ps.filter((q) => q.seat % 2 === 0 && evil(q)).length; const o = ps.filter((q) => q.seat % 2 === 1 && evil(q)).length;
    return m[1] === (e > o ? '更多' : e < o ? '更少' : '一样多');
  }
  if ((m = s.match(/^所有邪恶玩家的座位号加起来(大于|小于) (\d+)$/))) {
    const sum = ps.filter(evil).reduce((a, q) => a + q.seat, 0);
    return m[1] === '大于' ? sum > +m[2] : sum < +m[2];
  }
  if ((m = s.match(/^场上有 (\d+) 名玩家醉酒或中毒$/))) return ps.filter((q) => q.alive && g.snvBroken(q)).length === +m[1];
  if ((m = s.match(/^死亡的玩家里有 (\d+) 名善良$/))) return ps.filter((q) => !q.alive && !evil(q)).length === +m[1];
  if ((m = s.match(/^(.+)这四个角色中，有且只有两个在场$/))) {
    const names = m[1].split('、');
    const ids = names.map((nm) => Object.keys(ROLES).find((r) => ROLES[r].name === nm && g.scriptRoles().includes(r)));
    return ids.filter((r) => ps.some((q) => q.role === r)).length === 2;
  }
  if ((m = s.match(/^(有|没有)(两名爪牙|两名外来者|爪牙和外来者)(相邻而坐|坐在正对面)$/))) {
    const [a, b] = { 两名爪牙: ['minion', 'minion'], 两名外来者: ['outsider', 'outsider'], 爪牙和外来者: ['minion', 'outsider'] }[m[2]];
    const step = m[3] === '相邻而坐' ? 1 : n / 2;
    const k = (q) => ROLES[q.role].team;
    const has = ps.some((q, i) => { const r = ps[(i + step) % n]; return (k(q) === a && k(r) === b) || (k(q) === b && k(r) === a); });
    return (m[1] === '有') === has;
  }
  return null;
}

test('博学者新加的几类：真的说法都真、假的说法都假', () => {
  let checked = 0;
  for (const roles of ROLESETS) for (let seed = 1; seed <= 25; seed++) {
    const g = new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'mo', misregister: 0 });
    night(g); g.dawn();
    for (const f of g.st.savantFacts()) {
      const t = check(g, f.t); const ff = check(g, f.f);
      if (t !== null) { assert.equal(t, true, `应为真：${f.t}`); checked++; }
      if (ff !== null) { assert.equal(ff, false, `应为假：${f.f}`); checked++; }
      assert.notEqual(f.t, f.f);
    }
  }
  assert.ok(checked > 300, `核对了 ${checked} 条`);
});

test('博学者：邪恶数量从第几夜开始异常；无神论者局不说中毒醉酒和恶魔状态', () => {
  const g = new Game(players(8), { roles: ROLESETS[0], rng: makeRng(5), script: 'mo', misregister: 0 });
  night(g); g.dawn(); g.endDay();
  g.get('p2').evil = true; // 第 2 夜有人变成了邪恶（比如灵言师）
  night(g); g.dawn();
  const all = g.st.savantFacts();
  const f = all.find((x) => /邪恶玩家的数量/.test(x.t));
  assert.equal(f.t, '从第 2 个夜晚开始，邪恶玩家的数量就和开局时不一样了');
  const a = new Game(players(7), { roles: ['atheist', 'savant', 'noble', 'fisherman', 'professor', 'farmer', 'drunk'], rng: makeRng(7), script: 'mo', misregister: 0 });
  night(a); a.dawn();
  for (let k = 0; k < 20; k++) for (const line of a.st.savantLines(a.get('p2'), 'atheist')) assert.doesNotMatch(line, /醉酒或中毒|转移座位|无神论者/, line);
});

// 2026-11-23 用户：博学者两条要难分真假。上一局第 2 天给了「死亡的玩家里有 1 名善良」（那时没人死，一看就是假的）
test('博学者：公开就能判真假的不说（没人死不说死人；假数字不超过死人数）；不说博学者自己；两条尽量同一类', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const roles = ROLESETS[seed % ROLESETS.length];
    const g = new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'snv' });
    const me = g.get('p1');
    const facts = g.st.savantFacts(null, me);
    assert.ok(!facts.some((f) => /死亡的玩家|存活的玩家/.test(f.t)), `seed ${seed}：还没人死就说死人 / 活人里的邪恶人数`);
    assert.ok(!facts.some((f) => /玩家1(?!\d)/.test(f.t) && / 是(善良|邪恶)的$/.test(f.t)), '不说博学者自己是什么阵营');
    night(g); g.dawn();
    const dead = g.players.filter((q) => !q.alive).length;
    for (const f of g.st.savantFacts(null, me)) {
      const m = f.f.match(/^死亡的玩家里有 (\d+) 名/);
      if (m) assert.ok(Number(m[1]) <= dead, `${f.f}（只死了 ${dead} 个）`);
    }
    let same = 0;
    for (let k = 0; k < 10; k++) {
      const real = g.st.savantFacts.bind(g.st); let pool;
      g.st.savantFacts = (w, p) => { pool = real(w, p); return pool; };
      const lines = g.st.savantLines(me, null);
      g.st.savantFacts = real;
      const cat = (l) => pool.find((f) => f.t === l || f.f === l)?.cat;
      if (cat(lines[0]) === cat(lines[1])) same++;
    }
    assert.ok(same >= 8, `seed ${seed}：两条同一类只有 ${same}/10`);
  }
});
