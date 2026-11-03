// 娱乐模式「阿瓦隆」：照《抵抗组织：阿瓦隆》（The Resistance: Avalon）原版规则。没有夜里杀人、没有处决，
// 只有开局一次的身份确认、五轮任务（队长组队 → 全体公开投票 → 队员秘密出任务票）和最后的刺杀梅林。
// 这里只管规则和状态，不碰计时、语音和推送（那些在 server/avalon.js）。和血染的 Game 共用几个字段名
// （players / get / name / phase / day / night / winner / toJSON），房间里那些通用的代码（暂停、语音、自由活动、存档）不用分开写。

export const AVALON_ROLES = {
  merlin: { name: '梅林', en: 'Merlin', good: true,
    ability: '你知道谁是坏人（莫德雷德除外）。如果好人完成三次任务，刺客会来找你：别让他认出你。' },
  percival: { name: '派西维尔', en: 'Percival', good: true,
    ability: '你会看到梅林和莫甘娜两个人，但分不清谁是谁。保护真正的梅林。' },
  loyal: { name: '亚瑟的忠臣', en: 'Loyal Servant of Arthur', good: true,
    ability: '你没有特殊信息。找出坏人，别让他们混进任务队伍。' },
  assassin: { name: '刺客', en: 'Assassin', good: false,
    ability: '你和同伴互相认识。好人完成三次任务后，你可以和同伴商量，指认一名玩家是梅林：指对了坏人获胜。' },
  morgana: { name: '莫甘娜', en: 'Morgana', good: false,
    ability: '你和同伴互相认识。在派西维尔眼里你和梅林一模一样：冒充梅林，骗过他。' },
  mordred: { name: '莫德雷德', en: 'Mordred', good: false,
    ability: '你和同伴互相认识。梅林看不到你。' },
  oberon: { name: '奥伯伦', en: 'Oberon', good: false,
    ability: '你是坏人，但你不认识其他坏人，其他坏人也不认识你（梅林看得到你）。' },
  minion: { name: '莫德雷德的爪牙', en: 'Minion of Mordred', good: false,
    ability: '你和同伴互相认识。混进任务队伍，让任务失败。' },
};

export const AVALON_MIN = 5;
export const AVALON_MAX = 10;
/** 人数 → [好人, 坏人] */
export const AVALON_TEAMS = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
/** 人数 → 五轮任务各要几个人 */
export const QUEST_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
/** 第几轮任务（1–5）要几张失败票才失败：7 人及以上第 4 轮要 2 张。 */
export const failsNeeded = (n, round) => (n >= 7 && round === 4 ? 2 : 1);
/** 同一轮连续这么多次组队被否决，坏人直接获胜。 */
export const MAX_REJECTS = 5;
/**
 * 房主能开关的可选角色和可选规则。默认照常见推荐：派西维尔和莫甘娜成对出现；坏人有第三个位置（7 人及以上）时放莫德雷德；奥伯伦默认不放。
 * merlin：梅林和刺客（规则书：大多数局都放，但不是必须；不放就是基础局，三次任务成功好人直接赢）。
 * targeting：官方可选规则「自选任务」——队长自己挑做哪个任务，每个任务只做一次，第 5 个任务要先成功两个才能做。
 */
export const DEFAULT_OPTIONS = { merlin: true, percival: true, morgana: true, mordred: true, oberon: false, lady: false, targeting: false };

export const isGood = (role) => !!AVALON_ROLES[role]?.good;

const shuffleArr = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * 这一局有哪些角色（没打乱）。好人：梅林、派西维尔（开了的话）、其余忠臣；
 * 坏人：刺客、莫甘娜、莫德雷德、奥伯伦（各自开了的话，坏人位置不够就按这个顺序往后的不放），其余爪牙。
 */
