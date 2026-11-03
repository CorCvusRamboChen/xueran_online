// 世界枚举：worlds.js 和引擎是两份逻辑，这里用真实对局把它们绑在一起。
// 最重要的一条：随机跑真实对局，真实世界必须一直留在枚举结果里。规则写错了，真实世界就会被排除掉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { enumerate, viewOf, isRealWorld, rankFalseInfo, recommend, stateKey } from '../src/engine/worlds.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));

/** 跑一局随机对局，每天亮时调 onDawn。恶魔换过人的局面原型不保证，跳过。 */
function play(seed, onDawn) {
  const rng = makeRng(seed);
  const n = 5 + Math.floor(rng() * 11);
  const g = new Game(players(n), { roles: rollRoles(n, rng), rng: makeRng(seed + 1) });
  for (let round = 0; round < 8 && !g.winner; round++) {
    g.startNight();
    for (const pr of g.nightPrompts()) {
      const opts = [...pr.options]; const targets = [];
      while (targets.length < pr.count && opts.length) targets.push(opts.splice(Math.floor(rng() * opts.length), 1)[0]);
      g.submitChoice(pr.playerId, targets.length === pr.count ? targets : []);
    }
    const res = g.resolveNight();
    if (res.ravenkeeper) g.resolveRavenkeeper(g.alive()[0].id);
    if (g.winner) break;
    g.dawn();
    if (g.demon()?.id !== g.firstDemon) break;
    onDawn(g);
    if (rng() < 0.7) { const a = g.alive(); g.execute(a[Math.floor(rng() * a.length)]); }
    if (g.winner) break;
    g.endDay();
  }
}

test('世界枚举：120 局真实对局，真实世界每天都留在结果里', () => {
  let checks = 0;
  for (let seed = 1; seed <= 120; seed++) {
    play(seed * 7919, (g) => {
      const r = enumerate(viewOf(g), { isReal: isRealWorld(g) });
      checks++;
      assert.ok(r.foundReal, `种子 ${seed * 7919} 第 ${g.night} 夜，${g.players.length} 人：真实世界被排除了。配置：${g.players.map((p) => `${p.seat}${p.role}/${p.shownRole}`).join(' ')}`);
      assert.ok(Math.abs(Object.values(r.demon).reduce((a, b) => a + b, 0) - 1) < 1e-9, '恶魔概率加起来要是 1');
    });
  }
  assert.ok(checks > 120, `只检查了 ${checks} 次`);
});

