// 骰子上线前审查抓到的问题：每条都是修之前能复现的。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Game, makeRng } from '../src/engine/game.js';
import { chanceOf, drawOdds } from '../src/engine/dice.js';
import { noteMarks } from '../src/server/beliefs.js';
import { Room } from '../src/server/room.js';

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-dice-')));
const { statsFor } = await import('../src/server/store.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const TB = ['imp', 'empath', 'scarletwoman', 'chef', 'washerwoman', 'monk', 'fortuneteller'];
const SNV = ['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'];

function room(g) {
  const r = new Room({ key: 'g:c', guildId: 'G', hostId: 'p1', voice: null, settings: { mode: 'auto' } });
  r.game = g;
  r.wireGame();
  return r;
}

test('红鲱鱼：新手名单在定红鲱鱼之前就到了，新手确实少被选中', () => {
  let hit = 0; const N = 600;
  for (let seed = 1; seed <= N; seed++) {
    const g = new Game(players(7), { roles: TB, rng: makeRng(seed), newbies: ['p5'] });
    if (g.redHerring === 'p5') hit++;
  }
  // 候选 p2 p4 p5 p6 四个镇民：等概率是 25%，新手减 1 点约 11%
  assert.ok(hit / N < 0.17, `新手被选中 ${hit}/${N}`);
});

test('标了新手的不再算打得少：两条从宽不叠加', () => {
  const g = new Game(players(8), { roles: SNV, rng: makeRng(1), script: 'snv' });
  g.newbies = ['p2'];
  g.records = { players: { p1: { games: 1, wins: 0 }, p2: { games: 1, wins: 0 } }, games: 2, goodWins: 1 };
  const r = room(g);
  r.online.add('p1'); r.online.add('p2');
  assert.equal(r.signals('p1').rookie, true);
  assert.equal(r.signals('p2').rookie, false);
});

test('掉线：刚重启没有操作记录的不算，操作过又断开的才算', () => {
  const g = new Game(players(8), { roles: SNV, rng: makeRng(1), script: 'snv' });
  const r = room(g);
  assert.equal(r.signals('p1').offline, undefined, '重启后谁都还没连回来');
  r.lastSeen.set('p1', Date.now());
  assert.equal(r.signals('p1').offline, true);
  r.online.add('p1');
  assert.equal(r.signals('p1').offline, false);
});

test('有人在听吗：收音箱存在不算，要真传过声音；进屋说话听不到；掉线和机器人都不算', () => {
  const g = new Game(players(8), { roles: SNV, rng: makeRng(1), script: 'snv' });
  g.day = 1;
  const r = room(g);
  r.mic = { seconds: new Map() };
  r.online.add('p1');
  assert.equal(r.listeningTo('p1'), false, '没开收音页');
  r.mic.seconds.set('p1', 3);
  assert.equal(r.listeningTo('p1'), true);
  r.online.delete('p1');
  assert.equal(r.listeningTo('p1'), false, '掉线');
  r.online.add('p2');
  r.hearing = {};
  assert.equal(r.listeningTo('p2'), true, '机器人在广场');
  r.meets = [{ day: 1, who: 'p3', with: ['p2'] }];
  assert.equal(r.listeningTo('p2'), false, '今天进过屋');
  r.meets = [{ day: 0, who: 'p3', with: ['p2'] }];
  assert.equal(r.listeningTo('p2'), true, '昨天进屋不算');
  assert.equal(r.listeningTo('bot-1'), false);
});

test('疯狂的依据排序：听到判没努力 > 有人听他没说 > 什么都没有 > 没人听', () => {
  const p = (how) => chanceOf('madness', how);
  assert.ok(p({ heardFalse: true }) > p({ silent: true }));
  assert.ok(p({ silent: true }) > p({}));
  assert.ok(p({}) > p({ blind: true }));
  assert.ok(p({ blind: true, offline: true }) < 0.2, '掉线的人几乎不罚');
});

test('判疯狂等大模型时房主结束了这局：不往下一局写东西', async () => {
  const r = new Room({ key: 'g:c', guildId: 'G', hostId: 'u1', voice: null, settings: { mode: 'auto' } });
  r.users.set('u1', { id: 'u1', name: 'A', avatar: null });
  const g = new Game([{ id: 'u1', name: 'A' }, ...players(8).slice(1)], { roles: SNV, rng: makeRng(1), script: 'snv' });
  r.game = g;
  g.startNight(); g.resolveNight(); g.dawn?.();
  g.madness = { u1: { role: 'oracle', night: g.night, claimed: false } };
  let release;
  r.madnessJudge = () => new Promise((ok) => { release = ok; });
  r.heardLines = () => ['随便说点什么'];
  const dusk = r.dusk();
  await sleep(5);
  assert.ok(release, '等到了大模型那一步');
  r.reset();
  release({ verdict: 'false', reason: '', by: 'test' });
  await dusk;
  assert.equal(r.duskDay, null);
  assert.equal(r.game, null);
  assert.ok(!r.log.some((l) => /没有疯狂地证明/.test(l.text ?? '')), '大厅里不该冒出处决');
});

test('恶魔已死、就差双子挡着：疯狂处决双子也算定胜负，放过', () => {
  const g = new Game(players(8), { roles: ['oracle', 'artist', 'eviltwin', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'], rng: makeRng(2), script: 'snv' });
  g.startNight(); g.resolveNight(); g.dawn?.();
  assert.ok(g.twin);
  g.get('p5').alive = false;
  g.get('p1').alive = true;
  assert.equal(g.st.decidesGame(g.get(g.twin.a)), true);
  assert.equal(g.st.madnessPenalty(g.get(g.twin.a)), false);
});

test('次数上限和这晚的判定：重启后还算数（决策日志在存档里）', () => {
  const g = new Game(players(8), { roles: ['oracle', 'artist', 'cerenovus', 'savant', 'fanggu', 'klutz', 'mutant', 'sage'], rng: makeRng(2), script: 'snv' });
  g.st.decide('shabalothBack', { chosen: 'p1' });
  g.st.decide('shabalothBack', { chosen: 'p2' });
  g.st.decide('pacifist', { chosen: true });
  g.st.decide('pacifist', { chosen: false });
  g.night = 3;
  const first = g.st.deadLies(g.get('p1'));
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(back.st.times('shabalothBack'), 2);
  assert.equal(back.st.shabaRegurgitate([back.get('p1')]), null, '每局最多两次');
  assert.equal(back.st.times('pacifist'), 1, '没救成的不算');
  for (let i = 0; i < 20; i++) assert.equal(back.st.deadLies(back.get('p1')), first, '同一晚同一个人只判一次');
});

test('新手保护压得住：老手被挑得再多，新手也不会比他更容易被挑', () => {
  for (const kind of ['mayorVictim', 'sweetheartDrunk', 'innkeeperDrunk']) {
    const [newbie, vet] = drawOdds(kind, [{ newbie: 1 }, { hits: 2 }]);
    assert.ok(newbie < vet, `${kind}：新手 ${newbie} 老手 ${vet}`);
  }
  const g = new Game(players(8), { roles: SNV, rng: makeRng(2), script: 'snv' });
  for (let i = 0; i < 5; i++) g.st.decide('gossipVictim', { chosen: 'p2' });
  assert.equal(g.st.hits('p2'), 2, '最多算两次');
});

test('造谣者：能不挑新手就不挑（这个人会死）', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = new Game(players(7), { roles: ['gossip', 'chambermaid', 'assassin', 'exorcist', 'zombuul', 'sailor', 'innkeeper'], rng: makeRng(seed), script: 'bmr' });
    g.newbies = ['p2', 'p4'];
    g.st.balance = () => 0;
    const v = g.st.gossipVictim();
    assert.ok(v && !g.newbies.includes(v.id), `种子 ${seed} 挑了 ${v?.id}`);
  }
});

test('战绩：有一份坏存档也不影响别的，读不到战绩也能开局', () => {
  const dir = path.join('data/games', 'BAD');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1_c.json'), JSON.stringify({ id: '1_c', endedAt: 1, winner: 'good', days: 1, players: [null] }));
  fs.writeFileSync(path.join(dir, '2_c.json'), '不是 JSON');
  fs.writeFileSync(path.join(dir, '3_c.json'), JSON.stringify({ id: '3_c', endedAt: 3, winner: 'good', days: 1, players: [{ id: 'x', seat: 1, name: 'x', role: 'chef', alive: true }] }));
  assert.equal(statsFor('BAD').players.length, 1);
  const r = new Room({ key: 'g:c', guildId: 'G', hostId: 'p1', voice: null, settings: { mode: 'auto' } });
  r.history = { stats: () => { throw new Error('读坏了'); } };
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(r.readRecords([{ id: 'p1' }]), null); } finally { console.warn = warn; }
});

test('标记日志满了也要更新最新状态', () => {
  const g = { id: 'G', players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], night: 1, day: 1, phase: 'day' };
  let s = { gameId: 'G', now: {}, log: Array.from({ length: 2000 }, () => ({})) };
  s = noteMarks(s, g, 'a', { tags: { b: { tag: 'demon' } } });
  assert.equal(s.log.length, 2000);
  assert.equal(s.now.a.tags.b.tag, 'demon');
});
