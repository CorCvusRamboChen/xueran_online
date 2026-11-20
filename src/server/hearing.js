// 语音判定疯狂（只有梦殒春宵、AI 说书、自家机器人的 Discord 服务器，房主打开才用）。
// AI 说书人听不到语音：这里让机器人常驻广场语音频道，只转写"此刻被疯狂的人"说的话，晚上交给大模型判断他有没有努力证明。
// 为什么常驻广场：一个机器人在一个服务器里同时只能待在一个语音频道，跟着目标进房子等于告诉全场谁被洗脑了。所以房子里的悄悄话听不到。
// 别人的声音不接收（receiver 只订阅目标）。每一句的 Ogg 和转写交给 onAudio 存档（data/recordings，见 recorder.js；2026-11-16 用户要保存录音）。
// 音频：Discord 发来的是 Opus 包，套上 Ogg 外壳就是 Azure 短音频接口认的格式，不用解码。一句话按说完后 1 秒静音切开，最长 30 秒。

const SILENCE_MS = 1000;
const MAX_MS = 30_000;
const STT_TIMEOUT_MS = 15_000;
const MAX_LINES = 60; // 一个人一天最多留这么多句，够判断了

export const hearingReady = () => !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);

/** 短音频转文字。返回识别出的文字，听不清返回空串。 */
export async function azureTranscribe(audio, { fetchImpl = fetch, contentType = 'audio/ogg; codecs=opus' } = {}) {
  const region = process.env.AZURE_SPEECH_REGION; const key = process.env.AZURE_SPEECH_KEY;
  const r = await fetchImpl(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=simple`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': contentType },
    body: audio,
    signal: AbortSignal.timeout(STT_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d.RecognitionStatus === 'Success' ? String(d.DisplayText ?? '').trim() : '';
}

/** 把一路 Opus 包收成一段 Ogg（Buffer）。stream 结束或超过 MAX_MS 时返回。 */
async function collectOgg(stream, prism) {
  const ogg = new prism.opus.OggLogicalBitstream({
    opusHead: new prism.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
    pageSizeControl: { maxPackets: 10 },
  });
  const chunks = [];
  ogg.on('data', (c) => chunks.push(c));
  const done = new Promise((ok) => { ogg.on('end', ok); ogg.on('error', ok); });
  stream.pipe(ogg);
  const timer = setTimeout(() => stream.destroy(), MAX_MS);
  await done;
  clearTimeout(timer);
  return Buffer.concat(chunks);
}

export class Hearing {
  /**
   * @param {object} o
   * @param {() => Promise<object>} o.connect 连上语音频道，返回 receiver（测试时给假的）。接口和 @discordjs/voice 的 VoiceReceiver 一样：speaking 事件 + subscribe(userId)
   * @param {(stream) => Promise<Buffer>} [o.toOgg] Opus 流转 Ogg
   * @param {(ogg: Buffer) => Promise<string>} [o.transcribe]
   * @param {() => void} [o.leave] 离开语音频道
   */
  constructor({ connect, toOgg, transcribe = azureTranscribe, leave = () => {} }) {
    this.connect = connect; this.toOgg = toOgg; this.transcribe = transcribe; this.leave = leave;
    this.targets = new Set();
    this.lines = new Map();
    this.busy = new Set();
    this.receiver = null;
    this.closed = false;
    this.onStart = (id) => this.heard(id);
  }

  async start() {
    this.receiver = await this.connect();
    this.receiver.speaking.on('start', this.onStart);
  }

  /** 这一天要听谁。名单换了就把昨天的文字清掉。 */
  listen(ids) {
    this.targets = new Set(ids);
    this.lines = new Map();
  }

  /** 这个人今天被听到的话。 */
  transcript(id) { return this.lines.get(id) ?? []; }

  /** 有人开口了：不是目标就什么都不做（根本不订阅他的音频）。 */
  async heard(id) {
    if (this.closed || !this.targets.has(id) || this.busy.has(id)) return;
    this.busy.add(id);
    try {
      const stream = this.receiver.subscribe(id, { end: { behavior: 1, duration: SILENCE_MS } }); // 1 = EndBehaviorType.AfterSilence
      const ogg = await this.toOgg(stream);
      if (this.closed || !this.targets.has(id) || !ogg.length) return;
      const text = await this.transcribe(ogg);
      if (this.closed || !this.targets.has(id)) return;
      this.onAudio?.(id, ogg, text ?? ''); // 存档（听不清的也存）
      if (!text) return;
      const list = this.lines.get(id) ?? [];
      if (list.length < MAX_LINES) list.push(text);
      this.lines.set(id, list);
      this.onLine?.(id, text); // 房间：默许检测（别人说某人被洗脑、跳他的角色；他有没有否认）
    } catch (e) {
      console.warn('[botc] 语音转写失败：', e.message);
    } finally {
      this.busy.delete(id);
    }
  }

  stop() {
    this.closed = true;
    this.targets.clear();
    this.lines.clear();
    this.receiver?.speaking.off('start', this.onStart);
    try { this.leave(); } catch { /* 已经断开了 */ }
  }
}

/**
 * 真正连 Discord：机器人进广场语音频道（不闭耳才收得到音频）。依赖按需加载，没装或者加载失败时返回 null，游戏照常进行、只靠公开声明。
 * @returns {Promise<Hearing|null>}
 */
export async function discordHearing(client, guildId, channelId) {
  if (!hearingReady()) return null;
  try {
    const { joinVoiceChannel, entersState, VoiceConnectionStatus } = await import('@discordjs/voice');
    const prism = (await import('prism-media')).default;
    const guild = await client.guilds.fetch(guildId);
    let conn = null;
    const hearing = new Hearing({
      connect: async () => {
        conn = joinVoiceChannel({ guildId, channelId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
        await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
        return conn.receiver;
      },
      toOgg: (stream) => collectOgg(stream, prism),
      leave: () => conn?.destroy(),
    });
    await hearing.start();
    return hearing;
  } catch (e) {
    console.warn('[botc] 语音判定没有打开：', e.message);
    return null;
  }
}
