// Room 的完整流程：用假的语音控制器记录机器人会对 Discord 做什么。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';
import { ROLES, isEvilRole as isEvil } from '../src/engine/roles.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 按真实时间等（Windows 上 setTimeout 最短约 15 毫秒，按次数数的等待会比想的长很多或短很多）。
// 读档后服务器故意留 3–5 秒缓冲再接着走，等的上限要比这个长。
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0 };

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
  room.dawnPad = [0, 0]; // 黯月初升"选完后随机 20–45 秒才天亮"：测试里不等
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
  // 身份是随机的：u3 是贞洁者、u2 是镇民时，提名者当场被处决，没有待处理的提名
  const virgin = room.game.players.find((p) => p.id === 'u3')?.role === 'virgin';
  assert.ok(room.pendingNom || virgin || room.ended, '集合后可以提名');
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
  // 被推出门外的这一小段不会反复"进门被挡、重新敲门"（以前屋里人的敲门面板会一直闪）
  const at = room.roam.state.get('tavern').knockAt.get('u3');
  let flips = 0;
  for (let k = 0; k < 160; k++) { if (!room.roam.state.get('tavern').knocks.has('u3')) flips++; await sleep(5); }
  assert.equal(flips, 0, '敲门一直都在');
  assert.equal(room.roam.state.get('tavern').knockAt.get('u3'), at, '没有重新敲门');
  // 屋里的人放他进来：真的能进来
  await room.act('u2', 'knock', { house: 'tavern', who: 'u3', yes: true });
  for (let k = 0; k < 2000 && !room.roam.state.get('tavern').ids.has('u3'); k++) await sleep(5);
  assert.ok(room.roam.state.get('tavern').ids.has('u3'), 'u3 被放进来了');
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

test('房间编号 logEpoch：重启读档后不变；新建的房间不一样（客户端靠它重新对齐日志编号，不然旁白不弹也不念）', async () => {
  const { room, voice } = setup('auto');
  await room.act('u1', 'join');
  const epoch = room.viewFor('u1').logEpoch;
  assert.ok(epoch, '视图里带着房间编号');
  const r2 = await reboot(room, voice);
  assert.equal(r2.viewFor('u1').logEpoch, epoch, '读档后编号不变：已经看过的旁白不会重放');
  const fresh = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice });
  assert.notEqual(fresh.epoch, epoch, '清掉重建的房间换了编号：logSeq 从 0 重数，客户端要重新对齐');
  await r2.teardown(); await fresh.teardown();
});

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
  await until(() => r2.game.phase !== 'night');
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
  await until(() => !r2.roam);
  assert.equal(r2.roam, null, '读档后自由活动到点结束');
  await until(() => r2.noms);
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
  await until(() => !r3.vote);
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
  Object.assign(room.settings, { pauseMs: 5, killSceneMs: 0, voteCountdown: 0.005, voteSeconds: 0.002, accuseSeconds: 0.02, defendSeconds: 0.02 });
  const g = room.game;
  assert.deepEqual(g.players.map((p) => p.role), ['empath', 'imp', 'washerwoman', 'chef', 'poisoner', 'monk', 'soldier']);
  assert.ok(room.viewFor('me').tutorial);
  await until(() => g.phase !== 'night');
  await until(() => room.roam);
  assert.match(room.inbox.get('me').map((m) => m.text).join('\n'), /\*\*1\*\* 名/, '共情者得知两侧有 1 个邪恶');
  assert.ok(g.isPoisoned(g.get('p4') ?? g.players[3]), '投毒者毒了厨师');
  assert.equal(room.roam.until, null, '自由活动不限时');
  await room.act('me', 'roamVote', { yes: true });
  assert.equal(room.roam, null, '只有一个真人，自己同意就集合');
  await until(() => room.noms);
  await room.act('me', 'nominate', { target: g.players[1].id });
  await room.act('me', 'nomDone');
  await until(() => room.vote);
  await room.act('me', 'hand', { up: true });
  await until(() => room.ended);
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
      if (room.roam) { // 自由活动用黯月初升自己的地图：旅店能走进去
        const v = room.viewFor('u1').roam;
        assert.equal(v.map, 'bmr');
        assert.deepEqual(v.houses.map((h) => h.id), ['inn', 'teahouse', 'mill', 'chapel', 'crowyard']);
        if (days === 1 && g.get('u1')) {
          const inn = v.houses[0];
          room.move('u1', inn.x + 60, inn.y + 60);
          for (let k = 0; k < 2000 && room.viewFor('u1').roam?.myHouse !== 'inn' && room.roam; k++) await sleep(5);
          if (room.roam) assert.equal(room.viewFor('u1').roam.myHouse, 'inn', '走进黯月旅店');
        }
      }
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

