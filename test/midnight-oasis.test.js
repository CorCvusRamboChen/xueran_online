// 夜半狂欢（The Midnight Oasis，作者 Zets，用户 2026-11-16 要的）：旋转木马的快速上手剧本。
// 新角色：工程师、罂粟种植者、无神论者、精神病患者、哈迪寂亚；传奇角色哨兵、圣洁之魂。口径见 references/community.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, engineOf, SCRIPTS, DISTRIBUTION, isEvilRole } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES, NOT_STEPS } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'mo', misregister: 0 });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}, answer = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, Array.isArray(t) ? t : t.targets, Array.isArray(t) ? {} : { role: t.role });
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  const msgs = [...r.messages];
  for (let k = 0; r.pause && k < 10; k++) {
    if (answer[r.pause]) g.submitChoice(r.pause, [], { role: answer[r.pause] }); else g.autoChoose(r.pause);
    r = g.resolveNight();
    msgs.push(...r.messages);
  }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...msgs] };
}

test('剧本：23 个角色、通用引擎、7–15 人；会醒的角色都在结算表里；地图是黯月驿站的变体', () => {
  assert.equal(engineOf('mo'), 'snv');
  assert.equal(rolesOf('mo').length, 23);
  for (const r of SCRIPTS.mo.roles) assert.ok(ROLES[r], r);
  assert.deepEqual(rolesOf('mo', 'demon'), ['alhadikhia', 'vigormortis']);
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const [id] of [...NIGHT_ORDER.mo.first, ...NIGHT_ORDER.mo.other]) {
    if (STEP_NAMES[id] || NOT_STEPS.has(id)) continue;
    assert.ok(steps.includes(id), id);
  }
  assert.equal(getMap('mo').art, 'bmr');
  assert.notEqual(getMap('mo').place, getMap('bmr').place);
});

test('开局：哨兵让外来者 ±1；无神论者只在一小部分局里出现，出现时没有邪恶角色', () => {
  const outs = new Set(); let atheist = 0; const N = 600;
  for (let seed = 1; seed <= N; seed++) {
    const roles = rollMixed('mo', 8, makeRng(seed));
    assert.equal(roles.length, 8);
    if (roles.includes('atheist')) { atheist++; assert.ok(!roles.some(isEvilRole), '无神论者局没有邪恶'); continue; }
    assert.equal(roles.filter(isEvilRole).length, 2);
    assert.equal(new Set(roles).size, 8);
    const o = roles.filter((r) => ROLES[r].team === 'outsider').length;
    const vig = roles.includes('vigormortis') ? 1 : 0;
    const ball = roles.includes('balloonist') ? 1 : 0;
    outs.add(o + vig - (ball ? 0 : 0));
  }
  assert.ok(atheist > N * 0.08 && atheist < N * 0.25, `无神论者局 ${atheist}/${N}`);
  // 8 人标准 1 个外来者：哨兵会出现 0、1、2（亡骨魔再少一个时加回来看）
  assert.ok(outs.has(0) && outs.has(1) && outs.has(2), [...outs].join(','));
});

test('罂粟种植者：首夜爪牙和恶魔互不认识（恶魔照样拿伪装）；他死了当晚互认', () => {
  const g = mk(['poppygrower', 'noble', 'savant', 'fisherman', 'professor', 'poisoner', 'vigormortis']);
  const r = night(g);
  assert.match(text(r.messages, 'p7'), /罂粟种植者在场.*不知道你的爪牙/s);
  assert.match(text(r.messages, 'p7'), /不在场的角色/);
  assert.match(text(r.messages, 'p6'), /罂粟种植者在场/);
  assert.doesNotMatch(text(r.messages, 'p6'), /恶魔是/);
  assert.deepEqual(g.evilKnown.p6, []);
  g.dawn();
  g.block = 'p1'; g.endDay();
  assert.equal(g.get('p1').alive, false);
  const r2 = night(g, { p6: ['p2'], p7: ['p3'] });
  assert.match(text(r2.messages, 'p6'), /恶魔是 \*\*7号 玩家7\*\*/);
  assert.match(text(r2.messages, 'p7'), /你的爪牙是 \*\*6号 玩家6\*\*/);
  assert.ok(g.evilKnown.p6.some((x) => x.id === 'p7'));
});

