// 真人说书（2026-11-20 用户：房主自己当说书人时，系统性的不用他来，需要人脑抉择的地方由他决定；初始排版的 UI 也要做）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';
import { ROLES, isEvilRole } from '../src/engine/roles.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, roamMinutes: 0.002, nominateMinutes: 0.002 };
const until = async (f, ms = 5000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(5); };

function mockVoice() {
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r1'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

async function humanRoom(bots = 7, script = 'tb') {
  const room = new Room({ key: 'h', guildId: 'g', hostId: 'st', voice: mockVoice(), settings: { ...FAST, mode: 'human', script, shuffle: false } });
  room.users.set('st', { id: 'st', name: '说书人', avatar: null });
  room.users.set('u2', { id: 'u2', name: '阿二', avatar: null });
  room.online.add('st'); room.online.add('u2');
  await room.act('u2', 'join');
  await room.act('st', 'addBots', { count: bots });
  return room;
}

test('排版台：AI 先排一版；换角色（在场的就对调）、对调座位、重抽；酒鬼以为的、伪装、红鲱鱼照说书人定的开局', async () => {
  const room = await humanRoom();
  try {
    await room.act('st', 'start');
    assert.equal(room.game, null);
    let d = room.viewFor('st').draft;
    assert.equal(d.seats.length, 8);
    assert.ok(d.seats.every((x) => ROLES[x.role]), '每个座位都有角色');
    assert.equal(room.viewFor('u2').draft, null, '玩家看不到');

    // 0 号放酒鬼、1 号放占卜师、2 号小恶魔、3 号男爵：在场的角色会对调过来，不会重复
    await room.act('st', 'draft', { op: 'role', i: 0, role: 'drunk' });
    await room.act('st', 'draft', { op: 'role', i: 1, role: 'fortuneteller' });
    await room.act('st', 'draft', { op: 'role', i: 2, role: 'imp' });
    await room.act('st', 'draft', { op: 'role', i: 3, role: 'baron' });
    d = room.viewFor('st').draft;
    assert.deepEqual(d.seats.slice(0, 4).map((x) => x.role), ['drunk', 'fortuneteller', 'imp', 'baron']);
    assert.equal(new Set(d.seats.map((x) => x.role)).size, 8, '角色不重复');
    assert.ok(d.counts.mods.some((m) => m.role === 'baron' && /\+2 外来者/.test(m.text)), '男爵的 +2 外来者列出来');

    await room.act('st', 'draft', { op: 'swap', i: 0, j: 4 });
    d = room.viewFor('st').draft;
    assert.equal(d.seats[4].role, 'drunk');

    const inPlay = new Set(d.seats.map((x) => x.role));
    const fakeTf = d.roles.find((r) => r.team === 'townsfolk' && !inPlay.has(r.id)).id;
    await room.act('st', 'draft', { op: 'drunkAs', role: fakeTf });
    await assert.rejects(room.act('st', 'draft', { op: 'drunkAs', role: 'imp' }), /不在场的镇民/);
    const goodOut = d.roles.filter((r) => (r.team === 'townsfolk' || r.team === 'outsider') && !inPlay.has(r.id) && r.id !== fakeTf && r.id !== 'drunk').map((r) => r.id);
    await room.act('st', 'draft', { op: 'bluff', k: 0, role: goodOut.at(-1) });
    await assert.rejects(room.act('st', 'draft', { op: 'bluff', k: 1, role: 'imp' }), /不在场的善良角色/);
    await assert.rejects(room.act('st', 'draft', { op: 'herring', id: d.seats[2].id }), /善良/);
    const herring = d.seats.find((x) => !isEvilRole(x.role) && x.role !== 'fortuneteller').id;
    await room.act('st', 'draft', { op: 'herring', id: herring });
    d = room.viewFor('st').draft;
    assert.equal(d.drunkAs, fakeTf);
    assert.equal(d.bluffs[0], goodOut.at(-1));

    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    assert.ok(g, '发身份后开局');
    assert.equal(g.players[4].role, 'drunk');
    assert.equal(g.players[4].shownRole, fakeTf, '酒鬼以为的照说书人定的');
    assert.equal(g.bluffs[0], goodOut.at(-1), '伪装照说书人定的');
    assert.equal(g.redHerring, herring, '红鲱鱼照说书人定的');
    assert.match(g.timeline[0].text, new RegExp(`以为自己是${ROLES[fakeTf].name}`), '复盘的开局记录跟着改');
  } finally { await room.teardown(); }
});

test('排版台：重抽换一版；有人进出座位这一版作废；取消回大厅', async () => {
  const room = await humanRoom();
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'reroll' });
    assert.ok(room.viewFor('st').draft);
    await assert.rejects(room.act('st', 'start'), /正在排版/);
    room.users.set('u3', { id: 'u3', name: '阿三', avatar: null });
    await room.act('u3', 'join');
    assert.equal(room.draft, null, '有人坐下：作废');
    assert.ok(room.log.some((l) => /重新排版/.test(l.text)));
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'cancel' });
    assert.equal(room.draft, null);
    assert.equal(room.game, null);
  } finally { await room.teardown(); }
});

