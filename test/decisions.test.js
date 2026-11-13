// 线下分析用的两份数据：说书人决策日志、玩家标记。最要紧的是别漏记，也别发给玩家。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { rollBMR } from '../src/engine/bmr.js';
import { rollSNV } from '../src/engine/snv.js';
import { DICE, DRAW, chanceOf, drawOdds } from '../src/engine/dice.js';
import { cleanMarks, diffMarks, noteMarks, replayMarks, leaning, readTown } from '../src/server/beliefs.js';
import { Room } from '../src/server/room.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../src/engine/storyteller.js'), 'utf8');
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-decisions-')));
const { archiveGame, getGame, listGames } = await import('../src/server/store.js');

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const ROLL = { tb: rollRoles, bmr: rollBMR, snv: rollSNV };

/** 随机打几晚，跑到结束或出错为止，返回这局。 */
function play(script, seed) {
  const rng = makeRng(seed);
  const n = 7 + Math.floor(rng() * 9);
  const g = new Game(players(n), { roles: ROLL[script](n, rng), rng: makeRng(seed + 1), script });
  for (let round = 0; round < 6 && !g.winner; round++) {
    g.startNight();
    for (const pr of g.nightPrompts()) {
      const opts = [...(pr.options ?? [])]; const targets = [];
      while (targets.length < (pr.count ?? 0) && opts.length) targets.push(opts.splice(Math.floor(rng() * opts.length), 1)[0]);
      try { g.submitChoice(pr.playerId, targets.length === pr.count ? targets : [], pr.roleOptions?.[0] ?? null); } catch { /* 随机选到了不合法的：这人今晚不选 */ }
    }
    const res = g.resolveNight();
    if (res?.ravenkeeper) g.resolveRavenkeeper(g.alive()[0].id);
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

test('决策日志：三个剧本都有记录，每条都说得清选了什么', () => {
  for (const script of ['tb', 'bmr', 'snv']) {
    const kinds = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      let g;
      try { g = play(script, seed * 6151); } catch { continue; } // 这里不测引擎：随机动作撞到的报错归别的测试
      for (const d of g.st.decisions) {
        kinds.add(d.kind);
        assert.ok(d.chosen !== undefined, `${script} ${d.kind} 没有 chosen`);
        assert.ok(d.at > 0 && typeof d.phase === 'string');
        if (d.prob != null) {
          assert.ok(d.prob > 0 && d.prob <= 1, `${d.kind} 概率 ${d.prob}`);
          assert.ok(d.options.includes(d.chosen), `${d.kind} 选中的不在候选里`);
        }
      }
    }
    assert.ok(kinds.size >= 3, `${script} 只有 ${[...kinds]}`);
  }
});

test('决策日志：掷出去的概率是抽中这一面的概率', () => {
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: () => 0.5 });
  g.st.roll('tinker');  // 8%：0.5 掷不中
  g.st.roll('dreamerSeen'); // 85%：0.5 掷中
  const [no, yes] = g.st.decisions.slice(-2);
  assert.equal(no.chosen, false);
  assert.ok(Math.abs(no.prob - 0.92) < 1e-9);
  assert.equal(yes.chosen, true);
  assert.ok(Math.abs(yes.prob - 0.85) < 1e-9);
  assert.equal(no.base, 0.08);
});

test('决策日志：说书人的随机只能在记日志的地方，或者结果整体记下来的组合判定里', () => {
  const allowed = /^\s*(const yes = this\.rng\(\)|const x = pick\(pool|let left = this\.rng\(\))/; // roll / choose / draw 自己
  const composite = ['buildWorld', 'buildSnvWorld', 'savantFacts', 'fakeOutsidersBMR', 'sagePair', 'savantLines'];
  let fn = '';
  for (const line of source.split('\n')) {
    const m = /^ {2}(\w+)\(.*\) \{/.exec(line);
    if (m) fn = m[1];
    if (!/\bthis\.rng\(\)|\bpick\(/.test(line) || /^const /.test(line) || allowed.test(line)) continue;
    assert.ok(composite.includes(fn), `${fn} 里有没记日志的随机：${line.trim()}`);
  }
});

test('骰子：说书人用到的每个判定都在表里（缺了结算时才报错）', () => {
  for (const [, kind] of source.matchAll(/this\.roll\('(\w+)'/g)) assert.ok(DICE[kind], `DICE 缺 ${kind}`);
  for (const [, kind] of source.matchAll(/this\.draw\('(\w+)'/g)) assert.ok(DRAW[kind], `DRAW 缺 ${kind}`);
});

test('骰子：概率永远留在 5% 到 95%', () => {
  for (const kind of Object.keys(DICE)) {
    for (const v of [-100, 100]) {
      const features = Object.fromEntries(Object.keys(DICE[kind]).filter((k) => k !== 'base').map((k) => [k, v]));
      const p = chanceOf(kind, features);
      assert.ok(p >= 0.05 && p <= 0.95, `${kind} ${p}`);
    }
  }
});

test('骰子：没权重的信号只记录，不影响概率', () => {
  assert.equal(chanceOf('madness', { marksHeat: 0.5, skillGap: 0.2, idle: 300 }), chanceOf('madness', {}));
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(1) });
  g.signals = () => ({ marksHeat: 0.5 });
  g.st.roll('tinker', { balance: 0 });
  assert.equal(g.st.decisions.at(-1).features.marksHeat, 0.5);
  assert.ok(Math.abs((g.st.decisions.at(-1).chosen ? g.st.decisions.at(-1).prob : 1 - g.st.decisions.at(-1).prob) - 0.08) < 1e-9);
});

test('骰子：信号读取出错不能打断结算', () => {
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(1) });
  g.signals = () => { throw new Error('读坏了'); };
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(typeof g.st.roll('tinker', { balance: 0 }), 'boolean'); } finally { console.warn = warn; }
});

