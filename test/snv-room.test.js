// 梦殒春宵的房间流程：整局跑完、夜里换角色的暂停、白天的新操作、疯狂判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };

function mockVoice() {
  let n = 0;
  return {
    async findSquare() { return 'square'; },
    async setAsleep() {},
    async openRoom() { return `room${++n}`; },
    async closeRoom() {},
    async addToRoom() {},
    async removeFromRoom() {},
    async moveAll() {},
    async setMuted() {},
  };
}

function setup() {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'snv' } });
  room.moonchildWaitMs = 5; // 处决后的遗言时间：测试里不等
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  return room;
}

async function snvRoom(roles = {}, bots = 6) {
  const room = setup();
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: bots });
  for (const [player, role] of Object.entries(roles)) await room.act('u1', 'assignRole', { player, role });
  await room.act('u1', 'start');
  return room;
}

/** 替真人把今晚该选的都选了，直到天亮。 */
async function untilDay(room) {
  for (let k = 0; k < 400 && room.game.phase === 'night'; k++) {
    const g = room.game;
    if (!room.resolving || room.revivePending) {
      for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        const targets = pr.optional ? [] : pr.options.slice(0, pr.count);
        await room.act(pr.playerId, 'choose', { night: g.night, targets, role: pr.pickRole && !pr.optional ? pr.roleOptions[0] : null }).catch(() => {});
      }
    }
    await sleep(3);
  }
}

for (const preset of [0, 1, 2, 3, 4]) {
  test(`整局跑完（官方配置 ${preset + 1}）`, async () => {
    const room = setup();
    room.settings.preset = preset;
    await room.act('u1', 'join');
    await room.act('u2', 'join');
    await room.act('u1', 'addBots', { count: 6 });
    await room.act('u1', 'start');
    const g = room.game;
    assert.equal(g.script, 'snv');
    let days = 0;
    while (!g.winner && !room.ended && days < 25) {
      await untilDay(room);
      if (g.winner || room.ended) break;
      days++;
      await until(() => room.roam || room.ended, 300);
      if (room.ended) break;
      if (room.roam) assert.equal(room.viewFor('u1').roam.map, 'snv');
      await room.act('u1', 'gather');
      for (const id of ['u1', 'u2']) if (g.pendingKlutz === id) await room.act(id, 'klutz', { target: g.alive()[0].id });
      if (g.winner || room.ended) break;
      const a = g.alive().find((p) => !g.nominators.has(p.id));
      const b = g.alive().find((p) => p.id !== a?.id && !g.nominees.has(p.id));
      if (a && b && !g.executedToday && !room.pendingNom && !room.vote) await room.act(a.id, 'nominate', { target: b.id }).catch(() => {});
      await until(() => !room.pendingNom && !room.vote, 300);
      if (days > 6 && g.phase === 'day' && !g.block && !g.executedToday && !g.winner) g.block = g.alive()[0].id; // 测试里真人不投票：拖久了（比如恶魔死了、双子都活着）就处决一个
      if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
      await until(() => g.phase !== 'day' || g.winner || room.ended, 500);
    }
    assert.ok(g.winner, `打出了胜负（第 ${days} 天，${g.phase}，投票 ${!!room.vote}，提名 ${!!room.pendingNom}，存活 ${g.aliveCount()}，${g.players.map((p) => p.role).join(' ')}）`);
    await room.teardown();
  });
}