export function avalonRoles(n, options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const [good, evil] = AVALON_TEAMS[n];
  // 没有梅林就没有刺客；派西维尔和莫甘娜都是围着梅林转的，也一起不放
  const g = o.merlin ? ['merlin', ...(o.percival ? ['percival'] : [])] : [];
  // 没有梅林时莫德雷德（只对梅林隐身）也没有意义，和莫甘娜一样不放；奥伯伦照样可以放
  const e = [...(o.merlin ? ['assassin'] : []), ...['morgana', 'mordred', 'oberon'].filter((r) => o[r] && (o.merlin || r === 'oberon'))].slice(0, evil);
  while (g.length < good) g.push('loyal');
  while (e.length < evil) e.push('minion');
  return [...g, ...e];
}

/** 好人赢的方式和坏人赢的方式，写进公告用。 */
const REASONS = {
  rejects: `同一轮连续 ${MAX_REJECTS} 次组队被否决`,
  fails: '三次任务失败',
  success: '三次任务成功',
  missed: (who) => `三次任务成功，刺客没认出梅林（指认了 ${who}）`,
  found: (who) => `三次任务成功，但刺客认出了梅林（${who}）`,
};

export class Avalon {
  /**
   * players：[{ id, name }]，已经按座位排好（第一个是 1 号）。roles：可选，指定每个座位的角色（测试用）。
   * options：可选角色开关和湖中仙女，见 DEFAULT_OPTIONS。leader：第一任队长的座位下标（不给就随机）。
   */
  constructor(players, { roles, options = {}, leader, rng = Math.random } = {}) {
    if (!players) return; // fromJSON
    const n = players.length;
    if (!AVALON_TEAMS[n]) throw new Error(`阿瓦隆要 ${AVALON_MIN}–${AVALON_MAX} 人`);
    this.id = Math.random().toString(36).slice(2, 10);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    const list = roles ?? shuffleArr(avalonRoles(n, this.options), rng);
    this.players = players.map((p, i) => ({ id: p.id, name: p.name, seat: i + 1, role: list[i], alive: true }));
    this.stage = 'reveal';      // reveal 身份确认 / propose 队长组队 / vote 全体投票 / quest 出任务票 / lady 湖中仙女 / assassin 刺杀 / ended
    this.round = 1;             // 第几轮任务（1–5）：做过几个任务再加一
    this.questNo = this.options.targeting ? null : 1; // 这一轮做哪个任务（1–5）：平常就是第几轮；自选任务时由队长组队时选
    this.leader = leader ?? Math.floor(rng() * n); // 队长的座位下标
    this.attempt = 1;           // 这一轮第几次组队
    this.team = [];             // 这次提名的队员
    this.votes = {};            // 这次投票：id → true 赞成 / false 反对（全部投完才公开）
    this.cards = {};            // 这次任务：id → true 成功 / false 失败（永远不公开谁出了什么）
    this.quests = QUEST_SIZES[n].map((size, i) => ({ size, need: failsNeeded(n, i + 1), result: null, fails: null, team: null, leader: null }));
    this.proposals = [];        // 每次组队：{ round, quest, attempt, leader, team, votes, approved }，投完公开
    this.ready = [];            // 身份确认：看完的人
    // 湖中仙女：给第一任队长右手边（上一个座位）的人。官方推荐 7 人及以上用，这里不强制
    this.lady = this.options.lady ? { holder: this.players[(this.leader - 1 + n) % n].id, used: [], log: [] } : null;
    this.ladySeen = {};         // 湖中仙女看到的：查看者 id → [{ id, good }]（只给本人）
    this.guess = null;          // 刺杀：{ by, target, merlin }
    this.suggest = {};          // 刺杀时坏人同伴给刺客的建议：坏人 id → 目标 id
    this.next = null;           // 房间停一下要做的下一步（'propose' | 'round' | 'lady' | 'assassin'），重启后接着做
    this.winner = null;
    this.winReason = null;
    this.timeline = [];
  }

