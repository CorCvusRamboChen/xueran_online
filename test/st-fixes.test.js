// 11-22 官网 AI 说书人页整理时查出来的几处：教父失效的假名单、旅行者阵营和骗人精看局势
import test from 'node:test';
import assert from 'node:assert/strict';
import { Storyteller } from '../src/engine/storyteller.js';
import { rolesOf } from '../src/engine/roles.js';

const fakeGame = () => ({ script: 'bmr', players: [], phase: 'night', night: 1, day: 0, name: (x) => x });

test('醉酒中毒的教父：假外来者名单一定和真的不一样（人数截到 0 或剧本上限时以前可能碰巧报真）', () => {
  const all = rolesOf('bmr', 'outsider');
  for (let seed = 0; seed < 200; seed++) {
    let s = seed + 1;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const st = new Storyteller(fakeGame(), rng);
    st.decide = () => {}; // 只测名单，不记决策日志（要整局的数据）
    const p = { id: 'gf' };
    for (const truth of [[], all, [all[0]], ['疯子']]) {
      const said = st.fakeOutsidersBMR(p, truth);
      const ids = truth.map((x) => (x === '疯子' ? 'lunatic' : x));
      assert.notEqual([...said].sort().join(), [...ids].sort().join(), `seed ${seed} truth ${truth}`);
      assert.ok(said.every((r) => all.includes(r)));
    }
  }
});

test('旅行者阵营、骗人精的骰子带上了局势（以前没传，权重不起作用）', async () => {
  const { chanceOf } = await import('../src/engine/dice.js');
  assert.ok(chanceOf('travellerEvil', { balance: 0.5 }) > chanceOf('travellerEvil', { balance: -0.5 }), '善良领先多给邪恶');
  assert.ok(chanceOf('fibbin', { balance: 0.5 }) > chanceOf('fibbin', { balance: -0.5 }));
});