test('舞蛇人换到恶魔后要当场选人，提示里不说"你被复活了"', async () => {
  const room = await snvRoom({ u1: 'snakecharmer', u2: 'oracle', 'bot-1': 'fanggu', 'bot-2': 'witch' });
  const g = room.game;
  await room.act('u1', 'choose', { night: g.night, targets: ['u2'] });
  await until(() => g.phase === 'day');
  await room.dusk();
  await until(() => g.phase === 'night' && !room.resolving);
  await room.act('u1', 'choose', { night: g.night, targets: ['bot-1'] });
  await until(() => room.revivePending === 'u1');
  assert.equal(g.get('u1').role, 'fanggu');
  const me = room.viewFor('u1').self;
  const inbox = me.inbox.map((m) => m.text).join('\n');
  assert.doesNotMatch(inbox, /复活/);
  assert.match(inbox, /方古/);
  assert.equal(me.role.id, 'fanggu');
  assert.equal(me.role.evil, true);
  assert.ok(me.prompt, '能看到选人面板');
  await room.act('u1', 'choose', { night: g.night, targets: ['u2'] });
  await until(() => g.phase === 'day' || g.winner);
  assert.ok(!g.get('u2').alive);
  await room.teardown();
});

test('善良的恶魔按阵营显示善良；死掉但保留能力的爪牙还看得到选人面板', async () => {
  const room = await snvRoom({ u1: 'witch', 'bot-1': 'vigormortis' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.get('u1').alive = false; g.get('u1').kept = true;
  g.phase = 'night'; g.night += 1; g.choices = {};
  room.resolving = false;
  assert.ok(room.viewFor('u1').self.prompt, '被亡骨魔杀死的女巫还要行动');
  g.get('u2').evil = false; g.changeRole(g.get('u2'), 'fanggu');
  assert.equal(room.viewFor('u2').self.role.evil, false);
  await room.teardown();
});

test('博学者、艺术家、公开声明、公开猜测都走得通；别人点不了', async () => {
  const room = await snvRoom({ u1: 'savant', u2: 'artist', 'bot-1': 'nodashii', 'bot-2': 'witch' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  assert.equal(room.viewFor('u1').self.canSavant, true);
  assert.equal(room.viewFor('u2').self.canSavant, false);
  await room.act('u1', 'savant');
  assert.match(room.viewFor('u1').self.inbox.at(-1).text, /一真一假/);
  assert.equal(room.viewFor('u1').self.canSavant, false);
  await assert.rejects(room.act('u2', 'savant'), /只有博学者/);

  room.judgeReady = () => true;
  const asked = [];
  room.judge = async (text, facts) => { asked.push({ text, facts }); return { verdict: 'true', reason: '测试', by: '假的' }; };
  await room.act('u2', 'artist', { text: '恶魔在座位上吗' });
  await until(() => room.viewFor('u2').self.inbox.some((m) => m.text.includes('说书人的回答')));
  assert.match(asked[0].facts, /梦殒春宵/);
  assert.equal(room.viewFor('u2').self.canArtist, false);

  await room.act('u2', 'juggle', { guesses: [{ target: 'u1', role: 'savant' }] });
  assert.equal(room.viewFor('u2').self.canJuggle, false);
  await room.teardown();
});

test('艺术家：没配 AI 答"我不知道"，能力照样用掉', async () => {
  const room = await snvRoom({ u2: 'artist', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  room.judgeReady = () => false;
  await room.act('u2', 'artist', { text: '我们快赢了吗' });
  assert.match(room.viewFor('u2').self.inbox.at(-1).text, /我不知道/);
  await room.teardown();
});

test('疯狂：AI 说书黄昏判定；声明过的放过，没声明的处决', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  g.st.madnessPenalty = () => true;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.madness = { u2: { role: 'oracle', night: g.night, claimed: false, by: 'u1' } };
  g.declare('u2', 'oracle');
  await room.judgeMadness();
  assert.ok(g.get('u2').alive, '声明过了');
  g.madness.u2.claimed = false;
  g.block = 'bot-2';
  await room.judgeMadness();
  assert.ok(g.get('u2').alive, '台上有人时白天不处决：一天只处决一次');
  assert.deepEqual(g.madNight.splice(0).map((x) => x.id), ['u2'], '留到入夜');
  g.block = null;
  await room.judgeMadness();
  assert.ok(!g.get('u2').alive, '没声明，被处决');
  assert.ok(g.executedToday);
  await room.teardown();
});

test('疯狂：今天已有处决，没疯狂的活人在入夜时处决，当场公布，也有遗言时间', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  room.moonchildWaitMs = 60_000;
  g.st.madnessPenalty = () => true;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.madness = { u2: { role: 'oracle', night: g.night, claimed: false, by: 'u1' } };
  g.block = 'bot-2';
  await room.dusk();
  assert.ok(!g.get('bot-2').alive, '台上的人照常处决');
  assert.ok(!g.get('u2').alive, '没疯狂的人也处决了');
  assert.ok(room.log.some((l) => l.text.includes('也被处决了')));
  assert.equal(room.viewFor('u2').self.moonchild, 'fake');
  await room.teardown();
});

test('疯狂：洗脑师选中已死的人，AI 说书也判，算当天的处决；台上有人时不判', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  g.st.madnessPenalty = () => true;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.get('u2').alive = false;
  g.madness = { u2: { role: 'oracle', night: g.night, claimed: false, by: 'u1' } };
  g.block = 'bot-2';
  await room.judgeMadness();
  assert.equal(g.executedToday, false);
  assert.equal(g.madNight.length, 0, '死人留到夜里没有意义');
  g.block = null;
  await room.judgeMadness();
  assert.ok(g.executedToday, '死人也占当天的处决');
  assert.ok(room.log.some((l) => l.text.includes('已经死去的')));
  await room.teardown();
});

test('杂耍艺人只声明不猜：公告说清楚，不算猜测', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'juggler', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  await room.act('u2', 'juggle', { guesses: [] });
  assert.ok(room.log.some((l) => l.text.includes('我是杂耍艺人，今天不猜')));
  assert.equal(room.viewFor('u2').self.canJuggle, false);
  await room.teardown();
});

test('今晚的死亡天亮才公开：别的玩家和死者本人都看到还活着，说书人看到真实状态；夜里的处决当场公开', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.phase = 'night';
  g.snvDie(g.get('u2'), 'demon');
  const seen = (uid, id) => room.viewFor(uid).players.find((p) => p.id === id).alive;
  assert.equal(seen('u1', 'u2'), true, '别的玩家还看不到');
  assert.equal(room.viewFor('u1').aliveCount, 8);
  assert.equal(seen('u2', 'u2'), true, '死者自己也要等天亮（不然赌徒能分出是赌死的还是被刀的）');
  g.madExecute('bot-2', '测试', { night: true });
  assert.equal(seen('u1', 'bot-2'), false, '处决当场公开');
  room.settings.mode = 'human';
  assert.equal(seen('u1', 'u2'), false, '说书人看真实状态');
  room.settings.mode = 'auto';
  g.phase = 'day';
  assert.equal(seen('u1', 'u2'), false, '天亮公开');
  await room.teardown();
});

test('记录：推送只带最后 40 条，打开时能取到这局从开始到现在的全部，上一局的不算', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  for (let i = 0; i < 300; i++) room.announce(`第 ${i} 条`, 'vote');
  assert.equal(room.viewFor('u1').log.length, 40);
  const { log } = await room.act('u2', 'fullLog');
  assert.equal(log[0].kind, 'start', '从这局开局开始');
  assert.ok(log.some((l) => l.text === '第 0 条'));
  assert.equal(log.at(-1).text, '第 299 条');
  await room.teardown();
});

