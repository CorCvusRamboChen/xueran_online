// 两个官方小剧本：《无上愉悦》《窃窃私语》。借来的角色和新角色各一条以上按官方口径（references/teensy.md）的断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollTeensy, AMNESIAC_POOL } from '../src/engine/snv.js';
import { buildRoles } from '../src/engine/assign.js';
import { ROLES, rolesOf, SCRIPTS, inScript, engineOf } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, NOT_STEPS } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { guessLevel } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function mk(script, roles, st = {}) {
  const g = new Game(players(roles.length), { roles, rng: makeRng(7), script });
  Object.assign(g.st, st);
  return g;
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages ?? []), ...r.messages] };
}
const execute = (g, id) => { g.block = id; return g.endDay(); };

test('小剧本：角色表、人数、规则引擎和地图', () => {
  assert.equal(rolesOf('ngj').length, 11);
  assert.equal(rolesOf('luf').length, 11);
  assert.deepEqual(rolesOf('ngj', 'demon'), ['imp']);
  assert.deepEqual(rolesOf('luf', 'demon'), ['leviathan']);
  assert.ok(inScript('chambermaid', 'ngj') && !inScript('chambermaid', 'luf') && !inScript('chambermaid', 'tb'));
  assert.equal(engineOf('ngj'), 'snv');
  assert.deepEqual(SCRIPTS.luf.players, [5, 6]);
  assert.throws(() => rollTeensy('ngj', 7, Math.random), /5–6 人/);
  // 两个小剧本用前两张图的变体：同样的房子，手绘图借用，名字和天气不同
  assert.equal(getMap('ngj').art, 'tb');
  assert.equal(getMap('luf').art, 'bmr');
  assert.deepEqual(getMap('ngj').houses.map((h) => h.id), getMap('tb').houses.map((h) => h.id));
  assert.notEqual(getMap('ngj').place, getMap('tb').place);
  assert.notEqual(getMap('luf').weather, getMap('bmr').weather);
  // 夜晚顺序：结算表里有每个会醒的角色
  for (const s of ['ngj', 'luf']) for (const [id] of [...NIGHT_ORDER[s].first, ...NIGHT_ORDER[s].other]) if (!NOT_STEPS.has(id)) assert.ok([...MIX_STEPS.first, ...MIX_STEPS.other].includes(id), id);
});

test('无上愉悦：男爵只多一个外来者时就只加一个（这个剧本只有两个外来者）', () => {
  for (let seed = 1; seed < 400; seed++) {
    for (const n of [5, 6]) {
      const roles = rollTeensy('ngj', n, makeRng(seed));
      assert.equal(roles.length, n);
      assert.equal(new Set(roles).size, n);
      const out = roles.filter((r) => ROLES[r].team === 'outsider').length;
      if (roles.includes('baron')) assert.equal(out, 2);
      else assert.equal(out, n === 5 ? 0 : 1);
    }
  }
  // 房主指定了男爵，其余照样补齐
  const roles = buildRoles(['a', 'b', 'c', 'd', 'e', 'f'], { a: 'baron' }, 'ngj', makeRng(3));
  assert.equal(roles.filter((r) => ROLES[r].team === 'outsider').length, 2);
});

test('窃窃私语：气球驾驶员在场时可能多一个外来者，从不超过两个', () => {
  let extra = 0;
  for (let seed = 1; seed < 400; seed++) {
    const roles = rollTeensy('luf', 5, makeRng(seed));
    const out = roles.filter((r) => ROLES[r].team === 'outsider').length;
    assert.ok(out <= 1);
    if (out === 1) { assert.ok(roles.includes('balloonist')); extra++; }
  }
  assert.ok(extra > 0);
});

test('无上愉悦：酒鬼以为自己是不在场的镇民，按那个能力醒来，拿到的信息可能是假的', () => {
  const g = mk('ngj', ['drunk', 'imp', 'clockmaker', 'scarletwoman', 'artist']);
  const d = g.get('p1');
  assert.ok(inScript(d.shownRole, 'ngj') && ROLES[d.shownRole].team === 'townsfolk');
  assert.ok(!g.players.some((q) => q.role === d.shownRole));
  assert.equal(g.abilityOf(d), d.shownRole);
  assert.ok(g.snvBroken(d));
  assert.equal(g.evilOf(d), false);
});

test('无上愉悦：共情者数存活邻座里的邪恶；调查员看到真爪牙', () => {
  const g = mk('ngj', ['empath', 'imp', 'investigator', 'baron', 'drunk', 'klutz']);
  const r = night(g);
  assert.match(text(r.messages, 'p1'), /\*\*1\*\* 名邪恶/);
  assert.match(text(r.messages, 'p3'), /男爵/);
  assert.match(text(r.messages, 'p3'), /4号/);
});