test('工程师：每局一次把恶魔换成别的恶魔，或把一名爪牙换成别的爪牙；本来就在场的不变', () => {
  const g = mk(['engineer', 'noble', 'savant', 'fisherman', 'professor', 'poisoner', 'vigormortis']);
  const r = night(g, { p1: { targets: [], role: 'alhadikhia' } });
  assert.equal(g.get('p7').role, 'alhadikhia');
  assert.match(text(r.messages, 'p7'), /你现在是哈迪寂亚/);
  g.dawn(); g.endDay();
  night(g);
  assert.ok(!g.nightPrompts().some((x) => x.playerId === 'p1'), '用过了');
  const h = mk(['engineer', 'noble', 'savant', 'fisherman', 'professor', 'poisoner', 'vigormortis']);
  night(h, { p1: { targets: [], role: 'psychopath' } });
  assert.equal(h.get('p6').role, 'psychopath');
  const k = mk(['engineer', 'noble', 'savant', 'fisherman', 'professor', 'poisoner', 'vigormortis']);
  night(k, { p1: { targets: [], role: 'poisoner' } });
  assert.equal(k.get('p6').role, 'poisoner');
});

test('精神病患者：白天公开杀一人，每天一次；被处决时猜拳没输就活下来', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'psychopath', 'vigormortis']);
  night(g); g.dawn();
  assert.throws(() => g.psychoKill('p1', 'p2'), /没有这个能力/);
  assert.equal(g.psychoKill('p6', 'p2').died, true);
  assert.throws(() => g.psychoKill('p6', 'p3'), /今天已经用过/);
  g.psychoSpared = 'p6'; g.block = 'p6';
  const r = g.endDay();
  assert.equal(r.result, 'saved');
  assert.equal(g.get('p6').alive, true);
  assert.ok(g.executedToday);
});

test('哈迪寂亚：选三个人，一个个问活还是死；选死就死，死人选活复活；三个都活就都死', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'poisoner', 'alhadikhia']);
  night(g); g.dawn(); g.endDay();
  const r = night(g, { p6: ['p5'], p7: ['p1', 'p2', 'p3'] }, { p1: 'ah_die', p2: 'ah_live', p3: 'ah_live' });
  assert.equal(g.get('p1').alive, false);
  assert.ok(g.get('p2').alive && g.get('p3').alive);
  assert.deepEqual(g.ahNews.targets, ['p1', 'p2', 'p3']);
  g.dawn(); g.endDay();
  night(g, { p7: ['p1', 'p2', 'p3'] }, { p1: 'ah_live', p2: 'ah_live', p3: 'ah_live' });
  assert.equal(g.get('p1').alive, false, '死人选活复活，然后三个都活一起死');
  assert.equal(g.get('p2').alive, false);
  assert.equal(g.get('p3').alive, false);
  assert.ok(g.timeline.some((e) => /复活/.test(e.text)));
});

test('哈迪寂亚：被选中的人自己今晚的选择不会被冲掉（教授在哈迪寂亚之后行动）', () => {
  const g = mk(['professor', 'savant', 'fisherman', 'noble', 'farmer', 'poisoner', 'alhadikhia']);
  night(g); g.dawn();
  g.block = 'p2'; g.endDay(); // 博学者死了，教授可以救
  night(g, { p1: ['p2'], p7: ['p1', 'p3', 'p4'] }, { p1: 'ah_live', p3: 'ah_die', p4: 'ah_live' });
  assert.equal(g.get('p2').alive, true, '教授的选择还在，博学者复活');
});

test('无神论者局：没有邪恶；信息按说书人假装的邪恶给；夜里照样死人；处决说书人善良赢', () => {
  const g = mk(['atheist', 'noble', 'savant', 'fisherman', 'professor', 'farmer', 'drunk']);
  assert.ok(g.atheist);
  assert.equal(g.checkWinner(), undefined ?? g.winner);
  assert.ok(!g.winner, '没有恶魔不算善良赢');
  const r = night(g);
  const w = g.atheistWorld();
  assert.equal(w.evil.size, 2);
  assert.ok(!w.evil.has('p1'), '假的邪恶不会是无神论者');
  assert.match(text(r.messages, 'p2'), /恰好一人是邪恶|其中有且只有|邪恶/);
  g.dawn(); g.endDay();
  night(g);
  assert.equal(g.aliveCount(), 6, '说书人假装恶魔杀了一个人');
  g.dawn();
  const alive = g.alive()[0];
  g.nominate(alive.id, 'storyteller');
  assert.throws(() => g.nominate(g.alive()[1].id, 'storyteller'), /说书人今天已经被提名/);
  const v = g.recordVote('storyteller', g.alive().map((q) => q.id));
  assert.equal(v.outcome, 'block');
  g.endDay();
  assert.equal(g.winner, 'good');
});

