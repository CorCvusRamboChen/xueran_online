// 梦殒春宵说书人的做法：官方百科里写明的尺度和示例，加上决策日志能查的不变量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollSNV } from '../src/engine/snv.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const ROLES8 = ['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];
const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}：${a} 不是 ${b}`);
const mk = (roles = ROLES8, seed = 11) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'snv' });

test('疯狂尺度不跟局势走：领先的是谁，处决的概率都一样', () => {
  for (const b of [-1, 0, 1]) {
    const g = mk();
    g.st.balance = () => b;
    g.st.madnessPenalty(g.get('p1'));
    g.st.mutantExecuted(g.get('p7'));
    const [mad, mut] = g.st.decisions.slice(-2);
    const p = (d) => (d.chosen ? d.prob : 1 - d.prob);
    near(p(mad), 0.75, `局势 ${b}`);
    near(p(mut), 0.85, `局势 ${b}`);
  }
});

test('疯狂尺度：邪恶和新手都从宽（官方：可以放过，新手宽老手严）', () => {
  const g = mk();
  g.newbies = ['p1'];
  g.st.madnessPenalty(g.get('p3'));
  g.st.madnessPenalty(g.get('p1'));
  g.st.mutantExecuted(g.get('p1'));
  for (const d of g.st.decisions.slice(-3)) near(d.chosen ? d.prob : 1 - d.prob, 0.4, d.kind, 0.02);
});

test('疯狂判定的手记不写局势：终局复盘里看不出是按谁领先判的', () => {
  const g = mk();
  g.st.madnessPenalty(g.get('p1'));
  assert.doesNotMatch(g.timeline.at(-1).text, /局势/);
});

test('会让邪恶当场获胜的放过，也记进日志，并说明是强制的', () => {
  const g = mk(['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  assert.equal(g.st.madnessPenalty(g.get(g.twinGoodId())), false); // 善良双子：处决就是邪恶赢
  const d = g.st.decisions.at(-1);
  assert.equal(d.forced, 'decidesGame');
  assert.equal(d.prob, 1);
});

const HIDDEN = ['snakecharmer', 'sage', 'mutant', 'klutz'];
test('筑梦师看邪恶玩家：善良那一项展示他的伪装，每晚一样', () => {
  const g = mk();
  g.bluffs = ['clockmaker', 'juggler', 'barber'];
  g.st.balance = () => 0;
  const [good, evil] = g.st.dreamerRoles(g.get('p3'), false);
  assert.ok([...g.bluffs, ...HIDDEN].includes(good), good); // 伪装，或者舞蛇人这类本来就藏着的角色（官方筑梦师页）
  assert.equal(evil, 'cerenovus');
  for (let i = 0; i < 20; i++) assert.equal(g.st.dreamerRoles(g.get('p3'), false)[0], good);
});

test('筑梦师看邪恶玩家：公开声明过的身份优先于恶魔拿到的伪装', () => {
  const g = mk();
  g.bluffs = ['clockmaker', 'juggler', 'barber'];
  g.st.balance = () => 0;
  g.claims = { p3: 'flowergirl' };
  assert.equal(g.st.dreamerRoles(g.get('p3'), false)[0], 'flowergirl');
});

test('筑梦师看邪恶玩家：声称了自己真实的角色不能拿来当善良项；邪恶明显领先时不帮', () => {
  const g = mk();
  g.bluffs = ['clockmaker'];
  g.claims = { p3: 'cerenovus' };
  g.st.balance = () => 0;
  assert.ok(['clockmaker', ...HIDDEN].includes(g.st.dreamerRoles(g.get('p3'), false)[0]));
  const h = mk();
  h.bluffs = ['clockmaker'];
  h.st.balance = () => -0.5;
  h.claims = { p3: 'flowergirl' };
  assert.equal(h.st.coverOf(h.get('p3')), null);
});

test('筑梦师：邪恶项大多是在场爪牙（官方：几乎都用在场爪牙）', () => {
  let hit = 0; const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const g = mk(ROLES8, seed);
    const [, evil] = g.st.dreamerRoles(g.get('p1'), false);
    if (evil === 'cerenovus') hit++;
  }
  assert.ok(hit / N > 0.8, `${hit}/${N}`);
});

test('假世界：把和邪恶撞了身份的真好人当成假恶魔', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = mk(ROLES8, seed);
    g.claims = { p3: 'sage' }; // 爪牙公开声明自己是贤者，真贤者是 8 号
    assert.equal(g.st.buildSnvWorld(g.get('p1')).demon, 'p8');
  }
});

test('假世界：假邪恶尽量是活人', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = mk(ROLES8, seed);
    g.get('p2').alive = false;
    assert.notEqual(g.st.buildSnvWorld(g.get('p1')).demon, 'p2');
  }
});

test('亡骨魔选边：善良领先多半毒拿信息的，邪恶领先多半毒不拿信息的', () => {
  const g = mk(['oracle', 'vigormortis', 'witch', 'artist', 'sage', 'klutz', 'mutant', 'savant']);
  const witch = g.get('p3');
  assert.equal(g.nearestTownsfolk(witch, -1)?.role, 'oracle');
  assert.equal(g.nearestTownsfolk(witch, 1)?.role, 'artist');
  const share = (b) => {
    g.st.balance = () => b;
    let k = 0;
    for (let i = 0; i < 400; i++) if (g.st.vigSide(witch) === -1) k++;
    return k / 400;
  };
  assert.ok(share(0.5) > 0.6, `善良领先时毒信息位 ${share(0.5)}`);
  assert.ok(share(-0.5) < 0.4, `邪恶领先时毒信息位 ${share(-0.5)}`);
  const even = share(0);
  assert.ok(even > 0.4 && even < 0.6, `势均力敌 ${even}`);
});

test('假数字：数学家说 0 或 1，但不能碰巧说对', () => {
  const g = mk(['mathematician', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage']);
  const p = g.get('p1');
  for (let i = 0; i < 30; i++) {
    assert.ok([0, 1].includes(g.st.fakeNumber(p, 3, { min: 0, max: 8 })));
    assert.equal(g.st.fakeNumber(p, 0, { min: 0, max: 8 }), 1);
    assert.equal(g.st.fakeNumber(p, 1, { min: 0, max: 8 }), 0);
  }
});

test('旧存档读回来也能公开声明（线上进行中的局没有 claims 字段）', () => {
  const g = mk();
  g.startNight(); g.resolveNight(); g.dawn?.();
  const old = JSON.parse(JSON.stringify(g.toJSON()));
  delete old.claims;
  const back = Game.fromJSON(old);
  back.declare('p1', 'oracle');
  assert.equal(back.claims.p1, 'oracle');
});

/** 随机打一局。 */
function play(seed) {
  const rng = makeRng(seed);
  const n = 7 + Math.floor(rng() * 9);
  const g = new Game(players(n), { roles: rollSNV(n, rng), rng: makeRng(seed + 1), script: 'snv' });
  for (let round = 0; round < 6 && !g.winner; round++) {
    g.startNight();
    for (const pr of g.nightPrompts()) {
      const opts = [...(pr.options ?? [])]; const targets = [];
      while (targets.length < (pr.count ?? 0) && opts.length) targets.push(opts.splice(Math.floor(rng() * opts.length), 1)[0]);
      try { g.submitChoice(pr.playerId, targets.length === pr.count ? targets : [], { role: pr.roleOptions?.[0] }); } catch { /* 随机选到了不合法的 */ }
    }
    g.resolveNight();
    if (g.winner) break;
    g.dawn?.();
    if (g.winner) break;
    const a = g.alive();
    if (rng() < 0.7) g.execute(a[Math.floor(rng() * a.length)]);
    if (g.winner) break;
    g.endDay();
  }
  return g;
}

test('官方硬规则：涡流在场，镇民的信息一条都不能对（查 200 局的决策日志）', () => {
  let must = 0;
  for (let seed = 1; seed <= 200; seed++) {
    let g;
    try { g = play(seed * 4099); } catch { continue; }
    for (const d of g.st.decisions) {
      if (d.mode !== 'must' || d.truth === undefined) continue;
      must++;
      assert.notEqual(d.chosen, d.truth, `种子 ${seed * 4099} ${d.kind} ${d.role}`);
    }
  }
  assert.ok(must > 0, '这批对局里没碰到涡流，这条没测到东西');
});

test('假世界不换：一局里每个失效的人只有一套，涡流全镇共用一套', () => {
  let worlds = 0;
  for (let seed = 1; seed <= 200; seed++) {
    let g;
    try { g = play(seed * 8191); } catch { continue; }
    const who = g.st.decisions.filter((d) => d.kind === 'world').map((d) => d.who);
    worlds += who.length;
    assert.equal(new Set(who).size, who.length, `种子 ${seed * 8191}：${who}`);
  }
  assert.ok(worlds > 0);
});
