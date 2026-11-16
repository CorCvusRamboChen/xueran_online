// 把固定的配音台词（src/server/ttsFixed.js）用 Azure 一次性合成成 mp3，放进 assets/tts/，随代码提交和部署。
// 服务器先找这里，找到就不再调 Azure。用本机 .env 里的 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION 和声音设置
// （AZURE_TTS_VOICE / STYLE / RATE / PITCH）；线上的声音设置要和这里一样，文件名（哈希）才对得上。
//
//   node scripts/tts-bake.mjs           合成还没有的（已经有的不重复合成、不花钱）
//   node scripts/tts-bake.mjs --dry     只列出要合成哪些、多少字，不调 Azure
//   node scripts/tts-bake.mjs --prune   顺便删掉不再用到的旧文件（改了台词或换了声音以后）
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const { ttsEnabled, ttsVoice, hashOf, azureSynth, BAKED } = await import('../src/server/tts.js');
const { fixedLines } = await import('../src/server/ttsFixed.js');

const dry = process.argv.includes('--dry');
const prune = process.argv.includes('--prune');
const lines = fixedLines();
const want = new Map(lines.map((t) => [hashOf(t), t]));
fs.mkdirSync(BAKED, { recursive: true });
const have = new Set(fs.readdirSync(BAKED).filter((n) => n.endsWith('.mp3')).map((n) => n.slice(0, -4)));
const todo = [...want].filter(([id]) => !have.has(id));

console.log(`声音：${ttsVoice.voice} · ${ttsVoice.style || '无语气'} · 语速 ${ttsVoice.rate} · 音高 ${ttsVoice.pitch}`);
console.log(`固定台词 ${lines.length} 句，已经有 ${lines.length - todo.length} 句，要合成 ${todo.length} 句（${todo.reduce((n, [, t]) => n + t.length, 0)} 字）`);
if (dry) { for (const [, t] of todo) console.log(`  ${t}`); process.exit(0); }
if (todo.length && !ttsEnabled) { console.error('没配 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION，合成不了'); process.exit(1); }

let done = 0;
for (const [id, text] of todo) {
  const cached = path.resolve('data/tts', `${id}.mp3`); // 本机以前现合成过的：直接拷过来，不再花钱
  if (fs.existsSync(cached)) { fs.copyFileSync(cached, path.join(BAKED, `${id}.mp3`)); console.log(`  [${++done}/${todo.length}] （本机已有）${text}`); continue; }
  for (let attempt = 1; ; attempt++) {
    try {
      fs.writeFileSync(path.join(BAKED, `${id}.mp3`), await azureSynth(text));
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`  重试（${e.message}）`);
      await new Promise((ok) => setTimeout(ok, 2000 * attempt));
    }
  }
  console.log(`  [${++done}/${todo.length}] ${text}`);
}

if (prune) {
  for (const id of have) if (!want.has(id)) { fs.rmSync(path.join(BAKED, `${id}.mp3`)); console.log(`  删掉旧的 ${id}.mp3`); }
}
// 清单：哪个文件是哪句话、用的什么声音（服务器启动时据此数一数有几句对得上）
const manifest = { note: '由 scripts/tts-bake.mjs 生成，不要手改', ...ttsVoice, lines: Object.fromEntries([...want].sort(([, a], [, b]) => (a < b ? -1 : 1))) };
fs.writeFileSync(path.join(BAKED, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`完成：assets/tts/ 里 ${want.size} 句`);
