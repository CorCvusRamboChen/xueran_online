// 随机整局模拟：随机配置、随机选择（包括「不选」）、随机处决，跑几百局，每晚用一张单独写的规则表核对
// "谁该被叫醒"——专门抓"某个角色在某种状态下没被叫醒 / 死人还在行动 / 结算报错"这类问题
// （以前出过：疯子以为自己是僵怖死后不再醒、夜里被复活的人当晚没被叫醒、占卜师不选人时结算报错）。
// 规则表故意和引擎分开写：引擎改坏了，这里的期望不会跟着一起错。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng, rollRoles } from '../src/engine/game.js';
import { rollBMR } from '../src/engine/bmr.js';
import { ROLES } from '../src/engine/roles.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const actsAs = (p) => (p.role === 'lunatic' ? p.shownRole : p.shownRole ?? p.role);

/**
 * 规则表：第二晚起，这个人今晚一定要被叫醒选人吗？（true 一定要 / false 一定不要 / null 不检查）
 * 只写最确定的几条：每晚都要选的角色活着就要醒；死人不醒；僵怖（和以为自己是僵怖的疯子）白天有人死就不醒。
 */
function mustWake(g, p) {
  const r = actsAs(p);
  const ghostLunatic = p.role === 'lunatic' && !p.alive && p.lunaticGhost;
  if (!p.alive && !ghostLunatic) return false;
  if (p.apparentDead && r !== 'zombuul') return false;
  const spec = ROLES[r]?.choose;
  if (!spec || !(ROLES[r].otherNight > 0)) return null;
  if (r === 'zombuul') return !g.diedToday;
  if (spec.once || ['godfather', 'professor'].includes(r)) return null;
  if (ghostLunatic) return null;
  return true;
}

/** 给一个选人提示随机选（15% 不选）。 */
function randomChoice(pr, rng) {
  if (pr.optional && rng() < 0.3) return { targets: [], role: null }; // 官方：只有写着"可以"的能力能不用
  const opts = [...pr.options];
  const targets = [];
  while (targets.length < pr.count && opts.length) targets.push(opts.splice(Math.floor(rng() * opts.length), 1)[0]);
  const role = pr.pickRole ? pr.roleOptions[Math.floor(rng() * pr.roleOptions.length)] : null;
  return { targets: targets.length === pr.count ? targets : [], role };
}

function playOneGame(script, seed) {
  const rng = makeRng(seed);
  const n = 5 + Math.floor(rng() * 11);
  const roles = script === 'bmr' ? rollBMR(n, rng) : rollRoles(n, rng);
  const g = new Game(players(n), { roles, rng: makeRng(seed + 1), script, lunaticGhost: seed % 2 === 0 }); // 房规开关两种都跑
  const ctx = () => `${script} 种子 ${seed}，第 ${g.night} 夜，配置：${g.players.map((p) => `${p.seat}${ROLES[p.role].name}${p.role === 'lunatic' ? `(以为是${ROLES[p.shownRole].name})` : ''}`).join(' ')}`;

  for (let round = 0; round < 10 && !g.winner; round++) {
    g.startNight();
    let prompts = g.nightPrompts();
    if (g.night > 1) {
      for (const p of g.players) {
        const want = mustWake(g, p);
        const got = prompts.some((x) => x.playerId === p.id);
        if (want === true) assert.ok(got, `${p.seat}号 ${ROLES[actsAs(p)].name} 应该被叫醒却没有 · ${ctx()}`);
        if (want === false) assert.ok(!got, `${p.seat}号 ${ROLES[p.role].name}（${p.alive ? '活' : '死'}）不该被叫醒却被叫醒了 · ${ctx()}`);
      }
    }
    // 先选不用等的人（疯子先于真恶魔）
    for (let k = 0; k < 4; k++) {
      prompts = g.nightPrompts();
      for (const pr of prompts.filter((x) => !x.waiting && !g.choices[x.playerId])) {
        const c = randomChoice(pr, rng);
        g.submitChoice(pr.playerId, c.targets, { role: c.role });
      }
    }
    let res = g.resolveNight();
    // 夜里被复活、当晚还轮得到的人：结算停下来等他选
    for (let k = 0; res.pause && k < 10; k++) {
      const pr = g.nightPrompts();
      assert.deepEqual(pr.map((x) => x.playerId), [res.pause], `结算停下来等 ${res.pause}，但要选的人不对 · ${ctx()}`);
      assert.ok(g.get(res.pause).alive, `停下来等的人应该活着 · ${ctx()}`);
      const c = randomChoice(pr[0], rng);
      g.submitChoice(res.pause, c.targets, { role: c.role });
      res = g.resolveNight();
    }
    assert.ok(!res.pause, `结算一直停着 · ${ctx()}`);
    if (res.ravenkeeper) {
      const alive = g.players.filter((p) => p.alive);
      g.resolveRavenkeeper((alive[0] ?? g.players[0]).id);
    }
    if (g.winner) break;
    g.dawn();
    if (g.pendingMoonchild) {
      const t = g.players.find((p) => g.visAlive(p) && p.id !== g.pendingMoonchild);
      if (t) g.moonchildChoose(g.pendingMoonchild, t.id);
    }
    // 白天：七成概率处决一个随机的人（死人也可能被处决：看起来死了的僵怖、以为自己是僵怖的疯子）
    if (rng() < 0.7) {
      const pool = g.players.filter((p) => p.alive || rng() < 0.2);
      const p = pool[Math.floor(rng() * pool.length)];
      if (p) g.execute(p);
    }
    if (g.winner) break;
    g.endDay();
  }
}

for (const script of ['tb', 'bmr']) {
  test(`随机整局模拟（${script === 'bmr' ? '黯月初升' : '暗流涌动'}）：300 局，每晚核对谁该被叫醒，全程不报错`, () => {
    for (let seed = 1; seed <= 300; seed++) playOneGame(script, seed * 7919);
  });
}
