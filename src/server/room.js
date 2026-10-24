// 一个频道里的一局游戏：大厅 → 开局 → 夜晚收集选择 → 白天提名投票 → 结束。
// 所有操作走 act(userId, type, payload)；状态变了就 onChange()，由服务器给每个人推送各自的视图。
import { Game, shuffle } from '../engine/game.js';
import { ROLES, TEAM_NAME, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, isEvilRole } from '../engine/roles.js';
import {
  housesFor, houseAt, houseCenter, doorPoint, route, pathLength, positionAt, seatSpot, clampToMap, randomSpot, SPEED,
} from '../shared/map.js';
import { CHARACTERS, CHARACTER_IDS } from '../shared/characters.js';
import { cleanOutfit } from '../shared/outfit.js';
import { SETUPS } from '../shared/setups.js';
import { narration } from './narration.js';
import { ttsUrl } from './tts.js';

export class UserError extends Error {}
const newId = () => Math.random().toString(36).slice(2, 8);

export const DEFAULT_SETTINGS = {
  script: 'tb',          // 剧本：tb 暗流涌动 / bmr 黯月初升
  preset: null,          // 套用官方八人推荐配置（SETUPS[script] 的下标；只在 8 人时生效）
  mode: 'auto',          // auto：机器人说书；human：房主说书
  shuffle: true,
  chooseSeconds: 90,     // 夜里选人时限
  voteSeconds: 3,        // 投票时钟每人停留
  voteCountdown: 8,      // 时钟开始转动前的倒计时
  nightDeafen: true,     // 夜里服务器闭麦+闭耳
  pauseMs: 4000,         // 结算后到下一阶段的停顿
  roamMinutes: 5,        // 白天自由活动多久（0 = 等主持人喊集合）
  nominateMinutes: 3,    // 集合后开放提名多久（自动说书）
  accuseSeconds: 60,     // 提名者陈述（房主开局前可调）
  defendSeconds: 60,     // 被提名者辩护（房主开局前可调）
  nominatorVotes: true,  // 房规：提名的人自动算一票（票数从 1 开始）
  speechMute: true,      // 陈述/辩护时只有发言的人能说话，其他人服务器闭麦
  smallEvilInfo: false,
  minionBluffs: true,    // 房规：爪牙和恶魔共用 3 个伪装（官方只给恶魔，恶魔再私下告诉队友）
  hideVotes: true,
  spectatorGrimoire: false, // 观战的人能看魔典（所有人身份）——会漏信息，默认关
  muteSpectators: true,     // 开局后观战的人在语音里被服务器闭麦（免得漏信息）；离开或终局自动解除       // 房规：投票过程中只看得到自己举没举手，投完公开（官方是实时公开举手）  // 房规：6 人及以下也让恶魔和爪牙互认、恶魔拿伪装（官方不给）
};

export class Room {
  constructor({ key, guildId, hostId, voice, onChange = () => {}, settings = {} }) {
    this.key = key;
    this.guildId = guildId;
    this.hostId = hostId;
    this.voice = voice;
    this.onChange = onChange;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.users = new Map();   // 连过来的人：id → {id, name, avatar}
    this.outfits = new Map(); // 小人的搭配：id → outfit（随时能换，只是外观）
    this.online = new Set();
    this.timers = new Set();
    this.reset();
  }

  /** 回到大厅（保留已加入的人，方便再来一局）。 */
  reset() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.lobby = this.lobby ?? [];
    this.game = null;
    this.ended = false;
    this.square = null;
    this.vote = null;
    this.pendingNom = null;
    this.roam = null;           // 白天自由活动（小镇地图）
    this.noms = null;           // 自动说书的提名环节：{ until, timeUp, skips }
    this.nomTimers = [];
    this.rooms = new Map();     // 主持人拉人的私聊房间 channelId → {channelId, members, until}
    this.inbox = new Map();
    this.pendingInfo = new Map();
    this.stLog = [];
    this.log = [];
    this.resolving = false;
    this.rkPending = null;
    this.deadline = null;
    this.logSeq = 0;
    this.duskDay = null;
    this.roamedToday = false;
    this.lastVote = null;
    this.voteHistory = [];      // 每次投票的票型（谁提名谁、谁举了手），投完公开
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