test('骰子：按分数抽的概率加起来是 1，新手确实少被挑中，空候选不崩', () => {
  const odds = drawOdds('mayorVictim', [{ newbie: 1 }, {}, {}]);
  assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(odds[0] < odds[1] / 5);
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(1) });
  assert.equal(g.st.draw('gossipVictim', [], () => ({})), undefined);
  assert.equal(g.st.draw('vigSide', [1, -1], () => ({ pressure: 0 })) * 1 !== 0, true, '候选可以不是玩家');
});

test('骰子：同一个人被挑中过，下次更不容易', () => {
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(2) });
  const [a, b] = [g.get('p2'), g.get('p4')];
  for (let i = 0; i < 3; i++) g.st.decide('gossipVictim', { chosen: 'p2' });
  assert.equal(g.st.hits('p2'), 2, '最多算两次');
  let k = 0;
  for (let i = 0; i < 200; i++) { const n = g.st.decisions.length; if (g.st.draw('mayorVictim', [a, b], (q) => ({ hits: g.st.hits(q.id) })) === a) k++; g.st.decisions.length = n; }
  assert.ok(k < 80, `被挑过的人又被挑中 ${k}/200 次`);
});

test('决策日志：断线重启后还在', () => {
  const g = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(3) });
  const n = g.st.decisions.length;
  g.st.roll('tinker');
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(back.st.decisions.length, n + 1);
  assert.equal(back.st.decisions.at(-1).kind, 'tinker');
});

const IDS = new Set(['a', 'b', 'c', 'd']);

test('标记：笔记、给自己的标记、不认识的内容都不收', () => {
  const m = cleanMarks({
    tags: { a: { tag: 'demon', role: 'imp', note: '这是笔记' }, me: { tag: 'minion', role: 'spy' }, b: { tag: '瞎写', role: 'constructor' }, zz: { tag: 'demon' } },
    links: [{ a: 'a', b: 'b', kind: 'sus' }, { a: 'a', b: 'b', kind: 'sus' }, { a: 'a', b: 'a', kind: 'sus' }, { a: 'a', b: 'zz', kind: 'sus' }, { a: 'a', b: 'c', kind: '瞎写' }],
  }, new Set([...IDS, 'me']), 'me');
  assert.deepEqual(m, { tags: { a: { tag: 'demon', role: 'imp' } }, links: [{ a: 'a', b: 'b', kind: 'sus' }] });
  assert.doesNotMatch(JSON.stringify(m), /笔记/);
  assert.deepEqual(cleanMarks(null, IDS, 'a'), { tags: {}, links: [] }, '乱发的也不崩');
  assert.deepEqual(cleanMarks({ tags: 'x', links: 'y' }, IDS, 'a'), { tags: {}, links: [] });
});

test('标记：只记变化，能倒回到任何一天', () => {
  const g = { id: 'G', players: [...IDS].map((id) => ({ id })), night: 1, day: 1, phase: 'day' };
  let s = noteMarks(null, g, 'a', { tags: { b: { tag: 'demon' } } }, 1);
  s = noteMarks(s, g, 'a', { tags: { b: { tag: 'demon' } } }, 2);
  assert.equal(s.log.length, 1, '没变不多记');
  g.day = 2;
  s = noteMarks(s, g, 'a', { tags: { c: { tag: 'demon' } }, links: [{ a: 'a', b: 'c', kind: 'sus' }] }, 3);
  assert.equal(s.log.length, 2);
  assert.deepEqual(s.log[1].tags, { b: null, c: { tag: 'demon', role: null } }, '换了人');
  assert.deepEqual(Object.keys(replayMarks(s.log, (e) => e.day <= 1).a.tags), ['b']);
  assert.deepEqual(replayMarks(s.log).a, s.now.a, '倒回去和最新的一样');
  assert.equal(noteMarks(s, { ...g, id: 'H' }, 'a', {}, 4).log.length, 0, '新的一局从头记');
  const del = diffMarks(s.now.a, { tags: {}, links: [] });
  assert.equal(del.del.length, 1);
});

