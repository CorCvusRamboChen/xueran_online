// 《心理博弈》（Rochambeau v11，作者 Habby；2026-11-20 用户：按 v11 做）用到的 5 个新角色，口径照集石百科：
//   赏金猎人：首夜得知一名邪恶玩家；他得知的玩家死了，当晚再得知另一名。[一名镇民转为邪恶]
//   杂技演员：除首夜外每晚选一名玩家（死活、自己都行）：他当晚醉酒或中毒（选的时候还清醒、晚些才中毒也算），杂技演员死亡。
//   半兽人：除首夜外每晚选一名存活玩家：他是善良的就死，并且当晚恶魔不造成死亡。一名善良玩家始终被当作邪恶（失足）。
//   守夜人：每局限一次，夜里选一名玩家：他得知你是守夜人。
//   帽匠（外来者）：他死了（清醒健康时），当晚爪牙和恶魔可以换成剧本里另一个同类型的角色。
// 这些是混到 Game 上的方法（和 travellers.js 一样），夜晚的步骤在 snv.js 的 resolveNightSNV 里调。
import { ROLES } from './roles.js';

const team = (p) => ROLES[p?.role]?.team;

export const ROCHAMBEAU_METHODS = {
  /** 首夜开始：赏金猎人在场 → 一名镇民转成邪恶；半兽人在场 → 选一名善良玩家「失足」（始终被当作邪恶）。只做一次。 */
  rochSetup() {
    if (this.rochDone) return;
    this.rochDone = true;
    if (this.players.some((p) => p.role === 'bountyhunter')) {
      const pool = this.players.filter((p) => team(p) === 'townsfolk' && p.role !== 'bountyhunter' && !p.traveller && !this.evilOf(p));
      const t = pool.length ? this.st.choose('bhEvil', pool, {}) : null;
      if (t) { t.evil = true; this.bhEvilTf = t.id; this.record('st', `赏金猎人在场：${this.tag(t.id)} 是邪恶的镇民`); }
    }
    if (this.players.some((p) => p.role === 'lycanthrope')) {
      const pool = this.players.filter((p) => !this.evilOf(p) && !p.traveller);
      const t = pool.length ? this.st.choose('fauxPaw', pool, {}) : null;
      if (t) { this.fauxPaw = t.id; this.record('st', `半兽人在场：${this.tag(t.id)} 失足（始终被当作邪恶）`); }
    }
  },

  /** 首夜一开始就告诉被赏金猎人转成邪恶的镇民（他不知道其他邪恶玩家是谁）。 */
  rochEvilNews() {
    const t = this.bhEvilTf && this.get(this.bhEvilTf);
    if (!t) return [];
    return [{ playerId: t.id, text: '**你是邪恶阵营的。**赏金猎人在场，说书人把你这名镇民转成了邪恶：你的能力照常，但你和邪恶一起赢。你不知道其他邪恶玩家是谁，他们也不知道你。' }];
  },

  /** 失足的人现在还被当作邪恶吗（半兽人活着、没失效）。 */
  fauxPawOn(p) {
    return !!p && this.fauxPaw === p.id && this.players.some((q) => q.role === 'lycanthrope' && q.alive && !this.snvBroken(q));
  },

  /** 赏金猎人：首夜得知一名邪恶玩家；之后他得知的人死了，当晚再得知另一名（不重复）。失效时说书人给一名善良玩家。 */
  bountyStep(tell) {
    for (const p of this.holders('bountyhunter')) {
      const s = ((this.bh ??= {})[p.id] ??= { target: null, seen: [] });
      const cur = s.target && this.get(s.target);
      if (cur && (cur.alive || s.handled === cur.id)) continue; // 还活着；或者死了、已经换过（给的是死人就不再有新信息）
      if (cur) s.handled = cur.id;
      const off = this.snvBroken(p);
      const fresh = (q) => q.id !== p.id && !s.seen.includes(q.id);
      const evil = this.players.filter((q) => fresh(q) && this.evilOf(q));
      const alive = evil.filter((q) => q.alive);
      // 失效：给一名善良玩家；正常：给一名还活着的邪恶玩家，都死了就给死的（官方：给了死人他就不会再有新信息）
      const pool = off ? this.players.filter((q) => fresh(q) && !this.evilOf(q) && q.alive) : alive.length ? alive : evil;
      const t = pool.length ? this.st.choose(off ? 'bhFake' : 'bhPick', pool, { who: p.id }) : null;
      if (!t) continue;
      s.target = t.id; s.seen.push(t.id);
      if (off) this.flag(p, `赏金猎人失效：给的 ${this.name(t.id)} 是善良的`);
      tell(p, `你得知：**${this.name(t.id)}** 是邪恶的。（他死了以后，你会再得知另一名邪恶玩家。）`, `你得知了一名玩家：**${this.name(t.id)}**。`);
    }
  },

  /** 杂技演员：记下今晚选了谁；夜晚结束时看那人醉没醉、中没中毒（acrobatCheck）。 */
  acrobatStep() {
    this.acro = [];
    for (const p of this.holders('acrobat')) {
      const t = this.choiceOfSNV(p)?.targets?.[0];
      if (t) this.acro.push({ id: p.id, target: t.id, off: this.snvBroken(p) });
    }
  },
  acrobatCheck(messages) {
    for (const a of this.acro ?? []) {
      const p = this.get(a.id); const t = this.get(a.target);
      if (!p?.alive || !t) continue;
      if (a.off || this.snvBroken(p)) continue; // 杂技演员自己醉酒中毒：不会因自身能力死亡
      if (!this.snvBroken(t)) continue;
      this.record('st', `杂技演员 ${this.tag(p.id)} 选的 ${this.tag(t.id)} 今晚醉酒或中毒：杂技演员死亡`);
      this.snvDie(p, 'acrobat', messages);
    }
    this.acro = [];
  },

  /** 半兽人：选的存活玩家是善良的（按登记，失足的人算邪恶）就死，当晚恶魔不造成死亡。 */
  lycanStep(messages) {
    for (const p of this.holders('lycanthrope')) {
      const t = this.choiceOfSNV(p)?.targets?.[0];
      if (!t?.alive) continue;
      if (this.snvBroken(p)) { this.flag(p, `半兽人失效：${this.name(t.id)} 没有死`); continue; }
      if (this.seenEvil(t, '半兽人')) { this.record('st', `半兽人选了 ${this.tag(t.id)}：被当作邪恶，没有死`); continue; }
      if (this.snvKill(t, 'lycanthrope', messages) === 'died') { this.lycanNight = this.night; this.record('st', `半兽人杀死了 ${this.tag(t.id)}：今晚恶魔不造成死亡`); }
    }
  },

  /** 守夜人：每局一次，选的人得知谁是守夜人（失效时他不会被叫醒，能力照样用掉）。 */
  nightwatchStep(say) {
    for (const p of this.holders('nightwatchman')) {
      const t = this.choiceOfSNV(p)?.targets?.[0];
      if (!t) continue;
      this.used[p.id] = true;
      if (this.snvBroken(p)) { this.flag(p, `守夜人失效：${this.name(t.id)} 没有得知`); continue; }
      say(t, `说书人叫醒了你：**${this.name(p.id)}** 是**守夜人**。`);
      this.record('info', `守夜人 ${this.tag(p.id)} 让 ${this.tag(t.id)} 得知了自己是守夜人`);
    }
  },

  /** 帽匠死了（死的时候清醒健康）：记下哪一晚开茶会。白天死的是今晚，夜里死的是当晚。 */
  hatterDied(p) {
    if (this.abilityOf(p) !== 'hatter' || this.snvBroken(p)) return;
    this.hatterDue = this.phase === 'night' ? this.night : this.night + 1;
    this.record('st', `帽匠 ${this.tag(p.id)} 死了：今晚开茶会，爪牙和恶魔可以换角色`);
  },

  /**
   * 帽匠的茶会：一个个叫醒活着的爪牙和恶魔，每人可以换成剧本里另一个同类型、不在场的角色，也可以不换（结算停一次，等他选）。
   * 新恶魔当晚不再杀人（茶会在恶魔行动之后）。
   */
  hatterStep(i, messages, say) {
    if (this.hatterDue !== this.night) return null;
    let h = this.hatterNight?.night === this.night ? this.hatterNight : null;
    if (!h) {
      const ids = this.players.filter((q) => q.alive && !q.traveller && ['minion', 'demon'].includes(team(q))).map((q) => q.id);
      h = this.hatterNight = { night: this.night, ids, idx: 0, asked: null, saved: {} };
    }
    while (h.idx < h.ids.length) {
      const id = h.ids[h.idx];
      const p = this.get(id);
      if (h.asked === id) {
        const c = this.choices[id];
        const pick = c?.role ?? null;
        if (id in h.saved) this.choices[id] = h.saved[id]; else delete this.choices[id];
        h.asked = null; h.idx += 1;
        if (pick && pick !== p.role && ROLES[pick]?.team === team(p) && !this.players.some((q) => q.role === pick)) {
          const was = p.role;
          this.changeRole(p, pick);
          say(p, `**帽匠的茶会**：你现在是 **${ROLES[pick].name}**。原来${ROLES[was].name}的能力不再生效。`);
          this.record('st', `帽匠的茶会：${this.name(id)} 从${ROLES[was].name}换成了${ROLES[pick].name}`);
        } else this.record('choice', `帽匠的茶会：${this.tag(id)} 不换角色`);
        continue;
      }
      if (!p?.alive) { h.idx += 1; continue; }
      if (this.choices[id]) h.saved[id] = this.choices[id];
      delete this.choices[id];
      h.asked = id;
      this.midNight = { step: i, who: id, as: 'hatter_pick', messages: [] };
      this.flushed = messages.splice(0);
      return 'pause';
    }
    this.hatterDue = null;
    return null;
  },
};
