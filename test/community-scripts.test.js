// 两个社区剧本（2026-11-11 用户要的）：生死未卜（Uncertain Death，Matt）和人人可玩（Everyone Can Play，Ben Burns）。
// 生死未卜带来一个新角色：提线木偶（以为自己是镇民，其实是坐在恶魔旁边的爪牙，只有恶魔知道）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed, seatMarionette } from '../src/engine/snv.js';
import { ROLES, rolesOf, engineOf, SCRIPTS } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES, NOT_STEPS } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, script = 'ucd', seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script, misregister: 0 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms) { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); }

test('两个剧本：角色表照 botcscripts、用通用引擎、各有一张钟楼广场的变体地图；会醒的角色都在结算表里', () => {
  assert.equal(rolesOf('ucd').length, 23);
  assert.equal(rolesOf('ecp').length, 22);
  assert.deepEqual(rolesOf('ucd', 'demon'), ['nodashii', 'pukka']);
  assert.deepEqual(rolesOf('ecp', 'demon'), ['imp']);
  assert.ok(rolesOf('ucd', 'minion').includes('marionette'));
  for (const s of ['ucd', 'ecp']) {
    assert.equal(engineOf(s), 'snv');
    assert.equal(getMap(s).art, 'tb');
    assert.notEqual(getMap(s).weather, getMap('tb').weather);
    for (const r of SCRIPTS[s].roles) assert.ok(ROLES[r], `${s} 缺角色 ${r}`);
    const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
    for (const [id] of [...NIGHT_ORDER[s].first, ...NIGHT_ORDER[s].other]) {
      if (STEP_NAMES[id] || NOT_STEPS.has(id)) continue;
      assert.ok(steps.includes(id) || (id === 'godfather' && steps.includes('godfatherInfo')), `${s}：${id}`);
    }
  }
});

test('配板：人数总是对的、角色不重复、只有一个恶魔', () => {
  for (const s of ['ucd', 'ecp']) {
    for (let seed = 1; seed < 200; seed++) {
      for (const n of [5, 8, 11, 15]) {
        const roles = rollMixed(s, n, makeRng(seed));
        assert.equal(roles.length, n);
        assert.equal(new Set(roles).size, n);
        assert.equal(roles.filter((r) => ROLES[r].team === 'demon').length, 1);
      }
    }
  }
});

test('提线木偶：开局一定坐在恶魔旁边；以为自己是一个不在场的镇民', () => {
  for (let seed = 1; seed < 100; seed++) {
    const roles = ['marionette', 'clockmaker', 'empath', 'monk', 'oracle', 'nodashii', 'recluse', 'assassin'];
    const g = mk(roles, 'ucd', seed);
    const m = g.players.find((p) => p.role === 'marionette');
    const d = g.players.find((p) => p.role === 'nodashii');
    const n = g.players.length;
    assert.ok([1, n - 1].includes(Math.abs(m.seat - d.seat)), `第 ${seed} 局不相邻`);
    assert.equal(ROLES[m.shownRole].team, 'townsfolk');
    assert.ok(!g.players.some((q) => q !== m && q.role === m.shownRole), '以为的角色不在场');
    assert.ok(g.evilOf(m), '其实是邪恶的');
  }
  const a = ['marionette', 'x', 'y', 'z', 'pukka', 'w'];
  seatMarionette(a, makeRng(1));
  const i = a.indexOf('marionette'); const j = a.indexOf('pukka');
  assert.ok([1, a.length - 1].includes(Math.abs(i - j)));
});