test('阶段之间的停顿：天亮→自由活动、集合→提名、黄昏→入夜，视图标成过渡（前端不闪提名/投票面板）', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'start');
  room.settings.pauseMs = 200;
  try {
  await untilDay(room);
  for (let k = 0; k < 200 && room.game.phase === 'night'; k++) await sleep(5);
  if (room.ended) return;
  assert.equal(room.viewFor('u1').transit, 'dawn', '天亮后、自由活动开始前');
  for (let k = 0; k < 200 && !room.roam; k++) await sleep(5);
  assert.equal(room.viewFor('u1').transit, null, '自由活动中不是过渡');
  await room.act('u1', 'gather');
  assert.equal(room.viewFor('u1').transit, 'gather', '集合后、开放提名前');
  for (let k = 0; k < 200 && !room.noms; k++) await sleep(5);
  assert.equal(room.viewFor('u1').transit, null, '提名环节不是过渡');
  await room.act('u1', 'dusk');
  if (room.ended) return;
  assert.equal(room.viewFor('u1').transit, 'dusk', '黄昏后、入夜前');
  for (let k = 0; k < 200 && room.game.phase === 'day'; k++) await sleep(5);
  assert.equal(room.viewFor('u1').transit, null, '入夜后不是过渡');
  } finally { room.reset(); } // 停掉后台计时器，测试进程才能退出
});

test('本地测试开关 devRole：换成小恶魔的人就是第一任恶魔，拿得到 3 张伪装（7 人局）', async () => {
  const { room } = setup('auto');
  room.users.set('u1', { id: 'u1', name: '甲', devRole: 'imp' });
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'start');
  try {
    const me = room.game.get('u1');
    assert.equal(me.role, 'imp');
    assert.equal(room.game.firstDemon, 'u1');
    assert.equal(room.viewFor('u1').self.bluffs?.length, 3, '恶魔拿得到伪装卡');
    assert.ok(!isEvil(room.game.get(room.game.redHerring)?.role ?? 'washerwoman'), '红鲱鱼是善良玩家');
  } finally { room.reset(); }
});

test('开局准备中（setup）：视图当成第一夜，前端不会闪出白天的广场', async () => {
  const voice = { ...mockVoice(), findSquare: () => new Promise((ok) => setTimeout(() => ok(null), 60)) };
  const { room } = setup('auto', voice);
  await room.act('u1', 'join');
  await room.act('u1', 'addBots', { count: 4 });
  const started = room.act('u1', 'start');
  await sleep(10); // 还在等找语音频道
  try {
    assert.equal(room.game.phase, 'setup');
    assert.equal(room.viewFor('u1').phase, 'night');
    assert.equal(room.viewFor('u1').night, 1);
    await started;
  } finally { room.reset(); }
});

