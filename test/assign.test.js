import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoles } from '../src/engine/assign.js';
import { ROLES, DISTRIBUTION } from '../src/engine/roles.js';
import { makeRng } from '../src/engine/game.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const teams = (roles) => ['townsfolk', 'outsider', 'minion', 'demon'].map((t) => roles.filter((r) => ROLES[r].team === t).length);

test('房主指定角色：指定的座位照指定，其余按人数表补齐、不重复', () => {
  const rng = makeRng(7);
  for (let k = 0; k < 200; k++) {
    const seats = ids(8);
    const roles = buildRoles(seats, { p1: 'imp', p2: 'fortuneteller', p5: 'poisoner' }, 'tb', rng);
    assert.equal(roles[0], 'imp'); assert.equal(roles[1], 'fortuneteller'); assert.equal(roles[4], 'poisoner');
    assert.equal(new Set(roles).size, 8, '不重复');
    assert.ok(roles.every((r) => ROLES[r].script === 'tb'));
    assert.deepEqual(teams(roles), DISTRIBUTION[8]);
  }
});

test('指定男爵：自动 +2 外来者；指定教父（黯月初升）：外来者 ±1', () => {
  const rng = makeRng(3);
  const [t, o, m, d] = DISTRIBUTION[9];
  assert.deepEqual(teams(buildRoles(ids(9), { p3: 'baron' }, 'tb', rng)), [t - 2, o + 2, m, d]);
  for (let k = 0; k < 50; k++) {
    const [tt, oo] = teams(buildRoles(ids(9), { p3: 'godfather' }, 'bmr', rng));
    assert.ok((tt === t - 1 && oo === o + 1) || (tt === t + 1 && oo === o - 1));
  }
});

test('房主指定得比人数表多（两个爪牙进 7 人局）：以房主为准，少补镇民；别的剧本的角色、重复的角色不认', () => {
  const rng = makeRng(5);
  const roles = buildRoles(ids(7), { p1: 'poisoner', p2: 'spy', p3: 'po', p4: 'poisoner' }, 'tb', rng);
  assert.equal(roles.length, 7);
  assert.equal(roles[0], 'poisoner'); assert.equal(roles[1], 'spy');
  assert.notEqual(roles[2], 'po', '暗流涌动里没有珀');
  assert.equal(roles.filter((r) => r === 'poisoner').length, 1);
  assert.ok(roles.includes('imp'), '没指定恶魔就随机一个');
  assert.equal(new Set(roles).size, 7);
});

test('新手：难角色大概率换成老玩家手里更简单的同阵营角色；当邪恶（恶魔、爪牙）的概率调低；房主指定的不动', async () => {
  const { easeNewbies, ROLE_DIFFICULTY } = await import('../src/engine/assign.js');
  const { ROLES } = await import('../src/engine/roles.js');
  const evil = (r) => ['minion', 'demon'].includes(ROLES[r].team);
  const seats = ['n1', 'a', 'b', 'c', 'd', 'e', 'f'];
  const roles = ['drunk', 'butler', 'chef', 'empath', 'spy', 'poisoner', 'imp'];
  let moved = 0;
  for (let k = 0; k < 200; k++) {
    const out = easeNewbies(seats, roles, new Set(['n1']), 'tb');
    assert.deepEqual([...out].sort(), [...roles].sort(), '还是这些角色');
    assert.ok(!evil(out[0]), '善良的新手不会被换成邪恶');
    if (ROLE_DIFFICULTY.tb[out[0]] < 3) moved++;
  }
  assert.ok(moved > 140 && moved < 200, `难角色大概率换走（${moved}/200）`);
  // 新手拿到小恶魔 / 爪牙：大概率换成老玩家的善良角色
  for (const start of ['imp', 'poisoner']) {
    let stillEvil = 0;
    const r2 = [start, ...roles.filter((r) => r !== start)];
    for (let k = 0; k < 400; k++) if (evil(easeNewbies(seats, r2, new Set(['n1']), 'tb')[0])) stillEvil++;
    assert.ok(stillEvil > 80 && stillEvil < 240, `${start}：还是邪恶的 ${stillEvil}/400（调低了，但不是零）`);
  }
  const fixed = easeNewbies(seats, roles, new Set(['n1']), 'tb', { fixed: new Set(['n1']), ease: 1 });
  assert.equal(fixed[0], 'drunk', '房主指定的不动');
  const noVet = easeNewbies(['n1', 'n2'], ['drunk', 'recluse'], new Set(['n1', 'n2']), 'tb', { ease: 1 });
  assert.deepEqual(noVet, ['drunk', 'recluse'], '没有能换的就不换');
});

test('推荐配置：每一套都符合官方人数表（男爵 +2 外来者、教父 ±1 外来者），角色不重复，酒鬼以为的是不在场的镇民', async () => {
  const { SETUPS } = await import('../src/shared/setups.js');
  const { ROLES, DISTRIBUTION } = await import('../src/engine/roles.js');
  for (const sc of ['tb', 'bmr']) {
    for (const s of SETUPS[sc]) {
      const n = s.roles.length;
      assert.ok(DISTRIBUTION[n], `${s.name}：${n} 人`);
      assert.ok(s.roles.every((r) => ROLES[r] && (ROLES[r].script ?? 'tb') === sc), `${s.name}：角色都在这个剧本里`);
      assert.equal(new Set(s.roles).size, n, `${s.name}：角色不重复`);
      let [t, o, m, d] = DISTRIBUTION[n];
      const c = (team) => s.roles.filter((r) => ROLES[r].team === team).length;
      if (sc === 'tb' && s.roles.includes('baron')) { t -= 2; o += 2; }
      assert.equal(c('minion'), m, `${s.name}：爪牙`);
      assert.equal(c('demon'), d, `${s.name}：恶魔`);
      if (sc === 'bmr' && s.roles.includes('godfather')) assert.equal(Math.abs(c('outsider') - o), 1, `${s.name}：教父 ±1 外来者`);
      else assert.deepEqual([c('townsfolk'), c('outsider')], [t, o], `${s.name}：镇民 / 外来者`);
      if (s.drunkAs) {
        assert.ok(s.roles.includes('drunk'), `${s.name}：有酒鬼`);
        assert.equal(ROLES[s.drunkAs].team, 'townsfolk');
        assert.ok(!s.roles.includes(s.drunkAs), `${s.name}：酒鬼以为的镇民不在场`);
      }
    }
  }
});
