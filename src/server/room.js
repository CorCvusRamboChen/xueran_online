// 一个频道里的一局游戏：大厅 → 开局 → 夜晚收集选择 → 白天提名投票 → 结束。
// 所有操作走 act(userId, type, payload)；状态变了就 onChange()，由服务器给每个人推送各自的视图。
import { Game, shuffle, balancedTB, setupScoreTB, rollRoles, rollRagnarok } from '../engine/game.js';
import { balancedBMR, setupScore, rollBMR } from '../engine/bmr.js';
import { balancedSNV, setupScoreSNV, rollSNV, rollTeensy, rollMixed, balancedMixed, MAX_DECLARES, AMNESIAC_DAY, seatMarionette, rollRiot, swapMoDemon } from '../engine/snv.js';
import { TRAVELLER_IDS, SCRIPT_TRAVELLERS, travellersOf, ROLES, SCRIPTS, TEAM_NAME, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole, engineOf, inScript, rolesOf, playersOf, ragnarokWolves } from '../engine/roles.js';
import { getMap, houseAt, houseCenter, doorPoint, pathLength, positionAt, speedOf } from '../shared/map.js';
import { CHARACTERS, CHARACTER_IDS } from '../shared/characters.js';
import { cleanOutfit } from '../shared/outfit.js';
import { PELT_ITEMS, PELT_PER_DAY, PELT_ON } from '../shared/pelt.js';
import { saveRecording } from './recorder.js';
import { SETUPS, pickPreset, PRESET_SHARE } from '../shared/setups.js';
import { buildRoles, easeNewbies } from '../engine/assign.js';
import { narration } from './narration.js';
import { ttsUrl } from './tts.js';
import { judgeStatement, judgeMadness, judgeBreak, looksBroken, judgeAvailable, judgeAmnesiac, adviseFisherman, looksInjected, speakSeat7, judgeLead, judgeResponsible, readTable } from './judge.js';
import { parseTable, describeTable, tableLead } from '../engine/tableRead.js';
import { noteMarks, readTown, markedRole } from './beliefs.js';
import { Werewolf } from '../engine/werewolf.js';
import { WW_ROOM } from './werewolfRoom.js';
import { Avalon } from '../engine/avalon.js';
import { AvalonTable, AVALON_SETTINGS, AV_ACTIONS } from './avalon.js';
import { MarkGame } from '../engine/mark.js';
import { MarkTable, MK_ACTIONS, MARK_SETTINGS } from './mark.js';

// 受害者那段破门过场多长（毫秒）：踹门 → 踹开 → "你死了"，播完再天亮
// 每人在镇上有家的剧本（早上从自家门口出门）；其中暗流涌动一系还有夜里「冲到对方家门口破门」的过场
const KILL_SCENE_SCRIPTS = new Set(['tb']); // 破门过场只在暗流涌动（2026-11-11 用户定）
const HOME_SCRIPTS = new Set(['tb', 'ngj', 'rag', 'cat', 'ucd', 'ecp', 'bmr', 'hhr', 'pie', 'trust', 'booz', 'sar', 'mo']); // 每人在镇上有个家（白天从自家出门）：和破门是两回事
const SHARED_HOME_SCRIPTS = new Set(['bmr']); // 能当家的房子比人少时合住（黯月初升的地图只有 6 栋）
const VICTIM_SCENE_MS = 6500;
// 一局里的真人全都离线这么久，就暂停这局、放开所有闭麦闭耳（有人回来自动接着打）
const IDLE_PAUSE_MS = 3 * 60_000;
const NIGHT_MIN_MS = 25_000; // 最短夜晚：大家都选完了也要到 25 秒才天亮（11-12 用户定，见 beginNight）
const MOONCHILD_WAIT_MS = 20_000; // 月之子 / 呆瓜黄昏被处决：入夜前等他公开选人这么久，超时随机选（用户 2026-11-03 嫌 30 秒卡，缩到 20 秒）
/**
 * 疯狂判定时听到的话和结论，存进 g.heard（只进存档文件给线下分析，getGame 不往外给，不进时间线、不进复盘：
 * 收音页可能录到私聊房间里的话）。最后十句、每句最多 120 字。
 */
function noteHeard(g, { id, kind, claim, verdict, reason, lines }) {
  const p = g.get(id);
  (g.heard ??= []).push({
    at: Date.now(), day: g.day, night: g.night, id, role: p?.role ?? null, evil: p ? g.evilOf(p) : null, kind, claim, verdict, reason,
    lines: (lines ?? []).slice(-10).map((x) => String(typeof x === 'string' ? x : x?.text ?? '').slice(0, 120)),
  });
}
// 畸形秀演员要判的话。玩家之间用颜色代称角色类型（界面上的颜色：镇民蓝、外来者紫、爪牙黄、恶魔红），
// 「我是紫色」「我不是三原色」就是在说自己是外来者（2026-11-12 用户）
const MUTANT_CLAIM = '我是外来者（这局大家用颜色代称角色类型：镇民是蓝色、外来者是紫色、爪牙是黄色、恶魔是红色；说自己是紫色、或者说自己不是三原色 / 不是红蓝黄，都等于在说自己是外来者）';
const OUTSIDER_HINT = /外来者|紫|三原色|不是[红蓝黄]/;
const MUTANT_WORD = /[畸奇]形秀/; // 畸形秀演员自己说出这三个字就处决
const BREAK_CHECKS = 6; // 一个人一天最多问几次大模型有没有破功：防止反复说到那些词，花费失控
const LOG_MAX = 1000; // 公告留多少条：要够一整局。每次推送只带最后 40 条（见 viewFor 的 log），全部的打开「记录」时再取
const HOST_IDLE_MS = 60_000;  // 大厅里房主这么久没操作，别人可以接管
const HOST_GONE_MS = 15_000;  // 房主离线这么久没回来，自动交给在线的人（短暂断线重连不算）
// 造谣者自由声明交给 AI 判定：入夜结算前最多等这么久，还没判完就按假处理
const GOSSIP_WAIT_MS = 32_000;
const SEAT7 = 'bot-seat7'; // 七步成诗的 7 号空座：当机器人用（夜里替它选人），但不提名、不投票、不在镇上走，见 seat7Speak
const BOOM_MS = 25_000; // 炸弹人引爆后的倒数：先留时间看清是谁，再倒数十声
const RAG_SHOT_MS = 20_000; // 诸神黄昏：每个死掉的人都给这么久决定开不开枪（狼人也一样等，免得从等多久看出谁是狼）
// 语音校正：每隔几秒对一遍"每个人该在哪个语音频道"和"他实际在哪"，不对就拉过去（拉人偶尔会失败或被网络延迟打乱顺序）
const VOICE_CHECK_MS = 4000;
const VOICE_GRACE_MS = 3000; // 刚进出房子的人先不管，等这次拉人落地

/**
 * 没有大模型时粗判失忆者的猜测：说中了角色名就是完美；能力描述里的关键词重合越多越接近。
 * 只是兜底，所以宁可保守（多答"有关"），不轻易说"完美"。
 */
// 通用的「公开声明」（说自己是某个角色）关掉了：2026-11-11 用户定，公开声明只留给造谣者（他自己的「发表声明」），
// 疯狂（洗脑师、畸形秀演员）由后台听语音判定（广场机器人 + 收音页转写），不靠玩家点按钮。代码先留着，打开就是改回这一行
const declarable = () => false;

export function guessLevel(guess, ability) {
  const r = ROLES[ability];
  if (!r) return '无关';
  if (guess.includes(r.name)) return '完美';
  const KEYS = ['数字', '邪恶', '邻', '两名', '两个', '角色', '醒', '死', '投票', '提名', '恶魔', '爪牙', '阵营', '选', '每晚', '每个夜晚', '是或否', '有没有'];
  const hit = KEYS.filter((k) => guess.includes(k) && r.ability.includes(k)).length;
  return hit >= 3 ? '接近' : hit >= 1 ? '有关' : '无关';
}

export class UserError extends Error {}
const KNOCK_STAY = 70; // 敲门的人目的地离门口这么近（像素）就还算站在门口
const newId = () => Math.random().toString(36).slice(2, 8);

/** 这个剧本能选的旅行者（只列推荐的；没列的剧本没有旅行者）。 */
const travellerList = travellersOf;
export { SCRIPT_TRAVELLERS };

// 默认入夜闭麦闭耳的剧本：夜半狂欢（哈迪寂亚结算时全场要安静）
const NIGHT_QUIET = new Set(['mo']);

export const DEFAULT_SETTINGS = {
  script: 'tb',          // 剧本：tb 暗流涌动 / bmr 黯月初升 / snv 梦殒春宵
  preset: null,          // 旧设置（只认官方八人推荐的某一套），现在用 setupMode
  setupMode: 'preset',   // 配置怎么来：preset 推荐预设（人数对得上大多从推荐配置里挑，其余 AI）/ ai AI 配置（强弱配平）/ random 完全随机
  mode: 'auto',          // auto：机器人说书；human：房主说书
  shuffle: true,
  chooseSeconds: 45,     // 夜里选人时限（大家都选完就立刻结算，没选完的等到时限替他随机选）
  voteSeconds: 3,        // 投票时钟每人停留
  voteCountdown: 8,      // 时钟开始转动前的倒计时
  mezEasy: true,         // 灵言师的关键词：简单（日常话题词，好引导）；关掉是普通（不常见的词，官方口径）（2026-11-19 用户：默认简单）
  moDemon: 'vigormortis', // 夜半狂欢的第二个恶魔：亡骨魔（原版）/ 小怪宝 / 利维坦（2026-11-19 用户要的开关）
  nightDeafen: false,    // 夜里服务器闭麦+闭耳（默认关：大家自觉闭麦，开了有时会卡入夜）
  pauseMs: 4000,         // 结算后到下一阶段的停顿
  killSceneMs: 11000,    // 暗流涌动：夜晚结算后到天亮的时间，留给恶魔"变身 + 冲刺"和受害者"被破门"两段动画
  roamMinutes: 5,        // 白天自由活动多久（0 = 等主持人喊集合）
  nominateMinutes: 3,    // 集合后开放提名多久（自动说书）
  accuseSeconds: 60,     // 提名者陈述（房主开局前可调）
  defendSeconds: 60,     // 被提名者辩护（房主开局前可调）
  riotSeconds: 20,
  exileSeconds: 20,      // 旅行者：提议流放后大家举手的时间
  rpsSeconds: 20,        // 夜半狂欢：精神病患者被处决时猜拳的时间       // 裁缝与暴乱：被提名死掉的人想下一个提名谁的时间（官方现场是数 3、2、1，线上要留点时间点人）
  speechSeconds: 90,     // 狼人杀：白天每人发言多久（遗言最多 60 秒）
  nominatorVotes: true,  // 房规：提名的人一开始自动举手（票数从 1 开始）；2026-11-16 用户：可以放下，不一定要投
  speechMute: true,      // 陈述/辩护时只有发言的人能说话，其他人服务器闭麦
  smallEvilInfo: false,  // 房规：6 人及以下也让恶魔和爪牙互认、恶魔拿伪装（官方不给）
  deadDrunk: false,      // 房规：夜里被杀的信息角色照样拿当晚的信息，但按醉酒处理（官方：死了就没有能力，不再醒）
  lunaticGhost: false,   // 房规（黯月初升）：以为自己是僵怖的疯子死后仍在没人死的夜里被叫醒，维持假象（官方：死了就失去能力，不再醒）
  smallNoBaron: false,    // 房规：暗流涌动 7 人以下不随机发男爵（小局多两个外来者太难打）；房主指定的照给
  minionBluffs: false,    // 房规：爪牙和恶魔共用 3 个伪装（官方只给恶魔，恶魔再私下告诉队友）
  hideVotes: false,      // 房规：投票过程中只看得到自己举没举手，投完公开（官方是实时公开举手，默认照官方）
  spectatorGrimoire: false, // 观战的人能看魔典（所有人身份）——会漏信息，默认关
  muteSpectators: false,    // 开局后观战的人在语音里被服务器闭麦（免得漏信息）；离开或终局自动解除。2026-11-16 用户：默认不闭麦
  settingsVersion: 4,       // 4：7 人以下不发男爵、爪牙共用伪装改成默认关（11-18 用户：全按官方百科）       // 2：闭麦闭耳、隐藏票型改成默认关；3：观战闭麦改成默认关（老房间读档时改一次，之后房主怎么设就怎么样）
  ...AVALON_SETTINGS,       // 娱乐模式阿瓦隆的设置，见 server/avalon.js
  ...MARK_SETTINGS,         // 娱乐模式暗印的设置（调包、遗言开关），见 server/mark.js
};

/** 一间房子的空状态：谁在里面、锁没锁、谁在敲门、谁被放行、对应的语音频道。 */
const blankHouse = () => ({ ids: new Set(), locked: false, knocks: new Set(), allow: new Set(), channelId: null, queue: Promise.resolve() });

export class Room {
  constructor({ key, guildId, hostId, voice, onChange = () => {}, settings = {} }) {
    this.hostSeen = Date.now(); // 房主最后一次操作的时间：大厅里挂机太久别人能接管
    this.key = key;
    this.guildId = guildId;
    this.hostId = hostId;
    this.voice = voice;
    this.onChange = onChange;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.users = new Map();   // 连过来的人：id → {id, name, avatar}
    this.outfits = new Map(); // 小人的搭配：id → outfit（随时能换，只是外观）
    this.online = new Set();
    this.lastSeen = new Map(); // 谁最后什么时候有操作（走路也算）：说书人的骰子用
    this.timers = new Set();
    this.reset();
  }

