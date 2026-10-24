// AI 房主的配音：Azure 语音服务把旁白合成成 mp3，所有人听到同一个声音。
// 只合成服务器自己说过的旁白（按内容的哈希登记），外人不能拿这个接口合成任意文字。
// 合成过的存在 data/tts/，同一句话只花一次钱。没配 AZURE_SPEECH_KEY 时返回 null，客户端退回系统自带语音。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION;
const VOICE = process.env.AZURE_TTS_VOICE || 'zh-CN-YunfengNeural';
const STYLE = process.env.AZURE_TTS_STYLE ?? 'depressed';  // 云枫可选：serious、depressed、sad、fearful、angry、cheerful、disgruntled；留空 = 不加语气
const RATE = process.env.AZURE_TTS_RATE || '-8%';
const PITCH = process.env.AZURE_TTS_PITCH || '-4%';
const DIR = path.resolve('data/tts');

export const ttsEnabled = !!(KEY && REGION);
const known = new Map();     // 哈希 → 文字
const pending = new Map();   // 哈希 → 正在合成的 Promise

const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const clean = (s) => s.replace(/\*\*/g, '');

function ssml(text) {
  const body = `<prosody rate="${RATE}" pitch="${PITCH}">${esc(clean(text))}</prosody>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">`
    + `<voice name="${VOICE}">${STYLE ? `<mstts:express-as style="${STYLE}">${body}</mstts:express-as>` : body}</voice></speak>`;
}

const hashOf = (text) => createHash('sha1').update(`${VOICE}|${STYLE}|${RATE}|${PITCH}|${text}`).digest('hex').slice(0, 20);

async function synthesize(id) {
  const file = path.join(DIR, `${id}.mp3`);
  try { return await readFile(file); } catch { /* 还没合成过 */ }
  const text = known.get(id);
  if (!text) return null;
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'botc-activity',
    },
    body: ssml(text),
  });
  if (!r.ok) throw new Error(`Azure 语音合成失败：${r.status} ${await r.text().catch(() => '')}`.trim());
  const buf = Buffer.from(await r.arrayBuffer());
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
export function ttsUrl(text) {
  if (!ttsEnabled || !text) return null;
  const id = hashOf(text);
  known.set(id, text);
  ensure(id).catch((e) => console.warn('[tts]', e.message));
  return `/api/tts/${id}.mp3`;
}

/** GET /api/tts/:id.mp3 */
export async function ttsHandler(req, res) {
  const id = String(req.params.id ?? '').replace(/\.mp3$/, '');
  if (!/^[0-9a-f]{20}$/.test(id)) return res.status(404).end();
  try {
    const buf = known.has(id) ? await ensure(id) : await readFile(path.join(DIR, `${id}.mp3`)).catch(() => null);
    if (!buf) return res.status(404).end();
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).send(buf);
  } catch (e) {
    console.warn('[tts]', e.message);
    res.status(502).end();
  }
}
