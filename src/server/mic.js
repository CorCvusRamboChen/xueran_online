// 收音页（语音判定疯狂的另一条路）：被洗脑的玩家自己在普通浏览器里打开麦克风，一句一句传上来转成文字。
// 不靠机器人，所以走到哪个语音频道都听得到，旺财的服务器和 KOOK 也能用；别人看不出谁开了。
// 畸形秀演员也给（2026-11-12 用户要的，以前不给）：说服别人自己是外来者会被当场判。
// 隐私：音频不落盘，文字只留到当天黄昏判完。凭一次性的令牌上传，令牌只发给本人，换一天就作废。
import crypto from 'node:crypto';
import { transcribeWav, wavSamples } from './stt.js';

const MAX_LINES = 60;
const MAX_SECONDS = 30 * 60; // 一个人一天最多转写这么久，防止有人拿令牌刷接口
const MIN_SEGMENT = 0.2;
const MAX_SEGMENT = 30;
const RATE = 16_000;

const tokens = new Map(); // 令牌 → { inbox, id }

export class MicInbox {
  constructor({ transcribe = transcribeWav, keep = false } = {}) {
    this.transcribe = transcribe;
    this.keep = keep;
    this.ids = new Map(); // 玩家 → 令牌
    this.lines = new Map();
    this.seconds = new Map();
    this.busy = new Set();
  }

  /** 今天谁可以收音。旧令牌全部作废、昨天的文字清掉；传空名单就是收工。 */
  listen(ids) {
    for (const token of this.ids.values()) tokens.delete(token);
    this.ids = new Map();
    this.lines = new Map();
    this.seconds = new Map();
    for (const id of ids) {
      const token = crypto.randomBytes(18).toString('base64url');
      this.ids.set(id, token);
      tokens.set(token, { inbox: this, id });
    }
  }

  tokenFor(id) { return this.ids.get(id) ?? null; }
  transcript(id) { return this.lines.get(id) ?? []; }
  stop() { this.listen([]); }

  /** 收下一段 WAV。返回 { status, text? }：status 是给 HTTP 用的状态码。 */
  async ingest(id, wav) {
    const samples = wavSamples(wav);
    const secs = samples ? samples.length / RATE : 0;
    if (!samples || secs > MAX_SEGMENT) return { status: 400 };
    if (secs < MIN_SEGMENT) return { status: 200, text: '' };
    if (this.busy.has(id) || (this.seconds.get(id) ?? 0) + secs > MAX_SECONDS) return { status: 429 };
    this.busy.add(id);
    const token = this.ids.get(id);
    try {
      const text = await this.transcribe(wav);
      if (this.ids.get(id) !== token) return { status: 410 }; // 转写的时候到了黄昏：这句不算
      this.seconds.set(id, (this.seconds.get(id) ?? 0) + secs);
      if (!text) return { status: 200, text: '' };
      const list = this.lines.get(id) ?? [];
      if (list.length < MAX_LINES) list.push(text);
      this.lines.set(id, list);
      this.onLine?.(id, text);
      return { status: 200, text };
    } catch (e) {
      console.warn('[botc] 收音转写失败：', e.message);
      return { status: 502 };
    } finally {
      this.busy.delete(id);
    }
  }
}

/** 令牌还有效吗（收音页打开时先问一下）。 */
export const micValid = (token) => tokens.has(token);

/**
 * 这个令牌的人是哪种疯狂（收音页按这个显示疯狂的定义）：{ kind: 'madness', role } 被洗脑要证明自己是某个角色，
 * { kind: 'mutant' } 畸形秀演员；不知道就是 {}。只回给拿着令牌的本人。
 */
export function micAbout(token) {
  const t = tokens.get(token);
  return (t && t.inbox.about?.(t.id)) || {};
}

/** 上传一段音频。令牌不对或者过期了返回 410。 */
export function micIngest(token, wav) {
  const t = tokens.get(token);
  return t ? t.inbox.ingest(t.id, wav) : Promise.resolve({ status: 410 });
}

/** 本地测试用：?mic=demo 不用开局就能试麦克风和转写。 */
export function micDemo() {
  const inbox = new MicInbox();
  // demo-mutant / demo-madness：看两种疯狂的定义长什么样
  inbox.about = (id) => ({ 'demo-mutant': { kind: 'mutant' }, 'demo-madness': { kind: 'madness', role: '神谕者' } }[id] ?? {});
  for (const t of ['demo', 'demo-mutant', 'demo-madness']) { tokens.set(t, { inbox, id: t }); inbox.ids.set(t, t); }
}