test('流程自动：没有要说书人判断的信息就和 AI 说书一样自动天亮、开始自由活动；要判断的停在天亮前，处理完自动天亮', async () => {
  const room = await humanRoom(6);
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    room.infoWhy = () => null; // 都是照规则算的
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      if (room.rkPending === 'u2') await room.act('u2', 'ravenkeeper', { target: 'u2' }).catch(() => {});
      if (room.held && room.nightNotes().length) await room.act('st', 'dawn').catch(() => {}); // AI 替他做过判定（误登记……）：他看过点天亮
      await sleep(5);
    }
    assert.ok(g.phase === 'day' || room.ended, '没要他发的信息：自动天亮');
    if (room.ended) return;
    await until(() => !!room.roam || room.roamedToday || room.ended, 3000);
    assert.ok(room.roam || room.roamedToday || room.ended, '天亮后自动自由活动');
    // 第二夜：所有信息都要过目
    await until(() => g.phase === 'night' || room.ended, 15000);
    if (room.ended) return;
    room.infoWhy = () => '测试';
    for (let k = 0; k < 400 && !room.held && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      if (room.rkPending === 'u2') await room.act('u2', 'ravenkeeper', { target: 'u2' }).catch(() => {});
      await sleep(5);
    }
    if (!room.held) return; // 第二夜碰巧没人拿信息
    const pending = room.viewFor('st').st.pendingInfo;
    assert.ok(pending.length && pending.every((m) => m.why === '测试'));
    room.nightNotes = () => []; // 没有 AI 判定：处理完最后一条就自动天亮
    await room.act('st', 'info', { action: 'sendAll' });
    await until(() => g.phase !== 'night' || room.ended, 3000);
    assert.notEqual(g.phase, 'night', '处理完自动天亮');
  } finally { await room.teardown(); }
});

test('说书人在就一直等他（不倒计时）；掉线了才把待发的信息照建议发出去、自动天亮', async () => {
  const room = await humanRoom(6);
  room.settings.stHoldMs = 60;
  room.online.delete('st'); // 掉线
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    room.infoWhy = () => '测试';
    for (let k = 0; k < 400 && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      if (room.rkPending === 'u2') await room.act('u2', 'ravenkeeper', { target: 'u2' }).catch(() => {});
      await sleep(5);
    }
    assert.ok(g.phase === 'day' || room.ended, '到点自己天亮');
    assert.equal(room.pendingInfo.size, 0, '没处理的照建议发了');
  } finally { await room.teardown(); }
});

