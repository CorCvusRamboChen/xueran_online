// 暗流涌动 22 个角色逐个过一遍：每个角色至少一条按官方规则口径的断言。
// misregister: 0 表示陌客/间谍从不错误登记，1 表示总是错误登记（排除说书人的随机判定）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng, rollRoles, rollTB, balancedTB, setupScoreTB, SMALL_INFO } from '../src/engine/game.js';
import { ROLES, TOWNSFOLK, OUTSIDERS, MINIONS } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, opts = {}) => new Game(players(roles.length), { roles, rng: makeRng(7), misregister: 0, ...opts });
const textOf = (messages, id) => messages.filter((m) => m.playerId === id).map((m) => m.text).join('\n');

/** 跑一晚：choices 是 {玩家: [目标]}，没给的就不选。 */
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  return g.resolveNight();
}
const covered = new Set();
const cover = (...roles) => roles.forEach((r) => covered.add(r));

test('洗衣妇：两人之一是某个镇民（真信息指向真的镇民）', () => {
  cover('washerwoman');
  const g = mk(['washerwoman', 'chef', 'imp', 'poisoner', 'saint']);
  const { messages } = night(g);
  const t = textOf(messages, 'p1');
  assert.match(t, /一人是 \*\*厨师\*\*/);
  assert.match(t, /2号/);
});

test('图书管理员：指出外来者；场上没有外来者时直接告知', () => {
  cover('librarian');
  const a = mk(['librarian', 'saint', 'imp', 'poisoner', 'chef']);
  const ta = textOf(night(a).messages, 'p1');
  assert.match(ta, /\*\*圣徒\*\*/);
  assert.match(ta, /2号/);
  const b = mk(['librarian', 'chef', 'imp', 'poisoner', 'monk']);
  assert.match(textOf(night(b).messages, 'p1'), /没有\*\*外来者/);
});

test('调查员：指出爪牙；间谍登记成善良时查不到他', () => {
  cover('investigator', 'spy');
  const a = mk(['investigator', 'chef', 'imp', 'poisoner', 'monk']);
  const ta = textOf(night(a).messages, 'p1');
  assert.match(ta, /\*\*投毒者\*\*/);
  assert.match(ta, /4号/);
  const b = mk(['investigator', 'chef', 'imp', 'spy', 'monk'], { misregister: 1 });
  assert.match(textOf(night(b).messages, 'p1'), /场上\*\*没有\*\*爪牙/);
});

test('间谍：每晚看到魔典', () => {
  cover('spy');
  const g = mk(['spy', 'chef', 'imp', 'empath', 'monk']);
  const t = textOf(night(g).messages, 'p1');
  assert.match(t, /魔典/);
  assert.match(t, /小恶魔/);
});

test('厨师 / 共情者：数字按座位算（首夜）', () => {
  cover('chef', 'empath');
  // 座位 1 共情者 2 小恶魔 3 投毒者 4 厨师 5 僧侣：邪恶相邻 1 对；共情者两侧（5 僧侣、2 小恶魔）1 个邪恶
  const g = mk(['empath', 'imp', 'poisoner', 'chef', 'monk']);
  const { messages } = night(g, { p3: ['p5'] });
  assert.match(textOf(messages, 'p4'), /\*\*1\*\* 对/);
  assert.match(textOf(messages, 'p1'), /\*\*1\*\* 名/);
});

test('占卜师：选中恶魔或红鲱鱼说"有"，否则"没有"', () => {
  cover('fortuneteller');
  const a = mk(['fortuneteller', 'chef', 'imp', 'poisoner', 'monk']);
  assert.match(textOf(night(a, { p1: ['p2', 'p3'] }).messages, 'p1'), /之中\*\*有\*\*恶魔/);
  const b = mk(['fortuneteller', 'chef', 'imp', 'poisoner', 'monk']);
  b.redHerring = 'p2';
  assert.match(textOf(night(b, { p1: ['p2', 'p4'] }).messages, 'p1'), /之中\*\*有\*\*恶魔/);
  const c = mk(['fortuneteller', 'chef', 'imp', 'poisoner', 'monk']);
  c.redHerring = 'p5';
  assert.match(textOf(night(c, { p1: ['p2', 'p4'] }).messages, 'p1'), /之中\*\*没有\*\*恶魔/);
});