  get avalon() { return true; }
  get script() { return 'avalon'; }
  get engine() { return 'avalon'; }
  /** 和血染共用的阶段：身份确认算「夜晚」，其余都是白天，结束后 ended。 */
  get phase() { return this.stage === 'reveal' ? 'night' : this.stage === 'ended' ? 'ended' : 'day'; }
  get night() { return 1; }
  get day() { return this.round; }
  get n() { return this.players.length; }
  get(id) { return this.players.find((p) => p.id === id); }
  name(id) { const p = this.get(id); return p ? `${p.seat}号 ${p.name}` : '?'; }
  alive() { return this.players; }
  aliveCount() { return this.players.length; }
  visAlive() { return true; }
  visAliveCount() { return this.players.length; }
  evilOf(p) { return !isGood(p.role); }
  nightPrompts() { return []; } // 房间里通用的代码（倒计时、说书人面板）会问：阿瓦隆夜里没有人要选
  missingChoices() { return []; }
  leaderId() { return this.players[this.leader].id; }
  quest() { return this.questNo ? this.quests[this.questNo - 1] : null; }
  /** 这一轮能做哪些任务：平常只有这一轮的；自选任务时是还没做过的，第 5 个要先成功两个。 */
  questOptions() {
    if (!this.options.targeting) return [this.round];
    return this.quests.map((q, i) => i + 1).filter((k) => !this.quests[k - 1].result && (k < 5 || this.wins('success') >= 2));
  }
  roleOf(id) { return this.get(id)?.role; }
  idsWith(...roles) { return this.players.filter((p) => roles.includes(p.role)).map((p) => p.id); }
  wins(side) { return this.quests.filter((q) => q.result === side).length; }

  require(stage) { if (this.stage !== stage) throw new Error(stage === 'propose' ? '现在不是组队的时候' : stage === 'vote' ? '现在不是投票的时候' : stage === 'quest' ? '现在不是出任务的时候' : stage === 'lady' ? '现在不是湖中仙女的时候' : stage === 'assassin' ? '现在不是刺杀的时候' : '现在不能这么做'); }

  /**
   * 开局时这个人知道什么（只给本人）：sees 是看到的人和看到的方式。
   * 梅林：坏人（莫德雷德除外，奥伯伦看得到）。派西维尔：梅林和莫甘娜（只说「梅林或莫甘娜」）。
   * 坏人（奥伯伦除外）：其他坏人（奥伯伦除外），不知道谁是什么角色。奥伯伦和忠臣什么都不知道。
   */
  knowledge(id) {
    const me = this.get(id);
    if (!me) return [];
    const others = this.players.filter((p) => p.id !== id);
    if (me.role === 'merlin') return others.filter((p) => !isGood(p.role) && p.role !== 'mordred').map((p) => ({ id: p.id, as: 'evil' }));
    if (me.role === 'percival') return others.filter((p) => ['merlin', 'morgana'].includes(p.role)).map((p) => ({ id: p.id, as: 'merlin' }));
    if (!isGood(me.role) && me.role !== 'oberon') return others.filter((p) => !isGood(p.role) && p.role !== 'oberon').map((p) => ({ id: p.id, as: 'ally' }));
    return [];
  }

  /** 身份确认：看完了。所有人都看完就开始第一轮。返回开没开始。 */
  setReady(id) {
    this.require('reveal');
    if (!this.get(id)) throw new Error('你不是这局的玩家');
    if (!this.ready.includes(id)) this.ready.push(id);
    return this.ready.length === this.n;
  }

  /** 身份确认结束（全部看完或者时间到）：开始第一轮组队。 */
  begin() {
    if (this.stage !== 'reveal') return;
    this.stage = 'propose';
    this.note(`第 1 轮任务开始，队长 ${this.name(this.leaderId())}`);
  }

  /** 队长提名队员（人数要正好是这一轮要的，可以带上自己）。自选任务时还要选做哪个任务（questNo）。 */
  propose(id, team, questNo = null) {
    this.require('propose');
    if (id !== this.leaderId()) throw new Error('只有队长能组队');
    if (this.options.targeting) {
      if (!this.questOptions().includes(Number(questNo))) throw new Error(Number(questNo) === 5 ? '第 5 个任务要先成功两个任务才能做' : '先选这一轮做哪个任务（做过的不能再做）');
      this.questNo = Number(questNo);
    }
    const ids = [...new Set(team)];
    if (ids.length !== this.quest().size) throw new Error(`这一轮要选 ${this.quest().size} 个人`);
    if (ids.some((x) => !this.get(x))) throw new Error('只能选这局的玩家');
    this.team = this.players.map((p) => p.id).filter((x) => ids.includes(x)); // 按座位排
    this.votes = {};
    this.stage = 'vote';
    return this.team;
  }