test('房主指定角色：只有房主能指定、只有房主看得到；开局后照指定发身份', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await assert.rejects(room.act('u2', 'assignRole', { player: 'u2', role: 'imp' }), /房主/);
  await room.act('u1', 'assignRole', { player: 'u2', role: 'imp' });
  await room.act('u1', 'assignRole', { player: 'bot-1', role: 'monk' });
  await assert.rejects(room.act('u1', 'assignRole', { player: 'bot-2', role: 'po' }), /没有这个角色/);
  assert.deepEqual(room.viewFor('u1').roleAssign, { u2: 'imp', 'bot-1': 'monk' });
  assert.equal(room.viewFor('u2').roleAssign, null, '别人看不到');
  await room.act('u1', 'assignRole', { player: 'bot-3', role: 'imp' }); // 同一个角色换给别人
  assert.deepEqual(room.viewFor('u1').roleAssign, { 'bot-1': 'monk', 'bot-3': 'imp' });
  await room.act('u1', 'start');
  try {
    assert.equal(room.game.get('bot-3').role, 'imp');
    assert.equal(room.game.get('bot-1').role, 'monk');
    assert.equal(room.game.firstDemon, 'bot-3');
  } finally { room.reset(); }
});

test('真人说书：破门等说书人点「天亮」才播，播完才天亮；没人死也照样等', async () => {
  const { room } = setup('human');
  room.settings.killSceneMs = 60;
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'imp' });
  await room.act('u1', 'start');
  try {
    assert.ok(room.homes && room.game.script === 'tb', '暗流涌动有家');
    await room.act('u1', 'dawn');                 // 第一下：结算夜晚
    for (let k = 0; k < 200 && !room.resolving; k++) await sleep(3);
    room.game.demonKills = ['bot-1'];             // 假装今晚恶魔杀了 bot-1
    await sleep(80);
    assert.equal(room.killScene, null, '说书人还没点天亮，受害者不会提前看到破门');
    await room.act('u1', 'dawn');                 // 第二下：天亮
    assert.deepEqual(room.killScene?.victims, ['bot-1'], '点了天亮马上给受害者播');
    assert.equal(room.game.phase, 'night', '播完才天亮');
    await assert.rejects(room.act('u1', 'dawn'), /正在天亮/);
    for (let k = 0; k < 100 && room.game.phase === 'night'; k++) await sleep(5);
    assert.equal(room.game.phase, 'day');
    assert.equal(room.killScene, null);
  } finally { room.reset(); }
});

test('发言闭麦：机器人发言时不闭任何人；真人发言时只让他说', async () => {
  const { room, voice } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  try {
    voice.calls.length = 0;
    await room.speakOnly('bot-1');
    assert.equal(voice.calls.filter((c) => c[0] === 'mute').length, 0, '机器人说话不闭麦');
    await room.speakOnly('u2');
    assert.deepEqual(voice.calls.filter((c) => c[0] === 'mute'), [['mute', true, ['u1']]]);
    await room.speakOnly(null);
    assert.deepEqual(voice.calls.at(-1), ['mute', false, ['u1']]);
  } finally { room.reset(); }
});

test('真人全离线：过一阵暂停、放开闭耳、计时器全停；有人回来接着打', async () => {
  const { room, voice } = setup('auto');
  room.idlePauseMs = 20;
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  try {
    assert.equal(room.game.phase, 'night');
    assert.ok(voice.asleep.has('u1'), '夜里闭耳');
    room.online.add('u1');
    room.presence();
    await sleep(40);
    assert.equal(room.paused, false, '有人在就不暂停');
    room.online.delete('u1');
    room.presence();
    await sleep(60);
    assert.equal(room.paused, true, '都离线了就暂停');
    assert.equal(voice.asleep.size, 0, '闭耳全放开');
    assert.equal(room.timers.size, 0, '计时器全停（机器人不会接着推进）');
    const night = room.game.night;
    await sleep(30);
    assert.equal(room.game.night, night, '暂停中不会天亮天黑');
    assert.equal(room.snapshot().paused, true, '存档记得是暂停的');
    room.online.add('u2');
    room.presence();
    assert.equal(room.paused, false, '有人回来就接着打');
    await sleep(5);
    if (room.game.phase === 'night') assert.ok(voice.asleep.has('u2'), '还是夜里：重新闭耳');
    assert.ok(room.timers.size > 0, '计时器重新排上');
    assert.equal(room.game.night, night);
  } finally { room.reset(); }
});

