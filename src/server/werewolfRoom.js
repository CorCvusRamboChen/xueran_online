// 狼人杀（娱乐模式）的房间流程：开局、给每个阶段计时、叫机器人、语音（发言闭麦、死人闭麦）、每个人的视图。
// 规则全在 engine/werewolf.js；这里的方法挂到 Room 上（room.js 末尾 Object.assign），Room 里只在几个入口转过来：
// start / act / viewFor / resume / restore / teardown / pause。
import { Werewolf, rollWerewolf, wwSetup, STAGE_NAME, WW_ROLES } from '../engine/werewolf.js';
import { ttsUrl } from './tts.js';

// 狼人杀专用的操作（act 的 type）
export const WW_ACTIONS = new Set(['wwGuard', 'wwWolf', 'wwWitch', 'wwSeer', 'wwShoot', 'wwDone', 'wwVote', 'wwSkip']);
// 狼人杀里照样能用的通用操作；血染的提名、自由活动这些不能用
const WW_GENERIC = new Set(['join', 'leave', 'claimHost', 'releaseHost', 'settings', 'character', 'outfit', 'addBots', 'assignRole', 'kick', 'markNewbie',
  'start', 'history', 'stats', 'pastGame', 'fixVoice', 'end', 'fullLog', 'marks']);

const SIDE_NAME = { wolf: '狼人', god: '神职', villager: '平民' };
// 法官叫人的台词（固定的几句，配音只合成一次）
const CALL = {
  guard: '守卫请睁眼。你要守护谁？',
  wolf: '狼人请睁眼。狼人请商量今晚要刀的人。',
  witch: '女巫请睁眼。今晚的刀口是……你要用药吗？',
  seer: '预言家请睁眼。你要查验谁？',
};

