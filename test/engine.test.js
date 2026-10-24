import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { ROLES, DISTRIBUTION } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, opts = {}) => new Game(players(roles.length), { roles, rng: makeRng(1), misregister: 0, ...opts });

test('角色分配符合人数表（男爵 +2 外来者）', () => {
  const rng = makeRng(42);
  for (let n = 5; n <= 15; n++) {
    for (let k = 0; k < 50; k++) {
      const roles = rollRoles(n, rng);
      const count = (t) => roles.filter((r) => ROLES[r].team === t).length;
      const [t, o, m, d] = DISTRIBUTION[n];
      const baron = roles.includes('baron') ? 2 : 0;
      assert.equal(roles.length, n);
      assert.equal(new Set(roles).size, n, '角色不重复');
      assert.deepEqual([count('townsfolk'), count('outsider'), count('minion'), count('demon')], [t - baron, o + baron, m, d]);
    }
  }
});

test('酒鬼以为自己是不在场的镇民；伪装不含在场角色', () => {
  const g = mk(['drunk', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'saint']);
  const drunk = g.get('p1');
  assert.equal(ROLES[drunk.shownRole].team, 'townsfolk');
  assert.ok(!['chef', 'empath', 'monk'].includes(drunk.shownRole));
  assert.equal(g.bluffs.length, 3);
  for (const b of g.bluffs) assert.ok(!g.players.some((p) => p.role === b) && b !== drunk.shownRole);
});

test('首夜：7 人以上爪牙和恶魔互认；厨师与共情者信息正确', () => {
  // 座位：1 厨师 2 小恶魔 3 投毒者 4 共情者 5 士兵 6 镇长 7 圣徒
  const g = mk(['chef', 'imp', 'poisoner', 'empath', 'soldier', 'mayor', 'saint']);
  g.startNight();
  const evil = g.evilMessages; // 互认在第一夜一开始就发（投毒者选人之前）
  g.submitChoice('p3', ['p6']); // 投毒镇长，不影响厨师/共情者
  const messages = [...evil, ...g.resolveNight().messages];
  const msg = (id) => messages.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
  assert.match(msg('p3'), /恶魔是 \*\*2号/);
  assert.match(msg('p2'), /爪牙：\*\*3号/);
  assert.match(msg('p1'), /\*\*1\*\* 对/);   // 2-3 相邻
  assert.match(msg('p4'), /\*\*1\*\* 名/);   // 邻座 3(邪) 5(善)
});

test('中毒的共情者得到错误信息', () => {
  const g = mk(['chef', 'imp', 'poisoner', 'empath', 'soldier', 'mayor', 'saint']);
  g.startNight();
  g.submitChoice('p3', ['p4']);
  const { messages } = g.resolveNight();
  const empath = messages.find((m) => m.playerId === 'p4').text;
  assert.doesNotMatch(empath, /\*\*1\*\* 名/);
});

test('小恶魔杀人；僧侣保护；士兵免疫', () => {
  const g = mk(['monk', 'imp', 'poisoner', 'empath', 'soldier', 'chef', 'saint']);
  g.startNight(); g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  g.submitChoice('p3', ['p7']);
  g.submitChoice('p1', ['p4']);   // 僧侣保护共情者
  g.submitChoice('p2', ['p4']);   // 小恶魔刀共情者
  g.resolveNight();
  assert.equal(g.dawn().deaths.length, 0);
  g.endDay();
  g.startNight();
  g.submitChoice('p3', ['p7']);
  g.submitChoice('p1', ['p4']);
  g.submitChoice('p2', ['p5']);   // 刀士兵
  g.resolveNight();
  assert.equal(g.dawn().deaths.length, 0);
  g.endDay();
  g.startNight();
  g.submitChoice('p3', ['p5']);   // 毒士兵
  g.submitChoice('p1', ['p4']);
  g.submitChoice('p2', ['p5']);
  g.resolveNight();
  assert.deepEqual(g.dawn().deaths, ['p5']);
});

