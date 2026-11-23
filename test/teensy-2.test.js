// 2026-11-22 又加的六个 5–6 人小剧本：去外婆家、疑心痢蛭、深夜飞车、逐底竞赛、谁都别动、话多成灾。
// 新角色照集石百科 / 官方英文百科：戏法师、牙噶巴卜；传奇角色末日预言者、公爵夫人、私酒贩子。相克照官方 Djinn 表。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { rollTeensy, YAGG_PHRASES } from '../src/engine/snv.js';
import { ROLES, rolesOf, SCRIPTS, engineOf, fabledOf } from '../src/engine/roles.js';
import { MIX_STEPS, NIGHT_ORDER, NOT_STEPS, STEP_NAMES } from '../src/shared/nightOrder.js';
import { getMap } from '../src/shared/map.js';

const NEW = ['otr', 'lod', 'lnd', 'rtb', 'nfm', 'chat'];
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
function mk(script, roles, st = {}) {
  const g = new Game(players(roles.length), { roles, rng: makeRng(7), script });
  Object.assign(g.st, st);
  return g;
}
const text = (msgs, id) => msgs.filter((m) => m.playerId === id).map((m) => m.text).join('\n');
function night(g, choices = {}) {
  g.startNight();
  for (const [id, t] of Object.entries(choices)) g.submitChoice(id, t);
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  return { ...r, messages: [...(g.evilMessages ?? []), ...r.messages] };
}

test('六个新小剧本：角色都在、5–6 人、梦殒春宵引擎、有地图和夜晚顺序', () => {
  const counts = { otr: 11, lod: 11, lnd: 14, rtb: 11, nfm: 14, chat: 12 };
  for (const s of NEW) {
    assert.equal(rolesOf(s).length, counts[s], s);
    assert.ok(rolesOf(s).every((r) => ROLES[r]), s);
    assert.deepEqual(SCRIPTS[s].players, [5, 6]);
    assert.equal(engineOf(s), 'snv');
    assert.ok(getMap(s).place && getMap(s).id === s, s);
    for (const [id] of [...NIGHT_ORDER[s].first, ...NIGHT_ORDER[s].other]) {
      assert.ok(NOT_STEPS.has(id) || STEP_NAMES[id] || [...MIX_STEPS.first, ...MIX_STEPS.other].includes(id), `${s} ${id}`);
    }
  }
  assert.deepEqual(fabledOf('rtb').sort(), ['doomsayer', 'sentinel']);
  assert.deepEqual(fabledOf('nfm').sort(), ['bootlegger', 'duchess', 'sentinel']);
  assert.ok(!rolesOf('tb').includes('alsaahir') && !rolesOf('snv').includes('yaggababble'), '新角色不会混进三个基础剧本');
});

test('六个新小剧本：随机跑完整局不崩（各 150 局）', () => {
  for (const script of NEW) {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = makeRng(seed);
      const n = 5 + (seed % 2);
      const g = new Game(players(n), { roles: rollTeensy(script, n, rng), rng, script });
      for (let d = 0; d < 14 && !g.winner; d++) {
        night(g);
        if (g.winner) break;
        g.dawn();
        if (g.pendingKlutz) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
        if (g.winner) break;
        const y = g.players.find((q) => q.role === 'yaggababble');
        if (y) g.yaggBotSay(y.id);
        const al = g.alive();
        g.block = al[Math.floor(rng() * al.length)].id;
        g.endDay();
        if (g.pendingKlutz && !g.winner) g.klutzChoose(g.pendingKlutz, g.alive()[0].id);
      }
      assert.ok(g.winner, `${script} seed ${seed} 打了 14 天没结束`);
    }
  }
});

test('戏法师：真戏法师把恶魔和所有爪牙都猜对，善良直接获胜；少点、多点、假戏法师、醉酒都没用；每人每天一次', () => {
  const roles = ['alsaahir', 'slayer', 'virgin', 'psychopath', 'pukka'];
  let g = mk('nfm', roles);
  night(g); g.dawn();
  assert.deepEqual(g.alsaahirGuess('p2', ['p5'], ['p4']), { won: false }, '假戏法师猜对也没用');
  assert.equal(g.winner, null);
  assert.deepEqual(g.alsaahirGuess('p1', ['p5'], []), { won: false }, '漏了爪牙');
  assert.throws(() => g.alsaahirGuess('p1', ['p5'], ['p4']), /今天已经猜过了/);
  g = mk('nfm', roles);
  night(g); g.dawn();
  assert.deepEqual(g.alsaahirGuess('p1', ['p5'], ['p4', 'p3']), { won: false }, '多点了一个人');
  g = mk('nfm', roles);
  night(g); g.dawn();
  assert.deepEqual(g.alsaahirGuess('p1', ['p5'], ['p4']), { won: true });
  assert.equal(g.winner, 'good');
  // 醉酒中毒的戏法师猜对了也没用
  g = mk('nfm', roles);
  night(g); g.dawn();
  g.addFx('poison', 'p1', 'p5', 'never', '测试');
  assert.deepEqual(g.alsaahirGuess('p1', ['p5'], ['p4']), { won: false });
  assert.equal(g.winner, null);
});