test('无上愉悦：侍女数今晚因自己的能力醒过的人', () => {
  const g = mk('ngj', ['chambermaid', 'empath', 'imp', 'klutz', 'scarletwoman', 'sage']);
  night(g, { p1: ['p2', 'p4'] });
  g.dawn(); g.endDay();
  // 第二夜：共情者醒、呆瓜不醒；小恶魔选人（醒）
  const r = night(g, { p1: ['p2', 'p3'], p3: ['p4'] });
  assert.match(text(r.messages, 'p1'), /\*\*2\*\* 人/);
});

test('无上愉悦：小恶魔自杀，爪牙接任；红唇女郎在 5 人以上时接任被处决的恶魔', () => {
  const g = mk('ngj', ['imp', 'baron', 'empath', 'clockmaker', 'klutz', 'drunk']);
  night(g); g.dawn(); g.endDay();
  night(g, { p1: ['p1'] });
  assert.equal(g.get('p1').alive, false);
  assert.equal(g.get('p2').role, 'imp');
  assert.ok(!g.winner);

  const h = mk('ngj', ['imp', 'scarletwoman', 'empath', 'clockmaker', 'artist']);
  night(h); h.dawn();
  execute(h, 'p1');
  assert.equal(h.get('p2').role, 'imp', '5 人存活时恶魔被处决，红唇女郎接任');
  assert.ok(!h.winner);

  const k = mk('ngj', ['imp', 'scarletwoman', 'empath', 'clockmaker', 'artist']);
  night(k); k.dawn();
  k.get('p5').alive = false; // 只剩 4 人
  execute(k, 'p1');
  assert.equal(k.winner, 'good');
});

test('无上愉悦：贤者被恶魔杀死，得知两个人，其中一个是恶魔', () => {
  const g = mk('ngj', ['sage', 'imp', 'empath', 'clockmaker', 'scarletwoman']);
  night(g); g.dawn(); g.endDay();
  const r = night(g, { p2: ['p1'] });
  assert.match(text(r.messages, 'p1'), /2号/);
});

test('窃窃私语：利维坦不杀人；处决第二个善良玩家，邪恶获胜（邪恶被处决不算）', () => {
  const g = mk('luf', ['leviathan', 'goblin', 'balloonist', 'savant', 'artist']);
  const r = night(g);
  assert.equal(g.nightPrompts().length, 0);
  assert.deepEqual(r.messages.filter((m) => m.playerId === 'p1'), []);
  g.dawn();
  execute(g, 'p2'); // 哥布林（邪恶）：不算
  assert.deepEqual(g.leviGood, []);
  night(g); g.dawn();
  assert.equal(g.nightDeaths.length, 0);
  execute(g, 'p3');
  assert.ok(!g.winner);
  night(g); g.dawn();
  execute(g, 'p4');
  assert.equal(g.winner, 'evil');
  assert.match(g.winReason, /利维坦/);
});

test('窃窃私语：第五个白天结束，利维坦获胜', () => {
  const g = mk('luf', ['leviathan', 'widow', 'balloonist', 'savant', 'artist']);
  for (let d = 1; d <= 4; d++) { night(g); g.dawn(); g.endDay(); assert.ok(!g.winner, `第 ${d} 天`); }
  night(g); g.dawn();
  assert.equal(g.day, 5);
  g.endDay();
  assert.equal(g.winner, 'evil');
});

test('窃窃私语：哥布林被提名后声明了身份，当天被处决，邪恶获胜；前一天声明的不算', () => {
  const g = mk('luf', ['goblin', 'leviathan', 'balloonist', 'savant', 'artist']);
  night(g); g.dawn();
  g.nominate('p3', 'p1');
  g.goblinClaim('p1');
  execute(g, 'p1');
  assert.equal(g.winner, 'evil');
  assert.match(g.winReason, /哥布林/);

  const h = mk('luf', ['goblin', 'leviathan', 'balloonist', 'savant', 'artist']);
  night(h); h.dawn();
  h.goblinClaim('p1');
  h.endDay();
  night(h); h.dawn();
  execute(h, 'p1');
  assert.ok(!h.winner, '声明要在被处决的那天');

  const k = mk('luf', ['goblin', 'leviathan', 'balloonist', 'savant', 'artist']);
  night(k); k.dawn();
  k.goblinClaim('p3'); // 不是哥布林的人这么说：没有效果
  execute(k, 'p3');
  assert.ok(!k.winner);
});

