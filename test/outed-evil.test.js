// 横行霸道（Outed Evil v4.5.0，作者 Manny；用户 2026-11-19 发来剧本卡）：新角色炼金术士、异端分子、恐惧之灵、痢蛭，
// 官方相克：痢蛭 × 异端分子只能有一个在场；杂耍艺人 × 食人族。口径照集石百科和官方 jinxes.json。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed } from '../src/engine/snv.js';
import { ROLES, rolesOf, SCRIPTS, engineOf, DISTRIBUTION } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES, NOT_STEPS } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script: 'oe', misregister: 0 });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  const msgs = [...r.messages];
  for (let k = 0; r.pause && k < 10; k++) { g.autoChoose(r.pause); r = g.resolveNight(); msgs.push(...r.messages); }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...msgs] };
}
const execute = (g, by, id) => { g.nominate(by, id); g.recordVote(id, g.alive().map((q) => q.id)); g.endDay(); };

test('剧本：25 个角色、通用引擎、7–15 人、哨兵；会醒的角色都在结算表里；地图是暗流涌动的雨夜', () => {
  assert.equal(engineOf('oe'), 'snv');
  assert.equal(rolesOf('oe').length, 25);
  for (const r of SCRIPTS.oe.roles) assert.ok(ROLES[r], r);
  assert.deepEqual(rolesOf('oe', 'demon'), ['lleech', 'imp']);
  assert.ok(SCRIPTS.oe.sentinel);
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const [id] of [...NIGHT_ORDER.oe.first, ...NIGHT_ORDER.oe.other]) if (!STEP_NAMES[id] && !NOT_STEPS.has(id)) assert.ok(steps.includes(id), id);
  assert.equal(getMap('oe').art, 'tb');
  assert.equal(getMap('oe').weather, 'drizzle');
});

test('配板：痢蛭和异端分子不会同时在场（官方相克）；人数照人数表', () => {
  let lleech = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const n = 7 + (seed % 9);
    const roles = rollMixed('oe', n, makeRng(seed));
    assert.equal(roles.length, n);
    if (roles.includes('lleech')) { lleech++; assert.ok(!roles.includes('heretic'), roles.join(',')); }
    assert.equal(roles.filter((r) => ROLES[r].team === 'minion').length, DISTRIBUTION[n][2]);
  }
  assert.ok(lleech > 150);
  const g = mk(['alchemist', 'sailor', 'monk', 'savant', 'heretic', 'poisoner', 'lleech']);
  assert.ok(!g.players.some((q) => q.role === 'heretic'), '房主都指定了：异端分子换成别的外来者');
});

test('炼金术士：拿一个不在场的爪牙的能力，首夜得知；在那个爪牙醒的时候醒、像爪牙一样用', () => {
  const g = mk(['alchemist', 'sailor', 'monk', 'savant', 'tealady', 'fearmonger', 'imp']);
  const a = g.get('p1');
  assert.ok(a.gained && ROLES[a.gained].team === 'minion' && a.gained !== 'fearmonger', `拿到 ${a.gained}`);
  assert.equal(g.evilOf(a), false, '还是善良');
  a.gained = 'poisoner';
  const r = night(g, { p1: ['p4'] });
  assert.match(text(r.messages, 'p1'), /炼金术士.*投毒者/);
  assert.ok(g.snvPoisoned(g.get('p4')), '像投毒者一样下了毒');
});

test('异端分子：对调胜负，死了也对调；中毒时不对调', () => {
  const g = mk(['sailor', 'monk', 'savant', 'tealady', 'heretic', 'poisoner', 'imp']);
  night(g, { p6: ['p1'] }); g.dawn();
  g.get('p5').alive = false; // 死了也对调
  execute(g, 'p1', 'p7');
  assert.equal(g.winner, 'evil', '处决了恶魔，本该善良赢，对调成邪恶赢');
  assert.match(g.winReason, /异端分子/);
  const h = mk(['sailor', 'monk', 'savant', 'tealady', 'heretic', 'poisoner', 'imp']);
  night(h, { p6: ['p5'] }); h.dawn();
  execute(h, 'p1', 'p7');
  assert.equal(h.winner, 'good', '异端分子中毒：不对调');
});

