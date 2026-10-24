// Room 的完整流程：用假的语音控制器记录机器人会对 Discord 做什么。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';
import { ROLES } from '../src/engine/roles.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5 };

function mockVoice() {
  const calls = [];
  let n = 0;
  return {
    calls,
    asleep: new Set(),
    async findSquare() { return 'square'; },
    async setAsleep(ids, on) { calls.push(['sleep', on, [...ids]]); for (const id of ids) (on ? this.asleep.add(id) : this.asleep.delete(id)); },
    async openRoom(name, ids, withSt) { calls.push(['open', name, ids, withSt]); return `room${++n}`; },
    async closeRoom(id) { calls.push(['close', id]); },
    async addToRoom(ch, id) { calls.push(['add', ch, id]); },
    async removeFromRoom(ch, id) { calls.push(['remove', ch, id]); },
    async moveAll(ids) { calls.push(['moveAll', ids]); },
    async setMuted(ids, on) { calls.push(['mute', on, [...ids]]); },
  };
}

function setup(mode, voice = mockVoice()) {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice, settings: { ...FAST, mode, shuffle: false } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  return { room, voice };
}

async function untilDay(room) {
  for (let k = 0; k < 300 && room.game.phase === 'night'; k++) {
    const g = room.game;
    if (!room.resolving) {
      for (const id of g.missingChoices().filter((x) => !room.isFake(x))) {
        const pr = g.nightPrompts().find((x) => x.playerId === id);
        await room.act(id, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) });
      }
    }
    if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id });
    await sleep(3);
  }
}

test('自动说书：整局跑完；夜里闭耳、白天解除；天亮后自动开始自由活动', async () => {
  const { room, voice } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await assert.rejects(room.act('u2', 'start'), /只有房主/);
  await room.act('u1', 'start');
  assert.deepEqual(voice.calls[0], ['sleep', true, ['u1', 'u2']], '入夜给真人闭耳');

  const v2 = room.viewFor('u2');
  assert.ok(v2.self.role.name, '玩家看得到自己的角色');
  assert.ok(v2.players.every((p) => p.role == null), '玩家看不到别人的角色');
  assert.equal(v2.st, undefined);

  let days = 0;
  while (!room.game.winner && days < 20) {
    await untilDay(room);
    for (let k = 0; k < 100 && room.game.phase === 'night'; k++) await sleep(3);
    if (room.game.winner) break;
    days++;
    assert.equal(voice.asleep.size, 0, '天亮全部解除闭耳');

    // 自动模式天亮后会自己开始自由活动；自由活动中不能提名
    for (let k = 0; k < 50 && !room.roam && !room.ended; k++) await sleep(2);
    if (room.ended) break;
    assert.ok(room.roam, '自动开始自由活动');
    const g = room.game;
    await assert.rejects(room.act(g.alive()[0].id, 'nominate', { target: g.players[0].id }), /自由活动中/);
    await room.act('u1', 'gather');
    assert.equal(room.roam, null);

    const nominator = g.alive().find((p) => !g.nominators.has(p.id));
    const nominee = g.players.find((p) => p.alive && p.role === 'imp' && p.id !== nominator.id) ?? g.alive().find((p) => p.id !== nominator.id);
    await room.act(nominator.id, 'nominate', { target: nominee.id });
    if (room.pendingNom) {
      await room.act('u1', 'startVote');
      for (const id of ['u1', 'u2']) if (g.canVote(id)) await room.act(id, 'hand', { up: true });
      for (let k = 0; k < 300 && room.vote; k++) await sleep(2);
      assert.equal(room.vote, null);
    }
    if (g.winner) break;
    await room.act('u1', 'dusk');
    for (let k = 0; k < 50 && g.phase === 'day'; k++) await sleep(2);
  }
  assert.ok(room.game.winner);
  for (let k = 0; k < 20 && !room.ended; k++) await sleep(2);
  const end = room.viewFor('u2');
  assert.equal(end.phase, 'ended');
  assert.ok(end.players.every((p) => p.roleName), '结束后公开魔典');
  assert.equal(voice.asleep.size, 0);
  await room.act('u1', 'end');
  assert.equal(room.viewFor('u1').phase, 'lobby');
  assert.equal(room.lobby.length, 8, '回大厅保留玩家');
});

