// 收音页：令牌只给本人、当天作废、不保留音频和文字；音频切句和 WAV 格式；判定时算上收音的话。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MicInbox, micIngest, micValid } from '../src/server/mic.js';
import { wavSamples } from '../src/server/stt.js';
import { Segmenter, downsample, encodeWav, RATE } from '../client/src/micAudio.js';
import { Room } from '../src/server/room.js';
import { looksBroken } from '../src/server/judge.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 3000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const wav = (seconds, level = 0.3) => Buffer.from(encodeWav(new Float32Array(Math.round(seconds * RATE)).fill(level)));

test('WAV 打包再解开，样本对得上；不是 16k 单声道的不收', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1]);
  const back = wavSamples(Buffer.from(encodeWav(samples)));
  assert.equal(back.length, 4);
  assert.ok(Math.abs(back[1] - 0.5) < 0.001);
  assert.ok(Math.abs(back[2] + 0.5) < 0.001);
  assert.equal(wavSamples(Buffer.from('不是音频不是音频不是音频不是音频不是音频不是音频不是音频')), null);
  const stereo = Buffer.from(encodeWav(samples));
  stereo.writeUInt16LE(2, 22);
  assert.equal(wavSamples(stereo), null);
  const rate = Buffer.from(encodeWav(samples));
  rate.writeUInt32LE(48_000, 24);
  assert.equal(wavSamples(rate), null);
});

test('降采样：48k 变 16k，长度对、数值不变形', () => {
  const out = downsample(new Float32Array(4800).fill(0.25), 48_000);
  assert.equal(out.length, 1600);
  assert.ok(out.every((x) => Math.abs(x - 0.25) < 1e-6));
});

test('切句：静音不上传；说完 0.9 秒静音切开；开口前的声音留一点', () => {
  const got = [];
  const seg = new Segmenter((s) => got.push(s));
  const feed = (seconds, level) => seg.push(new Float32Array(Math.round(seconds * RATE)).fill(level));
  feed(2, 0);
  assert.equal(got.length, 0);
  feed(1, 0.2);
  feed(0.5, 0);
  assert.equal(got.length, 0, '还没静音够');
  feed(0.5, 0);
  assert.equal(got.length, 1);
  assert.ok(got[0].length > RATE * 1.8 && got[0].length < RATE * 2.3, `长度 ${got[0].length}`);
  assert.equal(got[0][0], 0, '开头是开口前留的静音');
});

test('切句：一下咳嗽不算一句；一直说到 25 秒也切开', () => {
  const got = [];
  const seg = new Segmenter((s) => got.push(s));
  seg.push(new Float32Array(RATE * 0.1).fill(0.3));
  seg.push(new Float32Array(RATE).fill(0));
  assert.equal(got.length, 0);
  seg.push(new Float32Array(RATE * 26).fill(0.3));
  assert.equal(got.length, 1);
  assert.ok(got[0].length <= RATE * 25.1);
});

test('令牌：名单里的人才有；换一天旧令牌作废、文字清掉', async () => {
  const inbox = new MicInbox({ transcribe: async () => '我是贤者' });
  inbox.listen(['a']);
  assert.equal(inbox.tokenFor('b'), null);
  const first = inbox.tokenFor('a');
  assert.ok(micValid(first));
  assert.deepEqual(await micIngest(first, wav(1)), { status: 200, text: '我是贤者' });
  assert.deepEqual(inbox.transcript('a'), ['我是贤者']);
  inbox.listen(['a']);
  assert.ok(!micValid(first));
  assert.equal((await micIngest(first, wav(1))).status, 410);
  assert.deepEqual(inbox.transcript('a'), []);
  inbox.stop();
  assert.equal((await micIngest('瞎编的', wav(1))).status, 410);
});

test('上传：不是音频、太长都拒绝；太短的不转写；同时只转一句', async () => {
  let calls = 0;
  let release;
  const slow = new Promise((ok) => { release = ok; });
  const inbox = new MicInbox({ transcribe: async () => { calls += 1; await slow; return '好'; } });
  inbox.listen(['a']);
  const t = inbox.tokenFor('a');
  assert.equal((await micIngest(t, Buffer.from('x'))).status, 400);
  assert.equal((await micIngest(t, wav(31))).status, 400);
  assert.deepEqual(await micIngest(t, wav(0.1)), { status: 200, text: '' });
  assert.equal(calls, 0);
  const one = micIngest(t, wav(1));
  assert.equal((await micIngest(t, wav(1))).status, 429);
  release();
  assert.equal((await one).status, 200);
  inbox.stop();
});