test('世界加权：真实世界的权重不能是 0，说得通的世界一个都没少', () => {
  let checks = 0;
  for (let seed = 1; seed <= 60; seed++) {
    play(seed * 5281, (g) => {
      const view = viewOf(g);
      const flat = enumerate(view);
      const r = enumerate(view, { isReal: isRealWorld(g), weighted: true });
      checks++;
      assert.equal(r.count, flat.count);
      assert.ok(r.realWeight > 0, `种子 ${seed * 5281} 第 ${g.night} 夜：真实世界权重是 0`);
      assert.ok(Math.abs(Object.values(r.demon).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    });
  }
  assert.ok(checks > 60);
});

/** 7 人局固定配置：1 恶魔 1 爪牙，座位按 roles 顺序。 */
const fixed = (roles) => {
  const g = new Game(players(roles.length), { roles, rng: makeRng(5) });
  g.bluffs = ['slayer', 'mayor', 'ravenkeeper'];
  return g;
};
const ROLES7 = ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'];

test('世界枚举：信息越多，世界越少，矛盾的世界被排除', () => {
  const g = fixed(ROLES7);
  const claims = { p1: 'slayer', p3: 'mayor' };
  const all = enumerate(viewOf(g, { claims }));
  g.fact({ kind: 'night', alive: g.players.map((p) => p.id) });
  g.night = 1;
  g.facts = [{ night: 1, kind: 'empath', by: 'p2', around: ['p1', 'p3'], value: 2 }];
  const two = enumerate(viewOf(g, { claims }));
  assert.ok(two.count < all.count, `${all.count} → ${two.count}`);
  // 共情者说两边都是邪恶，但两边是不是邪恶要看他本人可不可信：他自己是邪恶的世界都还在，所以他的嫌疑上升
  assert.ok(two.evil.p2 > all.evil.p2);
});

test('世界加权：要靠投毒才说得通的世界，比自然说得通的世界轻', () => {
  const g = fixed(ROLES7);
  const claims = { p1: 'slayer', p3: 'mayor' };
  g.facts = [
    { night: 1, kind: 'night', alive: g.players.map((p) => p.id) },
    { night: 1, kind: 'empath', by: 'p2', around: ['p1', 'p3'], value: 2 },
  ];
  g.night = 1;
  const flat = enumerate(viewOf(g, { claims }));
  const heavy = enumerate(viewOf(g, { claims }), { weighted: true });
  // 共情者说两边都邪恶：等权时靠投毒或他本人邪恶才说得通的世界占多数，加权后这些世界轻了，两边真邪恶的世界重了
  assert.ok(heavy.evil.p1 > flat.evil.p1, `${flat.evil.p1} → ${heavy.evil.p1}`);
  assert.ok(heavy.evil.p3 > flat.evil.p3, `${flat.evil.p3} → ${heavy.evil.p3}`);
});

test('世界枚举：一晚两条信息都说不通时，不能都推给投毒', () => {
  const g = fixed(ROLES7);
  g.facts = [
    { night: 1, kind: 'night', alive: g.players.map((p) => p.id) },
    { night: 1, kind: 'chef', by: 'p4', value: 3 },
    { night: 1, kind: 'empath', by: 'p2', around: ['p1', 'p3'], value: 2 },
  ];
  const r = enumerate(viewOf(g));
  assert.ok(r.count > 0);
  // 7 人只有两个邪恶，相邻最多 1 对：两个厨师都报 3 对，投毒只能解释一个，另一个一定是邪恶（这局没有外来者名额，不会是酒鬼）
  g.facts.splice(2, 1, { night: 1, kind: 'chef', by: 'p7', value: 3 });
  const two = enumerate(viewOf(g));
  assert.ok(two.count > 0);
  assert.ok(two.evil.p4 + two.evil.p7 >= 1 - 1e-9, `${two.evil.p4} + ${two.evil.p7}`);
});

test('世界枚举：被处决后游戏还在继续，这个人只有红唇女郎在场时才可能是恶魔', () => {
  const g = fixed(ROLES7);
  g.facts = [{ night: 1, kind: 'executed', target: 'p5' }];
  const r = enumerate(viewOf(g));
  assert.ok(r.demon.p5 < enumerate(viewOf(fixed(ROLES7))).demon.p5);
});

test('假信息打分：给出的候选都有分数，真恶魔被怀疑的程度算得出来', () => {
  const g = fixed(ROLES7);
  g.facts = [{ night: 1, kind: 'night', alive: g.players.map((p) => p.id) }];
  g.night = 1;
  const ranked = rankFalseInfo(g, [0, 1, 2], (value) => ({ night: 1, kind: 'empath', by: 'p2', around: ['p1', 'p3'], value }));
  assert.equal(ranked.length, 3);
  assert.ok(ranked.every((x) => x.worlds > 0 && x.suspect >= 0 && x.suspect <= 1));
  assert.ok(ranked[0].score <= ranked[2].score);
});

test('查表：先查表，查不到再现算，人太多就退回原来的规则', () => {
  const key = { truth: 1, text: 'empath/1/L/1/even/poison' };
  const live = () => [{ value: 2 }];
  assert.deepEqual(recommend(key, [0, 2], { [key.text]: { '-1': 5, 1: 2 } }, live), { value: 0, from: 'table' });
  // 表里最多的答案这次不能用：换第二多的
  assert.deepEqual(recommend(key, [2], { [key.text]: { '-1': 5, 1: 2 } }, live), { value: 2, from: 'table' });
  assert.deepEqual(recommend(key, [0, 2], {}, live, { n: 10 }), { value: 2, from: 'live' });
  assert.equal(recommend(key, [0, 2], {}, live, { n: 15 }), null);
});

test('局面指纹：转圈坐是同一种局面，换了信息就不是', () => {
  const view = { n: 5, said: ['chef', 'imp', 'monk', 'empath', 'mayor'], info: [{ night: 1, kind: 'chef', by: 0, value: 1 }] };
  const turned = { n: 5, said: ['imp', 'monk', 'empath', 'mayor', 'chef'], info: [{ night: 1, kind: 'chef', by: 4, value: 1 }] };
  assert.equal(stateKey(view), stateKey(turned));
  assert.notEqual(stateKey(view), stateKey({ ...view, info: [{ night: 1, kind: 'chef', by: 0, value: 2 }] }));
});
