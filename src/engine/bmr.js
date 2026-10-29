// 血染钟楼 · 黯月初升（Bad Moon Rising）的规则。作为方法混进 Game（game.js 在 script === 'bmr' 时调用这里）。
// 规则口径见 .claude/skills/botc-storyteller/references/bad-moon-rising.md。
//
// 状态模型：
// · 醉酒/中毒/保护都是"效果" this.fx：{ kind, target, source, until, why }
//     kind：drunk 醉酒 / poison 中毒 / safe 当晚不会死（旅店老板）/ exeSafe 明天被处决不死（魔鬼代言人）
//     until：在第几天的黄昏结束（数字）；'dawn' 黎明结束；'never' 一直持续（普卡的毒，直到毒发）
//   效果只在来源活着、而且来源自己没醉酒中毒时生效（来源失效 → 效果立即停；恢复 → 效果恢复）。循环醉酒时一起生效。
// · 阵营 p.evil（莽夫会变）；僵怖首次死亡后 p.apparentDead = true（活着但被当作死亡）。
// · 白天的标记：diedToday（僵怖）、outsiderDiedToday（教父）、gossipPending（造谣者）、moonchildPick（月之子）。

import { ROLES, isEvilRole, rolesOf, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS } from './roles.js';
import { BMR_STEPS } from '../shared/nightOrder.js';

const team = (p) => ROLES[p.role].team;
const shuffle = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);
const pickOne = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const T = { tf: rolesOf('bmr', 'townsfolk'), out: rolesOf('bmr', 'outsider'), min: rolesOf('bmr', 'minion'), dem: rolesOf('bmr', 'demon') };

/**
 * 恶魔的 3 个伪装（不在场的善良角色）。官方只说"三个不在场的善良角色"，没规定镇民 / 外来者怎么配；
 * 说书人的常见做法是以镇民为主：外来者伪装最多一个（大约三分之一的局有）。7 人这种本来 0 外来者的局，
 * 冒充外来者只有在"教父多出一个外来者"时说得通，给两个就等于废掉两个伪装（爪牙也共用这三个，整队都被坑）。
 * exclude：不能给的角色（在场的、疯子自己）。
 */
export function pickBluffsBMR(exclude, rng) {
  const tf = shuffle(T.tf.filter((r) => !exclude.has(r)), rng);
  const out = shuffle(T.out.filter((r) => !exclude.has(r)), rng);
  const k = out.length && rng() < 0.35 ? 1 : 0;
  const pick = [...tf.slice(0, 3 - k), ...out.slice(0, k)];
  if (pick.length < 3) pick.push(...out.slice(k, k + 3 - pick.length)); // 镇民不够（几乎不会）才多补外来者
  return shuffle(pick, rng);
}

/** 黯月初升按人数随机出一套角色。教父 ±1 外来者（外来者为 0 时只能 +1）。exclude：这些角色不出。 */
export function rollBMR(n, rng, { godfatherPlus = null, exclude = null } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`人数需在 ${MIN_PLAYERS}–${MAX_PLAYERS} 之间`);
  let [t, o, m] = DISTRIBUTION[n];
  const ok = (r) => !exclude?.has(r);
  const minions = sample(T.min.filter(ok), m, rng);
  if (minions.includes('godfather')) {
    const plus = o === 0 ? true : godfatherPlus ?? rng() < 0.5;
    if (plus) { t -= 1; o += 1; } else { t += 1; o -= 1; }
  }
  return shuffle([...sample(T.tf.filter(ok), t, rng), ...sample(T.out.filter(ok), o, rng), ...minions, pickOne(T.dem.filter(ok), rng)], rng);
}

// ───────────── AI 配板：别发出一边倒的局 ─────────────
// 官方的做法是说书人亲手挑角色（不是随机）；官方说明还点名：5–6 人的黯月初升里，沙巴洛斯、莽夫会让一方占不公平的便宜。
// 下面的分数是经验估计（官方没有公式）：正数 = 对善良有利，负数 = 对邪恶有利。只用来比较同人数的几套配板。

/** 小局（5–6 人）不随机出的角色（房主手动指定的照给）。 */
export const SMALL_GAME_AVOID = new Set(['shabaloth', 'goon']);

const DEMON_W = { shabaloth: 3.2, po: 2.6, zombuul: 2.6, pukka: 2.0 }; // 沙巴洛斯最强（每晚稳定两刀），普卡最慢（毒发要等一晚）
const MINION_W = { assassin: 2.0, godfather: 1.8, devilsadvocate: 1.4, mastermind: 1.0 };
const GOOD_W = {
  // 防住恶魔 / 抓恶魔
  sailor: 1.4, innkeeper: 1.4, tealady: 1.2, fool: 1.0, pacifist: 1.0, exorcist: 1.5, courtier: 1.5, professor: 1.4, minstrel: 1.0,
  // 信息
  grandmother: 0.8, chambermaid: 0.9, gossip: 0.9, gambler: 0.5,
  // 外来者：对善良是负担
  tinker: -0.6, moonchild: -0.4, goon: -0.4, lunatic: -0.3,
};
const PROTECT = new Set(['sailor', 'innkeeper', 'tealady', 'fool', 'pacifist']);

/** 一套配板的平衡分：善良的分减邪恶的分，再算几个配合（刺客无视保护；多刀的恶魔更怕保护）。 */
export function setupScore(roles) {
  let good = 0; let evil = 0;
  for (const r of roles) { good += GOOD_W[r] ?? 0; evil += MINION_W[r] ?? DEMON_W[r] ?? 0; }
  const prot = roles.filter((r) => PROTECT.has(r)).length;
  if (roles.includes('assassin')) good -= prot * 0.3;
  if (roles.includes('shabaloth') || roles.includes('po')) good += prot * 0.2;
  return Math.round((good - evil) * 100) / 100;
}

