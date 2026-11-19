// 赛后（2026-11-19 用户）：AI 赛后总结 + 军事法庭（判一名战犯，全场看他被吊起来），和 MVP 投票放在一起；
// 读场时顺便出每天的纪要（会议纪要软件的做法），赛后和政客读「前几天的纪要 + 最后一天原话」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/room.js';
import { judgeAfterGame } from '../src/server/judge.js';

const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005, rpsSeconds: 0.05 };
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
async function endedRoom(settings = {}) {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'mo', ...settings } });
  room.judgeReady = () => false;
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  room.roleAssign = { u2: 'poisoner' }; // 夜半狂欢有 15% 是无神论者局（没有邪恶，就没有「输的一方」）：指定一个爪牙
  await room.act('u1', 'start');
  return room;
}

test('赛后：AI 写总结、在输的一方判战犯；全场视图里有判词和动画开始时间', async () => {
  const room = await endedRoom();
  const g = room.game;
  try {
    let asked = null;
    room.afterJudge = async (facts, talk, losers, { court }) => {
      asked = { facts, talk, losers, court };
      return { recap: '第一夜……最后好人处决了恶魔。', moments: ['3 号的伪装骗过了所有人'], criminal: { seat: losers[0].seat, reason: '一直替恶魔说话', evidence: ['我保他是好人'] } };
    };
    room.talk = [{ day: 1, lines: { u1: ['我是贵族'] } }];
    g.setWinner('good', '测试');
    await room.afterGameNow(g);
    assert.equal(asked.court, true);
    assert.ok(asked.losers.length > 0 && asked.losers.every((q) => g.evilOf(g.players.find((p) => p.seat === q.seat))), '输的一方是邪恶');
    const v = room.viewFor('u1');
    assert.match(v.after.recap, /处决了恶魔/);
    assert.equal(v.after.pending, false);
    assert.equal(v.court.id, g.players.find((p) => p.seat === asked.losers[0].seat).id);
    assert.deepEqual(v.court.evidence, ['我保他是好人']);
    assert.ok(v.court.at > Date.now() - 5000);
    assert.deepEqual(v.after.talkers.map((t) => t.id), ['u1'], '话最多的人');
    assert.ok(room.log.some((l) => /军事法庭/.test(l.text)));
  } finally { await room.teardown(); }
});

test('赛后：房主关了军事法庭就不判；AI 判的人不在输的一方时不收，按记账兜底（没账就休庭）', async () => {
  const room = await endedRoom({ warCourt: false });
  const g = room.game;
  try {
    room.afterJudge = async (facts, talk, losers, { court }) => ({ recap: '总结', moments: [], criminal: court ? { seat: 1, reason: 'x', evidence: [] } : null });
    g.setWinner('evil', '测试');
    await room.afterGameNow(g);
    assert.equal(room.viewFor('u1').court, null);
    room.settings.warCourt = true;
    const winner = g.players.find((p) => g.evilOf(p)); // 赢家里的人
    room.afterJudge = async () => ({ recap: '总结', moments: [], criminal: null });
    g.execHist = [];
    await room.afterGameNow(g);
    assert.equal(room.court, null, '没账：休庭');
    assert.ok(room.log.some((l) => /休庭/.test(l.text)));
    assert.ok(winner);
  } finally { await room.teardown(); }
});

test('读场时存下当天纪要；赛后读「前几天的纪要 + 最后一天原话」，早几天的事不会被截掉', async () => {
  const room = await endedRoom();
  const g = room.game;
  try {
    room.tableJudge = async () => ({ claims: [], suspects: [], trusted: [], accusations: [], atheist: 0, stVoices: [], summary: '', minutes: { points: ['阿一报了贵族，说二号可疑'], quotes: [{ seat: 1, text: '我是贵族' }] } });
    room.talk = [{ day: 1, lines: { u1: ['我是贵族，'.repeat(400)] } }];
    g.day = 1;
    await room.readTableNow(g);
    assert.equal(room.minutes.length, 1);
    room.talk.push({ day: 2, lines: { u2: ['今天投三号'] } });
    const digest = room.talkDigest(g);
    assert.match(digest, /第1天纪要/);
    assert.match(digest, /阿一报了贵族/);
    assert.match(digest, /今天投三号/);
    assert.ok(!digest.includes('我是贵族，我是贵族，我是贵族，'), '第一天的原话用纪要代替');
  } finally { await room.teardown(); }
});

test('赛后模型的回答：战犯必须是输的一方，原话截短；不开军事法庭时不收战犯', async () => {
  const reply = (o) => ({ providers: [{ name: 'T', url: 'x', key: () => 'k', model: () => 'm' }], fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(o) } }] }) }) });
  const losers = [{ seat: 3, name: '丙' }];
  const r = await judgeAfterGame('facts', 'talk', losers, { court: true, ...reply({ recap: '故事', moments: ['a', 'b', 'c', 'd'], criminal: { seat: 3, reason: '判词', evidence: ['一句很长的原话'.repeat(10), '二', '三'] } }) });
  assert.equal(r.criminal.seat, 3);
  assert.equal(r.moments.length, 3);
  assert.equal(r.criminal.evidence.length, 2);
  assert.ok(r.criminal.evidence[0].length <= 40);
  const bad = await judgeAfterGame('facts', 'talk', losers, { court: true, ...reply({ recap: '故事', criminal: { seat: 5, reason: 'x' } }) });
  assert.equal(bad.criminal, null, '不在输的一方');
  const off = await judgeAfterGame('facts', 'talk', losers, { court: false, ...reply({ recap: '故事', criminal: { seat: 3, reason: 'x' } }) });
  assert.equal(off.criminal, null);
});
