// 冒名钓鱼（Catfishing）：全用已有角色，在通用引擎里结算。疯子在会杀人的恶魔下照样每晚「行动」，恶魔等他选完并得知他选了谁。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, engineOf } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'cat', misregister: 0 });

test('冒名钓鱼：25 个角色都在、用通用引擎、地图是钟楼广场的雾夜变体；会醒的角色都在结算表里', () => {
  assert.equal(rolesOf('cat').length, 25);
  assert.equal(engineOf('cat'), 'snv');
  assert.equal(getMap('cat').art, 'tb');
  assert.notEqual(getMap('cat').weather, getMap('tb').weather);
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const [id] of [...NIGHT_ORDER.cat.first, ...NIGHT_ORDER.cat.other]) {
    if (STEP_NAMES[id] || id === 'lunatic') continue;
    assert.ok(steps.includes(id) || (id === 'godfather' && steps.includes('godfatherInfo')), id);
  }
});

test('配板：教父 ±1、方古 +1、亡骨魔 −1 外来者，人数总是对的、角色不重复', () => {
  for (let seed = 1; seed < 300; seed++) {
    for (const n of [5, 8, 11, 15]) {
      const roles = rollMixed('cat', n, makeRng(seed));
      assert.equal(roles.length, n);
      assert.equal(new Set(roles).size, n);
      assert.equal(roles.filter((r) => ROLES[r].team === 'demon').length, 1);
    }
  }
});

test('疯子以为自己是小恶魔：第二夜按小恶魔醒来选人，没有效果；恶魔先等他选完，再得知他选了谁', () => {
  const g = mk(['lunatic', 'investigator', 'chef', 'dreamer', 'savant', 'widow', 'imp']);
  const lun = g.get('p1');
  lun.shownRole = 'imp';
  g.startNight(); for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId); g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  const prompts = g.nightPrompts();
  assert.equal(prompts.find((x) => x.playerId === 'p1')?.role, 'imp');
  assert.equal(prompts.find((x) => x.playerId === 'p7')?.waiting, true, '真恶魔等疯子');
  const news = g.submitChoice('p1', ['p2']);
  assert.match(news[0].text, /疯子 1号 玩家1 今晚选了：2号 玩家2/);
  assert.equal(news[0].playerId, 'p7');
  assert.equal(g.nightPrompts().find((x) => x.playerId === 'p7').waiting, false);
  g.submitChoice('p7', ['p3']);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  g.resolveNight();
  assert.ok(g.get('p2').alive, '疯子选的人没事');
  assert.equal(g.get('p3').alive, false);
});

test('疯子是机器人替选的：结算时补告诉恶魔', () => {
  const g = mk(['lunatic', 'investigator', 'chef', 'dreamer', 'savant', 'widow', 'imp']);
  g.get('p1').shownRole = 'vigormortis';
  g.startNight(); for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId); g.resolveNight(); g.dawn(); g.endDay();
  g.startNight();
  g.autoChoose('p1');
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  assert.ok(r.messages.some((m) => m.playerId === 'p7' && /疯子 1号/.test(m.text)));
});

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
function mockVoice() {
  let n = 0;
  return {
    async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; },
    async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {},
  };
}

test('房间：冒名钓鱼 10 人局（2 真人 + 8 机器人）能打完，有家（钟楼广场的变体）', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'cat' } });
  room.moonchildWaitMs = 5;
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 8 });
  await room.act('u1', 'start');
  const g = room.game;
  assert.equal(room.town.id, 'cat');
  assert.ok(room.homes);
  let days = 0;
  while (!g.winner && !room.ended && days < 20) {
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId] || pr.waiting) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count), role: pr.pickRole ? pr.roleOptions[0] : null }).catch(() => {});
      }
      if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id }).catch(() => {});
      if (room.revivePending && !room.isFake(room.revivePending)) { const pr = g.nightPrompts().find((x) => x.playerId === room.revivePending); if (pr) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {}); }
      await sleep(3);
    }
    if (g.winner || room.ended) break;
    days++;
    await until(() => room.roam || room.ended, 300);
    if (room.ended) break;
    await room.act('u1', 'gather');
    if (g.winner || room.ended) break;
    if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
    if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
    await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
  }
  assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
  await room.teardown();
});

// ───────────── 规则审查（2026-11-04）的回归测试 ─────────────
test('哲学家第二夜选了厨师：当晚就拿到厨师的信息（首夜能力中途拿到也给一次）', () => {
  const g = mk(['philosopher', 'investigator', 'empath', 'dreamer', 'savant', 'widow', 'imp'].map((r) => (r === 'empath' ? 'balloonist' : r)));
  g.startNight(); g.submitChoice('p1', [], {}); for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId); g.resolveNight(); g.dawn(); g.endDay();
  g.startNight(); g.submitChoice('p1', [], { role: 'chef' }); g.submitChoice('p7', ['p3']);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  assert.match(r.messages.filter((m) => m.playerId === 'p1').map((m) => m.text).join('\n'), /相邻的邪恶玩家/);
});

test('酒鬼不会以为自己是失忆者或食人族；食人族吃了酒鬼是醉的', () => {
  for (let seed = 1; seed < 80; seed++) {
    const g = new Game(players(7), { roles: ['drunk', 'investigator', 'chef', 'dreamer', 'savant', 'widow', 'imp'], rng: makeRng(seed), script: 'cat' });
    assert.ok(!['amnesiac', 'cannibal'].includes(g.get('p1').shownRole));
  }
  const g = mk(['drunk', 'cannibal', 'chef', 'dreamer', 'savant', 'widow', 'imp']);
  g.startNight(); for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId); g.resolveNight(); g.dawn();
  g.block = 'p1'; g.endDay();
  assert.equal(g.get('p2').gained, g.get('p1').shownRole);
  assert.ok(g.broken(g.get('p2')));
});
