// 说书人的局势（将军的信息、帮落后一方的骰子）和政客的责任（2026-11-16 用户要的三条）：
// ① 小魔典标记 ② 离终局多近 ③ 有将军或政客的剧本所有人开收音，AI 听大家的发言判局势、判政客。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeRng } from '../src/engine/game.js';
import { Room } from '../src/server/room.js';
import { MicInbox } from '../src/server/mic.js';
import { encodeWav } from '../client/src/micAudio.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` }));
const TRUST = ['noble', 'general', 'fortuneteller', 'oracle', 'politician', 'mezepheles', 'imp'];
const mk = (roles = TRUST, script = 'trust') => new Game(players(roles.length), { roles, rng: makeRng(3), script, misregister: 0 });

test('小魔典：好人们怀疑真恶魔，局势偏善良；集体怀疑好人，偏邪恶', () => {
  const g = mk();
  const base = g.st.balance();
  g.signals = () => ({ marksLead: 0.8, demonExposed: 0.9 });
  const up = g.st.balance();
  g.signals = () => ({ marksLead: -0.8, demonExposed: 0.1 });
  const down = g.st.balance();
  assert.ok(up > base && down < base, `${down} < ${base} < ${up}`);
  g.signals = () => { throw new Error('坏了'); };
  assert.equal(g.st.balance(), base, '信号出错不影响');
});

test('离终局：只剩 4 人、恶魔没被盯上，明显偏邪恶；恶魔被大家盯上就打折', () => {
  const g = mk();
  const before = g.st.balance();
  for (const id of ['p1', 'p3', 'p4']) g.get(id).alive = false; // 剩 4 人（将军、政客、灵言师、恶魔）
  const safe = g.st.balance();
  g.signals = () => ({ demonExposed: 0.95 });
  const exposed = g.st.balance();
  assert.ok(safe < before - 0.3, `${safe} 应该比 ${before} 低很多`);
  assert.ok(exposed > safe, '恶魔被怀疑时没那么偏邪恶');
});

test('将军：有 AI 当天的判断就照它说，没有就按局势分；AI 的判断也让说书人的局势分往它那边靠', () => {
  const g = mk();
  g.startNight(); g.resolveNight(); g.dawn(); g.endDay();
  const b0 = g.st.balance();
  g.aiLead = { day: g.day, side: 'evil', reason: '测试' };
  assert.ok(g.st.balance() < b0);
  g.startNight();
  for (const pr of g.nightPrompts()) g.autoChoose(pr.playerId);
  const r = g.resolveNight();
  assert.match(r.messages.filter((m) => m.playerId === 'p2').map((m) => m.text).join(''), /邪恶\*\*正在获胜/);
});

test('政客：AI 判他负最大责任就转阵营；判不是就撤回打分的结果', () => {
  const g = mk();
  g.startNight(); g.resolveNight(); g.dawn();
  g.setWinner('good', '测试'); // 邪恶输了，政客（p5）是善良的，不在输的一方
  assert.deepEqual(g.politicianEval, []);
  const h = mk(['noble', 'general', 'fortuneteller', 'oracle', 'politician', 'mezepheles', 'imp']);
  h.startNight(); h.resolveNight(); h.dawn();
  h.setWinner('evil', '测试'); // 善良输了：政客 p5 在输的一方
  assert.equal(h.politicianEval.length, 1);
  assert.equal(h.politicianEval[0].flipped, false, '没处决过人，打分不够');
  assert.equal(h.politicianVerdict('p5', true, '一直替恶魔说话'), true);
  assert.equal(h.evilOf(h.get('p5')), true, '转成邪恶，和赢的一方一起赢');
  assert.equal(h.politicianVerdict('p5', true, '重复'), false, '已经是这个结果');
  assert.equal(h.politicianVerdict('p5', false, '改判'), true);
  assert.equal(h.evilOf(h.get('p5')), false);
  assert.ok(h.timeline.some((e) => /说书人听了整局的发言/.test(e.text)));
});

// ───────────── 房间 ─────────────
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('房间：有将军、政客的剧本所有人都拿到收音；黄昏存下当天的发言，问 AI 局势；终局问 AI 政客', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'trust' } });
  room.micFor = () => new MicInbox({ transcribe: async () => '我觉得三号很可疑' });
  room.judgeReady = () => false;
  const asked = [];
  room.leadJudge = async (facts, talk) => { asked.push(talk); return { side: 'good', reason: '好人在怀疑恶魔' }; };
  room.politicianJudge = async (facts, talk, losers) => ({ seat: losers.find((q) => q.name === '阿二').seat, reason: '一直替恶魔说话' });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  room.roleAssign = { u1: 'general', u2: 'politician' };
  await room.act('u1', 'start');
  const g = room.game;
  try {
    for (let k = 0; k < 2000 && g.phase === 'night'; k++) { // 全套测试一起跑时夜里慢，等久一点
      if (!room.resolving) for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
      await sleep(3);
    }
    assert.equal(g.phase, 'day');
    const v = room.viewFor('u1').self;
    assert.ok(v.mic, '将军也拿到收音');
    assert.deepEqual(v.listenWhy, ['mezepheles', 'general', 'politician']);
    assert.ok(room.viewFor('u2').self.mic);
    const { micIngest } = await import('../src/server/mic.js');
    const wav = (secs) => Buffer.from(encodeWav(new Float32Array(Math.round(secs * 16000)).fill(0.3)));
    await micIngest(v.mic, wav(1));
    await room.dusk();
    assert.equal(room.talk.length, 1);
    assert.match(asked[0], /阿一：我觉得三号很可疑/);
    assert.equal(g.aiLead.side, 'good');
    assert.equal(g.aiLead.day, g.day);
    // 终局：善良输了，政客（阿二）在输的一方，AI 判他负最大责任 → 转阵营
    g.setWinner('evil', '测试');
    await room.judgePoliticianNow(g);
    assert.equal(g.evilOf(g.get('u2')), true);
    assert.ok(room.log.some((l) => /阿二.*政客.*转变阵营/.test(l.text)));
  } finally { await room.teardown(); }
});
