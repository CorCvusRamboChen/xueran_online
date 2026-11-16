// 旅行者的结算（三套引擎通用，混进 Game）。规则见 roles.js 的 TRAVELLERS 和 references/travellers.md。
// · 加入：addTraveller（房间层先让说书人掷阵营）。座位排在最后，夜里不让加入（官方：夜里来的等天亮）。
// · 离开：p.left = true，算死人但没有票、不能被提名、不算进流放的人数。
// · 流放：exileTraveller，不算处决、能力挡不住（官方），全体举手、过所有（没离开的）玩家的一半；房间层管举手。
// · 能力：窃贼 / 官员看昨晚的选择（choices 到下一夜开始才清）改投票的权重；巫毒师改谁能投、门槛；
//   替罪羊在处决入口换人；枪手、法官是白天的主动能力，房间层调。
import { ROLES, TRAVELLER_IDS } from './roles.js';

export const TRAVELLER_METHODS = {
  /** 这个旅行者的能力还在吗（活着、没醉没毒）。 */
  travellerOn(p) {
    if (!p?.traveller || !p.alive || p.left) return false;
    const off = this.engine === 'snv' ? this.snvBroken(p) : this.script === 'bmr' ? this.bmrBroken(p) : this.broken(p);
    return !off;
  },
  travellerOf(role) { return this.players.find((p) => p.traveller && p.role === role && !p.left); },
  /** 不算旅行者的存活人数（官方：「只剩两名玩家存活」不算旅行者；镇长的三人也不算）。 */
  townAlive() { return this.alive().filter((p) => !p.traveller).length; },

  /** 加入一名旅行者。evil 由说书人定（房间层掷骰）。返回要私下告诉他的话。 */
  addTraveller(user, role, evil) {
    if (!TRAVELLER_IDS.includes(role)) throw new Error('没有这个旅行者');
    if (this.phase !== 'day' && this.phase !== 'setup') throw new Error('夜里不能加入，天亮后再来');
    if (this.get(user.id)) throw new Error('你已经在这局里了');
    if (this.travellerOf(role)) throw new Error(`${ROLES[role].name}已经有人当了`);
    const p = { id: user.id, name: user.name, seat: this.players.length + 1, role, shownRole: role, alive: true, ghostVote: true, evil: !!evil, traveller: true, joinedDay: this.day,
      gained: null, gainedFake: false, kept: false };
    this.players.push(p);
    if (this.suspicion) this.suspicion[p.id] = 0;
    this.record('setup', `${this.tag(p.id)} 以旅行者身份加入：${ROLES[role].name}，${evil ? '邪恶' : '善良'}阵营`);
    const demons = this.players.filter((q) => q.alive && ROLES[q.role].team === 'demon');
    const out = [`你以**${ROLES[role].name}**（旅行者）的身份加入了。说书人让你站在**${evil ? '邪恶' : '善良'}**阵营。`];
    if (evil) out.push(demons.length ? `恶魔是 ${demons.map((q) => `**${this.name(q.id)}**`).join('、')}。（你不知道爪牙是谁，也没有伪装。）` : '场上现在没有活着的恶魔。');
    return out.join('\n');
  },

  /** 旅行者离开：从这局里退出（算死人，没有票，不能被提名，不算人数）。 */
  removeTraveller(id) {
    const p = this.get(id);
    if (!p?.traveller || p.left) throw new Error('你不是这局的旅行者');
    p.left = true; p.alive = false; p.ghostVote = false;
    this.record('death', `${this.tag(id)} 离开了这局`);
    this.checkWinner();
  },

  /** 流放：旅行者死亡，不算处决，能力挡不住。 */
  exileTraveller(id) {
    const p = this.get(id);
    if (!p?.traveller || !p.alive) throw new Error('只能流放活着的旅行者');
    p.alive = false;
    this.log.push(`${this.name(id)} 被流放`);
    this.record('death', `${this.tag(id)} 被流放`);
    this.checkWinner();
  },

  /** 投票权重：窃贼昨晚选的人算 -1 票，官员选的人算 3 票（两个都选了就是 -3）。 */
  voteWeight(id) {
    let w = 1;
    for (const [role, k] of [['bureaucrat', 3], ['thief', -1]]) {
      const t = this.travellerOf(role);
      if (!t || !this.travellerOn(t)) continue;
      const c = this.choices?.[t.id];
      const pick = Array.isArray(c) ? c[0] : c?.targets?.[0];
      if (pick === id) w *= k;
    }
    return w;
  },
  /** 巫毒师在：只有他和死人能投票，死人不用消耗投票标记，不需要过半数。 */
  voudonOn() { const v = this.travellerOf('voudon'); return !!v && this.travellerOn(v); },

  /** 替罪羊：同阵营的人被处决，说书人可能让他替死。返回实际被处决的人。 */
  scapegoatSwap(p) {
    const s = this.travellerOf('scapegoat');
    if (!s || s.id === p.id || !this.travellerOn(s) || this.evilOf(s) !== this.evilOf(p) || this.scapegoatDay === this.day) return p;
    this.scapegoatDay = this.day;
    const demon = this.evilOf(s) && ROLES[p.role]?.team === 'demon' ? 1 : 0; // 邪恶替罪羊替恶魔挡刀：不挡邪恶就输了
    if (!this.st.roll('scapegoat', { demon }, { who: s.id, instead: p.id })) return p;
    this.record('st', `替罪羊 ${this.tag(s.id)} 代替 ${this.tag(p.id)} 被处决`);
    return s;
  },

  /** 枪手：今天第一次投票统计后，打死一名今天投过票的人（每天一次）。voters：今天投过票的人。 */
  gunslinger(uid, targetId, voters) {
    const p = this.get(uid); const t = this.get(targetId);
    if (!p || p.role !== 'gunslinger' || !p.alive || p.left) throw new Error('你不是枪手');
    if (this.phase !== 'day') throw new Error('只能在白天');
    if (this.gunDay === this.day) throw new Error('你今天已经开过枪了');
    if (!voters.length) throw new Error('今天还没有统计过投票');
    if (!t || !voters.includes(targetId)) throw new Error('只能选今天投过票的人');
    this.gunDay = this.day;
    this.record('slay', `枪手 ${this.tag(uid)} 向 ${this.tag(targetId)} 开枪`);
    if (!this.travellerOn(p)) { this.record('st', '枪手失效：没有人死'); return { died: false }; }
    const was = t.alive;
    this.kill(t, 'gunslinger', this.dayMessages());
    this.checkWinner();
    return { died: was && !t.alive };
  },

  /** 法官：每局一次，别人发起的这次提名，强制让处决成功或失败。失效时这次也用掉、没有效果。返回生效了没有。 */
  judgeUse(uid, nominatorId, pass) {
    const p = this.get(uid);
    if (!p || p.role !== 'judge' || !p.alive || p.left) throw new Error('你不是法官');
    if (this.judgeUsed) throw new Error('你这局已经用过了');
    if (nominatorId === uid) throw new Error('只能用在别人发起的提名上');
    this.judgeUsed = true;
    this.record('st', `法官 ${this.tag(uid)} 宣布这次处决强制${pass ? '成功' : '失败'}`);
    return this.travellerOn(p);
  },
};