test('入夜：闭麦慢也先把夜晚推给大家、开始倒计时；天亮等闭麦做完才解开', async () => {
  const room = await snvRoom({ u1: 'dreamer', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  room.settings.nightDeafen = true;
  const order = [];
  let finish;
  room.voice.setAsleep = (ids, on) => {
    order.push(on ? '闭' : '开');
    return on ? new Promise((r) => { finish = () => { order.push('闭完'); r(); }; }) : Promise.resolve();
  };
  const seen = [];
  const before = room.onChange;
  room.onChange = (r) => { seen.push(g.phase); before?.(r); };
  const p = room.beginNight();
  await until(() => finish);
  assert.ok(seen.includes('night'), '闭麦还没完，夜晚已经推出去了');
  assert.ok(room.deadline > Date.now(), '倒计时已经开始');
  g.choices = {};
  const dawn = room.beginDay();
  await sleep(20);
  assert.deepEqual(order, ['闭'], '闭麦没做完，先别解开');
  finish();
  await p;
  await dawn;
  assert.deepEqual(order, ['闭', '闭完', '开']);
  await room.teardown();
});

test('天亮：解开闭麦慢也先公布死讯；下一次入夜等它解完才闭', async () => {
  const room = await snvRoom({ u1: 'sage', u2: 'artist', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  room.settings.nightDeafen = true;
  room.settings.mode = 'human'; // 不然天亮后自动开自由活动，和这里手动入夜撞上
  const order = [];
  const held = []; // 还没解完的
  room.voice.setAsleep = (ids, on) => {
    order.push(on ? '闭' : '开');
    return on ? Promise.resolve() : new Promise((r) => held.push(r));
  };
  const finish = () => { order.push('开完'); for (const r of held.splice(0)) r(); };
  g.phase = 'night';
  const pushed = [];
  const before = room.onChange;
  room.onChange = (r) => { pushed.push(g.phase); before?.(r); };
  const day = room.beginDay();
  await until(() => held.length, 1000);
  assert.ok(room.log.some((l) => l.text.includes(`第 ${g.day} 天`)), '死讯已经公布');
  assert.ok(pushed.includes('day'), '已经推给大家');
  const night = room.beginNight();
  await sleep(30);
  assert.equal(g.phase, 'night', '夜晚照常开始');
  assert.deepEqual(order, ['开'], '还没解完，先别闭');
  finish();
  await day;
  await night;
  assert.deepEqual(order, ['开', '开完', '闭']);
  room.voice.setAsleep = async () => {}; // 收尾也会解开闭麦，别让它等
  await room.teardown();
});

test('两个呆瓜同时死：时间到了一个一个替他们选，选完才入夜', async () => {
  const room = await snvRoom({ u1: 'klutz', u2: 'artist', 'bot-1': 'nodashii' });
  const g = room.game;
  room.moonchildWaitMs = 10;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.get('u2').gained = 'klutz';
  g.snvDie(g.get('u1'), 'storyteller');
  g.snvDie(g.get('u2'), 'storyteller');
  g.evilOf = () => false; // 选谁都不定胜负，才看得到第二个
  await room.dusk();
  await until(() => g.night === 2);
  assert.equal(g.pendingKlutz, null);
  assert.equal(room.log.filter((l) => l.text.includes('公开选择了')).length, 2);
  await room.teardown();
});

test('真人说书：夜里疯狂处决当场公布；呆瓜当场选；处决恶魔当场结束', async () => {
  const room = await snvRoom({ u1: 'sage', u2: 'klutz', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  room.settings.mode = 'human';
  g.twin = null; // 其他角色是随机的：处决到善良双子邪恶直接赢，双子挡着恶魔死了也不结束
  // 其他角色是随机的，舞蛇人还可能和恶魔换了身份：按现在的身份取人
  const good = g.players.filter((q) => q.alive && q.id !== 'u1' && q.id !== 'u2' && !g.evilOf(q));
  await room.act('u1', 'st', { action: 'madExecute', target: good[0].id });
  assert.ok(g.executedToday);
  g.startNight();
  await room.act('u1', 'st', { action: 'madExecute', target: 'u2' });
  assert.ok(room.log.some((l) => l.text.includes(`夜里，**${g.name('u2')}** 因为疯狂被处决了`)));
  assert.equal(room.viewFor('u2').self.klutz, true);
  assert.ok(!g.nightDeaths.includes('u2'));
  await room.act('u2', 'klutz', { target: good[1].id });
  assert.equal(g.pendingKlutz, null);
  await room.act('u1', 'st', { action: 'madExecute', target: g.demonsAlive()[0].id });
  await until(() => room.ended);
  assert.equal(g.winner, 'good');
  await room.teardown();
});

test('疯狂：开了语音判定时看转写；模型判定失败退回说书人的判断', async () => {
  const room = await snvRoom({ u1: 'cerenovus', u2: 'sage', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  g.madness = { u2: { role: 'oracle', night: g.night, claimed: false, by: 'u1' } };
  room.hearing = { transcript: (id) => (id === 'u2' ? ['我真的是神谕者'] : []), stop() {}, listen() {} };
  room.madnessJudge = async () => ({ verdict: 'true', reason: '他说了', by: '假的' });
  g.st.madnessPenalty = () => assert.fail('听到了就不该走说书人的判断');
  await room.judgeMadness();
  assert.ok(g.get('u2').alive);

  room.madnessJudge = async () => { throw new Error('超时'); };
  g.st.madnessPenalty = () => false;
  await room.judgeMadness();
  assert.ok(g.get('u2').alive, '判定失败时按说书人的判断');

  room.madnessJudge = async () => ({ verdict: 'false', reason: '没提', by: '假的' });
  g.st.madnessPenalty = () => true;
  await room.judgeMadness();
  assert.ok(!g.get('u2').alive);
  await room.teardown();
});

test('语音判定：只有房主打开、服务器接得上才开；结束时关掉', async () => {
  const room = setup();
  room.settings.hearMadness = true;
  let opened = 0; let stopped = 0;
  room.hearingFor = async () => { opened += 1; return { transcript: () => [], listen() {}, stop() { stopped += 1; } }; };
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 3 });
  assert.equal(room.viewFor('u1').hearAvailable, true);
  await room.act('u1', 'start');
  assert.equal(opened, 1);
  await room.endGame();
  assert.equal(stopped, 1);
  await room.teardown();
});

test('语音判定：房主中途结束这局，机器人也退出语音', async () => {
  const room = setup();
  room.settings.hearMadness = true;
  let stopped = 0;
  room.hearingFor = async () => ({ transcript: () => [], listen() {}, stop() { stopped += 1; } });
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 3 });
  await room.act('u1', 'start');
  await room.act('u1', 'end');
  assert.equal(stopped, 1);
  assert.equal(room.hearing, null);
  await room.teardown();
});

test('语音判定：房主没打开就不开', async () => {
  const room = setup();
  let opened = 0;
  room.hearingFor = async () => { opened += 1; return null; };
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 3 });
  await room.act('u1', 'start');
  assert.equal(opened, 0);
  await room.teardown();
});

test('审查回归：结算暂停时点「立刻天亮」，替他选完接着结算，后半夜不丢，下一夜不提前结算', async () => {
  const room = await snvRoom({ u1: 'snakecharmer', u2: 'oracle', 'bot-1': 'fanggu', 'bot-2': 'witch' });
  const g = room.game;
  await room.act('u1', 'choose', { night: g.night, targets: ['u2'] });
  await until(() => g.phase === 'day');
  await room.dusk();
  await until(() => g.phase === 'night' && !room.resolving);
  await room.act('u1', 'choose', { night: g.night, targets: ['bot-1'] });
  await until(() => room.revivePending === 'u1');
  await room.act('u1', 'dawn');
  await until(() => g.phase === 'day' || g.winner);
  assert.equal(room.revivePending, null);
  assert.equal(g.midNight, null);
  assert.ok(g.timeline.some((t) => t.when === '第2夜' && t.kind === 'info'), '暂停点之后的信息照样发了');
  await room.teardown();
});

test('审核回归：连点两次结束白天，只结算一次，第二夜不会被跳过', async () => {
  const room = await snvRoom({ u1: 'oracle', u2: 'artist', 'bot-1': 'fanggu', 'bot-2': 'witch' });
  await untilDay(room);
  await until(() => room.game.phase === 'day');
  const g = room.game;
  await Promise.all([room.dusk(), room.dusk()]);
  await until(() => g.phase === 'night');
  await until(() => g.phase !== 'night');
  if (!g.winner) assert.equal(g.night, g.day, '夜和天的编号要对得上，多结算一次就会错位');
  await room.teardown();
});

test('审核回归：判定等大模型时不能提名、不能声明，不会多结算一次', async () => {
  const room = await snvRoom({ u1: 'oracle', u2: 'artist', 'bot-1': 'fanggu', 'bot-2': 'cerenovus' });
  await untilDay(room);
  await until(() => room.game.phase === 'day');
  const g = room.game;
  g.madness.u2 = { role: 'sage', night: g.night, claimed: false, by: 'bot-2' };
  room.heardLines = () => ['我是贤者'];
  let release; const wait = new Promise((ok) => { release = ok; });
  room.madnessJudge = async () => { await wait; return { verdict: 'true', reason: '', by: '测试' }; };
  const first = room.dusk();
  await until(() => room.dusking);
  assert.throws(() => room.nominate('u1', 'u2'), /黄昏/);
  assert.throws(() => room.declare('u1', 'sage'), /没有公开声明/);
  await room.dusk(); // 第二次什么都不做
  release();
  await first;
  await until(() => g.phase === 'night');
  await until(() => g.phase !== 'night');
  if (!g.winner) assert.equal(g.night, g.day);
  await room.teardown();
});

test('审核回归：被女巫咒死的提名者不会被自动投票，幽灵票还在', async () => {
  const room = await snvRoom({ u1: 'oracle', u2: 'artist', 'bot-1': 'fanggu', 'bot-2': 'witch' });
  await untilDay(room);
  await until(() => room.game.phase === 'day');
  const g = room.game;
  room.settings.nominatorVotes = true;
  g.get('u2').alive = false;
  assert.equal(room.nominatorAlive('u2'), false);
  room.vote = { nominator: 'u2', nominee: 'u1', order: [], idx: -1, yes: new Set(), locked: new Set(), result: null };
  assert.doesNotThrow(() => room.hand('u2', false), '死人可以不投');
  room.vote = null;
  await room.teardown();
});

test('审核回归：全员离线回来不清掉收音，重启才重新打开', async () => {
  const room = await snvRoom({ u1: 'oracle', u2: 'artist', 'bot-1': 'fanggu', 'bot-2': 'witch' });
  await untilDay(room);
  await until(() => room.game.phase === 'day');
  let listens = 0;
  room.mic = { listen() { listens++; }, stop() {}, transcript: () => [] };
  room.resume('有人回来了');
  await sleep(10);
  assert.equal(listens, 0, '收音还开着，不重新发令牌');
  let opened = 0;
  room.mic = null;
  room.openHearing = async () => { opened++; };
  room.resume('重启');
  await sleep(10);
  assert.equal(opened, 1, '重启后要重新打开语音判定');
  await room.teardown();
});

/** u2 拿 role，放上处决台走到黄昏。 */
async function deathAtDusk(role, wait = 60_000) {
  const room = await snvRoom({ u1: 'oracle', u2: role, 'bot-1': 'fanggu', 'bot-2': 'witch' });
  room.moonchildWaitMs = wait;
  await untilDay(room);
  await until(() => room.game.phase === 'day');
  room.game.block = 'u2';
  await room.dusk();
  return room;
}

test('审查回归：呆瓜被处决有遗言时间，公告不说他是呆瓜，选完才入夜', async () => {
  const room = await deathAtDusk('klutz');
  const g = room.game;
  assert.equal(room.viewFor('u2').self.klutz, true);
  assert.ok(room.viewFor('u1').moonchildDue > Date.now());
  await sleep(30);
  assert.equal(g.phase, 'day');
  await room.act('u2', 'klutz', { target: 'u1' });
  assert.ok(room.log.some((l) => l.text === `**${g.name('u2')}** 公开选择了 **${g.name('u1')}**。`));
  assert.ok(!room.log.some((l) => l.text.includes('呆瓜')), '公开记录不提呆瓜');
  await until(() => g.night === 2);
  assert.equal(g.night, 2);
  await room.teardown();
});

test('审查回归：呆瓜到时间没选，公开随机选', async () => {
  const room = await deathAtDusk('klutz', 10);
  const g = room.game;
  await until(() => !g.pendingKlutz || g.winner);
  assert.ok(!g.pendingKlutz);
  assert.ok(room.log.some((l) => l.text.includes('公开选择了')));
  await room.teardown();
});

test('审查回归：梦殒春宵别人被处决也有一样的时间，可以假装呆瓜', async () => {
  const room = await deathAtDusk('sage');
  const g = room.game;
  assert.equal(room.viewFor('u2').self.moonchild, 'fake');
  await room.act('u2', 'moonchild', { target: 'u1' });
  assert.equal(g.winner, null, '假装的没有效果');
  await until(() => g.night === 2);
  assert.equal(g.night, 2);
  await room.teardown();
});

test('审查回归：真人说书时，艺术家的问题到说书台，说书人回答后才告诉他', async () => {
  const room = setup();
  room.settings.mode = 'human';
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 7 });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'artist' });
  await room.act('u1', 'start');
  await room.act('u1', 'draft', { op: 'go' });
  const g = room.game;
  // 机器人是随机角色，有的还没选完就会报"还没选"：等它们选完
  for (let k = 0; k < 100 && g.phase !== 'day'; k++) { await room.act('u1', 'dawn').catch(() => {}); await sleep(10); }
  await until(() => g.phase === 'day');
  await room.act('u2', 'artist', { text: '恶魔活着吗' });
  assert.deepEqual(room.viewFor('u1').st.artistAsks.map(({ uid, text }) => ({ uid, text })), [{ uid: 'u2', text: '恶魔活着吗' }]);
  assert.ok(room.snapshot().artistAsks.length, '存档里有');
  await room.act('u1', 'st', { action: 'artistAnswer', target: 'u2', text: 'false' });
  assert.equal(room.viewFor('u1').st.artistAsks.length, 0);
  assert.match(room.viewFor('u2').self.inbox.map((m) => m.text).join('\n'), /回答：\*\*不是\*\*/);
  await room.teardown();
});