test('一个语音频道只许一局：别的局有人在玩就不让开；那局没人了就把它结束、让出来', async () => {
  const voice = mockVoice();
  const mk = (key) => {
    const r = new Room({ key, guildId: 'g', hostId: 'u1', voice, settings: { ...FAST, mode: 'auto', shuffle: false } });
    for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) r.users.set(id, { id, name, avatar: null });
    return r;
  };
  const a = mk('g:text1');
  const b = mk('g:voice1');
  a.peers = b.peers = () => [a, b];
  await a.act('u1', 'join');
  await a.act('u1', 'addBots', { count: 6 });
  await a.act('u1', 'start');
  try {
    assert.equal(a.square, 'square');
    a.online.add('u1');
    await b.act('u1', 'join');
    await b.act('u1', 'addBots', { count: 6 });
    await assert.rejects(b.act('u1', 'start'), /已经有一局在进行/);
    assert.equal(b.game, null, '没开成');
    a.online.delete('u1'); // 那局的人都走了
    await b.act('u1', 'start');
    assert.ok(b.game, '这局开成了');
    assert.equal(a.game, null, '没人玩的那局被结束、回到大厅');
  } finally { a.reset(); b.reset(); }
});

test('语音校正：卡在房子频道里的人被拉回广场；自己去别的频道的不管；点"语音归位"马上拉', async () => {
  const at = new Map();
  const voice = { ...mockVoice(), async where(id) { return at.get(id) ?? null; }, async move(id, ch) { at.set(id, ch); return true; } };
  const { room } = setup('auto', voice);
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  try {
    room.ownChannel('house-ch');          // 这局开过的房子频道
    at.set('u1', 'house-ch');             // u1 被卡在里面（游戏里他已经出来了）
    at.set('u2', 'other-ch');             // u2 自己去了别的频道
    room.voiceTouched.clear();
    assert.equal(await room.reconcileVoice(), 1);
    assert.equal(at.get('u1'), 'square', '拉回广场');
    assert.equal(at.get('u2'), 'other-ch', '别的频道不管');
    assert.match((await room.act('u2', 'fixVoice')).notice, /拉回广场/);
    assert.equal(at.get('u2'), 'square');
    assert.match((await room.act('u2', 'fixVoice')).notice, /没问题/);
  } finally { room.reset(); }
});

test('7 人以下不发男爵：开着时 5、6 人局随机不出男爵；房主指定的照给', async () => {
  const { rollRoles } = await import('../src/engine/game.js');
  const { buildRoles } = await import('../src/engine/assign.js');
  for (let i = 0; i < 300; i++) {
    assert.ok(!rollRoles(5, Math.random, { noBaron: true }).includes('baron'));
    assert.ok(!buildRoles(['a', 'b', 'c', 'd', 'e', 'f'], { a: 'imp' }, 'tb', Math.random, { noBaron: true }).includes('baron'));
  }
  assert.ok(buildRoles(['a', 'b', 'c', 'd', 'e'], { a: 'baron' }, 'tb', Math.random, { noBaron: true }).includes('baron'), '指定了就给');
  const { room } = setup('auto');
  assert.equal(room.settings.smallNoBaron, true, '默认开');
  await room.act('u1', 'settings', { smallNoBaron: false });
  assert.equal(room.settings.smallNoBaron, false);
});

