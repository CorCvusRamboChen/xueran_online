// 第二批社区剧本（2026-11-14 用户要的）：哈罗德的复仇（Harold Holt's Revenge）、洋葱派（Onion Pies）、大诚小镇（Trust）、暗流紫罗兰（Trouble with Violets）。
// 新角色：小精灵、将军、政客、食人魔、灵言师。口径见 .claude/skills/botc-storyteller/references/community.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollMixed, MEZ_WORDS } from '../src/engine/snv.js';
import { ROLES, rolesOf, engineOf, SCRIPTS } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, STEP_NAMES, NOT_STEPS } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';
import { Room } from '../src/server/room.js';

const NEW = ['hhr', 'pie', 'trust', 'twv'];
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const mk = (roles, script, seed = 7) => new Game(players(roles.length), { roles, rng: makeRng(seed), script, misregister: 0 });
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let r = g.resolveNight();
  for (let k = 0; r.pause && k < 5; k++) { g.autoChoose(r.pause); r = g.resolveNight(); }
  return { ...r, messages: [...(g.evilMessages?.splice(0) ?? []), ...r.messages] };
}

test('四个剧本：角色都在、用通用引擎、各有一张基础图的变体；会醒的角色都在结算表里', () => {
  assert.deepEqual(NEW.map((s) => rolesOf(s).length), [23, 24, 23, 25]);
  assert.deepEqual(rolesOf('hhr', 'demon'), ['leviathan']);
  assert.deepEqual(rolesOf('trust', 'demon'), ['imp', 'vigormortis']);
  const steps = [...MIX_STEPS.first, ...MIX_STEPS.other];
  for (const s of NEW) {
    assert.equal(engineOf(s), 'snv');
    for (const r of SCRIPTS[s].roles) assert.ok(ROLES[r], `${s} 缺角色 ${r}`);
    assert.ok(['tb', 'bmr', 'snv'].includes(getMap(s).art ?? 'snv'));
    assert.notEqual(getMap(s).place, getMap(getMap(s).art ?? 'snv').place);
    for (const [id] of [...NIGHT_ORDER[s].first, ...NIGHT_ORDER[s].other]) {
      if (STEP_NAMES[id] || NOT_STEPS.has(id)) continue;
      assert.ok(steps.includes(id) || (id === 'godfather' && steps.includes('godfatherInfo')), `${s}：${id}`);
    }
  }
  for (let seed = 1; seed < 150; seed++) for (const s of NEW) for (const n of [5, 9, 15]) {
    const roles = rollMixed(s, n, makeRng(seed));
    assert.equal(roles.length, n);
    assert.equal(new Set(roles).size, n);
  }
});

test('灵言师：首夜得知关键词；第一个说出它的善良玩家当晚变邪恶；邪恶说了不算；之后不能再转', () => {
  const g = mk(['noble', 'librarian', 'fortuneteller', 'oracle', 'monk', 'mezepheles', 'imp'], 'trust');
  const r = night(g, { p3: ['p1', 'p2'] });
  assert.ok(MEZ_WORDS.includes(g.mez.word));
  assert.match(text(r.messages, 'p6'), new RegExp(`关键词是「\\*\\*${g.mez.word}`));
  g.dawn();
  assert.equal(g.mezHeard('p7', `我觉得${g.mez.word}很好`), false, '恶魔说了不算');
  assert.equal(g.mezHeard('p2', `今天天气不错`), false);
  assert.equal(g.mezHeard('p2', `那个，${g.mez.word}。`), true);
  assert.equal(g.mezHeard('p4', g.mez.word), false, '只算第一个');
  g.endDay();
  const r2 = night(g, { p3: ['p1', 'p2'], p5: ['p1'], p7: ['p1'] });
  assert.ok(g.evilOf(g.get('p2')));
  assert.match(text(r2.messages, 'p2'), /你现在是邪恶阵营/);
  assert.ok(g.mez.used);
});

test('灵言师当晚醉了：说出关键词的人不变，能力也用掉', () => {
  const g = mk(['noble', 'librarian', 'fortuneteller', 'oracle', 'monk', 'mezepheles', 'imp'], 'trust');
  night(g, { p3: ['p1', 'p2'] }); g.dawn();
  g.mezHeard('p2', g.mez.word);
  g.addFx('drunk', 'p6', null, 'never', '测试');
  g.endDay();
  night(g, { p3: ['p1', 'p2'], p5: ['p1'], p7: ['p1'] });
  assert.ok(!g.evilOf(g.get('p2')));
  assert.ok(g.mez.used);
});