test('提线木偶：首夜不醒、别的爪牙不知道他；恶魔知道（人少也知道）；能力像酒鬼一样不生效', () => {
  const roles = ['marionette', 'pukka', 'clockmaker', 'empath', 'monk', 'oracle', 'assassin', 'recluse'];
  const g = mk(roles);
  const m = g.players.find((p) => p.role === 'marionette');
  const d = g.players.find((p) => p.role === 'pukka');
  const a = g.players.find((p) => p.role === 'assassin');
  g.startNight();
  const msgs = g.evilMessages ?? [];
  const text = (id) => msgs.filter((x) => x.playerId === id).map((x) => x.text).join('\n');
  assert.equal(text(m.id), '', '提线木偶没有爪牙信息');
  assert.ok(!text(a.id).includes(g.name(m.id)), '别的爪牙不知道他');
  assert.match(text(d.id), /提线木偶/);
  assert.ok(!g.evilKnown[m.id], '他不在邪恶互认名单里');
  assert.ok(!g.evilKnown[a.id].some((x) => x.id === m.id));
  assert.ok(g.evilKnown[d.id].some((x) => x.id === m.id));
  assert.equal(g.abilityOf(m), m.shownRole);
  assert.ok(g.broken(m), '能力不生效');
  const small = mk(['marionette', 'pukka', 'clockmaker', 'empath', 'monk']);
  small.startNight();
  const dm = small.players.find((p) => p.role === 'pukka');
  assert.match((small.evilMessages ?? []).filter((x) => x.playerId === dm.id).map((x) => x.text).join('\n'), /提线木偶/, '5 人局恶魔也知道');
});

const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
function mockVoice() {
  let n = 0;
  return {
    async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; },
    async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {},
  };
}

test('提线木偶本人看到的是好人：身份牌不标邪恶，没有同伴和伪装', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'ucd' } });
  room.judgeReady = () => false;
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 7 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'marionette' });
  await room.act('u1', 'start');
  try {
    const g = room.game;
    const me = g.get('u1');
    assert.equal(me.role, 'marionette');
    const v = room.viewFor('u1').self;
    assert.equal(v.role.evil, false, '身份牌是好人');
    assert.equal(v.role.id, me.shownRole);
    assert.ok(!v.allies?.length, '没有邪恶同伴');
    assert.ok(!v.bluffs, '没有伪装');
  } finally { await room.teardown(); }
});

for (const script of ['ucd', 'ecp']) {
  test(`房间：${SCRIPTS[script].name} 9 人局（1 真人 + 8 机器人）能打完，有家`, async () => {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
    room.moonchildWaitMs = 5;
    room.judgeReady = () => false;
    room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
    await room.act('u1', 'join');
    await room.act('u1', 'addBots', { count: 8 });
    await room.act('u1', 'start');
    const g = room.game;
    try {
      assert.equal(room.town.id, script);
      assert.ok(room.homes);
      let days = 0;
      while (!g.winner && !room.ended && days < 20) {
        for (let k = 0; k < 400 && g.phase === 'night'; k++) {
          if (!room.resolving) for (const pr of g.nightPrompts()) {
            if (room.isFake(pr.playerId) || g.choices[pr.playerId] || pr.waiting) continue;
            await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count), role: pr.pickRole ? pr.roleOptions[0] : null }).catch(() => {});
          }
          if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id }).catch(() => {});
          await sleep(3);
        }
        if (g.winner || room.ended) break;
        days++;
        await until(() => room.roam || room.ended, 300);
        if (room.ended) break;
        await room.act('u1', 'gather').catch(() => {});
        if (g.winner || room.ended) break;
        if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
        if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
        await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
      }
      assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
    } finally { await room.teardown(); }
  });
}

test('提线木偶的座位：房主指定的座位不动——指定了提线木偶就把恶魔挪过去，两个都指定了就照房主的', () => {
  const a = ['marionette', 'x', 'y', 'z', 'pukka', 'w'];
  seatMarionette(a, makeRng(1), new Set([0]));
  assert.equal(a[0], 'marionette', '房主指定的提线木偶不动');
  assert.ok([1, 5].includes(a.indexOf('pukka')), '恶魔挪到他旁边');
  const b = ['marionette', 'x', 'y', 'z', 'pukka', 'w'];
  seatMarionette(b, makeRng(1), new Set([0, 4]));
  assert.deepEqual(b, ['marionette', 'x', 'y', 'z', 'pukka', 'w'], '两个都指定了：照房主的');
});