test('真人说书：信息待审核；夜里单独叫人会先解除闭耳', async () => {
  const { room, voice } = setup('human');
  await assert.rejects(room.act('u1', 'join'), /说书人不能/);
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'start');
  assert.deepEqual(voice.calls[0], ['sleep', true, ['u2']], '说书人不闭耳');

  const st = room.viewFor('u1');
  assert.ok(st.isST && st.players.every((p) => p.roleName), '说书人看得到魔典');

  // 夜里说书人把 u2 叫进房间
  await room.act('u1', 'pull', { targets: ['u2'] });
  assert.equal(voice.asleep.has('u2'), false, '被叫走的人先解除闭耳');
  assert.equal(voice.calls.at(-1)[3], 'u1', '说书人也在房间里');
  await room.act('u1', 'gather');
  assert.equal(voice.asleep.has('u2'), true, '回来后重新闭耳');

  // u2 有夜晚行动就选，然后等结算（真人模式结算完不会自己天亮）
  const pr = room.viewFor('u2').self.prompt;
  if (pr) await room.act('u2', 'choose', { night: pr.night, targets: pr.options.slice(0, pr.count) });
  for (let k = 0; k < 200 && !room.resolving; k++) await sleep(3);
  if (room.rkPending === 'u2') await room.act('u2', 'ravenkeeper', { target: 'u2' });
  await sleep(30);
  assert.equal(room.game.phase, 'night', '真人模式等说书人天亮');
  assert.ok(room.viewFor('u1').st.resolved);
  const pending = room.viewFor('u1').st.pendingInfo;
  const mine = pending.find((m) => m.playerId === 'u2');
  const before = room.viewFor('u2').self.inbox.length;
  if (mine) {
    await room.act('u1', 'info', { id: mine.id, action: 'send', text: '改过的信息' });
    assert.equal(room.viewFor('u2').self.inbox.at(-1).text, '改过的信息');
  } else assert.equal(before, room.viewFor('u2').self.inbox.length, '没审核的信息不会自己发出去');
  await assert.rejects(room.act('u2', 'dawn'), /只有说书人/);
  await room.act('u1', 'dawn');
  assert.equal(room.game.phase === 'day' || room.ended, true);

  if (!room.ended) {
    await room.act('u1', 'st', { action: 'tell', target: 'u2', text: '你好' });
    assert.deepEqual([room.viewFor('u2').self.inbox.at(-1).text, room.viewFor('u2').self.inbox.at(-1).voice], ['你好', 'storyteller']);
    await room.act('u1', 'st', { action: 'kill', target: 'u2' });
    assert.equal(room.viewFor('u2').self.alive, false);
  }
  await room.teardown();
});

