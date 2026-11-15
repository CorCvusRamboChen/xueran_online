// 录音存档（2026-11-16 用户：各种录音要保存）：src/server/recorder.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveRecording, useRecordingsDir, recordingsDir } from '../src/server/recorder.js';
import { MicInbox, micIngest } from '../src/server/mic.js';
import { encodeWav } from '../client/src/micAudio.js';

const wav = (secs) => Buffer.from(encodeWav(new Float32Array(Math.round(secs * 16000)).fill(0.3)));

test('存一句：音频文件 + 转写清单一行；没开目录就不写', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-rec-'));
  useRecordingsDir(dir);
  const row = await saveRecording({ guildId: 'G1', gameId: 'game1', id: 'u1', name: '阿一', day: 2, phase: 'day', source: 'mic', audio: wav(1), ext: 'wav', text: '我是贤者' });
  assert.equal(row.text, '我是贤者');
  const base = recordingsDir('G1', 'game1');
  assert.ok(fs.existsSync(path.join(base, row.file)));
  const lines = fs.readFileSync(path.join(base, 'transcript.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.id, l.day, l.source, l.text]), [['u1', 2, 'mic', '我是贤者']]);
  useRecordingsDir(null);
  assert.equal(await saveRecording({ guildId: 'G1', gameId: 'game1', id: 'u1', audio: wav(1), ext: 'wav' }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('收音箱：在收的时候每一句（听不清的也算）都交给 onAudio；暂停时不交', async () => {
  const got = [];
  const inbox = new MicInbox({ transcribe: async () => '' });
  inbox.onAudio = (id, audio, text) => got.push([id, audio.length > 0, text]);
  inbox.listen(['a']);
  const t = inbox.tokenFor('a');
  await micIngest(t, wav(1));
  inbox.listen([]);
  await micIngest(t, wav(1));
  assert.deepEqual(got, [['a', true, '']]);
  inbox.stop();
});