  /** 全体投票（每人一票，投完之前可以改）。返回是不是所有人都投完了。 */
  vote(id, yes) {
    this.require('vote');
    if (!this.get(id)) throw new Error('你不是这局的玩家');
    this.votes[id] = !!yes;
    return Object.keys(this.votes).length === this.n;
  }

  missingVotes() { return this.stage === 'vote' ? this.players.map((p) => p.id).filter((id) => !(id in this.votes)) : []; }

  /**
   * 开票：过半（严格多于一半）赞成就组队成功，进入任务；否则队长交给下一个座位，
   * 同一轮第 5 次也被否决坏人直接获胜。返回这次的记录。
   */
  tally() {
    this.require('vote');
    if (this.missingVotes().length) throw new Error('还有人没投票');
    const yes = Object.values(this.votes).filter(Boolean).length;
    const approved = yes * 2 > this.n;
    const rec = { round: this.round, quest: this.questNo, attempt: this.attempt, leader: this.leaderId(), team: [...this.team], votes: { ...this.votes }, yes, approved };
    this.proposals.push(rec);
    this.note(`第 ${this.round} 轮第 ${this.attempt} 次组队（队长 ${this.name(rec.leader)}）：${rec.team.map((x) => this.name(x)).join('、')}，${yes} 赞成 ${this.n - yes} 反对，${approved ? '通过' : '否决'}`);
    if (approved) {
      this.cards = {};
      this.stage = 'quest';
      return rec;
    }
    if (this.attempt >= MAX_REJECTS) { this.end('evil', REASONS.rejects); return rec; }
    this.attempt += 1;
    this.nextLeader();
    this.team = [];
    if (this.options.targeting) this.questNo = null; // 下一任队长重新挑任务
    this.stage = 'propose';
    return rec;
  }

  nextLeader() { this.leader = (this.leader + 1) % this.n; }

  /** 队员出任务票。好人只能出成功。返回是不是全部出完了。 */
  play(id, success) {
    this.require('quest');
    if (!this.team.includes(id)) throw new Error('你不在这次任务的队伍里');
    if (!success && isGood(this.roleOf(id))) throw new Error('好人只能出「成功」');
    if (id in this.cards) throw new Error('你已经出过票了');
    this.cards[id] = !!success;
    return Object.keys(this.cards).length === this.team.length;
  }

  missingCards() { return this.stage === 'quest' ? this.team.filter((id) => !(id in this.cards)) : []; }

  /**
   * 翻任务票：只公开失败票的张数。失败票达到这一轮要的张数就失败。
   * 之后：三次失败坏人胜；三次成功进入刺杀；否则（第 2、3、4 轮结束后有湖中仙女的话先用湖中仙女）下一轮。
   */
  reveal() {
    this.require('quest');
    if (this.missingCards().length) throw new Error('还有人没出任务票');
    const q = this.quest();
    q.fails = Object.values(this.cards).filter((x) => !x).length;
    q.result = q.fails >= q.need ? 'fail' : 'success';
    q.team = [...this.team];
    q.leader = this.leaderId();
    q.attempt = this.attempt;
    q.round = this.round;
    this.note(`第 ${this.round} 轮${this.options.targeting ? `（任务 ${this.questNo}）` : '任务'}${q.result === 'success' ? '成功' : '失败'}（${q.fails} 张失败票${q.need > 1 ? `，这一轮要 ${q.need} 张才失败` : ''}）`);
    const out = { round: this.round, quest: this.questNo, result: q.result, fails: q.fails };
    if (this.wins('fail') >= 3) { this.end('evil', REASONS.fails); return out; }
    if (this.wins('success') >= 3) {
      if (!this.assassinId()) { this.end('good', REASONS.success); return out; } // 基础局没有梅林和刺客
      this.stage = 'assassin'; this.suggest = {}; return out;
    }
    if (this.lady && this.round >= 2 && this.round <= 4) { this.stage = 'lady'; return out; }
    this.nextRound();
    return out;
  }