test('自由活动：走进房子进语音、锁门敲门、集合关掉所有房子', async () => {
  const { room, voice } = setup('human');
  room.users.set('u3', { id: 'u3', name: '阿三', avatar: null });
  await room.act('u2', 'join');
  await room.act('u3', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  for (let k = 0; k < 200 && !room.resolving; k++) {
    const g = room.game;
    for (const id of g.missingChoices().filter((x) => !room.isFake(x))) {
      const pr = g.nightPrompts().find((x) => x.playerId === id);
      await room.act(id, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) });
    }
    await sleep(3);
  }
  await room.act('u1', 'dawn');
  if (room.ended) return;

  await assert.rejects(room.act('u2', 'roam'), /只有说书人/);
  await room.act('u1', 'roam', { minutes: 0 });
  const view = room.viewFor('u2');
  assert.equal(view.roam.houses.length, 4, '7 人 4 间房子');
  assert.ok(view.roam.pos.u2, '有起始位置');
  const tavern = view.roam.houses.find((h) => h.id === 'tavern');
  const inside = { x: tavern.x + 50, y: tavern.y + 60 };

  // 走过去要时间，到了才进语音
  await room.act('u2', 'move', inside);
  assert.equal(room.viewFor('u2').roam.myHouse, null, '还在路上');
  for (let k = 0; k < 2000 && !room.viewFor('u2').roam.myHouse; k++) await sleep(5);
  assert.equal(room.viewFor('u2').roam.myHouse, 'tavern');
  assert.deepEqual(voice.calls.at(-1).slice(0, 3), ['open', '酒馆', ['u2']], '第一个人进来时建频道');

  // 锁门：u3 走过来只能敲门
  await assert.rejects(room.act('u3', 'lock', { house: 'tavern', locked: true }), /在房子里面/);
  await room.act('u2', 'lock', { house: 'tavern', locked: true });
  const r = await room.act('u3', 'move', inside);
  assert.match(r.notice, /锁着门/);
  assert.deepEqual(room.viewFor('u2').roam.houses.find((h) => h.id === 'tavern').knocks, ['u3']);
  await room.act('u2', 'knock', { house: 'tavern', who: 'u3', yes: true });
  for (let k = 0; k < 2000 && room.viewFor('u3').roam.myHouse !== 'tavern'; k++) await sleep(5);
  assert.equal(room.viewFor('u3').roam.myHouse, 'tavern', '开门后走进来');
  assert.deepEqual(voice.calls.at(-1), ['add', 'room1', 'u3'], '第二个人加进同一个频道');
  assert.deepEqual(room.viewFor('u1').roam.houses.find((h) => h.id === 'tavern').members.sort(), ['u2', 'u3'], '上帝视角看得到谁在里面');

  // 锁着门出不去：只能在屋里走，先开门才能出去
  const stuck = await room.act('u3', 'move', { x: 900, y: 760 });
  assert.match(stuck.notice, /门锁着/);
  await sleep(1500);
  assert.equal(room.viewFor('u3').roam.myHouse, 'tavern', '锁着门走不出去');
  await room.act('u2', 'lock', { house: 'tavern', locked: false });

  // u3 走出去：收回权限；u2 也走 → 频道关掉、门自动打开
  await room.act('u3', 'move', { x: 900, y: 760 });
  for (let k = 0; k < 2000 && room.viewFor('u3').roam.myHouse; k++) await sleep(5);
  assert.deepEqual(voice.calls.at(-1), ['remove', 'room1', 'u3']);
  await room.act('u2', 'move', { x: 930, y: 770 });
  for (let k = 0; k < 2000 && room.viewFor('u2').roam.myHouse; k++) await sleep(5);
  assert.deepEqual(voice.calls.at(-1), ['close', 'room1']);
  assert.equal(room.viewFor('u2').roam.houses.find((h) => h.id === 'tavern').locked, false);

  // 再进一间，然后集合：房子频道全部关掉，回到座位圈
  await room.act('u2', 'move', inside);
  for (let k = 0; k < 2000 && !room.viewFor('u2').roam.myHouse; k++) await sleep(5);
  await room.act('u1', 'gather');
  assert.equal(room.viewFor('u2').roam, null);
  assert.deepEqual(voice.calls.slice(-2), [['close', 'room2'], ['moveAll', ['u2', 'u3']]], '关掉房子并把所有人拉回广场');
  await room.act('u2', 'nominate', { target: 'u3' });
  assert.ok(room.pendingNom, '集合后可以提名');
  await room.teardown();
});

test('挑人物形象：同一个人物只能一个人用，开局后不能换', async () => {
  const { room } = setup('auto');
  await assert.rejects(room.act('u1', 'character', { id: 'priest' }), /先加入/);
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'character', { id: 'priest' });
  await assert.rejects(room.act('u2', 'character', { id: 'priest' }), /已经选了/);
  await assert.rejects(room.act('u2', 'character', { id: 'nobody' }), /没有这个人物/);
  await room.act('u1', 'addBots', { count: 3 });
  const chars = room.lobby.map((p) => p.char).filter(Boolean);
  assert.equal(new Set(chars).size, chars.length, '机器人自动挑没人用的人物');
  await room.act('u1', 'character', { id: null });
  assert.equal(room.lobby.find((p) => p.id === 'u1').char, null, '可以改回 Discord 头像');
  await room.act('u1', 'character', { id: 'priest' });
  await room.act('u1', 'addBots', { count: 1 });
  await room.act('u1', 'start');
  assert.equal(room.viewFor('u2').players.find((p) => p.id === 'u1').char, 'priest', '对局里大家都看得到');
  await assert.rejects(room.act('u1', 'character', { id: 'nun' }), /开局后/);
  await room.teardown();
});