test('送葬者：只在当天有人被处决的那晚得到信息', () => {
  cover('undertaker');
  const g = mk(['undertaker', 'chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  night(g);
  g.dawn();
  g.endDay(); // 第一天没人被处决
  assert.equal(textOf(night(g).messages, 'p1'), '');
  g.dawn();
  g.execute(g.get('p2'));
  assert.match(textOf(night(g).messages, 'p1'), /2号 玩家2 是 \*\*厨师\*\*/);
});

test('僧侣保护的人不会被恶魔杀死；第一夜僧侣和小恶魔都不醒', () => {
  cover('monk', 'imp');
  const g = mk(['monk', 'chef', 'imp', 'poisoner', 'empath']);
  const first = g.startNight();
  assert.ok(!first.some((x) => ['monk', 'imp'].includes(x.role)));
  g.resolveNight();
  g.dawn();
  night(g, { p1: ['p2'], p3: ['p2'] });
  assert.ok(g.get('p2').alive);
});

test('守鸦人：夜里被杀后可以查看任何人（包括已死的人）', () => {
  cover('ravenkeeper');
  const g = mk(['ravenkeeper', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  g.execute(g.get('p5'));
  const res = night(g, { p3: ['p1'] });
  assert.equal(res.ravenkeeper, 'p1');
  assert.match(g.resolveRavenkeeper('p5').text, /5号 玩家5 的角色是 \*\*僧侣\*\*/);
});

test('贞洁者：第一次被镇民提名时，提名者立即被处决；只触发一次', () => {
  cover('virgin');
  const g = mk(['virgin', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  assert.deepEqual(g.nominate('p2', 'p1'), { virgin: true, executed: 'p2' });
  assert.ok(!g.get('p2').alive);
  assert.ok(g.virginUsed);
});

test('猎手：只能开一枪，打中恶魔才会死', () => {
  cover('slayer');
  const g = mk(['slayer', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  assert.equal(g.slay('p1', 'p2').hit, false);
  assert.throws(() => g.slay('p1', 'p3'), /已经开过枪/); // 每人每局只能声称一次
  assert.ok(g.get('p3').alive);
});

test('小恶魔可以选已死的玩家（空刀）：今晚没人死；超时替他选时不会选死人', () => {
  const g = mk(['chef', 'empath', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  g.execute(g.get('p1'));
  g.startNight();
  assert.ok(g.nightPrompts().find((x) => x.playerId === 'p3').options.includes('p1'));
  g.submitChoice('p3', ['p1']);
  g.resolveNight();
  assert.deepEqual(g.nightDeaths, []);
  assert.equal(g.alive().length, 4);
  g.dawn();
  g.startNight();
  g.autoChoose('p3');
  assert.ok(g.get(g.choices.p3[0]).alive);
});

test('士兵不会被恶魔杀死', () => {
  cover('soldier');
  const g = mk(['soldier', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  night(g, { p3: ['p1'], p4: ['p2'] });
  assert.ok(g.get('p1').alive);
});

test('镇长：只剩三人且当天无人被处决，善良获胜', () => {
  cover('mayor');
  const g = mk(['mayor', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  g.stKill('p2');
  g.stKill('p4');
  g.endDay();
  assert.equal(g.winner, 'good');
});

test('管家：每晚要选主人；主人没举手时违规的票照算（官方）', () => {
  cover('butler');
  const g = mk(['butler', 'chef', 'imp', 'poisoner', 'monk']);
  night(g, { p1: ['p2'] });
  g.dawn();
  assert.equal(g.recordVote('p3', ['p1']).count, 1, '违规票照算');
  assert.equal(g.recordVote('p4', ['p1', 'p2']).count, 2);
});

test('酒鬼：以为自己是一个不在场的镇民，按那个角色醒来', () => {
  cover('drunk');
  const g = mk(['drunk', 'chef', 'imp', 'poisoner', 'monk']);
  const p = g.get('p1');
  assert.ok(TOWNSFOLK.includes(p.shownRole));
  assert.ok(g.broken(p));
  assert.match(g.grimoire(), /以为自己是/);
});

test('陌客：可能被登记成邪恶（共情者会把他算进去）', () => {
  cover('recluse');
  const roles = ['empath', 'recluse', 'imp', 'poisoner', 'chef'];
  assert.match(textOf(night(mk(roles, { misregister: 0 })).messages, 'p1'), /\*\*0\*\* 名/);
  assert.match(textOf(night(mk(roles, { misregister: 1 })).messages, 'p1'), /\*\*1\*\* 名/);
});

test('圣徒被处决，邪恶获胜', () => {
  cover('saint');
  const g = mk(['saint', 'chef', 'imp', 'poisoner', 'monk']);
  night(g);
  g.dawn();
  g.execute(g.get('p1'));
  assert.equal(g.winner, 'evil');
});

test('投毒者：中毒的人信息失效；投毒者一死，中毒立刻解除', () => {
  cover('poisoner');
  const g = mk(['empath', 'chef', 'imp', 'poisoner', 'monk']);
  night(g, { p4: ['p1'] });
  assert.ok(g.isPoisoned(g.get('p1')));
  g.dawn();
  g.execute(g.get('p4'));
  assert.ok(!g.isPoisoned(g.get('p1')));
});

test('红唇女郎：恶魔死时还有 5 人以上存活，她接任恶魔', () => {
  cover('scarletwoman');
  const g = mk(['scarletwoman', 'chef', 'imp', 'empath', 'monk']);
  night(g);
  g.dawn();
  g.execute(g.get('p3'));
  assert.equal(g.get('p1').role, 'imp');
  assert.equal(g.winner, null);
});

test('男爵：多两个外来者（少两个镇民）', () => {
  cover('baron');
  const rng = makeRng(3);
  for (let k = 0; k < 200; k++) {
    const g = new Game(players(10), { rng });
    if (!g.players.some((p) => p.role === 'baron')) continue;
    assert.equal(g.players.filter((p) => ROLES[p.role].team === 'outsider').length, 2);
    return;
  }
  assert.fail('200 局都没抽到男爵');
});

test('小恶魔自刀：爪牙接任', () => {
  cover('imp');
  const g = mk(['poisoner', 'chef', 'imp', 'empath', 'monk']);
  night(g);
  g.dawn();
  night(g, { p3: ['p3'], p1: ['p2'] });
  assert.equal(g.get('p1').role, 'imp');
});

test('复盘时间线：开局、死亡、提名、投票都有记录，存档读档后保留', () => {
  const g = mk(['empath', 'chef', 'imp', 'poisoner', 'monk']);
  night(g, { p4: ['p1'] });
  g.dawn();
  g.nominate('p1', 'p3');
  g.recordVote('p3', ['p1', 'p2', 'p5']);
  g.endDay();
  const kinds = new Set(g.timeline.map((e) => e.kind));
  for (const k of ['setup', 'nominate', 'vote', 'death', 'end']) assert.ok(kinds.has(k), `缺少 ${k}`);
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(back.timeline, g.timeline);
  assert.equal(back.winner, 'good');
  assert.ok(back.nominees.has('p3'));
});

test('22 个角色都有测试覆盖', () => {
  const all = [...TOWNSFOLK, ...OUTSIDERS, ...MINIONS, 'imp'];
  assert.equal(all.length, 22);
  assert.deepEqual(all.filter((r) => !covered.has(r)), []);
});

test('说书人：酒鬼共情者每晚的假数字按同一套假世界给，前后对得上', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Game(players(7), { roles: ['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'mayor', 'saint'], rng: makeRng(seed), misregister: 0 });
    g.setShownRole('p1', 'empath');
    const answers = [];
    for (let n = 0; n < 3; n++) {
      const { messages } = night(g);
      answers.push(textOf(messages, 'p1'));
      g.dawn();
    }
    // 邻座没人死，假世界不变 → 三晚答案一样；第一晚一定和真相不同（真相：p2 小恶魔 + p7 圣徒 = 1）
    assert.equal(new Set(answers).size, 1, `种子 ${seed}：三晚答案应该一致`);
    assert.doesNotMatch(answers[0], /\*\*1\*\* 名/, `种子 ${seed}：第一晚应该是假信息`);
    assert.ok(g.journal.some((j) => /假世界/.test(j.text)), '手记里记了假世界');
  }
});

test('说书人：陌客一晚上最多被错误登记两次', () => {
  const g = new Game(players(7), { roles: ['recluse', 'imp', 'poisoner', 'chef', 'soldier', 'mayor', 'saint'], rng: makeRng(5) });
  g.startNight();
  g.suspicion.p2 = 99; // 让局势偏向善良，错误登记的概率最高
  let n = 0;
  for (let k = 0; k < 20; k++) if (g.misreg(g.get('p1'), '测试')) n++;
  assert.ok(n <= 2, `一晚错误登记了 ${n} 次`);
});

test('邪恶互认（官方）：7 人及以上第一夜互认；传位后爪牙不会得知新恶魔；伪装只给开局恶魔，可分享给爪牙', () => {
  const g = mk(['poisoner', 'spy', 'imp', 'empath', 'monk', 'chef', 'soldier']);
  assert.equal(g.evilKnown, null);
  night(g);
  assert.deepEqual(g.evilKnown.p1, [{ id: 'p2', team: '爪牙' }, { id: 'p3', team: '恶魔' }]);
  assert.deepEqual(g.evilKnown.p3, [{ id: 'p1', team: '爪牙' }, { id: 'p2', team: '爪牙' }]);
  assert.equal(g.evilKnown.p4, undefined);
  assert.throws(() => g.shareBluffs('p1'));
  g.shareBluffs('p3');
  assert.equal(g.bluffsShared, true);
  g.dawn();
  night(g, { p3: ['p3'], p1: ['p4'] });
  const heir = g.players.find((p) => p.alive && p.role === 'imp');
  assert.ok(heir);
  // 互认结果停在第一夜：另一个爪牙看到的仍是原来的恶魔
  const other = heir.id === 'p1' ? 'p2' : 'p1';
  assert.deepEqual(g.evilKnown[other].find((a) => a.team === '恶魔').id, 'p3');
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(back.evilKnown, g.evilKnown);
  assert.equal(back.bluffsShared, true);
});

test('邪恶互认（官方）：6 人及以下不互认、不发伪装；房规可以打开', () => {
  const g = mk(['poisoner', 'imp', 'empath', 'monk', 'chef', 'soldier']);
  const m = night(g);
  assert.equal(g.evilKnown, null);
  assert.equal(textOf(m.messages, 'p2'), '');
  const h = mk(['poisoner', 'imp', 'empath', 'monk', 'chef', 'soldier'], { evilInfo: true });
  h.startNight();
  // 第一夜一开始（投毒者选人之前）就知道恶魔是谁
  assert.deepEqual(h.evilKnown.p1, [{ id: 'p2', team: '恶魔' }]);
  assert.match(textOf(h.evilMessages, 'p1'), /恶魔是/);
  assert.match(textOf(h.evilMessages, 'p2'), /伪装/);
});

test('投票门槛（官方）：存活人数的一半向上取整；3 人存活 2 票就上台，和台上同票则平票清空', () => {
  const g = mk(['chef', 'imp', 'poisoner', 'empath', 'soldier']);
  night(g);
  g.dawn();
  for (const id of ['p4', 'p5']) g.get(id).alive = false;
  assert.equal(g.aliveCount(), 3);
  assert.equal(g.threshold(), 2);
  g.nominate('p1', 'p2');
  assert.equal(g.recordVote('p2', ['p1', 'p4']).outcome, 'block'); // 活人 + 死人的幽灵票
  g.nominate('p3', 'p1');
  assert.equal(g.recordVote('p1', ['p3', 'p5']).outcome, 'tie');
  assert.equal(g.block, null);
});

test('房规「夜里死了仍拿信息」：被小恶魔杀死的共情者照样拿当晚的信息（按醉酒，真假由说书人定）；不开就没有', () => {
  for (const on of [false, true]) {
    const g = mk(['empath', 'chef', 'imp', 'poisoner', 'monk'], { deadDrunk: on });
    g.st.deadLies = () => false;
    night(g); g.dawn();
    const { messages } = night(g, { p3: ['p1'], p4: ['p5'], p5: ['p2'] });
    assert.equal(g.get('p1').alive, false);
    const t = textOf(messages, 'p1');
    if (on) { assert.match(t, /存活邻座中有 \*\*\d\*\*/); assert.match(t, /按房规/); } else assert.equal(t, '');
  }
  // 说书人判"给假的"：数字和真实不同
  const g = mk(['empath', 'chef', 'imp', 'poisoner', 'monk'], { deadDrunk: true });
  night(g); g.dawn();
  const truth = g.empathInfo(g.get('p1'), false);
  g.st.deadLies = () => true;
  const { messages } = night(g, { p3: ['p1'], p4: ['p5'], p5: ['p2'] });
  assert.ok(!textOf(messages, 'p1').includes(`**${truth}**`), '给的是假数字');
});

test('AI 配板（暗流涌动 12 人及以下）：共情者+占卜师少同时出现，F4 多半 1–2 个，有男爵多半有图书管理员', () => {
  const stats = (f) => {
    let both = 0; let f12 = 0; let baron = 0; let baronLib = 0; const N = 3000;
    for (let s = 1; s <= N; s++) {
      const r = f(makeRng(s * 7 + 3));
      if (r.includes('empath') && r.includes('fortuneteller')) both++;
      const k = r.filter((x) => SMALL_INFO.includes(x)).length; if (k >= 1 && k <= 2) f12++;
      if (r.includes('baron')) { baron++; if (r.includes('librarian')) baronLib++; }
    }
    return { both: both / N, f12: f12 / N, lib: baronLib / Math.max(1, baron) };
  };
  const pure = stats((rng) => rollRoles(10, rng));
  const ai = stats((rng) => rollTB(10, rng));
  assert.ok(ai.both < pure.both * 0.6, `共情者+占卜师同时出现 ${ai.both} vs 纯随机 ${pure.both}`);
  assert.ok(ai.both > 0, '不是完全不出');
  assert.ok(ai.f12 > 0.85, `F4 为 1–2 个的比例 ${ai.f12}`);
  assert.ok(ai.lib > 0.65 && ai.lib < 1, `有男爵时有图书管理员 ${ai.lib}`);
  // 13 人以上照常随机
  assert.deepEqual(rollTB(13, makeRng(5)), rollRoles(13, makeRng(5)));
});

test('AI 配板（暗流涌动）：强神打强神、弱神打弱神——挑的那套平衡分落在纯随机分布的中间段', () => {
  const pure = Array.from({ length: 2000 }, (_, k) => setupScoreTB(rollTB(9, makeRng(k + 11)))).sort((a, b) => a - b);
  const [p10, p90] = [pure[200], pure[1800]];
  for (let seed = 1; seed < 60; seed++) {
    const r = balancedTB(9, makeRng(seed));
    assert.equal(r.length, 9);
    const sc = setupScoreTB(r);
    assert.ok(sc >= p10 && sc <= p90, `平衡分 ${sc} 不在 [${p10}, ${p90}]`);
  }
});

test('官方：夜里要选人的能力不能空过；小恶魔想空刀就选一名死人，今晚没人死', () => {
  const g = mk(['fortuneteller', 'butler', 'imp', 'poisoner', 'chef', 'monk']);
  g.startNight();
  for (const id of ['p1', 'p2', 'p4']) assert.throws(() => g.submitChoice(id, []), /需要选择/);
  g.submitChoice('p1', ['p5', 'p6']); g.submitChoice('p2', ['p5']); g.submitChoice('p4', ['p5']);
  g.resolveNight();
  g.dawn(); g.execute(g.get('p5')); g.endDay(); // 5 号死了
  const alive = g.players.filter((p) => p.alive).length;
  g.startNight();
  assert.throws(() => g.submitChoice('p3', []), /需要选择/);
  for (const pr of g.nightPrompts()) g.submitChoice(pr.playerId, pr.playerId === 'p3' ? ['p5'] : pr.options.slice(0, pr.count).filter((x) => x !== 'p5').concat(pr.options.slice(0, pr.count + 1)).slice(0, pr.count));
  g.resolveNight();
  assert.equal(g.players.filter((p) => p.alive).length, alive, '小恶魔选了死人：空刀，今晚没人死');
});

test('官方规则复查（暗流涌动）：僧侣保护的小恶魔自刀无事发生；处决死人送葬者没信息；5 人局只有洗衣妇一个镇民也有信息；白天红唇接任入夜告诉她；伪装两镇民一外来者', () => {
  // 僧侣保护小恶魔，小恶魔自刀：不死、不传位
  const a = mk(['monk', 'chef', 'imp', 'poisoner', 'scarletwoman', 'empath']);
  night(a); a.dawn(); a.endDay();
  night(a, { p1: ['p3'], p3: ['p3'], p4: ['p2'] });
  assert.equal(a.get('p3').alive, true);
  assert.equal(a.get('p5').role, 'scarletwoman', '没有传位');
  // 处决一个已经死了的人：送葬者没信息
  const b = mk(['undertaker', 'chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  night(b); b.dawn(); b.endDay();
  night(b, { p3: ['p2'], p4: ['p5'], p5: ['p6'] }); // 2 号被杀
  b.dawn();
  b.execute(b.get('p2'));
  assert.equal(textOf(night(b, { p3: ['p3'] }).messages, 'p1'), '', '处决死人：送葬者没有信息');
  // 5 人局有男爵：场上只有洗衣妇一个镇民
  const c = mk(['washerwoman', 'saint', 'imp', 'baron', 'recluse']);
  assert.match(textOf(night(c).messages, 'p1'), /\*\*洗衣妇\*\*/);
  // 白天处决小恶魔，红唇女郎接任：入夜时私下告诉她
  const d = mk(['chef', 'empath', 'imp', 'scarletwoman', 'monk', 'soldier', 'saint']);
  night(d); d.dawn();
  d.execute(d.get('p3'));
  assert.equal(d.get('p4').role, 'imp');
  assert.match(textOf(d.evilMessages ?? [], 'p4'), /你现在是小恶魔/);
  // 有不在场的外来者时：伪装是两个镇民加一个外来者
  const e = mk(['chef', 'empath', 'imp', 'poisoner', 'monk', 'soldier', 'mayor']);
  assert.equal(e.bluffs.filter((r) => ROLES[r].team === 'outsider').length, 1);
  assert.equal(e.bluffs.filter((r) => ROLES[r].team === 'townsfolk').length, 2);
});