test('窃窃私语：寡妇看魔典、下毒；一名善良玩家得知寡妇在场；寡妇死了毒就解了', () => {
  const g = mk('luf', ['widow', 'leviathan', 'balloonist', 'savant', 'artist']);
  const r = night(g, { p1: ['p3'] });
  assert.match(text(r.messages, 'p1'), /魔典/);
  assert.ok(g.snvPoisoned(g.get('p3')));
  const told = r.messages.filter((m) => /寡妇在场/.test(m.text));
  assert.equal(told.length, 1);
  assert.equal(g.evilOf(g.get(told[0].playerId)), false);
  g.dawn();
  execute(g, 'p1');
  assert.ok(!g.snvPoisoned(g.get('p3')));
});

test('窃窃私语：气球驾驶员每晚看到的人和上一晚的角色类型不同', () => {
  for (let seed = 1; seed < 30; seed++) {
    const g = new Game(players(6), { roles: ['balloonist', 'leviathan', 'goblin', 'mutant', 'savant', 'artist'], rng: makeRng(seed), script: 'luf' });
    let last = null;
    for (let n = 0; n < 4; n++) {
      const r = night(g);
      const seat = Number(text(r.messages, 'p1').match(/(\d+)号/)[1]);
      const type = ROLES[g.players[seat - 1].role].team;
      if (last) assert.notEqual(type, last);
      last = type;
      g.dawn(); g.endDay();
      if (g.winner) break;
    }
  }
});

test('窃窃私语：失忆者的能力是隐藏的：醒来时不知道是什么能力，信息只给裸的结果', () => {
  const g = mk('luf', ['amnesiac', 'leviathan', 'goblin', 'balloonist', 'artist']);
  const p = g.get('p1');
  assert.ok(AMNESIAC_POOL.includes(p.gained));
  assert.ok(g.hidden(p));
  p.gained = 'empath';
  const r = night(g);
  const said = text(r.messages, 'p1');
  assert.match(said, /一个数字/);
  assert.doesNotMatch(said, /邻座|邪恶/);
  p.gained = 'dreamer';
  g.dawn(); g.endDay();
  g.startNight();
  const pr = g.nightPrompts().find((x) => x.playerId === 'p1');
  assert.equal(pr.role, 'amnesiac', '选人提示不说是什么能力');
  // 每天猜一次
  g.resolveNight(); g.dawn();
  assert.equal(g.amnesiacGuess('p1', '我是筑梦师吗').ability, 'dreamer');
  assert.throws(() => g.amnesiacGuess('p1', '再猜一次'), /今天已经猜过/);
  assert.equal(guessLevel('我是筑梦师吗', 'dreamer'), '完美');
  assert.equal(guessLevel('我能杀人', 'empath'), '无关');
});

test('窃窃私语：食人族拿到被处决的善良玩家的能力；吃了邪恶的就中毒，直到下一个善良玩家死于处决', () => {
  const g = mk('luf', ['cannibal', 'leviathan', 'goblin', 'balloonist', 'artist', 'savant']);
  night(g); g.dawn();
  execute(g, 'p4');
  assert.equal(g.get('p1').gained, 'balloonist');
  assert.ok(g.hidden(g.get('p1')));
  const r = night(g);
  assert.match(text(r.messages, 'p1'), /说书人指了指/);
  g.dawn();
  g.claims.p3 = 'savant';
  execute(g, 'p3'); // 哥布林
  assert.ok(g.snvPoisoned(g.get('p1')));
  assert.equal(g.get('p1').gained, 'savant', '假装拿到了邪恶玩家声称的角色');
  night(g); g.dawn();
  execute(g, 'p5');
  assert.ok(!g.snvPoisoned(g.get('p1')));
  assert.equal(g.get('p1').gained, 'artist');
});

test('窃窃私语：疯子以为自己是利维坦，恶魔首夜得知谁是疯子', () => {
  const g = mk('luf', ['lunatic', 'leviathan', 'goblin', 'balloonist', 'artist']);
  assert.equal(g.get('p1').shownRole, 'leviathan');
  assert.equal(g.evilOf(g.get('p1')), false);
  const r = night(g);
  assert.match(text(r.messages, 'p2'), /1号.*疯子/);
});

test('窃窃私语：渔夫每局一次', () => {
  const g = mk('luf', ['fisherman', 'leviathan', 'goblin', 'balloonist', 'artist']);
  night(g); g.dawn();
  assert.deepEqual(g.fishermanAsk('p1'), { lie: null });
  assert.throws(() => g.fishermanAsk('p1'), /已经问过/);
  assert.ok(g.st.fishermanAdvice(g.get('p1'), null).length > 0);
});