export const WW_ROOM = {
  /** 这个操作狼人杀里能不能用（不能用的直接报错，免得血染的流程跑起来）。 */
  wwAllowed(type) { return WW_ACTIONS.has(type) || WW_GENERIC.has(type); },

  /** 法官的一句台词：进公告（客户端读出来），title 有值的弹标题卡。 */
  wwSay(text, title = null) {
    this.log.push({ id: ++this.logSeq, kind: 'story', text, title, audio: ttsUrl(text), at: Date.now() });
  },

  /** 开局：按人数表发身份，找语音频道，入夜。 */
  async wwStart(seats) {
    const roles = rollWerewolf(seats.length, Math.random);
    this.game = new Werewolf(seats.map(({ id, name }) => ({ id, name })), { roles });
    this.wwDevRoles();
    this.homes = null;
    this.duskDay = null;
    this.game.records = this.readRecords(seats);
    const square = await this.safeVoice((v) => v.findSquare(this.hostId, seats.map((p) => p.id)));
    try { await this.claimSquare(square); } catch (e) { this.game = null; this.stLog = []; throw e; }
    this.square = square;
    const setup = wwSetup(seats.length).map(({ role, count }) => `${WW_ROLES[role].name}${count > 1 ? ` ${count}` : ''}`).join(' · ');
    this.announce(`游戏开始！《狼人杀》${seats.length} 人：${setup}。屠边：狼人全部出局好人胜，神职或平民全部出局狼人胜。`, 'start');
    this.wwSay(`${seats.length} 人狼人杀，现在开始。请确认自己的身份。`, '狼人杀');
    if (!this.square) this.announce('没检测到大家所在的语音频道，发言闭麦和死人闭麦不会生效（房主先进语音再开局即可）。');
    this.syncWatchMute();
    this.watchVoice();
    this.stNote(`狼人杀：${setup}`);
    await this.wwNight();
  },

  /** 本地测试（DEV_LOGIN 的 ?devRole=ww_witch 这样）：开局把指定的角色换到他身上。 */
  wwDevRoles() {
    const g = this.game;
    for (const p of g.players) {
      const want = this.users.get(p.id)?.devRole;
      const holder = want && WW_ROLES[want] && p.role !== want && g.players.find((q) => q.role === want);
      if (holder) [p.role, p.shownRole, holder.role, holder.shownRole] = [holder.role, holder.shownRole, p.role, p.shownRole];
    }
    // 复盘第一条（开局身份）是按换之前记的：重写
    const first = g.timeline.find((e) => e.kind === 'setup');
    if (first) first.text = g.players.map((p) => `${p.seat}号 ${p.name}：${WW_ROLES[p.role].name}`).join('；');
    g.evilKnown = Object.fromEntries(g.wolves().map((w) => [w.id, g.wolves().filter((x) => x.id !== w.id).map((x) => ({ id: x.id, team: '狼人' }))]));
  },

  async wwNight() {
    const g = this.game;
    if (!g || this.ended) return;
    g.startNight();
    this.announce(`第 ${g.night} 夜，天黑请闭眼……`, 'night');
    this.wwSay('天黑请闭眼。', g.night === 1 ? '第一夜' : null);
    this.nightVoice = this.settings.nightDeafen && this.square ? Promise.resolve(this.dayVoice).then(() => this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square))) : null;
    this.wwStep();
    this.changed();
  },

  /** 把引擎攒的消息发出去：公告进记录，私密的进本人的收件箱。 */
  wwFlush() {
    const g = this.game;
    for (const m of g.drain()) {
      if (m.to) this.tell(m.to, m.text);
      else this.announce(m.text, /出局了|被放逐|带走/.test(m.text) ? 'death' : /投票/.test(m.text) ? 'vote' : g.phase === 'day' ? 'day' : 'info', true);
    }
  },

  /** 毫秒：机器人想一想（测试里时间很短就按比例缩）。 */
  wwBotMs(lo = 1200, hi = 3500) {
    const cap = Math.max(5, (this.settings.chooseSeconds * 1000) / 4);
    return Math.min(cap, lo + Math.random() * (hi - lo));
  },

  /** 每个阶段该等多久（秒）。 */
  wwSeconds(stage) {
    const s = this.settings;
    if (stage === 'hunter') return Math.min(s.chooseSeconds, 15);
    if (stage === 'words') return Math.min(s.speechSeconds ?? 90, 60);
    if (stage === 'speech' || stage === 'pk') return s.speechSeconds ?? 90;
    return s.chooseSeconds;
  },

  /**
   * 引擎每变一次就调一次：发消息；进了新阶段就重新计时、叫机器人、调语音。同一个阶段重复调没关系。
   * resumed：读档 / 暂停后回来，不再念一遍台词。
   */
  wwStep({ resumed = false } = {}) {
    const g = this.game;
    if (!g?.werewolf) return;
    this.wwFlush();
    if (this.ended) return;
    if (g.winner) {
      if (!this.wwEnding) { this.wwEnding = true; this.later(0, async () => { await this.endGame(); this.wwDeadMute(); }); }
      return;
    }
    if (this.wwKey === g.seq) return;
    this.wwKey = g.seq;
    this.cancel(this.wwTimer);
    this.deadline = null;
    const seq = g.seq;
    const stage = g.stage;
    const live = () => this.game === g && g.seq === seq && !this.ended;
    const after = (ms, fn) => { this.wwTimer = this.later(ms, () => { if (live()) { fn(); this.wwStep(); } }); };
    const timed = (secs) => { this.deadline = Date.now() + secs * 1000; after(secs * 1000, () => g.timeout()); };
    this.wwDeadMute();

    if (g.phase === 'night' && CALL[stage]) {
      if (!resumed) this.wwSay(CALL[stage]);
      const actors = g.actors();
      if (!actors.length) {
        // 这个角色在场但已经出局：照样「叫」他一会儿，免得从夜晚长短看出谁死了
        after(Math.min(this.settings.chooseSeconds * 1000, 4000 + Math.random() * 5000), () => g.timeout());
        return;
      }
      timed(this.settings.chooseSeconds);
      this.stNote(`第 ${g.night} 夜 ${STAGE_NAME[stage]}：等待 ${actors.map((id) => g.name(id)).join('、')}`);
      this.wwBots();
      return;
    }
    switch (stage) {
      case 'dawn':
        after(this.settings.pauseMs, () => {
          g.resolveNight();
          g.dawn();
          this.wwSay('天亮了。', `第${g.day}天`);
          const wake = async () => { await this.nightVoice; if (this.square) await this.safeVoice((v) => v.setAsleep(this.realIds(), false, this.square)); };
          this.dayVoice = wake();
        });
        return;
      case 'hunter':
        if (!resumed) this.announce(`${g.dying.map((id) => `**${g.name(id)}**`).join('、')} 出局：给出局的人留一点时间发动技能。`, 'info', false);
        timed(this.wwSeconds('hunter'));
        this.wwBots();
        return;
      case 'words': case 'speech': case 'pk':
        if (!resumed) this.announce(`${stage === 'words' ? '遗言' : stage === 'pk' ? 'PK 发言' : '发言'}：**${g.name(g.speaker)}**`, 'info', false);
        this.speakOnly(g.speaker);
        timed(this.isFake(g.speaker) ? Math.min(3, this.wwSeconds(stage)) : this.wwSeconds(stage));
        return;
      case 'vote': case 'pkvote':
        this.speakOnly(null);
        if (!resumed) this.wwSay(stage === 'pkvote' ? 'PK 发言结束，请投票。' : '发言结束，请投票。');
        timed(this.settings.chooseSeconds);
        this.wwBots();
        return;
      case 'dusk':
        this.speakOnly(null);
        after(this.settings.pauseMs, () => this.wwNight());
        return;
      default:
    }
  },

  /** 死人在语音里闭麦（说遗言的时候除外）；终局 / 回大厅全部解开。 */
  async wwDeadMute() {
    const g = this.game;
    const want = new Set(g?.werewolf && !this.ended && !this.paused && this.square
      ? this.realIds().filter((id) => !g.get(id).alive && !(g.stage === 'words' && g.speaker === id)) : []);
    const prev = new Set(this.wwMuted ?? []);
    const unmute = [...prev].filter((id) => !want.has(id));
    const mute = [...want].filter((id) => !prev.has(id));
    this.wwMuted = [...want];
    if (unmute.length) await this.safeVoice((v) => v.setMuted?.(unmute, false, 'dead'));
    if (mute.length) await this.safeVoice((v) => v.setMuted?.(mute, true, 'dead'));
  },

  // ───────────── 操作 ─────────────
  wwAct(uid, type, p) {
    const g = this.requireGame();
    const t = p.target ?? null;
    switch (type) {
      case 'wwGuard': g.guard(uid, t); break;
      case 'wwWolf': {
        const agree = g.wolfVote(uid, t);
        this.stNote(`狼人 ${g.name(uid)} 投 ${t ? g.name(t) : '空刀'}`);
        if (agree) this.wwAgree(); else this.wwBots();
        break;
      }
      case 'wwWitch': g.witch(uid, { save: !!p.save, poison: p.poison ?? null }); break;
      case 'wwSeer': g.seer(uid, t); break;
      case 'wwShoot': g.hunterShoot(uid, t); break;
      case 'wwDone': g.doneSpeaking(uid); break;
      case 'wwSkip': // 房主跳过正在发言的人（掉线、挂机）
        this.requireHost(uid);
        if (!['words', 'speech', 'pk'].includes(g.stage)) throw new Error('现在没有人在发言');
        g.advanceSpeech();
        break;
      case 'wwVote': if (g.castVote(uid, t)) this.wwVoted(); break;
      default: throw new Error('未知操作');
    }
    this.wwStep();
  },

  /** 狼人意见一致：留一秒给人看清，再定刀口。 */
  wwAgree() {
    const g = this.game; const seq = g.seq;
    this.cancel(this.wwAgreeTimer);
    this.wwAgreeTimer = this.later(Math.min(1000, this.wwBotMs()), () => {
      if (this.game !== g || g.seq !== seq || g.stage !== 'wolf' || !g.wolvesAgree()) return;
      g.settleKnife();
      this.wwStep();
    });
  },

  /** 所有人都投完了：稍等一下再唱票（最后一个人刚点完，界面先显示「已投」）。 */
  wwVoted() {
    const g = this.game; const seq = g.seq;
    this.later(Math.min(800, this.settings.pauseMs), () => {
      if (this.game !== g || g.seq !== seq || !['vote', 'pkvote'].includes(g.stage)) return;
      g.settleVote();
      this.wwStep();
    });
  },

  // ───────────── 机器人 ─────────────
  /** 叫这个阶段里该行动的机器人。随机为主，只用自己知道的信息（预言家机器人会投它查到的狼）。 */
  wwBots() {
    const g = this.game; const seq = g.seq; const stage = g.stage;
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const bots = g.actors().filter((id) => this.isFake(id));
    const go = (fn) => this.later(this.wwBotMs(), () => {
      if (this.game !== g || g.seq !== seq || this.ended) return;
      try { fn(); } catch (e) { console.warn('[ww] 机器人操作失败：', e.message); }
      this.wwStep();
    });
    const others = (id) => g.alive().map((p) => p.id).filter((x) => x !== id);
    const goodOthers = (id) => others(id).filter((x) => g.get(x).role !== 'ww_wolf');
    if (stage === 'guard') for (const id of bots) go(() => g.guard(id, rand(g.guardOptions())));
    if (stage === 'wolf') {
      // 跟着真人狼人的票走；没有真人就第一个机器人随便挑一个好人，其他机器人跟它
      // 目标在动手那一刻再算：真人狼人中途改票，晚到的机器人也跟着新的走
      const target = () => {
        const human = g.actors().find((id) => !this.isFake(id) && id in g.wolfPicks);
        if (human) return g.wolfPicks[human];
        if (this.wwBotKnife?.night !== g.night) this.wwBotKnife = { night: g.night, id: rand(goodOthers(bots[0])) ?? null };
        return this.wwBotKnife.id;
      };
      for (const id of bots) {
        if (id in g.wolfPicks && g.wolfPicks[id] === target()) continue;
        go(() => { if (g.wolfVote(id, target())) this.wwAgree(); });
      }
    }
    if (stage === 'witch') for (const id of bots) {
      const info = g.witchInfo(id);
      go(() => {
        if (info.canSave && (g.night === 1 || Math.random() < 0.5)) g.witch(id, { save: true });
        else if (info.canPoison && g.night > 1 && Math.random() < 0.3) g.witch(id, { poison: rand(info.poisonOptions) });
        else g.witch(id, {});
      });
    }
    if (stage === 'seer') for (const id of bots) {
      const fresh = others(id).filter((x) => !g.checks.some((c) => c.target === x));
      go(() => g.seer(id, rand(fresh.length ? fresh : others(id)) ?? null));
    }
    if (stage === 'hunter' && g.hunterId && this.isFake(g.hunterId) && !g.hunterDone) {
      const id = g.hunterId;
      go(() => g.hunterShoot(id, Math.random() < 0.75 ? rand(others(id)) : null));
    }
    if (stage === 'vote' || stage === 'pkvote') for (const id of bots) {
      go(() => {
        const me = g.get(id);
        const can = g.candidates.filter((x) => x !== id && g.get(x).alive);
        const known = me.role === 'ww_seer' ? g.checks.filter((c) => c.wolf && can.includes(c.target)).map((c) => c.target) : [];
        const pool = known.length ? known : me.role === 'ww_wolf' ? can.filter((x) => g.get(x).role !== 'ww_wolf') : can;
        const pick = Math.random() < 0.1 ? null : rand(pool.length ? pool : can) ?? null;
        if (g.castVote(id, pick)) this.wwVoted();
      });
    }
  },

  // ───────────── 读档 / 暂停 ─────────────
  wwResume(why) {
    this.announce(why, 'clock');
    this.watchVoice();
    this.syncWatchMute();
    const g = this.game;
    if (g.phase === 'night' && this.settings.nightDeafen && this.square) this.safeVoice((v) => v.setAsleep(this.realIds(), true, this.square));
    this.wwMuted = []; // 重启时账上的闭麦都解开了：重新闭
    this.speechMuted = null;
    this.wwKey = null;
    this.wwStep({ resumed: true });
  },

  /** 暂停、回大厅时：解开死人闭麦。 */
  async wwReleaseMute() {
    if (!this.wwMuted?.length) return;
    const ids = this.wwMuted; this.wwMuted = [];
    await this.safeVoice((v) => v.setMuted?.(ids, false, 'dead'));
  },

  // ───────────── 视图 ─────────────
  /** 现在要给这个人看的倒计时：夜里只给正在行动的人；白天大家都看得到。 */
  wwDeadlineFor(uid) {
    const g = this.game;
    if (!g || this.ended) return null;
    if (g.phase === 'night' && uid !== this.stId && !g.actors().includes(uid)) return null;
    return this.deadline;
  },

  /** 这个人现在能做的事。 */
  wwPrompt(uid) {
    const g = this.game;
    const p = g.get(uid);
    if (!p || this.ended) return null;
    const stage = g.stage;
    const acting = g.actors().includes(uid);
    const others = g.alive().map((q) => q.id).filter((id) => id !== uid);
    if (g.phase === 'night') {
      if (!acting) return null;
      if (stage === 'guard') return { kind: 'guard', options: g.guardOptions(), last: g.lastGuard };
      if (stage === 'wolf') return { kind: 'wolf', options: g.alive().map((q) => q.id), picks: { ...g.wolfPicks }, mine: uid in g.wolfPicks ? g.wolfPicks[uid] : undefined };
      if (stage === 'witch') return { kind: 'witch', ...g.witchInfo(uid) };
      if (stage === 'seer') return { kind: 'seer', options: others };
      return null;
    }
    if (stage === 'hunter') {
      if (g.hunterId === uid && !g.hunterDone) return { kind: 'hunter', options: others };
      if (g.dying?.includes(uid)) return { kind: 'dying', hunter: g.hunterId === uid, poisoned: p.role === 'ww_hunter' && p.cause === 'poison' };
      return null;
    }
    if (['words', 'speech', 'pk'].includes(stage) && g.speaker === uid) return { kind: 'speak', stage };
    if (['vote', 'pkvote'].includes(stage) && g.voters.includes(uid)) {
      return { kind: 'vote', pk: stage === 'pkvote', options: g.candidates.filter((id) => id !== uid), mine: uid in g.ballots ? g.ballots[uid] : undefined };
    }
    return null;
  },

  wwView(uid, view) {
    const g = this.game;
    const isST = uid === this.stId;
    const me = g.get(uid);
    const spectator = !isST && !me;
    const showAll = isST || this.ended || (spectator && this.settings.spectatorGrimoire);
    const wolf = me?.role === 'ww_wolf';
    const lobby = (id) => this.lobby.find((x) => x.id === id);
    const stage = g.stage;
    const roleOf = (p) => ({ role: p.role, roleName: WW_ROLES[p.role].name, evil: p.role === 'ww_wolf', cause: p.cause });
    Object.assign(view, {
      phase: this.ended ? 'ended' : g.phase === 'setup' ? 'night' : g.phase,
      spectator,
      script: 'ww',
      night: Math.max(1, g.night),
      day: g.day,
      deadline: this.wwDeadlineFor(uid),
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: p.alive, ghostVote: false,
        avatar: lobby(p.id)?.avatar ?? null, char: lobby(p.id)?.char ?? null, outfit: this.outfits.get(p.id) ?? null,
        fake: this.isFake(p.id), online: this.online.has(p.id),
        // 死在哪一夜 / 哪一天是公开的（天亮公布、放逐当众）；死因只有白天的才公开（放逐、被猎人带走）
        diedAt: p.alive ? null : p.diedAt, dayCause: !p.alive && p.diedAt?.startsWith('d') ? p.cause : null,
        ...(showAll || p.id === uid || (wolf && p.role === 'ww_wolf') ? roleOf(p) : {}),
      })),
      rooms: [], vote: null, roam: null, noms: null, pendingNom: null, votes: [], knives: [], execs: [],
      journal: isST || this.ended ? g.journal : null,
      timeline: this.ended ? g.timeline : null,
      winner: this.ended ? { team: g.winner, reason: g.winReason } : null,
      ww: {
        stage, stageName: STAGE_NAME[stage] ?? '', seq: g.seq,
        setup: wwSetup(g.players.length),
        speaker: ['words', 'speech', 'pk'].includes(stage) ? g.speaker : null,
        speakers: ['speech', 'pk'].includes(stage) ? g.speakers : null,
        spoke: ['speech', 'pk'].includes(stage) ? g.spoke : null,
        pk: ['pk', 'pkvote'].includes(stage) ? g.pk : null,
        dying: stage === 'hunter' ? g.dying : null,
        // 投票中只公开谁投了，投给谁唱票时才公开
        voting: ['vote', 'pkvote'].includes(stage) ? { voters: g.voters, candidates: g.candidates, done: Object.keys(g.ballots), pk: stage === 'pkvote' } : null,
        votes: g.voteHistory,
      },
    });
    if (me) {
      const r = WW_ROLES[me.role];
      view.self = {
        seat: me.seat, alive: me.alive, ghostVote: false,
        role: { id: me.role, name: r.name, team: r.team, teamName: SIDE_NAME[r.side], side: r.side, evil: wolf, ability: r.ability },
        inbox: this.inbox.get(uid) ?? [],
        allies: wolf ? g.evilKnown[uid] ?? [] : null,
        prompt: this.wwPrompt(uid),
        checks: me.role === 'ww_seer' ? g.checks : null,
        potions: me.role === 'ww_witch' ? { ...g.potions } : null,
        lastGuard: me.role === 'ww_guard' ? g.lastGuard : null,
      };
    }
    if (isST) view.st = { log: this.stLog.slice(-30), pendingInfo: [], waiting: g.actors(), roles: [] };
    return view;
  },
};
