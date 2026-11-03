// 一个频道里的一局游戏：大厅 → 开局 → 夜晚收集选择 → 白天提名投票 → 结束。
// 所有操作走 act(userId, type, payload)；状态变了就 onChange()，由服务器给每个人推送各自的视图。
import { Game, shuffle, balancedTB, setupScoreTB, rollRoles, rollRagnarok } from '../engine/game.js';
import { balancedBMR, setupScore, rollBMR } from '../engine/bmr.js';
import { balancedSNV, setupScoreSNV, rollSNV, rollTeensy, rollMixed, balancedMixed, MAX_DECLARES, AMNESIAC_DAY } from '../engine/snv.js';
import { ROLES, SCRIPTS, TEAM_NAME, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole, engineOf, inScript, playersOf, ragnarokWolves } from '../engine/roles.js';
import { getMap, houseAt, houseCenter, doorPoint, pathLength, positionAt, SPEED } from '../shared/map.js';
import { CHARACTERS, CHARACTER_IDS } from '../shared/characters.js';
import { cleanOutfit } from '../shared/outfit.js';
import { SETUPS, pickPreset, PRESET_SHARE } from '../shared/setups.js';
import { buildRoles, easeNewbies } from '../engine/assign.js';
import { narration } from './narration.js';
import { ttsUrl } from './tts.js';
import { judgeStatement, judgeMadness, judgeBreak, looksBroken, judgeAvailable, judgeAmnesiac, adviseFisherman, looksInjected, speakSeat7 } from './judge.js';
import { noteMarks, readTown } from './beliefs.js';

// 受害者那段破门过场多长（毫秒）：踹门 → 踹开 → "你死了"，播完再天亮
const VICTIM_SCENE_MS = 6500;
// 一局里的真人全都离线这么久，就暂停这局、放开所有闭麦闭耳（有人回来自动接着打）
const IDLE_PAUSE_MS = 3 * 60_000;
const MOONCHILD_WAIT_MS = 20_000; // 月之子 / 呆瓜黄昏被处决：入夜前等他公开选人这么久，超时随机选（用户 2026-11-03 嫌 30 秒卡，缩到 20 秒）
const BREAK_CHECKS = 6; // 一个人一天最多问几次大模型有没有破功：防止反复说到那些词，花费失控
const LOG_MAX = 1000; // 公告留多少条：要够一整局。每次推送只带最后 40 条（见 viewFor 的 log），全部的打开「记录」时再取
const HOST_IDLE_MS = 60_000;  // 大厅里房主这么久没操作，别人可以接管
const HOST_GONE_MS = 15_000;  // 房主离线这么久没回来，自动交给在线的人（短暂断线重连不算）
// 造谣者自由声明交给 AI 判定：入夜结算前最多等这么久，还没判完就按假处理
const GOSSIP_WAIT_MS = 32_000;
const SEAT7 = 'bot-seat7'; // 七步成诗的 7 号空座：当机器人用（夜里替它选人），但不提名、不投票、不在镇上走，见 seat7Speak
const BOOM_MS = 25_000; // 炸弹人引爆后的倒数：先留时间看清是谁，再倒数十声
// 语音校正：每隔几秒对一遍"每个人该在哪个语音频道"和"他实际在哪"，不对就拉过去（拉人偶尔会失败或被网络延迟打乱顺序）
const VOICE_CHECK_MS = 4000;
const VOICE_GRACE_MS = 3000; // 刚进出房子的人先不管，等这次拉人落地

/**
 * 没有大模型时粗判失忆者的猜测：说中了角色名就是完美；能力描述里的关键词重合越多越接近。
 * 只是兜底，所以宁可保守（多答"有关"），不轻易说"完美"。
 */
/** 公开声明只在有用的剧本里出现：畸形秀演员（声称外来者会被处决）、洗脑师（疯狂证明）。无上愉悦里没有这两个，就不给这个按钮。 */
const declarable = (script) => inScript('mutant', script) || inScript('cerenovus', script);

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

