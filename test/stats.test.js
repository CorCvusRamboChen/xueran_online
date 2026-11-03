// 战绩跨服务器合并：同一个账号在不同服务器打的局合在一起，但陌生人不上别的服务器的榜。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-stats-')));
const { statsFor, listGames } = await import('../src/server/store.js');

function game(guild, endedAt, winner, players) {
  const dir = path.join('data/games', guild);
  fs.mkdirSync(dir, { recursive: true });
  const id = `${endedAt}_c`;
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id, endedAt, winner, days: 1,
    players: players.map(([pid, role], i) => ({ id: pid, seat: i + 1, name: pid, role, alive: true })),
  }));
}

test('梦殒春宵：阵营按存下来的算，善良的恶魔算善良赢', () => {
  const dir = path.join('data/games', 'Z');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '5000_c.json'), JSON.stringify({
    id: '5000_c', endedAt: 5000, winner: 'good', days: 1,
    players: [{ id: 'turned', seat: 1, name: 'turned', role: 'fanggu', evil: false, alive: true }, { id: 'old', seat: 2, name: 'old', role: 'fanggu', alive: true }],
  }));
  const rows = statsFor('Z', 'turned').players;
  assert.equal(rows.find((p) => p.id === 'turned').wins ?? rows.find((p) => p.id === 'turned').won, 1);
  assert.equal(rows.find((p) => p.id === 'old').wins ?? rows.find((p) => p.id === 'old').won, 0, '旧存档按角色算');
  fs.rmSync(dir, { recursive: true });
});

test('胜率跨服务器合并：个人数字算所有服务器，本服局数不变，榜上只有本服打过的人和自己', () => {
  assert.deepEqual(statsFor('A', 'me'), { games: 0, goodWins: 0, players: [] }, '还没有存档');
  game('A', 1000, 'good', [['me', 'chef'], ['alice', 'imp'], ['bot-1', 'empath']]);
  game('B', 2000, 'evil', [['me', 'imp'], ['bob', 'chef']]);
  game('B', 3000, 'good', [['me', 'chef'], ['bob', 'imp']]);

  const a = statsFor('A', 'me');
  assert.equal(a.games, 1, '局数还是本服的');
  assert.equal(a.goodWins, 1);
  assert.deepEqual(a.players.map((p) => p.id).sort(), ['alice', 'me'], '别的服务器的 bob 不上榜，机器人不算');
  const me = a.players.find((p) => p.id === 'me');
  assert.equal(me.games, 3, '两个服务器的局合起来');
  assert.equal(me.wins, 3);
  assert.deepEqual(me.evil, [1, 1]);
  assert.equal(me.bestStreak, 3, '连胜按所有服务器的时间顺序算');
  assert.deepEqual(me.recent.map((r) => r.at), [1000, 2000, 3000]);

  const c = statsFor('C', 'me');
  assert.equal(c.games, 0);
  assert.deepEqual(c.players.map((p) => p.id), ['me'], '这个服务器没打过也能看到自己的战绩');
  assert.equal(statsFor('C').players.length, 0);
  assert.equal(listGames('A').length, 1, '往期对局还是按服务器分开');
});

test('最好的队友 / 最坏的队友：同一阵营打过 4 局以上的人里胜率最高 / 最低；机器人、对立阵营、局数不够的不算', () => {
  const G = 'M';
  let t = 10_000;
  const play = (winner, players) => game(G, ++t, winner, players);
  // me 和 ann 同队 4 局赢 4 局；me 和 ben 同队 4 局赢 1 局；me 和 cat 同队 3 局（不够 4 局）
  for (let i = 0; i < 4; i++) play('good', [['me', 'chef'], ['ann', 'empath'], ['bot-9', 'imp']]);
  play('good', [['me', 'chef'], ['ben', 'empath'], ['dan', 'imp']]);
  for (let i = 0; i < 3; i++) play('evil', [['me', 'chef'], ['ben', 'empath'], ['cat', 'monk'], ['dan', 'imp']]);
  const me = statsFor(G, 'me').players.find((p) => p.id === 'me');
  assert.equal(me.bestMate.id, 'ann');
  assert.deepEqual([me.bestMate.games, me.bestMate.wins], [4, 4]);
  assert.equal(me.worstMate.id, 'ben');
  assert.deepEqual([me.worstMate.games, me.worstMate.wins], [4, 1]);
  assert.equal(me.mates, undefined, '整张队友表不发给前端');
});