test('转写失败不算他说了话；转写途中到了黄昏，这句不要', async () => {
  const bad = new MicInbox({ transcribe: async () => { throw new Error('超时'); } });
  bad.listen(['a']);
  assert.equal((await micIngest(bad.tokenFor('a'), wav(1))).status, 502);
  assert.deepEqual(bad.transcript('a'), []);
  bad.stop();

  let release;
  const late = new MicInbox({ transcribe: () => new Promise((ok) => { release = ok; }) });
  late.listen(['a']);
  const pending = micIngest(late.tokenFor('a'), wav(1));
  await sleep(1);
  late.listen([]);
  release('我是贤者');
  assert.equal((await pending).status, 410);
  assert.deepEqual(late.transcript('a'), []);
});

function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'square'; }, async setAsleep() {}, async openRoom() { return `room${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };

async function dayRoom() {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script: 'snv' } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) room.users.set(id, { id, name, avatar: null });
  room.micFor = () => new MicInbox({ transcribe: async () => '我真的是神谕者' });
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  await room.act('u1', 'assignRole', { player: 'u1', role: 'cerenovus' });
  await room.act('u1', 'assignRole', { player: 'u2', role: 'sage' });
  await room.act('u1', 'assignRole', { player: 'bot-1', role: 'nodashii' });
  await room.act('u1', 'start');
  const g = room.game;
  for (let k = 0; k < 400 && g.phase === 'night'; k++) {
    if (!room.resolving || room.revivePending) {
      for (const pr of g.nightPrompts()) {
        if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
        await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count), role: pr.pickRole ? pr.roleOptions[0] : null }).catch(() => {});
      }
    }
    await sleep(3);
  }
  g.madness = { u2: { role: 'oracle', night: g.night, claimed: false, by: 'u1' } };
  room.hearToday();
  return room;
}

test('房间：令牌只发给被洗脑的本人，不用房主打开', async () => {
  const room = await dayRoom();
  const token = room.viewFor('u2').self.mic;
  assert.ok(token);
  assert.equal(room.viewFor('u1').self.mic, null);
  assert.ok(!JSON.stringify(room.viewFor('u1')).includes(token), '别人的视图里没有这个令牌');
  await room.teardown();
  assert.equal(room.mic, null);
  assert.ok(!micValid(token), '结束后令牌作废');
});

test('房间：收音的话交给模型判定，判过就是努力证明了；黄昏后令牌作废', async () => {
  const room = await dayRoom();
  const g = room.game;
  const token = room.viewFor('u2').self.mic;
  await micIngest(token, wav(1));
  const seen = [];
  room.madnessJudge = async (claim, lines) => { seen.push({ claim, lines }); return { verdict: 'true', reason: '他说了', by: '假的' }; };
  g.st.madnessPenalty = () => assert.fail('听到了就不该走说书人的判断');
  await room.judgeMadness();
  assert.equal(seen[0].claim, '我是神谕者');
  assert.deepEqual(seen[0].lines, ['我真的是神谕者']);
  assert.ok(g.get('u2').alive);
  await room.dusk();
  assert.ok(!micValid(token));
  await room.teardown();
});

test('房间：有收音时声明不算数，不开收音更容易被罚；开了就看转写；机器人声明了照旧算过', async () => {
  const room = await dayRoom();
  const g = room.game;
  room.online.add('u2');
  await room.act('u2', 'declare', { role: 'oracle' });
  assert.equal(g.madness.u2.claimed, true);
  const seen = [];
  g.st.madnessPenalty = (p, how) => { seen.push(how); return false; };
  await room.judgeMadness();
  assert.deepEqual(seen, [{ noMic: true, claimed: true }], '只声明、没开收音：走骰子');
  assert.equal(room.viewFor('u2').self.micOn, false);

  await micIngest(room.viewFor('u2').self.mic, wav(1));
  assert.equal(room.viewFor('u2').self.micOn, true);
  room.madnessJudge = async () => ({ verdict: 'false', reason: '没提', by: '假的' });
  seen.length = 0;
  await room.judgeMadness();
  assert.deepEqual(seen, [{ heardFalse: true }], '开了收音，由模型判');

  g.madness = { 'bot-2': { role: 'oracle', night: g.night, claimed: true, by: 'u1' } };
  seen.length = 0;
  await room.judgeMadness();
  assert.deepEqual(seen, [], '机器人开不了收音：声明了就算尽力');
  await room.teardown();
});

test('破功的说法：本机先筛，没说到就不问大模型', () => {
  assert.equal(looksBroken('我是被逼的'), true);
  assert.equal(looksBroken('其实 我 是 贤者', '贤者'), true);
  assert.equal(looksBroken('我今晚验了三号，他是好人', '贤者'), false);
});

async function breakRoom(verdict = 'true') {
  const room = await dayRoom();
  room.moonchildWaitMs = 5; // 被处决的真人有遗言时间：测试里不等
  const asked = [];
  room.breakJudge = async (claim, real, lines) => { asked.push({ claim, real, lines }); return { verdict, reason: '测试', by: '假的' }; };
  return { room, g: room.game, asked };
}

test('破坏疯狂：第一次只警告本人；第二次当场处决、直接入夜；模型说没破功就没事', async () => {
  const { room, g, asked } = await breakRoom();
  g.st.madnessPenalty = () => true;
  await room.hearBreak('u2', '随便聊聊今天的情况');
  assert.equal(asked.length, 0, '没命中不问模型');
  await room.hearBreak('u2', '我是被逼的');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].claim, '神谕者');
  assert.equal(asked[0].real, '贤者');
  assert.ok(g.get('u2').alive, '第一次只警告');
  assert.ok(room.viewFor('u2').self.inbox.at(-1).text.includes('破坏了疯狂'), '只告诉本人');
  assert.ok(!room.log.some((l) => l.text.includes('破坏')), '公开记录里没有');
  await room.hearBreak('u2', '真的是被逼的');
  assert.ok(!g.get('u2').alive, '第二次处决');
  assert.ok(g.executedToday);
  await until(() => g.phase === 'night');
  assert.equal(g.phase, 'night', '今天结束');
  await room.teardown();

  const safe = await breakRoom('false');
  safe.g.madness.u2.warned = true;
  await safe.room.hearBreak('u2', '他说他被洗脑了');
  assert.ok(safe.g.get('u2').alive);
  await safe.room.teardown();
});

test('破坏疯狂：投票中或今天已有处决就留到入夜；一天最多问 6 次；拿不准不算', async () => {
  const { room, g, asked } = await breakRoom();
  g.st.madnessPenalty = () => true;
  g.madness.u2.warned = true;
  room.pendingNom = { nominator: 'u1', nominee: 'bot-1' };
  await room.hearBreak('u2', '我是被逼的');
  assert.ok(g.get('u2').alive);
  assert.deepEqual(g.madNight.map((x) => x.id), ['u2']);
  room.pendingNom = null;
  await room.teardown();

  const many = await breakRoom('unknown');
  for (let i = 0; i < 10; i++) await many.room.hearBreak('u2', '我是被逼的');
  assert.equal(many.asked.length, 6);
  assert.ok(!many.g.madness.u2.warned, '拿不准不算破功');
  await many.room.teardown();
  assert.equal(asked.length, 1);
});

test('收音页传上来的话会走到破功判定', async () => {
  const room = await dayRoom();
  const heard = [];
  room.hearBreak = async (id, text) => { heard.push([id, text]); };
  room.hearToday();
  await micIngest(room.viewFor('u2').self.mic, wav(1));
  assert.deepEqual(heard, [['u2', '我真的是神谕者']]);
  await room.teardown();
});

test('房间：真人说书、或者服务器没有转写服务时没有收音入口', async () => {
  const room = await dayRoom();
  await room.teardown();
  room.settings.mode = 'human';
  room.hearToday();
  assert.equal(room.mic, null, '真人说书');
  room.settings.mode = 'auto';
  room.micFor = null;
  room.hearToday();
  assert.equal(room.viewFor('u2').self.mic, null, '没有转写服务');
});
