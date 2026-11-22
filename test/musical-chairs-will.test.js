// 2026-11-23 抢椅子 · 空座位（Musical Chairs，Will 版，botcscripts 995 号 12.0.0）：
// 自制传奇角色「抢椅子」——角色跟着座位走，所有玩家开局都是善良，邪恶角色在空座位上；每晚入夜前可以和玩家或空座位交换（每人两次）。
// 新爪牙街头风琴手（集石百科）：投票闭眼、票数保密，每晚选要不要醉酒到黄昏。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, fabledOf, isEvilRole } from '../src/engine/roles.js';
import { NIGHT_ORDER, MIX_STEPS, NOT_STEPS, STEP_NAMES } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, st = {}) => { const g = new Game(players(roles.length), { roles, rng: makeRng(7), script: 'mcw' }); Object.assign(g.st, st); return g; };
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t.targets ?? t, t.role ? { role: t.role } : {});
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages ?? []), ...r.messages] };
}

test('抢椅子 · 空座位：角色表、传奇角色、地图、夜晚顺序', () => {
  assert.equal(rolesOf('mcw').length, 22);
  assert.ok(rolesOf('mcw').every((r) => ROLES[r]));
  assert.deepEqual(fabledOf('mcw'), ['musicalchairs', 'gardener']);
  assert.equal(getMap('mcw').id, 'mcw');
  for (const [id] of [...NIGHT_ORDER.mcw.first, ...NIGHT_ORDER.mcw.other]) assert.ok(NOT_STEPS.has(id) || STEP_NAMES[id] || [...MIX_STEPS.first, ...MIX_STEPS.other].includes(id), id);
  const f = MIX_STEPS.first;
  assert.ok(f.indexOf('snakecharmer') < f.indexOf('organgrinder') && f.indexOf('organgrinder') < f.indexOf('eviltwin'), '官方表：舞蛇人、街头风琴手、镜像双子');
});

test('开局：所有玩家都是善良；邪恶角色在空座位上（少一个爪牙）；每人能换两次', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const n = 5 + (seed % 11);
    const rng = makeRng(seed);
    const g = new Game(players(n), { roles: rollMixed('mcw', n, rng), rng, script: 'mcw' });
    assert.ok(g.players.every((p) => !g.evilOf(p) && !isEvilRole(p.role)), `${n} 人 seed ${seed}：有人开局是邪恶`);
    assert.equal(new Set(g.players.map((p) => p.role)).size + g.players.filter((p) => p.role === 'villageidiot').length - (g.players.some((p) => p.role === 'villageidiot') ? 1 : 0), n, '除了村夫，角色不重复');
    const minions = n >= 13 ? 2 : n >= 10 ? 1 : 0;
    assert.equal(g.chairs.length, minions + 1, `${n} 人：空座位是恶魔 + ${minions} 个爪牙`);
    assert.ok(g.chairs.every((c) => c.evil && isEvilRole(c.role)));
    assert.ok(g.chairs.some((c) => c.role === 'leviathan'));
    assert.ok(g.players.every((p) => g.chairLeft[p.id] === 2));
  }
});

test('换座位：换到空座位拿走那里的角色和阵营；和玩家换两人互换；被换的人不知道是谁；每人两次', () => {
  const g = mk(['empath', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'leviathan']);
  assert.deepEqual(g.chairs.map((c) => c.role), ['leviathan']);
  const k = 0;
  let msgs = g.chairSwap({ p1: `chair:${k}` });
  assert.equal(g.get('p1').role, 'leviathan');
  assert.equal(g.evilOf(g.get('p1')), true);
  assert.deepEqual(g.chairs[0], { role: 'empath', evil: false, gained: null, gainedFake: false, shown: 'empath' });
  assert.match(text(msgs, 'p1'), /空座位 A.*利维坦.*邪恶/);
  msgs = g.chairSwap({ p1: 'p2' });
  assert.equal(g.get('p2').role, 'leviathan');
  assert.equal(g.evilOf(g.get('p2')), true);
  assert.equal(g.get('p1').role, 'washerwoman');
  assert.equal(g.evilOf(g.get('p1')), false);
  assert.match(text(msgs, 'p2'), /有人和你交换了座位：你现在是\*\*利维坦\*\*，\*\*邪恶\*\*/);
  assert.doesNotMatch(text(msgs, 'p2'), /玩家1/, '不告诉被换的人是谁换的');
  assert.equal(g.chairLeft.p1, 0);
  assert.equal(g.chairOptions('p1'), null, '两次用完了');
  assert.deepEqual(g.chairSwap({ p1: 'p3' }), [], '用完了再换没效果');
  assert.equal(g.chairLeft.p2, 2, '被换的人不算次数');
});