test('标记：连线只算自己连出去的', () => {
  const m = { tags: { c: { tag: 'minion' }, d: { role: 'chef' } }, links: [{ a: 'a', b: 'b', kind: 'sus' }, { a: 'x', b: 'e', kind: 'sus' }, { a: 'a', b: 'f', kind: 'trust' }, { a: 'a', b: 'g', kind: 'ally' }] };
  assert.equal(leaning(m, 'a', 'b'), 1);
  assert.equal(leaning(m, 'a', 'e'), 0, '「x 怀疑 e」记的是 x 的想法');
  assert.equal(leaning(m, 'a', 'f'), -1);
  assert.equal(leaning(m, 'a', 'g'), 0, '同伙说的是两个人的关系，不是谁邪恶');
  assert.equal(leaning(m, 'a', 'c'), 1);
  assert.equal(leaning(m, 'a', 'd'), -1);
});

test('标记：全镇看法可以只算善良玩家', () => {
  const now = { a: { tags: { c: { tag: 'demon' } }, links: [] }, b: { tags: { c: { tag: 'townsfolk' } }, links: [] }, d: { tags: { c: { tag: 'demon' } }, links: [] } };
  const all = readTown(now, ['a', 'b', 'c', 'd']);
  assert.equal(all.c.evil, 2);
  assert.equal(all.c.good, 1);
  assert.equal(all.a.suspect, 0.5, '没人表态是 0.5');
  assert.equal(readTown(now, ['c'], (id) => id !== 'd').c.evil, 1);
});

function room() {
  const r = new Room({ key: 'g:c', guildId: 'G1', hostId: 'p1', voice: null, settings: { mode: 'auto' } });
  r.game = new Game(players(7), { roles: ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'undertaker'], rng: makeRng(9) });
  return r;
}

test('标记：对不上这一局的不记，也不报错', async () => {
  const r = room();
  const good = { gameId: r.game.id, tags: { p2: { tag: 'demon' } } };
  assert.equal(await r.act('stranger', 'marks', good), null, '观战的');
  assert.equal(await r.act('p1', 'marks', { ...good, gameId: 'old' }), null, '上一局残留的');
  assert.equal(r.beliefs, undefined);
  await r.act('p1', 'marks', good);
  assert.equal(r.beliefs.log.length, 1);
  r.ended = true;
  await r.act('p1', 'marks', { gameId: r.game.id, tags: {} });
  assert.equal(r.beliefs.log.length, 1, '翻了魔典以后改标记不算');
});

test('标记和决策日志：进存档，但不发给任何客户端', async () => {
  const r = room();
  r.game.st.roll('tinker');
  await r.act('p1', 'marks', { gameId: r.game.id, tags: { p2: { tag: 'demon', role: 'imp' } } });
  r.meets = [{ at: 1, day: 1, house: 'h', who: 'p1', with: ['p2'] }];
  r.game.records = { players: { p1: { games: 3, wins: 1 } }, games: 3, goodWins: 1 };
  const secret = /"decisions"|"beliefs"|"meets"|"records"/;
  r.game.phase = 'day';
  assert.doesNotMatch(JSON.stringify(r.viewFor('p2')), secret, '对局里');

  const back = new Room({ key: 'g:c', guildId: 'G1', hostId: 'p1', voice: null, settings: { mode: 'auto' } }).restore(JSON.parse(JSON.stringify(r.snapshot())));
  assert.equal(back.beliefs.log.length, 1, '重启后还在');

  r.game.winner = 'good';
  r.ended = true;
  assert.doesNotMatch(JSON.stringify(r.viewFor('p2')), secret, '终局');
  archiveGame(r);
  const [file] = fs.readdirSync('data/games/G1');
  const saved = JSON.parse(fs.readFileSync(path.join('data/games/G1', file), 'utf8'));
  assert.equal(saved.beliefs.length, 1);
  assert.equal(saved.meets.length, 1);
  assert.equal(saved.records.games, 3);
  assert.ok(saved.decisions.some((d) => d.kind === 'tinker'));
  const open = getGame('G1', file.replace(/\.json$/, ''));
  assert.ok(open.timeline, '往期对局照常能看');
  assert.doesNotMatch(JSON.stringify(open), secret, '往期对局接口');
  assert.doesNotMatch(JSON.stringify(listGames('G1')), secret, '往期列表');
});