  nextRound() {
    this.round += 1;
    this.attempt = 1;
    this.team = [];
    this.votes = {};
    this.cards = {};
    this.questNo = this.options.targeting ? null : this.round;
    this.nextLeader();
    this.stage = 'propose';
    this.note(`第 ${this.round} 轮任务开始，队长 ${this.name(this.leaderId())}`);
  }

  /** 湖中仙女能查谁：不能查自己，不能查拿过湖中仙女的人。 */
  ladyOptions() {
    if (!this.lady) return [];
    const past = new Set([...this.lady.used, this.lady.holder]);
    return this.players.map((p) => p.id).filter((id) => !past.has(id));
  }

  /** 湖中仙女：查看一名玩家的阵营（只有自己知道），然后把湖中仙女交给他。返回 { good }。 */
  useLady(id, target) {
    this.require('lady');
    if (id !== this.lady.holder) throw new Error('湖中仙女不在你手上');
    if (!this.ladyOptions().includes(target)) throw new Error('不能查看这个人（自己和拿过湖中仙女的人不能查）');
    const good = isGood(this.roleOf(target));
    (this.ladySeen[id] ??= []).push({ id: target, good, round: this.round });
    this.lady.log.push({ from: id, to: target, round: this.round });
    this.lady.used.push(id);
    this.lady.holder = target;
    this.note(`${this.name(id)} 用湖中仙女查看了 ${this.name(target)}`);
    this.nextRound();
    return { good };
  }

  assassinId() { return this.idsWith('assassin')[0] ?? null; }
  /** 刺客能指认谁：规则书写的是「指认一名好人」——自己和认识的同伴不能选（不认识的奥伯伦选得到，选了就是指错）。 */
  assassinOptions() {
    const a = this.assassinId();
    const allies = new Set([a, ...this.knowledge(a).map((k) => k.id)]);
    return this.players.map((p) => p.id).filter((id) => !allies.has(id));
  }

  /** 坏人同伴给刺客出主意（只有刺客认识的同伴能出，刺客自己看得到）。 */
  suggestTarget(id, target) {
    this.require('assassin');
    const allies = this.knowledge(this.assassinId()).map((k) => k.id);
    if (!allies.includes(id)) throw new Error('只有刺客的同伴能出主意');
    if (target == null) delete this.suggest[id];
    else if (!this.assassinOptions().includes(target)) throw new Error('只能建议好人（你们认识的同伴不用猜）');
    else this.suggest[id] = target;
  }

  /** 刺客指认梅林：指对了坏人赢，指错了好人赢。 */
  assassinate(id, target) {
    this.require('assassin');
    if (id !== this.assassinId()) throw new Error('只有刺客能指认梅林');
    if (!this.assassinOptions().includes(target)) throw new Error('只能指认好人（你和你认识的同伴不能选）');
    const merlin = this.roleOf(target) === 'merlin';
    this.guess = { by: id, target, merlin };
    this.note(`刺客 ${this.name(id)} 指认 ${this.name(target)} 是梅林——${merlin ? '指对了' : '指错了'}`);
    this.end(merlin ? 'evil' : 'good', merlin ? REASONS.found(this.name(target)) : REASONS.missed(this.name(target)));
    return { merlin };
  }

  end(team, reason) {
    this.winner = team;
    this.winReason = reason;
    this.stage = 'ended';
    this.note(`${team === 'good' ? '好人' : '坏人'}获胜：${reason}`);
  }

  note(text) { this.timeline.push({ at: Date.now(), round: this.round, text }); }

  toJSON() {
    const { signals, ...rest } = this; // 房间接上的回调不存
    return { ...rest, avalon: true };
  }

  static fromJSON(s) {
    const g = new Avalon();
    const { avalon, ...rest } = s;
    Object.assign(g, rest);
    if (!('questNo' in rest)) g.questNo = g.round; // 加自选任务之前的存档
    return g;
  }
}