  announce(text, kind = 'info') {
    this.log.push({ id: ++this.logSeq, text, kind, at: Date.now() });
    if (this.log.length > 80) this.log.shift();
  }
  /** AI 房主的一句旁白（极乐迪斯科式）。客户端会读出来；有 title 的弹出过场标题卡。 */
  narrate(event, vars) {
    const n = narration(event, vars);
    if (!n) return;
    this.log.push({ id: ++this.logSeq, kind: 'story', text: n.text, title: n.title ?? null, audio: ttsUrl(n.text), at: Date.now() });
    if (this.log.length > 80) this.log.shift();
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
    // 走路很频繁，只推送位置，不推完整状态
    if (type === 'move') return this.move(uid, p.x, p.y);
    switch (type) {
      case 'join': this.join(uid); break;
      case 'leave': this.leave(uid); break;
      case 'claimHost':
        if (this.online.has(this.hostId)) throw new UserError('房主还在线');
        if (this.game && this.stId) throw new UserError('真人说书进行中，不能接管');
        this.hostId = uid;
        this.announce(`${this.name(uid)} 接管了房主`);
        break;
      case 'settings': this.updateSettings(uid, p); break;
      case 'character': this.pickCharacter(uid, p.id ?? null); break;
      case 'outfit': this.outfits.set(uid, cleanOutfit(p.outfit, uid)); break;
      case 'addBots': this.requireHost(uid); this.addFakes(Number(p.count) || 1); break;
      case 'kick': this.requireHost(uid); if (!this.game) this.lobby = this.lobby.filter((x) => x.id !== p.target); break;
      case 'start': this.requireHost(uid); await this.start(); break;
      case 'choose': this.choose(uid, p.night, p.targets ?? [], p.role ?? null); break;
      case 'gossip': this.gossip(uid, p.statement ?? {}); break;
      case 'moonchild': this.moonchild(uid, p.target); break;
      case 'ravenkeeper': await this.onRavenkeeper(uid, p.target); break;
      case 'nominate': this.nominate(uid, p.target); break;
      case 'startVote': this.startVote(uid); break;
      case 'nomDone': this.nomDone(uid); break;
      case 'skipNom': this.skipNom(uid); break;
      case 'hand': this.hand(uid, !!p.up); break;
      case 'history': return { games: this.history?.list(this.guildId) ?? [] };
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
    if (p.script === 'tb' || p.script === 'bmr') { if (s.script !== p.script) s.preset = null; s.script = p.script; }
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

  addFakes(n) {
    if (this.game) throw new UserError('游戏已经开始了');
    let k = Math.max(0, ...this.lobby.filter((p) => p.fake).map((p) => Number(p.id.slice(4))));
    for (let i = 0; i < n && this.lobby.length < MAX_PLAYERS; i++) {
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
    const preset = !this.tutorial && seats.length === 8 && this.settings.preset != null ? SETUPS[script]?.[this.settings.preset] : null;
    const roles = this.tutorial ? this.tutorial.roles : preset ? shuffle(preset.roles, Math.random) : undefined;
    this.game = new Game(seats.map(({ id, name }) => ({ id, name })), { roles, drunkAs: preset?.drunkAs, script, evilInfo: seats.length >= 7 || this.settings.smallEvilInfo });
    if (preset) this.stNote(`套用推荐配置「${preset.name}」`);
    this.square = await this.safeVoice((v) => v.findSquare(this.hostId, seats.map((p) => p.id)));
    const [t, o, m, d] = DISTRIBUTION[seats.length];
    this.announce(`游戏开始！《${script === 'bmr' ? '黯月初升' : '暗流涌动'}》${seats.length} 人：镇民 ${t} · 外来者 ${o} · 爪牙 ${m} · 恶魔 ${d}`, 'start');
    this.narrate('start', { n: seats.length });
    if (!this.square) this.announce('没检测到大家所在的语音频道，夜晚闭麦和拉人私聊不会生效（房主先进语音再开局即可）。');
    this.syncWatchMute();
    this.stNote(`伪装：${this.game.bluffs.map((r) => ROLES[r].name).join('、')}`);
    await this.beginNight();
  }

  // ───────────── 夜晚 ─────────────
  async beginNight() {
    const g = this.game;
    await this.endRoam();
    await this.closeAllRooms();
    this.pendingNom = null;
    const prompts = g.startNight();
    this.resolving = false;
    if (g.evilMessages?.length) { this.deliver(g.evilMessages); g.evilMessages = null; }
    this.clearNoms();
    this.announce(`第 ${g.night} 夜降临，所有人闭上眼睛……`, 'night');
    this.narrate('night', { night: g.night });
    if (this.settings.nightDeafen && this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square));
    for (const pr of prompts) if (this.isFake(pr.playerId)) this.botChoose(pr.playerId);
    this.stNote(`第 ${g.night} 夜。等待：${prompts.filter((x) => !this.isFake(x.playerId)).map((x) => `${g.name(x.playerId)}（${ROLES[x.role].name}）`).join('、') || '无'}`);
    const night = g.night;
    if (!g.missingChoices().length) { this.later(this.settings.pauseMs / 2, () => this.finishNight(night)); return; }
    this.deadline = Date.now() + this.settings.chooseSeconds * 1000;
    this.nightTimer = this.later(this.settings.chooseSeconds * 1000, () => this.finishNight(night));
  }

  choose(uid, night, targets, role = null) {
    const g = this.requireGame();
    if (g.phase !== 'night' || g.night !== night || this.resolving) throw new UserError('这个选择已经过期了');
    const msgs = g.submitChoice(uid, targets, { role });
    if (msgs?.length) this.deliver(msgs);
    for (const pr of g.nightPrompts()) if (this.isFake(pr.playerId) && !g.choices[pr.playerId] && !pr.waiting) this.botChoose(pr.playerId);
    this.stNote(`${g.name(uid)}（${ROLES[g.get(uid).shownRole].name}）选择了 ${this.choiceText(g.choices[uid])}`);
    if (!g.missingChoices().length) this.later(600, () => this.finishNight(night));
  }

  async finishNight(night) {
    const g = this.game;
    if (!g || g.phase !== 'night' || g.night !== night || this.resolving) return;
    this.resolving = true;
    this.deadline = null;
    this.cancel(this.nightTimer);
    const timedOut = new Set(g.missingChoices());
    for (let pass = 0; pass < 2; pass++) {
      for (const id of g.missingChoices()) {
        if (g.nightPrompts().find((x) => x.playerId === id)?.waiting) continue;
        if (this.isFake(id)) this.botChoose(id); else g.autoChoose(id);
        const c = g.choices[id];
        if (!c) continue;
        const names = this.choiceText(c);
        if (c && !this.isFake(id)) this.tell(id, `时间到，已替你随机选择：${names}`, 'clock');
        this.stNote(`${g.name(id)} 超时，随机选择了 ${names}`);
        // 疯子选完：把他的选择告诉恶魔
        if (g.get(id)?.role === 'lunatic') { const d = g.players.find((q) => ROLES[q.role].team === 'demon' && q.alive); if (d) this.deliver([{ playerId: d.id, text: `疯子 ${g.name(id)} 今晚选了：${names}。` }]); }
      }
    }
    for (const [id, c] of Object.entries(g.choices)) {
      g.record('choice', `${g.tag(id)} 选择了 ${this.choiceText(c)}${timedOut.has(id) ? '（超时，随机）' : ''}`);
    }
    const { messages, ravenkeeper } = g.resolveNight();
    this.deliver(messages);
    if (ravenkeeper) {
      this.rkPending = ravenkeeper;
      if (this.isFake(ravenkeeper)) return this.onRavenkeeper(ravenkeeper, g.players[0].id);
      this.deadline = Date.now() + this.settings.chooseSeconds * 1000;
      this.rkTimer = this.later(this.settings.chooseSeconds * 1000, () => this.onRavenkeeper(ravenkeeper, g.players[0].id));
      return;
    }
    this.afterNight();
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

  afterNight() {
    const g = this.game;
    if (this.stId) {
      this.stNote(`夜晚结算完毕。今晚死亡：${g.nightDeaths.map((id) => g.name(id)).join('、') || '无'}。处理完信息后点「天亮」。`);
      return;
    }
    this.later(this.settings.pauseMs, () => this.beginDay());
  }

  async forceDawn() {
    const g = this.requireGame();
    if (g.phase !== 'night') throw new UserError('现在不是夜晚');
    // 真人模式：第一次按 = 结算夜晚（没选的随机），第二次按 = 天亮
    if (!this.resolving) { await this.finishNight(g.night); if (this.stId) return; }
    if (this.rkPending) {
      if (this.stId) throw new UserError('守鸦人还没选择');
      await this.onRavenkeeper(this.rkPending, g.players[0].id);
    }
    await this.beginDay();
  }

  // ───────────── 白天 ─────────────
  async beginDay() {
    const g = this.game;
    if (!g || (g.phase !== 'night' && !g.winner) || this.ended) return;
    this.pendingInfo.clear();
    this.resolving = false;
    this.roamedToday = false;
    await this.closeAllRooms();
    const { deaths } = g.dawn();
    if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square));
    this.announce(deaths.length
      ? `第 ${g.day} 天。昨晚，${deaths.map((id) => `**${g.name(id)}**`).join('、')} 死了。`
      : `第 ${g.day} 天。昨晚是**平安夜**。`, 'day');
    const back = (g.nightRevived ?? []).filter((id) => g.get(id)?.alive);
    if (back.length) this.announce(`${back.map((id) => `**${g.name(id)}**`).join('、')} 复活了。`, 'day');
    if (g.nightRevived) g.nightRevived = [];
    this.moonchildNotice();
    if (g.winner) { await this.endGame(); return; }
    this.narrate('dawn', { day: g.day, deaths: deaths.map((id) => g.name(id)) });
    // 自动说书：看完死讯就开始自由活动
    if (!this.stId) {
      const day = g.day;
      this.later(this.settings.pauseMs * 1.5, async () => {
        if (g.phase === 'day' && g.day === day && !this.roam && !this.vote && !this.pendingNom && !this.ended) this.startRoam(this.settings.roamMinutes);
      });
    }
  }

  nominate(uid, target) {
    const g = this.requireGame();
    if (this.pendingNom || this.vote) throw new UserError('还有一场提名/投票没结束');
    if (this.roam) throw new UserError('自由活动中，等集合回到广场再提名');
    if (this.noms?.timeUp) throw new UserError('提名时间已经结束了');
    const r = g.nominate(uid, target);
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

  /** 观战的人闭麦 / 解除（开局后、有人进出、终局时调用）。只动自己闭上的人。 */
  async syncWatchMute() {
    const want = new Set(this.game && !this.ended && this.square && this.settings.muteSpectators ? this.watcherIds() : []);
    const prev = new Set(this.watchMuted ?? []);
    const unmute = [...prev].filter((id) => !want.has(id));
    const mute = [...want].filter((id) => !prev.has(id));
    this.watchMuted = [...want];
    if (unmute.length) await this.safeVoice((v) => v.setMuted?.(unmute, false));
    if (mute.length) await this.safeVoice((v) => v.setMuted?.(mute, true));
  }

  async speakOnly(who) {
    const prev = this.speechMuted ?? new Set();
    const next = new Set(who && this.settings.speechMute && this.square ? this.realIds().filter((id) => id !== who) : []);
    const unmute = [...prev].filter((id) => !next.has(id));
    const mute = [...next].filter((id) => !prev.has(id));
    this.speechMuted = next;
    if (!this.square) return;
    if (unmute.length) await this.safeVoice((v) => v.setMuted?.(unmute, false));
    if (mute.length) await this.safeVoice((v) => v.setMuted?.(mute, true));
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
    return !!this.noms && g.alive().every((p) => g.nominators.has(p.id) || this.noms.skips.has(p.id));
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
      for (const p of this.game.alive()) if (this.isFake(p.id)) this.noms?.skips.add(p.id);
      return;
    }
    const g = this.game;
    for (const p of g.alive().filter((q) => this.isFake(q.id) && !g.nominators.has(q.id))) {
      if (this.noms?.skips.has(p.id)) continue;
      this.later(2000 + Math.random() * 5000, () => {
        if (!this.noms || this.noms.timeUp || this.pendingNom || this.vote || g.phase !== 'day' || g.nominators.has(p.id) || !p.alive) return;
        const targets = g.players.filter((q) => q.id !== p.id && !g.nominees.has(q.id));
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
    if (this.settings.nominatorVotes && this.game.canVote(nom.nominator)) this.vote.yes.add(nom.nominator);
    this.deadline = Date.now() + this.settings.voteCountdown * 1000;
    this.later(this.settings.voteCountdown * 1000, () => this.voteTick());
  }

  voteTick() {
    const v = this.vote; const g = this.game;
    if (!v || v.result) return;
    // 指针停在一个人面前的这几秒里他还能举手/放下；指针离开他时才锁定（官方：指针经过时手举着才算）
    if (v.idx >= 0) {
      const prev = v.order[v.idx];
      // 管家：锁定那一刻主人没举手，这一票不算
      if (v.yes.has(prev) && !g.butlerOk(prev, [...v.yes])) {
        v.yes.delete(prev);
        if (!this.isFake(prev)) this.tell(prev, '你的主人没有举手——你的票不算。', 'butler');
      }
      v.locked.add(prev);
    }
    v.idx += 1;
    this.deadline = null;
    if (v.idx >= v.order.length) { this.finishVote(); return; }
    const id = v.order[v.idx];
    if (this.isFake(id) && g.canVote(id) && this.botVotes(id, v)) v.yes.add(id);
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
      fail: `票数不够（存活 ${g.aliveCount()} 人，需要一半即 ${v.result.threshold} 票）`,
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
    if (!up && uid === v.nominator && this.settings.nominatorVotes) throw new UserError('提名的人自动投赞成票，不能放下');
    if (up) v.yes.add(uid); else v.yes.delete(uid);
  }

  async dusk() {
    const g = this.requireGame();
    if (g.phase !== 'day') throw new UserError('现在不是白天');
    if (this.vote) throw new UserError('等这轮投票结束');
    await this.endRoam();
    this.pendingNom = null;
    this.clearNoms();
    const already = g.executedToday;
    const { executed, result } = g.endDay();
    this.duskDay = g.day; // 读档时：今天黄昏已经结算过，直接入夜
    if (executed && result === 'saved') this.announce(`黄昏。**${g.name(executed)}** 被处决了——但依然活着。`, 'death');
    else if (executed) this.announce(`黄昏。**${g.name(executed)}** 被处决了。`, 'death');
    else this.announce(already ? '黄昏。今天的处决已经发生过了。' : '黄昏。今天没有人被处决。', 'night');
    this.moonchildNotice();
    if (executed && result !== 'saved') this.narrate('execution', { name: g.name(executed) });
    else if (!executed) this.narrate('noExecution', { already });
    if (g.winner) return this.endGame();
    this.later(this.settings.pauseMs, () => this.beginNight());
  }

  /** 任何人都可以公开"像造谣者那样"发表声明；只有真造谣者的声明会生效。 */
  gossip(uid, statement) {
    const g = this.requireGame();
    if (g.script !== 'bmr') throw new UserError('这个剧本没有造谣者');
    const { text } = g.gossipStatement(uid, statement);
    this.announce(`**${g.name(uid)}** 公开声明：「${text}」`, 'vote');
  }

  /** 月之子得知自己死亡后公开选人。 */
  moonchild(uid, target) {
    const g = this.requireGame();
    g.moonchildChoose(uid, target);
    this.announce(`**${g.name(uid)}** 公开选择了 **${g.name(target)}**。`, 'vote');
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

  slay(uid, target) {
    const g = this.requireGame();
    if (g.script === 'bmr') throw new UserError('这个剧本没有猎手');
    const { hit } = g.slay(uid, target);
    this.announce(`**${g.name(uid)}** 声称自己是猎手，向 **${g.name(target)}** 开了一枪……${hit ? `**${g.name(target)}** 倒下了！` : '什么都没有发生。'}`, hit ? 'death' : 'info');
    this.narrate('slay', { a: g.name(uid), b: g.name(target), hit });
    if (g.winner) this.later(0, () => this.endGame());
  }

  // ───────────── 白天自由活动：小镇地图 ─────────────
  // 走进房子 = 机器人把你拉进那间房子的语音频道；走出来 = 拉回广场。房子空了频道就删掉。
  startRoam(minutes) {
    const g = this.requireGame();
    if (g.phase !== 'day' || this.ended) throw new UserError('只有白天能自由活动');
    if (this.vote || this.pendingNom) throw new UserError('等这轮提名/投票结束');
    if (this.roam) return;
    this.roamedToday = true;
    const houses = housesFor(g.players.length);
    const now = Date.now();
    const pos = new Map(g.players.map((p, i) => {
      const s = seatSpot(i, g.players.length);
      return [p.id, { fx: s.x, fy: s.y, x: s.x, y: s.y, start: now, dur: 0 }];
    }));
    this.roam = {
      houses, pos,
      state: new Map(houses.map((h) => [h.id, { ids: new Set(), locked: false, knocks: new Set(), allow: new Set(), channelId: null, queue: Promise.resolve() }])),
      zone: new Map(),    // playerId → houseId
      arrive: new Map(),  // playerId → 到达计时器
      until: minutes ? now + minutes * 60_000 : null,
      endVotes: new Set(), // 同意提前集合的人
    };
    if (minutes) this.roamTimer = this.later(minutes * 60_000, () => this.endRoam('时间到'));
    this.wander();
    this.announce(`自由活动${minutes ? `（${minutes} 分钟）` : ''}！点地图走动，走进小房子就能私聊，房子里的人可以锁门。`, 'day');
    this.narrate('roam', { minutes });
  }

  /** 现在这一刻的位置（可能正走在路上）。 */
  posNow(id) {
    return positionAt(this.roam.houses, this.roam.pos.get(id), Date.now());
  }

  /** 走到 (x, y)。锁着门的房子只能走到门口并敲门。返回给客户端的提示。 */
  move(uid, x, y, { force = false } = {}) {
    const r = this.roam;
    if (!r) throw new UserError('现在不是自由活动时间');
    if (!this.game.get(uid)) throw new UserError('你不是这局的玩家');
    let to = clampToMap(x, y);
    let notice = null;
    // 换个地方走 = 不在门口了，敲门作废
    let dropped = false;
    for (const st of r.state.values()) if (st.knocks.delete(uid)) dropped = true;
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
    const path = route(r.houses, from, to); // 绕开建筑的路线，客户端照着它画
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
      const p = positionAt(r.houses, m, m.start + t);
      const h = houseAt(r.houses, p.x, p.y)?.id ?? null;
      if (h !== zone) { marks.push(t + 40); zone = h; }
    }
    marks.push(dur + 30);
    r.arrive.set(uid, marks.map((t) => this.later(t, () => this.arrive(uid))));
    if (notice || dropped) this.changed();
    return notice ? { notice } : null;
  }

  /** 记一次敲门；45 秒没人理就作废。 */
  knock(st, uid) {
    st.knocks.add(uid);
    const at = Date.now();
    (st.knockAt ??= new Map()).set(uid, at);
    this.later(45_000, () => { if (st.knockAt?.get(uid) === at) { st.knocks.delete(uid); st.knockAt.delete(uid); } });
  }

  async arrive(uid) {
    const r = this.roam;
    if (!r) return;
    const at = this.posNow(uid);
    const now = houseAt(r.houses, at.x, at.y)?.id ?? null;
    const was = r.zone.get(uid) ?? null;
    if (now === was) return;
    if (was) await this.leaveHouse(uid, was);
    if (now) {
      // 锁着门：没被放进来的人（比如锁门前就在往里走的）被挡在门外，变成敲门
      const st = r.state.get(now);
      if (st.locked && st.ids.size && !st.allow.has(uid)) {
        const h = r.houses.find((x) => x.id === now);
        const out = doorPoint(h, 24);
        this.move(uid, out.x, out.y, { force: true });
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
    st.ids.add(uid);
    st.knocks.delete(uid);
    r.zone.set(uid, hid);
    r.invites?.delete(uid);
    this.changed();
    if (this.isFake(uid)) return;
    // 同一间房子的语音操作排队做，免得两个人同时进来建出两个频道
    st.queue = st.queue.then(async () => {
      if (!st.ids.has(uid)) return;
      if (!st.channelId) st.channelId = await this.safeVoice((v) => v.openRoom(h.name, [uid], null, this.square));
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
      const bots = this.game.players.filter((p) => this.isFake(p.id));
      if (!bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const pt = randomSpot(this.roam.houses);
      this.move(bot.id, pt.x, pt.y);
      this.wander();
    });
  }

  /** 集合：所有人回广场，房子的语音频道全部关掉。reason 为 null 时不发公告（入夜等场合）。 */
  async endRoam(reason = null) {
    const r = this.roam;
    if (!r) return;
    this.roam = null;
    this.cancel(this.roamTimer);
    for (const t of r.arrive.values()) this.cancel(t);
    for (const st of r.state.values()) {
      await st.queue.catch(() => {});
      if (st.channelId) await this.safeVoice((v) => v.closeRoom(st.channelId, this.square));
    }
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
    const channelId = await this.safeVoice((v) => v.openRoom(`${label}`, real, withSt, this.square));
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
    if (!channelId.startsWith('local-')) await this.safeVoice((v) => v.closeRoom(channelId, this.square));
    if (room.asleep && this.game?.phase === 'night') {
      await this.safeVoice((v) => v.setAsleep(room.members.filter((id) => !this.isFake(id)), true, this.square));
    }
    if (reason) this.announce(`私聊结束（${reason}）`, 'whisper');
  }

  async closeAllRooms() {
    for (const id of [...this.rooms.keys()]) await this.closeRoom(id);
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
      case 'revive': g.stRevive(p.id); break;
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
    if (g.winner && g.phase !== 'night') await this.endGame();
  }

  // ───────────── 结束 ─────────────
  async endGame() {
    if (this.ended) return;
    this.ended = true;
    this.vote = null;
    this.pendingNom = null;
    this.deadline = null;
    await this.endRoam();
    await this.closeAllRooms();
    if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square));
    const g = this.game;
    this.clearNoms();
    this.announce(`${g.winner === 'good' ? '善良阵营获胜！' : '邪恶阵营获胜！'} ${g.winReason}`, 'end');
    this.syncWatchMute();
    if (!this.tutorial) this.onEnded?.(this); // 永久存档这一局
    this.narrate('end', { team: g.winner, reason: g.winReason });
  }

  async teardown() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.watchMuted?.length) { const ids = this.watchMuted; this.watchMuted = []; await this.safeVoice((v) => v.setMuted?.(ids, false)); }
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
      key: this.key, guildId: this.guildId, hostId: this.hostId, settings: this.settings,
      users: [...this.users.values()], lobby: this.lobby,
      game: this.game?.toJSON() ?? null,
      ended: this.ended, square: this.square, log: this.log, logSeq: this.logSeq, stLog: this.stLog,
      inbox: entries(this.inbox), pendingInfo: entries(this.pendingInfo),
      resolving: this.resolving, rkPending: this.rkPending, deadline: this.deadline,
      roamedToday: !!this.roamedToday, duskDay: this.duskDay ?? null,
      pendingNom: this.pendingNom,
      noms: this.noms && { until: this.noms.until, paused: this.noms.paused, timeUp: this.noms.timeUp, skips: [...this.noms.skips] },
      vote: this.vote && { ...this.vote, yes: [...this.vote.yes], locked: [...this.vote.locked] },
      lastVote: this.lastVote ?? null,
      voteHistory: this.voteHistory ?? [],
      outfits: [...this.outfits],
      watchMuted: this.watchMuted ?? [],
      rooms: [...this.rooms.values()].map(({ timer, ...x }) => x),
      roam: r && {
        until: r.until, pos: entries(r.pos), zone: entries(r.zone), endVotes: [...(r.endVotes ?? [])],
        state: entries(r.state).map(([id, st]) => [id, { ids: [...st.ids], locked: st.locked, knocks: [...st.knocks], allow: [...st.allow], channelId: st.channelId }]),
      },
    };
  }

  restore(s) {
    this.hostId = s.hostId;
    this.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    for (const u of s.users ?? []) this.users.set(u.id, u);
    this.lobby = s.lobby ?? [];
    this.game = s.game ? Game.fromJSON(s.game) : null;
    Object.assign(this, {
      ended: s.ended, square: s.square, log: s.log ?? [], logSeq: s.logSeq ?? 0, stLog: s.stLog ?? [],
      inbox: new Map(s.inbox ?? []), pendingInfo: new Map(s.pendingInfo ?? []),
      resolving: s.resolving, rkPending: s.rkPending, deadline: s.deadline,
      roamedToday: s.roamedToday, duskDay: s.duskDay, pendingNom: s.pendingNom, lastVote: s.lastVote,
      voteHistory: s.voteHistory ?? [],
      outfits: new Map(s.outfits ?? []),
      watchMuted: s.watchMuted ?? [],
    });
    this.noms = s.noms && { ...s.noms, skips: new Set(s.noms.skips) };
    this.vote = s.vote && { ...s.vote, yes: new Set(s.vote.yes), locked: new Set(s.vote.locked) };
    this.rooms = new Map((s.rooms ?? []).map((x) => [x.channelId, x]));
    if (s.roam && this.game) {
      this.roam = {
        houses: housesFor(this.game.players.length),
        until: s.roam.until, pos: new Map(s.roam.pos), zone: new Map(s.roam.zone), arrive: new Map(), endVotes: new Set(s.roam.endVotes ?? []),
        state: new Map(s.roam.state.map(([id, st]) => [id, { ...st, ids: new Set(st.ids), knocks: new Set(st.knocks), allow: new Set(st.allow), queue: Promise.resolve() }])),
      };
    }
    return this;
  }

  /** 读档后把该有的计时器重新排上。 */
  resume() {
    const g = this.game;
    if (!g || this.ended) return;
    const left = (until, min = 5000) => Math.max(min, (until ?? 0) - Date.now());
    this.announce('服务器刚刚重启过，对局已经恢复，接着玩。', 'clock');
    for (const r of this.rooms.values()) if (r.until) r.timer = this.later(left(r.until), () => this.closeRoom(r.channelId, '时间到'));
    if (g.phase === 'night') {
      const night = g.night;
      // 机器人重启时会先把所有人解除闭耳，夜里要重新闭上
      if (this.settings.nightDeafen && this.square) this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square));
      if (!this.resolving) {
        if (this.deadline) this.nightTimer = this.later(left(this.deadline), () => this.finishNight(night));
        else this.later(3000, () => this.finishNight(night));
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
      for (const [id, m] of r.pos) if (m.start + m.dur > Date.now()) r.arrive.set(id, [this.later(m.start + m.dur - Date.now() + 30, () => this.arrive(id))]);
      this.wander();
      return;
    }
    if (this.stId) return;
    // 下面都是自动说书
    if (this.duskDay === g.day) { this.later(3000, () => this.beginNight()); return; }
    if (this.pendingNom?.stage) {
      const nom = this.pendingNom;
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
      isHost: this.isHost(uid),
      isST,
      settings: this.settings,
      lobby: this.lobby.map((p) => ({ ...p, outfit: this.outfits.get(p.id) ?? null })),
      myOutfit: this.outfits.get(uid) ?? null,
      log: this.log.slice(-40),
      now: Date.now(),
      deadline: this.deadline,
      voiceReady: !!this.square,
      tutorial: !!this.tutorial,
      // 观战席：在线但没坐下（大厅）/ 不在这局里（游戏中）的人
      watchers: [...this.online].filter((id) => (g ? !g.get(id) : !this.lobby.some((p) => p.id === id)) && id !== this.stId)
        .map((id) => { const u = this.users.get(id); return { id, name: u?.name ?? '?', avatar: u?.avatar ?? null }; }),
    };
    if (!g) return { ...view, phase: 'lobby' };

    const spectator = !isST && !g.get(uid);
    const showRoles = isST || this.ended || (spectator && this.settings.spectatorGrimoire);
    const vote = this.vote ?? null;
    Object.assign(view, {
      phase: this.ended ? 'ended' : g.phase,
      spectator,
      script: g.script,
      dayStage: g.phase !== 'day' ? null : this.roam ? 'roam' : this.roamedToday ? 'square' : 'morning',
      night: g.night,
      day: g.day,
      threshold: g.threshold(),
      aliveCount: g.aliveCount(),
      block: g.block,
      blockVotes: g.blockVotes,
      executedToday: g.executedToday,
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: g.visAlive(p), ghostVote: p.ghostVote,
        avatar: this.lobby.find((x) => x.id === p.id)?.avatar ?? null,
        char: this.lobby.find((x) => x.id === p.id)?.char ?? null,
        outfit: this.outfits.get(p.id) ?? null,
        fake: this.isFake(p.id),
        nominated: g.nominees.has(p.id), nominator: g.nominators.has(p.id), shot: (g.shooters ?? []).includes(p.id),
        online: this.online.has(p.id),
        ...(showRoles ? this.grimEntry(p) : {}),
      })),
      pendingNom: this.pendingNom,
      noms: this.noms && {
        until: this.noms.paused != null ? null : this.noms.until, timeUp: this.noms.timeUp, skipped: this.noms.skips.has(uid),
        done: g.alive().filter((p) => g.nominators.has(p.id) || this.noms.skips.has(p.id)).length,
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
      voiceChannel: this.square ?? null,
      lastVote: this.lastVote && {
        nominee: this.lastVote.nominee, yes: this.lastVote.result.voters, outcome: this.lastVote.result.outcome,
        count: this.lastVote.result.count, threshold: this.lastVote.result.threshold, endedAt: this.lastVote.endedAt ?? 0,
      },
      rooms: [...this.rooms.values()].map((r) => ({ id: r.channelId, members: r.members, until: r.until, mine: r.members.includes(uid) })),
      roam: this.roam && {
        until: this.roam.until,
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
      const prompt = g.phase === 'night' && !this.resolving && p.alive ? g.nightPrompts().find((x) => x.playerId === uid) : null;
      view.self = {
        seat: p.seat, alive: g.visAlive(p), ghostVote: p.ghostVote,
        role: { id: p.shownRole, name: r.name, team: r.team, teamName: TEAM_NAME[r.team], evil: isEvilRole(p.shownRole), ability: r.ability },
        inbox: this.inbox.get(uid) ?? [],
        prompt: prompt && {
          night: g.night, count: prompt.count, options: prompt.options, role: ROLES[prompt.role].name, roleId: prompt.role,
          chosen: g.choices[uid] ? (Array.isArray(g.choices[uid]) ? g.choices[uid] : g.choices[uid].targets) : null,
          chosenRole: g.choices[uid]?.role ?? null,
          optional: !!prompt.optional, pickRole: !!prompt.pickRole, roleOptions: prompt.roleOptions ?? null, waiting: !!prompt.waiting,
        },
        moonchild: g.pendingMoonchild === uid,
        gossipDone: !!g.gossipSaid?.[uid],
        ravenkeeper: this.rkPending === uid,
        // 官方规则（7 人及以上）：第一夜恶魔和爪牙互认，恶魔拿 3 个伪装；之后传位/红唇接任不再通知爪牙
        allies: g.evilKnown?.[uid] ?? null,
        evilInfo: g.evilInfo,
        bluffs: g.evilKnown && (uid === g.firstDemon || ((g.bluffsShared || this.settings.minionBluffs) && g.evilKnown[g.firstDemon]?.some((a) => a.id === uid))) ? [...g.bluffs] : null,
        bluffsMine: uid === g.firstDemon,
        bluffsShared: !!g.bluffsShared || !!this.settings.minionBluffs,
      };
    }
    if (isST) {
      view.st = {
        log: this.stLog.slice(-30),
        pendingInfo: [...this.pendingInfo.entries()].map(([id, m]) => ({ id, playerId: m.playerId, text: m.text, voice: m.voice })),
        waiting: g.phase === 'night' && !this.resolving ? g.missingChoices() : [],
        rkPending: this.rkPending,
        resolved: g.phase === 'night' && this.resolving && !this.rkPending,
        roles: Object.entries(ROLES).map(([id, x]) => ({ id, name: x.name, team: x.team })),
      };
    }
    return view;
  }

  grimEntry(p) {
    const g = this.game;
    return {
      role: p.role, roleName: ROLES[p.role].name, team: ROLES[p.role].team, evil: g.evilOf(p),
      shownRoleName: p.role !== p.shownRole ? ROLES[p.shownRole].name : null,
      poisoned: !!g.isPoisoned(p), redHerring: p.id === g.redHerring,
      protected: p.id === g.monkTarget, master: p.id === g.butlerMaster,
      drunk: g.script === 'bmr' && g.broken(p) && !g.isPoisoned(p), fakeDead: !!p.apparentDead,
    };
  }
}