test('小剧本：随机跑完整局不崩（各 200 局）', () => {
  for (const script of ['ngj', 'luf']) {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = makeRng(seed);
      const n = 5 + (seed % 2);
      const g = new Game(players(n), { roles: rollTeensy(script, n, rng), rng, script });
      for (let d = 0; d < 12 && !g.winner; d++) {
        night(g);
        if (g.winner) break;
        g.dawn();
        if (g.pendingKlutz) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
        if (g.winner) break;
        const al = g.alive();
        g.block = al[Math.floor(rng() * al.length)].id;
        g.endDay();
        if (g.pendingKlutz && !g.winner) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
      }
      assert.ok(g.winner, `${script} seed ${seed} 打了 12 天没结束`);
    }
  }
});

test('窃窃私语：失忆者池子里每一种能力都能结算，信息里不说是哪个能力', () => {
  const NAMES = AMNESIAC_POOL.map((r) => ROLES[r].name);
  for (const ab of AMNESIAC_POOL) {
    const g = mk('luf', ['amnesiac', 'leviathan', 'widow', 'savant', 'artist', 'mutant']);
    const p = g.get('p1');
    p.gained = ab;
    for (let n = 0; n < 3 && !g.winner; n++) {
      g.startNight();
      for (const pr of g.nightPrompts()) {
        if (pr.playerId === 'p1') assert.equal(pr.role, 'amnesiac', `${ab}：选人提示不说是什么能力`);
        if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
      }
      const r = g.resolveNight();
      for (const m of r.messages.filter((x) => x.playerId === 'p1' && /说书人叫醒了你/.test(x.text))) {
        for (const name of NAMES) assert.ok(!m.text.includes(`${name}的`) && !m.text.includes(`「${name}」`), `${ab} 漏了能力名：${m.text}`);
      }
      g.dawn(); g.endDay();
    }
  }
});

test('失忆者的原创能力：一发子弹打谁谁死，审判之枪只打得死邪恶，特赦让今天不再处决', () => {
  const setup = (ab) => {
    const g = mk('luf', ['amnesiac', 'leviathan', 'goblin', 'balloonist', 'artist', 'savant']);
    g.get('p1').gained = ab;
    night(g); g.dawn();
    return g;
  };
  let g = setup('amn_gun');
  assert.equal(g.slay('p1', 'p4').hit, true, '一发子弹打善良也会死');
  assert.equal(g.get('p4').alive, false);
  assert.throws(() => g.slay('p1', 'p5'), /已经开过枪/);
  g = setup('amn_judge');
  assert.equal(g.slay('p1', 'p4').hit, false, '审判之枪打善良无事');
  g = setup('amn_judge');
  assert.equal(g.slay('p1', 'p3').hit, true, '打中爪牙（哥布林）也死');
  g = setup('amn_judge');
  g.slay('p1', 'p2');
  assert.equal(g.winner, 'good', '打中利维坦，善良获胜');
  g = setup('amn_pardon');
  assert.throws(() => g.pardon('p1'), /处决台上没有人/);
  g.block = 'p4';
  assert.deepEqual(g.pardon('p1'), { who: 'p4', worked: true });
  assert.throws(() => g.nominate('p5', 'p6'), /特赦过了/);
  assert.equal(g.endDay().executed, null);
  assert.equal(g.get('p4').alive, true);
});

test('失忆者的原创能力：恶魔探测、处决回声只给裸的结果', () => {
  const g = mk('luf', ['amnesiac', 'leviathan', 'goblin', 'balloonist', 'artist', 'savant']);
  g.get('p1').gained = 'amn_detect';
  let r = night(g, { p1: ['p2', 'p4'] });
  assert.match(text(r.messages, 'p1'), /说书人叫醒了你：你得知：\*\*是\*\*/);
  g.dawn();
  g.get('p1').gained = 'amn_echo';
  execute(g, 'p4'); // 善良的气球驾驶员
  r = night(g);
  assert.match(text(r.messages, 'p1'), /你得知：\*\*是\*\*/);
});

test('失忆者的能力池：不放一看信息就认得出的调查员、筑梦师（2026-11-21 用户：失忆者直接报「6、3 号里有哥布林」）', () => {
  assert.ok(!AMNESIAC_POOL.includes('investigator'));
  assert.ok(!AMNESIAC_POOL.includes('dreamer'));
  assert.ok(AMNESIAC_POOL.length >= 15);
});
