// 疯狂的默许（2026-11-20 用户转述朋友：检测太弱，主要是默许那块）：别人说他被洗脑 / 跳了他的角色，他不否认就是破坏疯狂。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mentions, claimsRole, denies, triggerOf } from '../src/server/tacit.js';
import { Room } from '../src/server/room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('默许：谁提到了他、谁跳了他的角色、他有没有否认', () => {
  const p = { id: 'u2', name: '阿二', seat: 3 };
  assert.ok(mentions('我觉得3号被洗脑了', p));
  assert.ok(mentions('三号肯定疯了', p));
  assert.ok(mentions('阿二在演', p));
  assert.ok(!mentions('13号被洗脑了', p), '13 号不是 3 号');
  assert.equal(triggerOf('3号被洗脑了吧', { id: 'x' }, p, '占卜师'), 'accuse');
  assert.equal(triggerOf('我才是占卜师', { id: 'x' }, p, '占卜师'), 'counter');
  assert.equal(triggerOf('我是占卜师', { id: 'u2' }, p, '占卜师'), null, '他自己说的不算');
  assert.equal(triggerOf('3号今天说话很多', { id: 'x' }, p, '占卜师'), null);
  assert.ok(claimsRole('真占卜师是我', '占卜师'));
  assert.ok(denies('我没有被洗脑', '占卜师'));
  assert.ok(denies('我就是占卜师，他是假的', '占卜师'));
  assert.ok(!denies('嗯……你们说得对', '占卜师'));
});

function mockVoice() {
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return 'r'; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

async function madRoom() {
  const room = new Room({ key: 't', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { mode: 'auto', script: 'snv', shuffle: false, chooseSeconds: 60, pauseMs: 5, tacitMs: 30 } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二']]) { room.users.set(id, { id, name, avatar: null }); room.online.add(id); }
  await room.act('u1', 'join'); await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 5 });
  await room.act('u1', 'start');
  const g = room.game;
  for (const k of room.timers ?? []) clearTimeout(k);
  g.phase = 'day'; g.day = 1;
  g.madnessDue = () => [{ id: 'u2', role: 'savant', claimed: false }];
  g.madnessPenalty = () => true;
  const lines = {};
  room.heardLines = (id) => lines[id] ?? [];
  room.listeningTo = () => true;
  const punished = [];
  room.madPunish = (id, why) => { punished.push([id, why]); };
  room.autoDusk = async () => {};
  return { room, g, lines, punished };
}

test('默许：别人说他被洗脑，提醒他一次；到点没否认就按破坏疯狂处理', async () => {
  const { room, g, punished } = await madRoom();
  try {
    const name = g.name('u2');
    room.tacitHear('u1', `${name}被洗脑了吧`);
    assert.match(room.viewFor('u2').self.inbox.at(-1).text, /提醒（只提醒这一次）.*说你被洗脑了/);
    room.tacitHear('u1', `${name}真的疯了`);
    assert.equal(room.viewFor('u2').self.inbox.filter((m) => /只提醒这一次/.test(m.text)).length, 1, '只提醒一次');
    await sleep(80);
    assert.equal(punished.length, 1);
    assert.match(punished[0][1], /没有站出来否认（默许）/);
  } finally { await room.teardown(); }
});

test('默许：他站出来否认 / 和跳他角色的人争，就不算', async () => {
  const { room, g, lines, punished } = await madRoom();
  try {
    room.tacitHear('u1', `${g.name('u2')}被洗脑了`);
    room.tacitHear('u2', '我没有被洗脑，我就是博学者');
    await sleep(80);
    assert.equal(punished.length, 0, '当场否认');
    room.tacit = {};
    room.tacitHear('u1', '我才是博学者');
    lines.u2 = ['他是假的，我才是博学者']; // 收音页那边转写到的
    await sleep(80);
    assert.equal(punished.length, 0, '和跳他角色的人争了');
  } finally { await room.teardown(); }
});

test('默许：真人说书时不直接处决，进说书人的「待你决定」', async () => {
  const { room, g } = await madRoom();
  try {
    room.settings.mode = 'human'; room.hostId = 'st';
    delete room.madPunish; // 用真的：真人说书时只提议
    room.tacitHear('u1', '我才是博学者');
    await sleep(80);
    assert.ok((room.asks ?? []).some((a) => a.kind === 'mad' && a.who === 'u2' && /默许/.test(a.why)));
    assert.ok(g.get('u2').alive);
  } finally { await room.teardown(); }
});