test('造谣者自由声明：只有真造谣者的才问 AI；判为真今晚有人死；没配 AI 不能自由说', async () => {
  const { room } = setup('auto');
  room.settings.script = 'bmr';
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'gossip' });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'chambermaid' });
  await room.act('u1', 'start');
  try {
    await untilDayBMR(room);
    const g = room.game;
    assert.equal(g.phase, 'day');
    room.judgeReady = () => false;
    await assert.rejects(room.act('u2', 'gossip', { statement: { kind: 'free', text: '3号 是恶魔' } }), /没配 AI/);
    const asked = [];
    room.judgeReady = () => true;
    room.judge = async (text, facts) => { asked.push({ text, facts }); return { verdict: 'true', reason: '测试', by: '假的' }; };
    assert.equal(room.viewFor('u2').self.gossipFree, true);
    await room.act('u1', 'gossip', { statement: { kind: 'free', text: '我们之中有两个爪牙' } });
    assert.equal(asked.length, 0, '不是造谣者的不问 AI');
    await room.act('u2', 'gossip', { statement: { kind: 'free', text: '  3号   是恶魔 ' } });
    await assert.rejects(room.act('u2', 'gossip', { statement: { kind: 'free', text: '再说一句' } }), /已经发表过/);
    await room.gossipJudging;
    assert.equal(asked.length, 1);
    assert.equal(asked[0].text, '3号 是恶魔', '空白被整理过');
    assert.match(asked[0].facts, /造谣者/, '给 AI 的材料里有真实角色');
    assert.match(asked[0].facts, /复盘时间线/);
    assert.equal(g.gossipPending, true, '判为真：今晚有人死');
    assert.ok(room.log.some((l) => /公开声明：「3号 是恶魔」/.test(l.text)), '公开播报');
    assert.ok(room.log.some((l) => l.kind === 'story' && l.title === '公开声明' && /「3号 是恶魔」/.test(l.text) && l.audio !== undefined), '说书人念出来 + 大字卡');
    assert.ok(g.timeline.some((e) => /AI（假的）判为真/.test(e.text)), '复盘里有判定理由');
  } finally { room.reset(); }
});

test('造谣：不是造谣者的人第二天还能再发表声明（每人每天一次，不是每局一次）', async () => {
  const { room } = setup('auto');
  room.settings.script = 'bmr';
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'gossip' });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'fool' }); // 弄臣：第一次死亡不死，保证 u1 活到第二天
  await room.act('u1', 'start');
  try {
    room.judgeReady = () => true;
    room.judge = async () => ({ verdict: 'false', reason: '测试', by: '假的' });
    const g = room.game;
    for (let day = 1; day <= 2; day++) {
      await untilDayBMR(room);
      for (let k = 0; k < 100 && g.phase === 'night'; k++) await sleep(3);
      assert.ok(!g.winner && g.get('u1').alive, `第 ${day} 天 u1 还活着、局还没结束`);
      assert.equal(room.viewFor('u1').self.gossipDone, false, `第 ${day} 天开始时还没说过`);
      await room.act('u1', 'gossip', { statement: { kind: 'free', text: `第${day}天：3号是恶魔` } });
      assert.equal(room.viewFor('u1').self.gossipDone, true);
      await room.gossipJudging;
      await room.act('u1', 'gather');
      await room.act('u1', 'dusk');
      for (let k = 0; k < 50 && g.phase === 'day'; k++) await sleep(2);
    }
    assert.equal(g.timeline.filter((e) => /声称"第\d天/.test(e.text)).length, 2, '两天各说了一次');
  } finally { room.reset(); }
});

test('AI 判定：第一家失败换第二家；都失败返回 null', async () => {
  const { judgeStatement } = await import('../src/server/judge.js');
  const providers = [
    { name: 'A', url: 'a', key: () => 'k', model: () => 'm' },
    { name: 'B', url: 'b', key: () => 'k', model: () => 'm' },
    { name: 'C', url: 'c', key: () => undefined, model: () => 'm' },
  ];
  const ok = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const res = await judgeStatement('x', 'facts', { providers, fetchImpl: async (url) => (url === 'a' ? { ok: false, status: 500 } : ok('{"verdict":"false","reason":"不对"}')) });
  assert.deepEqual(res, { verdict: 'false', reason: '不对', by: 'B' });
  assert.equal(await judgeStatement('x', 'facts', { providers, fetchImpl: async () => ok('不是 JSON') }), null);
  assert.equal(await judgeStatement('x', 'facts', { providers, fetchImpl: async () => ok('{"verdict":"maybe"}') }), null);
});