test('小恶魔自刀传位给爪牙（优先红唇女郎）', () => {
  const g = mk(['imp', 'poisoner', 'scarletwoman', 'chef', 'empath', 'monk', 'saint', 'soldier', 'mayor', 'butler']);
  g.startNight(); g.submitChoice('p2', ['p4']); g.submitChoice('p10', ['p4']); g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  g.submitChoice('p1', ['p1']);
  const { messages } = g.resolveNight();
  assert.equal(g.get('p1').alive, false);
  assert.equal(g.get('p3').role, 'imp');
  assert.ok(messages.some((m) => m.playerId === 'p3' && /你现在是小恶魔/.test(m.text)));
  assert.equal(g.winner, null);
});

test('处决恶魔：5 人以上存活时红唇女郎接任，否则善良获胜', () => {
  const g = mk(['imp', 'scarletwoman', 'chef', 'empath', 'monk', 'saint', 'soldier']);
  g.startNight(); g.resolveNight(); g.dawn();
  g.nominate('p3', 'p1');
  g.recordVote('p1', ['p3', 'p4', 'p5', 'p6']);
  g.endDay();
  assert.equal(g.get('p2').role, 'imp');
  assert.equal(g.winner, null);

  const h = mk(['imp', 'poisoner', 'chef', 'empath', 'monk']);
  h.startNight(); h.submitChoice('p2', ['p3']); h.resolveNight(); h.dawn();
  h.nominate('p3', 'p1');
  h.recordVote('p1', ['p3', 'p4', 'p5']);
  h.endDay();
  assert.equal(h.winner, 'good');
});