test('牙噶巴卜：首夜得知暗号；白天每说一次，当晚可能死一人；没说就不杀；醉酒中毒时不杀', () => {
  const roles = ['highpriestess', 'savant', 'artist', 'fisherman', 'yaggababble'];
  let g = mk('chat', roles, { yaggVictims(n) { return g.alive().filter((q) => !g.evilOf(q)).slice(0, n); } });
  const first = night(g);
  const phrase = g.yagg.phrase;
  assert.ok(YAGG_PHRASES.includes(phrase));
  assert.match(text(first.messages, 'p5'), new RegExp(phrase));
  g.dawn();
  assert.equal(g.yaggHeard('p1', `我觉得${phrase}`), 0, '别人说了不算');
  assert.equal(g.yaggHeard('p5', `大家${phrase}，${phrase}啊`), 2, '一句里说两次算两次');
  g.endDay();
  const before = g.alive().length;
  night(g);
  assert.equal(g.alive().length, before - 2, '说了两次：死两人');
  g.dawn();
  g.endDay();
  const mid = g.alive().length;
  night(g);
  assert.equal(g.alive().length, mid, '这天没说：没人因他死');
  // 醉酒中毒：说了也不死人
  g = mk('chat', roles, { yaggVictims(n) { return g.alive().filter((q) => !g.evilOf(q)).slice(0, n); } });
  night(g); g.dawn();
  g.yaggHeard('p5', g.yagg.phrase);
  g.endDay();
  g.addFx('poison', 'p5', 'p1', 'never', '测试');
  const n0 = g.alive().length;
  night(g);
  assert.equal(g.alive().length, n0);
});

test('末日预言者：活人不少于 4 才能用，每人一次，死的是和他同阵营的存活玩家', () => {
  const roles = ['clockmaker', 'empath', 'dreamer', 'spy', 'vortox', 'mayor'];
  const g = mk('rtb', roles);
  night(g); g.dawn();
  const r = g.doomsay('p4'); // 间谍（邪恶）用：死的一定是邪恶
  assert.ok(r.victim && g.evilOf(g.get(r.victim)), '邪恶用，死邪恶');
  assert.notEqual(r.victim, 'p5', '不拿它杀没有接班人的恶魔');
  assert.throws(() => g.doomsay('p4'), /用过了|只有活着/);
  const r2 = g.doomsay('p1');
  assert.ok(r2.victim && !g.evilOf(g.get(r2.victim)), '善良用，死善良');
  assert.notEqual(r2.victim, 'p1', '有别人可选就不选用的人自己（2026-11-23 用户；百科例子里死的都是别人）');
  while (g.alive().filter((q) => g.visAlive(q)).length >= 4) g.snvDie(g.alive().find((q) => !g.evilOf(q) && q.id !== 'p2'), 'storyteller', []);
  if (g.get('p2').alive && !g.winner) assert.throws(() => g.doomsay('p2'), /不到 4 个/);
});

test('公爵夫人：正好三人报名，当晚三人各得知其中几个邪恶，其中一人的数是错的；不是三人就不拜访', () => {
  const roles = ['snakecharmer', 'alsaahir', 'slayer', 'psychopath', 'pukka', 'virgin'];
  let g = mk('nfm', roles);
  night(g); g.dawn();
  for (const id of ['p1', 'p2', 'p4']) g.duchessVisit(id, true);
  g.endDay();
  const { messages } = night(g);
  const nums = ['p1', 'p2', 'p4'].map((id) => Number(text(messages, id).match(/有 \*\*(\d)\*\* 个/)?.[1]));
  assert.ok(nums.every((n) => n >= 0 && n <= 3), String(nums));
  assert.equal(nums.filter((n) => n === 1).length, 2, '三人里 1 个邪恶：两人拿到 1，一人拿到错的数');
  // 两人报名：今晚不拜访
  g = mk('nfm', roles);
  night(g); g.dawn();
  g.duchessVisit('p1', true); g.duchessVisit('p2', true);
  g.endDay();
  const r2 = night(g);
  assert.ok(!/公爵夫人/.test(text(r2.messages, 'p1')));
});