test('AI 判定：快速模型先判；它判不出（unknown）再问深度模型，深度模型也失败就用快速模型的结论', async () => {
  const { judgeStatement } = await import('../src/server/judge.js');
  const providers = [
    { name: '快速', url: 'fast', key: () => 'k', model: () => 'm', escalate: true },
    { name: '深度', url: 'deep', key: () => 'k', model: () => 'm' },
  ];
  const ok = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const asked = [];
  const ask = (fast, deep) => async (url) => { asked.push(url); return url === 'fast' ? fast : deep; };
  // 快速模型给出真假：直接用，不再问深度模型
  assert.equal((await judgeStatement('x', 'f', { providers, fetchImpl: ask(ok('{"verdict":"true","reason":"对"}'), null) })).by, '快速');
  assert.deepEqual(asked, ['fast']);
  // 快速模型判不出：问深度模型
  asked.length = 0;
  const res = await judgeStatement('x', 'f', { providers, fetchImpl: ask(ok('{"verdict":"unknown","reason":"不确定"}'), ok('{"verdict":"false","reason":"不对"}')) });
  assert.deepEqual(res, { verdict: 'false', reason: '不对', by: '深度' });
  assert.deepEqual(asked, ['fast', 'deep']);
  // 深度模型失败：还是用快速模型的 unknown
  const back = await judgeStatement('x', 'f', { providers, fetchImpl: ask(ok('{"verdict":"unknown","reason":"不确定"}'), { ok: false, status: 500 }) });
  assert.deepEqual(back, { verdict: 'unknown', reason: '不确定', by: '快速' });
});

test('声称猎手开枪：自由活动中也能开；说书人念出来、弹"开枪"大字卡', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  try {
    await untilDay(room);
    for (let k = 0; k < 200 && !room.roam; k++) await sleep(5);
    assert.ok(room.roam, '在自由活动');
    await room.act('u2', 'slay', { target: 'bot-1' });
    const card = room.log.find((l) => l.kind === 'story' && l.title === '开枪');
    assert.ok(card, '弹出"开枪"大字卡并朗读');
    assert.ok(room.log.some((l) => /声称自己是猎手/.test(l.text)), '记录里有');
    await assert.rejects(room.act('u2', 'slay', { target: 'bot-2' }), /已经开过枪/);
  } finally { room.reset(); }
});

test('房主标记新手：只有房主能标、开局后不能改；存档读得回来；开局记进局里', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await assert.rejects(room.act('u2', 'markNewbie', { player: 'u2', on: true }), /房主/);
  await assert.rejects(room.act('u1', 'markNewbie', { player: 'bot-1', on: true }), /机器人/);
  await room.act('u1', 'markNewbie', { player: 'u2', on: true });
  assert.deepEqual(room.viewFor('u2').newbies, [], '新手标记只有房主看得到');
  assert.deepEqual(room.viewFor('u1').newbies, ['u2'], '房主看得到');
  assert.deepEqual(room.snapshot().newbies, ['u2']);
  await room.act('u1', 'start');
  try {
    assert.deepEqual(room.game.newbies, ['u2']);
    assert.equal(room.viewFor('u2').self.newbie, true);
    assert.equal(room.viewFor('u1').self.newbie, false);
    await assert.rejects(room.act('u1', 'markNewbie', { player: 'u2', on: false }), /开局后/);
  } finally { room.reset(); }
});

