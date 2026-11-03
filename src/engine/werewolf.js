// 狼人杀（娱乐模式）的规则引擎：经典网杀「预女猎守 + 平民」，屠边。纯逻辑，不碰 Discord，计时和机器人在 server/werewolfRoom.js。
// 和血染的 Game 是两套：这里只实现房间用得到的那几个通用方法（get / name / alive / toJSON……），别的都是狼人杀自己的。
//
// 一局是一串「阶段」（stage），房间只管给每个阶段计时、叫机器人、到点调 timeout()：
//   夜晚：guard 守卫 → wolf 狼人 → witch 女巫 → seer 预言家 → dawn（等房间调 resolveNight + dawn）
//   白天：hunter 死者发动技能 → words 遗言 → speech 发言 → vote 放逐投票 →（平票）pk 发言 → pkvote →（有人出局）hunter → words → dusk（等房间入夜）
// 结束：stage = 'ended'，winner = 'good'（好人）| 'evil'（狼人）。
//
// 口径（各家规则不完全一样，这里定死，大厅里也写了）：
// · 守卫可以守自己、可以空守，不能连续两晚守同一人（空守之后哪个都能守）。守卫挡不住毒药。
// · 狼人每人投一票（可以空刀、可以刀自己人）。所有存活狼人选同一个人就立刻定下；时间到时按票数最多的定，
//   并列最多时法官在并列的几个里随机挑一个（「空刀」也算一个选项）。谁都没投 = 空刀。
// · 女巫解药、毒药整局各一瓶，同一晚只能用一瓶；只有首夜可以自救；不能毒自己；解药用掉以后不再得知刀口。
// · 同守同救 = 死亡（奶穿）。守卫、女巫、预言家当晚被刀照样行动（夜里的死亡天亮才结算）。
// · 天亮只公布死了谁，不公布死因；多人死亡按座位号报。
// · 每次有人出局，都给所有刚出局的人同样长的「发动技能」时间（不管是不是猎人），免得从等多久看出谁是猎人。
//   猎人开枪就当场结算；不开或被毒死就等时间到。被猎人带走的人有遗言（他死在白天）。
// · 遗言：首夜死者、被放逐的人、被猎人带走的人有；第二夜起夜里死的人没有。
// · 发言：从昨晚死者（座位号最小的那个）的下一位开始顺时针；平安夜由法官随机挑一个人开始。
// · 放逐投票：所有存活玩家同时投票（不能投自己，可以弃票），票数最多的出局；并列的人 PK 发言，
//   其余存活玩家在 PK 的人里再投一次，再并列就无人出局；所有人都弃票也无人出局。
// · 屠边：狼人全部出局好人胜；所有神职或所有平民出局狼人胜。同时发生（比如女巫毒死最后一只狼、狼刀死最后一个神）算好人胜。
import { WW_ROLES, WW_SETUPS, WW_PLAYERS } from './werewolf-roles.js';

export { WW_ROLES, WW_SETUPS, WW_PLAYERS };

const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 某个人数的配置：[{role, count}]。 */
export function wwSetup(n) {
  const s = WW_SETUPS[n];
  if (!s) return null;
  return [{ role: 'ww_wolf', count: s.wolves }, ...s.gods.map((role) => ({ role, count: 1 })), { role: 'ww_villager', count: s.villagers }];
}

/** 按人数发一套角色（打乱顺序，对应座位）。 */
export function rollWerewolf(n, rng = Math.random) {
  const s = wwSetup(n);
  if (!s) throw new Error(`狼人杀要 ${WW_PLAYERS[0]}–${WW_PLAYERS[1]} 名玩家`);
  return shuffle(s.flatMap(({ role, count }) => Array(count).fill(role)), rng);
}