/**
 * 保护角色别扎堆（12 人及以下）：水手、旅店老板、茶艺师挡夜里的刀，弄臣、和平主义者挡一次死亡。
 * 官方没有硬规定，思路是让邪恶的杀伤力（多杀的恶魔、无视保护的刺客、教父……）去对冲保护；可人少时刀不够用，
 * 三四个保护同时在场恶魔几乎杀不死人。这里按概率"接受"一套配板：两个保护一半概率接受（有刺客、沙巴洛斯、珀这种能破保护的就照常），
 * 三个及以上很少接受。13 人以上照常。
 */
export function protectKeep(roles, n) {
  if (n > 12) return 1;
  const prot = roles.filter((r) => PROTECT.has(r)).length;
  if (prot <= 1) return 1;
  const breaker = roles.some((r) => ['assassin', 'shabaloth', 'po'].includes(r));
  if (prot === 2) return breaker ? 1 : 0.5;
  if (prot === 3) return breaker ? 0.08 : 0.03;
  return 0.01;
}

/**
 * AI 说书人配板：一次随机出 tries 套，按平衡分排好，去掉两头最偏的（对善良太有利 / 对邪恶太有利），从中间那段里随机挑一套。
 * 5–6 人不出沙巴洛斯、莽夫。12 人及以下保护角色别扎堆（见 protectKeep）。返回按座位顺序的角色。
 */
export function balancedBMR(n, rng, { tries = 60 } = {}) {
  const exclude = n <= 6 ? SMALL_GAME_AVOID : null;
  const roll = () => {
    for (let k = 0; k < 40; k++) { const r = rollBMR(n, rng, { exclude }); if (rng() < protectKeep(r, n)) return r; }
    return rollBMR(n, rng, { exclude });
  };
  const cands = Array.from({ length: tries }, roll).map((roles) => ({ roles, s: setupScore(roles) })).sort((a, b) => a.s - b.s);
  const lo = Math.floor(tries * 0.3); const hi = Math.max(lo + 1, Math.ceil(tries * 0.7));
  return cands[lo + Math.floor(rng() * (hi - lo))].roles;
}

// 夜晚步骤（官方顺序）。info：首夜只给信息、不选人的步骤
// 夜晚步骤的顺序和前端「角色 → 夜间顺序」的说明是同一份（shared/nightOrder.js）
const FIRST_STEPS = BMR_STEPS.first;
const OTHER_STEPS = BMR_STEPS.other;
const DEMON_ROLES = new Set(T.dem);