test('夜里：疯子拖到超时被替选，真恶魔不会被同时替选，而是另给一段时间；玩家只看得到自己选人时的倒计时', async () => {
  const { room } = setup('auto');
  room.settings.script = 'bmr';
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'lunatic' });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'pukka' });
  await room.act('u1', 'start');
  try {
    room.dawnPad = [32_000, 32_000]; // 天亮定在"以为自己是恶魔的人"选完后 32 秒（正式是随机 20–45 秒）
    const g = room.game;
    g.get('u1').shownRole = 'pukka'; // 疯子以为自己是普卡：首夜也要选人，真普卡得等他
    assert.ok(g.nightPrompts().find((x) => x.playerId === 'u2').waiting, '真恶魔在等疯子');
    assert.equal(room.viewFor('u2').deadline, null, '等疯子的时候看不到倒计时');
    assert.ok(room.viewFor('u1').deadline, '疯子看得到自己的倒计时');
    for (let k = 0; k < 200 && !g.choices.u1; k++) await sleep(5); // 共同截止时间到：疯子被替选
    assert.ok(g.choices.u1, '疯子超时被替选');
    await sleep(30);
    assert.equal(g.phase, 'night', '还没结算');
    assert.equal(g.choices.u2, undefined, '真恶魔没被同时替选');
    const due = room.dueFor.u2;
    assert.ok(due - Date.now() > 25_000, '恶魔另有一段时间（天亮前 2 秒截止）');
    assert.equal(room.dawnAt - due, 2000);
    assert.equal(room.viewFor('u2').deadline, due, '恶魔看到的是自己的截止时间');
    assert.equal(room.viewFor('u1').deadline, null, '选完的人看不到倒计时');
    assert.ok(room.inbox.get('u2').some((m) => /轮到你/.test(m.text)), '告诉恶魔轮到他了');
    const pr = g.nightPrompts().find((x) => x.playerId === 'u2');
    await room.act('u2', 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) });
    await sleep(700);
    assert.equal(g.phase, 'night', '恶魔选完也要等到定好的天亮时刻（疯子从等待时间看不出来）');
    room.dawnAt = Date.now(); // 测试里不等那 30 秒
    await room.finishNight(g.night);
    for (let k = 0; k < 200 && g.phase === 'night'; k++) await sleep(5);
    assert.notEqual(g.phase, 'night', '到点就结算');
    assert.ok(!g.timeline.some((e) => /2号|u2/.test(e.text) && /超时/.test(e.text) && e.kind === 'choice' && e.text.includes(g.name('u2'))), '恶魔不算超时');
  } finally { room.reset(); }
});


test('黯月初升：没有疯子时，真恶魔选完也要等同样的一段时间才天亮（和有疯子时看起来一样）', async () => {
  const { room } = setup('auto');
  room.settings.script = 'bmr';
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'pukka' });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'fool' });
  await room.act('u1', 'start');
  try {
    room.dawnPad = [30_000, 30_000];
    const g = room.game;
    const pr = g.nightPrompts().find((x) => x.playerId === 'u2');
    if (g.players.some((p) => p.role === 'lunatic' && g.nightPrompts().some((x) => x.playerId === p.id))) return; // 随机到会醒的疯子：这条测不了
    const t0 = Date.now();
    await room.act('u2', 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) });
    for (const q of g.nightPrompts()) if (!g.choices[q.playerId] && !room.isFake(q.playerId)) await room.act(q.playerId, 'choose', { night: g.night, targets: q.options.slice(0, q.count) });
    await sleep(700);
    assert.equal(g.phase, 'night', '恶魔选完了也还没天亮');
    assert.ok(Math.abs(room.dawnAt - t0 - 30_000) < 500, '天亮定在恶魔选完后的那段时间');
    assert.equal(room.viewFor('u2').deadline, null, '选完的人看不到倒计时');
  } finally { room.reset(); }
});

test('假死的僵怖：提名环节不等他表态（他看不到「不提名」）；给大家看的存活人数也把他算成死人', async () => {
  const { room } = setup('auto');
  room.settings.script = 'bmr';
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'zombuul' });
  await room.act('u1', 'start');
  try {
    await untilDayBMR(room);
    const g = room.game;
    for (let k = 0; k < 100 && g.phase === 'night'; k++) await sleep(3);
    g.get('u2').apparentDead = true; // 僵怖第一次"死亡"：活着，但当作死人
    room.openNominations();
    for (const p of g.players) if (p.id !== 'u2' && g.visAlive(p)) room.noms.skips.add(p.id);
    assert.equal(room.nomsDone(), true, '除了假死的僵怖都表态了，就算全部表态');
    const v = room.viewFor('u1');
    assert.equal(v.aliveCount, g.visAliveCount(), '存活人数按看起来活着的算');
    assert.equal(v.aliveCount, g.aliveCount() - 1, '不把僵怖算进去');
    assert.equal(v.noms.done, v.aliveCount, '已表态 = 存活人数');
    await assert.rejects(room.act('u2', 'nominate', { target: 'u1' }), /死亡玩家不能提名/, '假死的僵怖不能提名');
  } finally { room.reset(); }
});

