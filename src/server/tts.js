// AI 房主的配音：Azure 语音服务把旁白合成成 mp3，所有人听到同一个声音。
// 只合成服务器自己说过的旁白（按内容的哈希登记），外人不能拿这个接口合成任意文字。
// 合成过的存在 data/tts/，同一句话只花一次钱。没配 AZURE_SPEECH_KEY 时返回 null，客户端退回系统自带语音。
// 不带玩家名字的固定台词（ttsFixed.js）预先合成好放在 assets/tts/（scripts/tts-bake.mjs，随代码部署），先找那里，不用调 Azure。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION;
const VOICE = process.env.AZURE_TTS_VOICE || 'zh-CN-YunfengNeural';
const STYLE = process.env.AZURE_TTS_STYLE ?? 'depressed';  // 云枫可选：serious、depressed、sad、fearful、angry、cheerful、disgruntled；留空 = 不加语气
const RATE = process.env.AZURE_TTS_RATE || '-8%';
const PITCH = process.env.AZURE_TTS_PITCH || '-4%';
// 英文玩家听英文旁白（2026-11-20 英文版）：每个人按自己的界面语言听，同一局里可以中英混着
const EN = {
  voice: process.env.AZURE_TTS_VOICE_EN || 'en-GB-RyanNeural',
  style: process.env.AZURE_TTS_STYLE_EN ?? '',
  rate: process.env.AZURE_TTS_RATE_EN || '-6%',
  pitch: process.env.AZURE_TTS_PITCH_EN || '-4%',
};
const DIR = path.resolve('data/tts');
export const BAKED = path.resolve('assets/tts'); // 预先合成的固定台词（文件名和 data/tts 一样是哈希，换了声音就对不上，自动退回现合成）

export const ttsEnabled = !!(KEY && REGION);
const known = new Map();     // 哈希 → 文字
const pending = new Map();   // 哈希 → 正在合成的 Promise

const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const clean = (s) => s.replace(/\*\*/g, '');

function ssml(text, lang = 'zh') {
  const v = lang === 'en' ? EN : { voice: VOICE, style: STYLE, rate: RATE, pitch: PITCH };
  const body = `<prosody rate="${v.rate}" pitch="${v.pitch}">${esc(clean(text))}</prosody>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang === 'en' ? 'en-GB' : 'zh-CN'}">`
    + `<voice name="${v.voice}">${v.style ? `<mstts:express-as style="${v.style}">${body}</mstts:express-as>` : body}</voice></speak>`;
}

export const ttsVoice = { voice: VOICE, style: STYLE, rate: RATE, pitch: PITCH };
export const hashOf = (text, lang = 'zh') => createHash('sha1')
  .update(lang === 'en' ? `${EN.voice}|${EN.style}|${EN.rate}|${EN.pitch}|${text}` : `${VOICE}|${STYLE}|${RATE}|${PITCH}|${text}`).digest('hex').slice(0, 20);

/** 调 Azure 把一句话合成成 mp3（Buffer）。预合成脚本也用这个。 */
export async function azureSynth(text, lang = 'zh') {
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'botc-activity',
    },
    body: ssml(text, lang),
  });
  if (!r.ok) throw new Error(`Azure 语音合成失败：${r.status} ${await r.text().catch(() => '')}`.trim());
  return Buffer.from(await r.arrayBuffer());
}

async function synthesize(id) {
  try { return await readFile(path.join(BAKED, `${id}.mp3`)); } catch { /* 不是预合成的固定台词 */ }
  const file = path.join(DIR, `${id}.mp3`);
  try { return await readFile(file); } catch { /* 还没合成过 */ }
  const k = known.get(id);
  if (!k) return null;
  const buf = await azureSynth(k.text, k.lang);
  await mkdir(DIR, { recursive: true });
  await writeFile(file, buf);
  return buf;
}

function ensure(id) {
  if (!pending.has(id)) {
    pending.set(id, synthesize(id).finally(() => setTimeout(() => pending.delete(id), 60_000)));
  }
  return pending.get(id);
}

/** 登记一句旁白，返回它的音频地址（并在后台先合成好）；没配语音服务时返回 null。 */
export function ttsUrl(text, lang = 'zh') {
  if (!ttsEnabled || !text) return null;
  const id = hashOf(text, lang);
  known.set(id, { text, lang });
  ensure(id).catch((e) => console.warn('[tts]', e.message));
  return `/api/tts/${id}.mp3`;
}

/** GET /api/tts/:id.mp3 */
export async function ttsHandler(req, res) {
  const id = String(req.params.id ?? '').replace(/\.mp3$/, '');
  if (!/^[0-9a-f]{20}$/.test(id)) return res.status(404).end();
  try {
    const buf = known.has(id) ? await ensure(id)
      : await readFile(path.join(BAKED, `${id}.mp3`)).catch(() => readFile(path.join(DIR, `${id}.mp3`))).catch(() => null);
    if (!buf) return res.status(404).end();
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).send(buf);
  } catch (e) {
    console.warn('[tts]', e.message);
    res.status(502).end();
  }
}

/** 预合成的固定台词里，有几句和现在的声音设置对得上（启动时打一行日志，部署后看一眼就知道有没有用上）。 */
export function bakedCount() {
  let names = [];
  try { names = fs.readdirSync(BAKED).filter((n) => n.endsWith('.mp3')); } catch { return { ready: 0, total: 0 }; }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(BAKED, 'manifest.json'), 'utf8')); } catch { /* 没有清单 */ }
  const ids = Object.keys(manifest?.lines ?? {});
  const ready = ids.filter((id) => id === hashOf(manifest.lines[id]) && names.includes(`${id}.mp3`)).length;
  return { ready, total: ids.length };
}