test('艺术家：问得有歧义（「1-5」）不答、不算用掉，让他重新问；问清楚了照常回答', async () => {
  const room = await snvRoom({ u2: 'artist', 'bot-1': 'nodashii' });
  const g = room.game;
  await untilDay(room);
  await until(() => g.phase === 'day');
  room.judgeReady = () => true;
  let next = { verdict: 'unknown', reason: '歧义：1-5 可能是 1 到 5 号，也可能是 1 号和 5 号' };
  room.judge = async () => next;
  await room.act('u2', 'artist', { text: '1-5有坏人吗' });
  await until(() => room.viewFor('u2').self.inbox.some((m) => m.text.includes('有歧义')));
  assert.equal(room.viewFor('u2').self.canArtist, true, '不算用掉');
  assert.ok(!room.viewFor('u2').self.inbox.some((m) => m.text.includes('1 号和 5 号')), '模型的理由不给玩家看');
  next = { verdict: 'true', reason: '1 到 5 号里有邪恶玩家' };
  await room.act('u2', 'artist', { text: '1到5号有坏人吗' });
  await until(() => room.viewFor('u2').self.inbox.some((m) => m.text.includes('说书人的回答')));
  assert.equal(room.viewFor('u2').self.canArtist, false, '问清楚了才算用掉');
  await room.teardown();
});