test('相克：猎手射中痢蛭的宿主，宿主死亡（痢蛭跟着死）', () => {
  const roles = ['pixie', 'undertaker', 'slayer', 'juggler', 'lleech'];
  const g = mk('lod', roles);
  night(g, { p5: ['p2'] }); // 痢蛭首夜选 2 号当宿主
  assert.equal(g.lleechHost, 'p2');
  g.dawn();
  const r = g.slaySNV(g.get('p3'), g.get('p2'));
  assert.equal(r.hit, true);
  assert.equal(g.get('p2').alive, false);
  assert.equal(g.get('p5').alive, false, '宿主死了，痢蛭跟着死');
});

// ───────────── 房间里整局跑一遍（黄昏的机器人、视图、公开行动） ─────────────
import { Room } from '../src/server/room.js';
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

for (const script of NEW) {
  test(`房间：${SCRIPTS[script].name} 6 人局（1 真人 + 5 机器人）能打完，视图里有这个剧本的按钮状态`, async () => {
    const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
    room.moonchildWaitMs = 5;
    room.judgeReady = () => false;
    room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
    await room.act('u1', 'join');
    await room.act('u1', 'addBots', { count: 5 });
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
      const self = room.viewFor('u1').self;
      if (script === 'nfm') { assert.ok(self.duchess, '公爵夫人的报名状态'); if (self.duchess.open) await room.act('u1', 'duchess', { on: true }); }
      if (script === 'rtb' && days === 1 && self.canDoom) assert.equal(typeof self.canDoom, 'boolean');
      await room.act('u1', 'gather');
      if (g.winner || room.ended) break;
      if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
      if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
      await until(() => g.phase !== 'day' || g.winner || room.ended, 5000);
    }
    assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
    await room.teardown();
  });
}

test('房间：戏法师、末日预言者是公开行动，全场看得到；公爵夫人报名全场看得到', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'nfm' } });
  room.judgeReady = () => false;
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'alsaahir' });
  await room.act('u1', 'start');
  const g = room.game;
  await until(() => g.phase === 'day' || g.winner, 5000);
  if (g.winner) { await room.teardown(); return; }
  assert.equal(room.viewFor('u1').self.canAlsaahir, true);
  const wrong = g.players.filter((q) => !g.evilOf(q)).map((q) => q.id).slice(0, 1);
  await room.act('u1', 'alsaahir', { demons: wrong, minions: [] });
  assert.ok(room.log.some((l) => /以\*\*戏法师\*\*的身份公开猜/.test(l.text)));
  assert.equal(room.viewFor('u1').self.canAlsaahir, false, '每天一次');
  await room.act('u1', 'duchess', { on: true });
  assert.deepEqual(room.viewFor('u1').self.duchess.ids, ['u1']);
  assert.ok(room.log.some((l) => /报名今晚拜访\*\*公爵夫人\*\*/.test(l.text)));
  await room.teardown();
});

// ───────────── 11-22「检查下 bug」查出来的几处 ─────────────
test('存档：牙噶巴卜的暗号、末日预言者用过的人、公爵夫人的报名、戏法师今天猜过，重启后都还在', () => {
  const g = mk('nfm', ['snakecharmer', 'alsaahir', 'slayer', 'psychopath', 'pukka', 'virgin']);
  night(g); g.dawn();
  g.alsaahirGuess('p1', ['p2'], []);
  g.duchessVisit('p3', true);
  g.doomUsed.push('p6');
  const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.throws(() => back.alsaahirGuess('p1', ['p2'], []), /今天已经猜过了/);
  assert.deepEqual(back.duchessToday(), ['p3']);
  assert.deepEqual(back.doomUsed, ['p6']);
  const c = mk('chat', ['highpriestess', 'savant', 'artist', 'fisherman', 'yaggababble']);
  night(c);
  const c2 = Game.fromJSON(JSON.parse(JSON.stringify(c)));
  assert.equal(c2.yagg.phrase, c.yagg.phrase, '暗号还在');
  c2.dawn();
  assert.equal(c2.yaggHeard('p5', c2.yagg.phrase), 1, '重启后说暗号照样算');
});