test('AI 房主：集合后自动开放提名；陈述、辩护、投票、入夜全自动；有旁白', async () => {
  const voice = mockVoice();
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice, settings: { ...FAST, mode: 'auto', shuffle: false, nominateMinutes: 0.02, accuseSeconds: 0.02, defendSeconds: 0.02 } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  assert.ok(room.log.some((l) => l.kind === 'story' && l.title === '钟楼镇'), '开局旁白');
  await untilDay(room);
  for (let k = 0; k < 100 && room.game.phase === 'night'; k++) await sleep(3);
  if (room.game.winner) return;
  for (let k = 0; k < 50 && !room.roam; k++) await sleep(2);
  await room.act('u1', 'gather');
  for (let k = 0; k < 50 && !room.noms; k++) await sleep(2);
  assert.ok(room.noms, '集合后自动开放提名');
  const g = room.game;
  const me = ['u1', 'u2'].find((id) => g.get(id).alive);
  const target = g.players.find((p) => p.id !== me && p.role !== 'virgin').id;
  await room.act(me, 'nominate', { target });
  assert.equal(room.pendingNom.stage, 'accuse', '提名者先陈述');
  for (let k = 0; k < 200 && room.pendingNom; k++) await sleep(3);
  assert.ok(room.vote || room.lastVote, '陈述、辩护后自动开始投票');
  for (let k = 0; k < 400 && (room.vote || g.phase === 'day'); k++) await sleep(3);
  assert.notEqual(g.phase, 'day', '提名时间到了自动入夜');
  assert.ok(room.log.some((l) => l.kind === 'story' && /投票|举手|票/.test(l.text)), '投票有旁白');
  await room.teardown();
});

