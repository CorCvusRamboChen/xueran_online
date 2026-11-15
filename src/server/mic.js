// 收音页（语音判定疯狂的另一条路）：被洗脑的玩家自己在普通浏览器里打开麦克风，一句一句传上来转成文字。
// 不靠机器人，所以走到哪个语音频道都听得到，旺财的服务器和 KOOK 也能用；别人看不出谁开了。
// 畸形秀演员也给（2026-11-12 用户要的，以前不给）：说服别人自己是外来者会被当场判。
// 存档：每一句的音频和转写都交给 onAudio（房间层存进 data/recordings，见 recorder.js；2026-11-16 用户要保存录音）。凭令牌上传，令牌只发给本人。
// 令牌整局不变（2026-11-16 用户：开了收音第二天还弹提示）：晚上收工只是暂停，第二天还在名单里就接着收，收音页不用重开；
// 这局结束（stop）才作废。收音页每 15 秒报一次「还开着」（ping），服务器据此知道谁开着收音，开着就不再弹提示。
import crypto from 'node:crypto';
import { transcribeWav, wavSamples } from './stt.js';

const MAX_LINES = 60;
const ALIVE_MS = 45_000; // 收音页多久没报到就算关了
const MAX_SECONDS = 30 * 60; // 一个人一天最多转写这么久，防止有人拿令牌刷接口
const MIN_SEGMENT = 0.2;
const MAX_SEGMENT = 30;
const RATE = 16_000;

const tokens = new Map(); // 令牌 → { inbox, id }

export class MicInbox {
  constructor({ transcribe = transcribeWav, keep = false } = {}) {
    this.transcribe = transcribe;
    this.keep = keep;
    this.ids = new Map();   // 今天在收的人 → 令牌
    this.known = new Map(); // 这局发过令牌的人 → 令牌（整局不变）
    this.lines = new Map();
    this.seconds = new Map();
    this.seen = new Map();  // 收音页最后一次报到的时间
    this.busy = new Set();
    this.gen = 0;           // 第几次 listen：转写到一半换了一天，这句不算
  }

  /** 今天谁可以收音。昨天的文字清掉；不在名单里的人暂停（令牌还在，收音页不用关）；传空名单就是收工。 */
  listen(ids) {
    this.gen += 1;
    this.ids = new Map();
    this.lines = new Map();
    this.seconds = new Map();
    for (const id of ids) {
      let token = this.known.get(id);
      if (!token) {
        token = crypto.randomBytes(18).toString('base64url');
        this.known.set(id, token);
        tokens.set(token, { inbox: this, id });
      }
      this.ids.set(id, token);
    }
  }

  tokenFor(id) { return this.ids.get(id) ?? null; }
  transcript(id) { return this.lines.get(id) ?? []; }
  /** 这局结束：令牌全部作废。 */
  stop() {
    for (const token of this.known.values()) tokens.delete(token);
    this.known = new Map();
    this.listen([]);
    this.seen = new Map();
  }
  /** 收音页报到：还开着。从没开变成开着时通知房间（不再弹提示）。 */
  ping(id) {
    const was = this.isOn(id);
    this.seen.set(id, Date.now());
    if (!was && this.isOn(id)) this.onStatus?.(id);
  }
  /** 他现在开着收音吗：今天在名单里，并且收音页最近报到过、或者今天传上来过话。 */
  isOn(id) {
    if (!this.ids.has(id)) return false;
    return this.seconds.has(id) || Date.now() - (this.seen.get(id) ?? 0) < ALIVE_MS;
  }

  /** 收下一段 WAV。返回 { status, text? }：status 是给 HTTP 用的状态码。 */
  async ingest(id, wav) {
    const samples = wavSamples(wav);
    const secs = samples ? samples.length / RATE : 0;
    if (!samples || secs > MAX_SEGMENT) return { status: 400 };
    if (secs < MIN_SEGMENT) return { status: 200, text: '' };
    if (!this.ids.has(id)) return { status: 200, text: '' }; // 暂停中（晚上、今天不用收他）：收音页照开着，这句不收
    if (this.busy.has(id) || (this.seconds.get(id) ?? 0) + secs > MAX_SECONDS) return { status: 429 };
    this.busy.add(id);
    const gen = this.gen;
    const was = this.isOn(id);
    try {
      const text = await this.transcribe(wav);
      if (this.gen !== gen || !this.ids.has(id)) return { status: 200, text: '' }; // 转写的时候到了黄昏：这句不算
      this.seconds.set(id, (this.seconds.get(id) ?? 0) + secs);
      this.seen.set(id, Date.now());
      this.onAudio?.(id, wav, text ?? ''); // 存档（听不清的也存）
      if (!was) this.onStatus?.(id);
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

/** 收音页报到（还开着）。令牌作废了返回 false。 */
export function micPing(token) {
  const t = tokens.get(token);
  if (!t) return false;
  t.inbox.ping(t.id);
  return true;
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
  for (const t of ['demo', 'demo-mutant', 'demo-madness']) { tokens.set(t, { inbox, id: t }); inbox.ids.set(t, t); inbox.known.set(t, t); }
}
