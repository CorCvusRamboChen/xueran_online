// 裁缝与暴乱（作者 Sui，用户 2026-11-15 要的）：所有善良都是女裁缝，所有邪恶都是暴乱（旧版 v1），传奇角色骗人精。
// 口径：官方实验角色运作文档里的 Riot v1（被提名就死、可以接着提名、第三天必须、第三天结束邪恶获胜），见 references/community.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollRiot } from '../src/engine/snv.js';
import { ROLES, rolesOf, engineOf, SCRIPTS, DISTRIBUTION } from '../src/engine/roles.js';
import { NIGHT_ORDER } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'sar', misregister: 0 });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 5; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...r.messages] };
}
const S7 = ['seamstress', 'seamstress', 'seamstress', 'seamstress', 'seamstress', 'riot', 'riot'];

test('剧本：两个角色、通用引擎、人数照标准表（爪牙和恶魔的位置全是暴乱）、有地图和夜晚顺序', () => {
  assert.equal(engineOf('sar'), 'snv');
  assert.deepEqual(rolesOf('sar'), ['seamstress', 'riot']);
  assert.equal(ROLES.riot.team, 'demon');
  assert.ok(SCRIPTS.sar.fibbin);
  assert.ok(NIGHT_ORDER.sar);
  assert.notEqual(getMap('sar').place, getMap('tb').place);
  for (let n = 5; n <= 15; n++) {
    const roles = rollRiot(n, makeRng(n));
    assert.equal(roles.length, n);
    assert.equal(roles.filter((r) => r === 'riot').length, DISTRIBUTION[n][2] + 1);
    assert.equal(roles.filter((r) => r === 'seamstress').length, n - DISTRIBUTION[n][2] - 1);
  }
  const g = new Game(players(9), { rng: makeRng(3), script: 'sar' });
  assert.equal(g.players.filter((p) => p.role === 'riot').length, 2);
  assert.deepEqual(g.bluffs, []);
});

test('首夜：7 人以上所有暴乱互认；女裁缝每局一次得知两人是否同一阵营', () => {
  const g = mk(S7);
  const r = night(g, { p1: ['p2', 'p6'] });
  assert.match(text(r.messages, 'p6'), /你们都是\*\*暴乱\*\*：\*\*7号 玩家7\*\*/);
  assert.match(text(r.messages, 'p7'), /\*\*6号 玩家6\*\*/);
  assert.match(text(r.messages, 'p1'), /\*\*不是\*\*同一阵营|\*\*是\*\*同一阵营/);
  g.dawn(); g.endDay();
  night(g);
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p1'), '用过了不再醒');
  assert.equal(g.aliveCount(), 7, '暴乱夜里不杀人');
});

test('骗人精：每局最多一次给善良玩家错误信息', () => {
  let lies = 0;
  for (let seed = 1; seed < 60; seed++) {
    const g = mk(S7, seed);
    night(g, { p1: ['p2', 'p6'], p2: ['p3', 'p4'], p3: ['p4', 'p5'] });
    const wrong = g.records?.filter?.((x) => /骗人精/.test(x.text)).length ?? g.timeline.filter((x) => /骗人精/.test(x.text)).length;
    assert.ok(wrong <= 1);
    if (g.fibbinUsed) lies++;
  }
  assert.ok(lies > 0, '骗人精至少在某些局里用过');
});

test('提名：被提名的人当场死亡、不投票；他接着提名（死了也能）；不能提名死人；不接就轮不到别人', () => {
  const g = mk(S7);
  night(g); g.dawn();
  const r = g.nominate('p1', 'p2');
  assert.equal(r.riot, true);
  assert.equal(g.get('p2').alive, false);
  assert.equal(g.riotChain, 'p2');
  assert.throws(() => g.nominate('p3', 'p4'), /轮到 2号 玩家2/);
  assert.throws(() => g.nominate('p2', 'p2'), /今天已经被提名|不能提名死亡/);
  g.nominate('p2', 'p3');
  assert.equal(g.get('p3').alive, false);
  assert.equal(g.block, null);
  assert.equal(g.executedToday, false);
});