test('空座位上的利维坦：算在场（天亮宣布、第 5 天邪恶获胜），没人坐也不会让善良获胜', () => {
  const g = mk(['empath', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'leviathan']);
  assert.equal(g.leviOn(), true);
  night(g); g.dawn();
  assert.equal(g.winner, null, '恶魔在空座位上：善良还没赢');
  for (let d = 1; d < 5 && !g.winner; d++) { g.endDay(); night(g); g.dawn(); }
  assert.equal(g.day, 5);
  g.endDay();
  assert.equal(g.winner, 'evil', '第 5 天结束，利维坦获胜');
});

test('利维坦被处决：善良获胜；相克：利维坦在场时祖母的孙子被处决，邪恶获胜', () => {
  const g = mk(['empath', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'leviathan']);
  g.chairSwap({ p3: 'chair:0' });
  night(g); g.dawn();
  g.block = 'p3'; g.endDay();
  assert.equal(g.winner, 'good');

  const h = mk(['grandmother', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'leviathan']);
  night(h); h.dawn();
  assert.ok(h.grandchild);
  h.block = h.grandchild; h.endDay();
  assert.equal(h.winner, 'evil');
});

test('新变成邪恶的人：首夜之后换过去的，得知现在的邪恶同伴', () => {
  const g = mk(['empath', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'recluse', 'snakecharmer', 'artist', 'fisherman', 'baron', 'leviathan']);
  assert.equal(g.chairs.length, 2, '12 人：恶魔 + 1 个爪牙');
  night(g); g.dawn(); g.endDay();
  const dem = g.chairs.findIndex((c) => c.role === 'leviathan');
  g.chairSwap({ p1: `chair:${dem}` });
  const min = g.chairs.findIndex((c) => ROLES[c.role].team === 'minion');
  const msgs = g.chairSwap({ p2: `chair:${min}` });
  assert.match(text(msgs, 'p2'), /现在的邪恶同伴：\*\*1号 玩家1\*\*（利维坦）/);
});

test('街头风琴手：每晚选醉不醉；清醒时秘密投票，醉了照常', () => {
  const g = mk(['empath', 'washerwoman', 'dreamer', 'fortuneteller', 'clockmaker', 'juggler', 'recluse', 'snakecharmer', 'organgrinder', 'leviathan']);
  const og = g.chairs.findIndex((c) => c.role === 'organgrinder');
  if (og < 0) { g.chairs.push({ role: 'organgrinder', evil: true, gained: null, gainedFake: false, shown: 'organgrinder' }); }
  g.chairSwap({ p1: `chair:${og < 0 ? g.chairs.length - 1 : og}` });
  assert.equal(g.get('p1').role, 'organgrinder');
  g.startNight();
  const pr = g.nightPrompts().find((x) => x.playerId === 'p1');
  assert.deepEqual(pr.roleOptions, ['og_drunk', 'og_sober']);
  g.submitChoice('p1', [], { role: 'og_sober' });
  for (const q of g.nightPrompts()) if (!g.choices[q.playerId]) g.autoChoose(q.playerId);
  g.resolveNight(); g.dawn();
  assert.equal(g.ogSecret(), true);
  g.endDay();
  night(g, { p1: { targets: [], role: 'og_drunk' } }); g.dawn();
  assert.equal(g.ogSecret(), false, '醉了：明天照常睁眼投票');
});

