// 意见箱（2026-11-20 用户）：谁都能提、都能看；只有管理员（BOTC_ADMINS）能接管、解决、搁置。大厅右键头像把房主交给指定的人。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useFeedbackFiles, addFeedback, setFeedback, listFeedback, imagePath, feedbackAct } from '../src/server/feedback.js';
import { Room } from '../src/server/room.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-fb-'));
useFeedbackFiles(path.join(dir, 'feedback.json'), path.join(dir, 'img'));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('意见箱：提一条（带截图），列表里看得到；内容、类型、截图格式不对不收', () => {
  const a = addFeedback({ id: 'u1', name: '阿一' }, { kind: 'bug', text: '投票时卡住了', images: [PNG] });
  assert.equal(a.status, 'open');
  assert.equal(a.images.length, 1);
  assert.ok(fs.existsSync(imagePath(a.images[0])), '截图存下来了');
  assert.equal(listFeedback()[0].id, a.id);
  assert.throws(() => addFeedback({ id: 'u1', name: '阿一' }, { kind: 'x', text: '1' }), /选一下/);
  assert.throws(() => addFeedback({ id: 'u1', name: '阿一' }, { kind: 'bug', text: '   ' }), /写点什么/);
  assert.throws(() => addFeedback({ id: 'u1', name: '阿一' }, { kind: 'bug', text: 'x', images: ['data:text/html;base64,PGI+'] }), /截图只收/);
  assert.equal(imagePath('../../etc/passwd'), null, '文件名不合法');
});

test('意见箱：只有管理员能接管、解决、搁置；解决时带回复和版本号；提太快会被拦', () => {
  const it = addFeedback({ id: 'u2', name: '阿二' }, { kind: 'feature', text: '想要全屏快捷键' });
  assert.throws(() => setFeedback({ id: 'u2', name: '阿二' }, { id: it.id, status: 'done' }), /只有管理员/);
  process.env.BOTC_ADMINS = 'boss, other';
  setFeedback({ id: 'boss', name: '老板' }, { id: it.id, status: 'taken' });
  const done = setFeedback({ id: 'boss', name: '老板' }, { id: it.id, status: 'done', note: '已上线：F11 全屏', version: 'v1.2' });
  assert.equal(done.status, 'done');
  assert.equal(done.version, 'v1.2');
  assert.equal(done.handler.name, '老板');
  assert.equal(feedbackAct('boss', { name: '老板' }, { op: 'list' }).admin, true);
  assert.equal(feedbackAct('u9', { name: '路人' }, { op: 'list' }).admin, false);
  for (let k = 0; k < 5; k++) addFeedback({ id: 'spam', name: '刷屏' }, { kind: 'bug', text: `第 ${k} 条` });
  assert.throws(() => addFeedback({ id: 'spam', name: '刷屏' }, { kind: 'bug', text: '第 6 条' }), /太快/);
  delete process.env.BOTC_ADMINS;
});

function mockVoice() {
  let n = 0;
  return { async findSquare() { return 'sq'; }, async setAsleep() {}, async openRoom() { return `r${++n}`; }, async closeRoom() {}, async addToRoom() {}, async removeFromRoom() {}, async moveAll() {}, async setMuted() {} };
}

test('大厅：房主右键别人的头像把房主交给他；机器人、不在线的人交不过去；意见箱走房间操作', async () => {
  const room = new Room({ key: 'k', guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { mode: 'auto', script: 'tb' } });
  for (const [id, name] of [['u1', '阿一'], ['u2', '阿二'], ['u3', '阿三']]) { room.users.set(id, { id, name, avatar: null }); }
  room.online.add('u1'); room.online.add('u2');
  await room.act('u1', 'join'); await room.act('u2', 'join'); await room.act('u3', 'join');
  await room.act('u1', 'addBots', { count: 1 });
  const bot = room.lobby.find((p) => p.fake)?.id;
  try {
    await assert.rejects(room.act('u2', 'giveHost', { target: 'u1' }), /你不是房主/);
    await assert.rejects(room.act('u1', 'giveHost', { target: bot }), /真人/);
    await assert.rejects(room.act('u1', 'giveHost', { target: 'u3' }), /不在线/);
    await room.act('u1', 'giveHost', { target: 'u2' });
    assert.equal(room.hostId, 'u2');
    const r = await room.act('u3', 'feedback', { op: 'add', kind: 'opinion', text: '大厅按钮太多了' });
    assert.ok(r.items.some((x) => x.text === '大厅按钮太多了' && x.by.name === '阿三'));
  } finally { await room.teardown?.(); }
});