test('疯子以为自己是牙噶巴卜：拿到一段假暗号，说了照样计数（界面和真的一样），但没人因此死', () => {
  const g = mk('chat', ['highpriestess', 'savant', 'lunatic', 'fisherman', 'lleech']);
  g.get('p3').shownRole = 'yaggababble';
  const { messages } = night(g, { p5: ['p1'] });
  const fake = g.yaggFake.p3?.phrase;
  assert.ok(fake && text(messages, 'p3').includes(fake), '疯子首夜拿到暗号');
  g.dawn();
  assert.equal(g.yaggHeard('p3', `我觉得${fake}`), 1, '疯子说假暗号也计数');
  assert.equal(g.yaggFake.p3.said, 1);
  g.endDay();
  night(g);
  assert.ok(!g.st.journal.some((j) => /牙噶巴卜今天说了/.test(j.text ?? j)), '疯子的假暗号不会让说书人杀人');
});

test('小剧本发角色：教父 ±1 外来者、传奇角色哨兵 ±1 外来者都生效（以前小剧本只调男爵）', () => {
  const seen = { otr: new Set(), lod: new Set() };
  for (let seed = 1; seed <= 400; seed++) {
    const a = rollTeensy('otr', 6, makeRng(seed));
    const out = a.filter((r) => ROLES[r].team === 'outsider').length;
    if (a.includes('godfather')) { assert.notEqual(out, 1, '有教父：外来者不是标准的 1 个'); seen.otr.add(out); }
    seen.lod.add(rollTeensy('lod', 6, makeRng(seed)).filter((r) => ROLES[r].team === 'outsider').length);
  }
  assert.deepEqual([...seen.otr].sort(), [0, 2]);
  assert.deepEqual([...seen.lod].sort(), [0, 1, 2], '哨兵：外来者可能少一个、多一个或照常');
});

test('结算顺序照官方英文总表（2026-11-23 用户：谁都别动里炼金术士排在了哲学家前面）', () => {
  const at = (k, id) => MIX_STEPS[k].indexOf(id);
  assert.ok(at('first', 'philosopher') < at('first', 'alchemist'), '首夜：哲学家在炼金术士前');
  assert.ok(at('first', 'yaggababble') < at('first', 'sailor'), '首夜：牙噶巴卜在爪牙信息那一段之前');
  assert.ok(at('first', 'butler') < at('first', 'grandmother'), '首夜：管家在祖母前');
  assert.equal(MIX_STEPS.other[0], 'duchess', '其他夜晚：公爵夫人最先');
  assert.ok(at('other', 'philosopher') < at('other', 'poppygrower'));
  assert.ok(at('other', 'fearmonger') < at('other', 'harpy') && at('other', 'fearmonger') < at('other', 'exorcist'));
  assert.ok(at('other', 'legion') < at('other', 'imp') && at('other', 'alhadikhia') < at('other', 'lleech'), '痢蛭在其他恶魔之后');
  assert.deepEqual(NIGHT_ORDER.nfm.first.map(([id]) => id).slice(0, 2), ['philosopher', 'alchemist']);
});

// 2026-11-24 用户：房主可以选牙噶巴卜的暗号难度
test('牙噶巴卜的暗号难度：简单 / 普通 / 困难各抽各的，存档里留着；房间设置只认这三档', async () => {
  const { YAGG_PHRASES_EASY, YAGG_PHRASES_HARD } = await import('../src/engine/snv.js');
  const roles = ['highpriestess', 'savant', 'artist', 'fisherman', 'cerenovus', 'yaggababble'];
  const ps = roles.map((_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
  for (const [level, list] of [['easy', YAGG_PHRASES_EASY], ['normal', YAGG_PHRASES], ['hard', YAGG_PHRASES_HARD]]) {
    for (let seed = 1; seed <= 5; seed++) {
      const g = new Game(ps, { roles, rng: makeRng(seed), script: 'chat', yaggLevel: level });
      assert.ok(list.includes(g.yagg.phrase), `${level}：${g.yagg.phrase}`);
      assert.equal(g.toJSON().yaggLevel, level);
    }
  }
  assert.equal(new Game(ps, { roles, rng: makeRng(1), script: 'chat', yaggLevel: '乱写' }).yaggLevel, 'normal');
  const { Room } = await import('../src/server/room.js');
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: { async findSquare() { return 'square'; } }, settings: {} });
  room.users.set('u1', { id: 'u1', name: '阿一', avatar: null });
  await room.act('u1', 'settings', { yaggLevel: 'hard' });
  assert.equal(room.settings.yaggLevel, 'hard');
  await room.teardown?.();
});
