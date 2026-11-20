// AI 说书人帮邪恶的程度跟着真实胜率走（2026-11-20 用户：看坏人的胜率，调整他帮坏人的程度）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { evilTilt, usable, guessScript, summarize, MAX_TILT } from '../src/server/winrate.js';
import { Game, makeRng } from '../src/engine/game.js';

const env = {};
const games = (n, evil, script = 'tb') => Array.from({ length: n }, (_, i) => ({ script, evilWon: i < evil, endedAt: i }));

test('胜率 → tilt：邪恶赢得少就多帮邪恶（正），赢得多就少帮（负）；局数少往 0 收；有上限', () => {
  const low = evilTilt('tb', { games: games(60, 18), env }).tilt; // 30%
  const high = evilTilt('tb', { games: games(60, 42), env }).tilt; // 70%
  const even = evilTilt('tb', { games: games(60, 30), env }).tilt;
  assert.ok(low > 0.15 && high < -0.15, `${low} ${high}`);
  assert.equal(even, 0);
  assert.ok(evilTilt('tb', { games: games(4, 0), env }).tilt < low, '4 局全输也不会比 60 局 30% 调得更多');
  assert.ok(evilTilt('tb', { games: games(500, 0), env }).tilt <= MAX_TILT);
  assert.equal(evilTilt('tb', { games: [], env }).tilt, 0);
});

test('剧本局数够就看自己的，不够就看全部剧本的；手动设定优先', () => {
  const list = [...games(30, 6, 'tb'), ...games(5, 5, 'bmr')];
  const tb = evilTilt('tb', { games: list, env });
  assert.match(tb.why, /这个剧本最近 30 局/);
  const bmr = evilTilt('bmr', { games: list, env });
  assert.match(bmr.why, /所有剧本最近 35 局/);
  assert.equal(evilTilt('tb', { games: list, env: { BOTC_EVIL_TILT: '-0.2' } }).tilt, -0.2);
  assert.equal(summarize(list).scripts.bmr.evil, 5);
});

test('哪些存档算：AI 说书、真人 ≥ 4、血染的局；老存档按角色猜剧本', () => {
  const p = (role, id) => ({ id, role });
  const humans = ['a', 'b', 'c', 'd'];
  const tb = ['washerwoman', 'empath', 'imp', 'poisoner', 'chef'];
  const d = { winner: 'evil', endedAt: 1, players: tb.map((r, i) => p(r, humans[i] ?? 'bot-1')) };
  assert.deepEqual(usable(d), { script: 'tb', evilWon: true, endedAt: 1 });
  assert.equal(usable({ ...d, mode: 'human' }), null, '真人说书人的局不算');
  assert.equal(usable({ ...d, players: tb.map((r, i) => p(r, i < 3 ? humans[i] : `bot-${i}`)) }), null, '真人不到 4 个');
  assert.equal(usable({ ...d, winner: 'wolves' }), null);
  assert.equal(guessScript(['vigormortis', 'savant', 'mathematician', 'bonecollector']), 'snv', '旅行者不影响猜剧本');
});

test('tilt 加在局势上：正的让说书人把局势看得更偏善良（骰子多帮邪恶），存档读回来还在', () => {
  const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
  const g = new Game(players, { roles: ['washerwoman', 'empath', 'chef', 'monk', 'butler', 'poisoner', 'imp'], rng: makeRng(1), script: 'tb' });
  const base = g.st.balance();
  g.st.tilt = 0.3;
  assert.ok(g.st.balance() > base, `${g.st.balance()} > ${base}`);
  g.st.tilt = -0.3;
  assert.ok(g.st.balance() < base);
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.equal(back.st.tilt, -0.3);
});