export const BMR_METHODS = {
  // ───────────────────────── 开局 ─────────────────────────
  setupBMR(players, roles, rng) {
    const assigned = roles ?? balancedBMR(players.length, rng);
    if (assigned.length !== players.length) throw new Error('角色数量与玩家数量不符');
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, seat: i + 1, role: assigned[i], shownRole: assigned[i],
      alive: true, ghostVote: true, evil: isEvilRole(assigned[i]), apparentDead: false,
    }));
    const demon = this.players.find((p) => DEMON_ROLES.has(p.role));
    // 疯子以为自己是恶魔：一半概率和真恶魔同种
    const lunatic = this.players.find((p) => p.role === 'lunatic');
    if (lunatic) lunatic.shownRole = rng() < 0.5 ? demon.role : pickOne(T.dem.filter((r) => r !== demon.role), rng);
    const inPlay = new Set(assigned);
    this.bluffs = pickBluffsBMR(inPlay, rng);
    this.fx = [];
    this.used = {};        // 每局一次的能力用过了：id → true（侍臣、教授、刺客、弄臣）
    this.lastPick = {};    // 上一夜选过谁（驱魔人、魔鬼代言人）：id → targetId
    this.pukkaVictim = null;
    this.poCharged = false;
    this.shabaLast = [];
    this.grandchild = null;
    this.gossipPending = false;
    this.gossipSaid = {};  // 今天谁发表过声明（每人每天一次）
    this.moonchildPick = null;
    this.pendingMoonchild = null;
    this.diedToday = false;
    this.outsiderDiedToday = false;
    this.mastermindDay = null;
    this.demonExecuted = false;
    this.redHerring = null;
    this.firstDemon = demon?.id ?? null;
  },

  // ───────────────────────── 状态查询 ─────────────────────────
  evilOf(p) { return p.evil ?? isEvilRole(p.role); },
  visAlive(p) { return p.alive && !p.apparentDead; },
  /**
   * 房规 lunaticGhost（默认关，官方规则是"死了就失去能力"，死了的疯子不再醒）：
   * 疯子以为自己是僵怖、已经死过一次：在他看来这就是僵怖的"假死"，之后没人死的夜里照样叫醒他选人（选了也没效果，
   * 真恶魔照常知道他选了谁），维持假象；死后再被处决一次（他以为的"第二次死亡"）才不再叫醒。他是真的死了，不算活人。
   */
  ghostLunatic(p) { return !!p && p.role === 'lunatic' && !p.alive && !!p.lunaticGhost; },
  /** 第一次"死亡"时私下告诉僵怖（或以为自己是僵怖的疯子）：你还在场。白天死的等入夜再说。 */
  zombuulNote(p, messages) {
    const m = { playerId: p.id, text: '你第一次死亡了——但僵怖并没有真的死：大家看到你死了，你仍在场。之后每个白天没人死亡的夜里，你照样醒来杀人；再死一次才是真的死亡。' };
    if (this.phase === 'night') messages.push(m); else (this.evilMessages ??= []).push(m);
  },

  /** 醉酒或中毒（能力失效）。循环醉酒时一起生效。 */
  bmrBroken(p, seen = new Set()) {
    if (!p) return false;
    const next = new Set(seen); next.add(p.id);
    return this.fx.some((f) => (f.kind === 'drunk' || f.kind === 'poison') && f.target === p.id && this.fxLive(f, next));
  },
  /** 效果是否生效：来源活着、来源没醉酒中毒（循环时算生效）。 */
  fxLive(f, seen = new Set()) {
    const src = this.get(f.source);
    if (!src) return true;
    if (!src.alive) return false;
    if (seen.has(src.id)) return true;
    return !this.bmrBroken(src, seen);
  },
  addFx(kind, target, source, until, why) {
    if (!target) return;
    this.fx.push({ kind, target, source, until, why });
    this.record('st', `${why}：${this.tag(target)} ${{ drunk: '醉酒', poison: '中毒', safe: '今晚不会死', exeSafe: '明天被处决不会死' }[kind]}`);
  },

  /** 茶艺师两侧最近的存活玩家（被当作死亡的僵怖不算）。 */
  visNeighbours(p) {
    const n = this.players.length; const res = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = this.players[(p.seat - 1 + dir * k + n * k) % n];
        if (q.id === p.id) break;
        if (this.visAlive(q)) { res.push(q); break; }
      }
    }
    return res.length === 2 && res[0].id === res[1].id ? [res[0]] : res;
  },

  /** p 现在为什么不会死（返回原因，或 null）。cause：execution / assassin / 其他。 */
  protection(p, cause) {
    if (cause === 'assassin') return null;
    if (p.role === 'sailor' && !this.bmrBroken(p)) return '水手';
    if (this.phase === 'night' && this.fx.some((f) => f.kind === 'safe' && f.target === p.id && this.fxLive(f))) return '旅店老板';
    for (const t of this.players.filter((q) => q.role === 'tealady' && q.alive && !this.bmrBroken(q))) {
      const nb = this.visNeighbours(t);
      if (nb.length === 2 && nb.every((q) => !this.evilOf(q)) && nb.some((q) => q.id === p.id)) return '茶艺师';
    }
    if (cause === 'execution' && this.fx.some((f) => f.kind === 'exeSafe' && f.target === p.id && this.fxLive(f))) return '魔鬼代言人';
    return null;
  },

  /** 尝试杀死 p：先看各种免死，再看弄臣、僵怖。返回 died / saved / fake（僵怖假死）/ already。 */
  tryKill(p, cause, messages = []) {
    if (!p || !p.alive) return 'already';
    // 被当作死亡的僵怖第二次死亡（不论什么原因：处决、刺客、教父、月之子……）就真的死了（官方）
    const prot = this.protection(p, cause);
    if (prot) { this.record('st', `${this.tag(p.id)} 因${prot}没有死（${cause}）`); return 'saved'; }
    if (cause === 'execution' && !this.evilOf(p)) {
      const pac = this.players.find((q) => q.role === 'pacifist' && q.alive && !this.bmrBroken(q));
      if (pac && this.st.pacifistSaves(p)) { this.record('st', `和平主义者：被处决的善良玩家 ${this.tag(p.id)} 没有死`); return 'saved'; }
    }
    if (p.role === 'fool' && cause !== 'assassin' && !this.used[p.id] && !this.bmrBroken(p)) {
      this.used[p.id] = true;
      this.record('st', `弄臣 ${this.tag(p.id)} 第一次将要死亡，没有死（能力用掉）`);
      return 'saved';
    }
    if (p.role === 'zombuul' && !p.apparentDead && !this.bmrBroken(p)) {
      p.apparentDead = true;
      if (this.phase === 'night') this.nightDeaths.push(p.id);
      else this.diedToday = true;
      this.record('death', `${this.tag(p.id)} 第一次死亡——僵怖仍然活着，但被当作死亡`);
      this.zombuulNote(p, messages);
      return 'fake';
    }
    this.bmrDie(p, cause, messages);
    return 'died';
  },

  /** 真的死亡。 */
  bmrDie(p, cause, messages = []) {
    p.alive = false;
    p.apparentDead = false;
    if (this.phase === 'night') this.nightDeaths.push(p.id);
    else {
      this.diedToday = true;
      if (team(p) === 'outsider') this.outsiderDiedToday = true;
    }
    const why = {
      demon: '被恶魔杀死', execution: '被处决', assassin: '被刺客刺杀', godfather: '被教父杀死', gambler: '赌错了角色',
      gossip: '因造谣者的声明而死', tinker: '修补匠突然死亡', moonchild: '被月之子带走', grandmother: '孙子被恶魔杀死，祖母随之而去', storyteller: '说书人判定死亡',
    }[cause] ?? cause;
    this.log.push(`${this.name(p.id)} 死亡（${cause}）`);
    this.record('death', `${this.tag(p.id)} ${why}`);
    if (DEMON_ROLES.has(p.role) && cause === 'execution') this.demonExecuted = true;
    if (this.lunaticGhost && p.role === 'lunatic' && p.shownRole === 'zombuul' && !p.lunaticGhostUsed) {
      p.lunaticGhost = true; p.lunaticGhostUsed = true;
      this.record('st', `疯子 ${this.tag(p.id)} 以为自己是僵怖：在他看来这是"假死"，之后没人死的夜里照样叫醒他（选了也没效果）`);
      this.zombuulNote(p, messages);
    }
    // 月之子得知自己死亡：要公开选一名存活玩家
    if (p.role === 'moonchild') this.pendingMoonchild = p.id;
    // 祖母：孙子被恶魔杀死，祖母一起死（她自己清醒时）
    if (cause === 'demon' && p.id === this.grandchild) {
      const gm = this.players.find((q) => q.role === 'grandmother' && q.alive && !this.bmrBroken(q));
      if (gm) this.tryKill(gm, 'grandmother', messages);
    }
  },

  revive(p, why) {
    if (!p || p.alive) return;
    p.alive = true; p.ghostVote = true; p.apparentDead = false; p.lunaticGhost = false;
    delete this.used[p.id];
    this.nightRevived.push(p.id);
    this.record('death', `${this.tag(p.id)} 复活了（${why}）`);
  },

  // ───────────────────────── 夜晚 ─────────────────────────
  startNightBMR() {
    this.wokeTonight = new Set();
    this.goonHit = false;
    this.blocked = null;
    this.nightRevived = [];
    this.lunaticPicks = null;
  },

  /** 首夜的爪牙/恶魔信息（含疯子）。 */
  evilInfoBMR() {
    const messages = [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    const demon = this.players.find((p) => DEMON_ROLES.has(p.role));
    const minions = this.players.filter((p) => team(p) === 'minion');
    const lunatic = this.players.find((p) => p.role === 'lunatic');
    if (this.evilInfo) {
      this.evilKnown = this.knownMap();
      for (const m of minions) {
        const mates = minions.filter((x) => x.id !== m.id).map((x) => this.name(x.id));
        say(m, `恶魔是 **${this.name(demon.id)}**。${mates.length ? `其他爪牙：${mates.join('、')}。` : ''}`);
      }
      // 疯子以为自己是恶魔：给他"爪牙"（人数对，但可以是任何人）和三个"伪装"
      if (lunatic) {
        const fake = sample(this.players.filter((q) => q.id !== lunatic.id), minions.length, this.rng);
        const fakeBluffs = pickBluffsBMR(new Set(['lunatic']), this.rng); // 和真恶魔拿到的同一个样子，疯子看不出破绽
        say(lunatic, `你的爪牙：${fake.map((x) => `**${this.name(x.id)}**`).join('、')}。\n不在场的角色（可用来伪装）：${fakeBluffs.map((r) => ROLES[r].name).join('、')}。`);
        // 界面上也要和真恶魔一模一样：座位圈上"爪牙"的红框、爪牙名单、3 张伪装卡（见 room.js 的 self 视图）
        this.lunaticFake = { id: lunatic.id, allies: fake.map((x) => x.id), bluffs: fakeBluffs, shared: false };
        this.record('info', `疯子 ${this.tag(lunatic.id)} 以为自己是${ROLES[lunatic.shownRole].name}，拿到的"爪牙"：${fake.map((x) => this.name(x.id)).join('、')}`);
      }
      say(demon, `你的爪牙：${minions.map((x) => `**${this.name(x.id)}**`).join('、')}。\n不在场的角色（可用来伪装）：${this.bluffs.map((r) => ROLES[r].name).join('、')}。`);
    }
    // 恶魔知道谁是疯子（人数少于 7 也告诉他）
    if (lunatic) say(demon, `**${this.name(lunatic.id)}** 是疯子：他以为自己是${ROLES[lunatic.shownRole].name}。每晚他选了谁，你都会知道。`);
    return messages;
  },

  /** 这个人今晚按什么角色行动（疯子按他以为的恶魔）。 */
  actsAs(p) { return p.role === 'lunatic' ? p.shownRole : p.role; },

  nightPromptsBMR() {
    const first = this.night === 1;
    const out = [];
    const anyDead = this.players.some((q) => !this.visAlive(q));
    const lunatic = this.players.find((q) => q.role === 'lunatic' && (q.alive || this.ghostLunatic(q)));
    for (const p of [...this.alive(), ...this.players.filter((q) => this.ghostLunatic(q))]) {
      if (p.apparentDead && p.role !== 'zombuul') continue;
      const role = this.actsAs(p);
      const spec = ROLES[role].choose;
      if (!spec) continue;
      if (first ? !ROLES[role].firstNight : !ROLES[role].otherNight) continue;
      if (spec.once && this.used[p.id]) continue;
      if (role === 'zombuul' && this.diedToday) continue;
      if (role === 'godfather' && (first || !this.outsiderDiedToday)) continue;
      if (role === 'professor' && !anyDead) continue;
      let count = spec.count; let optional = !!spec.optional;
      if (role === 'po') {
        const charged = p.role === 'lunatic' ? !!this.used[`po-${p.id}`] : this.poCharged;
        count = charged ? 3 : 1; optional = !charged;
      }
      const last = this.lastPick[p.id];
      const options = this.players.filter((q) => {
        if (spec.notSelf && q.id === p.id) return false;
        if (spec.alive && !this.visAlive(q)) return false;
        if (spec.dead && this.visAlive(q)) return false;
        if (spec.notLast && q.id === last) return false;
        return true;
      }).map((q) => q.id);
      // 真恶魔要等疯子先选完（恶魔得知疯子选了谁再行动）
      const waiting = DEMON_ROLES.has(p.role) && lunatic && lunatic.id !== p.id && !this.choices[lunatic.id] && this.lunaticActs(lunatic);
      out.push({ playerId: p.id, role, count, options, optional, pickRole: !!spec.role, roleOptions: spec.role ? rolesOf('bmr') : null, waiting: !!waiting });
    }
    if (this.midNight) return out.filter((x) => x.playerId === this.midNight.revived).map((x) => ({ ...x, waiting: false }));
    return out;
  },
  lunaticActs(l) {
    const r = l.shownRole; const first = this.night === 1;
    if (first ? !ROLES[r].firstNight : !ROLES[r].otherNight) return false;
    if (r === 'zombuul' && this.diedToday) return false;
    return true;
  },

  /** 收一个选择。返回要马上告诉别人的信息（疯子选完 → 告诉恶魔）。 */
  submitChoiceBMR(playerId, targets, extra = {}) {
    const pr = this.nightPromptsBMR().find((x) => x.playerId === playerId);
    if (!pr) throw new Error('你今晚不需要选择');
    if (pr.waiting) throw new Error('还要等一会儿');
    // 只有能力写着"可以"的（每局一次的侍臣、教授、刺客，没蓄力的珀）才能今晚不用；其余都是"你要选择"（官方），不能空过
    const cantPick = pr.options.length < pr.count; // 可选的人不够（比如活人太少）：只能不选
    if (targets.length === 0 && !pr.optional && !cantPick && !(pr.pickRole && extra.role)) throw new Error(pr.role === 'po' ? '上次没选人：这次必须选三名玩家' : `需要选择 ${pr.count} 名玩家`);
    const skip = targets.length === 0 && (pr.optional || cantPick) && !(pr.pickRole && extra.role);
    if (!skip) {
      if (targets.length !== pr.count || new Set(targets).size !== targets.length) throw new Error(`需要选择 ${pr.count} 名不同的玩家`);
      if (!targets.every((t) => pr.options.includes(t))) throw new Error('选择了不可选的玩家');
      if (pr.pickRole && !pr.roleOptions.includes(extra.role)) throw new Error('还要选一个角色');
    }
    this.choices[playerId] = skip ? { targets: [], role: null } : { targets, role: pr.pickRole ? extra.role : null };
    const p = this.get(playerId);
    const msgs = [];
    if (p.role === 'lunatic') {
      const demon = this.players.find((q) => DEMON_ROLES.has(q.role) && q.alive);
      if (demon) msgs.push({ playerId: demon.id, text: `疯子 ${this.name(p.id)} 今晚${skip ? '没有选人' : `选了：${targets.map((t) => this.name(t)).join('、')}`}。` });
      this.lunaticPicks = targets;
    }
    return msgs;
  },

  autoChooseBMR(playerId) {
    const pr = this.nightPromptsBMR().find((x) => x.playerId === playerId);
    if (!pr || pr.waiting) return;
    const p = this.get(playerId);
    // 每局一次的能力：机器人前几晚多半先不用
    if (pr.optional && pr.role !== 'po' && this.rng() < (pr.role === 'courtier' ? 0.6 : 0.5)) { this.choices[playerId] = { targets: [], role: null }; return; }
    let opts = pr.options;
    if (DEMON_ROLES.has(pr.role) || ['assassin', 'godfather'].includes(pr.role)) {
      const prey = opts.filter((id) => !this.evilOf(this.get(id)) && this.visAlive(this.get(id)));
      if (prey.length >= pr.count) opts = prey;
    }
    const targets = sample(opts, pr.count, this.rng);
    const role = pr.pickRole ? pickOne(pr.roleOptions.filter((r) => r !== p.role), this.rng) : null;
    this.choices[playerId] = { targets, role };
  },

  /** 第一个用自己的能力选中莽夫的人醉酒，莽夫转成他的阵营。返回这次选择还有没有效。 */
  goonCheck(selector, target, { assassin = false } = {}) {
    if (!target || target.role !== 'goon' || target.id === selector.id || this.goonHit || !target.alive || this.bmrBroken(target)) return;
    this.goonHit = true;
    if (!assassin) this.addFx('drunk', selector.id, target.id, this.night, '莽夫');
    const was = this.evilOf(target);
    target.evil = this.evilOf(selector);
    if (was !== target.evil) this.pendingGoonNews = target.id;
  },

  choiceOf(p) { const c = this.choices[p.id]; return c ? { targets: (c.targets ?? []).map((id) => this.get(id)), role: c.role ?? null } : null; },

  /**
   * 夜晚结算。夜里有人被复活（教授、沙巴洛斯反刍），而他的角色在夜晚顺序里还没轮到：官方是当晚照常唤醒他行动
   * （中毒醉酒也照样醒，只是能力不生效）。这时结算停在这一步，返回 { pause: 他的 id }；服务器让他选完后再调一次
   * resolveNight()，从下一步接着结算（this.midNight 记着停在哪、已经攒下的信息、今晚谁醒过）。
   */
  resolveNightBMR() {
    const mid = this.midNight ?? null;
    this.midNight = null;
    const messages = mid?.messages ?? [];
    const say = (p, text) => messages.push({ playerId: p.id, text });
    const first = this.night === 1;
    const prompted = new Set(this.nightPromptsBMR().map((x) => x.playerId));
    const live = (role) => this.players.filter((q) => q.role === role && ((q.alive && !q.apparentDead) || this.ghostLunatic(q)));
    const broken = (p) => this.bmrBroken(p);
    if (mid) { for (const id of mid.woke ?? []) this.wokeTonight.add(id); } else this.pendingGoonNews = null;
    const steps = first ? FIRST_STEPS : OTHER_STEPS;

    for (let i = mid?.step ?? 0; i < steps.length; i++) {
      const step = steps[i];
      const revivedBefore = this.nightRevived.length;
      switch (step) {
        case 'sailor': for (const p of live('sailor')) {
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0]; if (!t) break;
          this.goonCheck(p, t);
          if (broken(p)) break;
          const who = t.id === p.id ? p : this.st.sailorDrunk(p, t);
          this.addFx('drunk', who.id, p.id, this.night, '水手');
        } break;
        case 'innkeeper': for (const p of live('innkeeper')) {
          this.wokeTonight.add(p.id);
          const ts = this.choiceOf(p)?.targets ?? [];
          for (const t of ts) this.goonCheck(p, t);
          if (broken(p) || ts.length < 2) break;
          for (const t of ts) this.addFx('safe', t.id, p.id, 'dawn', '旅店老板');
          this.addFx('drunk', this.st.innkeeperDrunk(ts).id, p.id, this.night, '旅店老板');
        } break;
        case 'courtier': for (const p of live('courtier')) {
          if (!prompted.has(p.id)) break;
          this.wokeTonight.add(p.id);
          const c = this.choiceOf(p); if (!c?.role) break;
          this.used[p.id] = true;
          const holders = this.players.filter((q) => q.role === c.role);
          if (c.role === 'goon' && holders[0]) this.goonCheck(p, holders[0]);
          this.record('choice', `${this.tag(p.id)} 选择了角色 ${ROLES[c.role].name}`);
          if (broken(p) || !holders.length) break;
          this.addFx('drunk', pickOne(holders, this.rng).id, p.id, this.night + 2, '侍臣');
        } break;
        case 'gambler': for (const p of live('gambler')) {
          this.wokeTonight.add(p.id);
          const c = this.choiceOf(p); const t = c?.targets[0]; if (!t || !c.role) break;
          this.goonCheck(p, t);
          this.record('choice', `${this.tag(p.id)} 猜 ${this.tag(t.id)} 是${ROLES[c.role].name}`);
          if (broken(p)) break;
          if (t.role !== c.role) this.tryKill(p, 'gambler', messages);
        } break;
        case 'devilsadvocate': for (const p of live('devilsadvocate')) {
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0];
          this.lastPick[p.id] = t?.id ?? null; // 今晚没选：下一晚不受"不能和上一晚相同"限制
          if (!t) break;
          this.goonCheck(p, t);
          this.fx = this.fx.filter((f) => !(f.kind === 'exeSafe' && f.source === p.id));
          if (!broken(p)) this.addFx('exeSafe', t.id, p.id, this.night, '魔鬼代言人');
        } break;
        case 'lunatic': for (const p of live('lunatic')) {
          if (!prompted.has(p.id)) break;
          this.wokeTonight.add(p.id);
          const ts = this.choiceOf(p)?.targets ?? [];
          if (p.shownRole === 'po') this.used[`po-${p.id}`] = ts.length === 0;
          this.record('choice', `疯子 ${this.tag(p.id)} 以为自己在行动，选了 ${ts.map((q) => this.name(q.id)).join('、') || '没有人'}（没有效果）`);
        } break;
        case 'exorcist': for (const p of live('exorcist')) {
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0];
          this.lastPick[p.id] = t?.id ?? null;
          if (!t) break;
          this.goonCheck(p, t);
          if (broken(p) || !DEMON_ROLES.has(t.role) || !t.alive) break;
          this.blocked = t.id;
          say(t, `驱魔人 **${this.name(p.id)}** 选中了你——你今晚不能行动。`);
          this.record('st', `驱魔人选中了恶魔 ${this.tag(t.id)}，恶魔今晚不能行动`);
        } break;
        case 'zombuul': for (const p of this.players.filter((q) => q.role === 'zombuul' && q.alive)) {
          if (this.blocked === p.id || this.diedToday) break;
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0]; if (!t) break;
          this.goonCheck(p, t);
          if (!broken(p)) this.tryKill(t, 'demon', messages);
        } break;
        case 'pukka': for (const p of live('pukka')) {
          const prev = this.pukkaVictim ? this.get(this.pukkaVictim) : null;
          let fresh = null;
          if (this.blocked !== p.id) {
            this.wokeTonight.add(p.id);
            const t = this.choiceOf(p)?.targets[0];
            if (t) this.goonCheck(p, t);
            if (t && !broken(p)) { this.addFx('poison', t.id, p.id, 'never', '普卡'); fresh = t; }
          }
          // 普卡醉酒中毒：链条冻结（上一个中毒者今晚不死，也不换人）
          if (broken(p)) break;
          // 选完之后，上一个中毒者死亡并恢复健康（被保护就只恢复健康）
          // 官方：上一个中毒者"死亡，然后恢复健康"——死的那一刻还中着毒（被毒的弄臣、水手救不了自己）
          if (prev) {
            this.tryKill(prev, 'demon', messages);
            if (prev.id !== fresh?.id) this.fx = this.fx.filter((x) => !(x.kind === 'poison' && x.source === p.id && x.target === prev.id));
          }
          this.pukkaVictim = fresh?.id ?? null; // 毒到死人也记下：下次轮到普卡时照样把毒清掉（不然被复活后永久中毒）
        } break;
        case 'shabaloth': for (const p of live('shabaloth')) {
          // 反刍：上一夜被选过、现在死了的人之一（说书人决定）
          if (!broken(p)) {
            const cands = this.shabaLast.map((id) => this.get(id)).filter((q) => q && !q.alive);
            const back = this.st.shabaRegurgitate(cands);
            if (back) { this.revive(back, '沙巴洛斯反刍'); if (back.role === 'grandmother') this.grandmotherInfo(back, say); }
          }
          if (this.blocked === p.id) { this.shabaLast = []; break; }
          this.wokeTonight.add(p.id);
          const ts = this.choiceOf(p)?.targets ?? [];
          this.shabaLast = ts.map((q) => q.id);
          for (const t of ts) { this.goonCheck(p, t); if (!broken(p)) this.tryKill(t, 'demon', messages); }
        } break;
        case 'po': for (const p of live('po')) {
          if (this.blocked === p.id) break;
          this.wokeTonight.add(p.id);
          const ts = this.choiceOf(p)?.targets ?? [];
          if (!ts.length) { this.poCharged = true; this.record('st', '珀今晚没有选人——下次可以杀三人'); break; }
          this.poCharged = false;
          for (const t of ts) { this.goonCheck(p, t); if (!broken(p)) this.tryKill(t, 'demon', messages); }
        } break;
        case 'assassin': for (const p of live('assassin')) {
          if (!prompted.has(p.id)) break;
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0]; if (!t) break;
          this.used[p.id] = true;
          this.goonCheck(p, t, { assassin: true });
          if (!broken(p)) this.tryKill(t, 'assassin', messages);
        } break;
        case 'godfatherInfo': for (const p of live('godfather')) {
          this.wokeTonight.add(p.id);
          let outs = this.players.filter((q) => team(q) === 'outsider').map((q) => ROLES[q.role].name);
          if (broken(p)) outs = this.st.fakeOutsidersBMR(p, outs).map((r) => ROLES[r].name);
          say(p, outs.length ? `在场的外来者：**${outs.join('、')}**。` : '场上**没有**外来者。');
        } break;
        case 'godfather': for (const p of live('godfather')) {
          if (!prompted.has(p.id)) break;
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0]; if (!t) break;
          this.goonCheck(p, t);
          if (!broken(p)) this.tryKill(t, 'godfather', messages);
        } break;
        case 'professor': for (const p of live('professor')) {
          if (!prompted.has(p.id)) break;
          this.wokeTonight.add(p.id);
          const t = this.choiceOf(p)?.targets[0]; if (!t) break;
          if (t.alive) { this.record('st', `教授选的 ${this.tag(t.id)} 已经活着（刚被反刍）——不算用掉，以后还能用`); break; }
          this.used[p.id] = true;
          if (broken(p) || team(t) !== 'townsfolk') { this.record('st', `教授选了 ${this.tag(t.id)}——没有复活`); break; }
          this.revive(t, '教授');
          if (t.role === 'grandmother') this.grandmotherInfo(t, say);
        } break;
        case 'gossip': {
          const g = this.players.find((q) => q.role === 'gossip' && q.alive);
          if (this.gossipPending && g && !broken(g)) {
            const v = this.st.gossipVictim();
            if (v) this.tryKill(v, 'gossip', messages);
          }
          this.gossipPending = false;
        } break;
        case 'tinker': for (const p of live('tinker')) {
          if (!broken(p) && !this.protection(p, 'tinker') && this.st.tinkerDies(p)) this.tryKill(p, 'tinker', messages);
        } break;
        case 'moonchild': {
          const mc = this.moonchildPick;
          this.moonchildPick = null;
          const m = mc && this.get(mc.by);
          if (m && !broken(m) && mc.good) this.tryKill(this.get(mc.target), 'moonchild', messages);
        } break;
        case 'grandmother': for (const p of live('grandmother')) this.grandmotherInfo(p, say); break;
        case 'chambermaid': {
          // 房规"夜里死了仍拿信息"：今晚被杀的侍女照样拿信息，但按醉酒处理（真假由说书人定）
          const dead = this.deadDrunk ? this.players.filter((q) => q.role === 'chambermaid' && !q.alive && this.nightDeaths.includes(q.id)) : [];
          for (const p of [...live('chambermaid'), ...dead]) {
            const ts = this.choiceOf(p)?.targets ?? []; if (ts.length < 2) continue;
            const deadInfo = !p.alive;
            if (!deadInfo) for (const t of ts) this.goonCheck(p, t);
            const truth = ts.filter((t) => this.wokeTonight.has(t.id)).length;
            const n = broken(p) || (deadInfo && this.st.deadLies(p)) ? this.st.fakeChambermaid(p, truth) : truth;
            say(p, `${ts.map((t) => this.name(t.id)).join(' 与 ')} 之中，今晚有 **${n}** 人因自己的能力被唤醒。${deadInfo ? '\n（你今晚死了。按房规你仍得到了这条信息，但它按醉酒处理：**可能是假的**。）' : ''}`);
          }
        } break;
        default: break;
      }
      if (this.midNightCheck(steps, i, revivedBefore, messages)) return { messages: [], ravenkeeper: null, pause: this.midNight.revived };
    }
    // 莽夫换了阵营：告诉他
    if (this.pendingGoonNews) {
      const g = this.get(this.pendingGoonNews);
      say(g, `你的阵营变了——你现在是**${this.evilOf(g) ? '邪恶' : '善良'}**的。`);
    }
    this.fx = this.fx.filter((f) => f.until !== 'dawn'); // 旅店老板的保护到黎明
    this.lastExecuted = null;
    this.checkWinner();
    return { messages, ravenkeeper: null };
  },

  /**
   * 第 i 步结算完：这一步里被复活的人（nightRevived 里 from 之后的）有没有人的角色排在后面、今晚还要选人？
   * 有就记下停在哪（this.midNight），返回 true。
   */
  midNightCheck(steps, i, from, messages) {
    for (const id of this.nightRevived.slice(from)) {
      const p = this.get(id);
      if (!p?.alive || this.choices[id]) continue;
      const role = this.actsAs(p);
      if (!steps.slice(i + 1).includes(role)) continue;
      if (!this.nightPromptsBMR().some((x) => x.playerId === id)) continue;
      this.midNight = { step: i + 1, revived: id, messages, woke: [...this.wokeTonight] };
      this.record('st', `${this.tag(id)} 被复活了，他的角色在今晚的顺序里还没轮到：唤醒他行动`);
      return true;
    }
    return false;
  },

  /** 祖母首夜（或被复活后）得知孙子。 */
  grandmotherInfo(p, say) {
    if (!this.grandchild || !this.get(this.grandchild)?.alive) this.grandchild = this.st.chooseGrandchild(p)?.id ?? null;
    const gc = this.get(this.grandchild);
    if (!gc) return;
    this.wokeTonight.add(p.id);
    const role = this.bmrBroken(p) ? this.st.falseRoleBMR(p, gc) : gc.role;
    say(p, `你的孙子是 **${this.name(gc.id)}**，他是 **${ROLES[role].name}**。`);
  },

  // ───────────────────────── 白天 ─────────────────────────
  dawnBMR() {
    this.diedToday = false;
    this.outsiderDiedToday = false;
    this.gossipSaid = {};
    this.pendingMoonchild = this.pendingMoonchild && !this.get(this.pendingMoonchild)?.alive ? this.pendingMoonchild : null;
  },

  /**
   * 造谣者式的公开声明（谁都可以说，只有真造谣者的会生效）。statement：
   *   { kind: 'role', target, role } X 是某角色 / { kind: 'evil', target } X 是邪恶的 / { kind: 'good', target } X 是善良的
   *   { kind: 'demon', target } X 是恶魔 / { kind: 'inplay', role } 场上有某角色 / { kind: 'notinplay', role } 场上没有某角色
   */
  gossipStatement(uid, st) {
    if (this.phase !== 'day') throw new Error('只能在白天发表声明');
    const p = this.get(uid);
    if (!p || !this.visAlive(p)) throw new Error('死亡玩家不能发表声明');
    if (this.gossipSaid[uid]) throw new Error('你今天已经发表过声明了');
    const t = st.target ? this.get(st.target) : null;
    const known = { role: () => t && ROLES[st.role] && t.role === st.role, evil: () => t && this.evilOf(t), good: () => t && !this.evilOf(t),
      demon: () => t && DEMON_ROLES.has(t.role), inplay: () => this.players.some((q) => q.role === st.role), notinplay: () => ROLES[st.role] && !this.players.some((q) => q.role === st.role) }[st.kind];
    if (!known || (['role', 'evil', 'good', 'demon'].includes(st.kind) && !t) || (['role', 'inplay', 'notinplay'].includes(st.kind) && !ROLES[st.role])) throw new Error('声明不完整');
    this.gossipSaid[uid] = true;
    const text = this.statementText(st);
    const truth = !!known();
    if (p.role === 'gossip') {
      if (truth) this.gossipPending = true;
      this.record('st', `造谣者 ${this.tag(uid)} 声明"${text}"——${truth ? '为真，今晚会有人死亡' : '为假'}`);
    } else this.record('st', `${this.tag(uid)} 声称"${text}"（不是造谣者，没有效果）`);
    return { text };
  },
  /**
   * 自由声明（谁都可以说，只有真造谣者的才需要判定）：只做检查和记账，真假由服务器问大模型（见 server/judge.js）。
   * 返回 { text, isGossip }：isGossip 为真时服务器去判定，判为真再调用 gossipVerdict(true)。
   */
  gossipFree(uid, raw) {
    if (this.phase !== 'day') throw new Error('只能在白天发表声明');
    const p = this.get(uid);
    if (!p || !this.visAlive(p)) throw new Error('死亡玩家不能发表声明');
    if (this.gossipSaid[uid]) throw new Error('你今天已经发表过声明了');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('声明不能是空的');
    if ([...text].length > 120) throw new Error('声明太长了（最多 120 字）');
    this.gossipSaid[uid] = true;
    const isGossip = p.role === 'gossip';
    this.record('st', isGossip ? `造谣者 ${this.tag(uid)} 自由声明"${text}"——交给 AI 判定` : `${this.tag(uid)} 声称"${text}"（不是造谣者，没有效果）`);
    return { text, isGossip };
  },

  /** AI 判定的结果回来了：为真就记下"今晚有人死"。 */
  gossipVerdict(truth, note) {
    if (truth) this.gossipPending = true;
    this.record('st', `造谣者的声明 ${note}${truth ? '——今晚会有人死亡' : ''}`);
  },

  /** 给 AI 判定用的整局真实情况：每个人的真实角色、阵营、生死，加复盘时间线。 */
  gossipFacts() {
    const TEAM = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
    const ppl = this.players.map((q) => `${q.seat}号 ${q.name}：${ROLES[q.role].name}（${TEAM[ROLES[q.role].team]}${q.role === 'lunatic' ? `，以为自己是${ROLES[q.shownRole]?.name ?? '恶魔'}` : ''}），${this.evilOf(q) ? '邪恶' : '善良'}阵营，${q.alive ? (q.apparentDead ? '看起来已死但其实还活着' : '存活') : '已死亡'}`);
    const tl = this.timeline.map((e) => `[${e.when}] ${e.text}`);
    return [`剧本：黯月初升。现在是第 ${this.day} 天白天，共 ${this.players.length} 名玩家。`, '玩家：', ...ppl, '', '复盘时间线（到现在为止）：', ...tl].join('\n');
  },

  statementText(st) {
    const t = st.target ? this.name(st.target) : '';
    const r = st.role ? ROLES[st.role]?.name : '';
    return { role: `${t} 是${r}`, evil: `${t} 是邪恶的`, good: `${t} 是善良的`, demon: `${t} 是恶魔`, inplay: `场上有${r}`, notinplay: `场上没有${r}` }[st.kind] ?? '';
  },

  /** 月之子得知自己死亡后，公开选一名存活玩家。阵营看选人这一刻。 */
  moonchildChoose(uid, targetId) {
    if (this.pendingMoonchild !== uid) throw new Error('现在不需要你选人');
    if (this.phase !== 'day') throw new Error('天亮以后再选');
    const t = this.get(targetId);
    if (!t || !this.visAlive(t)) throw new Error('要选一名存活的玩家');
    this.pendingMoonchild = null;
    this.moonchildPick = { by: uid, target: t.id, good: !this.evilOf(t) };
    this.record('choice', `月之子 ${this.tag(uid)} 选了 ${this.tag(t.id)}（${this.evilOf(t) ? '邪恶，无事发生' : '善良，今晚会死'}）`);
  },

  /** 处决。返回 died / saved / fake / already。 */
  executeBMR(p) {
    this.executedToday = true;
    this.lastExecuted = p.id;
    this.log.push(`${this.name(p.id)} 被处决`);
    if (this.ghostLunatic(p)) {
      p.lunaticGhost = false;
      this.record('death', `已经死过的疯子 ${this.tag(p.id)} 又被处决：在他看来僵怖这次真的死了，之后不再叫醒他`);
    }
    const res = this.tryKill(p, 'execution');
    if (res === 'died' && team(p) === 'minion') {
      const min = this.players.find((q) => q.role === 'minstrel' && q.alive && !this.bmrBroken(q));
      if (min) {
        for (const q of this.players) if (q.id !== min.id) this.fx.push({ kind: 'drunk', target: q.id, source: min.id, until: this.day + 1, why: '吟游诗人' });
        this.record('st', '爪牙死于处决：除吟游诗人外所有人醉酒，直到明天黄昏');
      }
    }
    if (this.mastermindDay === this.day) {
      this.setWinner(this.evilOf(p) ? 'good' : 'evil', `主谋的额外一天：被处决的 ${this.name(p.id)} 是${this.evilOf(p) ? '邪恶' : '善良'}的`);
    }
    this.checkWinner();
    return res;
  },

  endDayBMR() {
    let executed = null; let result = null;
    if (this.pendingMoonchild) { // 月之子拖到黄昏还没选：替他随机选一名存活玩家
      const opts = this.players.filter((q) => this.visAlive(q) && q.id !== this.pendingMoonchild);
      if (opts.length) this.moonchildChoose(this.pendingMoonchild, pickOne(opts, this.rng).id);
      else this.pendingMoonchild = null;
    }
    if (!this.executedToday && this.block) {
      executed = this.block;
      result = this.executeBMR(this.get(executed));
    }
    if (!this.winner && this.mastermindDay === this.day) this.setWinner('good', '主谋的额外一天没有处决任何人，善良获胜');
    // 黄昏：到期的醉酒、保护结束
    this.fx = this.fx.filter((f) => !(typeof f.until === 'number' && Number.isFinite(f.until) && f.until <= this.day));
    return { executed, result };
  },

  checkWinnerBMR() {
    if (this.winner) return this.winner;
    if (this.mastermindDay != null) return null; // 主谋的额外一夜一天：照常进行，胜负在那天黄昏定
    const demonAlive = this.players.some((p) => p.alive && DEMON_ROLES.has(p.role));
    if (!demonAlive) {
      const mm = this.players.find((p) => p.role === 'mastermind' && p.alive && !this.bmrBroken(p));
      if (this.demonExecuted && mm) {
        this.mastermindDay = this.day + 1;
        this.record('st', '恶魔死于处决，但主谋还活着：额外进行一个夜晚和一个白天');
        return null;
      }
      this.setWinner('good', '恶魔已经死亡');
    } else if (this.aliveCount() <= 2) this.setWinner('evil', '只剩两名存活玩家，恶魔获胜');
    return this.winner;
  },
};