export const DEFAULT_SETTINGS = {
  script: 'tb',          // 剧本：tb 暗流涌动 / bmr 黯月初升 / snv 梦殒春宵
  preset: null,          // 旧设置（只认官方八人推荐的某一套），现在用 setupMode
  setupMode: 'preset',   // 配置怎么来：preset 推荐预设（人数对得上大多从推荐配置里挑，其余 AI）/ ai AI 配置（强弱配平）/ random 完全随机
  mode: 'auto',          // auto：机器人说书；human：房主说书
  shuffle: true,
  chooseSeconds: 45,     // 夜里选人时限（大家都选完就立刻结算，没选完的等到时限替他随机选）
  voteSeconds: 3,        // 投票时钟每人停留
  voteCountdown: 8,      // 时钟开始转动前的倒计时
  nightDeafen: false,    // 夜里服务器闭麦+闭耳（默认关：大家自觉闭麦，开了有时会卡入夜）
  pauseMs: 4000,         // 结算后到下一阶段的停顿
  killSceneMs: 11000,    // 暗流涌动：夜晚结算后到天亮的时间，留给恶魔"变身 + 冲刺"和受害者"被破门"两段动画
  roamMinutes: 5,        // 白天自由活动多久（0 = 等主持人喊集合）
  nominateMinutes: 3,    // 集合后开放提名多久（自动说书）
  accuseSeconds: 60,     // 提名者陈述（房主开局前可调）
  defendSeconds: 60,     // 被提名者辩护（房主开局前可调）
  nominatorVotes: true,  // 房规：提名的人自动算一票（票数从 1 开始）
  speechMute: true,      // 陈述/辩护时只有发言的人能说话，其他人服务器闭麦
  smallEvilInfo: false,  // 房规：6 人及以下也让恶魔和爪牙互认、恶魔拿伪装（官方不给）
  deadDrunk: false,      // 房规：夜里被杀的信息角色照样拿当晚的信息，但按醉酒处理（官方：死了就没有能力，不再醒）
  lunaticGhost: false,   // 房规（黯月初升）：以为自己是僵怖的疯子死后仍在没人死的夜里被叫醒，维持假象（官方：死了就失去能力，不再醒）
  smallNoBaron: true,    // 房规：暗流涌动 7 人以下不随机发男爵（小局多两个外来者太难打）；房主指定的照给
  minionBluffs: true,    // 房规：爪牙和恶魔共用 3 个伪装（官方只给恶魔，恶魔再私下告诉队友）
  hideVotes: false,      // 房规：投票过程中只看得到自己举没举手，投完公开（官方是实时公开举手，默认照官方）
  spectatorGrimoire: false, // 观战的人能看魔典（所有人身份）——会漏信息，默认关
  muteSpectators: true,     // 开局后观战的人在语音里被服务器闭麦（免得漏信息）；离开或终局自动解除
  settingsVersion: 2,       // 2：闭麦闭耳、隐藏票型改成默认关（老房间读档时改一次，之后房主怎么设就怎么样）
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
    this.roam = null;           // 白天自由活动（小镇地图）
    this.homes = null;          // 每人在镇上的家：playerId → 房子 id
    this.noms = null;           // 自动说书的提名环节：{ until, timeUp, skips }
    this.nomTimers = [];
    this.rooms = new Map();     // 主持人拉人的私聊房间 channelId → {channelId, members, until}
    this.inbox = new Map();
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
    this.paused = false;        // 真人全都离线：暂停中（计时器全停、语音全放开）
    this.idleTimer = null;
    this.ownedChannels = new Set(); // 这局开过的语音频道（语音校正用）
    this.voiceTouched = new Map();
  }

  // ───────────── 工具 ─────────────
  get stId() { return this.settings.mode === 'human' ? this.hostId : null; }
  isHost(id) { return id === this.hostId; }
  requireHost(id) { if (!this.isHost(id)) throw new UserError(this.stId ? '只有说书人可以这么做' : '只有房主可以这么做'); }
  requireGame() { if (!this.game) throw new UserError('游戏还没开始'); return this.game; }
  isFake(id) { return id.startsWith('bot-'); }
  realIds() { return this.game ? this.game.players.map((p) => p.id).filter((id) => !this.isFake(id)) : []; }
  changed() { this.onChange(this); }

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
  /** AI 房主的一句旁白（极乐迪斯科式）。客户端会读出来；有 title 的弹出过场标题卡。 */
  narrate(event, vars) {
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
    // 走路很频繁，只推送位置，不推完整状态
    if (type === 'move') return this.move(uid, p.x, p.y);
    if (type === 'marks') return this.recordMarks(uid, p); // 没有状态要推给别人
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
      case 'pardon': this.pardon(uid); break;
      case 'klutz': this.klutz(uid, p.target); break;
      case 'ravenkeeper': await this.onRavenkeeper(uid, p.target); break;
      case 'nominate': this.nominate(uid, p.target); break;
      case 'startVote': this.startVote(uid); break;
      case 'nomDone': this.nomDone(uid); break;
      case 'skipNom': this.skipNom(uid); break;
      case 'hand': this.hand(uid, !!p.up); break;
      case 'history': return { games: this.history?.list(this.guildId) ?? [] };
      case 'stats': return { stats: this.history?.stats?.(this.guildId, uid) ?? null };
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
    if (this.game) this.game.signals = (who) => this.signals(who);
  }

  /**
   * 说书人的情况：dice.js 里有权重的才影响判定，其余只记进日志（影子信号）。
   * rookie、veteran、offline 有权重。玩家标记、技术差距这些现在只看不用。
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
      if (said.length) out.split = said.reduce((a, t) => a + Math.min(t.evil, t.good) / (t.evil + t.good), 0) / said.length; // 0 大家意见一致，0.5 对半分
      if (who && town[who]) out.marksHeat = town[who].suspect - 0.5;
    }
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
    if (p.mode === 'auto' || p.mode === 'human') {
      s.mode = p.mode;
      if (p.mode === 'human') this.lobby = this.lobby.filter((x) => x.id !== this.hostId);
    }
    if (typeof p.shuffle === 'boolean') s.shuffle = p.shuffle;
    if (typeof p.nightDeafen === 'boolean') s.nightDeafen = p.nightDeafen;
    if (typeof p.nominatorVotes === 'boolean') s.nominatorVotes = p.nominatorVotes;
    if (typeof p.speechMute === 'boolean') s.speechMute = p.speechMute;
    if (typeof p.smallEvilInfo === 'boolean') s.smallEvilInfo = p.smallEvilInfo;
    if (typeof p.smallNoBaron === 'boolean') s.smallNoBaron = p.smallNoBaron;
    if (typeof p.deadDrunk === 'boolean') s.deadDrunk = p.deadDrunk;
    if (typeof p.lunaticGhost === 'boolean') s.lunaticGhost = p.lunaticGhost;
    if (typeof p.hearMadness === 'boolean') s.hearMadness = p.hearMadness;
    if (SCRIPTS[p.script]) { if (s.script !== p.script) s.preset = null; s.script = p.script; }
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
    if (this.lobby.length < MIN_PLAYERS) throw new UserError(`至少需要 ${MIN_PLAYERS} 名玩家`);
    const seats = this.settings.shuffle ? shuffle(this.lobby, Math.random) : [...this.lobby];
    const script = this.tutorial ? 'tb' : this.settings.script ?? 'tb';
    const [lo, hi] = playersOf(script);
    if (seats.length < lo || seats.length > hi) throw new UserError(`《${SCRIPTS[script].name}》要 ${lo}–${hi} 名玩家（现在 ${seats.length} 人）`);
    // 七步成诗的灯神规则：7 号座位没有人坐，照样发角色，由说书人替它做决定
    if (SCRIPTS[script].seat7) seats.splice(6, 0, { id: SEAT7, name: '7号空座', avatar: null, fake: true });
    const teensy = !!SCRIPTS[script].teensy;
    const mixed = !teensy && !!SCRIPTS[script].roles && SCRIPTS[script].engine === 'snv'; // 自选角色的大剧本（七步成诗）
    const ragnarok = !!SCRIPTS[script].ragnarok; // 诸神黄昏：角色只按人数定（几只狼人），不用推荐配置、不按房主指定
    // 房主指定了角色：指定的座位照指定，其余按人数表随机补齐（推荐配置就不用了）
    const assign = this.tutorial || ragnarok ? {} : Object.fromEntries(Object.entries(this.roleAssign ?? {}).filter(([id, r]) => seats.some((p) => p.id === id) && !!ROLES[r] && inScript(r, script)));
    const custom = Object.keys(assign).length > 0;
    const noBaron = script === 'tb' && seats.length < 7 && !!this.settings.smallNoBaron;
    // 配置三选一：推荐预设（人数对得上时大多从推荐配置里挑，官方的权重高；其余和没有推荐配置的人数用 AI 配置）/ AI 配置 / 完全随机
    const mode = this.settings.setupMode ?? 'preset';
    const pinned = this.settings.preset != null ? SETUPS[script]?.[this.settings.preset] : null; // 指定了某一套（旧设置 / 测试）：人数对得上就固定用它
    const preset = this.tutorial || custom || ragnarok || mode !== 'preset' ? null
      : pinned?.roles.length === seats.length ? pinned
        : Math.random() < PRESET_SHARE ? pickPreset(script, seats.length, Math.random) : null;
    const pure = !this.tutorial && !custom && !preset && mode === 'random'
      ? (ragnarok ? rollRagnarok(seats.length, Math.random) : teensy ? rollTeensy(script, seats.length, Math.random) : mixed ? rollMixed(script, seats.length, Math.random) : script === 'bmr' ? rollBMR(seats.length, Math.random) : script === 'snv' ? rollSNV(seats.length, Math.random) : rollRoles(seats.length, Math.random, { noBaron })) : undefined;
    let roles = this.tutorial ? this.tutorial.roles : custom ? buildRoles(seats.map((p) => p.id), assign, script, Math.random, { noBaron }) : preset ? shuffle(preset.roles, Math.random) : pure;
    // 新手：拿到难角色的大概率和老玩家的同类普通角色对调（房主指定的座位不动）
    const newbies = new Set(this.tutorial ? [] : this.newbies.filter((id) => seats.some((p) => p.id === id)));
    if (newbies.size) {
      roles ??= ragnarok ? rollRagnarok(seats.length, Math.random) : teensy ? rollTeensy(script, seats.length, Math.random) : mixed ? balancedMixed(script, seats.length, Math.random) : script === 'bmr' ? balancedBMR(seats.length, Math.random) : script === 'snv' ? balancedSNV(seats.length, Math.random) : balancedTB(seats.length, Math.random, { noBaron });
      roles = easeNewbies(seats.map((p) => p.id), roles, newbies, script, { fixed: new Set(Object.keys(assign)) });
    }
    this.game = new Game(seats.map(({ id, name }) => ({ id, name })), { roles, drunkAs: custom ? null : preset?.drunkAs, script, noBaron, evilInfo: seats.length >= 7 || this.settings.smallEvilInfo, deadDrunk: !this.tutorial && !!this.settings.deadDrunk, lunaticGhost: !!this.settings.lunaticGhost, newbies: [...newbies] });
    this.duskDay = null;
    this.game.records = this.readRecords(seats);
    this.wireGame();
    if (newbies.size) this.stNote(`新手 ${newbies.size} 人：发身份时调低了当邪恶的概率，难角色尽量换成简单的`);
    if (pure) this.stNote('完全随机：按人数表随机抽的角色，没有调平衡');
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
    if (ragnarok) this.announce(`游戏开始！《${SCRIPTS[script].name}》${seats.length} 人：${seats.length - ragnarokWolves(seats.length)} 名猎手 · ${ragnarokWolves(seats.length)} 只狼人（小恶魔）。每个猎手白天可以开一枪。`, 'start');
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
   * 每人分一栋镇上不能进的房子当家（暗流涌动先做）：白天从自家门口出门；夜里要选人的角色从家里走到对方家门口动手。
   * 谁住哪是公开的（房子上挂门牌）。
   */
  assignHomes() {
    const g = this.game;
    const town = this.town;
    const pool = ['tb', 'ngj', 'rag'].includes(g.script) ? shuffle([...town.homes()], Math.random) : [];
    this.homes = pool.length >= g.players.length ? Object.fromEntries(g.players.map((p, i) => [p.id, pool[i].id])) : null;
  }

  // ───────────── 夜晚 ─────────────
  async beginNight() {
    const g = this.game;
    await this.endRoam();
    await this.closeAllRooms();
    this.pendingNom = null;
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
      this.later(300, () => this.resumeNight(night, uid));
      return;
    }
    const msgs = g.submitChoice(uid, targets, { role });
    if (msgs?.length) this.deliver(msgs);
    for (const pr of g.nightPrompts()) if (this.isFake(pr.playerId) && !g.choices[pr.playerId] && !pr.waiting) this.botChoose(pr.playerId);
    this.stNote(`${g.name(uid)}（${ROLES[g.get(uid).shownRole].name}）选择了 ${this.choiceText(g.choices[uid])}`);
    this.startDemonClock(uid, night);
    if (!g.missingChoices().length) this.later(600, () => this.finishNight(night));
  }

  async finishNight(night) {
    const g = this.game;
    if (!g || g.phase !== 'night' || g.night !== night || this.resolving) return;
    // 黯月初升：还没到定好的天亮时刻就先等着（见 startDemonClock）
    if (this.dawnAt && Date.now() < this.dawnAt - 30) {
      this.cancel(this.nightTimer);
      this.nightTimer = this.later(this.dawnAt - Date.now(), () => this.finishNight(night));
      return;
    }
    this.dawnAt = null;
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
    return !!this.homes && ['tb', 'ngj', 'rag'].includes(this.game?.script);
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

  /** delay 毫秒后，给今晚被恶魔杀死的人播破门。 */
  playKillScene(g, delay) {
    const victims = [...(g.demonKills ?? [])];
    const play = () => { if (this.game === g && g.phase === 'night') { this.killScene = { victims }; this.changed(); } };
    if (delay > 0) this.later(delay, play); else play();
  }

  async forceDawn() {
    const g = this.requireGame();
    if (g.phase !== 'night') throw new UserError('现在不是夜晚');
    // 正在等造谣者的 AI 判定：这时天亮会跳过结算（所有人的信息、死亡都没了）
    if (this.resolving && this.gossipToken) throw new UserError('这一夜正在结算，稍等几秒');
    this.dawnAt = null; // 黯月初升定好的天亮时刻不等了：不清掉的话 finishNight 会先去等，这里就没结算直接天亮了
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
    // 利维坦：每天天亮宣布在场和第几天（官方建议对新手每天说）；它失效的那天不宣布
    if (g.engine === 'snv' && g.leviOn()) this.announce(`**利维坦在场。**现在是第 ${g.day} 天${g.day >= 5 ? '——今天结束时邪恶获胜' : `（第 5 天结束时邪恶获胜；已有 ${g.leviGood.length} 名善良玩家被处决，再处决 ${2 - g.leviGood.length} 名善良玩家邪恶就获胜）`}。`, 'day', true);
    (this.knifeLog ??= []).push({ night: g.night, day: g.day, deaths: [...deaths], revived: back });
    if (g.nightRevived) g.nightRevived = [];
    this.moonchildNotice();
    this.klutzNotice();
    if (g.winner) { await this.endGame(); return; }
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
    if (this.roam) throw new UserError('自由活动中，等集合回到广场再提名');
    if (this.noms?.timeUp) throw new UserError('提名时间已经结束了');
    if (this.dusking || this.duskDay === g.day) throw new UserError('今天已经到黄昏了，不能再提名');
    if (!this.stId && !this.noms && !this.roamedToday) throw new UserError('现在还不能提名，等大家回到广场'); // 天亮到自由活动之间：这时提名成功，自由活动就起不来了
    const r = g.nominate(uid, target);
    if (r.cursed) {
      this.announce(`**${g.name(uid)}** 提名了 **${g.name(target)}**——**${g.name(uid)} 突然倒地身亡！** 提名照常进行。`, 'death');
      if (g.winner) { this.later(0, () => this.endGame()); return; }
      this.klutzNotice(); // 女巫咒死的可能是呆瓜
    }
    if (r.virgin) {
      this.announce(`${g.name(uid)} 提名了 ${g.name(target)}——**${g.name(uid)} 被立即处决！** 今天的处决已经发生。`, 'death');
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
    if (this.isFake(target) && g.engine === 'snv' && g.abilityOf(nominee) === 'goblin' && nominee.alive && g.st.roll('goblinClaim', {}, { who: target })) this.goblin(target);
  }

  // ───────────── 自动说书：提名环节 ─────────────
  // 集合后开放提名（限时）。每次提名：提名者陈述 → 被提名者辩护 → 自动投票。
  // 时间到、或者所有活着的人都提名过/点了"不提名了"，就自动入夜。
  // 有人正在陈述/辩护/投票时，提名环节的倒计时暂停，投完再接着走（最少留 30 秒给下一个提名）。

  openNominations() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended || this.roam || this.noms || this.stId) return;
    if (g.executedToday) { this.autoDusk(); return; }
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
    if (this.noms.timeUp || this.nomsDone() || this.game.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
    else { this.resumeNoms(); this.botsConsider(); }
  }

  async autoDusk() {
    const g = this.game;
    if (!g || g.phase !== 'day' || this.ended || this.vote || this.stId) return;
    await this.dusk();
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
        if (!this.noms || this.noms.timeUp || this.pendingNom || this.vote || g.phase !== 'day' || g.nominators.has(p.id) || !p.alive) return;
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
    this.vote = { nominator: nom.nominator, nominee: nom.nominee, order: this.game.voteOrder(nom.nominee), idx: -1, yes: new Set(), locked: new Set(), result: null };
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
    const before = { block: g.block, votes: g.blockVotes };
    v.result = g.recordVote(v.nominee, [...v.yes].filter((id) => v.locked.has(id)));
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
    this.afterVote();
  }

  hand(uid, up) {
    const v = this.vote; const g = this.requireGame();
    if (!v) throw new UserError('现在没有在投票');
    if (!g.get(uid)) throw new UserError('你不是这局的玩家');
    if (v.locked.has(uid)) throw new UserError('指针已经过了你，你的票锁定了');
    if (up && !g.canVote(uid)) throw new UserError('你已经死亡并用掉了幽灵票');
    if (!up && uid === v.nominator && this.settings.nominatorVotes && this.nominatorAlive(uid)) throw new UserError('提名的人自动投赞成票，不能放下');
    if (up) v.yes.add(uid); else v.yes.delete(uid);
  }

  /** 房规"提名的人自动投一票"只算活人：被女巫咒死的提名者不该被扣掉幽灵票。 */
  nominatorAlive(id) {
    const g = this.game;
    return g.visAlive(g.get(id)) && g.canVote(id);
  }

  async dusk() {
    const g = this.requireGame();
    if (g.phase !== 'day') throw new UserError('现在不是白天');
    if (this.vote) throw new UserError('等这轮投票结束');
    // 只结算一次：房主连点、等大模型判定的几秒里又触发一次，都会让 endDay 跑两遍，第二夜被直接跳过
    if (this.dusking || this.duskDay === g.day) return undefined;
    this.dusking = true;
    try { return await this.settleDusk(g); } finally { this.dusking = false; }
  }

  async settleDusk(g) {
    await this.endRoam();
    if (this.game !== g) return undefined; // 等的时候房主结束了这局：别往下一局里写东西
    this.pendingNom = null;
    this.clearNoms();
    await this.judgeMadness();
    if (this.game !== g) return undefined;
    this.mic?.listen([]); // 判完了：收音令牌作废，文字清掉
    if (g.winner) return this.endGame();
    const already = g.executedToday;
    const { executed, result, harpyDead } = g.endDay();
    this.duskDay = g.day; // 读档时：今天黄昏已经结算过，直接入夜
    const gone = executed ?? (already ? g.lastExecuted : null); // 已经处决过：贞洁者、疯狂
    this.moonchildFakes = new Set(this.canFakeMoonchild(gone) ? [gone] : []);
    if (executed && result === 'saved') this.announce(`黄昏。**${g.name(executed)}** 被处决了——但依然活着。`, 'death');
    else if (executed) this.announce(`黄昏。**${g.name(executed)}** 被处决了。`, 'death');
    else this.announce(already ? '黄昏。今天的处决已经发生过了。' : '黄昏。今天没有人被处决。', 'night', true);
    if (!already || executed) (this.execLog ??= []).push({ day: g.day, id: executed ?? null, saved: result === 'saved' });
    for (const id of harpyDead ?? []) this.announce(`**${g.name(id)}** 突然倒地身亡。`, 'death'); // 鹰身女妖：疯狂没做到
    if (g.boom) { await this.boomCountdown(g); if (this.game !== g) return undefined; }
    this.madAtNight();
    this.moonchildNotice();
    this.klutzNotice();
    if (executed && result !== 'saved') this.narrate('execution', { name: g.name(executed) });
    else if (!executed) this.narrate('noExecution', { already });
    if (g.winner) return this.endGame();
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
      if (g.winner || g.st.decidesGame(g.get(id)) || !g.madExecute(id, why, { night: true })) continue; // 记下以后人数又变了，要再看一次
      this.announce(`夜幕降临。**${g.name(id)}** 没有疯狂地证明自己，也被处决了。`, 'death');
      if (this.canFakeMoonchild(id)) this.moonchildFakes.add(id);
    }
  }

  /**
   * 黄昏结算完入夜。有人被处决就先留一段遗言时间：真月之子 / 呆瓜要在这时选人（入夜就来不及了）；
   * 别的真人也有一样的时间和按钮，可以假装（规则允许，无事发生）。不然等待、倒计时、"公开选择"的记录都会实锤他的身份。
   */
  nightAfterDusk() {
    const g = this.game;
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
    this.announce(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
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
    this.announce(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
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
    this.announce(`**${g.name(uid)}** 公开选择了 **${g.name(target)}**。`, 'vote');
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
    const g = this.requireSNV();
    if (!declarable(g.script)) throw new UserError('这个剧本没有公开声明');
    if (this.dusking || this.duskDay === g.day) throw new UserError('今天已经到黄昏了，不能再声明');
    const { text, mutant, mutantClaim } = g.declare(uid, role, { auto: !this.stId });
    this.announce(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
    if (mutantClaim) this.stNote(`畸形秀演员 ${g.name(uid)} 声称自己是外来者：要处决的话，在魔典里用「疯狂处决」`);
    if (!mutant) return;
    this.announce(`**${g.name(uid)}** 因为疯狂被处决了！今天的处决已经发生。`, 'death');
    if (g.winner) this.later(0, () => this.endGame());
    else if (!this.stId) this.later(this.settings.pauseMs, () => this.autoDusk());
    this.klutzNotice();
  }

  /** 杂耍艺人的公开猜测。 */
  juggle(uid, guesses) {
    const g = this.requireSNV();
    const { text } = g.juggle(uid, guesses);
    if (!text) { this.announce(`**${g.name(uid)}** 公开声明：「我是杂耍艺人，今天不猜」`, 'vote'); return; }
    this.announce(`**${g.name(uid)}** 公开猜测：${text}`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text });
  }

  /** 食人族试一个白天能力：今天试过就不能再试（免得一个个点过去） */
  triedToday(uid, what) { return this.cannibalTries?.[`${uid}:${what}`] === this.game?.day; }

  /** 食人族去试一个他其实没有的能力：说书人摇头，什么也不发生（和现实里一样，他只能这样摸索）。返回 true 表示已经处理了。 */
  cannibalMiss(uid, what) {
    const g = this.game;
    const p = g.get(uid);
    const real = { savant: 'savant', artist: 'artist', fisherman: 'fisherman' }[what];
    if (p?.role !== 'cannibal' || g.abilityOf(p) === real) return false;
    if (!p.alive || g.phase !== 'day') throw new UserError('现在不能这样做');
    if (this.triedToday(uid, what)) throw new UserError('你今天已经试过了');
    (this.cannibalTries ??= {})[`${uid}:${what}`] = g.day;
    if (what === 'savant') g.savantDay[uid] = g.day;
    g.record('st', `食人族 ${g.tag(uid)} 试着用${ROLES[real].name}的能力：他现在没有这个能力`);
    this.tell(uid, '说书人摇了摇头：什么也没有发生。', 'storyteller');
    return true;
  }

  /** 特赦（失忆者的原创能力）：台上的人走下来，今天不再处决，提名环节随之结束。 */
  pardon(uid) {
    const g = this.requireSNV();
    if (g.get(uid)?.role !== 'amnesiac' || !g.amnesiacKnown?.[uid]) throw new UserError('你没有这个能力');
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名 / 投票结束');
    const { who, worked } = g.pardon(uid);
    this.announce(`**${g.name(uid)}** 公开特赦了台上的 **${g.name(who)}**……${worked ? '他走下了处决台。**今天不再处决任何人。**' : '什么也没有发生。'}`, 'vote');
    if (worked && !this.stId) this.later(this.settings.pauseMs, () => this.autoDusk());
  }

  /** 哥布林：被提名后、投票前公开声明。谁都可以这么说，只有真哥布林算数（说书人照样复述）。 */
  goblin(uid) {
    const g = this.requireSNV();
    if (!inScript('goblin', g.script)) throw new UserError('这个剧本没有哥布林');
    if (this.pendingNom?.nominee !== uid || this.vote) throw new UserError('只有被提名、还没开始投票时才能这样声明');
    if (g.claims?.[uid] === 'goblin') throw new UserError('你已经声明过了');
    g.goblinClaim(uid);
    this.announce(`**${g.name(uid)}** 公开声明：「我是哥布林！」——如果今天处决他，而他真是哥布林，邪恶阵营获胜。`, 'vote');
    this.narrate('gossip', { a: g.name(uid), text: '我是哥布林' });
  }

  /** 公开猜落难少女（爪牙的能力；谁都可以这么说）。猜中了邪恶获胜。 */
  damsel(uid, target) {
    const g = this.requireSNV();
    if (!inScript('damsel', g.script)) throw new UserError('这个剧本没有落难少女');
    if (!g.get(target)) throw new UserError('选一名玩家');
    const { hit } = g.damselGuess(uid, target);
    this.announce(`**${g.name(uid)}** 公开猜：「${g.name(target)} 是落难少女！」${hit ? '——**猜中了。**' : ''}`, hit ? 'death' : 'vote');
    if (g.winner) this.later(0, () => this.endGame());
  }

  /** 被鹰身女妖弄疯的人公开指认第二名玩家是邪恶的。 */
  harpyClaim(uid) {
    const g = this.requireSNV();
    const { target } = g.harpyClaim(uid);
    this.announce(`**${g.name(uid)}** 公开说：「${g.name(target)} 是邪恶的！」`, 'vote');
  }

  /**
   * 炸弹人引爆：公布死了谁，然后倒数。所有人（死人也算）各指一名存活的玩家，倒数结束时被最多人指着的死亡；
   * 平票没人死，入夜。7 号空座和机器人随便指（7 号空座的选择本来就由说书人随意定）。
   */
  async boomCountdown(g) {
    const left = g.boom.alive;
    this.announce(`💣 **炸弹人引爆了炸弹！** 只剩 ${left.map((id) => `**${g.name(id)}**`).join('、')} 还活着。倒数十声：每个人（包括死人）在行动面板里指向一名存活的玩家，被最多人指着的那个死亡；平票就没有人死。`, 'death');
    g.boom.until = Date.now() + BOOM_MS;
    this.deadline = g.boom.until;
    this.changed();
    for (const q of g.players.filter((x) => this.isFake(x.id))) {
      this.later(3000 + Math.random() * 12_000, () => { if (g.boom) { try { g.boomPoint(q.id, left[Math.floor(Math.random() * left.length)]); this.changed(); } catch { /* 已经结束 */ } } });
    }
    await new Promise((res) => this.later(BOOM_MS, res));
    this.deadline = null;
    if (this.game !== g) return;
    const who = g.boomResolve();
    this.announce(who ? `倒数结束：**${g.name(who)}** 被最多人指着，死亡。` : '倒数结束：平票，没有人死。', who ? 'death' : 'night');
  }

  /** 7 号空座：每天开放提名时掷一次，看今天要不要用掉唯一一次发言（快到终局还没用就一定用）。 */
  seat7Daily() {
    const g = this.game;
    const s = (g.seat7 ??= {});
    if (s.spoke || s.rolled === g.day || this.stId) return;
    s.rolled = g.day;
    this.later(3000 + Math.random() * 6000, () => this.seat7Speak());
  }

  /** 7 号空座唯一一次发言（灯神规则）：公开说一段话。被提名时可以拿来辩护。 */
  async seat7Speak({ nominated = false } = {}) {
    const g = this.game;
    const p = g?.get(SEAT7);
    const s = (g.seat7 ??= {});
    if (!p || s.spoke || g.phase !== 'day' || this.stId) return;
    const lastChance = g.aliveCount() <= 4;
    const late = g.aliveCount() <= Math.ceil(g.players.length / 2);
    if (!lastChance && !g.st.roll('seat7Speak', { nominated, late }, { who: SEAT7 })) return;
    s.spoke = g.day;
    const text = await this.seat7Text(p, { nominated });
    if (this.game !== g) return;
    this.announce(`🪑 **7 号空座**（说书人替它发言，每局只有这一次）：「${text}」`, 'vote');
    g.record('st', `7 号空座用掉了唯一一次发言${nominated ? '（被提名时辩护）' : ''}：${text}`);
    this.changed();
  }

  /** 7 号空座这次说什么：先问大模型（只给它知道的和公开的事），不行就按规则：善良说真话，邪恶报一个伪装并把怀疑引到善良玩家身上。 */
  async seat7Text(p, { nominated }) {
    const g = this.game;
    const evil = g.evilOf(p);
    const notes = g.seat7?.notes ?? [];
    const shown = ROLES[p.shownRole]?.name ?? '?';
    const mates = evil ? (g.evilKnown?.[p.id] ?? []).map((x) => `${g.name(x.id)}（${x.team}）`) : [];
    const pub = g.timeline.filter((e) => ['death', 'nominate', 'vote', 'slay'].includes(e.kind)).map((e) => `[${e.when}] ${e.text.replace(/（[^）]*）/g, '')}`);
    const claims = Object.entries(g.claims ?? {}).map(([id, r]) => `${g.name(id)} 公开声称是${ROLES[r]?.name ?? r}`);
    const ctx = [
      `7 号座位：${evil ? '邪恶' : '善良'}阵营，它以为自己的角色是${shown}。${nominated ? '它现在正被提名，这段话是它的辩护。' : ''}`,
      notes.length ? `它夜里得到的信息：\n${notes.join('\n')}` : '它夜里没有得到信息。',
      evil ? `它的同伴：${mates.join('、') || '不知道'}；可用的伪装：${(g.bluffs ?? []).map((r) => ROLES[r].name).join('、')}` : '',
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
    const bluff = (g.bluffs ?? []).map((r) => ROLES[r].name)[0] ?? '镇民';
    const good = others.filter((q) => !g.evilOf(q));
    const blame = good.length ? pick(good) : null;
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
    (this.advise ?? adviseFisherman)({ team: g.evilOf(p) ? '邪恶' : '善良', lie: !!lie, facts: g.factsSNV() })
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
      // 真猜中了（没失效）：白天要自己用的能力（枪、博学者、艺术家、渔夫）从这时起给按钮
      const unlock = level === '完美' && !lie && AMNESIAC_DAY.has(ability) && !g.amnesiacKnown?.[uid];
      if (unlock) (g.amnesiacKnown ??= {})[uid] = true;
      this.tell(uid, `你猜：${text}\n说书人的回答：**${said}**${unlock ? '\n你弄清了自己的能力，现在可以在行动面板里使用它了。' : ''}`, 'storyteller');
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
    (this.judge ?? judgeStatement)(`（这是一个是非问题：答案为"是"就判 true，为"不是"就判 false）${text}`, g.factsSNV())
      .then((res) => answer(res?.verdict ?? 'unknown'))
      .catch((e) => { console.warn('[botc] 判定艺术家的问题出错：', e.message); answer('unknown'); });
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
    this.announce(`**${g.name(uid)}** 公开选择了 **${g.name(target)}**。`, 'vote');
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
    const ask = async (claim, lines) => {
      const res = await (this.madnessJudge ?? judgeMadness)(claim, lines).catch(() => null);
      if (res) this.stNote(`语音判定（${res.by}）"${claim}"：${res.verdict}。${res.reason}`);
      return res?.verdict ?? 'unknown';
    };
    const dealt = (id) => g.block === id || g.lastExecuted === id; // 今天本来就要处决他
    const taken = () => g.executedToday || !!g.block;
    const punish = (id, why, say) => this.madPunish(id, why, say);
    // 畸形秀演员：听到他在说服别人自己是外来者
    for (const p of g.players.filter((q) => q.alive && g.abilityOf(q) === 'mutant' && !g.broken(q) && !dealt(q.id))) {
      const heard = this.heardLines(p.id);
      const said = heard.length ? await ask('我是外来者', heard) : null;
      if (this.game !== g) return;
      if (said === 'true' && g.st.mutantExecuted(p, { voice: true })) punish(p.id, '语音里说服别人自己是外来者', `**${g.name(p.id)}** 因为疯狂被处决了！`);
    }
    // 洗脑师的目标：听到了就让模型判；什么都没听到（没开语音判定、或者他一句没说）也掷骰子，只是依据不同
    // 有收音服务时声明不算数，要听他说的话；开不了收音的（机器人、掉线的）声明了就算尽力
    for (const { id, role, claimed } of g.madnessDue({ claimed: !!this.mic }).filter((x) => !dealt(x.id) && (g.get(x.id).alive || !taken()))) {
      const mustMic = !!this.mic?.tokenFor(id) && this.online.has(id);
      if (claimed && !mustMic) continue;
      const heard = this.heardLines(id);
      const verdict = heard.length ? await ask(`我是${ROLES[role].name}`, heard) : 'unknown';
      if (this.game !== g) return;
      if (verdict === 'true') continue;
      // 依据不一样，骰子不一样：听到了判没努力最重，有人听但他没说次之，根本没人在听时只知道他没公开声明
      const noMic = mustMic && !this.mic.seconds.has(id);
      const how = verdict === 'false' ? { heardFalse: true } : heard.length ? {} : noMic ? { noMic: true, claimed } : this.listeningTo(id) ? { silent: true } : { blind: true };
      if (!g.madnessPenalty(id, how)) continue;
      punish(id, heard.length ? '语音里没有努力证明' : noMic ? '没有打开收音' : '今天没有公开声明', `**${g.name(id)}** 没有疯狂地证明自己，被处决了！`);
    }
  }

  /** 判定不够疯狂：今天的处决还空着就处决（死人也算），占了就留到入夜。 */
  madPunish(id, why, say) {
    const g = this.game;
    if (g.executedToday || g.block || this.vote || this.pendingNom) { if (g.get(id).alive) g.madLater(id, why); return; }
    if (!g.madExecute(id, why)) return;
    this.announce(g.get(id).alive || g.lastExecuted === id ? say : `已经死去的 **${g.name(id)}** 也没能逃过疯狂的审判。今天的处决已经发生。`, 'death');
    this.klutzNotice();
  }

  /**
   * 收音页传来一句话：当场听他有没有破坏疯狂（说自己是被逼的、说出真实角色）。努力够不够还是黄昏判，天没黑不能说他没努力。
   * 本机筛过才问大模型。第一次只悄悄警告，第二次掷骰子处决：转写常有错字，冤杀的代价是一条命加一整天的提名。
   */
  async hearBreak(id, text) {
    const g = this.game;
    const open = () => this.game === g && g.phase === 'day' && !this.ended && !this.dusking && this.duskDay !== g.day;
    const due = g?.engine === 'snv' && !this.stId && open() ? g.madnessDue({ claimed: true }).find((x) => x.id === id) : null;
    const m = due && g.madness[id];
    const p = g?.get(id);
    if (!m || (m.checks ?? 0) >= BREAK_CHECKS || !looksBroken(text, ROLES[p.role].name) || due.role === p.role) return;
    m.checks = (m.checks ?? 0) + 1;
    const res = await (this.breakJudge ?? judgeBreak)(ROLES[due.role].name, ROLES[p.role].name, this.heardLines(id).slice(-5)).catch(() => null);
    if (res?.verdict !== 'true' || !open() || g.madness[id] !== m) return;
    g.record('st', `${g.tag(id)} 破坏了疯狂（${res.by}）：${res.reason}`);
    if (!m.warned) {
      m.warned = true;
      this.tell(id, '说书人听到了：你刚才破坏了疯狂。再这样会被处决。', 'storyteller');
      this.changed();
      return;
    }
    if (!g.madnessPenalty(id, { broke: true })) return;
    const before = g.executedToday;
    this.madPunish(id, '语音里破坏了疯狂', `**${g.name(id)}** 破坏了疯狂，被处决了！今天的处决已经发生。`);
    if (g.winner) this.later(0, () => this.endGame());
    else if (!before && g.executedToday) this.later(this.settings.pauseMs, () => this.autoDusk());
    this.changed();
  }

  /** 这局要不要开语音判定：房主打开了、AI 说书、梦殒春宵，而且这个服务器接得上（hearingFor 由服务器注入，旺财和 KOOK 没有）。 */
  async openHearing() {
    const g = this.game;
    if (g.engine !== 'snv' || this.stId || !this.settings.hearMadness || !this.square || !this.hearingFor) return;
    this.hearing = await this.hearingFor(this.square).catch(() => null);
    if (this.hearing) this.announce('本局开了语音判定：机器人留在广场语音里，只转写被疯狂的玩家说的话，音频不保存。', 'info');
    else this.announce('语音判定没有打开，本局按公开声明判定疯狂。', 'info');
  }

  closeHearing() { this.hearing?.stop(); this.hearing = null; this.mic?.stop(); this.mic = null; }

  /**
   * 今天真有人在听这个人吗：他开收音页传过声音，或者机器人在广场而他今天没进屋跟人说话（屋里听不到）。
   * 收音箱每天都建、不代表他开了；掉线的和机器人都算没人听。
   */
  listeningTo(id) {
    if (this.isFake(id) || !this.online.has(id)) return false;
    if (this.mic?.seconds.has(id)) return true;
    return !!this.hearing && !this.meets.some((m) => m.day === this.game.day && (m.who === id || m.with.includes(id)));
  }

  /** 这个人今天被听到的话：机器人在广场听到的，加上他自己开收音页传上来的。 */
  heardLines(id) { return [...(this.hearing?.transcript(id) ?? []), ...(this.mic?.transcript(id) ?? [])]; }

  /** 天亮：今天听谁（被洗脑的人和畸形秀演员）。 */
  hearToday() {
    const g = this.game;
    if (g.engine !== 'snv') return;
    const due = g.madnessDue().map((x) => x.id).filter((id) => !this.isFake(id));
    this.hearing?.listen([...due, ...g.players.filter((q) => q.alive && g.abilityOf(q) === 'mutant' && !this.isFake(q.id)).map((q) => q.id)]);
    // 收音页：谁被洗脑谁自己决定开不开，所以不用房主打开（micFor 由服务器注入，没有转写服务时没有）
    if (!this.stId && this.micFor) {
      this.mic ??= this.micFor();
      this.mic.onLine = (id, text) => this.hearBreak(id, text).catch((e) => console.warn('[botc] 判定破坏疯狂出错：', e.message));
      this.mic.listen(due);
    }
  }

  slay(uid, target) {
    const g = this.requireGame();
    const p = g.get(uid);
    const amnesiacGun = g.engine === 'snv' && p?.role === 'amnesiac' && ['slayer', 'amn_gun', 'amn_judge'].includes(g.abilityOf(p)) && !!g.amnesiacKnown?.[uid];
    if (g.script !== 'tb' && !inScript('slayer', g.script) && !amnesiacGun) throw new UserError('这个剧本没有猎手');
    const { hit } = g.slay(uid, target);
    this.announce(`**${g.name(uid)}** ${amnesiacGun ? '举起枪' : '声称自己是猎手'}，向 **${g.name(target)}** 开了一枪……${hit ? `**${g.name(target)}** 倒下了！` : '什么都没有发生。'}`, hit ? 'death' : 'info');
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
      // 有家的从自家门口出门，没有的站在集合点一圈
      const s = (this.homes && this.town.homeStep(this.homes[p.id])) ?? this.town.seatSpot(i, g.players.length);
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
  move(uid, x, y, { force = false } = {}) {
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
    if (target && r.zone.get(uid) !== target.id && !force) {
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
    const dur = (pathLength(path) / SPEED) * 1000;
    const m = { fx: from.x, fy: from.y, x: end.x, y: end.y, start: Date.now(), dur, path };
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
    this.move(who, c.x + (Math.random() - 0.5) * 50, c.y + (Math.random() - 0.5) * 30, { force: true });
  }

  /** 屋里的人邀请别人进来私聊（对方点「过去」就自动走进来，锁着门也能进）。60 秒没回应作废。 */
  invite(uid, hid, who) {
    const r = this.roam;
    const st = r?.state.get(hid);
    if (!st) throw new UserError('没有这间房子');
    if (!st.ids.has(uid)) throw new UserError('你得在房子里才能邀请别人');
    if (!this.game.get(who) || who === uid) throw new UserError('邀请谁？');
    if (st.ids.has(who)) throw new UserError('他已经在屋里了');
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
    this.move(uid, c.x + (Math.random() - 0.5) * 50, c.y + (Math.random() - 0.5) * 30, { force: true });
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
      if (!this.roam) return;
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
      // 自动说书：回到广场后开放提名
      if (!this.stId) this.later(this.settings.pauseMs / 2, () => this.openNominations());
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

  // ───────────── 说书人 ─────────────
  async stAction({ action, target, role, text }) {
    if (!this.stId) throw new UserError('说书人工具只在真人说书模式下可用');
    const g = this.requireGame();
    const p = g.get(target);
    if (!p) throw new UserError('选择一名玩家');
    switch (action) {
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
        this.announce(g.phase === 'night' ? `夜里，**${g.name(p.id)}** 因为疯狂被处决了！` : `**${g.name(p.id)}** 因为疯狂被处决了！`, 'death');
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
    if (action === 'kill' && g.phase === 'day') this.announce(`**${g.name(p.id)}** 死了。`, 'death');
    if (g.winner && (g.phase !== 'night' || action === 'madExecute')) await this.endGame(); // 夜里的处决当场公布，胜负也当场定
  }

  // ───────────── 结束 ─────────────
  async endGame() {
    if (this.ended) return;
    this.ended = true;
    this.closeHearing();
    this.vote = null;
    this.pendingNom = null;
    this.deadline = null;
    const g = this.game;
    this.clearNoms();
    // 先公布结果：语音收尾（关房间、解开闭麦）要等合作机器人，慢的时候大家会一直卡在最后一刻
    this.announce(`${g.winner === 'good' ? '善良阵营获胜！' : '邪恶阵营获胜！'} ${g.winReason}`, 'end');
    if (!this.tutorial) this.onEnded?.(this); // 永久存档这一局
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
    this.announce('大家都离开了，对局暂停，语音里的闭麦闭耳已经放开。有人回来会自动接着打。', 'clock');
    await this.syncGame();
    if (this.watchMuted?.length) { const ids = this.watchMuted; this.watchMuted = []; await this.safeVoice((v) => v.setMuted?.(ids, false, 'watch')); }
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
      inbox: entries(this.inbox), pendingInfo: entries(this.pendingInfo),
      resolving: this.resolving, rkPending: this.rkPending, revivePending: this.revivePending ?? null, deadline: this.deadline, nightBase: this.nightBase ?? null, dueFor: this.dueFor ?? {}, dawnAt: this.dawnAt ?? null,
      roamedToday: !!this.roamedToday, duskDay: this.duskDay ?? null, homes: this.homes ?? null,
      pendingNom: this.pendingNom,
      noms: this.noms && { until: this.noms.until, paused: this.noms.paused, timeUp: this.noms.timeUp, skips: [...this.noms.skips] },
      vote: this.vote && { ...this.vote, yes: [...this.vote.yes], locked: [...this.vote.locked] },
      lastVote: this.lastVote ?? null,
      voteHistory: this.voteHistory ?? [], knifeLog: this.knifeLog ?? [], execLog: this.execLog ?? [],
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
    for (const u of s.users ?? []) this.users.set(u.id, u);
    this.lobby = s.lobby ?? [];
    this.roleAssign = s.roleAssign ?? {};
    this.newbies = s.newbies ?? [];
    this.game = s.game ? Game.fromJSON(s.game) : null;
    this.wireGame();
    Object.assign(this, {
      artistAsks: s.artistAsks ?? [], ended: s.ended, square: s.square, log: s.log ?? [], logSeq: s.logSeq ?? 0, epoch: s.logEpoch ?? this.epoch, stLog: s.stLog ?? [],
      inbox: new Map(s.inbox ?? []), pendingInfo: new Map(s.pendingInfo ?? []),
      resolving: s.resolving, rkPending: s.rkPending, revivePending: s.revivePending ?? null, deadline: s.deadline, nightBase: s.nightBase ?? s.deadline ?? null, dueFor: s.dueFor ?? {}, dawnAt: s.dawnAt ?? null,
      roamedToday: s.roamedToday, duskDay: s.duskDay, homes: s.homes ?? null, pendingNom: s.pendingNom, lastVote: s.lastVote,
      voteHistory: s.voteHistory ?? [], knifeLog: s.knifeLog ?? [], execLog: s.execLog ?? [],
      beliefs: s.beliefs ?? null, meets: s.meets ?? [],
      outfits: new Map(s.outfits ?? []),
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
    const left = (until, min = 5000) => Math.max(min, (until ?? 0) - Date.now());
    this.announce(why, 'clock');
    this.watchVoice();
    this.syncWatchMute(); // 观战的人重新闭上（重启时都被解开了）
    for (const r of this.rooms.values()) if (r.until) r.timer = this.later(left(r.until), () => this.closeRoom(r.channelId, '时间到'));
    // 令牌和文字都不存档：重启后重新打开、发新的。全员离线后回来不算重启，已经收到的话不能清掉
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
      log: this.log.slice(-40),
      logEpoch: this.epoch,
      now: Date.now(),
      deadline: this.deadlineFor(uid),
      moonchildDue: this.moonchildDue ?? null,
      voiceReady: !!this.square,
      tutorial: !!this.tutorial,
      // 观战席：在线但没坐下（大厅）/ 不在这局里（游戏中）的人
      watchers: [...this.online].filter((id) => (g ? !g.get(id) : !this.lobby.some((p) => p.id === id)) && id !== this.stId)
        .map((id) => { const u = this.users.get(id); return { id, name: u?.name ?? '?', avatar: u?.avatar ?? null }; }),
    };
    if (!g) return { ...view, phase: 'lobby' };

    const spectator = !isST && !g.get(uid);
    const showRoles = isST || this.ended || (spectator && this.settings.spectatorGrimoire);
    // 结算完到天亮公布之前有几秒：别的玩家这时还看不到今晚谁死了（夜里的疯狂处决当场公布，不在这里面）
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
      night: Math.max(1, g.night),
      day: g.day,
      threshold: g.threshold(),
      aliveCount: g.visAliveCount() + hushed.size, // 看起来活着的人数：假死的僵怖算死人，不然一看人数就知道谁是僵怖
      block: g.block,
      blockVotes: g.blockVotes,
      blockTied: g.blockTied ?? [],
      executedToday: g.executedToday,
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: g.visAlive(p) || (hushed.has(p.id) && p.id !== uid), ghostVote: p.ghostVote,
        avatar: this.lobby.find((x) => x.id === p.id)?.avatar ?? null,
        char: this.lobby.find((x) => x.id === p.id)?.char ?? null,
        outfit: this.outfits.get(p.id) ?? null,
        fake: this.isFake(p.id), seat7: !!p.seat7,
        nominated: g.nominees.has(p.id), nominator: g.nominators.has(p.id), shot: (g.shooters ?? []).includes(p.id),
        online: this.online.has(p.id),
        ...(showRoles ? this.grimEntry(p) : {}),
      })),
      pendingNom: this.pendingNom,
      boom: g.boom?.until ? { until: g.boom.until, alive: g.boom.alive, mine: g.boom.points[uid] ?? null, count: Object.keys(g.boom.points).length } : null, // 炸弹人倒数
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
      const prompt = g.phase === 'night' && (!this.resolving || this.revivePending === uid) && (p.alive || g.ghostLunatic?.(p) || (g.engine === 'snv' && g.kept(p))) ? g.nightPrompts().find((x) => x.playerId === uid) : null;
      view.self = {
        seat: p.seat, alive: g.visAlive(p), ghostVote: p.ghostVote,
        role: { id: p.shownRole, name: r.name, team: r.team, teamName: TEAM_NAME[r.team], evil: g.engine === 'snv' && p.role !== 'lunatic' ? g.evilOf(p) : isEvilRole(p.shownRole), ability: r.ability },
        ...(g.engine === 'snv' ? this.snvSelf(p) : {}),
        inbox: this.inbox.get(uid) ?? [],
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
          bluffs: g.evilKnown && (uid === g.firstDemon || ((g.bluffsShared || this.settings.minionBluffs) && g.evilKnown[g.firstDemon]?.some((a) => a.id === uid))) ? [...g.bluffs] : null,
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
  snvSelf(p) {
    const g = this.game;
    const uid = p.id;
    const ab = g.abilityOf(p);
    const day = g.phase === 'day' && !this.ended;
    const d = g.declared?.[uid];
    const usedToday = d?.day === g.day ? d.n : 0;
    // 食人族不知道自己拿到了什么能力：白天的几个"拜访说书人"他都可以试试，不是他的能力就什么也不发生
    // 失忆者不知道自己的能力：猜到「完美」之前不给白天的按钮
    const knows = p.role !== 'amnesiac' || !!g.amnesiacKnown?.[uid];
    const tryAs = (r) => ((ab === r && knows) || (p.role === 'cannibal' && inScript(r, g.script)));
    return {
      gained: p.gained && !g.hidden(p) ? { id: p.gained, name: ROLES[p.gained].name, ability: ROLES[p.gained].ability } : null,
      klutz: (day || !!g.klutzNow) && g.pendingKlutz === uid, // 夜里死的要等天亮才选，不然死讯提前暴露（夜里被处决的已经公开了）
      madness: g.madness?.[uid] ? { role: ROLES[g.madness[uid].role].name, claimed: !!g.madness[uid].claimed } : null,
      canDeclare: day && declarable(g.script) && !this.dusking && this.duskDay !== g.day && usedToday < MAX_DECLARES,
      canJuggle: day && inScript('juggler', g.script) && g.juggleLog?.[uid] !== g.day && (g.day === 1 || (ab === 'juggler' && g.jugglerDay?.[uid] === g.day)),
      canSavant: day && p.alive && tryAs('savant') && g.savantDay?.[uid] !== g.day,
      canArtist: day && p.alive && tryAs('artist') && !g.used?.[uid] && !this.triedToday(uid, 'artist'),
      canFisherman: day && p.alive && tryAs('fisherman') && !g.used?.[`fish-${uid}`] && !this.triedToday(uid, 'fisherman'),
      canAmnesiac: day && p.alive && p.role === 'amnesiac' && g.amnesiacDay?.[uid] !== g.day,
      canSlay: day && p.alive && ['slayer', 'amn_gun', 'amn_judge'].includes(ab) && knows && !g.shooters?.includes(uid),
      canPardon: day && p.alive && ab === 'amn_pardon' && knows && !g.used?.[`pardon-${uid}`] && !!g.block && !this.vote && !this.pendingNom,
      // 被提名、还没开始投票：可以公开声明自己是哥布林（谁都可以这么说）
      canGoblin: day && inScript('goblin', g.script) && this.pendingNom?.nominee === uid && !this.vote && g.claims?.[uid] !== 'goblin',
      // 谁都可以公开猜落难少女（每人一次，诈身份用）；只有真爪牙的第一次猜测算数
      canDamsel: day && inScript('damsel', g.script) && !g.damselTried?.[uid],
      harpy: g.harpyMad?.id === uid && g.harpyMad.night === g.night && g.phase === 'day' ? { target: g.harpyMad.target, name: g.name(g.harpyMad.target), claimed: !!g.harpyMad.claimed } : null,
      hearing: !!this.hearing,
      mic: day ? this.mic?.tokenFor(uid) ?? null : null,
      micOn: !!this.mic?.seconds.has(uid), // 收音页传上来过声音
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
