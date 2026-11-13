// 官方百科「运作方式 / 提示与技巧」里说书人可以自己拿主意的地方（2026-11-09 第二批）：每条一个按官方口径的断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { ROLES } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed, opts = {}) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'bs7', ...opts });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
const BASE = ['noble', 'librarian', 'shugenja', 'villageidiot', 'virgin', 'saint', 'harpy', 'imp'];

test('鹰身女妖：能力不杀恶魔。恶魔没做到疯狂整个放过，被指认的恶魔也不会死', () => {
  for (let s = 1; s <= 200; s++) {
    const g = mk(BASE, s);
    const demon = g.get('p8');
    assert.deepEqual(g.st.harpyVictims(demon, g.get('p2')), [], '恶魔自己没疯狂');
    const out = g.st.harpyVictims(g.get('p2'), demon);
    assert.ok(!out.includes(demon), `第 ${s} 局杀了恶魔`);
  }
});

test('贵族：多半给爪牙，善良领先时几乎不给恶魔', () => {
  const rate = (b) => {
    let demon = 0; const N = 600;
    for (let s = 1; s <= N; s++) {
      const g = mk(BASE, s);
      g.st.balance = () => b;
      const trio = g.st.nobleTrio(g.get('p1'), null);
      assert.equal(trio.filter((q) => g.evilOf(q)).length, 1);
      if (trio.some((q) => q.role === 'imp')) demon++;
    }
    return demon / N;
  };
  const lead = rate(0.5); const behind = rate(-0.8);
  assert.ok(lead < 0.12, `善良领先给恶魔 ${lead}`);
  assert.ok(behind > lead && behind < 0.3, `善良落后给恶魔 ${behind}`);
});

test('修行者：两边一样近时由说书人定，善良落后多指恶魔那一侧', () => {
  // p3 修行者：p2 小恶魔（逆时针 1）、p4 鹰身女妖（顺时针 1）
  const roles = ['noble', 'imp', 'shugenja', 'harpy', 'virgin', 'saint', 'librarian', 'villageidiot'];
  const rate = (b) => {
    let ccw = 0; const N = 600;
    for (let s = 1; s <= N; s++) {
      const g = mk(roles, s);
      g.st.balance = () => b;
      if (g.st.shugenjaSide(g.get('p3'), null) === -1) ccw++;
    }
    return ccw / N;
  };
  assert.ok(rate(-0.6) > 0.75, '善良落后：多指恶魔');
  assert.ok(rate(0.6) < 0.25, '善良领先：多指爪牙');
});

