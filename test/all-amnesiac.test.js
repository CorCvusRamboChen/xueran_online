// 《全员失忆》（2026-11-20 用户：娱乐本；网上没有固定角色表，按中文社区的玩法做）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { SCRIPTS, ROLES } from '../src/engine/roles.js';
import { Room } from '../src/server/room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(5); };
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));

test('全员失忆：角色池是三个官方剧本（不含杂耍艺人、畸形秀演员）；谁都不知道自己是谁，选人提示里也只写「失忆的 X」', () => {
  const pool = SCRIPTS.amn.roles;
  assert.ok(pool.includes('imp') && pool.includes('po') && pool.includes('vortox'));
  assert.ok(!pool.includes('juggler') && !pool.includes('mutant'));
  for (let n = 5; n <= 15; n++) {
    const g = new Game(players(n), { script: 'amn', rng: makeRng(n) });
    assert.equal(g.players.length, n);
    assert.ok(g.players.every((p) => g.allAmn(p) && g.hidden(p)));
    g.startNight();
    for (const pr of g.nightPrompts()) assert.match(pr.role, /^amn_|^ah_|^harlot_/, `提示里不露角色：${pr.role}`);
  }
});

test('全员失忆：每天问一次（死了也能问）；问过就不能再问；答到完美后就知道了', () => {
  const g = new Game(players(7), { script: 'amn', rng: makeRng(3) });
  g.startNight(); for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId); g.resolveNight(); g.dawn();
  const p = g.players[0];
  p.alive = false;
  const r = g.allGuess(p.id, '我是共情者');
  assert.equal(r.ability, p.shownRole ?? p.role);
  assert.throws(() => g.allGuess(p.id, '我是厨师'), /今天已经问过了/);
  (g.amnesiacKnown ??= {})[p.id] = true;
  assert.equal(g.allAmn(p), false);
  assert.equal(g.amnKnownCount(), 1);
});

test('全员失忆：变了角色、看魔典、假信息都不说出他自己的角色（2026-11-21 用户：给信息时说了自己是魔鬼代言人）', () => {
  const g = new Game(players(8), { script: 'amn', roles: ['spy', 'washerwoman', 'empath', 'chef', 'monk', 'saint', 'pithag', 'imp'], rng: makeRng(5), misregister: 0 });
  g.startNight(); for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  const spy = r.messages.filter((m) => m.playerId === 'p1').map((m) => m.text).join('\n');
  assert.match(spy, /1号 玩家1 — 失忆的爪牙/, '间谍看魔典：自己那一行只写失忆的爪牙');
  assert.doesNotMatch(spy, /玩家1 — 间谍/);
  assert.match(spy, /2号 玩家2 — 洗衣妇/, '别人的照常');
  // 麻脸巫婆把 3 号变成别的镇民：只说变成了失忆的镇民
  g.dawn(); g.endDay?.();
  g.startNight();
  g.submitChoice('p7', ['p3'], { role: 'oracle' });
  for (const pr of g.nightPrompts()) if (!g.choices[pr.playerId]) g.autoChoose(pr.playerId);
  let n = g.resolveNight(); const msgs = [...n.messages];
  while (n.pause) { g.autoChoose(n.pause); n = g.resolveNight(); msgs.push(...n.messages); }
  const p3 = msgs.filter((m) => m.playerId === 'p3').map((m) => m.text).join('\n');
  assert.equal(g.get('p3').role, 'oracle');
  assert.match(p3, /失忆的镇民/);
  assert.doesNotMatch(p3, /神谕者/);
});

function mockVoice() {
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('全员失忆（房间）：自己的角色卡只写「失忆的 X」；问说书人得到四档回答；黄昏公布人数；第 4 天全员揭晓', async () => {
  const room = new Room({ key: 'a', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { mode: 'auto', script: 'amn', shuffle: false, chooseSeconds: 0.05, pauseMs: 5, killSceneMs: 0 } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) { room.users.set(id, { id, name, avatar: null }); room.online.add(id); }
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  try {
    room.deliver([{ playerId: 'u2', text: '测试信息' }]);
    assert.match(room.viewFor('u2').self.inbox.at(-1).voice, /^amn_/, '信息上写的说话人不是他的真角色');
    const card = room.viewFor('u2').self.role;
    assert.match(card.id, /^amn_/);
    assert.match(card.name, /^失忆的/);
    assert.ok(!card.ability.includes(ROLES[g.get('u2').role].ability), '能力原文不露');
    for (const k of room.timers ?? []) clearTimeout(k);
    g.phase = 'day'; g.day = 1;
    room.judgeReady = () => false; // 没接 AI：按字面重合度粗判
    assert.equal(room.viewFor('u2').self.canAmnesiac, true);
    await room.act('u2', 'amnesiac', { text: `我是${ROLES[g.get('u2').shownRole ?? g.get('u2').role].name}` });
    assert.match(room.viewFor('u2').self.inbox.at(-1).text, /说书人的回答：\*\*(完美|接近|有关|无关)\*\*/);
    assert.equal(room.viewFor('u2').self.canAmnesiac, false, '今天问过了');
    g.day = 4; g.phase = 'night';
    room.announce = ((orig) => function (...a) { (room._ann ??= []).push(a[0]); return orig.apply(this, a); })(room.announce);
    await room.beginDay();
    assert.ok(g.allKnown);
    assert.ok(!room.viewFor('u1').self.role.id.startsWith('amn_'), '第 4 天：角色卡换回真的');
    assert.ok(room._ann.some((t) => /全员失忆结束了/.test(t)));
  } finally { await room.teardown(); }
});