test('锁门：锁门前就在往里走的人到门口会被挡住、变成敲门', async () => {
  const { room } = setup('auto');
  for (const id of ['u2', 'u3']) room.users.set(id, { id, name: id, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join'); await room.act('u3', 'join');
  await room.act('u1', 'addBots', { count: 4 });
  await room.act('u1', 'start');
  await untilDay(room);
  for (let k = 0; k < 100 && room.game.phase === 'night'; k++) await sleep(3);
  if (room.ended) return;
  for (let k = 0; k < 50 && !room.roam; k++) await sleep(2);
  const tavern = room.viewFor('u2').roam.houses.find((h) => h.id === 'tavern');
  const inside = { x: tavern.x + 60, y: tavern.y + 60 };
  await room.act('u2', 'move', inside);
  for (let k = 0; k < 2000 && room.viewFor('u2').roam.myHouse !== 'tavern'; k++) await sleep(5);
  await room.act('u3', 'move', inside);          // u3 出发时门还开着
  await room.act('u2', 'lock', { house: 'tavern', locked: true });
  for (let k = 0; k < 2000 && !room.roam.state.get('tavern').knocks.has('u3'); k++) await sleep(5);
  assert.ok(room.roam.state.get('tavern').knocks.has('u3'), 'u3 被挡在门外敲门');
  assert.ok(!room.roam.state.get('tavern').ids.has('u3'), 'u3 没进去');
  await room.teardown();
});

/** 模拟服务器重启：存档 → 经过 JSON → 新建一个房间读回来接着跑（旧房间的计时器全停掉）。 */
async function reboot(room, voice) {
  const snap = JSON.parse(JSON.stringify(room.snapshot()));
  await room.teardown();
  const next = new Room({ key: snap.key, guildId: snap.guildId, hostId: snap.hostId, voice });
  next.restore(snap);
  next.resume();
  return next;
}

test('存档读档：夜里重启后接着结算，信息和日志都在；终局有复盘时间线', async () => {
  const { room, voice } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  assert.equal(room.game.phase, 'night');
  const roles = room.game.players.map((p) => p.role);
  const logLen = room.log.length;

  const r2 = await reboot(room, voice);
  assert.deepEqual(r2.game.players.map((p) => p.role), roles, '角色不变');
  assert.ok(r2.log.length > logLen, '恢复时发了一条公告');
  assert.equal(r2.viewFor('u2').phase, 'night');
  await untilDay(r2);
  for (let k = 0; k < 100 && r2.game.phase === 'night'; k++) await sleep(3);
  assert.ok(r2.game.phase === 'day' || r2.game.winner, '读档后夜晚照常结算到天亮');

  // 一直打到结束，看复盘
  r2.game.setWinner('good', '测试结束'); // 直接杀恶魔可能被红唇女郎接任，这里直接判胜负
  await r2.endGame();
  const tl = r2.viewFor('u2').timeline;
  const kinds = new Set(tl.map((e) => e.kind));
  for (const k of ['setup', 'info', 'end']) assert.ok(kinds.has(k), `复盘缺少 ${k}`);
  await r2.teardown();
});

test('存档读档：自由活动中和投票中途重启都能接着走', async () => {
  const { room, voice } = setup('auto');
  room.settings.roamMinutes = 0.01;
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  await untilDay(room);
  for (let k = 0; k < 200 && !room.roam && !room.ended; k++) await sleep(3);
  if (room.ended) return;
  assert.ok(room.roam, '天亮后自由活动');

  // 自由活动中重启：位置保留，到点照样集合
  const r2 = await reboot(room, voice);
  assert.ok(r2.roam);
  assert.equal(r2.roam.pos.size, r2.game.players.length);
  for (let k = 0; k < 400 && r2.roam; k++) await sleep(3);
  assert.equal(r2.roam, null, '读档后自由活动到点结束');
  for (let k = 0; k < 200 && !r2.noms; k++) await sleep(3);
  assert.ok(r2.noms, '集合后开放提名');

  // 投票中途重启：指针接着转，投完照常记票
  r2.clearNoms();
  const g = r2.game;
  const [a, b] = g.alive().filter((p) => !g.nominators.has(p.id) && !g.nominees.has(p.id));
  await r2.act(a.id, 'nominate', { target: b.id });
  if (!r2.pendingNom) return; // 贞洁者
  await r2.act('u1', 'startVote');
  for (let k = 0; k < 50 && (!r2.vote || r2.vote.idx < 1); k++) await sleep(1);
  const r3 = await reboot(r2, voice);
  assert.ok(r3.vote, '投票状态读回来了');
  for (let k = 0; k < 400 && r3.vote; k++) await sleep(3);
  assert.equal(r3.vote, null, '投票读档后转完');
  assert.ok(r3.game.timeline.some((e) => e.kind === 'vote'), '投票记进复盘');
  await r3.teardown();
});

test('投票提前集合：所有真人都同意才结束自由活动，可以撤回', async () => {
  const { room } = setup('auto');
  room.settings.roamMinutes = 10;
  for (const id of ['u3', 'u4']) room.users.set(id, { id, name: id, avatar: null });
  for (const id of ['u1', 'u2', 'u3', 'u4']) await room.act(id, 'join');
  await room.act('u1', 'addBots', { count: 3 });
  await room.act('u1', 'start');
  await untilDay(room);
  for (let k = 0; k < 200 && !room.roam && !room.ended; k++) await sleep(3);
  if (room.ended) return;
  assert.equal(room.viewFor('u1').roam.endVotes.need, 4, '4 个真人要 4 票');
  await assert.rejects(room.act('bot-1', 'roamVote', { yes: true }), /只有这局的玩家/);
  for (const id of ['u1', 'u2', 'u3']) await room.act(id, 'roamVote', { yes: true });
  await room.act('u2', 'roamVote', { yes: false });
  assert.equal(room.viewFor('u1').roam.endVotes.count, 2, '撤回后少一票');
  await room.act('u2', 'roamVote', { yes: true });
  assert.ok(room.roam, '三票还不够');
  await room.act('u4', 'roamVote', { yes: true });
  assert.equal(room.roam, null, '全员同意，立刻集合');
  await room.teardown();
});

test('新手教程：固定身份，共情者得知 1 个邪恶；提名 2 号投票处决，善良获胜', async () => {
  const { startTutorial } = await import('../src/server/tutorial.js');
  const room = await startTutorial({ id: 'me', name: '我', avatar: null }, () => {});
  Object.assign(room.settings, { pauseMs: 5, voteCountdown: 0.005, voteSeconds: 0.002, accuseSeconds: 0.02, defendSeconds: 0.02 });
  const g = room.game;
  assert.deepEqual(g.players.map((p) => p.role), ['empath', 'imp', 'washerwoman', 'chef', 'poisoner', 'monk', 'soldier']);
  assert.ok(room.viewFor('me').tutorial);
  for (let k = 0; k < 400 && g.phase === 'night'; k++) await sleep(5);
  for (let k = 0; k < 400 && !room.roam; k++) await sleep(10);
  assert.match(room.inbox.get('me').map((m) => m.text).join('\n'), /\*\*1\*\* 名/, '共情者得知两侧有 1 个邪恶');
  assert.ok(g.isPoisoned(g.get('p4') ?? g.players[3]), '投毒者毒了厨师');
  assert.equal(room.roam.until, null, '自由活动不限时');
  await room.act('me', 'roamVote', { yes: true });
  assert.equal(room.roam, null, '只有一个真人，自己同意就集合');
  for (let k = 0; k < 200 && !room.noms; k++) await sleep(5);
  await room.act('me', 'nominate', { target: g.players[1].id });
  await room.act('me', 'nomDone');
  for (let k = 0; k < 400 && !room.vote; k++) await sleep(5);
  await room.act('me', 'hand', { up: true });
  for (let k = 0; k < 600 && !room.ended; k++) await sleep(5);
  assert.equal(g.winner, 'good');
  await room.teardown();
});

test('提名环节：发言时其他人闭麦；提名者自动一票；投票中看不到别人的票，投完公开', async () => {
  const { room, voice } = setup('auto');
  Object.assign(room.settings, { accuseSeconds: 5, defendSeconds: 5, voteCountdown: 5, roamMinutes: 0.001 });
  for (const id of ['u3']) room.users.set(id, { id, name: id, avatar: null });
  for (const id of ['u1', 'u2', 'u3']) await room.act(id, 'join');
  await room.act('u1', 'addBots', { count: 4 });
  await room.act('u1', 'start');
  await untilDay(room);
  for (let k = 0; k < 300 && !room.noms && !room.ended; k++) await sleep(5);
  if (room.ended) return;
  room.clearNoms(); room.noms = { until: Date.now() + 60000, paused: null, timeUp: false, skips: new Set() };
  const g = room.game;
  const target = g.players.find((p) => p.id !== 'u1' && p.alive && p.role !== 'virgin').id;
  voice.calls.length = 0;
  await room.act('u1', 'nominate', { target });
  await sleep(5);
  const mute = voice.calls.find((c) => c[0] === 'mute' && c[1] === true);
  assert.ok(mute, '陈述时有人被闭麦');
  assert.ok(!mute[2].includes('u1') && mute[2].includes('u2'), '提名者能说话，其他人闭麦');
  await room.act('u1', 'nomDone');
  await room.act(target.startsWith('bot') ? 'u1' : target, 'nomDone');
  await sleep(5);
  assert.ok(room.vote, '开始投票');
  assert.ok(voice.calls.some((c) => c[0] === 'mute' && c[1] === false), '投票时解除闭麦');
  assert.ok(room.vote.yes.has('u1'), '提名者自动一票');
  await room.act('u2', 'hand', { up: true });
  const v3 = room.viewFor('u3').vote;
  assert.deepEqual(v3.yes, [], 'u3 看不到别人的票');
  assert.deepEqual(room.viewFor('u2').vote.yes, ['u2'], '只看得到自己的');
  room.clearNoms();
  await room.teardown();
});

test('观战：不在局里的人看不到身份（房规可开魔典）；开局后语音闭麦，离开/终局解除', async () => {
  const { room, voice } = setup('auto');
  room.users.set('w1', { id: 'w1', name: '观众', avatar: null });
  for (const id of ['u1', 'u2', 'w1']) room.online.add(id);
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  assert.deepEqual(room.viewFor('u1').watchers.map((w) => w.id), ['w1'], '大厅：没坐下的人在观战席');
  await room.act('u1', 'start');
  await sleep(5);
  const v = room.viewFor('w1');
  assert.equal(v.spectator, true);
  assert.equal(v.self, undefined);
  assert.ok(v.players.every((p) => p.role == null), '观战看不到身份');
  assert.ok(voice.calls.some((c) => c[0] === 'mute' && c[1] === true && c[2].includes('w1')), '观战的人被闭麦');
  room.settings.spectatorGrimoire = true; // 开局后不能改设置，这里直接改
  assert.ok(room.viewFor('w1').players.every((p) => p.role != null), '房规打开后观战能看魔典');
  room.online.delete('w1');
  await room.syncWatchMute();
  assert.ok(voice.calls.some((c) => c[0] === 'mute' && c[1] === false && c[2].includes('w1')), '离开后解除闭麦');
  await room.teardown();
});

test('小人搭配：服务器校验款式和颜色，不认识的用默认值补上；大家的视图里都看得到', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u1', 'outfit', { outfit: { hat: 'tophat', hatColor: '#123456', top: 'spacesuit', skin: 'red' } });
  const o = room.viewFor('u2').lobby.find((p) => p.id === 'u1').outfit;
  assert.equal(o.hat, 'tophat');
  assert.equal(o.hatColor, '#123456');
  assert.notEqual(o.top, 'spacesuit');
  assert.match(o.skin, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(room.viewFor('u1').myOutfit, o);
});

/** 黯月初升的夜晚：真人按提示选（可以放弃的就放弃，要选角色就选第一个）；疯子先选、恶魔后选。 */
async function untilDayBMR(room) {
  for (let k = 0; k < 400 && room.game.phase === 'night'; k++) {
    const g = room.game;
    if (!room.resolving) {
      for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId] || pr.waiting) continue;
        const targets = pr.optional ? [] : pr.options.slice(0, pr.count);
        await room.act(pr.playerId, 'choose', { night: g.night, targets, role: pr.pickRole && !pr.optional ? pr.roleOptions[0] : null });
      }
    }
    await sleep(3);
  }
}