test('贤者：最后一夜可以指一个死人；前期两个都是活人；失效时永远不含恶魔', () => {
  const roles = ['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
  let deadShown = 0; const N = 300;
  for (let s = 1; s <= N; s++) {
    const g = new Game(players(8), { roles, rng: makeRng(s), script: 'snv' });
    g.st.balance = () => -0.6;
    const sage = g.get('p8'); const demon = g.get('p5');
    sage.alive = false;
    const early = g.st.sagePair(sage, demon, false);
    assert.ok(early.includes(demon) && early.every((q) => q.alive), '前期：恶魔 + 一个活人');
    for (const id of ['p1', 'p2', 'p3', 'p6']) g.get(id).alive = false;
    const late = g.st.sagePair(sage, demon, false);
    assert.ok(late.includes(demon));
    if (late.some((q) => !q.alive)) deadShown++;
    const lie = g.st.sagePair(sage, demon, true);
    assert.ok(!lie.includes(demon), '失效不给恶魔');
  }
  assert.ok(deadShown / N > 0.5 && deadShown / N < 0.95, `善良落后时最后一夜指死人 ${deadShown}/${N}`);
});

test('博学者：真假两条信息都尽量不点名恶魔', () => {
  const roles = ['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
  let named = 0; const N = 400;
  for (let s = 1; s <= N; s++) {
    const g = new Game(players(8), { roles, rng: makeRng(s), script: 'snv' });
    g.st.balance = () => 0.3;
    const facts = g.st.savantFacts();
    if (facts.some((f) => f.t.includes(g.name('p5')) || f.f.includes(g.name('p5')))) named++;
  }
  assert.ok(named / N < 0.12, `点名恶魔 ${named}/${N}`);
});

test('涡流下的数学家：数字不总是 0、1，可以落在真相下面更远的地方', () => {
  const seen = new Set();
  for (let s = 1; s <= 200; s++) {
    const g = new Game(players(8), { roles: ['mathematician', 'oracle', 'artist', 'savant', 'vortox', 'klutz', 'witch', 'sage'], rng: makeRng(s), script: 'snv' });
    const v = g.st.fakeNumber(g.get('p1'), 6, { min: 0, max: 8 });
    assert.notEqual(v, 6);
    seen.add(v);
  }
  assert.ok([2, 3, 4].some((n) => seen.has(n)), `看到的数字 ${[...seen]}`);
});

test('麻脸巫婆在最后几夜造出镜像双子：对立双子挑死人（或恶魔），善良还能赢', () => {
  const g = new Game(players(8), { roles: ['eviltwin', 'oracle', 'artist', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'], rng: makeRng(3), script: 'snv' });
  for (const id of ['p2', 'p3', 'p4', 'p6']) g.get(id).alive = false;
  for (let k = 0; k < 20; k++) {
    const t = g.st.twinFor(g.get('p1'), true);
    assert.ok(!t.alive || ROLES[t.role].team === 'demon', `挑了活着的 ${t.role}`);
  }
  assert.ok(g.st.twinFor(g.get('p1'), false).alive, '平时优先活着的镇民');
});

test('醉酒的村夫：偶尔拿真信息，邪恶领先时多一点；同一晚只掷一次', () => {
  const rate = (b) => {
    let truth = 0; const N = 500;
    for (let s = 1; s <= N; s++) {
      const g = mk(['villageidiot', 'villageidiot', 'noble', 'saint', 'virgin', 'harpy', 'imp'], s);
      const drunk = g.players.find((p) => p.role === 'villageidiot' && g.broken(p));
      g.night = 2;
      g.st.balance = () => b;
      const m = g.lieMode(drunk);
      assert.equal(g.lieMode(drunk), m, '同一晚一样');
      if (m === null) truth++;
    }
    return truth / N;
  };
  const even = rate(0); const behind = rate(-0.6);
  assert.ok(even > 0.12 && even < 0.4, `势均力敌 ${even}`);
  assert.ok(behind > even, `邪恶领先 ${behind}`);
});

test('新人杂耍艺人忘了公开猜：当晚照样得知 0；老手不给', () => {
  const roles = ['juggler', 'oracle', 'witch', 'sage', 'fanggu', 'klutz', 'sweetheart', 'savant'];
  const run = (newbies) => {
    const g = new Game(players(8), { roles, rng: makeRng(11), script: 'snv', newbies });
    g.startNight(); g.submitChoice('p3', ['p2']);
    for (let r = g.resolveNight(); r.pause; r = g.resolveNight()) g.autoChoose(r.pause);
    g.dawn(); g.endDay();
    g.startNight(); g.submitChoice('p3', ['p2']); g.submitChoice('p5', ['p6']);
    const messages = [];
    for (let r = g.resolveNight(); ; r = g.resolveNight()) { messages.push(...r.messages); if (!r.pause) break; g.autoChoose(r.pause); }
    return text(messages, 'p1');
  };
  assert.match(run(['p1']), /猜对了 \*\*0\*\* 个/);
  assert.doesNotMatch(run([]), /猜对/);
});

test('农夫接班看局势：善良落后多给外来者，善良领先多给还有持续能力的角色', () => {
  // p1 农夫 p2 共情者（持续） p3 圣徒（外来者） p4 洗衣妇（首夜，用完了）
  const roles = ['farmer', 'empath', 'saint', 'washerwoman', 'imp', 'poisoner', 'chef'];
  const rate = (b, role) => {
    let hit = 0; const N = 600;
    for (let s = 1; s <= N; s++) {
      const g = new Game(players(7), { roles, rng: makeRng(s), script: 'bs7' });
      g.st.balance = () => b;
      if (g.st.farmerHeir(g.get('p1')).role === role) hit++;
    }
    return hit / N;
  };
  assert.ok(rate(-0.6, 'saint') > rate(0.6, 'saint') + 0.2, '外来者：善良落后时多');
  assert.ok(rate(0.6, 'empath') > rate(-0.6, 'empath') + 0.15, '持续能力：善良领先时多');
});

test('筑梦师看邪恶玩家：没声明过时，也会展示舞蛇人、贤者这类本来就藏着的角色', () => {
  const roles = ['dreamer', 'oracle', 'artist', 'savant', 'fanggu', 'witch', 'mutant', 'clockmaker'];
  const seen = new Set();
  for (let s = 1; s <= 200; s++) {
    const g = new Game(players(8), { roles, rng: makeRng(s), script: 'snv' });
    g.st.balance = () => 0;
    const [good, evil] = g.st.dreamerRoles(g.get('p5'), false);
    assert.equal(evil, 'fanggu');
    seen.add(good);
  }
  assert.ok(['snakecharmer', 'sage', 'klutz'].some((r) => seen.has(r)), `展示过 ${[...seen]}`);
});

test('科学怪人：多半给恶魔一个能核对的信息能力', () => {
  const roles = ['boffin', 'oracle', 'artist', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
  const PROOF = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'noble', 'clockmaker', 'undertaker', 'oracle', 'flowergirl', 'towncrier'];
  let proof = 0; const N = 300;
  for (let s = 1; s <= N; s++) {
    const g = new Game(players(8), { roles, rng: makeRng(s), script: 'snv' });
    if (PROOF.includes(g.boffin)) proof++;
  }
  assert.ok(proof / N > 0.75, `能核对的 ${proof}/${N}`);
});

test('麻脸巫婆最后几夜造出善良恶魔：善良落后时多照官方范例杀邪恶的老恶魔；没有别的邪恶活着就不杀老恶魔', () => {
  const roles = ['pithag', 'oracle', 'artist', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
  const rate = (b) => {
    let oldDies = 0; const N = 400;
    for (let s = 1; s <= N; s++) {
      const g = new Game(players(8), { roles, rng: makeRng(s), script: 'snv' });
      for (const id of ['p3', 'p4', 'p6', 'p8']) g.get(id).alive = false; // 剩 p1 麻脸巫婆 p2 神谕者 p5 方古 p7
      g.st.balance = () => b;
      const plan = g.st.pitPlan(g.get('p2'), false, [g.get('p5')]);
      assert.equal(plan.kill.length, 1);
      if (plan.kill[0].id === 'p5') oldDies++;
    }
    return oldDies / N;
  };
  assert.ok(rate(-0.6) > 0.7 && rate(0.6) < 0.3, `落后 ${rate(-0.6)} 领先 ${rate(0.6)}`);
  const g = new Game(players(8), { roles, rng: makeRng(1), script: 'snv' });
  for (const id of ['p1', 'p3', 'p4', 'p6', 'p8']) g.get(id).alive = false; // 麻脸巫婆也死了：老恶魔一死就没有邪恶了
  g.st.balance = () => -0.9;
  for (let k = 0; k < 20; k++) assert.equal(g.st.pitPlan(g.get('p2'), false, [g.get('p5')]).kill[0].id, 'p2');
});

test('麻脸巫婆造出邪恶新恶魔：老恶魔死；局势一边倒时说书人平衡（善良大优多死一个善良，邪恶大优这一刀落空）；势均力敌不动', () => {
  const roles = ['pithag', 'oracle', 'artist', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
  const runs = (b) => Array.from({ length: 200 }, (_, i) => {
    const g = new Game(players(8), { roles, rng: makeRng(i + 1), script: 'snv' });
    g.st.balance = () => b;
    return { g, plan: g.st.pitPlan(g.get('p1'), false, [g.get('p5')]) };
  });
  for (const { plan } of runs(0)) { assert.deepEqual(plan.kill.map((q) => q.id), ['p5']); assert.equal(plan.suppress, false); }
  const up = runs(0.6);
  const extra = up.filter(({ plan }) => plan.kill.length === 2).length;
  assert.ok(extra > 60 && extra < 140, `善良大优多死一个 ${extra}/200`);
  for (const { g, plan } of up) for (const q of plan.kill.slice(1)) assert.ok(!g.evilOf(q));
  const down = runs(-0.6).filter(({ plan }) => plan.suppress).length;
  assert.ok(down > 60 && down < 140, `邪恶大优落空 ${down}/200`);
});

test('看不出谁领先时偏向邪恶一点（官方：要么都不帮，要么帮邪恶），不越过「略占上风」', async () => {
  const { EVIL_LEAN, balanceLabel } = await import('../src/engine/storyteller.js');
  const g = mk(BASE, 1);
  const b = g.st.balance();
  assert.ok(b > 0 && b < 0.15, `开局 ${b}`);
  assert.equal(balanceLabel(b), '势均力敌');
  assert.ok(EVIL_LEAN > 0);
});

test('暗流涌动也能公开声明：说书人编假世界时，真邪恶就当他声称的角色', () => {
  const roles = ['imp', 'poisoner', 'drunk', 'chef', 'empath', 'washerwoman', 'monk', 'slayer'];
  const g = new Game(players(8), { roles, rng: makeRng(5) });
  assert.throws(() => g.claimRole('p1', 'monk'), /白天/);
  g.phase = 'day'; g.day = 1;
  g.claimRole('p1', 'monk');
  g.claimRole('p2', 'empath');
  assert.throws(() => g.claimRole('p2', 'chef', 1), /最多/);
  assert.equal(g.claims.p1, 'monk');
  for (let k = 0; k < 30; k++) {
    const w = g.st.buildWorld(g.get('p4'));
    if (!w.evil.has('p1')) assert.equal(w.roles.get('p1'), 'monk', '小恶魔在假世界里是僧侣');
    if (!w.evil.has('p2')) assert.equal(w.roles.get('p2'), 'empath');
  }
});

test('局势：亡骨魔杀死的爪牙保留能力，不算死爪牙（上一局唯一的爪牙被亡骨魔杀了，局势跳到善良明显领先）', () => {
  const roles = ['lunatic', 'balloonist', 'cerenovus', 'vigormortis', 'fortuneteller', 'amnesiac', 'gambler', 'grandmother', 'philosopher'];
  const g = new Game(players(9), { roles, rng: makeRng(1), script: 'cat' });
  const before = g.st.balance();
  const m = g.get('p3');
  m.alive = false; m.kept = true;
  assert.ok(Math.abs(g.st.balance() - before) < 0.01, `亡骨魔杀的爪牙：${g.st.balance()}`);
  m.kept = false;
  assert.ok(g.st.balance() > 0.5, '真死了才算');
});

test('亡骨魔毒谁：混合剧本里占卜师、气球驾驶员也算拿信息的', () => {
  const roles = ['lunatic', 'balloonist', 'cerenovus', 'vigormortis', 'fortuneteller', 'amnesiac', 'gambler', 'grandmother', 'philosopher'];
  const rate = (b) => {
    let ft = 0; const N = 400;
    for (let s = 1; s <= N; s++) {
      const g = new Game(players(9), { roles, rng: makeRng(s), script: 'cat' });
      g.st.balance = () => b;
      // 3 号洗脑师：顺时针最近的镇民是 5 号占卜师，逆时针是 2 号气球驾驶员，两个都拿信息 → 不分轻重
      if (g.st.vigSide(g.get('p3')) === 1) ft++;
    }
    return ft / N;
  };
  const r = rate(0.6);
  assert.ok(r > 0.35 && r < 0.65, `两边都拿信息，接近一半：${r}`);
});

test('失忆者的能力：多给夜里察觉得到的（官方：让这一能力容易被猜测），白天的约两成', async () => {
  const { AMNESIAC_DAY } = await import('../src/engine/snv.js');
  let day = 0; const N = 600;
  for (let s = 1; s <= N; s++) {
    const g = new Game(players(6), { roles: ['amnesiac', 'fisherman', 'goblin', 'leviathan', 'widow', 'sage'].map((r) => r), rng: makeRng(s), script: 'luf' });
    if (AMNESIAC_DAY.has(g.get('p1').gained)) day++;
  }
  assert.ok(day / N > 0.12 && day / N < 0.28, `白天能力 ${day}/${N}`);
});

test('旅店老板：保护的两人里有邪恶时几乎总醉善良，善良落后时偶尔醉邪恶', () => {
  const rate = (b) => {
    let evil = 0; const N = 800;
    for (let s = 1; s <= N; s++) {
      const g = new Game(players(7), { roles: ['innkeeper', 'empath', 'chef', 'zombuul', 'poisoner', 'monk', 'saint'], rng: makeRng(s), script: 'bmr' });
      g.st.balance = () => b;
      if (g.evilOf(g.st.innkeeperDrunk([g.get('p2'), g.get('p4')]))) evil++;
    }
    return evil / N;
  };
  const even = rate(0); const behind = rate(-0.6); const lead = rate(0.6);
  assert.ok(even > 0.05 && even < 0.16, `势均力敌 ${even}`);
  assert.ok(behind > even && behind < 0.3, `善良落后 ${behind}`);
  assert.ok(lead < even, `善良领先 ${lead}`);
});

test('配合伪装不只看公开声明：没声明时看大家在小魔典里把他标成什么（至少两人、比第二多）', async () => {
  const { markedRole } = await import('../src/server/beliefs.js');
  const now = { a: { tags: { x: { role: 'empath' } } }, b: { tags: { x: { role: 'empath' } } }, c: { tags: { x: { role: 'chef' } } }, x: { tags: { x: { role: 'monk' } } } };
  assert.equal(markedRole(now, 'x'), 'empath');
  assert.equal(markedRole({ a: { tags: { x: { role: 'empath' } } } }, 'x'), null, '一个人标的不算');
  assert.equal(markedRole({ a: { tags: { x: { role: 'empath' } } }, b: { tags: { x: { role: 'chef' } } } }, 'x'), null, '平手不算');
  const g = new Game(players(8), { roles: ['imp', 'spy', 'poisoner', 'chef', 'empath', 'washerwoman', 'monk', 'slayer'], rng: makeRng(3) });
  g.markedRole = (id) => (id === 'p2' ? 'ravenkeeper' : null);
  assert.equal(g.st.claimOf('p2'), 'ravenkeeper', '没声明：看标记');
  g.claims = { p2: 'undertaker' };
  assert.equal(g.st.claimOf('p2'), 'undertaker', '公开声明优先');
  const h = new Game(players(8), { roles: ['imp', 'spy', 'poisoner', 'chef', 'empath', 'washerwoman', 'monk', 'slayer'], rng: makeRng(4) });
  h.markedRole = (id) => (id === 'p2' ? 'ravenkeeper' : null);
  assert.equal(h.st.misregRole(h.get('p2')), 'ravenkeeper', '间谍被误登记成大家标的那个身份');
});
