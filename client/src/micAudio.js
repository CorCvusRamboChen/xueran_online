// 收音页的音频处理（不碰浏览器接口，测试里能直接跑）：降采样、切句、打包 WAV。
export const RATE = 16_000;
const FRAME = 320; // 20 毫秒一帧
const PRE_ROLL = 15; // 开口前多留 0.3 秒，免得吃掉第一个字
const END_FRAMES = 45; // 静音 0.9 秒算说完
const MIN_VOICED = 12; // 有声音不到 0.24 秒的当成杂音
const MAX_FRAMES = 1250; // 一句最长 25 秒
const MIN_LEVEL = 0.012;

/** 浏览器的采样率（通常 48k）降到 16k：一段取平均，比直接抽点杂音少。 */
export function downsample(input, fromRate) {
  if (fromRate === RATE) return Float32Array.from(input);
  const ratio = fromRate / RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let k = a; k < b; k++) sum += input[k];
    out[i] = sum / (b - a);
  }
  return out;
}

/** 16 位单声道 WAV。 */
export function encodeWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(buf);
}

/** 按音量把连续的声音切成一句一句。没开口的时候什么都不留，所以静音不会上传。 */
export class Segmenter {
  constructor(onSegment) {
    this.onSegment = onSegment;
    this.rest = new Float32Array(0);
    this.floor = MIN_LEVEL / 3;
    this.pre = [];
    this.frames = null; // 正在说的这句
    this.voiced = 0;
    this.silent = 0;
  }

  push(samples) {
    const all = new Float32Array(this.rest.length + samples.length);
    all.set(this.rest);
    all.set(samples, this.rest.length);
    let at = 0;
    for (; at + FRAME <= all.length; at += FRAME) this.frame(all.slice(at, at + FRAME));
    this.rest = all.slice(at);
  }

  frame(f) {
    let sum = 0;
    for (const x of f) sum += x * x;
    const level = Math.sqrt(sum / f.length);
    const loud = level > Math.max(MIN_LEVEL, this.floor * 3);
    if (!loud) this.floor += (level - this.floor) * 0.02; // 跟着环境噪音走
    if (!this.frames) {
      this.pre.push(f);
      if (this.pre.length > PRE_ROLL) this.pre.shift();
      if (!loud) return;
      this.frames = this.pre;
      this.pre = [];
      this.voiced = 1;
      this.silent = 0;
      return;
    }
    this.frames.push(f);
    if (loud) { this.voiced += 1; this.silent = 0; } else this.silent += 1;
    if (this.silent >= END_FRAMES || this.frames.length >= MAX_FRAMES) this.flush();
  }

  /** 这句说完了（或者收音停了）：够长就交出去。 */
  flush() {
    const frames = this.frames;
    const voiced = this.voiced;
    this.frames = null;
    this.voiced = 0;
    this.silent = 0;
    if (!frames || voiced < MIN_VOICED) return;
    const out = new Float32Array(frames.length * FRAME);
    frames.forEach((f, i) => out.set(f, i * FRAME));
    this.onSegment(out);
  }
}
