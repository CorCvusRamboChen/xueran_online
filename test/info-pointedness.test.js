// 2026-11-20 用户：夜半狂欢那局信息指向性太强，第二天就把恶魔 8 号打了出去。
// 那局三条信息叠在一起：气球驾驶员第二晚看到恶魔、渔夫的 AI 建议「核对 3 号和 8 号的说法」、博学者被咖啡师加持后得知「死亡的玩家里有 1 名邪恶」（只死了 1 个人）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { ROLES } from '../src/engine/roles.js';
import { adviseFisherman, namesAny } from '../src/server/judge.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
// 那一局的十个人（去掉两个旅行者）
const LAST = ['savant', 'poppygrower', 'balloonist', 'fisherman', 'drunk', 'psychopath', 'engineer', 'vigormortis'];
const mk = (seed, roles = LAST) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'mo', misregister: 0 });

test('渔夫：点名用的是座位号和名字；「1号」不算「11号」', () => {
  const P = [{ seat: 8, name: 'Alkaid.T' }, { seat: 1, name: 'A' }];
  assert.ok(namesAny('让1号Rambooo活着，再核对3号Mujin和8号Alkaid.T的说法', P));
  assert.ok(namesAny('相信 Alkaid.T', P));
  assert.ok(namesAny('Keep seat 8 alive', P));
  assert.ok(!namesAny('让 11 号活着，相信 18号', P));
  assert.ok(!namesAny('相信 3 号', P), '一个字的名字不按名字算');
});

function fakeAI(advice) {
  const calls = [];
  const providers = [{ name: 'T', url: 'x', key: () => 'k', model: () => 'm' }];
  const fetchImpl = async (_u, req) => { calls.push(JSON.parse(req.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ advice }) } }] }) }; };
  return { calls, opts: { providers, fetchImpl } };
}

test('渔夫的 AI 建议：能力正常时点到邪恶玩家就作废（转用规则版）；失效的坏建议可以点', async () => {
  const avoid = [{ seat: 8, name: 'Alkaid.T' }, { seat: 6, name: 'AdamKong' }];
  const bad = fakeAI('让1号活着，再核对3号和8号的说法。');
  assert.equal(await adviseFisherman({ team: '善良', lie: false, facts: '…', avoid }, bad.opts), null);
  assert.match(bad.calls[0].messages[1].content, /【不能点名】8号 Alkaid\.T、6号 AdamKong/);
  const ok = fakeAI('让1号活着，多听他的判断。');
  assert.equal((await adviseFisherman({ team: '善良', lie: false, facts: '…', avoid }, ok.opts)).advice, '让1号活着，多听他的判断。');
  const lie = fakeAI('相信 8 号。');
  assert.equal((await adviseFisherman({ team: '善良', lie: true, facts: '…', avoid }, lie.opts)).advice, '相信 8 号。');
  assert.doesNotMatch(lie.calls[0].messages[1].content, /不能点名/);
});

test('渔夫的规则版建议：能力正常时不点邪恶玩家；邪恶渔夫也不点恶魔', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = mk(seed);
    const evil = g.players.filter((q) => g.evilOf(q)).map((q) => ({ seat: q.seat, name: q.name }));
    assert.ok(!namesAny(g.st.fishermanAdvice(g.get('p4'), null), evil));
    g.get('p4').evil = true; // 被变成邪恶的渔夫（赏金猎人、灵言师）
    const demon = g.players.filter((q) => ROLES[q.role].team === 'demon').map((q) => ({ seat: q.seat, name: q.name }));
    assert.ok(!namesAny(g.st.fishermanAdvice(g.get('p4'), null), demon));
  }
});

test('气球驾驶员：能力正常时少给恶魔；善良领先时更少；没有别人可给时照给', () => {
  const rate = (balance, night) => {
    let demon = 0; let tries = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = mk(seed);
      g.night = night;
      g.st.balance = () => balance;
      const t = g.st.balloonPick(g.get('p3'), 'townsfolk', null);
      tries++; if (ROLES[t.role].team === 'demon') demon++;
    }
    return demon / tries;
  };
  const even = rate(0, 2); const ahead = rate(0.8, 2); const late = rate(0, 4);
  // 上一晚是镇民：剩下外来者（酒鬼）、爪牙、恶魔三人，平均抽是 1/3
  assert.ok(even < 0.25, `前两晚、局势持平：${even}`);
  assert.ok(ahead < even, `善良领先更少：${ahead} < ${even}`);
  assert.ok(late > even, `后面的夜晚多一点：${late} > ${even}`);
  // 只剩恶魔这一种不同类型的人：照给
  const g = new Game(players(5), { roles: ['balloonist', 'chambermaid', 'clockmaker', 'dreamer', 'vigormortis'], rng: makeRng(1), script: 'mo', misregister: 0 });
  g.st.balance = () => 1;
  assert.equal(ROLES[g.st.balloonPick(g.get('p1'), 'townsfolk', null).role].team, 'demon');
});

test('博学者：「死者里有几名邪恶」在死者几乎全是邪恶时算点名，少给真的；善良落后时多给', () => {
  const sharpTrue = (balance) => {
    let n = 0; let tries = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = mk(seed);
      g.get('p6').alive = false; // 那局：亡骨魔杀了自己的爪牙，死者只有这一个
      g.st.balance = () => balance;
      const sharp = g.st.savantFacts().filter((f) => f.sharp).map((f) => f.t);
      assert.ok(sharp.includes('死亡的玩家里有 1 名邪恶'));
      assert.ok(sharp.includes('死亡的玩家里有 0 名善良'));
      const lines = g.st.savantLines(g.get('p1'), null);
      tries++; if (lines.some((l) => sharp.includes(l))) n++;
    }
    return n / tries;
  };
  const even = sharpTrue(0); const behind = sharpTrue(-0.8);
  assert.ok(even < 0.06, `局势持平时很少给：${even}`);
  assert.ok(behind > even, `善良落后时多给：${behind} > ${even}`);
});