for (const [label, preset] of [['随机角色', null], ['推荐配置·邪恶狂欢（有疯子）', 2], ['推荐配置·难题（主谋、珀、莽夫）', 4]]) {
  test(`黯月初升：整局跑完（${label}）`, async () => {
    const { room } = setup('auto');
    room.settings.script = 'bmr';
    room.settings.preset = preset;
    await room.act('u1', 'join');
    await room.act('u2', 'join');
    await room.act('u1', 'addBots', { count: 6 });
    await room.act('u1', 'start');
    const g = room.game;
    assert.equal(g.script, 'bmr');
    if (preset != null) assert.ok(g.players.some((p) => p.role === (preset === 2 ? 'lunatic' : 'mastermind')));
    let days = 0;
    while (!g.winner && days < 25) {
      await untilDayBMR(room);
      for (let k = 0; k < 100 && g.phase === 'night'; k++) await sleep(3);
      if (g.winner) break;
      days++;
      for (let k = 0; k < 50 && !room.roam && !room.ended; k++) await sleep(2);
      if (room.ended) break;
      await room.act('u1', 'gather');
      // 月之子是真人：公开选一个人
      for (const id of ['u1', 'u2']) if (g.pendingMoonchild === id) await room.act(id, 'moonchild', { target: g.players.find((q) => g.visAlive(q) && q.id !== id).id });
      // 造谣者（谁都能说，只有真的生效）
      const speaker = g.players.find((p) => ['u1', 'u2'].includes(p.id) && g.visAlive(p));
      if (speaker) await room.act(speaker.id, 'gossip', { statement: { kind: 'evil', target: g.players[0].id } });
      const nominator = g.players.find((p) => g.visAlive(p) && !g.nominators.has(p.id));
      const nominee = g.players.find((p) => p.alive && ROLES[p.role].team === 'demon' && p.id !== nominator?.id) ?? g.players.find((p) => g.visAlive(p) && p.id !== nominator?.id);
      if (nominator && nominee) {
        await room.act(nominator.id, 'nominate', { target: nominee.id });
        if (room.pendingNom) {
          await room.act('u1', 'startVote');
          for (const id of ['u1', 'u2']) if (g.canVote(id)) await room.act(id, 'hand', { up: true });
          for (let k = 0; k < 300 && room.vote; k++) await sleep(2);
        }
      }
      if (g.winner) break;
      await room.act('u1', 'dusk');
      for (let k = 0; k < 50 && g.phase === 'day'; k++) await sleep(2);
    }
    assert.ok(g.winner, '分出胜负');
    for (let k = 0; k < 20 && !room.ended; k++) await sleep(2);
    assert.equal(room.viewFor('u2').phase, 'ended');
    await room.teardown();
  });
}