test('恐惧之灵：第一次选、换人时全场得知；他提名并处决了选中的人，那人的阵营落败；别人提名不算', () => {
  const g = mk(['sailor', 'monk', 'savant', 'tealady', 'juggler', 'fearmonger', 'imp']);
  night(g, { p6: ['p3'] });
  assert.equal(g.fearNews, 1);
  assert.deepEqual(g.fear, { by: 'p6', target: 'p3' });
  g.dawn(); g.endDay();
  night(g, { p6: ['p3'] });
  assert.equal(g.fearNews, 1, '没换人：不再公告');
  g.dawn();
  execute(g, 'p6', 'p3');
  assert.equal(g.winner, 'evil', '处决了善良的 3 号：善良落败');
  const h = mk(['sailor', 'monk', 'savant', 'tealady', 'juggler', 'fearmonger', 'imp']);
  night(h, { p6: ['p3'] }); h.dawn();
  execute(h, 'p1', 'p3');
  assert.ok(!h.winner, '不是恐惧之灵提名的：游戏继续');
});

test('痢蛭：首夜选的宿主中毒；宿主活着时处决痢蛭不会死；宿主死了痢蛭跟着死', () => {
  const g = mk(['sailor', 'monk', 'savant', 'fisherman', 'juggler', 'poisoner', 'lleech']); // 不放茶艺师：她会护住宿主
  night(g, { p7: ['p3'] });
  assert.equal(g.lleechHost, 'p3');
  assert.ok(g.snvPoisoned(g.get('p3')));
  g.dawn();
  execute(g, 'p1', 'p7');
  assert.equal(g.get('p7').alive, true, '宿主还活着：痢蛭没死');
  assert.ok(!g.winner);
  night(g, { p7: ['p1'] }); g.dawn();
  execute(g, 'p2', 'p3');
  assert.equal(g.get('p7').alive, false, '宿主死了，痢蛭跟着死');
  assert.equal(g.winner, 'good');
});

test('相克：杂耍艺人第一天猜了、当天被处决，今晚食人族得知他猜对了几个', () => {
  const g = mk(['juggler', 'cannibal', 'monk', 'savant', 'tealady', 'poisoner', 'imp']);
  night(g, { p6: ['p3'] }); g.dawn();
  g.juggled.p1 = { day: g.day, correct: 2, count: 3 };
  execute(g, 'p4', 'p1');
  const r = night(g, { p6: ['p3'], p7: ['p4'] });
  assert.match(text(r.messages, 'p2'), /\*\*2\*\*/); // 食人族不知道自己拿到的是什么能力：只听到数字
});

const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, rpsSeconds: 0.05 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：横行霸道 9 人局（2 真人 + 7 机器人）能打完；恐惧之灵选人时天亮公告', async () => {
  for (let k = 0; k < 2; k++) {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'oe' } });
    room.judgeReady = () => false;
    for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
    await room.act('u1', 'join'); await room.act('u2', 'join');
    await room.act('u1', 'addBots', { count: 7 });
    room.roleAssign = k === 0 ? { u1: 'fearmonger' } : { u2: 'lleech' };
    await room.act('u1', 'start');
    const g = room.game;
    try {
      let days = 0;
      while (!g.winner && !room.ended && days < 15) {
        for (let i = 0; i < 2000 && g.phase === 'night'; i++) {
          if (!room.resolving || room.revivePending) for (const pr of g.nightPrompts()) {
            if (room.isFake(pr.playerId) || pr.waiting) continue;
            if (g.choices[pr.playerId] && room.revivePending !== pr.playerId) continue;
            await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
          }
          await sleep(3);
        }
        if (g.winner || room.ended) break;
        if (days === 0 && k === 0) assert.ok(room.log.some((l) => /恐惧之灵/.test(l.text)) || g.timeline.some((e) => /恐惧之灵失效/.test(e.text)), '天亮公告恐惧之灵选了人（被水手弄醉的那晚不算）');
        days++;
        await until(() => room.roam || room.ended, 300);
        if (room.ended) break;
        await room.act('u1', 'gather').catch(() => {});
        await until(() => room.noms || room.ended, 300);
        if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
        if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
        await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
      }
      assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
    } finally { await room.teardown(); }
  }
});
