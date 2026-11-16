// 旅行者的结算（三套引擎通用，混进 Game）。规则见 roles.js 的 TRAVELLERS 和 references/travellers.md。
// · 加入：addTraveller（房间层先让说书人掷阵营）。座位排在最后，夜里不让加入（官方：夜里来的等天亮）。
// · 离开：p.left = true，算死人但没有票、不能被提名、不算进流放的人数。
// · 流放：exileTraveller，不算处决、能力挡不住（官方），全体举手、过所有（没离开的）玩家的一半；房间层管举手。
// · 能力：窃贼 / 官员看昨晚的选择（choices 到下一夜开始才清）改投票的权重；巫毒师改谁能投、门槛；
//   替罪羊在处决入口换人；枪手、法官是白天的主动能力，房间层调。
import { ROLES, TRAVELLER_IDS, rolesOf } from './roles.js';

const pickOne = (list, rng) => list[Math.floor((rng?.() ?? Math.random()) * list.length)];

export const TRAVELLER_METHODS = {
  /** 这个旅行者的能力还在吗（活着、没醉没毒）。 */
  travellerOn(p) {
    if (!p?.traveller || !p.alive || p.left) return false;
    if (p.role === 'beggar') return true; // 乞丐不会中毒和醉酒
    const off = this.engine === 'snv' ? this.snvBroken(p) : this.script === 'bmr' ? this.bmrBroken(p) : this.broken(p);
    return !off;
  },
  travellerOf(role) { return this.players.find((p) => p.traveller && p.role === role && !p.left); },
  /** 不算旅行者的存活人数（官方：「只剩两名玩家存活」不算旅行者；镇长的三人也不算）。 */
  townAlive() { return this.alive().filter((p) => !p.traveller).length; },

  /** 加入一名旅行者。evil 由说书人定（房间层掷骰）。返回要私下告诉他的话。 */
  addTraveller(user, role, evil) {
    if (!TRAVELLER_IDS.includes(role)) throw new Error('没有这个旅行者');
    if (this.get(user.id)) throw new Error('你已经在这局里了');
    if (this.travellerOf(role)) throw new Error(`${ROLES[role].name}已经有人当了`);
    const p = { id: user.id, name: user.name, seat: this.players.length + 1, role, shownRole: role, alive: true, ghostVote: true, evil: !!evil, traveller: true, joinedDay: this.day, joinedNight: this.phase === 'night' ? this.night : null,
      gained: null, gainedFake: false, kept: false, ...(role === 'beggar' ? { beggarTokens: 0 } : {}) };
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
  /** 乞丐（官方百科）：死亡的玩家把自己的投票标记交给乞丐，乞丐得知他的阵营；给了以后他就不能再投票。只能给乞丐。 */
  giveBeggar(fromId) {
    const from = this.get(fromId); const b = this.travellerOf('beggar');
    if (!b || !b.alive) throw new Error('场上没有活着的乞丐');
    if (!from || from.left || from.id === b.id) throw new Error('你不能把票给乞丐');
    if (this.visAlive(from)) throw new Error('只有死亡的玩家能把投票标记给乞丐');
    if (!from.ghostVote) throw new Error('你已经没有投票标记了');
    from.ghostVote = false;
    b.beggarTokens = (b.beggarTokens ?? 0) + 1;
    const evil = this.evilOf(from);
    this.record('st', `${this.tag(fromId)} 把投票标记给了乞丐 ${this.tag(b.id)}（${evil ? '邪恶' : '善良'}）`);
    return { beggar: b, evil };
  },
  /** 活着的乞丐投一次票用掉一个标记。 */
  beggarVoted(id) { const p = this.get(id); if (p?.role === 'beggar' && p.traveller && this.visAlive(p)) p.beggarTokens = Math.max(0, (p.beggarTokens ?? 0) - 1); },

  /**
   * 学徒（官方百科）：在他的首个夜晚，善良的获得一个镇民能力、邪恶的获得一个爪牙能力，保留到死；他还是学徒（探查类能力看到的是学徒）。
   * 只能是剧本里的角色，通常选不在场的。这里只给按夜里选人结算、能照搬给学徒的能力（被动能力要改很多处判定，说书人不选）。
   */
  apprenticeSetup() {
    const p = this.travellerOf('apprentice');
    if (!p || !p.alive || p.apprenticeAs || p.apprenticeTold || p.joinedNight === this.night) return;
    // 梦殒春宵引擎（冒名钓鱼）：能力按 abilityOf 走（和哲学家一样用 gained），剧本里的镇民 / 爪牙都能给
    const pool = rolesOf(this.script, this.evilOf(p) ? 'minion' : 'townsfolk');
    const inPlay = new Set(this.players.map((q) => q.role));
    const free = pool.filter((r) => !inPlay.has(r));
    const role = pickOne(free.length ? free : pool, this.rng);
    p.apprenticeAs = role; p.apprenticeTold = true;
    p.gained = role; // 通用的「拿着这个能力」判定（has / abilityOf）都认 gained
    // 只在首个夜晚生效的能力（官方：在学徒加入的当晚就生效）
    if (this.script === 'bmr' && role === 'grandmother' && !this.bmrBroken(p)) this.grandmotherInfo(p, (q, text) => (this.evilMessages ??= []).push({ playerId: q.id, text }));
    if (this.script === 'bmr' && role === 'godfather') {
      const outs = this.players.filter((q) => ROLES[q.role]?.team === 'outsider').map((q) => ROLES[q.role].name);
      (this.evilMessages ??= []).push({ playerId: p.id, text: outs.length ? `在场的外来者：**${outs.join('、')}**。` : '场上**没有**外来者。' });
    }
    this.record('st', `学徒 ${this.tag(p.id)} 获得了${ROLES[role].name}的能力`);
    (this.evilMessages ??= []).push({ playerId: p.id, text: `学徒：你获得了**${ROLES[role].name}**的能力，保留到你死亡。${ROLES[role].ability}（你仍然是学徒，别人查你看到的是学徒。）` });
  },

  /**
   * 咖啡师（被动，说书人每晚选）：一名玩家直到黄昏清醒且健康、获得正确信息，或能力生效两次；那名玩家会被叫醒告知是哪一个。
   * 这里说书人只用第一种（官方建议优先给不能从行动两次里受益的角色；第二种要改每个能力的结算）。
   */
  baristaStep(messages) {
    const b = this.travellerOf('barista');
    if (!b || !this.travellerOn(b)) return;
    const pool = this.players.filter((q) => this.active(q) && q.id !== b.id && !q.traveller && ['townsfolk', 'outsider'].includes(ROLES[q.role]?.team));
    if (!pool.length) return;
    const twiceOk = (q) => { const r = this.abilityOf(q); const c = ROLES[r]?.choose; return !!c && !c.once && !c.role && ROLES[r].otherNight > 0 && !this.snvBroken(q) && this.holders(r).length === 1; };
    const doubles = pool.filter(twiceOk);
    const broken = pool.filter((q) => this.snvBroken(q)); // 醉酒中毒的人：给清醒健康最有用
    const roll = this.rng?.() ?? Math.random();
    const twice = doubles.length && (!broken.length || roll < 0.4);
    const t = twice ? pickOne(doubles, this.rng) : pickOne(broken.length && roll < 0.8 ? broken : pool, this.rng);
    this.baristaFx = { id: t.id, night: this.night, twice: !!twice, done: false };
    this.record('st', `咖啡师：${this.tag(t.id)} ${twice ? '今晚能力生效两次' : '直到黄昏清醒且健康，获得正确信息'}`);
    messages.push({ playerId: t.id, text: twice ? '**咖啡师**的能力对你生效（第二种）：今晚你的**能力生效两次**——你会被叫醒再选一次。' : '**咖啡师**的能力对你生效（第一种）：直到下个黄昏，你**清醒且健康，并获得正确信息**。' });
  },
  /** 咖啡师第二种：这一步结算完，叫醒他再选一次，这一步再结算一遍。 */
  baristaAgain(step, i, messages) {
    const fx = this.baristaFx;
    if (!fx?.twice || fx.done || fx.night !== this.night) return false;
    const p = this.get(fx.id);
    if (!p || !this.active(p) || this.abilityOf(p) !== step || !this.choices[p.id]) return false;
    fx.done = true;
    delete this.choices[p.id];
    this.midNight = { step: i, who: p.id, as: step, messages: [] };
    this.flushed = messages.splice(0);
    this.record('st', `咖啡师：${this.tag(p.id)} 的能力再生效一次`);
    return true;
  },

  /** 流莺（每晚*）：选一名存活玩家，叫醒他问同不同意；同意就得知他的角色，说书人决定两人是否同时死亡（不会因此杀死恶魔结束游戏）。 */
  harlotStep(i, messages) {
    const h = this.players.find((q) => q.role === 'harlot' && q.traveller && q.alive && !q.left);
    if (!h || this.night === 1) return null;
    const t = this.choiceOfSNV(h)?.targets?.[0];
    if (!t || !t.alive) return null;
    const ask = this.harlotAsk?.night === this.night ? this.harlotAsk : (this.harlotAsk = { night: this.night, harlot: h.id, target: t.id, asked: false, saved: null });
    if (!ask.asked) {
      ask.asked = true;
      if (this.choices[t.id]) ask.saved = this.choices[t.id];
      delete this.choices[t.id];
      this.midNight = { step: i, who: t.id, as: 'harlot_ask', messages: [] };
      this.flushed = messages.splice(0);
      return 'pause';
    }
    const c = this.choices[t.id];
    const yes = c?.role === 'harlot_yes';
    if (ask.saved) this.choices[t.id] = ask.saved; else delete this.choices[t.id];
    this.record('choice', `流莺 ${this.tag(h.id)} 选了 ${this.tag(t.id)}，${this.tag(t.id)} ${yes ? '同意' : '拒绝'}了`);
    if (!yes) { messages.push({ playerId: h.id, text: `${this.name(t.id)} 拒绝了你。` }); return null; }
    const on = this.travellerOn(h);
    const role = on ? t.role : pickOne(rolesOf(this.script).filter((r) => r !== t.role), this.rng);
    messages.push({ playerId: h.id, text: `${this.name(t.id)} 同意了：他的角色是 **${ROLES[role].name}**。` });
    if (on && ROLES[t.role]?.team !== 'demon' && this.st.roll('harlotDeath', {}, { who: h.id, with: t.id })) {
      this.record('st', `流莺：说书人让 ${this.tag(h.id)} 和 ${this.tag(t.id)} 一起死去`);
      this.snvDie(h, 'harlot', messages); this.snvDie(t, 'harlot', messages);
    }
    return null;
  },

  /** 集骨者（每局一次，夜晚*）：选一名死亡玩家，他重新获得能力到下个黄昏；今晚还没轮到他的能力，就叫醒他行动。 */
  boneStep(i, steps, messages) {
    const b = this.players.find((q) => q.role === 'bonecollector' && q.traveller && q.alive && !q.left);
    if (!b || this.used[b.id] || this.night === 1) return null;
    const t = this.choiceOfSNV(b)?.targets?.[0];
    if (!t) return null;
    this.used[b.id] = true; // 选了就用掉（醉酒中毒也算，官方「失去能力」标记）
    this.record('choice', `集骨者 ${this.tag(b.id)} 选了死亡的 ${this.tag(t.id)}`);
    if (!this.travellerOn(b) || t.alive || t.kept || t.apparentDead) return null; // 亡骨魔留着能力的爪牙不能「重新获得」
    t.regained = this.night;
    messages.push({ playerId: t.id, text: '**集骨者**让你重新获得了你的能力，直到下个黄昏。' });
    return this.midCheck(steps, i, [t.id], messages) ? 'pause' : null;
  },

  /** 女舍监（官方百科）：每个白天一次宣布至多三对玩家交换座位，按顺序执行；新座位一直有效。座位变了，相邻类的能力跟着变。 */
  matronSwap(uid, pairs) {
    const m = this.get(uid);
    if (!m || m.role !== 'matron' || !m.traveller || !m.alive || m.left) throw new Error('你不是女舍监');
    if (this.phase !== 'day') throw new Error('只能在白天换座位');
    if (this.matronDay === this.day) throw new Error('今天已经换过座位了（三对要一次宣布完）');
    if (!Array.isArray(pairs) || !pairs.length || pairs.length > 3) throw new Error('一次选一到三对玩家');
    for (const pr of pairs) if (!Array.isArray(pr) || pr.length !== 2 || pr[0] === pr[1] || pr.some((id) => !this.get(id) || this.get(id).left)) throw new Error('每对要选两个不同的玩家');
    this.matronDay = this.day;
    const on = this.travellerOn(m);
    if (on) for (const [a, b] of pairs) {
      const i = this.players.findIndex((q) => q.id === a); const j = this.players.findIndex((q) => q.id === b);
      [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
      this.players.forEach((q, k) => { q.seat = k + 1; });
    }
    this.record('st', `女舍监 ${this.tag(uid)} 让 ${pairs.map(([a, b]) => `${this.name(a)} 和 ${this.name(b)}`).join('、')} 交换座位${on ? '' : '（女舍监失效，没换）'}`);
    return on;
  },
  /** 女舍监在场：玩家不能离开座位私聊（线上：没有自由活动）。 */
  matronOn() { const m = this.travellerOf('matron'); return !!m && m.alive; },
  /** 主教在场（能力生效）：只有说书人能提名。 */
  bishopOn() { const b = this.travellerOf('bishop'); return !!b && this.travellerOn(b); },
  /** 屠夫：今天已经有过处决、他还能再提名一次。 */
  butcherReady() { const b = this.travellerOf('butcher'); return !!b && this.travellerOn(b) && this.butcherDay !== this.day ? b : null; },
  /** 侏儒加入时，说书人公开宣布一名与他同阵营的玩家（同伴）。 */
  gnomePickAmigo(p) {
    const mates = this.players.filter((q) => q.id !== p.id && !q.traveller && !q.left && q.alive && this.evilOf(q) === this.evilOf(p));
    if (!mates.length) return null;
    const a = mates[Math.floor((this.rng?.() ?? Math.random()) * mates.length)];
    p.gnomeAmigo = a.id;
    this.record('st', `侏儒 ${this.tag(p.id)} 的同伴是 ${this.tag(a.id)}`);
    return a;
  },
  /** 侏儒：同伴被提名时，可以杀死提名者（每次提名都能用）。 */
  gnomeKill(uid, nominatorId) {
    const p = this.get(uid);
    if (!p || p.role !== 'gnome' || !p.traveller || !p.alive) throw new Error('你不是侏儒');
    const n = this.get(nominatorId);
    if (!n || !this.visAlive(n)) throw new Error('提名者已经死了');
    if (!this.travellerOn(p)) { this.record('st', `侏儒 ${this.tag(uid)} 想杀 ${this.tag(nominatorId)}，但他失效了`); return false; }
    this.record('st', `侏儒 ${this.tag(uid)} 杀死了提名同伴的 ${this.tag(nominatorId)}`);
    if (this.engine === 'snv') this.snvDie(n, 'gnome', []);
    else if (this.script === 'bmr') this.bmrDie(n, 'gnome');
    else n.alive = false;
    this.checkWinner();
    return true;
  },

  /** 屠夫的第二次处决：照各引擎的处决结算（替罪羊、圣徒、精神病患者这些照常）。返回 'saved' 表示没死。 */
  butcherExecute(id) {
    const p = this.get(id);
    const r = this.engine === 'snv' ? this.executeSNV(p) : this.execute(p);
    this.checkWinner();
    return r === 'saved' || p.alive ? 'saved' : 'dead';
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