test('关键信息：天亮记下刀口（平安夜也记），记录里死讯、提名投票是关键，自由活动的操作提示和旁白不是', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  try {
    await untilDay(room);
    for (let k = 0; k < 200 && !room.roam; k++) await sleep(5);
    const v = room.viewFor('u2');
    assert.equal(v.knives.length, 1, '第一夜的刀口');
    assert.equal(v.knives[0].day, 1);
    assert.ok(Array.isArray(v.knives[0].deaths));
    const dawn = room.log.find((l) => /^第 1 天/.test(l.text));
    assert.equal(dawn?.key, true, '天亮的死讯 / 平安夜是关键信息');
    const roamTip = room.log.find((l) => /自由活动/.test(l.text) && l.kind === 'day');
    assert.equal(roamTip?.key, false, '自由活动怎么玩的提示不是关键信息');
    assert.ok(room.log.filter((l) => l.kind === 'story').every((l) => !l.key), '旁白不是关键信息');
  } finally { room.reset(); }
});

test('推荐预设：按人数挑，官方的权重高；这个人数没有就返回空', async () => {
  const { pickPreset, presetsFor } = await import('../src/shared/setups.js');
  assert.ok(presetsFor('tb', 8).length >= 3);
  const counts = {};
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 600; k++) { const p = pickPreset('tb', 8, rnd); counts[p.official ? 'off' : 'other'] = (counts[p.official ? 'off' : 'other'] ?? 0) + 1; assert.equal(p.roles.length, 8); }
  assert.ok(counts.off > 0);
  assert.equal(pickPreset('tb', 99), null);
});

test('敲门：在门口松开方向键、原地挪一下不算走开，敲门一直都在；真走远了才取消', async () => {
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
  await room.act('u2', 'lock', { house: 'tavern', locked: true });
  await room.act('u3', 'move', inside);
  const st = room.roam.state.get('tavern');
  assert.ok(st.knocks.has('u3'), '走向锁着的门：敲门');
  // 到门口后松开方向键：客户端发一次「停在原地」，还有在门口挪一小步
  for (let k = 0; k < 400 && room.roam.pos.get('u3') && Date.now() < room.roam.pos.get('u3').start + room.roam.pos.get('u3').dur; k++) await sleep(5);
  const here = room.posNow('u3');
  await room.act('u3', 'move', here);
  assert.ok(st.knocks.has('u3'), '停在门口：敲门还在');
  await room.act('u3', 'move', { x: here.x + 20, y: here.y });
  assert.ok(st.knocks.has('u3'), '门口挪一步：敲门还在');
  await room.act('u2', 'knock', { house: 'tavern', who: 'u3', yes: true });
  for (let k = 0; k < 2000 && !st.ids.has('u3'); k++) await sleep(5);
  assert.ok(st.ids.has('u3'), '放他进来：真的进来了');
  await room.teardown();
});

test('疯子（7 人及以上）：界面上和真恶魔一样看得到"爪牙"（红框、名单）和 3 张伪装；点「告诉爪牙」不会报错露馅', async () => {
  const { room } = setup('auto');
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'settings', { script: 'bmr' });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'lunatic' });
  await room.act('u1', 'start');
  const self = () => room.viewFor('u2').self;
  for (let k = 0; k < 400 && !self()?.allies; k++) await sleep(5);
  const minions = room.game.players.filter((p) => ROLES[p.role].team === 'minion').length;
  assert.equal(self().allies.length, minions, '爪牙人数对得上');
  assert.ok(self().allies.every((a) => a.team === '爪牙' && a.id !== 'u2'));
  assert.equal(self().bluffs.length, 3, '3 张伪装');
  assert.equal(self().bluffsMine, true);
  await room.act('u2', 'shareBluffs');
  assert.equal(self().bluffsShared, true, '显示已经告诉爪牙');
  await room.teardown();
});