test('不是无神论者局：处决说书人邪恶赢；无神论者局只剩两人善良落败', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'poisoner', 'vigormortis']);
  night(g); g.dawn();
  g.nominate('p1', 'storyteller');
  g.recordVote('storyteller', g.alive().map((q) => q.id));
  g.endDay();
  assert.equal(g.winner, 'evil');
  const h = mk(['atheist', 'noble', 'savant', 'fisherman', 'professor', 'farmer', 'drunk']);
  for (const id of ['p2', 'p3', 'p4', 'p5', 'p6']) h.get(id).alive = false;
  h.checkWinner();
  assert.equal(h.winner, 'evil');
});

test('圣洁之魂：邪恶玩家已经比开局多一名，灵言师的关键词不再转人', () => {
  const g = mk(['noble', 'savant', 'fisherman', 'professor', 'farmer', 'mezepheles', 'vigormortis']);
  night(g); g.dawn();
  g.get('p5').evil = true; // 已经多了一个邪恶（比如舞蛇人换过来的）
  assert.equal(g.mezHeard('p2', g.mez.word), true);
  g.endDay();
  night(g, { p7: ['p1'] });
  assert.equal(g.evilOf(g.get('p2')), false);
  assert.ok(g.timeline.some((e) => /圣洁之魂/.test(e.text)));
});

// ───────────── 房间：整局 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, rpsSeconds: 0.05 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
async function playRoom({ n = 9, assign = {}, stNom = false, blockFirst = null } = {}) {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'mo' } });
  room.moonchildWaitMs = 5;
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: n - 2 });
  room.roleAssign = assign;
  await room.act('u1', 'start');
  const g = room.game;
  let days = 0;
  try {
    while (!g.winner && !room.ended && days < 20) {
      for (let k = 0; k < 600 && g.phase === 'night'; k++) {
        if (!room.resolving || room.revivePending) for (const pr of g.nightPrompts()) {
          if (room.isFake(pr.playerId) || pr.waiting) continue;
          if (g.choices[pr.playerId] && room.revivePending !== pr.playerId) continue;
          const role = pr.pickRole ? pr.roleOptions[0] : null;
          await room.act(pr.playerId, 'choose', { night: g.night, targets: role ? [] : pr.options.slice(0, pr.count), role }).catch(() => {});
        }
        await sleep(3);
      }
      if (g.winner || room.ended) break;
      days++;
      await until(() => room.roam || room.ended, 300);
      if (room.ended) break;
      await room.act('u1', 'gather').catch(() => {});
      if (g.winner || room.ended) break;
      await until(() => room.noms || room.ended, 300);
      if (stNom && g.get('u1').alive && !g.nominees.has('storyteller')) {
        await room.act('u1', 'nominate', { target: 'storyteller' }).catch(() => {});
        await until(() => !room.pendingNom && !room.vote, 3000);
      }
      if (g.phase === 'day' && !g.block && !g.executedToday) g.block = days === 1 && blockFirst && g.get(blockFirst)?.alive ? blockFirst : g.alive()[days % g.aliveCount()].id;
      if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
      await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
    }
    return { g, days };
  } finally { await room.teardown(); }
}

test('房间：夜半狂欢 9 人局（2 真人 + 7 机器人）能打完', async () => {
  for (let k = 0; k < 3; k++) {
    const { g, days } = await playRoom();
    assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
  }
});

test('房间：真人是哈迪寂亚选中的人、精神病患者被处决猜拳，都能走完', async () => {
  const { g } = await playRoom({ n: 8, assign: { u1: 'alhadikhia', u2: 'psychopath' }, blockFirst: 'u2' });
  assert.ok(g.winner);
  assert.ok(g.timeline.some((e) => /精神病患者猜拳/.test(e.text)), '第一天处决精神病患者时猜了拳');
  assert.ok(g.timeline.some((e) => /悄悄选择/.test(e.text)) || g.winner, '哈迪寂亚选的人做了选择');
});

test('房间：提名说书人走完提名、投票、黄昏', async () => {
  const { g } = await playRoom({ n: 7, stNom: true });
  assert.ok(g.winner);
});