test('所有暴乱都被提名死了：善良当场获胜', () => {
  const g = mk(S7);
  night(g); g.dawn();
  g.nominate('p1', 'p6');
  assert.ok(!g.winner);
  g.nominate('p6', 'p7');
  assert.equal(g.winner, 'good');
});

test('只剩两人：邪恶获胜；第三个白天结束暴乱还活着：邪恶获胜', () => {
  const g = mk(['seamstress', 'seamstress', 'seamstress', 'riot', 'riot']);
  night(g); g.dawn();
  g.nominate('p4', 'p1');
  g.nominate('p1', 'p2');
  g.nominate('p2', 'p3');
  assert.equal(g.winner, 'evil');

  const h = mk(S7);
  night(h); h.dawn(); h.endDay();
  night(h); h.dawn(); h.endDay();
  assert.ok(!h.winner);
  night(h); h.dawn();
  assert.equal(h.day, 3);
  h.endDay();
  assert.equal(h.winner, 'evil');
  assert.match(h.winReason, /第三个白天/);
});

test('第三天没人提名：说书人提名；说书人替时间到的人挑一名存活玩家', () => {
  const g = mk(S7);
  for (let d = 0; d < 2; d++) { night(g); g.dawn(); g.endDay(); }
  night(g); g.dawn();
  const t = g.riotPick(null);
  g.riotStoryteller(t.id);
  assert.equal(g.get(t.id).alive, false);
  assert.equal(g.riotChain, t.id);
  const next = g.riotPick(t.id);
  assert.ok(next.alive && next.id !== t.id);
});

// ───────────── 房间：整局 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, riotSeconds: 0.05 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
for (const [n, nominate] of [[9, true], [8, false], [12, true]]) {
  test(`房间：${n} 人局（2 真人 + 机器人）${nominate ? '真人提名引发提名链' : '没人提名，第三天说书人提名'}，第三天结束前分出胜负`, async () => {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'sar' } });
    room.judgeReady = () => false;
    room.botsConsider = () => {}; // 机器人不主动发起提名：提名链由真人或说书人开头
    for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
    await room.act('u1', 'join'); await room.act('u2', 'join');
    await room.act('u1', 'addBots', { count: n - 2 });
    await room.act('u1', 'start');
    const g = room.game;
    assert.equal(g.players.filter((p) => p.role === 'riot').length, DISTRIBUTION[n][2] + 1);
    let days = 0;
    while (!g.winner && !room.ended && days < 6) {
      for (let k = 0; k < 400 && g.phase === 'night'; k++) {
        if (!room.resolving) for (const pr of g.nightPrompts()) {
          if (room.isFake(pr.playerId) || g.choices[pr.playerId] || pr.waiting) continue;
          await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
        }
        await sleep(3);
      }
      if (g.winner || room.ended) break;
      days++;
      await until(() => room.roam || room.ended, 300);
      if (room.ended) break;
      await room.act('u1', 'gather').catch(() => {});
      await until(() => room.noms || room.ended, 300);
      const alive = ['u1', 'u2'].find((id) => g.get(id)?.alive);
      if (nominate && alive && g.phase === 'day' && !room.riotStep) {
        const t = g.alive().find((q) => q.id !== alive);
        await room.act(alive, 'nominate', { target: t.id });
        assert.equal(g.get(t.id).alive, false, '被提名的人当场死亡');
        assert.equal(room.vote, null, '没有投票');
      }
      await until(() => !room.riotStep, 3000);
      if (g.phase === 'day' && !g.winner && !room.ended) await room.autoDusk();
      await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
    }
    assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
    assert.ok(g.day <= 3, '最晚第三天');
    await room.teardown();
  });
}