export const NIGHT_STEPS = [['guard', 'ww_guard'], ['wolf', 'ww_wolf'], ['witch', 'ww_witch'], ['seer', 'ww_seer']];
export const STAGE_NAME = {
  guard: '守卫行动', wolf: '狼人行动', witch: '女巫行动', seer: '预言家行动', dawn: '天亮了',
  hunter: '发动技能', words: '遗言', speech: '发言', vote: '放逐投票', pk: 'PK 发言', pkvote: 'PK 投票', dusk: '天黑了', ended: '结束',
};
const SKIP = '空刀'; // 狼人投票里「空刀」的键

export class Werewolf {
  constructor(players, { rng = Math.random, roles } = {}) {
    this.rng = rng;
    this.werewolf = true;
    this.script = 'ww';
    const assigned = roles ?? rollWerewolf(players.length, rng);
    if (assigned.length !== players.length) throw new Error('角色数量与玩家数量不符');
    this.id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, seat: i + 1, role: assigned[i], shownRole: assigned[i], alive: true, ghostVote: false, cause: null,
    }));
    this.phase = 'setup';
    this.stage = null;
    this.night = 0;
    this.day = 0;
    this.winner = null;
    this.winReason = '';
    this.seq = 0;          // 阶段编号：每进一个阶段 +1，房间靠它知道计时器有没有过期
    this.potions = { save: true, poison: true };
    this.lastGuard = null; // 上一晚守的人（空守记 null）
    this.checks = [];      // 预言家的查验：[{night, target, wolf}]
    this.queue = [];       // 白天接下来要走的阶段
    this.out = [];         // 待发的消息：{to: id | null, text}；to 为 null = 公告
    this.timeline = [];
    this.st = { decisions: [] }; // 法官的随机判定（和血染的说书人手记同一个位置，存档用）
    this.voteHistory = [];
    this.resetNight();
    this.evilKnown = Object.fromEntries(this.wolves().map((w) => [w.id, this.wolves().filter((x) => x.id !== w.id).map((x) => ({ id: x.id, team: '狼人' }))]));
    this.record('setup', this.players.map((p) => `${p.seat}号 ${p.name}：${WW_ROLES[p.role].name}`).join('；'));
  }

  resetNight() {
    this.guardPick = undefined; // undefined 还没守，null 空守
    this.wolfPicks = {};
    this.knife = undefined;
    this.witchAct = undefined;
    this.seerPick = undefined;
    this.nightDeaths = [];
  }

  // ───────────────────────── 查询 ─────────────────────────
  get(id) { return this.players.find((p) => p.id === id); }
  alive() { return this.players.filter((p) => p.alive); }
  aliveCount() { return this.alive().length; }
  name(id) { const p = this.get(id); return p ? `${p.seat}号 ${p.name}` : '?'; }
  tag(id) { const p = this.get(id); return p ? `${this.name(id)}（${WW_ROLES[p.role].name}）` : '?'; }
  side(p) { return WW_ROLES[p.role].side; }
  evilOf(p) { return p.role === 'ww_wolf'; }
  visAlive(p) { return p.alive; }
  wolves() { return this.players.filter((p) => p.role === 'ww_wolf'); }
  has(role) { return this.players.some((p) => p.role === role); }
  holder(role) { return this.players.find((p) => p.role === role); }
  isAliveId(id) { return !!this.get(id)?.alive; }
  get journal() { return this.st.decisions; }

  record(kind, text) { this.timeline.push({ when: this.phase === 'night' ? `第${this.night}夜` : this.day ? `第${this.day}天` : '开局', kind, text }); }
  say(text, to = null) { this.out.push({ to, text }); }
  /** 取走待发的消息（房间发出去）。 */
  drain() { const o = this.out; this.out = []; return o; }
  decide(what, options, pick) { this.st.decisions.push({ when: `第${this.night}夜`, what, options, pick }); }

  /** 这个阶段谁要行动（只算活人）。 */
  actors() {
    const role = Object.fromEntries(NIGHT_STEPS)[this.stage];
    if (role) return this.alive().filter((p) => p.role === role).map((p) => p.id);
    if (this.stage === 'hunter') return this.hunterId && !this.hunterDone ? [this.hunterId] : [];
    if (this.stage === 'words' || this.stage === 'speech' || this.stage === 'pk') return this.speaker ? [this.speaker] : [];
    if (this.stage === 'vote' || this.stage === 'pkvote') return this.voters.filter((id) => !(id in this.ballots));
    return [];
  }

  setStage(stage) { this.stage = stage; this.seq += 1; }

  // ───────────────────────── 夜晚 ─────────────────────────
  startNight() {
    if (this.winner) return;
    this.phase = 'night';
    this.night += 1;
    this.resetNight();
    this.queue = [];
    this.speaker = null;
    if (this.night === 1) {
      for (const w of this.wolves()) {
        const mates = this.wolves().filter((x) => x.id !== w.id).map((x) => `**${this.name(x.id)}**`);
        this.say(mates.length ? `你的狼人同伴：${mates.join('、')}。每晚一起商量刀谁。` : '你是唯一的狼人。', w.id);
      }
    }
    this.nextNightStep(null);
  }

  /** 进入 after 之后的下一个夜晚阶段（这局没有的角色直接跳过；有但死了的照样进，房间假装等一会儿）。 */
  nextNightStep(after) {
    const steps = NIGHT_STEPS.filter(([, role]) => this.has(role)).map(([s]) => s);
    const i = after ? steps.indexOf(after) + 1 : 0;
    this.setStage(steps[i] ?? 'dawn');
  }

  need(stage, uid, role) {
    if (this.phase !== 'night' || this.stage !== stage) throw new Error('现在不是这个阶段');
    const p = this.get(uid);
    if (!p || p.role !== role || !p.alive) throw new Error('你现在不能行动');
    return p;
  }
  targetOk(id, msg = '只能选存活的玩家') { if (!this.isAliveId(id)) throw new Error(msg); }

  /** 守卫可以守哪些人。 */
  guardOptions() { return this.alive().map((p) => p.id).filter((id) => id !== this.lastGuard); }
  guard(uid, target) {
    this.need('guard', uid, 'ww_guard');
    if (target != null) {
      this.targetOk(target);
      if (target === this.lastGuard) throw new Error('不能连续两晚守同一个人');
    }
    this.guardPick = target ?? null;
    this.record('choice', `守卫 ${this.tag(uid)} ${target ? `守护 ${this.tag(target)}` : '空守'}`);
    this.nextNightStep('guard');
  }

  /** 狼人投一票（null = 空刀）。返回 true 表示所有存活狼人意见一致，可以马上定下。 */
  wolfVote(uid, target) {
    this.need('wolf', uid, 'ww_wolf');
    if (target != null) this.targetOk(target);
    this.wolfPicks[uid] = target ?? null;
    return this.wolvesAgree();
  }
  wolvesAgree() {
    const ids = this.actors();
    if (!ids.length || !ids.every((id) => id in this.wolfPicks)) return false;
    return new Set(ids.map((id) => this.wolfPicks[id])).size === 1;
  }
  /** 狼人阶段结束：按票数定刀口。 */
  settleKnife() {
    const tally = {};
    for (const id of this.actors()) if (id in this.wolfPicks) { const k = this.wolfPicks[id] ?? SKIP; tally[k] = (tally[k] ?? 0) + 1; }
    const keys = Object.keys(tally);
    let pick = SKIP;
    if (keys.length) {
      const top = Math.max(...Object.values(tally));
      const tied = keys.filter((k) => tally[k] === top);
      pick = tied[Math.floor(this.rng() * tied.length)];
      if (tied.length > 1) this.decide('狼人平票', tied.map((k) => (k === SKIP ? SKIP : this.name(k))), pick === SKIP ? SKIP : this.name(pick));
    }
    this.knife = pick === SKIP ? null : pick;
    this.record('choice', `狼人${keys.length ? `（${Object.entries(this.wolfPicks).map(([w, t]) => `${this.name(w)}→${t ? this.name(t) : SKIP}`).join('，')}）` : '没有人投票'}：${this.knife ? `刀 ${this.tag(this.knife)}` : SKIP}`);
    this.nextNightStep('wolf');
  }

  /** 女巫这一晚能看到什么、能做什么。 */
  witchInfo(uid) {
    const p = this.get(uid);
    const knows = this.potions.save; // 解药用掉以后不再得知刀口
    const knife = knows ? this.knife ?? null : undefined;
    return {
      knife, knows,
      canSave: this.potions.save && !!knife && (knife !== uid || this.night === 1),
      selfBlocked: this.potions.save && knife === uid && this.night > 1,
      canPoison: this.potions.poison,
      poisonOptions: this.potions.poison ? this.alive().map((q) => q.id).filter((id) => id !== p?.id) : [],
    };
  }
  /** 女巫行动：save 用解药救刀口；poison 毒一个人（id）；都不给 = 不用药。 */
  witch(uid, { save = false, poison = null } = {}) {
    this.need('witch', uid, 'ww_witch');
    const info = this.witchInfo(uid);
    if (save && poison) throw new Error('同一晚只能用一瓶药');
    if (save && !info.canSave) throw new Error(info.selfBlocked ? '首夜之后不能救自己' : '现在不能用解药');
    if (poison) {
      if (!info.canPoison) throw new Error('毒药已经用掉了');
      if (poison === uid) throw new Error('不能毒自己');
      this.targetOk(poison);
    }
    if (save) this.potions.save = false;
    if (poison) this.potions.poison = false;
    this.witchAct = { save: !!save, poison: poison ?? null };
    this.record('choice', `女巫 ${this.tag(uid)}${info.knows ? `（看到刀口：${this.knife ? this.name(this.knife) : '没有'}）` : '（解药已用，不知道刀口）'}：${save ? '用解药救人' : poison ? `毒 ${this.tag(poison)}` : '不用药'}`);
    this.nextNightStep('witch');
  }

  seer(uid, target) {
    const p = this.need('seer', uid, 'ww_seer');
    if (target != null) {
      if (target === uid) throw new Error('不能查验自己');
      this.targetOk(target);
      const wolf = this.get(target).role === 'ww_wolf';
      this.checks.push({ night: this.night, target, wolf });
      this.seerPick = target;
      this.say(`查验结果：**${this.name(target)}** 是${wolf ? '**狼人**' : '**好人**'}。`, p.id);
      this.record('info', `预言家 ${this.tag(uid)} 查验 ${this.tag(target)} → ${wolf ? '狼人' : '好人'}`);
    } else {
      this.seerPick = null;
      this.record('info', `预言家 ${this.tag(uid)} 没有查验`);
    }
    this.nextNightStep('seer');
  }

  /** 夜里这个阶段时间到：没行动的按「不行动」处理（狼人按已有的票定刀口）。 */
  nightTimeout() {
    if (this.stage === 'guard') { const g = this.actors()[0]; if (g) this.record('choice', `守卫 ${this.tag(g)} 超时，空守`); this.guardPick ??= null; this.nextNightStep('guard'); }
    else if (this.stage === 'wolf') this.settleKnife();
    else if (this.stage === 'witch') { this.witchAct ??= { save: false, poison: null }; this.nextNightStep('witch'); }
    else if (this.stage === 'seer') { this.seerPick ??= null; this.nextNightStep('seer'); }
  }

  /** 结算夜晚：刀口（守 / 救 / 奶穿）和毒药。返回今晚死的人（按座位号）。 */
  resolveNight() {
    if (this.phase !== 'night') return { deaths: [] };
    const dead = new Map(); // id → 死因
    if (this.knife) {
      const guarded = this.guardPick === this.knife;
      const saved = !!this.witchAct?.save;
      if (guarded && saved) { dead.set(this.knife, 'wolf'); this.record('death', `${this.tag(this.knife)} 同时被守卫守护和女巫救——奶穿，死亡`); }
      else if (!guarded && !saved) dead.set(this.knife, 'wolf');
      else this.record('st', `${this.tag(this.knife)} 被刀，但${guarded ? '被守卫守住' : '被女巫救下'}`);
    }
    if (this.witchAct?.poison) dead.set(this.witchAct.poison, 'poison'); // 毒药盖过刀：被刀又被毒的猎人也不能开枪
    this.lastGuard = this.guardPick ?? null;
    const ids = [...dead.keys()].sort((a, b) => this.get(a).seat - this.get(b).seat);
    for (const id of ids) this.kill(id, dead.get(id));
    this.nightDeaths = ids;
    return { deaths: ids };
  }

  kill(id, cause) {
    const p = this.get(id);
    if (!p?.alive) return;
    p.alive = false;
    p.cause = cause;
    p.diedAt = this.phase === 'night' ? `n${this.night}` : `d${this.day}`;
    const why = { wolf: '被狼人刀死', poison: '被女巫毒死', exile: '被放逐', shot: '被猎人带走' }[cause] ?? cause;
    this.record('death', `${this.tag(id)} ${why}`);
  }

  // ───────────────────────── 白天 ─────────────────────────
  /** 天亮：公布死讯，排好今天的阶段。 */
  dawn() {
    if (this.phase !== 'night') return { deaths: [] };
    this.phase = 'day';
    this.day += 1;
    const deaths = [...this.nightDeaths];
    this.say(deaths.length ? `第 ${this.day} 天。昨晚 ${deaths.map((id) => `**${this.name(id)}**`).join('、')} 出局了。` : `第 ${this.day} 天。昨晚是**平安夜**。`);
    if (this.checkWinner()) return { deaths };
    this.queue = [];
    if (deaths.length) this.queue.push({ stage: 'hunter', ids: deaths });
    if (this.night === 1) for (const id of deaths) this.queue.push({ stage: 'words', id });
    const first = deaths.length ? this.get(deaths[0]).seat : null;
    this.queue.push({ stage: 'speech', after: first });
    this.queue.push({ stage: 'vote' });
    this.next();
    return { deaths };
  }

  /** 进入队列里的下一个阶段；队列空了就是黄昏（等房间入夜）。 */
  next() {
    if (this.winner) { this.setStage('ended'); return; }
    this.speaker = null;
    this.hunterId = null;
    this.hunterDone = false;
    const item = this.queue.shift();
    if (!item) { this.setStage('dusk'); return; }
    switch (item.stage) {
      case 'hunter': {
        this.dying = item.ids;
        const h = item.ids.map((id) => this.get(id)).find((p) => p.role === 'ww_hunter');
        if (h && h.cause !== 'poison') this.hunterId = h.id;
        if (h && h.cause === 'poison') this.say('你被女巫毒死了，**不能开枪**。', h.id);
        break;
      }
      case 'words': this.speaker = item.id; break;
      case 'speech': case 'pk': {
        const list = item.stage === 'pk' ? this.pk : this.speechOrder(item.after);
        this.speakers = list;
        this.spoke = 0;
        this.speaker = list[0] ?? null;
        if (!this.speaker) { this.next(); return; }
        break;
      }
      case 'vote': case 'pkvote': {
        this.voters = item.stage === 'pkvote' ? this.alive().map((p) => p.id).filter((id) => !this.pk.includes(id)) : this.alive().map((p) => p.id);
        this.candidates = item.stage === 'pkvote' ? [...this.pk] : this.alive().map((p) => p.id);
        this.ballots = {};
        if (!this.voters.length) { this.say('PK 台上就是全部存活的人，没有人能投票：今天无人出局。'); this.next(); return; }
        break;
      }
      default: break;
    }
    this.setStage(item.stage);
  }

  /** 发言顺序：从 after 号的下一位开始顺时针（只算活人）；after 为 null（平安夜）时随机挑一个人开始。 */
  speechOrder(after) {
    const alive = this.alive();
    if (!alive.length) return [];
    let start;
    if (after == null) {
      start = alive[Math.floor(this.rng() * alive.length)].seat;
      this.decide('平安夜发言起点', alive.map((p) => `${p.seat}号`), `${start}号`);
    } else start = (alive.find((p) => p.seat > after) ?? alive[0]).seat;
    const i = alive.findIndex((p) => p.seat === start);
    return [...alive.slice(i), ...alive.slice(0, i)].map((p) => p.id);
  }

  /** 发言 / 遗言的人说完了。 */
  doneSpeaking(uid) {
    if (!['words', 'speech', 'pk'].includes(this.stage) || this.speaker !== uid) throw new Error('现在不是你发言');
    this.advanceSpeech();
  }
  advanceSpeech() {
    if (this.stage === 'words') { this.next(); return; }
    this.spoke += 1;
    this.speaker = this.speakers[this.spoke] ?? null;
    if (!this.speaker) this.next(); else this.seq += 1;
  }

  /** 猎人开枪（target 为 null = 不开枪）。开枪当场结算；不开枪就等这段时间结束（房间调 timeout）。 */
  hunterShoot(uid, target) {
    if (this.stage !== 'hunter' || this.hunterId !== uid || this.hunterDone) throw new Error('你现在不能开枪');
    this.hunterDone = true;
    if (target == null) { this.record('choice', `猎人 ${this.tag(uid)} 没有开枪`); return { shot: null }; }
    if (target === uid || !this.isAliveId(target)) { this.hunterDone = false; throw new Error('只能带走一名存活的其他玩家'); }
    this.kill(target, 'shot');
    this.say(`**${this.name(uid)}** 是猎人，开枪带走了 **${this.name(target)}**。`);
    if (this.checkWinner()) { this.setStage('ended'); return { shot: target }; }
    // 被带走的人死在白天：有遗言，排在这一串遗言的最后、发言之前
    const at = this.queue.findIndex((x) => x.stage !== 'words');
    this.queue.splice(at < 0 ? this.queue.length : at, 0, { stage: 'words', id: target });
    this.next(); // 发言顺序进了发言阶段才排，被带走的人自然不在里面
    return { shot: target };
  }

  /** 投票：target 为 null = 弃票。返回 true 表示所有人都投完了。 */
  castVote(uid, target) {
    if (!['vote', 'pkvote'].includes(this.stage)) throw new Error('现在不在投票');
    if (!this.voters.includes(uid)) throw new Error(this.stage === 'pkvote' && this.pk.includes(uid) ? 'PK 台上的人不能投票' : '你不能投票');
    if (target != null) {
      if (target === uid) throw new Error('不能投自己');
      if (!this.candidates.includes(target) || !this.isAliveId(target)) throw new Error(this.stage === 'pkvote' ? '只能投 PK 台上的人' : '只能投存活的玩家');
    }
    this.ballots[uid] = target ?? null;
    return this.voters.every((id) => id in this.ballots);
  }

  /** 唱票：票数最多的出局；并列进 PK（PK 里再并列就无人出局）。 */
  settleVote() {
    const pkRound = this.stage === 'pkvote';
    const tally = {};
    for (const id of this.voters) { const t = this.ballots[id] ?? null; if (t) tally[t] = (tally[t] ?? 0) + 1; }
    const rows = Object.entries(tally).sort((a, b) => b[1] - a[1] || this.get(a[0]).seat - this.get(b[0]).seat);
    const top = rows[0]?.[1] ?? 0;
    const tied = rows.filter(([, c]) => c === top).map(([id]) => id);
    const ballots = Object.fromEntries(this.voters.map((id) => [id, this.ballots[id] ?? null]));
    const byTarget = rows.map(([id, c]) => `${this.name(id)} ${c} 票（${this.voters.filter((v) => ballots[v] === id).map((v) => `${this.get(v).seat}号`).join('、')}）`);
    const abstain = this.voters.filter((v) => !ballots[v]).map((v) => `${this.get(v).seat}号`);
    const sheet = `${byTarget.join('；') || '没有人投票'}${abstain.length && rows.length ? `；弃票：${abstain.join('、')}` : ''}`;
    let result;
    if (!rows.length) result = { exiled: null, why: 'none' };
    else if (tied.length === 1) result = { exiled: tied[0], why: 'top' };
    else if (pkRound) result = { exiled: null, why: 'tie2' };
    else result = { exiled: null, why: 'pk', pk: tied.sort((a, b) => this.get(a).seat - this.get(b).seat) };
    this.voteHistory.push({ day: this.day, ballots, tally, ...result, pk: pkRound, pkList: result.pk ?? null }); // pk：这是不是 PK 那一轮
    this.record('vote', `${pkRound ? 'PK 投票' : '放逐投票'}：${sheet}`);
    const what = result.why === 'top' ? `**${this.name(result.exiled)}** 被放逐。`
      : result.why === 'pk' ? `${result.pk.map((id) => `**${this.name(id)}**`).join('、')} 平票，进入 PK：PK 的人依次发言，其余人再投一次。`
        : result.why === 'tie2' ? 'PK 再次平票：今天无人出局。' : '所有人都弃票：今天无人出局。';
    this.say(`${pkRound ? 'PK 投票' : '投票'}结果：${sheet}。${what}`);
    if (result.why === 'pk') {
      this.pk = result.pk;
      this.queue.unshift({ stage: 'pk' }, { stage: 'pkvote' });
    } else if (result.exiled) {
      this.kill(result.exiled, 'exile');
      if (this.checkWinner()) { this.setStage('ended'); return result; }
      this.queue.unshift({ stage: 'hunter', ids: [result.exiled] }, { stage: 'words', id: result.exiled });
    }
    this.next();
    return result;
  }

  /** 白天这个阶段时间到。 */
  dayTimeout() {
    if (this.stage === 'hunter') { if (this.hunterId && !this.hunterDone) this.record('choice', `猎人 ${this.tag(this.hunterId)} 超时，没有开枪`); this.next(); }
    else if (['words', 'speech', 'pk'].includes(this.stage)) this.advanceSpeech();
    else if (['vote', 'pkvote'].includes(this.stage)) this.settleVote();
  }

  /** 当前阶段时间到（夜里或白天）。 */
  timeout() { if (this.phase === 'night') this.nightTimeout(); else if (this.phase === 'day') this.dayTimeout(); }

  // ───────────────────────── 胜负 ─────────────────────────
  setWinner(team, reason) {
    if (this.winner) return;
    this.winner = team;
    this.winReason = reason;
    this.phase = 'ended';
    this.stage = 'ended';
    this.record('end', `${team === 'good' ? '好人' : '狼人'}获胜：${reason}`);
  }

  /** 屠边。返回胜者（没分出来返回 null）。 */
  checkWinner() {
    if (this.winner) return this.winner;
    const alive = this.alive();
    const wolves = alive.filter((p) => p.role === 'ww_wolf').length;
    const gods = alive.filter((p) => this.side(p) === 'god').length;
    const villagers = alive.filter((p) => this.side(p) === 'villager').length;
    const hadGods = this.players.some((p) => this.side(p) === 'god');
    const hadVillagers = this.players.some((p) => this.side(p) === 'villager');
    if (!wolves) this.setWinner('good', '狼人全部出局');
    else if (hadGods && !gods) this.setWinner('evil', '神职全部出局（屠神）');
    else if (hadVillagers && !villagers) this.setWinner('evil', '平民全部出局（屠民）');
    return this.winner;
  }

  // ───────────────────────── 存档 ─────────────────────────
  toJSON() {
    // 函数不存（rng，还有房间挂上来的 signals）：structuredClone 遇到函数会直接报错，整个存档就写不下去
    const data = Object.fromEntries(Object.entries(this).filter(([k, v]) => typeof v !== 'function' && k !== 'out'));
    return structuredClone({ ...data, out: [] });
  }
  static fromJSON(data, { rng = Math.random } = {}) {
    const g = Object.create(Werewolf.prototype);
    Object.assign(g, structuredClone(data));
    g.rng = rng;
    g.out = [];
    g.st ??= { decisions: [] };
    return g;
  }
}