  /** 回到大厅（保留已加入的人，方便再来一局）。 */
  reset() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.lobby = this.lobby ?? [];
    this.newbies = this.newbies ?? []; // 房主标记的新手（跨局保留）：发身份避开难角色，机器人和 AI 说书人照顾一下
    this.game = null;
    this.ended = false;
    this.square = null;
    this.vote = null;
    this.pendingNom = null;
    this.riotStep = null;       // 裁缝与暴乱：被提名死掉、正在想下一个提名谁的人 { id, until, must }
    this.roam = null;           // 白天自由活动（小镇地图）
    this.homes = null;          // 每人在镇上的家：playerId → 房子 id
    this.noms = null;           // 自动说书的提名环节：{ until, timeUp, skips }
    this.nomTimers = [];
    this.rooms = new Map();     // 主持人拉人的私聊房间 channelId → {channelId, members, until}
    this.inbox = new Map();
    this.acts = new Map();      // 每人自己夜里选了谁（只给自己看）
    this.pendingInfo = new Map();
    this.stLog = [];
    this.log = [];
    this.resolving = false;
    this.rkPending = null;
    this.revivePending = null; // 夜里刚被复活、当晚还要行动的人（结算停在中途等他选）
    this.deadline = null;
    this.logSeq = 0;
    // 这个房间实例的编号：房间被清掉重建（或换进教程房间）时 logSeq 从 0 重新数，客户端靠它知道要重新对齐，
    // 不然它记着的旧编号比新房间的大，之后的旁白全被当成旧的——不弹标题卡、不念
    this.epoch = Math.random().toString(36).slice(2, 10);
    this.duskDay = null;
    this.moonchildDue = null;
    this.roamedToday = false;
    this.lastVote = null;
    this.meets = [];            // 谁和谁进了同一间屋（只进存档）
    this.voteHistory = [];      // 每次投票的票型（谁提名谁、谁举了手），投完公开
    this.knifeLog = [];         // 刀口：每晚谁死了（平安夜也记），谁复活了——「关键信息」页用
    this.execLog = [];          // 每天黄昏的处决结果
    this.pubLog = [];           // 公开事件：公开声明、开枪、公开选人、突然死亡——「关键信息」页按天列
    this.paused = false;        // 真人全都离线：暂停中（计时器全停、语音全放开）
    this.idleTimer = null;
    this.ownedChannels = new Set(); // 这局开过的语音频道（语音校正用）
    this.voiceTouched = new Map();
    this.wwKey = null;          // 狼人杀：已经排好计时的阶段编号（见 werewolfRoom.js）
    this.wwEnding = false;
  }

  // ───────────── 工具 ─────────────
  get stId() { return this.settings.mode === 'human' ? this.hostId : null; }
  isHost(id) { return id === this.hostId; }
  requireHost(id) { if (!this.isHost(id)) throw new UserError(this.stId ? '只有说书人可以这么做' : '只有房主可以这么做'); }
  requireGame() { if (!this.game) throw new UserError('游戏还没开始'); return this.game; }
  isFake(id) { return id.startsWith('bot-'); }
  realIds() { return this.game ? this.game.players.map((p) => p.id).filter((id) => !this.isFake(id)) : []; }
  changed() { this.onChange(this); }
  get av() { return (this.avalonTable ??= new AvalonTable(this)); } // 阿瓦隆的流程（只在 script 是 avalon 时用）
  get mk() { return (this.markTable ??= new MarkTable(this)); } // 暗印的流程（只在 script 是 mark 时用），见 server/mark.js

  later(ms, fn) {
    const t = setTimeout(async () => {
      this.timers.delete(t);
      try { await fn(); } catch (e) { console.error('[botc]', e); }
      this.changed();
    }, ms);
    this.timers.add(t);
    return t;
  }
  cancel(t) { if (t) { clearTimeout(t); this.timers.delete(t); } }

  /**
   * 一条公告。key：是不是关键信息（「记录」默认只显示关键的）：死亡、提名投票、公开声明、开枪、私聊、开局终局默认算；
   * 钟楼的操作提示（自由活动怎么玩、集合、还剩 30 秒……）、说书人的旁白不算。
   */
  announce(text, kind = 'info', key = ['death', 'vote', 'start', 'end', 'whisper'].includes(kind)) {
    this.log.push({ id: ++this.logSeq, text, kind, key, at: Date.now() });
    if (this.log.length > LOG_MAX) this.log.shift();
  }
  /**
   * 公开事件（公开声明、开枪、公开选人、突然死亡……）：进「记录」算关键，也按天记进「关键信息」页。
   * 夜里发生的算在第二天那一栏（第 N 夜在第 N 天前面）。
   */
  pub(text, kind = 'vote') {
    this.announce(text, kind, true);
    const g = this.game;
    if (!g) return;
    const night = g.phase === 'night' ? g.night : null;
    (this.pubLog ??= []).push({ day: night ? g.day + 1 : g.day, night, text, at: Date.now() });
  }
  /** 自己夜里选了谁：只给自己看（「身份」页的记录里）。同一夜改了选择就改这一条。 */
  myAct(uid, text, voice) {
    if (this.isFake(uid)) return;
    const g = this.game;
    const list = (this.acts ??= new Map()).get(uid) ?? [];
    const last = list.at(-1);
    if (last?.night === g.night) Object.assign(last, { text, voice });
    else list.push({ id: ++this.logSeq, night: g.night, phase: `第${g.night}夜`, text, voice, mine: true });
    this.acts.set(uid, list);
  }
  /** AI 房主的一句旁白（极乐迪斯科式）。客户端会读出来；有 title 的弹出过场标题卡。 */
  narrate(event, vars) {
    if (this.game?.werewolf || this.game?.mark) return; // 狼人杀、暗印有自己的台词，不念血染的旁白
    const n = narration(event, { script: this.game?.script, ...vars });
    if (!n) return;
    this.log.push({ id: ++this.logSeq, kind: 'story', text: n.text, title: n.title ?? null, audio: ttsUrl(n.text), at: Date.now() });
    if (this.log.length > LOG_MAX) this.log.shift();
  }
  stNote(text) { if (this.stId) { this.stLog.push({ id: ++this.logSeq, text }); if (this.stLog.length > 60) this.stLog.shift(); } }
  tell(playerId, text, voice = null) {
    const g = this.game;
    const list = this.inbox.get(playerId) ?? [];
    list.push({ id: ++this.logSeq, phase: g.phase === 'night' ? `第${g.night}夜` : `第${g.day}天`, text, voice });
    this.inbox.set(playerId, list);
  }
  name(id) { return this.game?.get(id) ? this.game.name(id) : this.users.get(id)?.name ?? '?'; }

  async safeVoice(fn) {
    if (!this.voice) return null;
    try { return await fn(this.voice); } catch (e) { console.warn('[botc] 语音操作失败：', e.message); return null; }
  }

  // ───────────── 操作入口 ─────────────
  async act(uid, type, p = {}) {
    if (uid === this.hostId) this.hostSeen = Date.now();
    this.lastSeen.set(uid, Date.now());
    if (type === 'join' || type === 'start' || type === 'hello') this.micChanged(); // 一开始就查一遍谁闭着麦（之后靠语音状态变化推过来）
    // 走路很频繁，只推送位置，不推完整状态
    if (type === 'move') return this.move(uid, p.x, p.y, { run: !!p.run });
    if (type === 'marks') return this.recordMarks(uid, p); // 没有状态要推给别人
    if (this.game?.werewolf && !this.wwAllowed(type)) throw new UserError('狼人杀里没有这个操作');
    if (this.game?.avalon && !AV_ACTIONS.has(type)) throw new UserError('阿瓦隆里没有这个操作'); // 没有自由活动、私聊、提名这些血染的操作
    if (this.game?.mark && !MK_ACTIONS.has(type)) throw new UserError('暗印里没有这个操作'); // 自由活动和私聊照用，提名投票、夜里选人这些血染的不要
    if (this.game?.werewolf && type.startsWith('ww')) { this.wwAct(uid, type, p); this.changed(); return null; }
    if (type === 'fullLog') return { log: this.log.slice(Math.max(0, this.log.findLastIndex((l) => l.kind === 'start'))) }; // 打开「记录」时取一次这局的全部
    switch (type) {
      case 'join': this.join(uid); break;
      case 'leave': this.leave(uid); break;
      case 'claimHost':
        if (uid === this.hostId) break;
        if (this.game && this.stId) throw new UserError('真人说书进行中，不能接管');
        // 大厅里房主开着活动却没人管（挂机、切走了）也能接管；开局后要等他真的离线
        if (this.online.has(this.hostId) && (this.game || Date.now() - this.hostSeen < HOST_IDLE_MS)) {
          throw new UserError(this.game ? '房主还在线' : '房主刚刚还有操作，过一会儿再试');
        }
        this.takeHost(uid);
        break;
      case 'releaseHost': this.releaseHost(uid); break;
      case 'settings': this.updateSettings(uid, p); break;
      case 'character': this.pickCharacter(uid, p.id ?? null); break;
      case 'outfit': this.outfits.set(uid, cleanOutfit(p.outfit, uid)); break;
      case 'addBots': this.requireHost(uid); this.addFakes(Number(p.count) || 1); break;
      case 'assignRole': this.requireHost(uid); this.assignRole(p.player, p.role ?? null); break;
      case 'kick': this.requireHost(uid); if (!this.game) { this.lobby = this.lobby.filter((x) => x.id !== p.target); this.newbies = this.newbies.filter((x) => x !== p.target); } break;
      case 'markNewbie': this.requireHost(uid); this.markNewbie(p.player, !!p.on); break;
      case 'start': this.requireHost(uid); await this.start(); break;
      case 'avalon': await this.av.act(uid, p); break;
      case 'mark': await this.mk.act(uid, p); break;
      case 'choose': if (p.targets != null && !Array.isArray(p.targets)) throw new UserError('选择格式不对'); this.choose(uid, p.night, p.targets ?? [], p.role ?? null); break;
      case 'gossip': this.gossip(uid, p.statement ?? {}); break;
      case 'moonchild': this.moonchild(uid, p.target); break;
      case 'moonchildSkip': this.moonchildSkip(uid); break;
      case 'declare': this.declare(uid, p.role); break;
      case 'juggle': this.juggle(uid, p.guesses); break;
      case 'savant': this.savant(uid); break;
      case 'artist': this.artist(uid, p.text); break;
      case 'fisherman': this.fisherman(uid); break;
      case 'amnesiac': this.amnesiac(uid, p.text); break;
      case 'goblin': this.goblin(uid); break;
      case 'damsel': this.damsel(uid, p.target); break;
      case 'harpyClaim': this.harpyClaim(uid); break;
      case 'boomPoint': this.requireGame().boomPoint(uid, p.target); break;
      case 'ragShoot': this.ragShoot(uid, p.target ?? null); break;
      case 'pardon': this.pardon(uid); break;
      case 'klutz': this.klutz(uid, p.target); break;
      case 'ravenkeeper': await this.onRavenkeeper(uid, p.target); break;
      case 'nominate': this.nominate(uid, p.target); break;
      case 'startVote': this.startVote(uid); break;
      case 'nomDone': this.nomDone(uid); break;
      case 'skipNom': this.skipNom(uid); break;
      case 'riotPass': this.riotPass(uid); break;
      case 'pelt': this.pelt(uid, p.target, p.item); break;
      case 'mvp': this.voteMvp(uid, p.target); break;
      case 'traveller': this.joinTraveller(uid, p.role); break;
      case 'travellerLeave': this.leaveTraveller(uid); break;
      case 'exile': this.proposeExile(uid, p.target); break;
      case 'exileHand': this.exileHand(uid, !!p.up); break;
      case 'gunslinger': this.gunslinger(uid, p.target); break;
      case 'judge': this.judge(uid, !!p.pass); break;
      case 'giveBeggar': this.giveBeggar(uid); break;
      case 'matron': this.matron(uid, p.pairs); break;
      case 'gnome': this.gnome(uid); break;
      case 'butcherNominate': this.butcherNominate(uid, p.target); break;
      case 'butcherHand': this.butcherHand(uid, !!p.up); break;
      case 'laugh': this.laugh(uid, !!p.up); break;
      case 'psycho': this.psycho(uid, p.target); break;
      case 'rps': this.rpsHand(uid, p.hand); break;
      case 'hand': this.hand(uid, !!p.up); break;
      case 'history': return { games: this.history?.list(this.guildId) ?? [] };
      case 'stats': return { stats: (p.scope === 'all' ? this.history?.statsAll?.() : this.history?.stats?.(this.guildId, uid)) ?? null }; // scope all：全服排行榜（所有服务器合计）
      case 'markStats': return { stats: this.history?.markStats?.(this.guildId) ?? [] }; // 暗印的生还排行
      case 'pastGame': return { game: this.history?.get(this.guildId, String(p.id ?? '')) ?? null };
      case 'shareBluffs': if (!this.game) throw new UserError('游戏还没开始'); this.game.shareBluffs(uid); break;
      case 'slay': this.slay(uid, p.target); break;
      case 'dusk': this.requireHost(uid); await this.dusk(); break;
      case 'dawn': this.requireHost(uid); await this.forceDawn(); break;
      case 'roam': this.requireHost(uid); this.startRoam(p.minutes ?? this.settings.roamMinutes); break;
      case 'lock': this.lock(uid, p.house, !!p.locked); break;
      case 'knock': this.answerKnock(uid, p.house, p.who, !!p.yes); break;
      case 'invite': { const res = this.invite(uid, p.house, p.who); this.changed(); return res; }
      case 'inviteReply': this.inviteReply(uid, !!p.yes); break;
      case 'roamVote': await this.roamVote(uid, !!p.yes); break;
      case 'endWhisper': await this.endWhisper(uid, p.room); break;
      case 'fixVoice': return this.fixVoice(uid);
      case 'pull': this.requireHost(uid); await this.pull(uid, p.targets ?? [], p.minutes); break;
      case 'gather': this.requireHost(uid); await this.gather(); break;
      case 'st': this.requireHost(uid); await this.stAction(p); break;
      case 'hostMadExecute': this.requireHost(uid); this.hostMadExecute(p.target); break;
      case 'info': this.requireHost(uid); this.handleInfo(p); break;
      case 'end': this.requireHost(uid); await this.teardown(); this.reset(); this.announce('已回到大厅'); break;
      default: throw new UserError('未知操作');
    }
    this.changed();
    return null;
  }

  /** 开局时看一眼战绩：每人打过几局、赢了多少，这个服务器善良赢多少。真人才有，机器人不算。 */
  readRecords(seats) {
    if (this.tutorial) return null;
    if (!this.history?.stats) return null;
    try {
      const players = {};
      let town = null;
      for (const { id } of seats) {
        if (this.isFake(id)) continue;
        town = this.history.stats(this.guildId, id); // 带上 id 才查得到他在别的服务器打的局
        const r = town.players.find((p) => p.id === id);
        players[id] = { games: r?.games ?? 0, wins: r?.wins ?? 0 };
      }
      return { players, games: town?.games ?? 0, goodWins: town?.goodWins ?? 0 };
    } catch (e) {
      console.warn('[botc] 读战绩失败：', e.message); // 读不到战绩也要能开局
      return null;
    }
  }

  /** 说书人掷骰子时看的情况。开局和读档都要接上（这个函数不进存档）。 */
  wireGame() {
    if (!this.game) return;
    this.game.signals = (who) => this.signals(who);
    this.game.tableRead = () => (this.tableRead?.gameId === this.game?.id ? this.tableRead : null); // 黄昏读场的结果（说书人挑人、配合伪装用）
    // 大家在小魔典里把这个人标成什么善良角色（没有公开声明时，说书人照这个配合他的伪装）
    this.game.markedRole = (id) => { const g = this.game; return markedRole(this.beliefs?.now, id, (r) => inScript(r, g.script) && ['townsfolk', 'outsider'].includes(ROLES[r]?.team)); };
  }

  /**
   * 说书人的情况：dice.js 里有权重的才影响判定，其余只记进日志（影子信号）。
   * rookie、veteran、offline 有权重；玩家标记里只有 demonSplit（大家猜的恶魔不一致）有权重，只给修补匠用。其余只看不用。
   */
  signals(who) {
    const g = this.game;
    const out = { stage: 1 - g.aliveCount() / g.players.length };
    const rec = g.records;
    if (rec) {
      const players = Object.entries(rec.players);
      // 胜率往 50% 收一收：打得少的人一两局说明不了什么
      const skill = ([, r]) => (r.wins + 2.5) / (r.games + 5);
      const side = (evil) => {
        const list = players.filter(([id]) => { const p = g.get(id); return p && g.evilOf(p) === evil; });
        return list.length ? list.reduce((a, x) => a + skill(x), 0) / list.length : 0.5;
      };
      out.skillGap = side(false) - side(true);
      if (rec.games >= 10) out.townBias = rec.goodWins / rec.games - 0.5;
    }
    if (this.beliefs?.gameId === g.id) {
      const ids = g.players.map((p) => p.id);
      const town = readTown(this.beliefs.now, ids, (id) => { const p = g.get(id); return p && !g.evilOf(p); });
      const said = Object.values(town).filter((t) => t.evil + t.good > 0);
      const demon = g.demon();
      out.coverage = Object.keys(this.beliefs.now).length / Math.max(1, this.realIds().length);
      if (demon) out.demonMarks = town[demon.id].suspect - 0.5;
      // 局势：好人们怀疑真邪恶的程度减去怀疑好人的程度（恶魔算两倍），按表态的人多少打折。说书人的 balance() 用
      const live = g.players.filter((p) => p.alive);
      const avg = (list, w = () => 1) => { const ws = list.reduce((a, p) => a + w(p), 0); return ws ? list.reduce((a, p) => a + w(p) * (town[p.id].suspect - 0.5), 0) / ws : 0; };
      const evilSus = avg(live.filter((p) => g.evilOf(p)), (p) => (ROLES[p.role].team === 'demon' ? 2 : 1));
      const goodSus = avg(live.filter((p) => !g.evilOf(p)));
      const opinions = live.filter((p) => town[p.id].evil + town[p.id].good > 0).length;
      const sure = Math.min(1, opinions / Math.max(3, live.length * 0.6));
      if (opinions) out.marksLead = Math.max(-1, Math.min(1, 2 * (evilSus - goodSus))) * sure;
      if (demon && town[demon.id].evil + town[demon.id].good > 0) out.demonExposed = town[demon.id].suspect;
      if (said.length) out.split = said.reduce((a, t) => a + Math.min(t.evil, t.good) / (t.evil + t.good), 0) / said.length; // 0 大家意见一致，0.5 对半分
      if (who && town[who]) out.marksHeat = town[who].suspect - 0.5;
      // 善良玩家在小魔典里猜的恶魔不止一种：大家对「恶魔是哪个」有分歧（修补匠用它挑混乱的夜里死）
      const kinds = new Set();
      for (const [by, m] of Object.entries(this.beliefs.now)) {
        const q = g.get(by);
        if (!q || g.evilOf(q)) continue;
        for (const t of Object.values(m.tags ?? {})) if (t?.role && ROLES[t.role]?.team === 'demon') kinds.add(t.role);
      }
      out.demonKinds = kinds.size;
      out.demonSplit = kinds.size >= 2 ? 1 : 0;
    }
    const t = this.tableRead?.gameId === g.id ? this.tableRead : null;
    if (t) { const lead = tableLead(t, g); if (lead != null) out.tableLead = lead; out.atheistTalk = t.atheist; }
    if (who && !this.isFake(who)) {
      const r = rec?.players[who];
      if (r) { out.games = r.games; out.rookie = r.games < 3 && !g.newbies?.includes(who); out.veteran = r.games >= 20; }
      const seen = this.lastSeen.get(who);
      // 刚重启时谁都还没连回来，没有操作记录的不算掉线
      if (seen) { out.offline = !this.online.has(who); out.idle = Math.min(600, (Date.now() - seen) / 1000); }
    }
    return out;
  }

  /** 玩家的小魔典：隐形指标，见 beliefs.js。对不上这一局的（上一局残留、观战、教程）不记，也不报错。 */
  recordMarks(uid, p) {
    const g = this.game;
    if (!g || this.ended || this.tutorial || p.gameId !== g.id || !g.get(uid)) return null;
    this.beliefs = noteMarks(this.beliefs, g, uid, p);
    this.onQuiet?.(this);
    return null;
  }

  // ───────────── 大厅 ─────────────
  join(uid) {
    if (this.game) throw new UserError('游戏已经开始了');
    if (uid === this.stId) throw new UserError('说书人不能同时当玩家');
    if (this.lobby.some((p) => p.id === uid)) return;
    if (this.lobby.length >= MAX_PLAYERS) throw new UserError(`最多 ${MAX_PLAYERS} 人`);
    const u = this.users.get(uid);
    this.lobby.push({ id: uid, name: u?.name ?? '玩家', avatar: u?.avatar ?? null });
  }

  leave(uid) {
    if (this.game) throw new UserError('游戏进行中不能离开');
    this.lobby = this.lobby.filter((p) => p.id !== uid);
  }

  updateSettings(uid, p) {
    this.requireHost(uid);
    if (this.game) throw new UserError('开局后不能改设置');
    const s = this.settings;
    if (this.solo && p.mode === 'human') throw new UserError('单机试玩只有 AI 说书人');
    if (p.mode === 'auto' || p.mode === 'human') {
      s.mode = p.mode;
      if (p.mode === 'human') this.lobby = this.lobby.filter((x) => x.id !== this.hostId);
    }
    if (typeof p.shuffle === 'boolean') s.shuffle = p.shuffle;
    if (typeof p.nightDeafen === 'boolean') { s.nightDeafen = p.nightDeafen; s.nightDeafenAuto = false; } // 房主自己定了，就不再自动改
    if (typeof p.mezEasy === 'boolean') s.mezEasy = p.mezEasy;
    if (['vigormortis', 'lilmonsta', 'leviathan'].includes(p.moDemon)) s.moDemon = p.moDemon;
    if (typeof p.nominatorVotes === 'boolean') s.nominatorVotes = p.nominatorVotes;
    if (typeof p.speechMute === 'boolean') s.speechMute = p.speechMute;
    if (typeof p.smallEvilInfo === 'boolean') s.smallEvilInfo = p.smallEvilInfo;
    if (typeof p.smallNoBaron === 'boolean') s.smallNoBaron = p.smallNoBaron;
    if (typeof p.deadDrunk === 'boolean') s.deadDrunk = p.deadDrunk;
    if (typeof p.lunaticGhost === 'boolean') s.lunaticGhost = p.lunaticGhost;
    if (typeof p.hearMadness === 'boolean') s.hearMadness = p.hearMadness;
    this.av.updateSettings(p);
    this.mk.updateSettings(p);
    if (SCRIPTS[p.script]) {
      if (s.script !== p.script) {
        s.preset = null;
        // 夜半狂欢默认入夜闭麦闭耳（2026-11-19 用户：哈迪寂亚结算时官方要求全场安静）。换走时只撤掉自动打开的那次，房主自己开的不动
        if (NIGHT_QUIET.has(p.script) && !s.nightDeafen) { s.nightDeafen = true; s.nightDeafenAuto = true; }
        else if (!NIGHT_QUIET.has(p.script) && s.nightDeafenAuto) { s.nightDeafen = false; s.nightDeafenAuto = false; }
      }
      s.script = p.script;
    }
    if (['preset', 'ai', 'random'].includes(p.setupMode)) s.setupMode = p.setupMode;
    if ('preset' in p) s.preset = p.preset == null ? null : Math.max(0, Math.min((SETUPS[s.script]?.length ?? 1) - 1, Number(p.preset) || 0));
    if (typeof p.minionBluffs === 'boolean') s.minionBluffs = p.minionBluffs;
    if (typeof p.hideVotes === 'boolean') s.hideVotes = p.hideVotes;
    if (typeof p.spectatorGrimoire === 'boolean') s.spectatorGrimoire = p.spectatorGrimoire;
    if (typeof p.muteSpectators === 'boolean') { s.muteSpectators = p.muteSpectators; this.syncWatchMute(); }
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
    if (p.chooseSeconds != null) s.chooseSeconds = clamp(p.chooseSeconds, 20, 600);
    if (p.voteSeconds != null) s.voteSeconds = clamp(p.voteSeconds, 1, 10);
    if (p.roamMinutes != null) s.roamMinutes = clamp(p.roamMinutes, 0, 30);
    if (p.nominateMinutes != null) s.nominateMinutes = clamp(p.nominateMinutes, 1, 15);
    if (p.accuseSeconds != null) s.accuseSeconds = clamp(p.accuseSeconds, 10, 300);
    if (p.defendSeconds != null) s.defendSeconds = clamp(p.defendSeconds, 10, 300);
    if (p.speechSeconds != null) s.speechSeconds = clamp(p.speechSeconds, 15, 300);
  }

  /** 挑人物形象（同一个人物只能一个人用）；id 为 null 表示改回 Discord 头像。 */
  pickCharacter(uid, id) {
    if (this.game) throw new UserError('开局后不能换形象');
    const me = this.lobby.find((p) => p.id === uid);
    if (!me) throw new UserError('先加入游戏');
    if (id != null) {
      if (!CHARACTER_IDS.has(id)) throw new UserError('没有这个人物');
      const holder = this.lobby.find((p) => p.char === id && p.id !== uid);
      if (holder) throw new UserError(`${holder.name} 已经选了这个人物`);
    }
    me.char = id;
  }

  freeCharacter() {
    const taken = new Set(this.lobby.map((p) => p.char));
    return CHARACTERS.find((c) => !taken.has(c.id))?.id ?? null;
  }

  /**
   * 房主给某个座位指定角色（大厅里，只有房主看得到）。role 为 null = 随机。
   * 同一个角色只能给一个人：指给别人时从原来那个人身上拿走。没指定的座位开局时按人数表随机补齐。
   */
  assignRole(player, role) {
    if (this.game) throw new UserError('游戏已经开始了');
    if (!this.lobby.some((p) => p.id === player)) throw new UserError('这个人不在座位上');
    const script = this.settings.script ?? 'tb';
    if (role != null && !(ROLES[role] && inScript(role, script))) throw new UserError('这个剧本里没有这个角色');
    this.roleAssign ??= {};
    for (const [id, r] of Object.entries(this.roleAssign)) if (r === role) delete this.roleAssign[id];
    if (role == null) delete this.roleAssign[player]; else this.roleAssign[player] = role;
  }

  addFakes(n) {
    if (this.game) throw new UserError('游戏已经开始了');
    let k = Math.max(0, ...this.lobby.filter((p) => p.fake).map((p) => Number(p.id.slice(4))));
    for (let i = 0; i < n && this.lobby.length < Math.min(MAX_PLAYERS, playersOf(this.settings.script ?? 'tb')[1]); i++) {
      k += 1;
      this.lobby.push({ id: `bot-${k}`, name: `机器人${k}`, avatar: null, fake: true, char: this.freeCharacter() });
    }
  }

  // ───────────── 开局 ─────────────
  async start() {
    if (this.game) throw new UserError('游戏已经开始了');
    this.pelted = {}; this.pelts = {}; // 惩罚场外：头上叠的东西每局重来
    this.peltFx = []; if (this.mvp) { this.cancel(this.mvp.timer); this.mvp = null; } // 上一局的扔东西动画、MVP 投票
    this.talk = []; // 全员收音的剧本：每天的发言（读场、将军、政客用）
    this.tableRead = null;
    if (this.lobby.length < MIN_PLAYERS) throw new UserError(`至少需要 ${MIN_PLAYERS} 名玩家`);
    const seats = this.settings.shuffle ? shuffle(this.lobby, Math.random) : [...this.lobby];
    const script = this.tutorial ? 'tb' : this.settings.script ?? 'tb';
    const [lo, hi] = playersOf(script);
    if (seats.length < lo || seats.length > hi) throw new UserError(`《${SCRIPTS[script].name}》要 ${lo}–${hi} 名玩家（现在 ${seats.length} 人）`);
    if (SCRIPTS[script].avalon) return this.av.start(seats); // 阿瓦隆：完全是另一套流程
    if (SCRIPTS[script].mark) return this.mk.start(seats); // 暗印：另一套流程（server/mark.js），自由活动照用
    if (SCRIPTS[script].werewolf) return this.wwStart(seats, script); // 狼人杀、诸神黄昏：另一套流程（werewolfRoom.js）
    // 七步成诗的灯神规则：7 号座位没有人坐，照样发角色，由说书人替它做决定
    if (SCRIPTS[script].seat7) seats.splice(6, 0, { id: SEAT7, name: '7号空座', avatar: null, fake: true });
    const teensy = !!SCRIPTS[script].teensy;
    const mixed = !teensy && !!SCRIPTS[script].roles && SCRIPTS[script].engine === 'snv'; // 自选角色的大剧本（七步成诗）
    const ragnarok = !!SCRIPTS[script].ragnarok; // 诸神黄昏：角色只按人数定（几只狼人），不用推荐配置、不按房主指定
    const riot = !!SCRIPTS[script].riot; // 裁缝与暴乱：同上，只有女裁缝和暴乱两种，按人数定
    // 房主指定了角色：指定的座位照指定，其余按人数表随机补齐（推荐配置就不用了）
    const assign = this.tutorial || ragnarok || riot ? {} : Object.fromEntries(Object.entries(this.roleAssign ?? {}).filter(([id, r]) => seats.some((p) => p.id === id) && !!ROLES[r] && inScript(r, script)));
    const custom = Object.keys(assign).length > 0;
    const noBaron = script === 'tb' && seats.length < 7 && !!this.settings.smallNoBaron;
    // 配置三选一：推荐预设（人数对得上时大多从推荐配置里挑，官方的权重高；其余和没有推荐配置的人数用 AI 配置）/ AI 配置 / 完全随机
    const mode = this.settings.setupMode ?? 'preset';
    const pinned = this.settings.preset != null ? SETUPS[script]?.[this.settings.preset] : null; // 指定了某一套（旧设置 / 测试）：人数对得上就固定用它
    const preset = this.tutorial || custom || ragnarok || riot || mode !== 'preset' ? null
      : pinned?.roles.length === seats.length ? pinned
        : Math.random() < PRESET_SHARE ? pickPreset(script, seats.length, Math.random) : null;
    const pure = !this.tutorial && !custom && !preset && mode === 'random'
      ? (ragnarok ? rollRagnarok(seats.length, Math.random) : teensy ? rollTeensy(script, seats.length, Math.random) : mixed ? rollMixed(script, seats.length, Math.random) : script === 'bmr' ? rollBMR(seats.length, Math.random) : script === 'snv' ? rollSNV(seats.length, Math.random) : rollRoles(seats.length, Math.random, { noBaron })) : undefined;
    let roles = riot ? rollRiot(seats.length, Math.random) : this.tutorial ? this.tutorial.roles : custom ? buildRoles(seats.map((p) => p.id), assign, script, Math.random, { noBaron }) : preset ? shuffle(preset.roles, Math.random) : pure;
    // 新手：拿到难角色的大概率和老玩家的同类普通角色对调（房主指定的座位不动）
    const newbies = new Set(this.tutorial ? [] : this.newbies.filter((id) => seats.some((p) => p.id === id)));
    if (newbies.size && !riot) {
      roles ??= ragnarok ? rollRagnarok(seats.length, Math.random) : teensy ? rollTeensy(script, seats.length, Math.random) : mixed ? balancedMixed(script, seats.length, Math.random) : script === 'bmr' ? balancedBMR(seats.length, Math.random) : script === 'snv' ? balancedSNV(seats.length, Math.random) : balancedTB(seats.length, Math.random, { noBaron });
      roles = easeNewbies(seats.map((p) => p.id), roles, newbies, script, { fixed: new Set(Object.keys(assign)) });
    }
    // 夜半狂欢的恶魔开关：抽到亡骨魔就换成小怪宝 / 利维坦（人数跟着调）；房主指定了亡骨魔的不换
    const demonSwap = script === 'mo' && ['lilmonsta', 'leviathan'].includes(this.settings.moDemon) ? this.settings.moDemon : null;
    if (demonSwap && !this.tutorial) roles = swapMoDemon(roles ?? balancedMixed(script, seats.length, Math.random), demonSwap, Math.random, new Set(seats.map((p, i) => (assign[p.id] ? i : -1)).filter((i) => i >= 0)));
    // 提线木偶要坐在恶魔旁边：房主指定了角色的座位不动（引擎开局还会再检查一次，那时已经相邻就不挪）
    if (roles?.includes('marionette')) roles = seatMarionette([...roles], Math.random, new Set(seats.map((p, i) => (assign[p.id] ? i : -1)).filter((i) => i >= 0)));
    this.game = new Game(seats.map(({ id, name }) => ({ id, name })), { roles, drunkAs: custom ? null : preset?.drunkAs, script, noBaron, evilInfo: seats.length >= 7 || this.settings.smallEvilInfo, deadDrunk: !this.tutorial && !!this.settings.deadDrunk, lunaticGhost: !!this.settings.lunaticGhost, newbies: [...newbies], mezEasy: this.settings.mezEasy !== false, demonSwap });
    this.duskDay = null;
    this.ragCur = null; this.ragQ = []; this.ragThen = null; // 诸神黄昏的开枪队列：上一局剩下的不要带过来
    this.game.records = this.readRecords(seats);
    this.wireGame();
    if (newbies.size) this.stNote(`新手 ${newbies.size} 人：发身份时调低了当邪恶的概率，难角色尽量换成简单的`);
    if (pure && !riot) this.stNote('完全随机：按人数表随机抽的角色，没有调平衡');
    if (ragnarok) this.stNote(`诸神黄昏：${ragnarokWolves(seats.length)} 只狼人（小恶魔），其余全是猎手`);
    else if (script === 'tb' && !custom && !preset && !this.tutorial) this.stNote(`AI 配板：强弱配平（平衡分 ${setupScoreTB(this.game.players.map((p) => p.role))}，正数偏善良）${seats.length <= 12 ? '；12 人及以下调了信息位（共情者和占卜师少同时出现、F4 一般 1–2 个、有男爵多半有图书管理员）' : ''}`);
    if (this.game.deadDrunk) this.stNote('房规：夜里被杀的信息角色仍拿当晚的信息，按醉酒处理（真假由 AI 说书人按局势定）');
    if (script === 'bmr' && !custom && !preset && !pure && !this.tutorial) this.stNote(`AI 配板：随机出 60 套、去掉最偏的两头后挑的一套（平衡分 ${setupScore(this.game.players.map((p) => p.role))}，正数偏善良）${seats.length <= 6 ? '；5–6 人局不出沙巴洛斯、莽夫' : ''}`);
    if (script === 'snv' && !custom && !preset && !pure && !this.tutorial) this.stNote(`AI 配板：随机出 60 套、去掉最偏的两头后挑的一套（平衡分 ${setupScoreSNV(this.game.players.map((p) => p.role))}，正数偏善良）`);
    if (mixed && !custom && !preset && !pure && !this.tutorial) this.stNote(`AI 配板：随机出 60 套、去掉最偏的两头后挑的一套（平衡分 ${setupScoreSNV(this.game.players.map((p) => p.role))}，正数偏善良）`);
    if (SCRIPTS[script].seat7) { this.game.get(SEAT7).seat7 = true; this.stNote(`灯神规则：7 号空座是 ${this.game.tag(SEAT7)}，由 AI 说书人替它选择，每局替它发言一次`); }
    if (teensy && !custom && !preset && !pure && !this.tutorial) this.stNote('小剧本：按官方人数表随机发的角色（男爵在已有一个外来者时只加一个；有气球驾驶员时可能多一个外来者）');
    if (custom) this.stNote(`房主指定了 ${Object.keys(assign).length} 个人的角色，其余随机`);
    else if (preset) this.stNote(`套用推荐配置「${preset.name}」`);
    this.devRoles();
    this.assignHomes();
    const square = await this.safeVoice((v) => v.findSquare(this.hostId, seats.map((p) => p.id)));
    // 同一个语音频道同时只能有一局在控制语音：被别的局占着就撤销这局，回到大厅
    try { await this.claimSquare(square); } catch (e) { this.game = null; this.homes = null; this.stLog = []; throw e; }
    this.square = square;
    const [t, o, m, d] = DISTRIBUTION[seats.length];
    if (ragnarok) this.announce(`游戏开始！《${SCRIPTS[script].name}》${seats.length} 人：${seats.length - ragnarokWolves(seats.length)} 名猎手 · ${ragnarokWolves(seats.length)} 只狼人（小恶魔）。猎手死了可以开一枪，打谁谁死。`, 'start');
    else this.announce(`游戏开始！《${SCRIPTS[script].name}》${seats.length} 人：镇民 ${t} · 外来者 ${o} · 爪牙 ${m} · 恶魔 ${d}`, 'start');
    this.narrate('start', { n: seats.length });
    if (!this.square) this.announce('没检测到大家所在的语音频道，夜晚闭麦和拉人私聊不会生效（房主先进语音再开局即可）。');
    this.syncWatchMute();
    this.stNote(`伪装：${this.game.bluffs.map((r) => ROLES[r].name).join('、')}`);
    this.watchVoice();
    await this.openHearing();
    await this.beginNight();
  }

  /** 房主标记 / 取消新手（开局前）。 */
  markNewbie(player, on) {
    if (this.game) throw new UserError('开局后不能再改，下一局再标');
    if (!this.lobby.some((p) => p.id === player)) throw new UserError('这个人不在座位上');
    if (this.isFake(player)) throw new UserError('机器人不用标');
    this.newbies = on ? [...new Set([...this.newbies, player])] : this.newbies.filter((x) => x !== player);
  }

  /** 本地测试（DEV_LOGIN 的 ?devRole=）：开局把指定角色和拿着它的人对调。线上的 Discord 用户没有 devRole。 */
  devRoles() {
    const ps = this.game.players;
    for (const p of ps) {
      const want = this.users.get(p.id)?.devRole;
      if (!want || !ROLES[want] || p.role === want) continue;
      // 这局没有这个角色：先把一个同类型的角色（镇民换镇民、爪牙换爪牙……）改成它
      if (!ps.some((q) => q.role === want)) {
        const mate = ps.find((q) => ROLES[q.role].team === ROLES[want].team);
        if (mate) { mate.role = want; mate.shownRole = want; if (mate.gained !== undefined) mate.gained = null; } // 失忆者的隐藏能力不能留给新角色
      }
      const holder = ps.find((q) => q.role === want);
      if (!holder || holder === p) continue;
      for (const k of ['role', 'shownRole', 'gained', 'evil']) [p[k], holder[k]] = [holder[k], p[k]]; // 隐藏能力、单独记的阵营跟着角色走
    }
    // 开局时按原来的角色算好的东西跟着改：第一任恶魔（拿伪装的人）、占卜师的红鲱鱼（必须是善良玩家）
    const g = this.game;
    const demon = ps.find((q) => ROLES[q.role].team === 'demon');
    if (demon && g.firstDemon !== undefined) g.firstDemon = demon.id;
    if (g.redHerring && isEvilRole(g.get(g.redHerring)?.role)) g.redHerring = ps.find((q) => !isEvilRole(q.role) && q.role !== 'fortuneteller')?.id ?? null;
  }

  /**
   * 每人分一栋镇上不能进的房子当家：白天从自家门口出门；暗流涌动一系夜里要选人的角色还会从家里走到对方家门口动手（见 hasKillScene）。
   * 谁住哪是公开的。黯月初升的地图只有 6 栋能当家的房子，人多时两三个人合住一栋（从同一个门口出来，左右错开站）。
   */
  assignHomes() {
    const g = this.game;
    const town = this.town;
    const pool = HOME_SCRIPTS.has(g.script) ? shuffle([...town.homes()], Math.random) : [];
    const share = SHARED_HOME_SCRIPTS.has(g.script);
    this.homes = pool.length && (share || pool.length >= g.players.length)
      ? Object.fromEntries(g.players.map((p, i) => [p.id, pool[i % pool.length].id])) : null;
  }

  // ───────────── 夜晚 ─────────────
  async beginNight() {
    const g = this.game;
    await this.endRoam();
    await this.closeAllRooms();
    this.pendingNom = null;
    this.clearRiot();
    this.moonchildFakes = null;
    const prompts = g.startNight();
    this.resolving = false;
    if (g.evilMessages?.length) { this.deliver(g.evilMessages); g.evilMessages = null; }
    this.clearNoms();
    this.announce(`第 ${g.night} 夜降临，所有人闭上眼睛……`, 'night');
    this.narrate('night', { night: g.night });
    // 闭麦要一个个来，人多时好几秒：别让画面和倒计时等它，先推给大家；天亮和终局前等它闭完（不然解开在前、闭上在后，有人就一直闭着）
    this.nightVoice = this.settings.nightDeafen && this.square ? Promise.resolve(this.dayVoice).then(() => this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square))) : null;
    for (const pr of prompts) if (this.isFake(pr.playerId)) this.botChoose(pr.playerId);
    this.stNote(`第 ${g.night} 夜。等待：${prompts.filter((x) => !this.isFake(x.playerId)).map((x) => `${g.name(x.playerId)}（${ROLES[x.role].name}）`).join('、') || '无'}`);
    const night = g.night;
    // 最短夜晚（AI 说书）：大家都选完了也要等到这个时刻才天亮。以前一选完 0.6 秒就结算（没人要醒的夜 2 秒），
    // 机器人又是瞬间选的，夜晚一闪而过（2026-11-11 用户：晚上速度太快了）；夜晚长短还会漏出今晚几个人醒、选得多快。
    // 固定 25 秒（11-12 用户定）；选人时限设得比 25 秒短时按时限。真人说书不加（说书人自己掌握），新手教程不加（单人练习要快）
    this.nightMinAt = this.stId || this.tutorial ? null : Date.now() + Math.min(NIGHT_MIN_MS, this.settings.chooseSeconds * 1000);
    if (!g.missingChoices().length) this.later(this.settings.pauseMs / 2, () => this.finishNight(night));
    else {
      this.deadline = Date.now() + this.settings.chooseSeconds * 1000;
      this.nightBase = this.deadline; // 大家共同的截止时间；dueFor 里是单独延长的人（疯子选完后的真恶魔）
      this.dueFor = {};
      this.dawnAt = null; // 黯月初升：最早什么时候天亮（见 startDemonClock）
      this.nightTimer = this.later(this.settings.chooseSeconds * 1000, () => this.nightTimeout(night));
    }
    this.changed();
    await this.nightVoice;
  }

  /**
   * 到了共同的截止时间：没选的人（单独延长了的除外）替他随机选。疯子被替选完，真恶魔才开始自己的时间，
   * 这时不入夜结算，等到最晚的那个人的截止时间再结算。
   */
  nightTimeout(night) {
    const g = this.game;
    if (!g || g.phase !== 'night' || g.night !== night || this.resolving) return;
    const now = Date.now();
    for (let pass = 0; pass < 2; pass++) {
      for (const id of g.missingChoices()) {
        if ((this.dueFor?.[id] ?? 0) > now) continue;
        if (g.nightPrompts().find((x) => x.playerId === id)?.waiting) continue;
        this.autoPick(id, night);
      }
    }
    const last = Math.max(0, ...Object.values(this.dueFor ?? {}));
    if (g.missingChoices().length && last > now) {
      this.deadline = last;
      this.cancel(this.nightTimer);
      this.nightTimer = this.later(last - now, () => this.finishNight(night));
      this.changed();
      return;
    }
    this.finishNight(night);
  }

  /** 超时替一个人随机选（机器人按机器人的方式选），告诉他；疯子被替选完要告诉恶魔，并给恶魔留时间。 */
  autoPick(id, night) {
    const g = this.game;
    if (this.isFake(id)) this.botChoose(id); else g.autoChoose(id);
    const c = g.choices[id];
    if (!c) return;
    const names = this.choiceText(c);
    if (!this.isFake(id)) this.tell(id, `时间到，已替你随机选择：${names}`, 'clock');
    this.recordAct(id, true);
    this.stNote(`${g.name(id)} 超时，随机选择了 ${names}`);
    (this.timedOut ??= new Set()).add(id);
    if (g.get(id)?.role === 'lunatic') {
      const d = g.players.find((q) => ROLES[q.role].team === 'demon' && q.alive);
      if (d) this.deliver([{ playerId: d.id, text: `疯子 ${g.name(id)} 今晚选了：${names}。` }]);
    }
    this.startDemonClock(id, night);
  }

  /**
   * 黯月初升：今晚"以为自己是恶魔"的那个人——有疯子要醒就是疯子（真恶魔得等他），没有就是真恶魔。
   */
  demonLikeId() {
    const g = this.game;
    const acts = (id) => g.nightPrompts().some((x) => x.playerId === id);
    const lun = g.players.find((q) => q.role === 'lunatic' && (q.alive || g.ghostLunatic?.(q)));
    if (lun && acts(lun.id)) return lun.id;
    const d = g.players.find((q) => ROLES[q.role].team === 'demon' && q.alive);
    return d && acts(d.id) ? d.id : null;
  }

  /**
   * 黯月初升：从"以为自己是恶魔的人"选完（自己选或超时被替选）开始，天亮统一定在之后随机 20–45 秒。
   * 疯子选完以后真恶魔还要想一会儿——要是真恶魔自己选完很快就天亮，疯子就能从"我选完以后等了多久才天亮"看出自己是假的。
   * 现在不管是真恶魔还是疯子，"我选完到天亮"等的时间分布都一样。有疯子时，真恶魔就用这段时间行动（截止在天亮前 2 秒）。
   */
  startDemonClock(uid, night) {
    const g = this.game;
    if (g?.script !== 'bmr' || this.dawnAt || uid !== this.demonLikeId()) return;
    const [lo, hi] = this.dawnPad ?? [20_000, 45_000];
    this.dawnAt = Date.now() + lo + Math.random() * (hi - lo);
    if (g.get(uid)?.role !== 'lunatic') return;
    const d = g.players.find((q) => ROLES[q.role].team === 'demon' && q.alive);
    if (!d || this.isFake(d.id) || g.choices[d.id]) return;
    const due = this.dawnAt - 2000;
    (this.dueFor ??= {})[d.id] = due;
    this.tell(d.id, `疯子选好了，轮到你：你还有 ${Math.round((due - Date.now()) / 1000)} 秒。`, 'clock');
    if (this.deadline < due) this.deadline = due;
    // 共同截止时间已经过了（疯子是超时被替选的）：等到恶魔的截止时间再结算
    if (Date.now() >= (this.nightBase ?? 0)) {
      this.cancel(this.nightTimer);
      this.nightTimer = this.later(due - Date.now(), () => this.finishNight(night));
    }
  }

  /** 这个人现在该看到的倒计时：夜里只有轮到自己选（而且不是在等疯子）才看得到自己的截止时间；说书人看全局的。 */
  deadlineFor(uid) {
    const g = this.game;
    if (g?.werewolf) return this.wwDeadlineFor(uid);
    if (!g || g.phase !== 'night' || uid === this.stId) return this.deadline;
    if (this.resolving) return this.rkPending === uid || this.revivePending === uid ? this.deadline : null;
    const pr = g.nightPrompts().find((x) => x.playerId === uid);
    if (!pr || pr.waiting || g.choices[uid]) return null;
    return Math.max(this.nightBase ?? this.deadline ?? 0, this.dueFor?.[uid] ?? 0) || null;
  }

  choose(uid, night, targets, role = null) {
    const g = this.requireGame();
    if (g.phase !== 'night' || g.night !== night || (this.resolving && this.revivePending !== uid)) throw new UserError('这个选择已经过期了');
    if (this.revivePending === uid) { // 夜里刚被复活、当晚还轮得到他
      g.submitChoice(uid, targets, { role });
      this.recordAct(uid);
      this.later(300, () => this.resumeNight(night, uid));
      return;
    }
    const msgs = g.submitChoice(uid, targets, { role });
    this.recordAct(uid);
    if (msgs?.length) this.deliver(msgs);
    for (const pr of g.nightPrompts()) if (this.isFake(pr.playerId) && !g.choices[pr.playerId] && !pr.waiting) this.botChoose(pr.playerId);
    this.stNote(`${g.name(uid)}（${ROLES[g.get(uid).shownRole].name}）选择了 ${this.choiceText(g.choices[uid])}`);
    this.startDemonClock(uid, night);
    if (!g.missingChoices().length) this.later(600, () => this.finishNight(night));
  }

  /** 记下这个人今晚的选择（「第2夜 你用旅店老板选了 …」），给他自己的「身份」页看。 */
  recordAct(uid, timedOut = false) {
    const g = this.game;
    const c = g.choices[uid];
    if (!c) return;
    const pr = g.nightPrompts().find((x) => x.playerId === uid);
    const roleId = pr?.role ?? g.get(uid)?.shownRole;
    const as = ROLES[roleId] ? `用${ROLES[roleId].name}` : '';
    const what = this.choiceText(c);
    this.myAct(uid, what === '不使用能力' ? `你今晚没有使用${ROLES[roleId]?.name ?? ''}的能力${timedOut ? '（超时）' : ''}` : `你${as}选择了 ${what}${timedOut ? '（超时，替你随机选的）' : ''}`, roleId);
  }

  async finishNight(night) {
    const g = this.game;
    if (!g || g.phase !== 'night' || g.night !== night || this.resolving) return;
    // 还没到定好的天亮时刻就先等着：黯月初升的恶魔时钟（见 startDemonClock），和每晚的最短夜晚（见 beginNight）
    const wait = Math.max(this.dawnAt ?? 0, this.nightMinAt ?? 0);
    if (wait && Date.now() < wait - 30) {
      this.cancel(this.nightTimer);
      this.nightTimer = this.later(wait - Date.now(), () => this.finishNight(night));
      return;
    }
    this.dawnAt = null;
    this.nightMinAt = null;
    this.resolving = true;
    this.deadline = null;
    this.cancel(this.nightTimer);
    // 造谣者的声明还在等 AI 判定：先等它（最多 GOSSIP_WAIT_MS），过时还没回来就按假处理
    if (this.gossipToken && this.gossipJudging) {
      await Promise.race([this.gossipJudging, new Promise((ok) => setTimeout(ok, this.gossipWaitMs ?? GOSSIP_WAIT_MS))]);
      if (this.gossipToken) { this.gossipToken = null; g.gossipVerdict(false, 'AI 判定超时，按假处理'); this.stNote('造谣者的声明 AI 判定超时，按假处理'); }
    }
    const timedOut = new Set([...g.missingChoices(), ...(this.timedOut ?? [])]);
    this.timedOut = null;
    this.dueFor = {};
    for (let pass = 0; pass < 2; pass++) {
      for (const id of g.missingChoices()) {
        if (g.nightPrompts().find((x) => x.playerId === id)?.waiting) continue;
        this.autoPick(id, night);
      }
    }
    for (const [id, c] of Object.entries(g.choices)) {
      g.record('choice', `${g.tag(id)} 选择了 ${this.choiceText(c)}${timedOut.has(id) ? '（超时，随机）' : ''}`);
    }
    this.afterResolve(g.resolveNight(), night);
  }

  /** 结算一段之后：有人夜里被复活、当晚还要行动 → 停下来等他选；有守鸦人 → 等守鸦人；否则天亮。 */
  afterResolve({ messages, ravenkeeper, pause }, night) {
    const g = this.game;
    this.deliver(messages);
    if (pause) {
      this.revivePending = pause;
      this.tell(pause, g.pauseText?.(pause) ?? '你被复活了！你的能力回来了，今晚还轮得到你：现在行动。', 'clock');
      if (this.isFake(pause)) { this.botChoose(pause); this.later(300, () => this.resumeNight(night, pause)); return; }
      this.deadline = Date.now() + this.settings.chooseSeconds * 1000;
      this.reviveTimer = this.later(this.settings.chooseSeconds * 1000, () => { if (!g.choices[pause]) this.autoPick(pause, night); this.resumeNight(night, pause); });
      this.changed();
      return;
    }
    if (ravenkeeper) {
      this.rkPending = ravenkeeper;
      if (this.isFake(ravenkeeper)) return this.onRavenkeeper(ravenkeeper, g.players[0].id);
      this.deadline = Date.now() + this.settings.chooseSeconds * 1000;
      this.rkTimer = this.later(this.settings.chooseSeconds * 1000, () => this.onRavenkeeper(ravenkeeper, g.players[0].id));
      return;
    }
    this.afterNight();
  }

  /** 夜里被复活的人选完了（或超时被替选）：从停下的地方接着结算。 */
  resumeNight(night, who = this.revivePending) {
    const g = this.game;
    if (!g || g.phase !== 'night' || g.night !== night || !this.revivePending || this.revivePending !== who) return; // 迟到的定时器不放行别人的暂停
    const id = this.revivePending;
    this.revivePending = null;
    this.deadline = null;
    this.cancel(this.reviveTimer);
    g.record('choice', `${g.tag(id)}${g.engine === 'snv' ? '' : '（刚被复活）'}选择了 ${this.choiceText(g.choices[id])}`);
    this.afterResolve(g.resolveNight(), night);
  }

  async onRavenkeeper(uid, target) {
    if (!this.rkPending || this.rkPending !== uid) throw new UserError('这个选择已经过期了');
    this.rkPending = null;
    this.deadline = null;
    this.cancel(this.rkTimer);
    this.deliver([this.game.resolveRavenkeeper(target)]);
    this.afterNight();
  }

  /** 一次夜间选择写成文字：几名玩家（+ 一个角色），或"没有使用能力"。 */
  choiceText(c) {
    const g = this.game;
    if (!c) return '无';
    const targets = Array.isArray(c) ? c : c.targets ?? [];
    const role = Array.isArray(c) ? null : c.role;
    if (!targets.length && !role) return '不使用能力';
    return [targets.map((x) => g.name(x)).join('、'), role ? `角色「${ROLES[role].name}」` : ''].filter(Boolean).join(' ');
  }

  /** 自动模式直接告诉玩家；真人模式先进说书人的待审队列。 */
  deliver(messages) {
    const g = this.game;
    for (const m of messages) {
      const p = g.get(m.playerId);
      // 能力失效（酒鬼/中毒）时拿到的信息可能是假的：复盘里标出来，说书人的判定里有具体真假
      // 间谍的整本魔典太长，复盘里只记一句
      const what = m.text.startsWith('魔典') ? '看了一遍魔典' : `得知：${m.text.replace(/\*\*/g, '')}`;
      if (m.playerId === SEAT7) ((g.seat7 ??= {}).notes ??= []).push(`第 ${g.night} 夜：${what}`);
      g.record('info', `${g.tag(m.playerId)}${p && g.broken(p) ? '【能力失效】' : ''} ${what}`);
      const voice = p?.shownRole ?? null;
      if (!this.stId) { this.tell(m.playerId, m.text, voice); continue; }
      this.pendingInfo.set(newId(), { ...m, voice });
    }
  }

  handleInfo({ id, action, text }) {
    const m = this.pendingInfo.get(id);
    if (!m) throw new UserError('这条信息已经处理过了');
    this.pendingInfo.delete(id);
    if (action === 'send') this.tell(m.playerId, text?.trim() || m.text, m.voice);
  }

  /** 这局有没有破门过场（暗流涌动、每人有家）。 */
  hasKillScene() {
    return !!this.homes && KILL_SCENE_SCRIPTS.has(this.game?.script);
  }

  afterNight() {
    const g = this.game;
    // 恶魔破门：被恶魔杀死的人在天亮前看一段"门被踹开"的动画。有家的局每晚都停这么久，免得从夜晚长短猜出有没有人死
    const scene = this.hasKillScene();
    const total = this.settings.killSceneMs ?? 11000;
    this.killScene = null;
    if (this.stId) {
      // 真人说书：说书人可能还要花一阵子发信息，破门等他点「天亮」时才播（见 forceDawn），免得受害者早早就知道自己死了
      this.stNote(`夜晚结算完毕。今晚死亡：${g.nightDeaths.map((id) => g.name(id)).join('、') || '无'}。处理完信息后点「天亮」。`);
      return;
    }
    // 先等恶魔那边"变身 + 冲到门口"播完（约 4.5 秒），再开始踹受害者的门（约 6 秒），两边对得上
    if (scene) this.playKillScene(g, Math.max(0, total - VICTIM_SCENE_MS));
    this.later(scene ? Math.max(this.settings.pauseMs, total) : this.settings.pauseMs, () => this.beginDay());
  }

  /**
   * delay 毫秒后，给今晚死去的人播破门。夜里死的人都播同一段，不管是被恶魔杀、赌错了、被刺客刺、修补匠突然死：
   * 官方里死人只知道自己死了，不知道死因。以前只给被恶魔杀的人播，赌徒看到破门就知道自己赌对了（2026-11-11 玩家反馈）。
   */
  playKillScene(g, delay) {
    const victims = [...new Set(g.nightDeaths ?? [])].filter((id) => !g.get(id)?.alive);
    const play = () => { if (this.game === g && g.phase === 'night') { this.killScene = { victims }; this.changed(); } };
    if (delay > 0) this.later(delay, play); else play();
  }

  async forceDawn() {
    const g = this.requireGame();
    if (g.phase !== 'night') throw new UserError('现在不是夜晚');
    // 正在等造谣者的 AI 判定：这时天亮会跳过结算（所有人的信息、死亡都没了）
    if (this.resolving && this.gossipToken) throw new UserError('这一夜正在结算，稍等几秒');
    this.dawnAt = null; // 黯月初升定好的天亮时刻不等了：不清掉的话 finishNight 会先去等，这里就没结算直接天亮了
    this.nightMinAt = null; // 最短夜晚同理
    // 真人模式：第一次按 = 结算夜晚（没选的随机），第二次按 = 天亮
    if (!this.resolving) { await this.finishNight(g.night); if (this.stId) return; }
    // 结算停在中途等人现选（舞蛇人换了恶魔、夜里被复活……）：替他选完接着结算，不然后半夜就没了
    while (this.revivePending) {
      const id = this.revivePending;
      if (this.stId) throw new UserError(`${g.name(id)} 还没选`);
      if (!g.choices[id]) this.autoPick(id, g.night);
      this.resumeNight(g.night);
    }
    if (this.rkPending) {
      if (this.stId) throw new UserError('守鸦人还没选择');
      await this.onRavenkeeper(this.rkPending, g.players[0].id);
    }
    // 真人说书点「天亮」：先给受害者播破门，播完再天亮（没人死也照样等，免得从等多久猜出有没有人死）
    const total = this.settings.killSceneMs ?? 11000;
    if (this.stId && this.hasKillScene() && total > 0) {
      if (this.dawning === g.night) throw new UserError('正在天亮');
      this.dawning = g.night;
      this.playKillScene(g, 0);
      this.later(Math.min(VICTIM_SCENE_MS, total), () => { if (this.game === g && g.phase === 'night') this.beginDay(); });
      return;
    }
    await this.beginDay();
  }

  // ───────────── 白天 ─────────────
  async beginDay() {
    const g = this.game;
    if (!g || (g.phase !== 'night' && !g.winner) || this.ended) return;
    this.pendingInfo.clear();
    this.resolving = false;
    this.killScene = null;
    this.roamedToday = false;
    await this.closeAllRooms();
    const { deaths } = g.dawn();
    this.moonchildFakes = new Set(deaths.filter((id) => this.canFakeMoonchild(id)));
    // 和入夜一样：解开闭麦要一个个来，别让死讯等它。先等入夜的闭麦做完，下一次入夜也会等这里解完
    const wake = async () => { await this.nightVoice; if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square)); };
    this.dayVoice = wake();
    this.announce(deaths.length
      ? `第 ${g.day} 天。昨晚，${deaths.map((id) => `**${g.name(id)}**`).join('、')} 死了。`
      : `第 ${g.day} 天。昨晚是**平安夜**。`, 'day', true);
    const back = (g.nightRevived ?? []).filter((id) => g.get(id)?.alive);
    if (back.length) this.announce(`${back.map((id) => `**${g.name(id)}**`).join('、')} 复活了。`, 'day', true);
    // 哈迪寂亚：所有人都会得知他选了谁（各自怎么选的不公开，只说现在谁活着）
    if (g.ahNews?.night === g.night) this.announce(`**哈迪寂亚**昨晚选了：${g.ahNews.targets.map((id) => `**${g.name(id)}**（${g.get(id)?.alive ? '活着' : '死了'}）`).join('、')}。`, 'day', true);
    // 利维坦：每天天亮宣布在场和第几天（官方建议对新手每天说）；它失效的那天不宣布
    if (g.engine === 'snv' && g.leviOn()) this.announce(`**利维坦在场。**现在是第 ${g.day} 天${g.day >= 5 ? '——今天结束时邪恶获胜' : `（第 5 天结束时邪恶获胜；已有 ${g.leviGood.length} 名善良玩家被处决，再处决 ${2 - g.leviGood.length} 名善良玩家邪恶就获胜）`}。`, 'day', true);
    (this.knifeLog ??= []).push({ night: g.night, day: g.day, deaths: [...deaths], revived: back });
    if (g.nightRevived) g.nightRevived = [];
    this.moonchildNotice();
    this.klutzNotice();
    if (g.winner) { await this.endGame(); return; }
    this.ragDied(deaths);
    this.hearToday();
    this.narrate('dawn', { day: g.day, deaths: deaths.map((id) => g.name(id)) });
    // 自动说书：看完死讯就开始自由活动
    if (!this.stId) {
      const day = g.day;
      this.later(this.settings.pauseMs * 1.5, async () => {
        if (g.phase === 'day' && g.day === day && !this.roam && !this.vote && !this.pendingNom && !this.ended) this.startRoam(this.settings.roamMinutes);
      });
    }
    this.changed();
    await this.dayVoice;
  }

  nominate(uid, target) {
    const g = this.requireGame();
    if (this.pendingNom || this.vote) throw new UserError('还有一场提名/投票没结束');
    if (this.judgeDay === g.day) throw new UserError('法官已经强制处决，今天的提名结束了');
    if (g.bishopOn?.() && uid !== '__bishop') throw new UserError('主教在场：只有说书人可以发起提名');
    if (this.roam) throw new UserError('自由活动中，等集合回到广场再提名');
    const chain = !!this.riotStep && this.riotStep.id === uid; // 暴乱：被提名死掉的人接着提名，不受提名时间限制
    if (this.riotStep && !chain) throw new UserError(`现在轮到 ${this.game.name(this.riotStep.id)} 接着提名`);
    if (this.noms?.timeUp && !chain) throw new UserError('提名时间已经结束了');
    if (this.dusking || this.duskDay === g.day) throw new UserError('今天已经到黄昏了，不能再提名');
    if (!this.stId && !this.noms && !this.roamedToday) throw new UserError('现在还不能提名，等大家回到广场'); // 天亮到自由活动之间：这时提名成功，自由活动就起不来了
    const r = g.nominate(uid, target);
    if (r.riot) { this.riotAfter(`**${g.name(uid)}** 提名了 **${g.name(target)}**`, target); return; }
    if (r.golem) {
      this.pub(`**${g.name(uid)}** 提名了 **${g.name(target)}**——**${g.name(target)} 突然倒地身亡！** 提名照常进行。`, 'death');
      if (g.winner) { this.later(0, () => this.endGame()); return; }
      this.klutzNotice();
    }
    if (r.cursed) {
      this.pub(`**${g.name(uid)}** 提名了 **${g.name(target)}**——**${g.name(uid)} 突然倒地身亡！** 提名照常进行。`, 'death');
      if (g.winner) { this.later(0, () => this.endGame()); return; }
      this.klutzNotice(); // 女巫咒死的可能是呆瓜
    }
    if (r.virgin) {
      this.pub(`${g.name(uid)} 提名了 ${g.name(target)}——**${g.name(uid)} 被立即处决！** 今天的处决已经发生。`, 'death');
      this.narrate('virgin', { a: g.name(uid), b: g.name(target) });
      if (g.winner) this.later(0, () => this.endGame());
      else if (!this.stId) this.later(this.settings.pauseMs, () => this.autoDusk());
      return;
    }
    this.announce(`**${g.name(uid)}** 提名了 **${g.name(target)}**`, 'vote');
    this.narrate('nominate', { a: g.name(uid), b: g.name(target) });
    this.pendingNom = { nominator: uid, nominee: target };
    if (!this.stId) { this.pauseNoms(); this.nomStage('accuse'); }
    // 机器人哥布林被提名：多半当场声明身份
    const nominee = g.get(target);
    if (this.isFake(target) && g.engine === 'snv' && g.abilityOf(nominee) === 'goblin' && nominee.alive && g.st.roll('goblinClaim', {}, { who: target })) { try { this.goblin(target); } catch { /* 今天已经声明过 */ } }
  }

  // ───────────── 自动说书：提名环节 ─────────────
  // 集合后开放提名（限时）。每次提名：提名者陈述 → 被提名者辩护 → 自动投票。
  // 时间到、或者所有活着的人都提名过/点了"不提名了"，就自动入夜。
  // 有人正在陈述/辩护/投票时，提名环节的倒计时暂停，投完再接着走（最少留 30 秒给下一个提名）。

  openNominations() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended || this.roam || this.noms || this.stId) return;
    if (g.executedToday) { this.autoDusk(); return; }
    if (g.bishopOn?.()) { this.bishopDay(); return; }
    const min = this.settings.nominateMinutes;
    this.noms = { until: 0, paused: null, timeUp: false, skips: new Set() };
    this.narrate('nomOpen', { minutes: min });
    this.scheduleNoms(min * 60_000);
    this.botsConsider();
  }

  /** 提名环节还剩 ms 毫秒：到点前一分钟提醒，到点就截止。 */
  scheduleNoms(ms) {
    for (const t of this.nomTimers) this.cancel(t);
    this.nomTimers = [];
    this.noms.until = Date.now() + ms;
    this.noms.paused = null;
    if (ms > 60_000) this.nomTimers.push(this.later(ms - 60_000, () => { if (this.noms && !this.noms.timeUp) this.narrate('nomRemind'); }));
    this.nomTimers.push(this.later(ms, () => {
      if (!this.noms) return;
      this.noms.timeUp = true;
      if (!this.pendingNom && !this.vote) this.autoDusk();
    }));
  }

  pauseNoms() {
    const n = this.noms;
    if (!n || n.timeUp || n.paused != null) return;
    for (const t of this.nomTimers) this.cancel(t);
    this.nomTimers = [];
    n.paused = Math.max(0, n.until - Date.now());
  }

  resumeNoms() {
    if (this.noms?.paused != null) this.scheduleNoms(Math.max(this.noms.paused, Math.min(30_000, this.settings.nominateMinutes * 60_000)));
  }

  clearNoms() {
    this.speakOnly(null);
    for (const t of this.nomTimers) this.cancel(t);
    this.nomTimers = [];
    this.cancel(this.stageTimer);
    this.noms = null;
  }

  /** 提名者陈述 / 被提名者辩护：限时，本人可以提前说"说完了"。 */
  nomStage(stage) {
    const nom = this.pendingNom;
    if (!nom) return;
    const who = stage === 'accuse' ? nom.nominator : nom.nominee;
    if (who === 'storyteller') { this.openVote(); return; } // 被提名的是说书人：不辩护，直接投票
    const secs = this.isFake(who) ? 3 : stage === 'accuse' ? this.settings.accuseSeconds : this.settings.defendSeconds;
    nom.stage = stage;
    nom.until = Date.now() + secs * 1000;
    if (stage === 'defend' && who === SEAT7) this.seat7Speak({ nominated: true });
    this.speakOnly(who);
    this.narrate(stage, stage === 'accuse' ? { a: this.game.name(nom.nominator) } : { b: this.game.name(nom.nominee) });
    this.cancel(this.stageTimer);
    this.stageTimer = this.later(secs * 1000, () => {
      if (this.pendingNom !== nom) return;
      if (stage === 'accuse') this.nomStage('defend'); else this.openVote();
    });
  }

  /**
   * 只让 who 说话：语音里其他真人被服务器闭麦（陈述/辩护时）。who 为 null 时全部解除。
   * 只动这一段自己闭上的人，不影响夜里的闭耳。
   */
  /** 观战的人：在线、不在这局里、不是说书人/房主。 */
  watcherIds() {
    return [...this.online].filter((id) => !this.game?.get(id) && id !== this.stId && id !== this.hostId);
  }

  /**
   * 告诉合作机器人（旺财）这一局谁能说话：玩家（真人）+ 说书人 + 房主。它把专区语音里其余的人
   * 闭麦、禁打字，开了「观战者能看魔典」时还让他们旁听私聊房。终局 / 暂停 / 解散发 active:false。
   * 内容没变就不重发；对方 6 小时没收到就全部解锁，所以进行中的局 3 小时补发一次。
   */
  async syncGame(force) {
    const square = this.square ?? this.gameSquare;
    if (!square) return;
    const active = force ?? !!(this.game && !this.ended && !this.paused);
    const st = active
      ? { square, active, speakerIds: [...new Set([...this.realIds(), this.stId, this.hostId].filter(Boolean))], god: !!this.settings.spectatorGrimoire, lock: !!this.settings.muteSpectators }
      : { square, active };
    const key = JSON.stringify(st);
    if (key === this.gameSent?.key && (!active || Date.now() - this.gameSent.at < 3 * 3600_000)) return;
    this.gameSent = { key, at: Date.now() };
    this.gameSquare = active ? square : null;
    await this.safeVoice((v) => v.announceGame?.(st));
  }

  /** 观战的人闭麦 / 解除（开局后、有人进出、终局时调用）。只动自己闭上的人。 */
  async syncWatchMute() {
    this.syncGame();
    const want = new Set(this.game && !this.ended && this.square && this.settings.muteSpectators ? this.watcherIds() : []);
    const prev = new Set(this.watchMuted ?? []);
    const unmute = [...prev].filter((id) => !want.has(id));
    const mute = [...want].filter((id) => !prev.has(id));
    this.watchMuted = [...want];
    if (unmute.length) await this.safeVoice((v) => v.setMuted?.(unmute, false, 'watch'));
    if (mute.length) await this.safeVoice((v) => v.setMuted?.(mute, true, 'watch'));
  }

  async speakOnly(who) {
    const prev = this.speechMuted ?? new Set();
    // 只在真人发言时闭其他人：机器人不会在语音里说话，闭了也只是让大家干等
    const next = new Set(who && !this.isFake(who) && this.settings.speechMute && this.square ? this.realIds().filter((id) => id !== who) : []);
    const unmute = [...prev].filter((id) => !next.has(id));
    const mute = [...next].filter((id) => !prev.has(id));
    this.speechMuted = next;
    if (!this.square) return;
    if (unmute.length) await this.safeVoice((v) => v.setMuted?.(unmute, false, 'speech'));
    if (mute.length) await this.safeVoice((v) => v.setMuted?.(mute, true, 'speech'));
  }

  nomDone(uid) {
    const nom = this.pendingNom;
    if (!nom?.stage) throw new UserError('现在没有人在发言');
    const speaker = nom.stage === 'accuse' ? nom.nominator : nom.nominee;
    if (uid !== speaker && !this.isHost(uid)) throw new UserError('现在不是你发言');
    if (nom.stage === 'accuse') this.nomStage('defend'); else this.openVote();
  }

  skipNom(uid) {
    const g = this.requireGame();
    if (!this.noms) throw new UserError('现在不在提名环节');
    if (!g.get(uid)?.alive) throw new UserError('只有活着的玩家能提名');
    this.noms.skips.add(uid);
    if (this.nomsDone() && !this.pendingNom && !this.vote) this.later(this.settings.pauseMs / 2, () => this.autoDusk());
  }

  /** 所有活着的人都提名过或者表示不提名了。 */
  nomsDone() {
    const g = this.game;
    // 只算看起来活着的人：假死的僵怖按官方算死人，不能提名，也看不到「不提名」（以前算上他，计数永远差一个）
    return !!this.noms && g.alive().filter((p) => g.visAlive(p)).every((p) => g.nominators.has(p.id) || this.noms.skips.has(p.id));
  }

  /** 一轮投票结束后：该入夜就入夜，否则继续等提名。 */
  afterVote() {
    if (this.stId || !this.noms) return;
    if (this.bishopQueue) { // 主教：说书人一个接一个提名，提完就入夜
      if (this.bishopQueue.length && !this.game.executedToday) this.later(this.settings.pauseMs, () => this.bishopNext());
      else { this.bishopQueue = null; this.later(this.settings.pauseMs, () => this.autoDusk()); }
      return;
    }
    if (this.noms.timeUp || this.nomsDone() || this.game.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
    else { this.resumeNoms(); this.botsConsider(); }
  }

  async autoDusk() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended || this.vote || this.stId || this.riotStep) return;
    await this.dusk(); // 暴乱第三天没人提名时，dusk 会让说书人先提名
  }

  // ───────────── 裁缝与暴乱：提名链（旧版暴乱 v1）─────────────
  /** 有人因提名而死：公布，分出胜负就结束，否则轮到他接着提名。 */
  riotAfter(what, target) {
    const g = this.game;
    this.clearRiot();
    this.pub(`${what}——**${g.name(target)} 当场死亡！**`, 'death');
    if (g.winner) { this.later(0, () => this.endGame()); return; }
    this.pauseNoms();
    this.riotNext(target);
    this.changed();
  }

  /** 第三天没有人提名：说书人提名一名存活玩家，他死亡并接着提名。 */
  riotStoryteller() {
    const g = this.game;
    const t = g.riotPick(null);
    if (!t) return;
    g.riotStoryteller(t.id);
    this.riotAfter('第三天没有人提名，**说书人**提名了 **' + g.name(t.id) + '**', t.id);
  }

  /** 轮到 id 接着提名：倒计时；第一、二天不提名今天就结束，第三天时间到说书人替他提名。 */
  riotNext(id) {
    const g = this.game;
    const must = g.day >= 3;
    const secs = this.isFake(id) ? Math.min(3, this.settings.riotSeconds) : this.settings.riotSeconds;
    const step = this.riotStep = { id, until: Date.now() + secs * 1000, must };
    this.announce(`**${g.name(id)}** ${must ? '必须立刻提名下一个人（第三天）' : '可以立刻提名下一个人；不提名，今天的提名就结束'}。`, 'vote');
    this.riotTimer = this.later(secs * 1000, () => { if (this.riotStep === step) this.riotTimeout(); });
    if (this.isFake(id)) this.later(Math.min(secs * 500, 1500 + Math.random() * 1000), () => {
      if (this.riotStep !== step) return;
      const t = this.botRiotPick(id, must);
      try { if (t) this.nominate(id, t); else this.riotPass(id); } catch (e) { console.warn('[botc] 机器人接着提名出错：', e.message); }
    });
  }

  /** 机器人接着提名谁：暴乱挑自己知道不是同伙的人；女裁缝随便挑。前两天有时不接。 */
  botRiotPick(id, must) {
    const g = this.game;
    const me = g.get(id);
    const allies = new Set((g.evilKnown?.[id] ?? []).map((x) => x.id));
    const pool = g.alive().filter((q) => q.id !== id && !g.nominees.has(q.id));
    if (!pool.length) return null;
    const evil = g.evilOf(me);
    if (!must && Math.random() < (evil ? 0.2 : 0.45)) return null;
    const prefer = evil ? pool.filter((q) => !allies.has(q.id)) : pool;
    const list = prefer.length ? prefer : pool;
    return list[Math.floor(Math.random() * list.length)].id;
  }

  riotTimeout() {
    const step = this.riotStep;
    if (!step) return;
    if (!step.must) { this.riotPass(step.id, true); return; }
    const g = this.game;
    const t = g.riotPick(step.id);
    if (!t) return;
    this.announce(`时间到：**说书人**替 **${g.name(step.id)}** 提名。`, 'vote');
    try { this.nominate(step.id, t.id); } catch (e) { console.warn('[botc] 说书人替人提名出错：', e.message); }
  }

  /** 被提名死掉的人不接着提名（只有第一、二天可以）：今天的提名结束，入夜。 */
  riotPass(uid, timeout = false) {
    const step = this.riotStep;
    if (!step || (step.id !== uid && !this.isHost(uid))) throw new UserError('现在不是你接着提名');
    if (step.must) throw new UserError('第三天必须接着提名');
    const g = this.game;
    this.clearRiot();
    g.riotChain = null;
    this.announce(`**${g.name(step.id)}** ${timeout ? '没有在时间内' : '决定不'}接着提名：今天的提名结束。`, 'vote');
    if (this.noms) this.noms.timeUp = true;
    this.later(this.settings.pauseMs, () => this.autoDusk());
    this.changed();
  }

  /** 一句录音存档（recorder.js）。教程不存；saveRecordings 设成 false（测试）也不存。 */
  saveTalk(source, ext, id, audio, text) {
    const g = this.game;
    if (!g || this.tutorial || this.saveRecordings === false) return;
    saveRecording({ guildId: this.guildId, gameId: g.id, id, name: g.get(id)?.name ?? this.users.get(id)?.name ?? id, day: g.day, phase: g.phase, source, audio, ext, text });
  }

  // ───────────── 局势和政客：听大家的发言（2026-11-16 用户要的）─────────────
  /** 有灵言师、将军或政客的剧本：每天给所有活着的真人发收音（谁都收到，所以不暴露谁是什么角色）。 */
  listenAll(g) { return g?.engine === 'snv' && ['mezepheles', 'general', 'politician'].some((r) => inScript(r, g.script)); }
  listenWhy(g) { return ['mezepheles', 'general', 'politician'].filter((r) => inScript(r, g.script)); }
  /** 有将军或政客：今天的转写留到这局结束（只在内存和临时存档里，不进往期对局文件）。每人每天最多 30 句。 */
  keepTalk(g) {
    if (!this.mic || !this.listenAll(g)) return; // 2026-11-19：全员收音的剧本都留着（读场用），以前只留将军、政客的
    const day = {};
    for (const p of g.players) { const lines = this.mic.transcript(p.id); if (lines.length) day[p.id] = lines.slice(-30); }
    if (Object.keys(day).length) (this.talk ??= []).push({ day: g.day, lines: day });
  }
  /** 给 AI 看的发言：按天、按人，太长就从最早的天开始丢。onlyDay：只要那一天的。 */
  talkText(g, onlyDay = null, max = 6000) {
    const days = (this.talk ?? []).filter((t) => onlyDay == null || t.day === onlyDay);
    const blocks = days.map((t) => `第${t.day}天：\n${Object.entries(t.lines).map(([id, ls]) => `${g.name(id)}：${ls.join(' / ')}`).join('\n')}`);
    let out = blocks.join('\n\n');
    while (out.length > max && blocks.length > 1) { blocks.shift(); out = blocks.join('\n\n'); }
    return out.slice(-max);
  }
  /**
   * 黄昏读场（2026-11-19 用户：用全员收音让说书人更懂场面，目标是无神论者局里胜过真人说书人）：
   * 把公开情况和大家说过的话交给 AI，整理出谁报了什么身份、谁被怀疑 / 信任、谁在推「处决说书人」。
   * 只给公开情况，不给任何人的真实身份——要的是「玩家们怎么想」。结果给说书人挑人（假恶魔杀谁、假世界挑谁、配合伪装）
   * 和算局势用；真人说书人在说书台上看得到。没配 AI、今天没人说话就跳过（说书人用提名投票兜底）。
   */
  async readTableNow(g) {
    if (g.engine !== 'snv' || g.winner || !this.listenAll(g)) return;
    const ask = this.tableJudge ?? ((this.judgeReady ?? judgeAvailable)() ? readTable : null);
    if (!ask) return;
    const talk = this.talkText(g, null, 9000);
    if (!talk.trim()) return;
    const raw = await ask(g.publicFacts(), talk, rolesOf(g.script).map((r) => ROLES[r].name)).catch((e) => { console.warn('[botc] 读场失败：', e.message); return null; });
    if (!raw || this.game !== g) return;
    const t = parseTable(raw, g, g.day);
    this.tableRead = t;
    const text = describeTable(t, g);
    this.stNote(`读场（第${g.day}天黄昏）：${text}`);
    g.st.note(`黄昏读场：${describeTable(t, g, { summary: false })}`);
  }

  /** 黄昏：有将军的剧本问 AI 现在谁在赢（今晚将军听它的，说书人的骰子一半看它）。没配 AI 就跳过。 */
  async judgeLeadNow(g) {
    if (g.engine !== 'snv' || g.winner || !inScript('general', g.script)) return;
    const ask = this.leadJudge ?? (judgeAvailable() ? judgeLead : null);
    if (!ask) return;
    const r = await ask(g.factsSNV(), this.talkText(g, g.day)).catch(() => null);
    if (!r || this.game !== g) return;
    g.aiLead = { day: g.day, side: r.side, reason: r.reason };
    this.stNote(`AI 说书人看今天的局势：${{ good: '善良领先', evil: '邪恶领先', neither: '两边都没领先' }[r.side]}（${r.reason}）`);
    g.st.note(`黄昏判局势：${{ good: '善良领先', evil: '邪恶领先', neither: '两边都没领先' }[r.side]}——${r.reason}`, g.st.balance());
  }
  /** 终局：输的一方有政客，问 AI 谁对落败负最大责任，和打分的结果不一样就改判。没配 AI 就照打分。 */
  async judgePoliticianNow(g) {
    const ev = (g.politicianEval ?? []);
    if (g.engine !== 'snv' || !ev.length) return;
    const ask = this.politicianJudge ?? (judgeAvailable() ? judgeResponsible : null);
    if (!ask) return;
    for (const e of ev) {
      const losers = g.players.filter((q) => (q.id === e.id ? true : g.evilOf(q) === e.lost));
      const r = await ask(g.factsSNV(), this.talkText(g), losers.map((q) => ({ seat: q.seat, name: q.name }))).catch(() => null);
      if (!r || this.game !== g) continue;
      const pick = losers.find((q) => q.seat === r.seat);
      if (!pick) { if (r.seat === 0) g.politicianVerdict(e.id, false, r.reason); continue; } // 0：集体的决定，没有突出的责任人（政客页范例二）
      if (g.politicianVerdict(e.id, pick.id === e.id, r.reason) && pick.id === e.id) this.announce(`**${g.name(e.id)}** 是政客：说书人判他对本方落败负最大责任，他转变阵营，和赢的一方一起获胜。`, 'end');
    }
  }

  // ───────────── 旅行者（2026-11-16 用户要的）─────────────
  /** 能当旅行者的剧本：血染的三套引擎（狼人杀、阿瓦隆、暗印不行）。 */
  travellersOk(g) { return !!g && ['tb', 'bmr', 'snv'].includes(g.engine) && !this.tutorial && travellerList(g.script).length > 0; } // 剧本没有推荐的旅行者就不开

  /** 开局后进来的人以旅行者身份加入。阵营由说书人定：大多善良（官方），善良领先时多给邪恶。 */
  joinTraveller(uid, role) {
    const g = this.requireGame();
    if (this.ended || !this.travellersOk(g)) throw new UserError('这一局不能加入旅行者');
    if (g.townAlive() < 7) throw new UserError('存活的玩家不到 7 人，说书人不再加入旅行者（官方建议）');
    if (this.resolving) throw new UserError('说书人正在结算夜晚，稍等几秒再加入');
    if (uid === this.stId) throw new UserError('说书人不能当旅行者');
    if (g.players.length >= 20) throw new UserError('人已经太多了（最多 20 人）');
    const user = this.users.get(uid);
    if (!user) throw new UserError('先进房间');
    if (!travellerList(g.script).includes(role)) throw new UserError('这个剧本不用这个旅行者');
    const evilNow = g.players.filter((q) => q.traveller && !q.left && g.evilOf(q)).length;
    const evil = g.st.roll('travellerEvil', { evilTravellers: evilNow }, { who: uid });
    let msg;
    try { msg = g.addTraveller({ id: uid, name: user.name }, role, evil); } catch (e) { throw new UserError(e.message); }
    this.tell(uid, msg, 'clock');
    this.pub(`**${g.name(uid)}** 以旅行者身份加入了：**${ROLES[role].name}**——${ROLES[role].ability}`, 'day');
    if (role === 'gnome') { const a = g.gnomePickAmigo(g.get(uid)); if (a) this.pub(`说书人宣布：侏儒的同伴是 **${g.name(a.id)}**（和侏儒同一阵营）。`, 'day'); }
    this.syncWatchMute?.();
  }

  leaveTraveller(uid) {
    const g = this.requireGame();
    if (this.exile?.target === uid) throw new UserError('正在对你流放举手，等结果出来');
    try { g.removeTraveller(uid); } catch (e) { throw new UserError(e.message); }
    this.pub(`旅行者 **${g.name(uid)}** 离开了这局。`, 'day');
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 提议流放一名活着的旅行者：任何人（死人也行）都可以提，每名旅行者每天只能被提一次。然后全体举手。 */
  proposeExile(uid, target) {
    const g = this.requireGame();
    const p = g.get(uid); const t = g.get(target);
    if (g.phase !== 'day' || this.ended || this.dusking || this.duskDay === g.day) throw new UserError('只能在白天提议流放');
    if (!p || p.left) throw new UserError('只有这局的玩家能提议流放');
    if (!t?.traveller || !t.alive) throw new UserError('只能流放活着的旅行者');
    if (uid === target) throw new UserError('不能提议流放自己（想走可以直接离开）');
    if (this.exile || this.vote || this.pendingNom || this.riotStep || this.rps) throw new UserError('等这一轮结束再提');
    this.exiled ??= {};
    if (this.exiled[`${g.day}:${target}`]) throw new UserError(`今天已经有人提议流放过 ${g.name(target)} 了`);
    this.exiled[`${g.day}:${target}`] = true;
    this.pauseNoms();
    const secs = this.settings.exileSeconds;
    const ex = this.exile = { target, by: uid, until: Date.now() + secs * 1000, yes: new Set() };
    // 机器人：善良的机器人多半支持流放邪恶旅行者；随机一点
    for (const q of g.players) if (this.isFake(q.id) && !q.left && q.id !== target && Math.random() < (g.evilOf(q) === g.evilOf(t) ? 0.2 : 0.55)) ex.yes.add(q.id);
    if (!this.isFake(uid)) ex.yes.add(uid); // 提议的人自己当然支持
    this.pub(`**${g.name(uid)}** 提议流放旅行者 **${g.name(target)}**。所有人（死人也算，不消耗投票标记）举手表态，${secs} 秒。`, 'vote');
    ex.timer = this.later(secs * 1000, () => this.finishExile(ex));
  }

  /** 怪咖：觉得他今天表现得很有趣（流放举手期间，一半的人点了就不能流放他）。 */
  laugh(uid, up) {
    const ex = this.exile; const g = this.requireGame();
    if (!ex || g.get(ex.target)?.role !== 'deviant') throw new UserError('现在没有在流放怪咖');
    const p = g.get(uid);
    if (!p || p.left) throw new UserError('你不是这局的玩家');
    ex.laughs ??= new Set();
    if (up) ex.laughs.add(uid); else ex.laughs.delete(uid);
  }

  exileHand(uid, up) {
    const ex = this.exile; const g = this.requireGame();
    const p = g.get(uid);
    if (!ex) throw new UserError('现在没有在流放举手');
    if (!p || p.left) throw new UserError('你不是这局的玩家');
    if (up) ex.yes.add(uid); else ex.yes.delete(uid);
  }

  finishExile(ex) {
    const g = this.game;
    if (this.exile !== ex || !g) return;
    this.exile = null;
    this.cancel(ex.timer);
    const all = g.players.filter((q) => !q.left);
    const need = Math.ceil(all.length / 2); // 官方：所有玩家的一半，不是存活玩家
    const yes = [...ex.yes].filter((id) => g.get(id) && !g.get(id).left);
    let pass = yes.length >= need;
    const t = g.get(ex.target);
    const funny = t?.role === 'deviant' && g.travellerOn(t) && ex.laughs?.size >= need; // 怪咖：说书人看大家笑没笑（一半的人点了「他很有趣」）
    (this.voteHistory ??= []).push({ day: g.day, nominator: ex.by, nominee: ex.target, voters: yes, count: yes.length, threshold: need, outcome: pass ? 'exile' : 'fail', exile: true, at: Date.now() });
    this.pub(`流放 **${g.name(ex.target)}**：${yes.length} 人支持（需要 ${need}，所有玩家的一半）→ ${pass ? `**${g.name(ex.target)} 被流放了。**` : '没有通过。'}${yes.length ? `支持：${yes.map((id) => g.name(id)).join('、')}` : ''}`, pass ? 'death' : 'vote');
    if (pass && funny) { pass = false; this.pub(`说书人宣布：**${g.name(ex.target)}** 今天表现得很有趣——**不能被流放**。`, 'day'); }
    if (pass) g.exileTraveller(ex.target);
    if (g.winner) { this.later(0, () => this.endGame()); return; }
    this.resumeNoms();
    this.changed();
  }

  /** 枪手：今天第一次投票统计后，打死一名今天投过票的人。 */
  gunslinger(uid, target) {
    const g = this.requireGame();
    if (this.vote) throw new UserError('等这轮投票结束');
    const first = (this.voteHistory ?? []).find((v) => v.day === g.day && !v.exile); // 官方：当天第一次处决投票（流放不算）
    const voters = first?.voters ?? [];
    let r;
    try { r = g.gunslinger(uid, target, voters); } catch (e) { throw new UserError(e.message); }
    this.pub(`枪手 **${g.name(uid)}** 向 **${g.name(target)}** 开了一枪——${r.died ? `**${g.name(target)} 死了！**` : '什么都没有发生。'}`, r.died ? 'death' : 'vote');
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 法官：别人发起的这次提名，强制处决成功或失败（每局一次）。在陈述、辩护或投票中都能用。 */
  /** 女舍监在场（官方：玩家只能在座位上和相邻的玩家耳语）：屋里只要有一个人不是他的左右邻座，就不能进去私聊。 */
  matronBlocks(uid, st) {
    const g = this.game;
    if (!g?.matronOn?.() || !st) return false;
    const seated = g.players.filter((q) => !q.left);
    const i = seated.findIndex((q) => q.id === uid);
    if (i < 0) return false;
    const n = seated.length;
    const near = new Set([seated[(i + 1) % n].id, seated[(i - 1 + n) % n].id]);
    return [...st.ids].some((id) => id !== uid && !near.has(id));
  }

  /** 女舍监：一次宣布至多三对玩家交换座位（公开）。 */
  matron(uid, pairs) {
    const g = this.requireGame();
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名/投票结束');
    try { g.matronSwap(uid, pairs); } catch (e) { throw new UserError(e.message); }
    this.pub(`女舍监 **${g.name(uid)}** 让 ${pairs.map(([a, b]) => `**${g.name(a)}** 和 **${g.name(b)}**`).join('、')} 交换座位。`, 'day');
  }

  /** 侏儒：同伴正被提名（陈述、辩护时），侏儒公开杀死提名者；辩护和投票照常继续。 */
  gnome(uid) {
    const g = this.requireGame();
    const nom = this.pendingNom;
    const me = g.get(uid);
    if (!nom || !me?.gnomeAmigo || nom.nominee !== me.gnomeAmigo) throw new UserError('只有你的同伴正被提名时才能用');
    if (nom.gnomed) throw new UserError('这次提名你已经用过了');
    nom.gnomed = true;
    let killed;
    try { killed = g.gnomeKill(uid, nom.nominator); } catch (e) { throw new UserError(e.message); }
    this.pub(`侏儒 **${g.name(uid)}** 出手了——${killed ? `**${g.name(nom.nominator)} 死了！** 辩护和投票照常进行。` : '什么都没有发生。'}`, killed ? 'death' : 'vote');
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 主教（官方）：只有说书人提名；每天至少提名一名和主教阵营相反的玩家，通常 3–5 人；主教善良时多提名邪恶，邪恶时尽量少提名邪恶；最后几人时全部提名。 */
  bishopDay() {
    const g = this.game;
    const b = g.travellerOf('bishop');
    const pool = g.alive().filter((p) => !p.traveller && !g.nominees.has(p.id));
    const opp = pool.filter((p) => g.evilOf(p) !== g.evilOf(b));
    let list;
    if (g.townAlive() <= 4) list = [...pool];
    else {
      const n = Math.min(pool.length, 3 + Math.floor(Math.random() * 3));
      const first = opp[Math.floor(Math.random() * opp.length)];
      const rest = pool.filter((p) => p !== first).map((p) => ({ p, w: Math.random() * (g.evilOf(p) === !g.evilOf(b) ? 1.6 : g.evilOf(b) && g.evilOf(p) ? 0.4 : 1) }))
        .sort((x, y) => y.w - x.w).map((x) => x.p);
      list = [first, ...rest].filter(Boolean).slice(0, n);
    }
    list.sort(() => Math.random() - 0.5);
    this.noms = { until: 0, paused: null, timeUp: false, skips: new Set(), bishop: true };
    this.bishopQueue = list.map((p) => p.id);
    this.announce(`主教在场：今天只有说书人提名，一共会提名 ${list.length} 人。`, 'vote');
    this.bishopNext();
  }

  bishopNext() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended || !this.bishopQueue) return;
    const id = this.bishopQueue.shift();
    if (!id) { this.bishopQueue = null; this.autoDusk(); return; }
    if (!g.get(id)?.alive) { this.bishopNext(); return; }
    g.nominees.add(id);
    (g.nomBy ??= {})[id] = 'storyteller';
    g.record('nominate', `说书人（主教）提名了 ${g.tag(id)}`);
    this.announce(`**说书人**提名了 **${g.name(id)}**`, 'vote');
    this.pendingNom = { nominator: 'storyteller', nominee: id };
    this.nomStage('defend');
  }

  /** 屠夫（官方）：当天首次处决之后可以再提名一次；第二次处决要存活玩家一半的票，不用超过之前的票数。 */
  async butcherRound(g) {
    const b = g.butcherReady();
    g.butcherDay = g.day;
    const secs = this.settings.exileSeconds;
    const step = this.butcher = { by: b.id, stage: 'pick', target: null, until: Date.now() + secs * 1000, yes: new Set() };
    this.announce(`屠夫 **${g.name(b.id)}** 可以再提名一个人处决（${secs} 秒内）。`, 'vote');
    if (this.isFake(b.id)) this.later(1500, () => {
      if (this.butcher !== step || Math.random() < 0.4) return;
      const opts = g.alive().filter((q) => !q.traveller && q.id !== b.id);
      const t = opts[Math.floor(Math.random() * opts.length)];
      if (t) try { this.butcherNominate(b.id, t.id); } catch { /* 选不了就算了 */ }
    });
    await new Promise((res) => { step.done = res; step.timer = this.later(secs * 1000, () => this.butcherFinish(step)); });
    this.butcher = null;
  }

  butcherNominate(uid, target) {
    const g = this.requireGame(); const st = this.butcher;
    if (!st || st.stage !== 'pick' || st.by !== uid) throw new UserError('现在不是你（屠夫）提名的时候');
    const t = g.get(target);
    if (!t || t.left || t.traveller) throw new UserError('只能提名这局的非旅行者玩家');
    st.stage = 'vote'; st.target = target;
    this.cancel(st.timer);
    const secs = this.settings.exileSeconds;
    st.until = Date.now() + secs * 1000;
    for (const q of g.players) if (this.isFake(q.id) && g.canVote(q.id) && q.id !== target && Math.random() < (g.evilOf(q) === g.evilOf(t) ? 0.15 : 0.5)) st.yes.add(q.id);
    this.announce(`屠夫 **${g.name(uid)}** 提名了 **${g.name(target)}**。举手赞成处决（${secs} 秒，需要存活玩家的一半）。`, 'vote');
    st.timer = this.later(secs * 1000, () => this.butcherFinish(st));
  }

  butcherHand(uid, up) {
    const g = this.requireGame(); const st = this.butcher;
    if (!st || st.stage !== 'vote') throw new UserError('现在没有屠夫的投票');
    if (up && !g.canVote(uid)) throw new UserError('你不能投票');
    if (up) st.yes.add(uid); else st.yes.delete(uid);
  }

  butcherFinish(st) {
    const g = this.game;
    if (this.butcher !== st || !g) return;
    this.cancel(st.timer);
    if (st.stage === 'vote') {
      const voters = [...st.yes].filter((id) => g.canVote(id));
      for (const id of voters) { const p = g.get(id); if (!g.visAlive(p)) p.ghostVote = false; g.beggarVoted?.(id); }
      const count = voters.reduce((a, id) => a + (g.voteWeight?.(id) ?? 1), 0);
      const need = g.threshold();
      const pass = count >= need;
      (this.voteHistory ??= []).push({ day: g.day, nominator: st.by, nominee: st.target, voters, count, threshold: need, outcome: pass ? 'butcher' : 'fail', at: Date.now() });
      this.announce(`屠夫的提名：**${g.name(st.target)}** ${count} 票（需 ${need}）→ ${pass ? '处决' : '没有通过'}`, pass ? 'death' : 'vote');
      if (pass) {
        const r = g.butcherExecute(st.target);
        this.announce(r === 'saved' ? `**${g.name(st.target)}** 被处决了——但依然活着。` : `**${g.name(st.target)}** 被处决了。`, 'death');
      }
    } else this.announce('屠夫没有再提名。', 'vote');
    st.done?.();
  }

  /** 语音状态变了：稍等一下（一次闭一群人会连着来好几条）再查一遍谁被闭麦。 */
  micChanged() {
    if (this.micTimer) return;
    this.micTimer = setTimeout(() => { this.micTimer = null; this.refreshMics().catch(() => {}); }, 300);
    this.micTimer.unref?.();
  }

  /** 查一遍这局真人的麦克风状态，有变化就推给大家（头像右上角的闭麦标记）。 */
  async refreshMics() {
    if (!this.voice?.micStates) return;
    const ids = [...new Set([...(this.game?.players ?? []).map((p) => p.id), ...this.lobby.map((p) => p.id), this.stId, this.hostId].filter((id) => id && !this.isFake(id)))];
    const st = await this.voice.micStates(ids);
    const next = Object.fromEntries(Object.entries(st).filter(([, v]) => v));
    if (JSON.stringify(next) === JSON.stringify(this.mics ?? {})) return;
    this.mics = next;
    this.changed();
  }

  /** 乞丐：死人把自己的投票标记交给乞丐（公开），乞丐私下得知他的阵营。 */
  giveBeggar(uid) {
    const g = this.requireGame();
    if (g.phase !== 'day') throw new UserError('只能在白天把投票标记交给乞丐');
    if (this.vote) throw new UserError('等这轮投票结束');
    let r;
    try { r = g.giveBeggar(uid); } catch (e) { throw new UserError(e.message); }
    this.pub(`**${g.name(uid)}** 把自己的投票标记交给了乞丐 **${g.name(r.beggar.id)}**。`, 'vote');
    this.tell(r.beggar.id, `${g.name(uid)} 把投票标记给了你：他是**${r.evil ? '邪恶' : '善良'}**阵营。你现在有 ${r.beggar.beggarTokens} 个投票标记。`, 'clock');
  }

  /** 法官能管的那次提名：正在陈述 / 投票的，或者刚统计完、还没有下一次提名的（官方：到下一名玩家被提名之前都能宣布）。 */
  judgeTarget() {
    const g = this.game;
    if (this.vote) return { nom: this.vote, live: true };
    if (this.pendingNom) return { nom: this.pendingNom, live: true };
    const last = this.lastVote;
    if (last && last.day === g?.day && !last.judged && !this.dusking && this.duskDay !== g.day) return { nom: last, live: false };
    return null;
  }

  judge(uid, pass) {
    const g = this.requireGame();
    const t = this.judgeTarget();
    if (!t) throw new UserError('现在没有可以裁决的提名');
    const { nom } = t;
    let on;
    try { on = g.judgeUse(uid, nom.nominator, pass); } catch (e) { throw new UserError(e.message); }
    this.pub(`法官 **${g.name(uid)}** 宣布：对 **${g.name(nom.nominee)}** 的这次处决强制**${pass ? '成功' : '失败'}**。`, 'vote');
    if (!on) return; // 中毒醉酒：照样宣布、照样用掉，只是没效果
    if (t.live) { nom.force = pass ? 'pass' : 'fail'; return; }
    // 已经统计完：强制成功就直接处决、白天结束；强制失败就把他从台上拿下来（这次算 0 票）
    nom.judged = true;
    if (pass) this.judgeExecute(nom.nominee);
    else if (g.block === nom.nominee || (g.blockTied ?? []).includes(nom.nominee)) {
      Object.assign(g, { block: nom.before.block, blockVotes: nom.before.votes, blockTied: nom.before.tied ?? [] });
      this.announce(`${g.name(nom.nominee)} 这次算 0 票，${g.block ? `台上还是 ${g.name(g.block)}` : '台上空了'}。`, 'vote');
    }
  }

  /** 法官强制成功：不管票数和台上是谁，这个人被处决，白天直接结束（官方法官页）。 */
  judgeExecute(id) {
    const g = this.game;
    Object.assign(g, { block: id, blockVotes: Math.max(g.blockVotes ?? 0, 1), blockTied: [] });
    this.judgeDay = g.day;
    this.announce(`法官强制成功：**${g.name(id)}** 被处决，今天的提名到此结束。`, 'death');
    if (this.stId) return; // 真人说书：请说书人点「结束白天」
    this.pauseNoms?.();
    this.later(this.settings.pauseMs, () => this.autoDusk());
  }

  // ───────────── 金币：惩罚聊场外 ─────────────
  /** 花金币朝某人扔东西（烂番茄、乌鸦、毒舌笼头），叠在他头上直到这局结束。只买面子，不影响结算。 */
  pelt(uid, target, item) {
    const g = this.requireGame();
    if (!PELT_ON) throw new UserError('惩罚场外暂时下架了');
    if (!this.wallet) throw new UserError('这里没有开金币');
    const it = PELT_ITEMS[item];
    if (!it) throw new UserError('没有这个东西');
    if (this.ended || g.phase !== 'day') throw new UserError('只能在白天扔');
    if (!g.get?.(uid) || this.isFake(uid)) throw new UserError('只有这局的玩家能扔');
    if (!g.get(target)) throw new UserError('要扔给这局的一名玩家');
    if (target === uid) throw new UserError('不能扔自己');
    this.pelts ??= {}; this.pelted ??= {};
    const key = `${g.day}:${uid}`;
    if ((this.pelts[key] ?? 0) >= PELT_PER_DAY) throw new UserError(`每天最多扔 ${PELT_PER_DAY} 次`);
    try { this.wallet.spendCoins(uid, it.cost, `${it.name} → ${g.name(target)}`); } catch (e) { throw new UserError(e.message); }
    this.pelts[key] = (this.pelts[key] ?? 0) + 1;
    (this.pelted[target] ??= []).push({ item, by: uid });
    // 全场都看得到的动画：最近几秒扔的东西发给所有客户端，从扔的人飞到被扔的人头上（2026-11-18 用户）
    const now = Date.now();
    this.peltFx = [...(this.peltFx ?? []).filter((f) => now - f.at < 6000), { id: `${now}-${uid}`, item, by: uid, target, at: now }];
    this.pub(it.praise ? `**${g.name(uid)}** ${it.verb}给 **${g.name(target)}**。` : `**${g.name(uid)}** 嫌 **${g.name(target)}** 聊场外，${it.verb}。`, 'vote');
  }

  // ───────────── 赛后 MVP 投票（2026-11-18 用户）─────────────
  /** 游戏结束：这局的真人每人投一票选 MVP（不能投自己），90 秒或者都投完就公布。 */
  openMvp(g) {
    const voters = (g.players ?? []).filter((p) => !this.isFake(p.id) && !p.left).map((p) => p.id);
    if (voters.length < 2 || this.tutorial) { this.mvp = null; return; }
    const m = this.mvp = { voters, votes: new Map(), until: Date.now() + 90_000, result: null };
    m.timer = this.later(90_000, () => this.finishMvp(m));
    this.announce('游戏结束了：给这局表现最好的人投一票吧（**MVP**，不能投自己），90 秒后公布。', 'end');
  }

  voteMvp(uid, target) {
    const m = this.mvp; const g = this.game;
    if (!m || m.result) throw new UserError('现在没有 MVP 投票');
    if (!m.voters.includes(uid)) throw new UserError('只有这局的玩家能投');
    if (!g?.players?.some((p) => p.id === target)) throw new UserError('要投给这局的一名玩家');
    if (target === uid) throw new UserError('不能投自己');
    m.votes.set(uid, target);
    if (m.voters.every((id) => m.votes.has(id))) this.finishMvp(m);
  }

  finishMvp(m) {
    if (this.mvp !== m || m.result) return;
    this.cancel(m.timer);
    const g = this.game;
    const count = {};
    for (const t of m.votes.values()) count[t] = (count[t] ?? 0) + 1;
    const top = Math.max(0, ...Object.values(count));
    const ids = top ? Object.keys(count).filter((id) => count[id] === top) : [];
    m.result = { ids, votes: top, count };
    const nm = (id) => g?.name?.(id) ?? id;
    this.announce(ids.length ? `🏆 本局 MVP：${ids.map((id) => `**${nm(id)}**`).join('、')}（${top} 票）` : '本局 MVP：没有人投票。', 'end');
    this.changed();
  }

  // ───────────── 夜半狂欢：精神病患者 ─────────────
  /** 白天提名开始前：精神病患者公开选一名玩家，他死亡。 */
  psycho(uid, target) {
    const g = this.requireGame();
    if (this.noms || this.pendingNom || this.vote || this.dusking || this.duskDay === g.day) throw new UserError('提名已经开始了：精神病患者要在提名开始前动手');
    const r = g.psychoKill(uid, target);
    this.pub(`**${g.name(uid)}** 站出来说自己是**精神病患者**，选择了 **${g.name(target)}**——${r.died ? `**${g.name(target)} 当场死亡！**` : '什么都没有发生。'}`, r.died ? 'death' : 'vote');
    if (g.winner) this.later(0, () => this.endGame());
    this.changed();
  }

  /** 精神病患者要被处决：和提名他的人猜拳（自己提名自己就和说书人猜），只有他输了才死。 */
  async psychoRps(g) {
    const id = g.block;
    if (!id || id === 'storyteller' || g.executedToday || g.pardonDay === g.day) return;
    const p = g.get(id);
    if (!p?.alive || g.abilityOf?.(p) !== 'psychopath' || g.snvBroken(p)) return;
    const by = g.nomBy?.[id];
    const opp = by && by !== id && g.get(by) ? by : 'storyteller';
    const HANDS = ['rock', 'paper', 'scissors'];
    const r = this.rps = { a: id, b: opp, picks: {}, until: Date.now() + this.settings.rpsSeconds * 1000 };
    this.announce(`**${g.name(id)}** 要被处决——他是**精神病患者**：要和 **${g.name(opp)}** 猜拳，只有他输了才会死。`, 'vote');
    for (const x of [id, opp]) if (x === 'storyteller' || this.isFake(x)) r.picks[x] = HANDS[Math.floor(Math.random() * 3)];
    this.changed();
    if (!(r.picks[id] && r.picks[opp])) await new Promise((ok) => { r.done = ok; r.timer = this.later(this.settings.rpsSeconds * 1000, ok); });
    this.cancel(r.timer);
    for (const x of [id, opp]) r.picks[x] ??= HANDS[Math.floor(Math.random() * 3)];
    this.rps = null;
    const NAME = { rock: '石头', paper: '布', scissors: '剪刀' };
    const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const ha = r.picks[id]; const hb = r.picks[opp];
    const out = ha === hb ? '平局' : BEATS[ha] === hb ? `${g.name(id)} 赢了` : `${g.name(id)} 输了`;
    g.record('st', `精神病患者猜拳：${g.name(id)} 出${NAME[ha]}，${g.name(opp)} 出${NAME[hb]} → ${out}`);
    this.announce(`猜拳：**${g.name(id)}** 出${NAME[ha]}，**${g.name(opp)}** 出${NAME[hb]}——${out}${BEATS[hb] === ha ? '，他会被处决而死。' : '，他被处决但活了下来。'}`, 'vote');
    if (BEATS[hb] !== ha) g.psychoSpared = id;
  }

  rpsHand(uid, hand) {
    const r = this.rps;
    if (!r || ![r.a, r.b].includes(uid)) throw new UserError('现在不是你猜拳');
    if (!['rock', 'paper', 'scissors'].includes(hand)) throw new UserError('出石头、剪刀或布');
    if (r.picks[uid]) throw new UserError('你已经出过了');
    r.picks[uid] = hand;
    if (r.picks[r.a] && r.picks[r.b]) r.done?.();
    this.changed();
  }

  clearRiot() {
    if (this.riotTimer) this.cancel(this.riotTimer);
    this.riotTimer = null;
    this.riotStep = null;
  }

  /** 机器人夜里选人。教程里按剧本：投毒者毒厨师，小恶魔刀一个不是你的好人。 */
  botChoose(id) {
    const g = this.game;
    const p = g.get(id);
    if (this.tutorial && p) {
      const pr = g.nightPrompts().find((x) => x.playerId === id);
      const pickRole = (role) => g.players.find((q) => q.role === role && q.alive && pr?.options.includes(q.id));
      let t = null;
      if (p.role === 'poisoner') t = pickRole('chef') ?? pickRole('washerwoman');
      if (p.role === 'imp') t = g.players.find((q) => q.alive && this.isFake(q.id) && !['imp', 'poisoner', 'soldier'].includes(q.role) && pr?.options.includes(q.id)); // 不刀真人，也别去刀士兵
      if (t && pr?.count === 1) { g.submitChoice(id, [t.id]); return; }
    }
    // 新手照顾：机器人当恶魔时，前三晚能不刀新手就不刀（让新手多玩一会儿）
    const pr = g.nightPrompts().find((x) => x.playerId === id);
    if (p && ROLES[p.role].team === 'demon' && pr?.count === 1 && !pr.optional && g.night <= 3 && g.newbies?.length) {
      const pool = pr.options.filter((o) => o !== id && !g.newbies.includes(o));
      if (pool.length) { g.submitChoice(id, [pool[Math.floor(Math.random() * pool.length)]]); return; }
    }
    g.autoChoose(id);
  }

  /** 机器人举不举手。教程里好人只给邪恶投票；平时随机。 */
  botVotes(id, v) {
    if (!this.tutorial) return Math.random() < 0.5;
    const g = this.game;
    return isEvilRole(g.get(v.nominee).role) && !isEvilRole(g.get(id).role);
  }

  /** 机器人玩家（测试用）：过几秒决定提名谁，或者不提名了。 */
  botsConsider() {
    if (this.tutorial) { // 教程：机器人都表示不提名，等你提名、投完票就进黄昏
      for (const p of this.game.alive()) if (this.isFake(p.id) && this.game.visAlive(p)) this.noms?.skips.add(p.id);
      return;
    }
    const g = this.game;
    if (g.get(SEAT7)) { this.noms?.skips.add(SEAT7); this.seat7Daily(); } // 7 号空座不提名（发言机会可以拿来提名，这里没做）
    for (const p of g.alive().filter((q) => this.isFake(q.id) && q.id !== SEAT7 && g.visAlive(q) && !g.nominators.has(q.id))) {
      if (this.noms?.skips.has(p.id)) continue;
      this.later(2000 + Math.random() * 5000, () => {
        if (!this.noms || this.noms.timeUp || this.pendingNom || this.vote || this.riotStep || g.phase !== 'day' || g.nominators.has(p.id) || !p.alive) return;
        // 新手照顾：前两天机器人不提名新手
        const targets = g.players.filter((q) => q.id !== p.id && !g.nominees.has(q.id) && !(g.day <= 2 && g.newbies?.includes(q.id)));
        if (targets.length && Math.random() < 0.3) this.nominate(p.id, targets[Math.floor(Math.random() * targets.length)].id);
        else this.skipNom(p.id);
      });
    }
  }

  startVote(uid) {
    const nom = this.pendingNom;
    if (!nom) throw new UserError('没有等待投票的提名');
    if (![nom.nominator, nom.nominee].includes(uid) && !this.isHost(uid)) throw new UserError('只有提名者、被提名者或主持人可以开始投票');
    this.openVote();
  }

  openVote() {
    const nom = this.pendingNom;
    if (!nom) return;
    this.cancel(this.stageTimer);
    this.narrate('voteStart', { b: this.game.name(nom.nominee) });
    this.pendingNom = null;
    this.speakOnly(null);
    this.vote = { nominator: nom.nominator, nominee: nom.nominee, order: this.game.voteOrder(nom.nominee), idx: -1, yes: new Set(), locked: new Set(), result: null, force: nom.force ?? null };
    // 房规：提名的人自动投一票
    if (this.settings.nominatorVotes && this.nominatorAlive(nom.nominator)) this.vote.yes.add(nom.nominator);
    this.deadline = Date.now() + this.settings.voteCountdown * 1000;
    this.later(this.settings.voteCountdown * 1000, () => this.voteTick());
  }

  voteTick() {
    const v = this.vote; const g = this.game;
    if (!v || v.result) return;
    // 指针停在一个人面前的这几秒里他还能举手/放下；指针离开他时才锁定（官方：指针经过时手举着才算）
    if (v.idx >= 0) {
      const prev = v.order[v.idx];
      // 管家的票照算（官方：管家自己遵守"主人举手才能举"，说书人不替他扣票，扣了大家就知道谁是管家）
      v.locked.add(prev);
    }
    v.idx += 1;
    this.deadline = null;
    if (v.idx >= v.order.length) { this.finishVote(); return; }
    const id = v.order[v.idx];
    if (this.isFake(id) && id !== SEAT7 && g.canVote(id) && this.botVotes(id, v)) v.yes.add(id); // 7 号空座不投票（作者 Q&A：可以投，但不建议）
    this.later(this.settings.voteSeconds * 1000, () => this.voteTick());
  }

  finishVote() {
    const v = this.vote; const g = this.game;
    const before = { block: g.block, votes: g.blockVotes, tied: [...(g.blockTied ?? [])] };
    v.before = before; v.day = g.day; // 法官统计完以后还能裁决，要能退回去
    v.result = g.recordVote(v.nominee, [...v.yes].filter((id) => v.locked.has(id)), v.force ?? null); // 法官可能强制成功或失败
    const what = {
      block: `${g.name(v.nominee)} 被送上处决台`,
      tie: `和${before.block ? ` ${g.name(before.block)} ` : '之前的'}${before.votes} 票打平，台上清空，谁都不会被处决`,
      lower: `不如台上 ${before.block ? g.name(before.block) : ''} 的 ${before.votes} 票`,
      fail: `票数不够（存活 ${g.visAliveCount()} 人，需要一半即 ${v.result.threshold} 票）`,
    }[v.result.outcome];
    const hands = v.result.voters.length ? `。举手：${v.result.voters.map((id) => g.name(id)).join('、')}` : '。没有人举手';
    this.announce(`对 **${g.name(v.nominee)}** 的投票：${v.result.count} 票（需 ${v.result.threshold}）→ ${what}${hands}`, 'vote');
    this.narrate('vote', { b: g.name(v.nominee), count: v.result.count, need: v.result.threshold, outcome: v.result.outcome });
    v.endedAt = Date.now();
    (this.voteHistory ??= []).push({
      day: g.day, nominator: v.nominator, nominee: v.nominee, voters: v.result.voters,
      count: v.result.count, threshold: v.result.threshold, outcome: v.result.outcome, at: v.endedAt,
    });
    this.lastVote = v;
    this.vote = null;
    if (v.force === 'pass') { v.judged = true; this.judgeExecute(v.nominee); return; } // 法官强制成功：直接处决，白天结束
    this.afterVote();
  }

  hand(uid, up) {
    const v = this.vote; const g = this.requireGame();
    if (!v) throw new UserError('现在没有在投票');
    if (!g.get(uid)) throw new UserError('你不是这局的玩家');
    if (v.locked.has(uid)) throw new UserError('指针已经过了你，你的票锁定了');
    if (up && !g.canVote(uid)) throw new UserError('你已经死亡并用掉了幽灵票');
    if (up) v.yes.add(uid); else v.yes.delete(uid);
  }

  /** 房规"提名的人自动投一票"只算活人：被女巫咒死的提名者不该被扣掉幽灵票。 */
  nominatorAlive(id) {
    const g = this.game;
    const p = g.get(id);
    return !!p && g.visAlive(p) && g.canVote(id); // 说书人提名（主教）时没有提名者
  }

  async dusk() {
    const g = this.requireGame();
    if (g.phase !== 'day') throw new UserError('现在不是白天');
    if (this.vote) throw new UserError('等这轮投票结束');
    if (this.riotStep?.must) throw new UserError('第三天的提名链还没结束');
    // 暴乱第三天没有人提名：说书人先提名一个人，提名链一直到分出胜负（真人说书点「结束白天」也一样）
    if (g.engine === 'snv' && g.riotOn?.() && g.day >= 3 && !g.winner && !this.riotStep && !this.ended) { this.riotStoryteller(); return undefined; }
    // 只结算一次：房主连点、等大模型判定的几秒里又触发一次，都会让 endDay 跑两遍，第二夜被直接跳过
    if (this.dusking || this.duskDay === g.day) return undefined;
    this.dusking = true;
    try { return await this.settleDusk(g); } finally { this.dusking = false; }
  }

  async settleDusk(g) {
    await this.endRoam();
    if (this.game !== g) return undefined; // 等的时候房主结束了这局：别往下一局里写东西
    this.pendingNom = null;
    this.clearRiot();
    if (this.exile) { this.cancel(this.exile.timer); this.exile = null; }
    this.clearNoms();
    await this.judgeMadness();
    if (this.game !== g) return undefined;
    this.keepTalk(g); // 全员收音的剧本：今天的发言留到这局结束（读场、判局势、判政客用）
    this.mic?.listen([]); // 判完了：收音令牌作废，文字清掉
    await this.readTableNow(g);
    if (this.game !== g) return undefined;
    await this.judgeLeadNow(g);
    if (this.game !== g) return undefined;
    if (g.winner) return this.endGame();
    await this.psychoRps(g);
    if (this.game !== g) return undefined;
    const already = g.executedToday;
    const { executed, result, harpyDead } = g.endDay();
    this.duskDay = g.day; // 读档时：今天黄昏已经结算过，直接入夜
    const gone = executed ?? (already ? g.lastExecuted : null); // 已经处决过：贞洁者、疯狂
    this.moonchildFakes = new Set(this.canFakeMoonchild(gone) ? [gone] : []);
    if (executed && result === 'saved') this.announce(`黄昏。**${g.name(executed)}** 被处决了——但依然活着。`, 'death');
    else if (executed) this.announce(`黄昏。**${g.name(executed)}** 被处决了。`, 'death');
    else this.announce(already ? '黄昏。今天的处决已经发生过了。' : '黄昏。今天没有人被处决。', 'night', true);
    if (!already || executed) (this.execLog ??= []).push({ day: g.day, id: executed ?? null, saved: result === 'saved' });
    for (const id of harpyDead ?? []) this.pub(`**${g.name(id)}** 突然倒地身亡。`, 'death'); // 鹰身女妖：疯狂没做到
    if (g.boom) { await this.boomCountdown(g); if (this.game !== g) return undefined; }
    if (executed && !g.winner && g.butcherReady?.()) { await this.butcherRound(g); if (this.game !== g) return undefined; }
    this.madAtNight();
    this.moonchildNotice();
    this.klutzNotice();
    if (executed && result !== 'saved') this.narrate('execution', { name: g.name(executed) });
    else if (!executed) this.narrate('noExecution', { already });
    if (g.winner) return this.endGame();
    if (executed && !g.get(executed)?.alive) this.ragDied([executed]);
    this.nightAfterDusk();
  }

  /** 这个刚死的真人能不能假装月之子 / 呆瓜（真的那个不算）。 */
  canFakeMoonchild(id) {
    const g = this.game;
    return (g.engine === 'bmr' || (g.engine === 'snv' && (inScript('klutz', g.script) || inScript('moonchild', g.script)))) && !!id && !g.get(id)?.alive && !this.isFake(id) && id !== g.pendingMoonchild && id !== g.pendingKlutz && !g.klutzQueue?.includes(id);
  }

  /** 今天的处决已经占了：白天判定不够疯狂的人在入夜时处决。官方夜里也能处决，当场公布，不占明天的处决。 */
  madAtNight() {
    const g = this.game;
    for (const { id, why } of g.madNight?.splice(0) ?? []) {
      if (g.winner || g.st.evilWinsBy(g.get(id)) || !g.madExecute(id, why, { night: true })) continue; // 会让邪恶当场获胜就放过（官方） // 记下以后人数又变了，要再看一次
      this.pub(`夜幕降临。**${g.name(id)}** 没有疯狂地证明自己，也被处决了。`, 'death');
      if (this.canFakeMoonchild(id)) this.moonchildFakes.add(id);
    }
  }

  /**
   * 黄昏结算完入夜。有人被处决就先留一段遗言时间：真月之子 / 呆瓜要在这时选人（入夜就来不及了）；
   * 别的真人也有一样的时间和按钮，可以假装（规则允许，无事发生）。不然等待、倒计时、"公开选择"的记录都会实锤他的身份。
   */
  nightAfterDusk() {
    const g = this.game;
    if (this.ragCur || this.ragQ?.length) { this.ragThen = () => this.nightAfterDusk(); return; } // 诸神黄昏：等死掉的人开完枪再入夜
    if (!g.pendingMoonchild && !g.pendingKlutz && !this.moonchildFakes?.size) { this.later(this.settings.pauseMs, () => this.beginNight()); return; }
    const ms = this.moonchildWaitMs ?? MOONCHILD_WAIT_MS;
    this.moonchildDue = Date.now() + ms;
    this.cancel(this.moonchildTimer);
    this.moonchildTimer = this.later(ms, () => {
      this.moonchildFakes?.clear();
      do { // 两个呆瓜同时死：一个一个替他们选
        const id = g.pendingMoonchild ?? g.pendingKlutz;
        const opts = g.players.filter((q) => g.visAlive(q) && q.id !== id);
        const pick = opts[Math.floor(Math.random() * opts.length)]?.id;
        if (id && pick) { if (g.pendingKlutz) this.klutz(id, pick); else this.moonchild(id, pick); } else { g.pendingMoonchild = null; g.pendingKlutz = null; g.klutzQueue = []; this.moonchildDone(); }
      } while (g.pendingKlutz && !g.winner);
      this.changed();
    });
  }

  /** 这段遗言时间里该选的都选完了：入夜。 */
  moonchildDone() {
    if (!this.moonchildDue || this.game.pendingMoonchild || this.game.pendingKlutz || this.moonchildFakes?.size) return;
    this.moonchildDue = null;
    this.cancel(this.moonchildTimer);
    this.later(this.settings.pauseMs, () => this.beginNight());
  }

  /** 任何人都可以公开"像造谣者那样"发表声明；只有真造谣者的声明会生效。 */
  gossip(uid, statement) {
    const g = this.requireGame();
    if (!inScript('gossip', g.script)) throw new UserError('这个剧本没有造谣者');
    if (statement.kind === 'free') return this.gossipFree(uid, statement.text);
    const { text } = g.gossipStatement(uid, statement);
    this.pub(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
  }

  /**
   * 自由声明：马上公开播报；只有真造谣者的才在后台问 AI 真假（别人的本来就没效果，不用判，也不会从"判没判"漏出谁是造谣者）。
   * 判为真就标记今晚有人死；入夜结算前会等它判完（见 finishNight）。
   */
  gossipFree(uid, raw) {
    const g = this.game;
    if (!(this.judgeReady ?? judgeAvailable)()) throw new UserError('服务器没配 AI 判定，只能用固定句式');
    const { text, isGossip } = g.gossipFree(uid, raw);
    this.pub(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
    if (!isGossip) return;
    const token = {};
    this.gossipToken = token;
    this.gossipJudging = (this.judge ?? judgeStatement)(text, g.gossipFacts()).then((res) => {
      if (this.gossipToken !== token || this.game !== g) return; // 已经入夜结算了，或者换了一局
      this.gossipToken = null;
      const truth = res?.verdict === 'true';
      const note = res ? `"${text}" 由 AI（${res.by}）判为${{ true: '真', false: '假', unknown: '无法判定（按假处理）' }[res.verdict]}：${res.reason}` : `"${text}" AI 判定失败，按假处理`;
      g.gossipVerdict(truth, note);
      this.stNote(`造谣者的声明 ${note}`);
      this.changed();
    }).catch((e) => console.warn('[botc] 判定声明出错：', e.message));
  }

  /** 月之子得知自己死亡后公开选人。 */
  moonchild(uid, target) {
    const g = this.requireGame();
    if (this.moonchildFakes?.has(uid)) { // 假装的：公告一模一样，只是没有效果
      const t = g.get(target);
      if (g.phase !== 'day' || !t || !g.visAlive(t)) throw new UserError('要选一名存活的玩家');
      this.moonchildFakes.delete(uid);
      g.record('choice', `${g.tag(uid)} 假装月之子选了 ${g.tag(t.id)}（无事发生）`);
    } else g.moonchildChoose(uid, target);
    this.pub(`**${g.name(uid)}** 公开选择了 **${g.name(target)}**。`, 'vote');
    this.moonchildDone();
  }

  /** 不假装月之子，放弃选人。 */
  moonchildSkip(uid) {
    if (this.moonchildFakes?.delete(uid)) this.moonchildDone();
  }

  /** 月之子刚得知自己死亡：提醒他选人（机器人直接选）。 */
  moonchildNotice() {
    const g = this.game;
    const id = g?.pendingMoonchild;
    if (!id) return;
    if (this.isFake(id)) {
      const opts = g.players.filter((q) => g.visAlive(q) && q.id !== id);
      if (opts.length) this.moonchild(id, opts[Math.floor(Math.random() * opts.length)].id);
      return;
    }
    this.tell(id, '你得知了自己的死亡——现在要**公开选择一名存活的玩家**（在右上角选）。', 'moonchild');
  }

  // ───────────── 梦殒春宵的白天 ─────────────
  requireSNV() {
    const g = this.requireGame();
    if (g.engine !== 'snv') throw new UserError('这个剧本没有这个操作');
    return g;
  }

  /** 公开声明自己是某个角色：谁都可以说。这是 AI 说书人判定疯狂的依据。 */
  declare(uid, role) {
    const g = this.requireGame();
    if (!declarable(g.script)) throw new UserError('这个剧本没有公开声明');
    if (this.dusking || this.duskDay === g.day) throw new UserError('今天已经到黄昏了，不能再声明');
    const { text, mutant, mutantClaim } = g.engine === 'snv' ? g.declare(uid, role, { auto: !this.stId }) : g.claimRole(uid, role, MAX_DECLARES);
    this.pub(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
    if (mutantClaim) this.stNote(`畸形秀演员 ${g.name(uid)} 声称自己是外来者：要处决的话，在魔典里用「疯狂处决」`);
    if (!mutant) return;
    this.pub(`**${g.name(uid)}** 因为疯狂被处决了！今天的处决已经发生。`, 'death');
    if (g.winner) this.later(0, () => this.endGame());
    else if (!this.stId) this.later(this.settings.pauseMs, () => this.autoDusk());
    this.klutzNotice();
  }

  /** 杂耍艺人的公开猜测。 */
  juggle(uid, guesses) {
    const g = this.requireSNV();
    const { text } = g.juggle(uid, guesses);
    if (!text) { this.pub(`**${g.name(uid)}** 公开声明：「我是杂耍艺人，今天不猜」`, 'vote'); return; }
    this.pub(`**${g.name(uid)}** 公开猜测：${text}`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
  }

  /** 食人族试一个白天能力：今天试过就不能再试（免得一个个点过去） */
  triedToday(uid, what) { return this.cannibalTries?.[`${uid}:${what}`] === this.game?.day; }

  /**
   * 食人族、失忆者去试一个他其实没有的能力：说书人摇头，什么也不发生（和现实里一样，他只能这样摸索）。返回 true 表示已经处理了。
   * 失忆者：官方「将那名玩家视作具有该能力一样」，猜中之前去用也照常生效，用错了就是什么也没发生。
   */
  cannibalMiss(uid, what) {
    const g = this.game;
    const p = g.get(uid);
    const real = { savant: 'savant', artist: 'artist', fisherman: 'fisherman' }[what];
    if (!['cannibal', 'amnesiac'].includes(p?.role) || g.abilityOf(p) === real) return false;
    if (!p.alive || g.phase !== 'day') throw new UserError('现在不能这样做');
    if (this.triedToday(uid, what)) throw new UserError('你今天已经试过了');
    (this.cannibalTries ??= {})[`${uid}:${what}`] = g.day;
    if (what === 'savant') g.savantDay[uid] = g.day;
    g.record('st', `${ROLES[p.role].name} ${g.tag(uid)} 试着用${ROLES[real].name}的能力：他没有这个能力`);
    this.tell(uid, '说书人摇了摇头：什么也没有发生。', 'storyteller');
    return true;
  }

  /** 特赦（失忆者的原创能力）：台上的人走下来，今天不再处决，提名环节随之结束。 */
  pardon(uid) {
    const g = this.requireSNV();
    const p = g.get(uid);
    if (p?.role !== 'amnesiac') throw new UserError('你没有这个能力');
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名 / 投票结束');
    if (g.abilityOf(p) !== 'amn_pardon') { // 失忆者试着特赦，但他的能力不是这个：公开做了，什么也没发生（每局试一次）
      if (!p.alive || g.phase !== 'day' || !g.block) throw new UserError('现在不能特赦');
      if (g.used[`pardon-${uid}`]) throw new UserError('你已经特赦过了');
      g.used[`pardon-${uid}`] = true;
      g.record('st', `失忆者 ${g.tag(uid)} 试着特赦台上的 ${g.tag(g.block)}：他没有这个能力`);
      this.pub(`**${g.name(uid)}** 公开特赦了台上的 **${g.name(g.block)}**……什么也没有发生。`, 'vote');
      return;
    }
    const { who, worked } = g.pardon(uid);
    this.pub(`**${g.name(uid)}** 公开特赦了台上的 **${g.name(who)}**……${worked ? '他走下了处决台。**今天不再处决任何人。**' : '什么也没有发生。'}`, 'vote');
    if (worked && !this.stId) this.later(this.settings.pauseMs, () => this.autoDusk());
  }

  /** 哥布林：被提名后、投票前公开声明。谁都可以这么说，只有真哥布林算数（说书人照样复述）。 */
  goblin(uid) {
    const g = this.requireSNV();
    if (!inScript('goblin', g.script)) throw new UserError('这个剧本没有哥布林');
    if (this.pendingNom?.nominee !== uid || this.vote) throw new UserError('只有被提名、还没开始投票时才能这样声明');
    if (g.claims?.[uid] === 'goblin' && g.goblinClaimDay?.[uid] === g.day) throw new UserError('你今天已经声明过了');
    g.goblinClaim(uid);
    this.pub(`**${g.name(uid)}** 公开声明：「我是哥布林！」——如果今天处决他，而他真是哥布林，邪恶阵营获胜。`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text: '我是哥布林' });
  }

  // ───────────── 诸神黄昏：猎手死后开枪（用户 2026-11-04 定的：打谁谁死，被打死的猎手接着开） ─────────────
  /** 有人死了：排进开枪队列，一个一个来。 */
  ragDied(ids) {
    const g = this.game;
    if (!g || !SCRIPTS[g.script]?.ragnarok || !ids?.length) return;
    (this.ragQ ??= []).push(...ids);
    if (!this.ragCur) this.ragNext();
  }
  /** 下一个死掉的人：给他一样长的时间决定。狼人也有这段时间（只能不开），结果到时间才公布。 */
  ragNext() {
    const g = this.game;
    const id = this.ragQ?.shift();
    if (!g || g.winner || this.ended || !id) {
      this.ragCur = null; this.ragQ = [];
      const then = this.ragThen; this.ragThen = null;
      if (then && g && !g.winner && !this.ended) then();
      return;
    }
    const ms = this.ragShotMs ?? RAG_SHOT_MS;
    this.ragCur = { id, until: Date.now() + ms, target: null };
    this.announce(`**${g.name(id)}** 倒下了。如果他是猎手，可以开一枪带走一个人（${Math.round(ms / 1000)} 秒）。`, 'death');
    if (this.isFake(id)) {
      const opts = g.alive().filter((q) => q.id !== id);
      if (g.get(id).role === 'slayer' && opts.length && Math.random() < 0.85) this.ragCur.target = opts[Math.floor(Math.random() * opts.length)].id;
    } else this.tell(id, g.get(id).role === 'slayer' ? '你倒下了——**现在可以开一枪**，打谁谁死（右上角选人，也可以不开）。' : '你倒下了。你是狼人，不能开枪；等时间到就好（大家看不出谁开不了枪）。', 'clock');
    this.cancel(this.ragTimer);
    this.ragTimer = this.later(ms, () => this.ragFire());
    this.changed();
  }
  /** 死掉的人选好了（target 为 null 是不开枪）。可以改，到时间才开。 */
  ragShoot(uid, target) {
    const g = this.requireGame();
    const c = this.ragCur;
    if (!c || c.id !== uid) throw new UserError('现在不是你开枪');
    if (target != null) {
      if (g.get(uid).role !== 'slayer') throw new UserError('你是狼人，死了不能开枪');
      const t = g.get(target);
      if (!t || !t.alive || t.id === uid) throw new UserError('要选一名存活的玩家');
    }
    c.target = target;
    c.decided = true;
    this.changed();
  }
  ragFire() {
    const g = this.game; const c = this.ragCur;
    if (!g || !c) return;
    const t = c.target && g.get(c.target);
    if (g.get(c.id)?.role === 'slayer' && t?.alive) {
      g.kill(t, 'slayer', g.dayMessages());
      g.record('slay', `${g.tag(c.id)} 死后开枪带走了 ${g.tag(t.id)}`);
      this.pub(`**${g.name(c.id)}** 开枪带走了 **${g.name(t.id)}**！`, 'death');
      this.narrate('slay', { a: g.name(c.id), b: g.name(t.id), hit: true });
      g.checkWinner();
      if (!g.winner) this.ragQ.push(t.id); // 被打死的猎手接着开枪
    } else this.pub(`**${g.name(c.id)}** 没有开枪。`, 'info');
    this.ragCur = null;
    if (g.winner) { this.ragQ = []; this.later(0, () => this.endGame()); return; }
    this.ragNext();
  }

  /** 公开猜落难少女（爪牙的能力；谁都可以这么说）。猜中了邪恶获胜。 */
  damsel(uid, target) {
    const g = this.requireSNV();
    if (!inScript('damsel', g.script)) throw new UserError('这个剧本没有落难少女');
    if (!g.get(target)) throw new UserError('选一名玩家');
    const { hit } = g.damselGuess(uid, target);
    this.pub(`**${g.name(uid)}** 公开猜：「${g.name(target)} 是落难少女！」${hit ? '——**猜中了。**' : ''}`, hit ? 'death' : 'vote');
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 被鹰身女妖弄疯的人公开指认第二名玩家是邪恶的。 */
  harpyClaim(uid) {
    const g = this.requireSNV();
    const { target } = g.harpyClaim(uid);
    this.pub(`**${g.name(uid)}** 公开说：「${g.name(target)} 是邪恶的！」`, 'vote');
  }

  /**
   * 炸弹人引爆：公布死了谁，然后倒数。所有人（死人也算）各指一名存活的玩家，倒数结束时被最多人指着的死亡；
   * 平票没人死，入夜。7 号空座和机器人随便指（7 号空座的选择本来就由说书人随意定）。
   */
  async boomCountdown(g) {
    const left = g.boom.alive;
    this.pub(`💣 **炸弹人引爆了炸弹！** 只剩 ${left.map((id) => `**${g.name(id)}**`).join('、')} 还活着。倒数十声：每个人（包括死人）在行动面板里指向一名存活的玩家，被最多人指着的那个死亡；平票就没有人死。`, 'death');
    g.boom.until = Date.now() + BOOM_MS;
    this.deadline = g.boom.until;
    this.changed();
    for (const q of g.players.filter((x) => this.isFake(x.id))) {
      // 7 号空座的选择由说书人定：指一个和它不同阵营的人（没有就随便指别人）；其余机器人随便指
      const foes = left.filter((id) => id !== q.id && g.evilOf(g.get(id)) !== g.evilOf(q));
      const pool = q.id === SEAT7 ? (foes.length ? foes : left.filter((id) => id !== q.id)) : left;
      this.later(3000 + Math.random() * 12_000, () => { if (g.boom && pool.length) { try { g.boomPoint(q.id, pool[Math.floor(Math.random() * pool.length)]); this.changed(); } catch { /* 已经结束 */ } } });
    }
    await new Promise((res) => this.later(BOOM_MS, res));
    this.deadline = null;
    if (this.game !== g) return;
    const who = g.boomResolve();
    this.pub(who ? `倒数结束：**${g.name(who)}** 被最多人指着，死亡。` : '倒数结束：平票，没有人死。', who ? 'death' : 'night');
  }

  /** 7 号空座：每天开放提名时掷一次，看今天要不要用掉唯一一次发言（快到终局还没用就一定用）。 */
  seat7Daily() {
    const g = this.game;
    const s = (g.seat7 ??= {});
    if (s.spoke || s.rolled === g.day || this.stId) return;
    if (g.harpyMad?.id === SEAT7 && g.harpyMad.night === g.night && !g.harpyMad.claimed) { s.rolled = g.day; this.later(2000, () => this.seat7Speak({ harpy: true })); return; } // 被鹰身女妖弄疯：用掉唯一一次发言去指认
    s.rolled = g.day;
    this.later(3000 + Math.random() * 6000, () => this.seat7Speak());
  }

  /** 7 号空座唯一一次发言（灯神规则）：公开说一段话。被提名时可以拿来辩护。 */
  async seat7Speak({ nominated = false, harpy = false } = {}) {
    const g = this.game;
    const p = g?.get(SEAT7);
    const s = (g.seat7 ??= {});
    if (!p || s.spoke || g.phase !== 'day' || this.stId) return;
    const lastChance = g.aliveCount() <= 4;
    const late = g.aliveCount() <= Math.ceil(g.players.length / 2);
    if (!harpy && !lastChance && !g.st.roll('seat7Speak', { nominated, late }, { who: SEAT7 })) return;
    s.spoke = g.day;
    if (harpy) {
      const { target } = g.harpyClaim(SEAT7);
      return this.seat7Say(g, `${g.name(target)} 是邪恶的，我很确定。`, '（被鹰身女妖弄疯，替它指认）');
    }
    // 灯神规则：这次发言可以公开、可以私聊，也可以拿来提名（官方百科）。说书人按它的阵营挑一种
    const how = nominated ? 'public' : this.seat7Mode(p);
    if (how === 'nominate') {
      const t = this.seat7Target(p);
      try {
        this.nominate(SEAT7, t.id);
        return this.seat7Say(g, await this.seat7Text(p, { accuse: t }), `（提名了 ${g.name(t.id)}，这就是它的发言）`);
      } catch { /* 现在提名不了（台上有人、时间到了……）：改成公开说 */ }
    }
    if (how === 'private') {
      const t = this.seat7Target(p);
      const text = await this.seat7Text(p, { whisper: t });
      if (this.game !== g) return;
      this.tell(t.id, `🪑 **7 号空座**私下对你说（说书人替它说，每局只有这一次，可能是假的）：「${text}」`, 'storyteller');
      this.pub(`🪑 7 号空座私下找 **${g.name(t.id)}** 说了几句话（它每局只能说这一次）。`, 'day');
      g.record('st', `7 号空座用掉了唯一一次发言（私聊 ${g.tag(t.id)}）：${text}`);
      this.changed();
      return;
    }
    return this.seat7Say(g, await this.seat7Text(p, { nominated }), nominated ? '（被提名时辩护）' : '');
  }

  seat7Say(g, text, why) {
    if (this.game !== g) return;
    this.pub(`🪑 **7 号空座**（说书人替它发言，每局只有这一次）：「${text}」`, 'vote');
    g.record('st', `7 号空座用掉了唯一一次发言${why}：${text}`);
    this.changed();
  }

  /** 发言方式：邪恶的有时拿来提名一个善良玩家，有时私下找人说（编谎话）；善良的有时私下把信息告诉一个人。 */
  seat7Mode(p) {
    const g = this.game;
    const r = Math.random();
    const canNominate = g.visAlive(p) && !g.nominators.has(SEAT7) && !g.executedToday && !!this.noms && !this.noms.timeUp && !this.pendingNom && !this.vote;
    const how = g.evilOf(p) ? (canNominate && r < 0.35 ? 'nominate' : r < 0.6 ? 'private' : 'public') : (r < 0.3 ? 'private' : 'public');
    g.st.decide('seat7Mode', { who: SEAT7, options: ['public', 'private', 'nominate'], chosen: how });
    return how;
  }
  /** 找谁：邪恶的找一个善良玩家（提名、或者私下骗他），善良的找一个存活的人说（不知道谁好谁坏，随便挑）。 */
  seat7Target(p) {
    const g = this.game;
    const live = g.alive().filter((q) => q.id !== p.id && g.visAlive(q) && !g.nominees.has(q.id));
    const good = live.filter((q) => !g.evilOf(q));
    const pool = g.evilOf(p) && good.length ? good : live.length ? live : g.alive().filter((q) => q.id !== p.id);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** 7 号空座这次说什么：先问大模型（只给它知道的和公开的事），不行就按规则：善良说真话，邪恶报一个伪装并把怀疑引到善良玩家身上。 */
  async seat7Text(p, { nominated = false, accuse = null, whisper = null } = {}) {
    const g = this.game;
    const evil = g.evilOf(p);
    const notes = g.seat7?.notes ?? [];
    const shown = ROLES[p.shownRole]?.name ?? '?';
    const mates = evil ? (g.evilKnown?.[p.id] ?? []).map((x) => `${g.name(x.id)}（${x.team}）`) : [];
    const pub = g.timeline.filter((e) => ['death', 'nominate', 'vote', 'slay'].includes(e.kind)).map((e) => `[${e.when}] ${e.text.replace(/（[^）]*）/g, '')}`);
    const claims = Object.entries(g.claims ?? {}).map(([id, r]) => `${g.name(id)} 公开声称是${ROLES[r]?.name ?? r}`);
    const ctx = [
      `7 号座位：${evil ? '邪恶' : '善良'}阵营，它以为自己的角色是${shown}。${nominated ? '它现在正被提名，这段话是它的辩护。' : ''}${accuse ? `它刚刚提名了 ${g.name(accuse.id)}，这段话是提名理由。` : ''}${whisper ? `这是私聊，只有 ${g.name(whisper.id)} 听得到。` : ''}`,
      notes.length ? `它夜里得到的信息：\n${notes.join('\n')}` : '它夜里没有得到信息。',
      evil ? `它的同伴：${mates.join('、') || '不知道'}${ROLES[p.role].team === 'demon' || g.bluffsShared ? `；可用的伪装：${(g.bluffs ?? []).map((r) => ROLES[r].name).join('、')}` : ''}` : '',
      `存活：${g.alive().map((q) => g.name(q.id)).join('、')}`,
      claims.length ? `公开声明：${claims.join('；')}` : '',
      `白天公开发生的事：\n${pub.slice(-30).join('\n') || '还没有'}`,
    ].filter(Boolean).join('\n\n');
    try {
      const r = (this.judgeReady ?? judgeAvailable)() ? await speakSeat7(ctx) : null;
      if (r?.say) { g.record('st', `7 号空座的发言由 ${r.by} 写`); return r.say; }
    } catch (e) { console.warn('[botc] 7 号空座发言失败：', e.message); }
    const others = g.alive().filter((q) => q.id !== p.id);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    if (!evil) {
      const last = notes.at(-1)?.replace(/^第 \d+ 夜：得知：/, '') ?? '';
      return `我是${shown}。${last ? `我得到的信息：${last}` : '我还没有得到信息。'}${nominated ? '处决我对善良没有好处。' : ''}`;
    }
    const knowsBluffs = ROLES[p.role].team === 'demon' || g.bluffsShared; // 爪牙不知道恶魔的伪装：自己挑一个剧本里不显眼的善良角色
    const bluff = knowsBluffs && g.bluffs?.length ? ROLES[g.bluffs[0]].name : ROLES[rolesOf(g.script).filter((r) => ['townsfolk', 'outsider'].includes(ROLES[r].team) && !g.players.some((q) => q.role === r))[0] ?? 'drunk'].name;
    const good = others.filter((q) => !g.evilOf(q));
    const blame = accuse ?? (good.length ? pick(good) : null);
    return `我是${bluff}。${blame ? `我很怀疑 ${g.name(blame.id)}，大家看看他的说法。` : ''}${nominated ? '别处决我。' : ''}`;
  }

  /** 渔夫请教说书人：AI 说书时问大模型要一条"去做什么"的建议，没配或失败用规则给。真人说书时交给说书人。 */
  fisherman(uid) {
    const g = this.requireSNV();
    if (this.cannibalMiss(uid, 'fisherman')) return;
    const { lie } = g.fishermanAsk(uid);
    this.tell(uid, '说书人想了想……', 'storyteller');
    if (this.stId) { this.stNote(`渔夫 ${g.name(uid)} 来请教建议${lie ? '（他失效了，可以给坏建议）' : ''}：用「私信」回复他`); return; }
    const p = g.get(uid);
    const reply = (text) => {
      if (this.game !== g) return;
      this.tell(uid, `说书人的建议：**${text}**`, 'storyteller');
      g.record('info', `${g.tag(uid)}${lie ? '【能力失效】' : ''} 得到建议：${text}`);
      this.changed();
    };
    const fallback = () => reply(g.st.fishermanAdvice(p, lie));
    if (!(this.judgeReady ?? judgeAvailable)()) { fallback(); return; }
    const fake = lie === 'atheist'; // 无神论者局：按说书人假装的邪恶阵营给正常的建议（以前当成失效、还把「全员善良」的真实情况交给模型）
    (this.advise ?? adviseFisherman)({ team: g.evilOf(p) && p.role !== 'marionette' ? '邪恶' : '善良', lie: !!lie && !fake, facts: fake ? g.factsFake() : g.factsSNV() }) // 提线木偶以为自己是好人
      .then((res) => (res?.advice ? reply(res.advice) : fallback()))
      .catch((e) => { console.warn('[botc] 渔夫的建议出错：', e.message); fallback(); });
  }

  /** 失忆者猜能力：大模型按"无关 / 有关 / 接近 / 完美"判；没配就用字面重合度粗判。失效时说书人可以乱答。 */
  amnesiac(uid, raw) {
    const g = this.requireSNV();
    const { text, ability, lie } = g.amnesiacGuess(uid, raw);
    this.tell(uid, '说书人想了想……', 'storyteller');
    if (this.stId) { this.stNote(`失忆者 ${g.name(uid)}（能力其实是${ROLES[ability].name}）猜：${text}。用「私信」回复 无关 / 有关 / 接近 / 完美`); return; }
    const LEVELS = ['无关', '有关', '接近', '完美'];
    const reply = (level) => {
      if (this.game !== g) return;
      let said = LEVELS.includes(level) ? level : '无关';
      if (lie) { const other = LEVELS.filter((x) => x !== said); said = other[Math.floor(Math.random() * other.length)]; g.flag(g.get(uid), '失忆者的猜测得到了错误的回答'); }
      // 真猜中了（没失效）：记一下。白天的按钮一直都在，猜中前也能试（官方：视作具有该能力）
      const unlock = level === '完美' && !lie && AMNESIAC_DAY.has(ability) && !g.amnesiacKnown?.[uid];
      // 听到「完美」就当他弄清了（失效时答的假完美也一样，不然按钮还在等于告诉他答错了）：不再给试别的白天能力的按钮（2026-11-12 用户：猜中气球驾驶员的失忆者还有开枪按钮）
      if (said === '完美') (g.amnesiacKnown ??= {})[uid] = true;
      this.tell(uid, `你猜：${text}\n说书人的回答：**${said}**${unlock ? '\n你弄清了自己的能力：用行动面板里对应的按钮。' : ''}`, 'storyteller');
      g.record('info', `${g.tag(uid)} 猜"${text}"，答：${said}${lie ? '（失效，答错了）' : ''}${unlock ? '（解锁了白天的能力）' : ''}`);
      this.changed();
    };
    const truth = `${ROLES[ability].name}：${ROLES[ability].ability}`;
    if (looksInjected(text)) { this.stNote(`失忆者 ${g.name(uid)} 的猜测像在指挥大模型，没交给模型，按「无关」答`); reply('无关'); return; }
    if (!(this.judgeReady ?? judgeAvailable)()) { reply(guessLevel(text, ability)); return; }
    (this.amnesiacJudge ?? judgeAmnesiac)(truth, text)
      .then((res) => reply(res?.level ?? guessLevel(text, ability)))
      .catch((e) => { console.warn('[botc] 判定失忆者的猜测出错：', e.message); reply(guessLevel(text, ability)); });
  }

  /** 博学者问说书人：两条信息只给本人。真人说书时先进待审队列，说书人可以改写。 */
  savant(uid) {
    const g = this.requireSNV();
    if (this.cannibalMiss(uid, 'savant')) return;
    const { lines } = g.savantAsk(uid);
    this.deliver([{ playerId: uid, text: `两条信息，一真一假：\n· ${lines.join('\n· ')}` }]);
  }

  /** 艺术家提问。AI 说书时问大模型，没配或失败就答"我不知道"；真人说书时交给说书人回答。 */
  artist(uid, raw) {
    const g = this.requireSNV();
    if (this.cannibalMiss(uid, 'artist')) return;
    const { text } = g.artistAsk(uid, raw);
    this.tell(uid, '说书人想了想……', 'storyteller');
    if (this.stId) { // 真人说书：放到说书台，由说书人回答（他看得到这人醉没醉，真假他自己定）
      (this.artistAsks ??= []).push({ uid, text });
      this.stNote(`艺术家 ${g.name(uid)} 问：${text}`);
      return;
    }
    const answer = (verdict) => {
      if (this.game !== g) return;
      this.artistReply(uid, text, g.artistAnswer(uid, verdict));
      this.changed();
    };
    if (!(this.judgeReady ?? judgeAvailable)()) { answer('unknown'); return; }
    if (looksInjected(text)) { this.stNote(`艺术家 ${g.name(uid)} 的问题像在指挥大模型，没交给模型，答「我不知道」`); answer('unknown'); return; }
    // 问得有歧义（「1-5」可能是 1 到 5 号，也可能是 1 号和 5 号）、看不懂、或者不是是非题：不答，让他重新问，这次不算用掉
    // （2026-11-12 用户定；艺术家页：「如果你不能用这三种答案进行回答，让他重新问一个问题」）。
    // 模型的理由记进说书人记录（以前丢掉了，事后看不出它怎么理解的问题）；理由不给玩家看，免得漏出真实情况
    (this.judge ?? judgeStatement)(`（这是一个是非问题：答案为"是"就判 true，为"不是"就判 false。玩家说的数字一般指座位号。如果这个问题有歧义——同一句话能读出两种意思、两种意思的答案不一样，比如「1-5」可能是 1 号到 5 号、也可能是 1 号和 5 号——或者看不懂在问什么，或者根本不是能用「是 / 不是 / 我不知道」回答的问题（比如「有几个爪牙」「谁是恶魔」），判 unknown，reason 以「歧义：」开头说明为什么要重问）${text}`, g.atheist && !g.evilOf(g.get(uid)) ? g.factsFake() : g.factsSNV()) // 无神论者局：按说书人假装的邪恶阵营判（2026-11-19）
      .then((res) => {
        if (this.game !== g) return;
        if (res?.reason) { this.stNote(`艺术家 ${g.name(uid)} 问「${text}」，说书人的理解：${res.reason}（${res.verdict}）`); g.record('st', `艺术家的问题「${text}」，说书人判 ${res.verdict}：${res.reason}`); }
        if (res?.verdict === 'unknown' && /^\s*【?歧义/.test(res.reason ?? '')) { this.artistRetry(uid, text); return; }
        answer(res?.verdict ?? 'unknown');
      })
      .catch((e) => { console.warn('[botc] 判定艺术家的问题出错：', e.message); answer('unknown'); });
  }

  /** 艺术家问得有歧义：不答、不算用掉，请他换个说法重新问。 */
  artistRetry(uid, text) {
    const g = this.game;
    if (g.used) delete g.used[uid];
    this.tell(uid, `你问：${text}\n说书人：**问的有歧义，请重新问。**这次不算用掉。比如「1-5」可以写成「1到5号」或者「1号和5号」。`, 'storyteller');
    g.record('info', `${g.tag(uid)} 问"${text}"：有歧义，让他重新问（不算用掉）`);
    this.changed();
  }

  artistReply(uid, text, v) {
    const said = { true: '是', false: '不是', unknown: '我不知道' }[v];
    this.tell(uid, `你问：${text}\n说书人的回答：**${said}**`, 'storyteller');
    this.game.record('info', `${this.game.tag(uid)} 问"${text}"，答：${said}`);
  }

  /** 呆瓜公开选人。 */
  klutz(uid, target) {
    const g = this.requireSNV();
    g.klutzChoose(uid, target);
    this.pub(`**${g.name(uid)}** 公开选择了 **${g.name(target)}**。`, 'vote');
    if (g.winner) { this.moonchildDue = null; this.cancel(this.moonchildTimer); this.later(0, () => this.endGame()); return; }
    this.klutzNotice(); // 同时死的第二个呆瓜轮到了
    this.moonchildDone();
  }

  /** 呆瓜刚得知自己死亡：提醒他选人（机器人直接选）。 */
  klutzNotice() {
    const g = this.game;
    const id = g?.pendingKlutz;
    if (!id || g.winner || (g.phase !== 'day' && !g.klutzNow)) return; // 夜里被杀的等天亮再说
    if (this.isFake(id)) {
      const opts = g.alive();
      if (opts.length) this.klutz(id, opts[Math.floor(Math.random() * opts.length)].id);
      return;
    }
    this.tell(id, '你得知了自己的死亡——你要**公开选择一名存活的玩家**（在右上角选）。选中邪恶，你的阵营落败。', 'klutz');
  }

  /**
   * 黄昏前判一下洗脑师的目标（只在 AI 说书时；真人说书由说书人用魔典工具判）。
   * 一天只处决一次：当天已经有处决、台上有人时，判定不够疯狂的活人留到入夜处决。
   * 把收音转写的话交给大模型看他有没有努力证明；有收音服务时公开声明不算数，不开收音会重罚。最后都由说书人掷骰子，加减值看 dice.js。
   * 夜里没有人说话、也不能声明，所以夜晚的疯狂只看当天白天的表现。
   */
  async judgeMadness() {
    const g = this.game;
    if (g.engine !== 'snv' || this.stId) return;
    // 判定时听到的话和结论记进时间线（只在存档里，不发客户端）：以后拿真人数据看判得准不准（2026-11-11 用户要分析疯狂玩家的发言）
    const ask = async (claim, lines, id = null) => {
      const res = await (this.madnessJudge ?? judgeMadness)(claim, lines).catch(() => null);
      if (res) this.stNote(`语音判定（${res.by}）"${claim}"：${res.verdict}。${res.reason}`);
      if (id && this.game === g) noteHeard(g, { id, kind: 'dusk', claim, verdict: res?.verdict ?? null, reason: res?.reason ?? null, lines });
      return res?.verdict ?? 'unknown';
    };
    const dealt = (id) => g.block === id || g.lastExecuted === id; // 今天本来就要处决他
    const taken = () => g.executedToday || !!g.block;
    const punish = (id, why, say) => this.madPunish(id, why, say);
    // 畸形秀演员：听到他在说服别人自己是外来者
    for (const p of g.players.filter((q) => q.alive && g.abilityOf(q) === 'mutant' && !g.broken(q) && !dealt(q.id) && this.mutantRolled?.[q.id] !== g.day)) {
      const heard = this.heardLines(p.id);
      const said = heard.length ? await ask(MUTANT_CLAIM, heard, p.id) : null;
      if (this.game !== g) return;
      if (said === 'true' && g.st.mutantExecuted(p, { voice: true })) punish(p.id, '语音里说服别人自己是外来者', `**${g.name(p.id)}** 因为疯狂被处决了！`);
    }
    // 小精灵：疯狂地证明自己是那个镇民了没有（没证明不罚，只是那人死时拿不到能力）
    for (const [id, px] of Object.entries(g.pixie ?? {})) {
      if (px.gained || px.mad || !g.get(id)?.alive) continue;
      const heard = this.heardLines(id);
      if (!heard.length) continue;
      if (await ask(`我是${ROLES[px.role].name}`, heard, id) === 'true') g.pixieMad(id);
      if (this.game !== g) return;
    }
    // 洗脑师的目标：听到了就让模型判；什么都没听到（没开语音判定、或者他一句没说）也掷骰子，只是依据不同
    // 有收音服务时声明不算数，要听他说的话；开不了收音的（机器人、掉线的）声明了就算尽力
    for (const { id, role, claimed } of g.madnessDue({ claimed: !!this.mic }).filter((x) => !dealt(x.id) && (g.get(x.id).alive || !taken()))) {
      const mustMic = !!this.mic?.tokenFor(id) && this.online.has(id);
      if (claimed && !mustMic) continue;
      const heard = this.heardLines(id);
      const verdict = heard.length ? await ask(`我是${ROLES[role].name}`, heard, id) : 'unknown';
      if (this.game !== g) return;
      if (verdict === 'true') continue;
      // 依据不一样，骰子不一样：听到了判没努力最重，有人听但他没说次之，根本没人在听时只知道他没公开声明
      const noMic = mustMic && !this.mic.isOn(id);
      const how = verdict === 'false' ? { heardFalse: true } : heard.length ? {} : noMic ? { noMic: true, claimed } : this.listeningTo(id) ? { silent: true } : { blind: true };
      if (!g.madnessPenalty(id, how)) continue;
      punish(id, heard.length ? '语音里没有努力证明' : noMic ? '没有打开收音' : '说书人没听到他努力证明', `**${g.name(id)}** 没有疯狂地证明自己，被处决了！`);
    }
  }

  /** 判定不够疯狂：今天的处决还空着就处决（死人也算），占了就留到入夜。 */
  madPunish(id, why, say) {
    const g = this.game;
    if (g.executedToday || g.block || this.vote || this.pendingNom) { if (g.get(id).alive) g.madLater(id, why); return; }
    if (!g.madExecute(id, why)) return;
    this.pub(g.get(id).alive || g.lastExecuted === id ? say : `已经死去的 **${g.name(id)}** 也没能逃过疯狂的审判。今天的处决已经发生。`, 'death');
    this.klutzNotice();
  }

  /**
   * 收音页传来一句话：当场听他有没有破坏疯狂（说自己是被逼的、说出真实角色）。努力够不够还是黄昏判，天没黑不能说他没努力。
   * 本机筛过、大模型也判是破坏了才掷骰子处决。官方疯狂规则：明确说出「我现在疯狂了」或明显暗示，
   * 就像在说「我情愿接受惩罚」，说书人可以直接罚（洗脑师页范例：私下暗示自己疯了的卖花女孩被处决）。
   * 以前第一次只警告，比官方宽太多（2026-11-11 用户：破坏了疯狂应该直接死）。转写听错的风险由大模型复核和骰子兜着。
   * 疯子、酒鬼说出他以为的那个角色也算（他不知道自己的真实角色，但那正是他要藏的）。
   */
  async hearBreak(id, text) {
    if (this.game?.engine === 'snv' && this.game.abilityOf(this.game.get(id)) === 'mutant') await this.hearMutant(id, text);
    const g = this.game;
    const open = () => this.game === g && g.phase === 'day' && !this.ended && !this.dusking && this.duskDay !== g.day;
    const due = g?.engine === 'snv' && !this.stId && open() ? g.madnessDue({ claimed: true }).find((x) => x.id === id) : null;
    const m = due && g.madness[id];
    const p = g?.get(id);
    const real = ROLES[p.role].name;
    const thinks = p.shownRole && p.shownRole !== p.role ? ROLES[p.shownRole]?.name : null; // 疯子、酒鬼以为的角色
    if (!m || (m.checks ?? 0) >= BREAK_CHECKS || !(looksBroken(text, real) || (thinks && looksBroken(text, thinks))) || due.role === p.role) return;
    m.checks = (m.checks ?? 0) + 1;
    const res = await (this.breakJudge ?? judgeBreak)(ROLES[due.role].name, thinks ? `${real}（他以为自己是${thinks}）` : real, this.heardLines(id).slice(-5)).catch(() => null);
    if (res && this.game === g) { const recent = this.heardLines(id).slice(-5); if (recent.at(-1) !== text) recent.push(text); noteHeard(g, { id, kind: 'break', claim: ROLES[due.role].name, verdict: res.verdict, reason: res.reason, lines: recent }); }
    if (res?.verdict !== 'true' || !open() || g.madness[id] !== m) return;
    g.record('st', `${g.tag(id)} 破坏了疯狂（${res.by}）：${res.reason}`);
    if (m.broke) return; // 这次疯狂已经掷过（放过了就是放过了，不反复掷到死）
    m.broke = true;
    if (!g.madnessPenalty(id, { broke: true })) { this.changed(); return; }
    const before = g.executedToday;
    this.madPunish(id, '语音里破坏了疯狂', `**${g.name(id)}** 破坏了疯狂，被处决了！今天的处决已经发生。`);
    if (g.winner) this.later(0, () => this.endGame());
    else if (!before && g.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
    this.changed();
  }

  /**
   * 畸形秀演员当场判（2026-11-12 用户：要能当场死）：收音页传来的话里说到「外来者」或者某个外来者角色名，
   * 就把最近几句交给大模型判他是不是在说服别人自己是外来者；判是就掷骰子，处决就当场执行（官方：说书人随时可以处决他）。
   * 每人每天最多问 BREAK_CHECKS 次，掷过一次骰子当天就不再掷（黄昏也不再判）。失效的（醉酒中毒）不罚。
   */
  async hearMutant(id, text) {
    const g = this.game;
    const open = () => this.game === g && g.phase === 'day' && !this.ended && !this.dusking && this.duskDay !== g.day;
    const p = g.get(id);
    if (this.stId || !open() || !p?.alive || g.broken(p) || g.block === id || this.mutantRolled?.[id] === g.day) return;
    // 自己说出「畸形秀」就直接处决：不问模型、不掷骰子（2026-11-12 用户：说了畸形秀就要处死）。转写常把畸写成奇
    if (MUTANT_WORD.test(text)) {
      if (g.st.evilWinsBy(p)) return; // 官方：「可能」是为了不让邪恶靠这个获胜
      (this.mutantRolled ??= {})[id] = g.day;
      const lines = this.heardLines(id).slice(-5);
      if (lines.at(-1) !== text) lines.push(text);
      noteHeard(g, { id, kind: 'mutant', claim: '说出畸形秀', verdict: 'true', reason: '自己说出了「畸形秀」', lines });
      g.record('st', `${g.tag(id)} 自己说出了「畸形秀」，按规则处决`);
      const before = g.executedToday;
      this.madPunish(id, '语音里说出了畸形秀', `**${g.name(id)}** 因为疯狂被处决了！今天的处决已经发生。`);
      if (g.winner) this.later(0, () => this.endGame());
      else if (!before && g.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
      this.changed();
      return;
    }
    // 说到外来者、外来者的颜色（紫色、不是三原色），或者这个剧本某个外来者的名字，才问模型
    if (!OUTSIDER_HINT.test(text) && !rolesOf(g.script, 'outsider').some((r) => text.includes(ROLES[r].name))) return;
    const checks = (this.mutantChecks ??= {});
    const k = `${id}:${g.day}`;
    if ((checks[k] ?? 0) >= BREAK_CHECKS) return;
    checks[k] = (checks[k] ?? 0) + 1;
    const lines = this.heardLines(id).slice(-5);
    if (lines.at(-1) !== text) lines.push(text);
    const res = await (this.madnessJudge ?? judgeMadness)(MUTANT_CLAIM, lines).catch(() => null);
    if (this.game !== g) return;
    noteHeard(g, { id, kind: 'mutant', claim: '我是外来者', verdict: res?.verdict ?? null, reason: res?.reason ?? null, lines });
    if (res) this.stNote(`语音判定（${res.by}）畸形秀演员 ${g.name(id)} "我是外来者"：${res.verdict}。${res.reason}`);
    if (res?.verdict !== 'true' || !open() || this.mutantRolled?.[id] === g.day) return;
    (this.mutantRolled ??= {})[id] = g.day;
    if (!g.st.mutantExecuted(p, { voice: true })) { this.changed(); return; }
    const before = g.executedToday;
    this.madPunish(id, '语音里说服别人自己是外来者', `**${g.name(id)}** 因为疯狂被处决了！今天的处决已经发生。`);
    if (g.winner) this.later(0, () => this.endGame());
    else if (!before && g.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
    this.changed();
  }

  /** 这局要不要开语音判定：房主打开了、AI 说书、梦殒春宵，而且这个服务器接得上（hearingFor 由服务器注入，旺财和 KOOK 没有）。 */
  async openHearing() {
    const g = this.game;
    if (g.engine !== 'snv' || this.stId || !this.settings.hearMadness || !this.square || !this.hearingFor) return;
    this.hearing = await this.hearingFor(this.square).catch(() => null);
    if (this.hearing) this.hearing.onAudio = (id, audio, text) => this.saveTalk('square', 'ogg', id, audio, text);
    if (this.hearing) this.announce('本局开了语音判定：机器人留在广场语音里，只转写被疯狂的玩家说的话，音频不保存。', 'info');
    else this.announce('语音判定没有打开：说书人听不到语音，疯狂由说书人按局势判定（被洗脑的人可以打开收音页，让说书人听到自己）。', 'info');
  }

  closeHearing() { this.hearing?.stop(); this.hearing = null; this.mic?.stop(); this.mic = null; }

  /**
   * 今天真有人在听这个人吗：他开收音页传过声音，或者机器人在广场而他今天没进屋跟人说话（屋里听不到）。
   * 收音箱每天都建、不代表他开了；掉线的和机器人都算没人听。
   */
  listeningTo(id) {
    if (this.isFake(id) || !this.online.has(id)) return false;
    if (this.mic?.isOn(id)) return true;
    return !!this.hearing && !this.meets.some((m) => m.day === this.game.day && (m.who === id || m.with.includes(id)));
  }

  /**
   * 这个人以为自己是畸形秀演员（活着）：真的畸形秀演员，和以为自己是畸形秀演员的酒鬼都算，
   * 只给真的发收音的话，酒鬼没弹窗就知道自己不是。判定时只罚真的、没失效的（见 judgeMadness）。
   */
  thinksMutant(p) {
    return !!p?.alive && (this.game.abilityOf(p) === 'mutant' || p.shownRole === 'mutant');
  }

  /** 这个人今天被听到的话：机器人在广场听到的，加上他自己开收音页传上来的。 */
  heardLines(id) { return [...(this.hearing?.transcript(id) ?? []), ...(this.mic?.transcript(id) ?? [])]; }

  /** 天亮：今天听谁（被洗脑的人和畸形秀演员）。 */
  hearToday() {
    const g = this.game;
    if (g.engine !== 'snv') return;
    const due = g.madnessDue().map((x) => x.id).filter((id) => !this.isFake(id));
    const mutants = g.players.filter((q) => this.thinksMutant(q) && !this.isFake(q.id)).map((q) => q.id);
    const ids = [...new Set([...due, ...mutants])];
    this.hearing?.listen(ids);
    // 收音页还要发给：小精灵（可以疯狂地证明自己是那个镇民）；剧本里有灵言师时所有活着的真人（听关键词）。
    // 灵言师那条不看他在不在场，免得谁收到收音页就说明灵言师在场（2026-11-14 用户：灵言师用收音页、本机转写、检测关键词）
    const pixies = g.players.filter((q) => q.alive && g.pixie?.[q.id] && !g.pixie[q.id].gained && !this.isFake(q.id)).map((q) => q.id);
    const everyone = this.listenAll(g) ? g.players.filter((q) => q.alive && !this.isFake(q.id)).map((q) => q.id) : [];
    const micIds = [...new Set([...ids, ...pixies, ...everyone])];
    // 收音页：被洗脑的人和畸形秀演员自己决定开不开，所以不用房主打开（micFor 由服务器注入，没有转写服务时没有）。
    // 以前只发给被洗脑的人，畸形秀演员拿不到收音链接，也就没有弹窗（2026-11-11 用户报的）
    if (!this.stId && this.micFor) {
      this.mic ??= this.micFor();
      this.mic.onLine = (id, text) => {
        this.game?.mezHeard?.(id, text); // 灵言师的关键词：本机转写的文字里找，不交给大模型
        this.hearBreak(id, text).catch((e) => console.warn('[botc] 判定破坏疯狂出错：', e.message));
      };
      // 收音页上显示哪种疯狂的定义（被洗脑的要证明的角色；畸形秀演员）
      this.mic.about = (id) => {
        const gg = this.game;
        const m = gg?.madness?.[id];
        if (m) return { kind: 'madness', role: ROLES[m.role].name };
        if (this.thinksMutant(gg?.get(id))) return { kind: 'mutant' };
        const px = gg?.pixie?.[id];
        if (px && !px.gained) return { kind: 'pixie', role: ROLES[px.role].name };
        return gg && this.listenAll(gg) ? { kind: 'listen', why: this.listenWhy(gg) } : {};
      };
      this.mic.onStatus = () => this.changed(); // 有人刚打开收音：马上刷新，他那边的提示就关掉
      this.mic.onAudio = (id, audio, text) => this.saveTalk('mic', 'wav', id, audio, text);
      this.mic.listen(micIds);
    }
  }

  slay(uid, target) {
    const g = this.requireGame();
    const p = g.get(uid);
    const amnesiacGun = g.engine === 'snv' && p?.role === 'amnesiac'; // 失忆者都能试着开枪：能力是枪就照常结算，不是就什么也没发生（每局一次）
    if (g.script !== 'tb' && !inScript('slayer', g.script) && !amnesiacGun) throw new UserError('这个剧本没有猎手');
    if (SCRIPTS[g.script].ragnarok) throw new UserError('诸神黄昏的猎手死了才能开枪');
    const { hit } = g.slay(uid, target);
    this.pub(`**${g.name(uid)}** ${amnesiacGun ? '举起枪' : '声称自己是猎手'}，向 **${g.name(target)}** 开了一枪……${hit ? `**${g.name(target)}** 倒下了！` : '什么都没有发生。'}`, hit ? 'death' : 'info');
    this.narrate('slay', { a: g.name(uid), b: g.name(target), hit });
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 现在是不是两个阶段之间的停顿：'dawn' | 'gather' | 'dusk' | null。真人说书时只有黄昏算（其余由说书人决定下一步）。 */
  transit() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended) return null;
    if (this.duskDay === g.day) return 'dusk';
    if (this.stId || this.roam || this.noms || this.pendingNom || this.vote) return null;
    return this.roamedToday ? 'gather' : 'dawn';
  }

  // ───────────── 白天自由活动：小镇地图 ─────────────
  /** 这局的地图：每个剧本一张。 */
  get town() { return getMap(this.game?.script); }

  // 走进房子 = 机器人把你拉进那间房子的语音频道；走出来 = 拉回广场。房子空了频道就删掉。
  startRoam(minutes) {
    const g = this.requireGame();
    if (g.phase !== 'day' || this.ended) throw new UserError('只有白天能自由活动');
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名/投票结束');
    if (this.roam) return;

    this.roamedToday = true;
    const houses = this.town.housesFor();
    const now = Date.now();
    const pos = new Map(g.players.map((p, i) => {
      // 有家的从自家门口出门（合住的沿门口左右错开），没有的站在集合点一圈
      const home = this.homes?.[p.id];
      let s = home && this.town.homeStep(home);
      if (s) {
        const mates = g.players.filter((q) => this.homes[q.id] === home);
        const k = mates.findIndex((q) => q.id === p.id) - (mates.length - 1) / 2;
        s = { x: s.x + k * 28, y: s.y };
      }
      s ??= this.town.seatSpot(i, g.players.length);
      return [p.id, { fx: s.x, fy: s.y, x: s.x, y: s.y, start: now, dur: 0 }];
    }));
    this.roam = {
      houses, pos,
      state: new Map(houses.map((h) => [h.id, blankHouse()])),
      zone: new Map(),    // playerId → houseId
      arrive: new Map(),  // playerId → 到达计时器
      until: minutes ? now + minutes * 60_000 : null,
      since: now,          // 自由活动从什么时候开始（前端按"早上 → 傍晚"调雾的浓淡）
      endVotes: new Set(), // 同意提前集合的人
    };
    if (minutes) this.roamTimer = this.later(minutes * 60_000, () => this.endRoam('时间到'));
    this.scheduleRoamSoon();
    this.wander();
    this.announce(`自由活动${minutes ? `（${minutes} 分钟）` : ''}！点地图走动，走进小房子就能私聊，房子里的人可以锁门。`, 'day');
    this.narrate('roam', { minutes });
  }

  /** 现在这一刻的位置（可能正走在路上）。 */
  posNow(id) {
    return positionAt(this.roam.pos.get(id), Date.now());
  }

  /** 走到 (x, y)。锁着门的房子只能走到门口并敲门。返回给客户端的提示。 */
  move(uid, x, y, { force = false, run = false } = {}) {
    const r = this.roam;
    if (!r) throw new UserError('现在不是自由活动时间');
    if (!this.game.get(uid)) throw new UserError('你不是这局的玩家');
    let to = this.town.clampToMap(x, y);
    let notice = null;
    r.bounce?.delete(uid); // 换了目的地：不再是「正被挡出门外」
    // 真的走开了（目的地离门口超过 KNOCK_STAY）才算不敲了；在门口松开方向键、原地挪一下都不算——
    // 以前任何一次移动都清掉敲门，屋里人的「有人敲门」面板一会儿出来一会儿消失，点「让他进来」又说他不在门口
    let dropped = false;
    for (const [hid, st] of r.state) {
      if (!st.knocks.has(uid)) continue;
      const h = r.houses.find((q) => q.id === hid);
      const d = h && doorPoint(h, 24);
      const stays = d && (Math.hypot(to.x - d.x, to.y - d.y) <= KNOCK_STAY || houseAt(r.houses, to.x, to.y)?.id === hid);
      if (!stays) { st.knocks.delete(uid); dropped = true; }
    }
    // 锁着门的房子里，人出不去：先点「开门」才能走出来（只能在屋里走动）
    const inside = r.zone.get(uid);
    const insideSt = inside && r.state.get(inside);
    if (insideSt?.locked && !force && houseAt(r.houses, to.x, to.y)?.id !== inside) {
      const h = r.houses.find((q) => q.id === inside);
      to = { x: Math.min(h.x + h.w - 14, Math.max(h.x + 14, to.x)), y: Math.min(h.y + h.h - 14, Math.max(h.y + 14, to.y)) };
      const last = r.lockNotice?.get(uid) ?? 0;
      if (Date.now() - last > 3000) {
        (r.lockNotice ??= new Map()).set(uid, Date.now());
        notice = '门锁着——先点「开门」才能出去';
      }
    }
    const target = houseAt(r.houses, to.x, to.y);
    if (target && r.zone.get(uid) !== target.id && !force && this.matronBlocks(uid, r.state.get(target.id))) {
      to = doorPoint(target, 24);
      notice = '女舍监在场：只能和左右邻座私聊，屋里有不是你邻座的人';
    } else if (target && r.zone.get(uid) !== target.id && !force) {
      const st = r.state.get(target.id);
      if (st.locked) {
        to = doorPoint(target, 24);
        this.knock(st, uid);
        notice = `${target.name}锁着门，你敲了敲门`;
      }
    }
    const from = this.posNow(uid);
    const path = this.town.route(r.houses, from, to); // 绕开建筑的路线，客户端照着它画
    const end = path[path.length - 1];
    const dur = (pathLength(path) / speedOf(run)) * 1000;
    const m = { fx: from.x, fy: from.y, x: end.x, y: end.y, start: Date.now(), dur, path, ...(run ? { run: true } : {}) };
    r.pos.set(uid, m);
    this.onPos?.(this, uid, m);
    // 进出房子的那一刻就切（不用等走到终点）：沿路线找"所在房子变了"的时间点，各结算一次
    for (const t of [].concat(r.arrive.get(uid) ?? [])) this.cancel(t);
    const marks = [];
    let zone = r.zone.get(uid) ?? null;
    for (let t = 50; t < dur; t += 50) {
      const p = positionAt(m, m.start + t);
      const h = houseAt(r.houses, p.x, p.y)?.id ?? null;
      if (h !== zone) { marks.push(t + 40); zone = h; }
    }
    marks.push(dur + 30);
    r.arrive.set(uid, marks.map((t) => this.later(t, () => this.arrive(uid))));
    if (notice || dropped) this.changed();
    return notice ? { notice } : null;
  }

  /** 记一次敲门。一直有效，直到敲门的人走开（move 里清掉）、屋里的人回应、或者屋里没人了；不按时间作废（人还站在门口，面板却没了，再点「让他进来」就失败）。 */
  knock(st, uid) {
    st.knocks.add(uid);
    const at = Date.now();
    (st.knockAt ??= new Map()).set(uid, at);
  }

  async arrive(uid) {
    const r = this.roam;
    if (!r) return;
    const at = this.posNow(uid);
    const now = houseAt(r.houses, at.x, at.y)?.id ?? null;
    const was = r.zone.get(uid) ?? null;
    // 正被锁着的门挡出去：往外走的这一小段还在屋里，别每一步都重新"进门被挡、敲门"（屋里人的敲门面板会一直闪）
    if (now && r.bounce?.get(uid) === now) return;
    if (now === was) return;
    if (was) await this.leaveHouse(uid, was);
    if (now) {
      // 锁着门：没被放进来的人（比如锁门前就在往里走的）被挡在门外，变成敲门
      const st = r.state.get(now);
      if (st.locked && st.ids.size && !st.allow.has(uid)) {
        const h = r.houses.find((x) => x.id === now);
        const out = doorPoint(h, 24);
        this.move(uid, out.x, out.y, { force: true });
        (r.bounce ??= new Map()).set(uid, now);
        this.knock(st, uid);
        if (!this.isFake(uid)) this.tell(uid, `${h.name}锁着门，你被挡在了门外。`, 'clock');
        this.changed();
        return;
      }
      await this.enterHouse(uid, now);
    }
  }

  async enterHouse(uid, hid) {
    const r = this.roam;
    const st = r.state.get(hid);
    const h = r.houses.find((x) => x.id === hid);
    if (st.ids.size && this.game && (this.meets ??= []).length < 500) this.meets.push({ at: Date.now(), day: this.game.day, house: hid, who: uid, with: [...st.ids] }); // 谁找谁聊：线下分析用
    st.ids.add(uid);
    st.knocks.delete(uid);
    r.zone.set(uid, hid);
    r.invites?.delete(uid);
    this.changed();
    if (this.isFake(uid)) return;
    this.touchVoice([uid]);
    // 同一间房子的语音操作排队做，免得两个人同时进来建出两个频道
    st.queue = st.queue.then(async () => {
      if (!st.ids.has(uid)) return;
      if (!st.channelId) { st.channelId = await this.safeVoice((v) => v.openRoom(h.name, [uid], null, this.square)); this.ownChannel(st.channelId); }
      else await this.safeVoice((v) => v.addToRoom(st.channelId, uid));
    });
    await st.queue;
  }

  async leaveHouse(uid, hid) {
    const r = this.roam;
    const st = r.state.get(hid);
    st.ids.delete(uid);
    st.allow.delete(uid);
    r.zone.delete(uid);
    if (!st.ids.size) { st.locked = false; st.knocks.clear(); st.allow.clear(); }
    this.changed();
    if (this.isFake(uid)) return;
    this.touchVoice([uid]);
    st.queue = st.queue.then(async () => {
      if (!st.channelId) return;
      if (![...st.ids].some((id) => !this.isFake(id))) {
        const ch = st.channelId;
        st.channelId = null;
        await this.safeVoice((v) => v.closeRoom(ch, this.square));
      } else {
        await this.safeVoice((v) => v.removeFromRoom(st.channelId, uid, this.square));
      }
    });
    await st.queue;
  }

  lock(uid, hid, locked) {
    const st = this.roam?.state.get(hid);
    if (!st) throw new UserError('没有这间房子');
    if (!st.ids.has(uid)) throw new UserError('你得在房子里面才能锁门');
    st.locked = locked;
    if (!locked) { st.knocks.clear(); st.allow.clear(); }
  }

  /** 房子里的人回应敲门：同意就让他走进来。 */
  answerKnock(uid, hid, who, yes) {
    const r = this.roam;
    const st = r?.state.get(hid);
    if (!st) throw new UserError('没有这间房子');
    if (!st.ids.has(uid)) throw new UserError('你不在这间房子里');
    if (!st.knocks.delete(who)) throw new UserError('他已经不在门口了');
    if (!yes) return;
    st.allow.add(who);
    const c = houseCenter(r.houses.find((h) => h.id === hid));
    this.move(who, c.x + (Math.random() - 0.5) * 50, c.y + (Math.random() - 0.5) * 30, { force: true, run: true }); // 放进门：跑进去
  }

  /** 屋里的人邀请别人进来私聊（对方点「过去」就自动走进来，锁着门也能进）。60 秒没回应作废。 */
  invite(uid, hid, who) {
    const r = this.roam;
    const st = r?.state.get(hid);
    if (!st) throw new UserError('没有这间房子');
    if (!st.ids.has(uid)) throw new UserError('你得在房子里才能邀请别人');
    if (!this.game.get(who) || who === uid) throw new UserError('邀请谁？');
    if (st.ids.has(who)) throw new UserError('他已经在屋里了');
    if (this.matronBlocks(who, st)) throw new UserError('女舍监在场：只能和左右邻座私聊');
    const at = Date.now();
    (r.invites ??= new Map()).set(who, { house: hid, from: uid, at });
    this.later(60_000, () => { if (r.invites?.get(who)?.at === at) r.invites.delete(who); });
    if (this.isFake(who)) this.later(1500 + Math.random() * 2000, () => this.inviteReply(who, true));
    return { notice: `已邀请 ${this.game.name(who)}` };
  }

  inviteReply(uid, yes) {
    const r = this.roam;
    const inv = r?.invites?.get(uid);
    if (!inv) throw new UserError('邀请已经过期了');
    r.invites.delete(uid);
    if (!yes) return null;
    const st = r.state.get(inv.house);
    if (!st.ids.size) throw new UserError('屋里已经没人了');
    st.allow.add(uid);
    const c = houseCenter(r.houses.find((h) => h.id === inv.house));
    this.move(uid, c.x + (Math.random() - 0.5) * 50, c.y + (Math.random() - 0.5) * 30, { force: true, run: true }); // 接受邀请：按跑的速度过去（2026-11-18 用户）
    return null;
  }

  /** 提前集合要几票：这局所有真人玩家（死了的也算）都同意。 */
  roamVoteNeed() {
    return Math.max(1, this.realIds().length);
  }

  /** 投票提前结束自由活动：所有人都同意就立刻集合。再点一次是撤回。 */
  async roamVote(uid, yes) {
    const r = this.roam;
    if (!r) throw new UserError('现在不是自由活动时间');
    if (!this.game.get(uid) || this.isFake(uid)) throw new UserError('只有这局的玩家能投票');
    const first = r.endVotes.size === 0;
    if (yes) r.endVotes.add(uid); else r.endVotes.delete(uid);
    const need = this.roamVoteNeed();
    if (yes && first) this.announce(`${this.name(uid)} 提议提前集合（${r.endVotes.size}/${need}）`, 'day');
    if (r.endVotes.size >= need) await this.endRoam('所有人都同意提前集合');
  }

  /** 机器人玩家在街上随便溜达（不进房子），让地图有点生气。 */
  wander() {
    this.later(2500 + Math.random() * 3500, async () => {
      if (!this.roam || this.game?.mark) return; // 暗印的机器人自己找人看后颈（server/mark.js 的 botRoam）
      const bots = this.game.players.filter((p) => this.isFake(p.id) && p.id !== SEAT7);
      if (!bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      // 别往锁着门的房子里走（会变成敲门，过一会儿又走开，屋里人的敲门面板一闪一闪）
      let pt = this.town.randomSpot(this.roam.houses);
      for (let k = 0; k < 8 && this.roam.state.get(houseAt(this.roam.houses, pt.x, pt.y)?.id)?.locked; k++) pt = this.town.randomSpot(this.roam.houses);
      if (this.roam.state.get(houseAt(this.roam.houses, pt.x, pt.y)?.id)?.locked) { this.wander(); return; }
      this.move(bot.id, pt.x, pt.y);
      this.wander();
    });
  }

  /** 自由活动快结束：剩 30 秒时说书人提醒一句（不限时、或者本来就不到 45 秒的不提醒）。 */
  scheduleRoamSoon() {
    const r = this.roam;
    this.cancel(this.roamSoonTimer);
    if (!r?.until || r.until - (r.since ?? 0) <= 45_000) return;
    const at = r.until - 30_000 - Date.now();
    if (at < 0) return; // 已经过了提醒的时刻（比如服务器重启时只剩不到 30 秒）
    this.roamSoonTimer = this.later(at, () => {
      if (this.roam !== r) return;
      this.announce('还有 30 秒就要敲钟集合了——私聊的抓紧说完。', 'clock');
      this.narrate('roamSoon');
    });
  }

  /** 集合：所有人回广场，房子的语音频道全部关掉。reason 为 null 时不发公告（入夜等场合）。 */
  async endRoam(reason = null) {
    const r = this.roam;
    if (!r) return;
    this.roam = null;
    this.cancel(this.roamTimer);
    this.cancel(this.roamSoonTimer);
    for (const t of r.arrive.values()) this.cancel(t);
    // 房子同时关：一间一间关的话，合作机器人慢的时候集合要等很久
    await Promise.all([...r.state.values()].map(async (st) => {
      await st.queue.catch(() => {});
      if (st.channelId) await this.safeVoice((v) => v.closeRoom(st.channelId, this.square));
    }));
    if (reason !== null) {
      this.announce(`集合！${reason ? `（${reason}）` : ''}大家回到广场，现在可以提名了。`, 'day');
      this.narrate('gather');
      // 自动说书：回到广场后开放提名（暗印：回到广场公审）
      if (this.game?.mark) this.later(this.settings.pauseMs / 2, () => this.mk.gathered());
      else if (!this.stId) this.later(this.settings.pauseMs / 2, () => this.openNominations());
    }
  }

  /** 开私聊房间，把人拉进去。withSt：主持人也进去（单独谈话）。 */
  async openRoom(members, minutes, withSt = null) {
    const real = members.filter((id) => !this.isFake(id));
    for (const r of [...this.rooms.values()]) {
      if (r.members.some((id) => real.includes(id))) await this.closeRoom(r.channelId);
    }
    const label = members.map((id) => this.name(id).replace(/^\d+号 /, '')).join('·');
    // 夜里说书人单独叫人：先给他解除闭耳，回去时再闭上
    const asleep = this.game?.phase === 'night' && this.settings.nightDeafen && this.square;
    if (asleep) await this.safeVoice((v) => v.setAsleep(real, false, this.square));
    this.touchVoice(real);
    const channelId = await this.safeVoice((v) => v.openRoom(`${label}`, real, withSt, this.square));
    this.ownChannel(channelId);
    const room = { channelId: channelId ?? `local-${newId()}`, members, withSt, asleep, until: minutes ? Date.now() + minutes * 60_000 : null };
    this.rooms.set(room.channelId, room);
    this.announce(`${members.map((id) => `**${this.name(id)}**`).join(' 和 ')} 去私聊了${minutes ? `（${minutes} 分钟）` : ''}`, 'whisper');
    if (minutes) room.timer = this.later(minutes * 60_000, () => this.closeRoom(room.channelId, '时间到'));
  }

  async endWhisper(uid, roomId) {
    const room = this.rooms.get(roomId) ?? [...this.rooms.values()].find((r) => r.members.includes(uid));
    if (!room) throw new UserError('你不在私聊里');
    if (!room.members.includes(uid) && !this.isHost(uid)) throw new UserError('你不在这个私聊里');
    await this.closeRoom(room.channelId, `${this.name(uid)} 结束了私聊`);
  }

  async pull(uid, targets, minutes) {
    const g = this.requireGame();
    const ids = [...new Set(targets)].filter((id) => g.get(id));
    if (!ids.length) throw new UserError('选要拉的人');
    await this.openRoom(ids, minutes, ids.length === 1 || this.stId ? uid : null);
  }

  async closeRoom(channelId, reason = '') {
    const room = this.rooms.get(channelId);
    if (!room) return;
    this.rooms.delete(channelId);
    this.cancel(room.timer);
    this.touchVoice(room.members);
    if (!channelId.startsWith('local-')) await this.safeVoice((v) => v.closeRoom(channelId, this.square));
    if (room.asleep && this.game?.phase === 'night') {
      await this.safeVoice((v) => v.setAsleep(room.members.filter((id) => !this.isFake(id)), true, this.square));
    }
    if (reason) this.announce(`私聊结束（${reason}）`, 'whisper', false);
  }

  async closeAllRooms() {
    await Promise.all([...this.rooms.keys()].map((id) => this.closeRoom(id)));
  }

  async gather() {
    await this.endRoam('');
    await this.closeAllRooms();
    if (this.square) await this.safeVoice((v) => v.moveAll(this.realIds(), this.square));
    this.announce('所有人回到城镇广场');
  }

  /**
   * AI 说书时房主也能判一个人疯狂失败、当场处决（2026-11-12 用户：畸形秀演员说漏了，系统没听到）。
   * 白天才行、算今天的处决；只有梦殒春宵引擎的剧本有疯狂。不看他是不是真的在疯狂里，由房主负责。
   */
  hostMadExecute(target) {
    const g = this.requireGame();
    if (g.engine !== 'snv') throw new UserError('这个剧本没有疯狂');
    if (g.phase !== 'day' || this.ended || this.dusking) throw new UserError('白天才能处决');
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名投票结束再处决');
    const p = g.get(target);
    if (!p) throw new UserError('选择一名玩家');
    if (!g.madExecute(p.id, '房主判定疯狂失败')) throw new UserError('今天已经处决过了');
    this.pub(p.alive || g.lastExecuted === p.id ? `**${g.name(p.id)}** 因为疯狂被处决了！今天的处决已经发生。` : `已经死去的 **${g.name(p.id)}** 也没能逃过疯狂的审判。今天的处决已经发生。`, 'death');
    this.klutzNotice();
    if (g.winner) this.later(0, () => this.endGame());
    else this.later(this.settings.pauseMs, () => this.autoDusk());
  }

  // ───────────── 说书人 ─────────────
  async stAction({ action, target, role, text }) {
    if (!this.stId) throw new UserError('说书人工具只在真人说书模式下可用');
    const g = this.requireGame();
    const p = g.get(target);
    if (!p) throw new UserError('选择一名玩家');
    switch (action) {
      case 'nominate': { // 主教在场：只有说书人可以提名
        if (!g.bishopOn?.()) throw new UserError('主教不在场时由玩家提名');
        if (this.pendingNom || this.vote) throw new UserError('还有一场提名/投票没结束');
        if (g.nominees.has(p.id)) throw new UserError(`${g.name(p.id)} 今天已经被提名过了`);
        if (p.traveller) throw new UserError('旅行者不能被提名处决');
        g.nominees.add(p.id); (g.nomBy ??= {})[p.id] = 'storyteller';
        g.record('nominate', `说书人（主教）提名了 ${g.tag(p.id)}`);
        this.announce(`**说书人**提名了 **${g.name(p.id)}**`, 'vote');
        this.pendingNom = { nominator: 'storyteller', nominee: p.id };
        break;
      }
      case 'kill': g.stKill(p.id); break;
      case 'artistAnswer': {
        const ask = this.artistAsks?.find((x) => x.uid === p.id);
        if (!ask || !['true', 'false', 'unknown'].includes(text)) throw new UserError('这个问题已经答过了');
        this.artistAsks = this.artistAsks.filter((x) => x !== ask);
        this.artistReply(p.id, ask.text, text);
        break;
      }
      case 'revive': g.stRevive(p.id); break;
      case 'madExecute':
        if (g.engine !== 'snv') throw new UserError('这个剧本没有疯狂');
        if (!g.madExecute(p.id, '说书人判定不够疯狂', { night: g.phase === 'night' })) throw new UserError(g.phase === 'night' ? '他已经死了' : '今天已经处决过了');
        this.pub(g.phase === 'night' ? `夜里，**${g.name(p.id)}** 因为疯狂被处决了！` : `**${g.name(p.id)}** 因为疯狂被处决了！`, 'death');
        this.klutzNotice();
        break;
      case 'poison': g.poisonTarget = p.id; break;
      case 'role':
        g.setRole(p.id, role);
        this.tell(p.id, `你现在是 **${ROLES[role].name}**。`, 'storyteller');
        break;
      case 'tell':
        if (!text?.trim()) throw new UserError('写点内容');
        this.tell(p.id, text.trim(), 'storyteller');
        break;
      default: throw new UserError('未知操作');
    }
    if (action === 'kill' && g.phase === 'day') this.pub(`**${g.name(p.id)}** 死了。`, 'death');
    if (g.winner && (g.phase !== 'night' || action === 'madExecute')) await this.endGame(); // 夜里的处决当场公布，胜负也当场定
  }

  // ───────────── 结束 ─────────────
  async endGame() {
    if (this.ended) return;
    this.ended = true;
    this.closeHearing();
    this.vote = null;
    this.pendingNom = null;
    this.clearRiot();
    this.deadline = null;
    const g = this.game;
    this.clearNoms();
    // 先公布结果：语音收尾（关房间、解开闭麦）要等合作机器人，慢的时候大家会一直卡在最后一刻
    const won = g.werewolf ? { good: '好人阵营获胜！', evil: '狼人阵营获胜！' } : { good: '善良阵营获胜！', evil: '邪恶阵营获胜！' };
    this.announce(`${won[g.winner]} ${g.winReason}`, 'end');
    await this.judgePoliticianNow(g);
    if (!this.tutorial) this.onEnded?.(this); // 永久存档这一局
    this.openMvp(g);
    this.narrate('end', { team: g.winner, reason: g.winReason });
    this.changed();
    await this.endRoam();
    await this.closeAllRooms();
    await this.nightVoice;
    if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square));
    this.syncWatchMute();
  }

  // ───────────── 语音校正 ─────────────

  /** 这些人刚被拉过（进出房子、私聊），校正先等一会儿再管他们。 */
  touchVoice(ids) {
    this.voiceTouched ??= new Map();
    for (const id of ids) this.voiceTouched.set(id, Date.now());
  }

  /** 这个人现在应该在哪个语音频道：私聊房间 > 自己所在的房子 > 广场。 */
  voiceWant(uid) {
    for (const r of this.rooms.values()) if (r.members.includes(uid) && !r.channelId.startsWith('local-')) return r.channelId;
    for (const st of this.roam?.state.values() ?? []) if (st.ids.has(uid) && st.channelId) return st.channelId;
    return this.square;
  }

  /** 记下这局开过的语音频道（关掉以后万一没删成、里面还有人，也能把人拉回广场）。 */
  ownChannel(id) {
    if (!id) return;
    this.ownedChannels ??= new Set();
    this.ownedChannels.add(id);
  }

  /** 这局管着的语音频道：广场、各房子、私聊、开过的频道。只校正在这些频道里的人（自己跑去别的频道的不管）。 */
  managedChannels() {
    const out = new Set([...(this.square ? [this.square] : []), ...(this.ownedChannels ?? [])]);
    for (const r of this.rooms.values()) if (!r.channelId.startsWith('local-')) out.add(r.channelId);
    for (const st of this.roam?.state.values() ?? []) if (st.channelId) out.add(st.channelId);
    return out;
  }

  /** 对一遍：该在广场却还卡在房子里的拉回广场，该在房子里却没进去的拉进去。返回拉了几个人。 */
  async reconcileVoice() {
    if (!this.game || this.ended || this.paused || !this.square || !this.voice?.where || this.reconciling) return 0;
    this.reconciling = true;
    let fixed = 0;
    try {
      const managed = this.managedChannels();
      for (const id of this.realIds()) {
        if (Date.now() - (this.voiceTouched?.get(id) ?? 0) < VOICE_GRACE_MS) continue;
        const at = await this.voice.where(id);
        if (!at || !managed.has(at)) continue;
        const want = this.voiceWant(id);
        if (!want || at === want) continue;
        if (await this.voice.move(id, want)) {
          fixed++;
          console.log(`🔧 语音校正 ${this.key}：${this.game.name(id)} 在错的频道，拉到${want === this.square ? '广场' : '该在的房间'}`);
        }
        this.touchVoice([id]);
      }
    } catch (e) {
      console.warn('[botc] 语音校正失败：', e.message);
    } finally { this.reconciling = false; }
    return fixed;
  }

  /** 玩家自己点"语音归位"：马上把他拉到该在的频道（不管他现在在哪个频道）。 */
  async fixVoice(uid) {
    if (!this.game || this.ended) throw new UserError('游戏还没开始');
    if (!this.voice?.where || !this.square) throw new UserError('这局没有接上 Discord 语音');
    const want = this.game.get(uid) ? this.voiceWant(uid) : this.square;
    // 顺便把本局不该再闭着他的闭麦解开（卡住的闭麦自救）：只留下现在确实该闭的原因
    const keep = [
      ...(this.speechMuted?.has(uid) ? ['speech'] : []),
      ...(this.watchMuted?.includes(uid) ? ['watch'] : []),
      ...(this.wwMuted?.includes(uid) ? ['dead'] : []), // 狼人杀：死人闭麦
      ...(this.game.phase === 'night' && this.settings.nightDeafen && !this.paused && this.game.get(uid) ? ['asleep'] : []),
    ];
    await this.safeVoice((v) => v.releaseMine?.(uid, keep));
    const at = await this.voice.where(uid);
    if (!at) throw new UserError('你现在不在语音频道里，先进语音');
    if (at === want) return { notice: '语音没问题：你已经在该在的频道里了' };
    if (!(await this.voice.move(uid, want))) throw new UserError('拉人没成功，过几秒再试一次');
    this.touchVoice([uid]);
    console.log(`🔧 语音归位 ${this.key}：${this.users.get(uid)?.name ?? uid} 自己点了归位`);
    return { notice: want === this.square ? '已经把你拉回广场' : '已经把你拉回你在的房间' };
  }

  /** 开局 / 恢复后每隔几秒校正一次（暂停、回大厅时跟着计时器一起停）。 */
  watchVoice() {
    if (!this.voice?.where) return;
    if (this.voiceTimer) { clearInterval(this.voiceTimer); this.timers.delete(this.voiceTimer); }
    this.voiceTimer = setInterval(() => this.reconcileVoice(), VOICE_CHECK_MS);
    this.voiceTimer.unref?.();
    this.timers.add(this.voiceTimer);
  }

  // ───────────── 没人在线就暂停 / 一个语音频道只许一局 ─────────────

  /** 这局还有真人（玩家或说书人）开着小程序吗。 */
  anyoneOnline() {
    return this.realIds().some((id) => this.online.has(id)) || (!!this.stId && this.online.has(this.stId));
  }

  /** uid 当房主。真人说书时房主不能坐着当玩家。 */
  takeHost(uid) {
    this.hostId = uid;
    this.hostSeen = Date.now();
    if (!this.game && this.stId) this.lobby = this.lobby.filter((x) => x.id !== uid);
    this.announce(`${this.name(uid)} 成了房主`);
    this.syncWatchMute();
  }

  /**
   * 房主自己让出房主：交给在线的人，先找坐着的真人（开局后是这局的玩家），没有再找观战的。
   * 真人说书进行中不能让（房主就是说书人，换人等于换说书人）。
   */
  releaseHost(uid) {
    if (uid !== this.hostId) throw new UserError('你不是房主');
    if (this.game && !this.ended && this.stId) throw new UserError('真人说书进行中，不能让出房主');
    const seated = this.game ? this.realIds() : this.lobby.filter((p) => !p.fake).map((p) => p.id);
    const next = seated.find((id) => id !== uid && this.online.has(id)) ?? [...this.online].find((id) => id !== uid && !this.isFake(id));
    if (!next) throw new UserError('现在没有别人在线，没人能接手');
    this.announce(`${this.name(uid)} 让出了房主`);
    this.takeHost(next);
  }

  /** 房主离线一小会儿（断线重连不算）还没回来，房主交给在线的人，不然没人能开局。真人说书进行中不换。 */
  hostWatch() {
    const stay = this.tutorial || this.online.has(this.hostId) || (this.game && !this.ended && this.stId);
    if (stay || !this.online.size) { clearTimeout(this.hostTimer); this.hostTimer = null; return; }
    if (this.hostTimer) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      if (this.online.has(this.hostId) || (this.game && !this.ended && this.stId)) return;
      const seated = this.game ? this.realIds() : this.lobby.map((p) => p.id);
      const next = seated.find((id) => this.online.has(id)) ?? [...this.online][0];
      if (!next) return;
      this.takeHost(next);
      this.changed();
    }, this.hostGoneMs ?? HOST_GONE_MS);
    this.hostTimer.unref?.();
  }

  /** 有人进出时调用：真人全离线就倒计时暂停；有人回来就接着打。 */
  presence() {
    this.hostWatch();
    if (!this.game || this.ended || this.tutorial) return;
    if (this.anyoneOnline()) {
      this.cancel(this.idleTimer); this.idleTimer = null;
      if (this.paused) this.unpause();
      return;
    }
    if (!this.paused && !this.idleTimer) this.idleTimer = this.later(this.idlePauseMs ?? IDLE_PAUSE_MS, () => { this.idleTimer = null; if (!this.anyoneOnline()) return this.pause(); });
  }

  /** 暂停：计时器全停（机器人不再提名、不再天黑天亮），语音里的闭麦闭耳全部放开。 */
  async pause() {
    if (!this.game || this.ended || this.paused) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.paused = true;
    this.announce(this.solo ? '你离开了，对局暂停。回来就接着打。' : '大家都离开了，对局暂停，语音里的闭麦闭耳已经放开。有人回来会自动接着打。', 'clock');
    await this.syncGame();
    if (this.watchMuted?.length) { const ids = this.watchMuted; this.watchMuted = []; await this.safeVoice((v) => v.setMuted?.(ids, false, 'watch')); }
    await this.wwReleaseMute();
    await this.speakOnly(null);
    if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square));
    this.changed();
  }

  unpause() {
    if (!this.paused) return;
    this.paused = false;
    this.resume('有人回来了，对局接着打。');
    const nom = this.pendingNom;
    if (nom?.stage) this.speakOnly(nom.stage === 'accuse' ? nom.nominator : nom.nominee); // 正在发言的人接着说，别人接着闭麦
    this.syncWatchMute();
    this.changed();
  }

  /**
   * 开局前占住广场：同一个语音频道已经有别的局在进行，就不让开（不然两局一起闭麦）。
   * 那局的真人全都不在了（暂停或正等着暂停），就直接结束它，把广场让出来。
   */
  async claimSquare(square) {
    if (!square || !this.peers) return;
    const other = [...this.peers()].find((r) => r !== this && !r.tutorial && r.guildId === this.guildId && r.game && !r.ended && r.square === square);
    if (!other) return;
    if (other.paused || !other.anyoneOnline()) {
      other.announce('这个语音频道开了新的一局，这局没人在玩，已经结束。', 'clock');
      await other.teardown();
      other.reset();
      other.changed();
      return;
    }
    const host = other.users.get(other.hostId)?.name ?? '另一位房主';
    throw new UserError(`这个语音频道已经有一局在进行（${host} 从另一个频道开的，第 ${other.game.day} 天）。等那局打完，或者请那局的房主在「房主」菜单里结束它。`);
  }

  async teardown() {
    this.closeHearing(); // 房主中途结束不走 endGame，这里也要让机器人退出语音
    clearTimeout(this.hostTimer); this.hostTimer = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    await this.syncGame(false);
    if (this.watchMuted?.length) { const ids = this.watchMuted; this.watchMuted = []; await this.safeVoice((v) => v.setMuted?.(ids, false, 'watch')); }
    await this.wwReleaseMute();
    await this.speakOnly(null);
    await this.endRoam();
    await this.closeAllRooms();
    if (this.game && this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square));
  }

  // ───────────── 存档 / 读档 ─────────────
  // 服务器重启（部署、崩溃、Mac mini 重启）后，正在进行的对局从 data/rooms/ 读回来接着玩。
  // 计时器存不下来，读档后按"现在处在哪一步"重新排好（剩余时间照旧，太短的给几秒缓冲）。

  snapshot() {
    const entries = (m) => [...m.entries()];
    const r = this.roam;
    return {
      v: 1,
      savedAt: Date.now(),
      key: this.key, guildId: this.guildId, hostId: this.hostId, settings: this.settings, artistAsks: this.artistAsks ?? [],
      users: [...this.users.values()], lobby: this.lobby, roleAssign: this.roleAssign ?? {}, newbies: this.newbies ?? [],
      game: this.game?.toJSON() ?? null,
      ended: this.ended, square: this.square, log: this.log, logSeq: this.logSeq, logEpoch: this.epoch, stLog: this.stLog,
      inbox: entries(this.inbox), acts: entries(this.acts ?? new Map()), pendingInfo: entries(this.pendingInfo),
      resolving: this.resolving, rkPending: this.rkPending, revivePending: this.revivePending ?? null, deadline: this.deadline, nightBase: this.nightBase ?? null, dueFor: this.dueFor ?? {}, dawnAt: this.dawnAt ?? null,
      roamedToday: !!this.roamedToday, duskDay: this.duskDay ?? null, homes: this.homes ?? null, pelted: this.pelted ?? {}, pelts: this.pelts ?? {}, talk: this.talk ?? [], tableRead: this.tableRead ?? null,
      pendingNom: this.pendingNom,
      noms: this.noms && { until: this.noms.until, paused: this.noms.paused, timeUp: this.noms.timeUp, skips: [...this.noms.skips] },
      vote: this.vote && { ...this.vote, yes: [...this.vote.yes], locked: [...this.vote.locked] },
      lastVote: this.lastVote ?? null,
      voteHistory: this.voteHistory ?? [], knifeLog: this.knifeLog ?? [], execLog: this.execLog ?? [], pubLog: this.pubLog ?? [],
      beliefs: this.beliefs ?? null, meets: this.meets ?? [],
      outfits: [...this.outfits],
      watchMuted: this.watchMuted ?? [],
      paused: !!this.paused,
      rooms: [...this.rooms.values()].map(({ timer, ...x }) => x),
      roam: r && {
        until: r.until, since: r.since ?? null, pos: entries(r.pos), zone: entries(r.zone), endVotes: [...(r.endVotes ?? [])],
        state: entries(r.state).map(([id, st]) => [id, { ids: [...st.ids], locked: st.locked, knocks: [...st.knocks], allow: [...st.allow], channelId: st.channelId }]),
      },
    };
  }

  restore(s) {
    this.hostId = s.hostId;
    this.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    if ((s.settings?.settingsVersion ?? 1) < 2) Object.assign(this.settings, { nightDeafen: false, hideVotes: false, settingsVersion: 2 });
    if ((this.settings.settingsVersion ?? 1) < 3) Object.assign(this.settings, { muteSpectators: false, settingsVersion: 3 });
    if ((this.settings.settingsVersion ?? 1) < 4 && !s.game) Object.assign(this.settings, { smallNoBaron: false, minionBluffs: false, settingsVersion: 4 }); // 进行中的局不改（爪牙已经看过伪装），下次读档再改
    for (const u of s.users ?? []) this.users.set(u.id, u);
    this.lobby = s.lobby ?? [];
    this.roleAssign = s.roleAssign ?? {};
    this.newbies = s.newbies ?? [];
    this.game = s.game ? (s.game.werewolf ? Werewolf.fromJSON(s.game) : s.game.avalon ? Avalon.fromJSON(s.game) : s.game.mark ? MarkGame.fromJSON(s.game) : Game.fromJSON(s.game)) : null;
    this.wireGame();
    Object.assign(this, {
      artistAsks: s.artistAsks ?? [], ended: s.ended, square: s.square, log: s.log ?? [], logSeq: s.logSeq ?? 0, epoch: s.logEpoch ?? this.epoch, stLog: s.stLog ?? [],
      inbox: new Map(s.inbox ?? []), acts: new Map(s.acts ?? []), pendingInfo: new Map(s.pendingInfo ?? []),
      resolving: s.resolving, rkPending: s.rkPending, revivePending: s.revivePending ?? null, deadline: s.deadline, nightBase: s.nightBase ?? s.deadline ?? null, dueFor: s.dueFor ?? {}, dawnAt: s.dawnAt ?? null,
      roamedToday: s.roamedToday, duskDay: s.duskDay, homes: s.homes ?? null, pendingNom: s.pendingNom, lastVote: s.lastVote,
      voteHistory: s.voteHistory ?? [], knifeLog: s.knifeLog ?? [], execLog: s.execLog ?? [], pubLog: s.pubLog ?? [],
      beliefs: s.beliefs ?? null, meets: s.meets ?? [],
      outfits: new Map(s.outfits ?? []),
      pelted: s.pelted ?? {}, pelts: s.pelts ?? {}, talk: s.talk ?? [], tableRead: s.tableRead ?? null,
      watchMuted: [], // 机器人重启时账上的闭麦都解开了：resume 里重新闭上
      paused: !!s.paused,
    });
    this.noms = s.noms && { ...s.noms, skips: new Set(s.noms.skips) };
    this.vote = s.vote && { ...s.vote, yes: new Set(s.vote.yes), locked: new Set(s.vote.locked) };
    this.rooms = new Map((s.rooms ?? []).map((x) => [x.channelId, x]));
    if (s.roam && this.game) {
      this.roam = {
        houses: this.town.housesFor(),
        until: s.roam.until, since: s.roam.since ?? null, pos: new Map(s.roam.pos), zone: new Map(s.roam.zone), arrive: new Map(), endVotes: new Set(s.roam.endVotes ?? []),
        state: new Map(s.roam.state.map(([id, st]) => [id, { ...st, ids: new Set(st.ids), knocks: new Set(st.knocks), allow: new Set(st.allow), queue: Promise.resolve() }])),
      };
      // 旧存档只记了当时开放的房子：现在全开，缺的补上
      for (const h of this.roam.houses) if (!this.roam.state.has(h.id)) this.roam.state.set(h.id, blankHouse());
    }
    return this;
  }

  /** 读档后（或暂停后有人回来）把该有的计时器重新排上。 */
  resume(why = '服务器刚刚重启过，对局已经恢复，接着玩。') {
    const g = this.game;
    if (!g || this.ended || this.paused) return;
    if (g.werewolf) { this.wwResume(why); return; }
    const left = (until, min = 5000) => Math.max(min, (until ?? 0) - Date.now());
    this.announce(why, 'clock');
    this.watchVoice();
    this.syncWatchMute(); // 观战的人重新闭上（重启时都被解开了）
    for (const r of this.rooms.values()) if (r.until) r.timer = this.later(left(r.until), () => this.closeRoom(r.channelId, '时间到'));
    // 令牌和文字都不存档：重启后重新打开、发新的。全员离线后回来不算重启，已经收到的话不能清掉
    if (g.avalon) return this.av.resume();
    if (g.mark) return this.mk.resume();
    if (!this.hearing && !this.mic) this.openHearing().then(() => { if (this.game === g && g.phase === 'day') this.hearToday(); });
    if (g.phase === 'night') {
      const night = g.night;
      // 机器人重启时会先把所有人解除闭耳，夜里要重新闭上
      if (this.settings.nightDeafen && this.square) this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square));
      if (!this.resolving) {
        if (this.deadline) this.nightTimer = this.later(left(this.nightBase ?? this.deadline), () => this.nightTimeout(night));
        else this.later(3000, () => this.finishNight(night));
      } else if (this.revivePending) { // 重启前正等夜里刚被复活的人选：接着等
        const id = this.revivePending;
        this.deadline = Date.now() + left(this.deadline, 15000);
        this.reviveTimer = this.later(this.deadline - Date.now(), () => { if (!g.choices[id]) this.autoPick(id, night); this.resumeNight(night); });
      } else if (this.rkPending) {
        const rk = this.rkPending;
        this.deadline = Date.now() + left(this.deadline, 15000);
        this.rkTimer = this.later(this.deadline - Date.now(), () => this.onRavenkeeper(rk, g.players[0].id));
      } else if (!this.stId) this.later(3000, () => this.beginDay());
      return;
    }
    if (g.phase !== 'day') return;
    if (this.vote) {
      // 投票从指针当前位置接着转；还没开始转的重新倒计时
      if (this.vote.idx < 0) {
        this.deadline = Date.now() + this.settings.voteCountdown * 1000;
        this.later(this.settings.voteCountdown * 1000, () => this.voteTick());
      } else this.later(this.settings.voteSeconds * 1000, () => this.voteTick());
      return;
    }
    if (this.roam) {
      const r = this.roam;
      if (r.until) this.roamTimer = this.later(left(r.until), () => this.endRoam('时间到'));
      this.scheduleRoamSoon();
      for (const [id, m] of r.pos) if (m.start + m.dur > Date.now()) r.arrive.set(id, [this.later(m.start + m.dur - Date.now() + 30, () => this.arrive(id))]);
      this.wander();
      return;
    }
    // 重启时正好卡在暴乱的提名链中间：轮到的人重新计时（真人说书也一样，提名链不用说书人推）
    if (g.riotChain && g.riotOn?.() && !g.winner && this.duskDay !== g.day) { this.riotNext(g.riotChain); return; }
    // 重启时正好在黄昏：结算过了，直接入夜（真人说书也一样，dusk 不会再结算第二次）
    if (this.duskDay === g.day) { if (g.pendingMoonchild || g.pendingKlutz) this.nightAfterDusk(); else this.later(3000, () => this.beginNight()); return; }
    if (this.stId) return;
    // 下面都是自动说书
    if (this.pendingNom?.stage) {
      const nom = this.pendingNom;
      this.speechMuted = null; // 重启前闭上的那些机器人已经解开了：重新闭（不然这一段结束时没人记得要解开）
      this.speakOnly(nom.stage === 'accuse' ? nom.nominator : nom.nominee);
      this.stageTimer = this.later(left(nom.until), () => {
        if (this.pendingNom !== nom) return;
        if (nom.stage === 'accuse') this.nomStage('defend'); else this.openVote();
      });
      return;
    }
    if (this.noms) {
      if (this.noms.timeUp || this.nomsDone() || g.executedToday) this.later(3000, () => this.autoDusk());
      else { this.scheduleNoms(this.noms.paused ?? left(this.noms.until, 15000)); this.botsConsider(); }
      return;
    }
    if (!this.roamedToday) this.later(3000, () => { if (!this.roam && !this.ended) this.startRoam(this.settings.roamMinutes); });
    else this.later(3000, () => this.openNominations());
  }

  // ───────────── 视图：每个人看到的不一样 ─────────────
  viewFor(uid) {
    const g = this.game;
    const isST = uid === this.stId;
    const view = {
      gameId: g?.id ?? null,
      key: this.key,
      me: uid,
      hostId: this.hostId,
      hostOnline: this.online.has(this.hostId),
      hostName: this.users.get(this.hostId)?.name ?? null,
      isHost: this.isHost(uid),
      isST,
      hearAvailable: !!this.hearingFor,
      settings: this.settings,
      lobby: this.lobby.map((p) => ({ ...p, outfit: this.outfits.get(p.id) ?? null })),
      roleAssign: this.isHost(uid) && !g ? this.roleAssign ?? {} : null, // 房主指定的角色：只发给房主
      newbies: this.isHost(uid) ? this.newbies ?? [] : [], // 新手标记只有房主看得到：新手当邪恶的概率被调低了，别人看得到就能据此排除
      myOutfit: this.outfits.get(uid) ?? null,
      coins: this.wallet && !this.isFake(uid) ? this.wallet.balance(uid) : null, // 金币余额（没开钱包时 null）
      pelted: this.pelted ?? {}, // 惩罚场外：谁头上叠了什么
      peltLeft: g ? PELT_PER_DAY - (this.pelts?.[`${g.day}:${uid}`] ?? 0) : 0,
      log: this.log.slice(-40),
      logEpoch: this.epoch,
      now: Date.now(),
      deadline: this.deadlineFor(uid),
      moonchildDue: this.moonchildDue ?? null,
      voiceReady: !!this.square,
      tutorial: !!this.tutorial,
      solo: !!this.solo, // 网页单机试玩（server/solo.js）：没有语音、收音、金币，前端藏掉相关的按钮
      // 观战席：在线但没坐下（大厅）/ 不在这局里（游戏中）的人
      watchers: [...this.online].filter((id) => (g ? !g.get(id) : !this.lobby.some((p) => p.id === id)) && id !== this.stId)
        .map((id) => { const u = this.users.get(id); return { id, name: u?.name ?? '?', avatar: u?.avatar ?? null }; }),
    };
    if (!g) return { ...view, phase: 'lobby' };
    if (g.werewolf) return this.wwView(uid, view);
    if (g.avalon) return this.av.view(uid, view);
    if (g.mark) return this.mk.view(uid, view);

    const spectator = !isST && !g.get(uid);
    const showRoles = isST || this.ended || (spectator && this.settings.spectatorGrimoire);
    // 结算完到天亮公布之前：谁都看不到今晚谁死了，死者本人也一样（夜里的疯狂处决当场公布，不在这里面）。
    // 以前本人当场就看到自己死了：结算中途停下来等人现选时，赌错的赌徒已经死、恶魔还没刀，手快就分得出是赌死的还是被刀的（2026-11-11 玩家反馈）
    const hushed = new Set(g.phase === 'night' && !showRoles ? g.nightDeaths.filter((id) => !g.visAlive(g.get(id))) : []);
    const vote = this.vote ?? null;
    Object.assign(view, {
      // 开局时游戏先处在 setup（发身份、找语音频道要几秒）：前端当成第一夜，不要露出白天的广场
      phase: this.ended ? 'ended' : g.phase === 'setup' ? 'night' : g.phase,
      spectator,
      script: g.script,
      dayStage: g.phase !== 'day' ? null : this.roam ? 'roam' : this.roamedToday ? 'square' : 'morning',
      // 阶段之间的几秒停顿（天亮 → 自由活动、集合 → 开放提名、黄昏 → 入夜）：前端只显示过渡卡片，不露出提名/投票面板
      transit: this.transit(),
      homes: this.homes ?? null, // playerId → 房子 id（公开）
      killScene: this.hasKillScene(), // 夜里有没有「冲到对方家门口破门」的过场（有家不一定有）
      night: Math.max(1, g.night),
      day: g.day,
      threshold: g.threshold(),
      aliveCount: g.visAliveCount() + hushed.size, // 看起来活着的人数：假死的僵怖算死人，不然一看人数就知道谁是僵怖
      block: g.block,
      blockVotes: g.blockVotes,
      blockTied: g.blockTied ?? [],
      executedToday: g.executedToday,
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: g.visAlive(p) || hushed.has(p.id), ghostVote: p.ghostVote,
        avatar: this.lobby.find((x) => x.id === p.id)?.avatar ?? null,
        char: this.lobby.find((x) => x.id === p.id)?.char ?? null,
        outfit: this.outfits.get(p.id) ?? null,
        fake: this.isFake(p.id), seat7: !!p.seat7,
        nominated: g.nominees.has(p.id), nominator: g.nominators.has(p.id), shot: (g.shooters ?? []).includes(p.id),
        traveller: !!p.traveller, left: !!p.left, travellerRole: p.traveller ? ROLES[p.role].name : null, // 旅行者的角色是公开的（阵营不公开）
        mic: this.mics?.[p.id] ?? null, // 'server' 被闭麦 / 'self' 自己闭麦
        online: this.online.has(p.id),
        ...(showRoles ? this.grimEntry(p) : {}),
      })),
      pendingNom: this.pendingNom,
      riot: this.riotStep ? { id: this.riotStep.id, until: this.riotStep.until, must: this.riotStep.must, mine: this.riotStep.id === uid } : null, // 暴乱：谁在想下一个提名谁
      riotScript: !!SCRIPTS[g.script]?.riot,
      // 旅行者：观战的人可以加入（白天）；流放举手；枪手 / 法官能不能用
      travellers: this.travellersOk(g) ? travellerList(g.script).map((id) => ({ id, name: ROLES[id].name, ability: ROLES[id].ability, taken: !!g.travellerOf(id) })) : null,
      canTravel: spectator && !this.ended && this.travellersOk(g) && uid !== this.stId && g.players.length < 20 && g.townAlive() >= 7, // 官方百科：还有七名或更多玩家存活时才考虑加入旅行者
      exile: this.exile ? { target: this.exile.target, by: this.exile.by, until: this.exile.until, count: this.exile.yes.size, mine: this.exile.yes.has(uid), need: Math.ceil(g.players.filter((q) => !q.left).length / 2) } : null,
      butcher: this.butcher ? { by: this.butcher.by, stage: this.butcher.stage, target: this.butcher.target, until: this.butcher.until, count: this.butcher.yes.size, mine: this.butcher.yes.has(uid) } : null,
      laughs: this.exile?.laughs?.size ?? 0, laughed: !!this.exile?.laughs?.has(uid),
      bishop: !!g.bishopOn?.(),
      exiledToday: Object.keys(this.exiled ?? {}).filter((k) => k.startsWith(`${g.day}:`)).map((k) => k.slice(k.indexOf(':') + 1)),
      stNominable: g.engine === 'snv' && inScript('atheist', g.script), // 有无神论者的剧本：可以提名说书人
      demonSwap: g.demonSwap ?? null, // 夜半狂欢：亡骨魔换成了谁（技能表、角色页、顶栏说明跟着换）
      // 说书人也坐在台上（2026-11-18 用户）：真人说书显示他的头像，AI 说书显示 ★；有无神论者的剧本可以直接点他提名
      peltFx: (this.peltFx ?? []).filter((f) => Date.now() - f.at < 6000).map(({ id, item, by, target, at }) => ({ id, item, by, target, at })),
      mvp: this.mvp ? { until: this.mvp.until, mine: this.mvp.votes.get(uid) ?? null, count: this.mvp.votes.size, need: this.mvp.voters.length, canVote: this.mvp.voters.includes(uid), result: this.mvp.result } : null,
      storyteller: !(g.engine === 'snv' && inScript('atheist', g.script)) ? null : this.stId ? { id: this.stId, name: this.users.get(this.stId)?.name ?? '说书人', avatar: this.users.get(this.stId)?.avatar ?? null, human: true, mic: this.mics?.[this.stId] ?? null } : { id: 'storyteller', name: 'AI 说书人', avatar: null, human: false },
      stNominated: !!g.nominees?.has('storyteller'),
      rps: this.rps ? { a: this.rps.a, b: this.rps.b, until: this.rps.until, mine: [this.rps.a, this.rps.b].includes(uid), hand: this.rps.picks[uid] ?? null } : null, // 精神病患者猜拳
      boom: g.boom?.until ? { until: g.boom.until, alive: g.boom.alive, mine: g.boom.points[uid] ?? null, count: Object.keys(g.boom.points).length } : null, // 炸弹人倒数
      ragShot: this.ragCur ? { id: this.ragCur.id, until: this.ragCur.until, mine: this.ragCur.id === uid, canShoot: this.ragCur.id === uid && g.get(uid)?.role === 'slayer', target: this.ragCur.id === uid ? this.ragCur.target : null } : null, // 诸神黄昏：谁倒下了正在决定开不开枪
      noms: this.noms && {
        until: this.noms.paused != null ? null : this.noms.until, timeUp: this.noms.timeUp, skipped: this.noms.skips.has(uid),
        done: g.alive().filter((p) => g.visAlive(p) && (g.nominators.has(p.id) || this.noms.skips.has(p.id))).length,
      },
      journal: isST || this.ended ? g.journal : null,
      timeline: this.ended ? g.timeline : null,
      vote: vote && {
        nominator: vote.nominator, nominee: vote.nominee, order: vote.order, idx: vote.idx,
        yes: isST || !this.settings.hideVotes ? [...vote.yes] : [...vote.yes].filter((id) => id === uid), // 房规：票型投完才公开
        hidden: !isST && !!this.settings.hideVotes,
        locked: [...vote.locked],
      },
      votes: this.voteHistory ?? [],
      knives: this.knifeLog ?? [], // 刀口：每晚谁死了（公开信息：天亮时大家都听到了）
      execs: this.execLog ?? [],   // 每天的处决结果
      pubs: this.pubLog ?? [],     // 公开声明、开枪、公开选人……（大家都听到了）
      voiceChannel: this.square ?? null,
      lastVote: this.lastVote && {
        nominee: this.lastVote.nominee, yes: this.lastVote.result.voters, outcome: this.lastVote.result.outcome,
        count: this.lastVote.result.count, threshold: this.lastVote.result.threshold, endedAt: this.lastVote.endedAt ?? 0,
      },
      rooms: [...this.rooms.values()].map((r) => ({ id: r.channelId, members: r.members, until: r.until, mine: r.members.includes(uid) })),
      roam: this.roam && {
        map: this.town.id,
        until: this.roam.until, since: this.roam.since ?? null,
        houses: this.roam.houses.map((h) => {
          const st = this.roam.state.get(h.id);
          return { ...h, members: [...st.ids], locked: st.locked, knocks: [...st.knocks] };
        }),
        pos: Object.fromEntries(this.roam.pos),
        myHouse: this.roam.zone.get(uid) ?? null,
        invite: this.roam.invites?.get(uid) ?? null,
        endVotes: { count: this.roam.endVotes.size, need: this.roamVoteNeed(), mine: this.roam.endVotes.has(uid) },
      },
      winner: this.ended ? { team: g.winner, reason: g.winReason } : null,
      bluffs: showRoles ? g.bluffs.map((r) => ROLES[r].name) : null,
    });

    const p = g.get(uid);
    if (p) {
      const r = ROLES[p.shownRole];
      const prompt = g.phase === 'night' && (!this.resolving || this.revivePending === uid) && (p.alive || this.revivePending === uid || g.ghostLunatic?.(p) || (g.engine === 'snv' && g.kept(p))) ? g.nightPrompts().find((x) => x.playerId === uid) : null;
      view.self = {
        seat: p.seat, alive: g.visAlive(p) || hushed.has(p.id), ghostVote: p.ghostVote,
        role: { id: p.shownRole, name: r.name, team: r.team, teamName: TEAM_NAME[r.team], evil: g.engine === 'snv' && !['lunatic', 'marionette'].includes(p.role) && !(p.role === 'ogre' && !p.ogreKnows) ? g.evilOf(p) : isEvilRole(p.shownRole), ability: r.ability }, // 疯子、提线木偶看到的是他以为的阵营；食人魔不知道自己变成了哪边
        ...(g.engine === 'snv' ? this.snvSelf(p) : {}),
        canDeclare: this.canDeclare(uid),
        inbox: this.inbox.get(uid) ?? [],
        acts: this.acts?.get(uid) ?? [], // 自己夜里选了谁
        prompt: prompt && {
          night: g.night, count: prompt.count, options: prompt.options, role: ROLES[prompt.role].name, roleId: prompt.role,
          chosen: g.choices[uid] ? (Array.isArray(g.choices[uid]) ? g.choices[uid] : g.choices[uid].targets) : null,
          chosenRole: g.choices[uid]?.role ?? null,
          optional: !!prompt.optional, pickRole: !!prompt.pickRole, roleOptions: prompt.roleOptions ?? null, waiting: !!prompt.waiting,
        },
        moonchild: g.pendingMoonchild === uid ? 'real' : this.moonchildFakes?.has(uid) ? 'fake' : null,
        gossipDone: !!g.gossipSaid?.[uid],
        newbie: !!g.newbies?.includes(uid), // 新手：身份面板多一段"怎么玩"的提示
        gossipFree: (this.judgeReady ?? judgeAvailable)(), // 服务器配了 AI 判定：可以自由说
        ravenkeeper: this.rkPending === uid,
        killedTonight: g.phase === 'night' && !!this.killScene?.victims.includes(uid),
        // 官方规则（7 人及以上）：第一夜恶魔和爪牙互认，恶魔拿 3 个伪装；之后传位/红唇接任不再通知爪牙
        // 疯子以为自己是恶魔：给他看假的爪牙和假的伪装，界面和真恶魔一模一样
        ...(g.lunaticFake?.id === uid ? {
          allies: g.lunaticFake.allies.map((id) => ({ id, team: '爪牙' })),
          evilInfo: g.evilInfo,
          bluffs: [...g.lunaticFake.bluffs],
          bluffsMine: true,
          bluffsShared: !!g.lunaticFake.shared || !!this.settings.minionBluffs,
        } : {
          allies: g.evilKnown?.[uid] ?? null,
          evilInfo: g.evilInfo,
          bluffs: !!g.bluffs?.length && g.evilKnown && (uid === g.firstDemon || ((g.bluffsShared || this.settings.minionBluffs) && g.get(uid)?.role !== 'marionette' && g.evilKnown[g.firstDemon]?.some((a) => a.id === uid))) ? [...g.bluffs] : null,
          bluffsMine: uid === g.firstDemon,
          bluffsShared: !!g.bluffsShared || !!this.settings.minionBluffs,
        }),
      };
    }
    if (isST) {
      view.st = {
        artistAsks: this.artistAsks ?? [],
        log: this.stLog.slice(-30),
        pendingInfo: [...this.pendingInfo.entries()].map(([id, m]) => ({ id, playerId: m.playerId, text: m.text, voice: m.voice })),
        waiting: g.phase === 'night' && !this.resolving ? g.missingChoices() : [],
        rkPending: this.rkPending,
        resolved: g.phase === 'night' && this.resolving && !this.rkPending && !this.revivePending,
        roles: Object.entries(ROLES).filter(([, x]) => !x.virtual).map(([id, x]) => ({ id, name: x.name, team: x.team })), // 失忆者专用的能力不是角色
      };
    }
    return view;
  }

  /** 梦殒春宵：这个玩家白天能做的事。只给本人。 */
  /** 现在能不能用通用的公开声明（11-11 起关掉了，见 declarable；造谣者的发表声明走 gossip）。 */
  canDeclare(uid) {
    const g = this.game;
    const d = g.declared?.[uid];
    const usedToday = d?.day === g.day ? d.n : 0;
    return g.phase === 'day' && !this.ended && declarable(g.script) && !this.dusking && this.duskDay !== g.day && usedToday < MAX_DECLARES;
  }

  snvSelf(p) {
    const g = this.game;
    const uid = p.id;
    const ab = g.abilityOf(p);
    const day = g.phase === 'day' && !this.ended;
    // 食人族不知道自己拿到了什么能力：白天的几个"拜访说书人"他都可以试试，不是他的能力就什么也不发生
    // 失忆者不知道自己的能力：白天的几个能力也都可以试（官方：视作具有该能力），不是他的就什么也不发生
    const amn = p.role === 'amnesiac' && !g.amnesiacKnown?.[uid]; // 弄清了自己的能力就不再乱试
    const tryAs = (r) => (ab === r || g.extraAbility(p) === r || (p.role === 'cannibal' && inScript(r, g.script)) || amn); // 科学怪人给恶魔的白天能力也有按钮
    return {
      gained: p.gained && !g.hidden(p) ? { id: p.gained, name: ROLES[p.gained].name, ability: ROLES[p.gained].ability } : null,
      klutz: (day || !!g.klutzNow) && g.pendingKlutz === uid, // 夜里死的要等天亮才选，不然死讯提前暴露（夜里被处决的已经公开了）
      madness: g.madness?.[uid] ? { role: ROLES[g.madness[uid].role].name, claimed: !!g.madness[uid].claimed } : null,
      mutant: day && this.thinksMutant(p), // 畸形秀演员：不能让人相信自己是外来者（收音弹窗的文字用）
      canJuggle: day && inScript('juggler', g.script) && g.juggleLog?.[uid] !== g.day && (g.day === 1 || (ab === 'juggler' && g.jugglerDay?.[uid] === g.day)),
      canSavant: day && p.alive && tryAs('savant') && g.savantDay?.[uid] !== g.day,
      canArtist: day && p.alive && tryAs('artist') && !g.used?.[uid] && !this.triedToday(uid, 'artist'),
      canFisherman: day && p.alive && tryAs('fisherman') && !g.used?.[`fish-${uid}`] && !this.triedToday(uid, 'fisherman'),
      canAmnesiac: day && p.alive && p.role === 'amnesiac' && g.amnesiacDay?.[uid] !== g.day,
      canSlay: day && p.alive && (['slayer', 'amn_gun', 'amn_judge'].includes(ab) || g.extraAbility(p) === 'slayer' || amn) && !g.shooters?.includes(uid),
      canGun: day && p.alive && p.role === 'gunslinger' && g.gunDay !== g.day && (this.voteHistory ?? []).some((v) => v.day === g.day && !v.exile) && !this.vote,
      canJudge: day && p.alive && p.role === 'judge' && !g.judgeUsed && this.judgeDay !== g.day && !!this.judgeTarget() && this.judgeTarget().nom.nominator !== uid,
      isTraveller: !!p.traveller,
      beggarTokens: p.role === 'beggar' && p.traveller ? p.beggarTokens ?? 0 : null,
      canMatron: day && p.alive && p.role === 'matron' && p.traveller && g.matronDay !== g.day && !this.vote && !this.pendingNom,
      canGnome: day && p.alive && p.role === 'gnome' && p.traveller && !!this.pendingNom && this.pendingNom.nominee === p.gnomeAmigo && !this.pendingNom.gnomed,
      gnomeAmigo: p.role === 'gnome' ? p.gnomeAmigo ?? null : null,
      canGiveBeggar: day && !g.visAlive(p) && !p.left && p.ghostVote && !!g.travellerOf?.('beggar')?.alive && !this.vote,
      canPsycho: day && p.alive && ab === 'psychopath' && g.psychoDay?.[uid] !== g.day && !this.noms && !this.pendingNom && !this.vote && !this.dusking && this.duskDay !== g.day,
      canPardon: day && p.alive && (ab === 'amn_pardon' || amn) && !g.used?.[`pardon-${uid}`] && !!g.block && !this.vote && !this.pendingNom,
      // 被提名、还没开始投票：可以公开声明自己是哥布林（谁都可以这么说）
      canGoblin: day && inScript('goblin', g.script) && this.pendingNom?.nominee === uid && !this.vote && !(g.claims?.[uid] === 'goblin' && g.goblinClaimDay?.[uid] === g.day), // 每天都能重新声明（官方）
      // 谁都可以公开猜落难少女（每人一次，诈身份用）；只有真爪牙的第一次猜测算数
      canDamsel: day && inScript('damsel', g.script) && !g.damselTried?.[uid],
      harpy: g.harpyMad?.id === uid && g.harpyMad.night === g.night && g.phase === 'day' ? { target: g.harpyMad.target, name: g.name(g.harpyMad.target), claimed: !!g.harpyMad.claimed } : null,
      hearing: !!this.hearing,
      mic: day ? this.mic?.tokenFor(uid) ?? null : null,
      micOn: !!this.mic?.isOn(uid), // 收音页开着（最近报到过，或者今天传上来过话）
      micWhy: g.madness?.[uid] || this.thinksMutant(p) ? null : g.pixie?.[uid] && !g.pixie[uid].gained ? 'pixie' : this.listenAll(g) ? 'listen' : null, // 为什么发收音：小精灵 / 灵言师、将军、政客的剧本
      listenWhy: this.listenAll(g) ? this.listenWhy(g) : null,
      pixie: g.pixie?.[uid] ? { role: ROLES[g.pixie[uid].role].name, mad: !!g.pixie[uid].mad, gained: !!g.pixie[uid].gained } : null,
    };
  }

  grimEntry(p) {
    const g = this.game;
    return {
      role: p.role, roleName: ROLES[p.role].name + (p.role === 'amnesiac' && p.gained ? `（${ROLES[p.gained].name}）` : ''), team: ROLES[p.role].team, evil: g.evilOf(p), // 失忆者揭晓时带上他真正的能力
      shownRoleName: p.role !== p.shownRole ? ROLES[p.shownRole].name : null,
      poisoned: !!g.isPoisoned(p), redHerring: p.id === g.redHerring,
      protected: p.id === g.monkTarget, master: p.id === g.butlerMaster,
      drunk: g.script !== 'tb' && g.broken(p) && !g.isPoisoned(p), fakeDead: !!p.apparentDead,
    };
  }
}

// 狼人杀（娱乐模式）的房间流程
Object.assign(Room.prototype, WW_ROOM);
