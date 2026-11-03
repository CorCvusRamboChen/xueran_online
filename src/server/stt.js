// 语音转文字：优先用本机模型（SenseVoice，Mac mini 上跑，不花钱），没装就用 Azure。
// 模型推理要占满几个核几百毫秒，放在 worker 线程里，不能卡住游戏服务器；模型占内存，闲下来就放掉。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { azureTranscribe, hearingReady } from './hearing.js';

const RATE = 16_000;
const IDLE_MS = 10 * 60_000;
const TIMEOUT_MS = 20_000;

const modelDir = () => process.env.SENSEVOICE_DIR ?? path.join(os.homedir(), 'apps', 'models', 'sensevoice');
const has = (name) => fs.existsSync(path.join(modelDir(), name));

export const localReady = () => has('model.int8.onnx') && has('tokens.txt');
export const sttReady = () => localReady() || hearingReady();

/** 取出 16kHz 单声道 16 位 WAV 的采样；别的格式返回 null（收音页只发这一种，其他的都是不认识的请求）。 */
export function wavSamples(buf) {
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let at = 12;
  let fmt = false;
  while (at + 8 <= buf.length) {
    const id = buf.toString('latin1', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') {
      if (body + 16 > buf.length) return null;
      fmt = buf.readUInt16LE(body) === 1 && buf.readUInt16LE(body + 2) === 1 && buf.readUInt32LE(body + 4) === RATE && buf.readUInt16LE(body + 14) === 16;
      if (!fmt) return null;
    }
    if (id === 'data') {
      if (!fmt) return null;
      const n = Math.floor(Math.min(size, buf.length - body) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(body + i * 2) / 32768;
      return out;
    }
    at = body + size + (size % 2);
  }
  return null;
}

let worker = null;
let idle = null;
let seq = 0;
const waiting = new Map();

function failAll(e) {
  for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(e); }
  waiting.clear();
}

function dropWorker() {
  clearTimeout(idle);
  worker?.terminate().catch(() => {});
  worker = null;
}

function getWorker() {
  if (worker) return worker;
  const w = new Worker(new URL('./stt-worker.js', import.meta.url), { workerData: { dir: modelDir() } });
  w.on('message', ({ id, text, error }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    clearTimeout(job.timer);
    if (error) job.reject(new Error(error)); else job.resolve(text);
  });
  const lost = (e) => { if (worker === w) { worker = null; failAll(e); } };
  w.on('error', lost);
  w.on('exit', () => lost(new Error('转写线程退出了')));
  worker = w;
  return w;
}

function localTranscribe(samples) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('转写超时')); }, TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    getWorker().postMessage({ id, samples }, [samples.buffer]);
    clearTimeout(idle);
    idle = setTimeout(dropWorker, IDLE_MS);
    idle.unref?.();
  });
}

/** 一段 WAV 转成文字。听不清返回空串，出错就抛（调用方当作没听到）。 */
export function transcribeWav(wav) {
  if (localReady()) return localTranscribe(wavSamples(wav));
  return azureTranscribe(wav, { contentType: `audio/wav; codecs=audio/pcm; samplerate=${RATE}` });
}