test('抢椅子 · 空座位：随机跑完整局不崩（每晚随机有人换）', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const rng = makeRng(seed);
    const n = 5 + (seed % 11);
    const g = new Game(players(n), { roles: rollMixed('mcw', n, rng), rng, script: 'mcw' });
    for (let d = 0; d < 20 && !g.winner; d++) {
      const picks = {};
      for (const p of g.players) {
        const o = g.chairOptions(p.id);
        if (!o || rng() > 0.3) continue;
        const all = [...o.players, ...o.chairs.map((k) => `chair:${k}`)];
        picks[p.id] = all[Math.floor(rng() * all.length)];
      }
      g.chairSwap(picks);
      night(g);
      if (g.winner) break;
      g.dawn();
      if (g.winner) break;
      const al = g.alive();
      g.block = al[Math.floor(rng() * al.length)].id;
      g.endDay();
    }
    assert.ok(g.winner, `${n} 人 seed ${seed} 打了 20 天没结束`);
    const evil = g.players.filter((p) => g.evilOf(p)).length;
    const total = g.chairs.filter((c) => c.evil).length + evil;
    assert.ok(total >= 1, '邪恶角色没有凭空消失');
  }
});

test('房间：入夜前换座位（真人换到空座位、机器人随便换），街头风琴手清醒时投票保密', async () => {
  const { Room } = await import('../src/server/room.js');
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
  const voice = () => { let n = 0; return { async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} }; };
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: voice(), settings: { chooseSeconds: 2, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, mode: 'auto', shuffle: false, script: 'mcw' } });
  room.moonchildWaitMs = 5; room.judgeReady = () => false; room.dawnPad = [0, 0];
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 9 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'organgrinder' }); // 园丁：房主指定的邪恶角色也放到空座位上
  room.act('u1', 'start');
  try {
    await until(() => room.chairAsk, 3000);
    const g = room.game;
    assert.ok(g.chairs.some((c) => c.role === 'organgrinder'), '指定的街头风琴手在空座位上');
    assert.equal(g.evilOf(g.get('u1')), false, '开局是善良');
    const me = room.viewFor('u1').self.chair;
    assert.equal(me.left, 2);
    assert.ok(room.viewFor('u1').chairs.length >= 2 && room.viewFor('u1').chairs.every((c) => !c.roleName), '空座位看得到，上面是什么看不到');
    room.chairAsk.picks = {}; // 这条测真人：机器人这晚都不换（不然可能先换走那个座位）
    const k = g.chairs.findIndex((c) => c.role === 'organgrinder');
    await room.act('u1', 'chair', { target: `chair:${k}` });
    await until(() => !room.chairAsk && g.phase === 'night', 3000);
    assert.equal(g.get('u1').role, 'organgrinder');
    assert.equal(g.evilOf(g.get('u1')), true);
    assert.ok(room.inbox.get('u1').some((m) => /空座位/.test(m.text)));
    for (let i = 0; i < 400 && g.phase === 'night'; i++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: [], role: pr.playerId === 'u1' ? 'og_sober' : undefined }).catch(() => {});
      await sleep(5);
    }
    await until(() => g.phase === 'day', 5000);
    if (g.winner || !g.get('u1').alive || g.snvBroken(g.get('u1'))) return; // 随机到解谜大师让他醉了这类：这条测不了
    assert.equal(g.ogSecret(), true);
    room.openNominations?.();
    const target = g.alive().find((q) => q.id !== 'u1');
    room.pendingNom = { nominator: 'u1', nominee: target.id };
    room.openVote();
    assert.equal(room.vote.secret, true);
    const v = room.viewFor('u1');
    assert.equal(v.vote.hidden, true);
    await until(() => !room.vote, 3000);
    const after = room.viewFor('u1');
    assert.equal(after.lastVote.count, null, '票数保密');
    assert.equal(after.lastVote.outcome, 'secret');
    assert.equal(after.block, null, '处决台上是谁不公开');
    assert.equal(after.votes.at(-1).voters.length, 0);
  } finally { await room.teardown(); }
});