test('待你决定：渔夫的建议、失忆者的回答、AI 听到的疯狂都由说书人定', async () => {
  const room = await humanRoom(6, 'snv'); // 疯狂只在梦殒春宵引擎
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    g.phase = 'day'; g.day = 1;
    const fish = room.addAsk({ kind: 'fisherman', who: 'u2', hint: null, suggest: '去找 3 号聊聊' });
    assert.equal(room.viewFor('st').st.asks[0].suggest, '去找 3 号聊聊');
    await room.act('st', 'stAsk', { id: fish.id, answer: 'send', text: '盯紧 5 号' });
    assert.match(room.viewFor('u2').self.inbox.at(-1).text, /盯紧 5 号/);
    await assert.rejects(room.act('st', 'stAsk', { id: fish.id, answer: 'send', text: 'x' }), /处理过了/);

    const am = room.addAsk({ kind: 'amnesiac', who: 'u2', text: '我能看到别人的角色', truth: '共情者', suggest: '有关' });
    await assert.rejects(room.act('st', 'stAsk', { id: am.id, answer: '差不多' }), /选一个回答/);
    await room.act('st', 'stAsk', { id: am.id, answer: '接近' });
    assert.match(room.viewFor('u2').self.inbox.at(-1).text, /\*\*接近\*\*/);

    room.madPunish('bot-1', '语音里破坏了疯狂', '**机器人1** 破坏了疯狂，被处决了！');
    const mad = room.viewFor('st').st.asks.find((a) => a.kind === 'mad');
    assert.ok(mad && g.get('bot-1').alive, 'AI 只提议，没有直接处决');
    room.madPunish('bot-1', '又一次', 'x');
    assert.equal(room.viewFor('st').st.asks.filter((a) => a.kind === 'mad').length, 1, '同一个人一天只提一次');
    await room.act('st', 'stAsk', { id: mad.id, answer: 'execute' });
    assert.ok(g.executedToday, '说书人定了才处决');
    assert.equal(room.viewFor('u2').st, undefined, '玩家看不到说书台');
  } finally { await room.teardown(); }
});

test('主教在场（真人说书）：提名由说书人点，不再由 AI 挑；投完没处决可以接着提，点「提名完了」入夜', async () => {
  const room = await humanRoom(6, 'bmr');
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    g.phase = 'day'; g.day = 1; room.roamedToday = true;
    const bishop = g.players[0];
    g.bishopOn = () => true;
    g.travellerOf = () => bishop;
    room.openNominations();
    assert.equal(room.bishopQueue ?? null, null, 'AI 不替说书人挑');
    const card = room.viewFor('st').st.asks.find((a) => a.kind === 'bishop');
    assert.ok(card?.options.length, '卡片上列出能提名的人');
    assert.ok(card.options.some((o) => o.opp), '标出和主教对立的');
    const target = card.options[0].id;
    await room.act('st', 'stAsk', { id: card.id, answer: 'nominate', text: target });
    assert.equal(room.pendingNom?.nominee, target);
    assert.equal(room.pendingNom?.nominator, 'storyteller');
    assert.ok(!room.viewFor('st').st.asks.some((a) => a.kind === 'bishop'), '提名中卡片收起来');
    await assert.rejects(room.act('st', 'st', { action: 'nominate', target: card.options[1].id }), /还有一场提名/);
    // 跳过投票：模拟投完没处决
    room.pendingNom = null; room.vote = null;
    room.afterVote();
    const again = room.viewFor('st').st.asks.find((a) => a.kind === 'bishop');
    assert.ok(again && !again.options.some((o) => o.id === target), '没处决：再放一张卡片，提过的人不在里面');
    await room.act('st', 'stAsk', { id: again.id, answer: 'done' });
    await until(() => g.phase !== 'day' || room.duskDay === g.day, 3000);
    assert.ok(g.phase !== 'day' || room.duskDay === g.day, '提名完了就入夜');
  } finally { await room.teardown(); }
});

test('说书人在线时停在天亮前一直等，不会自己天亮', async () => {
  const room = await humanRoom(6);
  room.settings.stHoldMs = 30;
  try {
    await room.act('st', 'start');
    await room.act('st', 'draft', { op: 'go' });
    const g = room.game;
    room.infoWhy = () => '测试';
    for (let k = 0; k < 400 && !room.held && g.phase === 'night'; k++) {
      if (!room.resolving) for (const pr of g.nightPrompts()) if (!room.isFake(pr.playerId) && !g.choices[pr.playerId]) await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      if (room.rkPending === 'u2') await room.act('u2', 'ravenkeeper', { target: 'u2' }).catch(() => {});
      await sleep(5);
    }
    if (!room.held) return;
    await sleep(200);
    assert.equal(g.phase, 'night', '过了好几轮兜底时间还在等');
    assert.equal(room.viewFor('st').st.held, true);
    await room.act('st', 'dawn');
    await until(() => g.phase !== 'night' || room.ended, 3000);
    assert.notEqual(g.phase, 'night');
  } finally { await room.teardown(); }
});
