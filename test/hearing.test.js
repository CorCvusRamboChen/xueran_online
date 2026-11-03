// 语音判定疯狂：只转写目标、不留音频、失败不影响游戏；判定结果怎么用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Hearing, azureTranscribe } from '../src/server/hearing.js';
import { judgeMadness } from '../src/server/judge.js';

function fake(overrides = {}) {
  const speaking = new EventEmitter();
  const subscribed = [];
  const receiver = { speaking, subscribe: (id) => { subscribed.push(id); return { id }; } };
  const h = new Hearing({ connect: async () => receiver, toOgg: async () => Buffer.from('ogg'), transcribe: async () => '我是贤者', ...overrides });
  return { h, speaking, subscribed };
}
const flush = () => new Promise((ok) => setTimeout(ok, 5));

test('只订阅目标的音频：别人开口什么都不做', async () => {
  const { h, speaking, subscribed } = fake();
  await h.start();
  h.listen(['a']);
  speaking.emit('start', 'b');
  speaking.emit('start', 'a');
  await flush();
  assert.deepEqual(subscribed, ['a']);
  assert.deepEqual(h.transcript('a'), ['我是贤者']);
  assert.deepEqual(h.transcript('b'), []);
});

test('第二天换名单，昨天的文字清掉；结束后什么都不留', async () => {
  const { h, speaking } = fake();
  await h.start();
  h.listen(['a']);
  speaking.emit('start', 'a');
  await flush();
  h.listen(['c']);
  assert.deepEqual(h.transcript('a'), []);
  h.stop();
  speaking.emit('start', 'c');
  await flush();
  assert.deepEqual(h.transcript('c'), []);
});

test('转写失败、听不清：不算他说了话，也不抛错', async () => {
  const { h, speaking } = fake({ transcribe: async () => { throw new Error('超时'); } });
  await h.start();
  h.listen(['a']);
  speaking.emit('start', 'a');
  await flush();
  assert.deepEqual(h.transcript('a'), []);
  const q = fake({ transcribe: async () => '' });
  await q.h.start();
  q.h.listen(['a']);
  q.speaking.emit('start', 'a');
  await flush();
  assert.deepEqual(q.h.transcript('a'), []);
});

test('同一个人还在说的时候不重复订阅', async () => {
  let release;
  const slow = new Promise((ok) => { release = ok; });
  const { h, speaking, subscribed } = fake({ toOgg: () => slow.then(() => Buffer.from('ogg')) });
  await h.start();
  h.listen(['a']);
  speaking.emit('start', 'a');
  speaking.emit('start', 'a');
  await flush();
  assert.equal(subscribed.length, 1);
  release();
  await flush();
});

test('Azure 短音频：只认成功的识别结果', async () => {
  process.env.AZURE_SPEECH_REGION = 'test'; process.env.AZURE_SPEECH_KEY = 'k';
  const ok = (body) => async () => ({ ok: true, json: async () => body });
  assert.equal(await azureTranscribe(Buffer.from('x'), { fetchImpl: ok({ RecognitionStatus: 'Success', DisplayText: ' 我是贤者。 ' }) }), '我是贤者。');
  assert.equal(await azureTranscribe(Buffer.from('x'), { fetchImpl: ok({ RecognitionStatus: 'NoMatch' }) }), '');
  await assert.rejects(azureTranscribe(Buffer.from('x'), { fetchImpl: async () => ({ ok: false, status: 401 }) }), /401/);
});

test('疯狂判定：用专门的说明，转写内容和要证明的事分开给模型', async () => {
  let sent;
  const providers = [{ name: '测试', url: 'http://x', key: () => 'k', model: () => 'm' }];
  const fetchImpl = async (_, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"verdict":"true","reason":"他说了"}' } }] }) }; };
  const res = await judgeMadness('我是贤者', ['大家听我说', '我真的是贤者'], { providers, fetchImpl });
  assert.equal(res.verdict, 'true');
  assert.match(sent.messages[0].content, /疯狂/);
  assert.match(sent.messages[1].content, /今天说的话】\n大家听我说\n我真的是贤者/);
  assert.match(sent.messages[1].content, /要证明的事】\n我是贤者/);
});