test('投票：门槛、平票、幽灵票', () => {
  const g = mk(['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
  g.startNight(); g.submitChoice('p2', ['p3']); g.resolveNight(); g.dawn();
  g.stKill('p6');
  assert.equal(g.threshold(), 3); // 5 人存活
  g.nominate('p3', 'p1');
  assert.equal(g.recordVote('p1', ['p3', 'p4', 'p6']).outcome, 'block');
  assert.equal(g.get('p6').ghostVote, false);
  assert.equal(g.canVote('p6'), false);
  g.nominate('p4', 'p2');
  assert.equal(g.recordVote('p2', ['p3', 'p4', 'p5', 'p6']).outcome, 'tie'); // p6 已无票 → 3 票平
  assert.equal(g.block, null);
  assert.equal(g.endDay().executed, null);
  assert.deepEqual(g.voteOrder('p2'), ['p3', 'p4', 'p5', 'p6', 'p1', 'p2']);
});

test('贞洁者：镇民提名立即被处决；圣徒被处决则邪恶获胜', () => {
  const g = mk(['virgin', 'imp', 'poisoner', 'chef', 'saint', 'empath', 'monk']);
  g.startNight(); g.submitChoice('p3', ['p7']); g.resolveNight(); g.dawn();
  const r = g.nominate('p4', 'p1');
  assert.equal(r.virgin, true);
  assert.equal(g.get('p4').alive, false);
  assert.throws(() => g.nominate('p6', 'p5'), /已经处决/);

  const s = mk(['saint', 'imp', 'poisoner', 'chef', 'empath']);
  s.startNight(); s.submitChoice('p3', ['p4']); s.resolveNight(); s.dawn();
  s.nominate('p4', 'p1'); s.recordVote('p1', ['p2', 'p3', 'p4']); s.endDay();
  assert.equal(s.winner, 'evil');
});

test('猎手命中恶魔；只剩两人时邪恶获胜', () => {
  const g = mk(['slayer', 'imp', 'poisoner', 'chef', 'empath']);
  g.startNight(); g.submitChoice('p3', ['p4']); g.resolveNight(); g.dawn();
  assert.equal(g.slay('p4', 'p2').hit, false); // 假猎手
  assert.equal(g.slay('p1', 'p2').hit, true);
  assert.equal(g.winner, 'good');

  const e = mk(['chef', 'imp', 'poisoner', 'empath', 'monk']);
  e.startNight(); e.submitChoice('p3', ['p1']); e.resolveNight(); e.dawn();
  e.stKill('p4'); e.stKill('p5');
  assert.equal(e.winner, null);
  e.stKill('p1');
  assert.equal(e.winner, 'evil');
});

test('守鸦人夜里死后得知角色；送葬者得知被处决者', () => {
  const g = mk(['ravenkeeper', 'imp', 'poisoner', 'undertaker', 'empath', 'chef', 'monk']);
  g.startNight(); g.submitChoice('p3', ['p5']); g.resolveNight(); g.dawn();
  g.nominate('p4', 'p6'); g.recordVote('p6', ['p1', 'p2', 'p3', 'p4']); g.endDay();
  g.startNight();
  g.submitChoice('p3', ['p5']); g.submitChoice('p7', ['p5']); g.submitChoice('p2', ['p1']);
  const res = g.resolveNight();
  assert.equal(res.ravenkeeper, 'p1');
  assert.match(res.messages.find((m) => m.playerId === 'p4').text, /厨师/);
  assert.match(g.resolveRavenkeeper('p2').text, /小恶魔/);
});

test('镇长：三人存活且无人处决，善良获胜', () => {
  const g = mk(['mayor', 'imp', 'poisoner', 'chef', 'empath']);
  g.startNight(); g.submitChoice('p3', ['p4']); g.resolveNight(); g.dawn();
  g.stKill('p4'); g.stKill('p5');
  g.endDay();
  assert.equal(g.winner, 'good');
});

test('随机整局模拟不会崩溃且最终分出胜负', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = makeRng(seed);
    const n = 5 + (seed % 11);
    const g = new Game(players(n), { rng });
    let guard = 0;
    while (!g.winner && guard++ < 40) {
      g.startNight();
      for (const id of g.missingChoices()) g.autoChoose(id);
      const res = g.resolveNight();
      if (res.ravenkeeper) g.resolveRavenkeeper(g.players[0].id);
      g.dawn();
      if (g.winner) break;
      const alive = g.alive();
      const a = alive[Math.floor(rng() * alive.length)];
      const b = g.players[Math.floor(rng() * n)];
      const r = g.nominate(a.id, b.id);
      if (!r.virgin) g.recordVote(b.id, g.players.filter(() => rng() < 0.7).map((p) => p.id));
      g.endDay();
    }
    assert.ok(g.winner, `seed ${seed} 没有分出胜负`);
  }
});

test('管家：主人没举手时，管家的票不算', () => {
  // 1 管家 2 小恶魔 3 投毒者 4 共情者 5 厨师
  const g = mk(['butler', 'imp', 'poisoner', 'empath', 'chef']);
  g.startNight();
  g.submitChoice('p1', ['p4']);   // 主人：共情者
  g.submitChoice('p3', ['p5']);
  g.resolveNight(); g.dawn();
  g.nominate('p4', 'p2');
  assert.equal(g.recordVote('p2', ['p1', 'p5']).count, 1, '主人没举手');
  g.nominate('p5', 'p3');
  assert.equal(g.recordVote('p3', ['p1', 'p4']).count, 2, '主人举手了');
});

test('自动说书人：酒鬼拿到假信息，并记进说书人手记', () => {
  const g = new Game(players(7), { roles: ['drunk', 'imp', 'poisoner', 'empath', 'soldier', 'mayor', 'saint'], rng: makeRng(3) });
  g.setShownRole('p1', 'chef');
  g.startNight();
  g.submitChoice('p3', ['p6']);
  const { messages } = g.resolveNight();
  assert.doesNotMatch(messages.find((m) => m.playerId === 'p1').text, /\*\*1\*\* 对/, '真实是 1 对');
  assert.ok(g.journal.some((j) => /酒鬼/.test(j.text)), '手记里有这条判定');
  assert.ok(g.journal.some((j) => /红鲱鱼/.test(j.text)), '开局定了红鲱鱼');
});
