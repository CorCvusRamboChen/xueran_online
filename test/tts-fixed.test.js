// 预合成的固定配音台词（src/server/ttsFixed.js → assets/tts/）：挑出来的都是不带名字的句子；
// 仓库里的音频和现在的台词对得上（改了台词要重新跑 node scripts/tts-bake.mjs）；服务器不调 Azure 就能直接给出这些音频。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

delete process.env.AZURE_SPEECH_KEY; // 不能调 Azure
const { fixedLines } = await import('../src/server/ttsFixed.js');
const { hashOf, ttsHandler, bakedCount, BAKED } = await import('../src/server/tts.js');

test('固定台词：血染、狼人杀、阿瓦隆、暗印的不带名字的句子都在，带名字、带人数的不在', () => {
  const lines = fixedLines();
  for (const t of ['天黑请闭眼。', '守卫请睁眼。你要守护谁？', '钟声响了。所有人回到广场。', '3票，平票。处决台空了出来。',
    '去走走吧。敲开一扇门，和谁说几句悄悄话。五分钟后钟声会把你们叫回来。', '举手。指针会一个一个经过你们。',
    '圆桌只有一张，骑士却分成了两派。完成三次任务，或者让三次任务失败——谁先做到，谁就赢。', '雾从钟楼脚下漫上来。今天凑得再近，也只看得清颜色。']) {
    assert.ok(lines.includes(t), `缺了：${t}`);
  }
  for (const t of lines) {
    assert.ok(!t.includes('${') && !t.includes('占位') && !t.includes('undefined'), t);
    assert.match(t, /[。？！…」]$/, '只收会念出来的整句，不收标题');
  }
  assert.ok(!lines.some((t) => /个人走进了钟楼镇|名骑士围坐/.test(t)), '开局那句带人数，不收');
  assert.equal(new Set(lines).size, lines.length);
});

test('仓库里的预合成音频和现在的台词一一对得上（对不上就跑 node scripts/tts-bake.mjs --prune）', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(BAKED, 'manifest.json'), 'utf8'));
  const want = Object.fromEntries(fixedLines().map((t) => [hashOf(t), t]));
  assert.deepEqual(Object.values(manifest.lines).sort(), Object.values(want).sort(), '台词改了：重新跑 node scripts/tts-bake.mjs --prune');
  for (const id of Object.keys(want)) assert.ok(fs.existsSync(path.join(BAKED, `${id}.mp3`)), `缺音频：${want[id]}`);
  assert.deepEqual(bakedCount(), { ready: Object.keys(want).length, total: Object.keys(want).length });
});

test('服务器直接给出预合成的音频，不用调 Azure', async () => {
  const id = hashOf('天黑请闭眼。');
  const res = { code: 200, headers: {}, body: null, status(c) { this.code = c; return this; }, set(h) { Object.assign(this.headers, h); return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  await ttsHandler({ params: { id: `${id}.mp3` } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'audio/mpeg');
  assert.ok(res.body.length > 1000);
});