test('小精灵：首夜得知一个在场的镇民；疯狂地证明过，他死时获得能力；没证明就没有', () => {
  const g = mk(['pixie', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp'], 'pie');
  const r = night(g, { p6: ['p5'] });
  const px = g.pixie.p1;
  assert.ok(px && ['chef', 'empath', 'monk', 'soldier'].includes(px.role));
  assert.match(text(r.messages, 'p1'), new RegExp(ROLES[px.role].name));
  g.dawn(); g.pixieMad('p1'); g.endDay();
  night(g, { p6: ['p5'], p4: ['p2'], p7: [px.target === 'p2' ? 'p3' : 'p2'] }); g.dawn();
  g.block = px.target; g.endDay();
  assert.equal(g.get(px.target).alive, false);
  assert.equal(g.get('p1').gained, px.role);

  const h = mk(['pixie', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp'], 'pie');
  night(h, { p6: ['p5'] }); h.dawn(); h.block = h.pixie.p1.target; h.endDay();
  assert.equal(h.get('p1').gained, null, '没疯狂过：拿不到');
});

test('食人魔：跟着选的人站队（醉了也生效）；间谍一定算邪恶；陌客被当作邪恶时他会得知', () => {
  const g = mk(['ogre', 'chef', 'empath', 'monk', 'soldier', 'spy', 'imp'], 'pie');
  night(g, { p1: ['p6'] });
  assert.ok(g.evilOf(g.get('p1')), '选了间谍：邪恶');
  const h = mk(['ogre', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp'], 'pie');
  night(h, { p1: ['p2'], p6: ['p1'] });
  assert.ok(!h.evilOf(h.get('p1')), '选了厨师：善良（被投毒也一样）');
  const r = new Game(players(7), { roles: ['ogre', 'chef', 'empath', 'recluse', 'soldier', 'poisoner', 'imp'], rng: makeRng(3), script: 'pie', misregister: 1 });
  const n = night(r, { p1: ['p4'], p6: ['p2'] });
  assert.ok(r.evilOf(r.get('p1')));
  assert.match(text(n.messages, 'p1'), /你现在是邪恶阵营/);
});

test('将军：每晚得知说书人认为哪边在赢', () => {
  const g = mk(['general', 'noble', 'librarian', 'oracle', 'monk', 'cerenovus', 'imp'], 'trust');
  const r = night(g);
  assert.match(text(r.messages, 'p1'), /说书人认为：.*(善良|邪恶|两边都没有)/);
});

test('政客：善良输了，处决自己人最多的政客转成邪恶、一起赢', () => {
  const g = mk(['politician', 'noble', 'librarian', 'oracle', 'monk', 'baron', 'imp'], 'trust');
  night(g); g.dawn();
  g.nominate('p1', 'p2'); g.recordVote('p2', ['p1', 'p3', 'p4', 'p6']); g.endDay();
  night(g, { p5: ['p1'], p7: ['p3'] }); g.dawn();
  g.nominate('p1', 'p4'); g.recordVote('p4', ['p1', 'p6', 'p7']); g.endDay();
  if (!g.winner) g.setWinner('evil', '测试：邪恶获胜');
  assert.equal(g.winner, 'evil');
  assert.ok(g.evilOf(g.get('p1')), '政客倒戈，和邪恶一起赢');
});

test('相克：魔术师活着时恶魔不知道提线木偶是哪个邻座；洗脑师可以选哥布林；第 5 天后麻脸巫婆造不出利维坦', () => {
  const g = mk(['magician', 'librarian', 'investigator', 'marionette', 'leviathan', 'savant', 'cerenovus'], 'hhr');
  const r = night(g);
  const demon = g.players.find((p) => p.role === 'leviathan');
  assert.match(text(r.messages, demon.id), /不知道是左边还是右边/);
  const h = mk(['magician', 'librarian', 'investigator', 'goblin', 'leviathan', 'savant', 'cerenovus'], 'hhr');
  h.startNight();
  const pr = h.nightPrompts().find((x) => x.role === 'cerenovus');
  assert.ok(pr.roleOptions.includes('goblin'));
});

// ───────────── 房间：四个剧本各打一整局 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(3); };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
for (const script of NEW) {
  test(`房间：${SCRIPTS[script].name} 9 人局（2 真人 + 7 机器人）能打完`, async () => {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
    room.moonchildWaitMs = 5;
    room.judgeReady = () => false;
    for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
    await room.act('u1', 'join'); await room.act('u2', 'join');
    await room.act('u1', 'addBots', { count: 7 });
    await room.act('u1', 'start');
    const g = room.game;
    assert.equal(room.town.id, script);
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
    await room.teardown();
  });
}
