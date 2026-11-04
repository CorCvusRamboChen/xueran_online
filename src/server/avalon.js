// 阿瓦隆在房间里的流程：计时、机器人、公告、每个人看到的视图。规则在 engine/avalon.js。
// room.js 里只接了几处：开局（start）、操作（act 的 'avalon'）、视图（viewFor）、读档恢复（resume）。
// 阿瓦隆不用自由活动和私聊房子（用户 2026-11-05：不需要私聊，一直在圆桌）。
// 语音、自由活动地图、私聊房子、暂停、存档都用房间原来的那套。
import { Avalon, AVALON_ROLES, MAX_REJECTS, isGood } from '../engine/avalon.js';
import { ttsUrl } from './tts.js';

/** 阿瓦隆的房间设置（并进 DEFAULT_SETTINGS）。 */
export const AVALON_SETTINGS = {
  avalonRoles: { merlin: true, percival: true, morgana: true, mordred: true, oberon: false }, // 可选角色（merlin：梅林和刺客一起）
  avalonTargeting: false, // 官方可选规则「自选任务」
  avalonLady: false,      // 湖中仙女（官方的可选规则，推荐 7 人及以上）
};

/** 阿瓦隆对局里房间接受的操作：大厅那些、语音归位、结束、阿瓦隆自己的。自由活动、私聊房子、提名投票这些血染的都不要。 */
export const AV_ACTIONS = new Set(['join', 'leave', 'claimHost', 'releaseHost', 'settings', 'character', 'outfit', 'addBots', 'kick', 'markNewbie',
  'start', 'history', 'stats', 'pastGame', 'fixVoice', 'end', 'fullLog', 'avalon']);

// 各步的时限（秒）：到点没动作的替他随机选，和血染夜里选人一样
const LIMITS = { reveal: 30, propose: 120, vote: 60, quest: 45, lady: 60, assassin: 150 };
const PAUSE_MS = 3500; // 开票 / 翻任务票后停一下再进下一步，让大家看清结果

const pickN = (arr, k) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
};
const rand = (a, b) => a + Math.random() * (b - a);
/** 在场的角色，按角色表的固定顺序（梅林、派西维尔、忠臣、刺客……）。不能按座位排：排第一的就是座位最靠前那人的角色，等于把身份漏了。 */
export const inPlay = (g) => Object.keys(AVALON_ROLES).filter((id) => g.players.some((p) => p.role === id));

export class AvalonTable {
  constructor(room) {
    this.room = room;
    this.limits = LIMITS;   // 测试里调短
    this.pauseMs = PAUSE_MS;
    this.speed = 1;         // 机器人和重启后的等待乘上这个（测试里调成很小）
  }
  /** 机器人想一想：a–b 毫秒之间随机。 */
  wait(a, b = a) { return rand(a, b) * this.speed; }
  get g() { return this.room.game; }

  updateSettings(p) {
    const s = this.room.settings;
    if (p.avalonRoles && typeof p.avalonRoles === 'object') {
      const cur = { ...AVALON_SETTINGS.avalonRoles, ...s.avalonRoles };
      for (const k of Object.keys(AVALON_SETTINGS.avalonRoles)) if (typeof p.avalonRoles[k] === 'boolean') cur[k] = p.avalonRoles[k];
      s.avalonRoles = cur;
    }
    if (typeof p.avalonLady === 'boolean') s.avalonLady = p.avalonLady;
    if (typeof p.avalonTargeting === 'boolean') s.avalonTargeting = p.avalonTargeting;
  }

  // ───────────── 开局 ─────────────
  async start(seats) {
    const r = this.room;
    const s = r.settings;
    const g = new Avalon(seats.map(({ id, name }) => ({ id, name })), { options: { ...AVALON_SETTINGS.avalonRoles, ...s.avalonRoles, lady: !!s.avalonLady, targeting: !!s.avalonTargeting } });
    r.game = g;
    r.homes = null;
    const square = await r.safeVoice((v) => v.findSquare(r.hostId, seats.map((p) => p.id)));
    try { await r.claimSquare(square); } catch (e) { r.game = null; throw e; }
    r.square = square;
    const roles = g.players.map((p) => p.role);
    const evil = roles.filter((x) => !isGood(x)).length;
    const special = inPlay(g).filter((x) => !['loyal', 'minion'].includes(x)).map((x) => AVALON_ROLES[x].name);
    r.announce(`游戏开始！《阿瓦隆》${g.n} 人：好人 ${g.n - evil} · 坏人 ${evil}。${special.length ? `在场的特殊角色：${special.join('、')}` : '基础局：没有梅林和刺客，三次任务成功好人直接获胜'}${g.lady ? '；用湖中仙女' : ''}${g.options.targeting ? '；自选任务（队长挑做哪个任务，第 5 个任务要先成功两个）' : ''}。`, 'start');
    this.story('阿瓦隆', pickN([
      `${g.n} 名骑士围坐在圆桌旁。亚瑟王的光芒之下，有人在为莫德雷德做事。`,
      `圆桌只有一张，骑士却分成了两派。完成三次任务，或者让三次任务失败——谁先做到，谁就赢。`,
    ], 1)[0]);
    if (!r.square) r.announce('没检测到大家所在的语音频道，自由活动的私聊不会生效（房主先进语音再开局即可）。');
    r.syncWatchMute();
    r.watchVoice();
    r.announce(`闭上眼睛，确认身份：坏人互相认识（奥伯伦除外）${g.assassinId() ? '，梅林看到坏人（莫德雷德除外）' : ''}${g.idsWith('percival').length ? '，派西维尔看到梅林和莫甘娜' : ''}。看完点「我看好了」。`, 'night');
    for (const p of g.players) if (r.isFake(p.id)) g.setReady(p.id);
    this.arm('reveal');
    if (g.ready.length === g.n) this.room.later(this.wait(1500), () => this.begin());
  }

  /** 一句旁白（客户端弹标题卡、读出来）。 */
  story(title, text) {
    const r = this.room;
    r.log.push({ id: ++r.logSeq, kind: 'story', text, title, audio: ttsUrl(text), at: Date.now() });
    if (r.log.length > 1000) r.log.shift();
  }

  /** 给当前这一步排上时限，到点替没动作的人随机选。 */
  arm(stage) {
    const r = this.room;
    r.cancel(this.timer);
    r.deadline = Date.now() + this.limits[stage] * 1000;
    const key = this.key();
    this.timer = r.later(this.limits[stage] * 1000, () => { if (this.key() === key) this.timeout(); });
  }

  /** 现在处在哪一步（计时器到点时核对一下，免得上一步的计时器碰到下一步）。 */
  key() { const g = this.g; return g && `${g.stage}-${g.round}-${g.attempt}`; }

  begin() {
    const r = this.room;
    const g = this.g;
    if (g?.stage !== 'reveal') return;
    g.begin();
    r.announce('天亮了，所有人睁开眼睛。', 'day');
    this.startRound();
  }

  /** 停一下再做下一步（开票、翻任务票之后）：记在对局里，重启后接着做。 */
  then(next, ms = this.pauseMs) {
    this.g.next = next;
    this.room.later(ms, () => this.runNext());
  }

  runNext() {
    const g = this.g;
    if (!g?.next || this.room.ended) return;
    const next = g.next;
    g.next = null;
    if (next === 'propose') this.openPropose();
    else if (next === 'assassin') this.openAssassin();
    else if (next === 'lady') this.openLady();
    else this.startRound();
  }

  /** 一轮任务开始：先自由活动（设置了的话），集合后队长组队。 */
  startRound() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'propose' || r.ended) return;
    const q = g.quest();
    if (q) r.announce(`第 ${g.round} 轮任务：要 ${q.size} 个人${q.need > 1 ? `，要 ${q.need} 张失败票才会失败` : ''}。队长是 **${g.name(g.leaderId())}**。`, 'day');
    else r.announce(`第 ${g.round} 轮：队长 **${g.name(g.leaderId())}** 组队时自己挑做哪个任务（还能做：${g.questOptions().map((k) => `任务 ${k}（${g.quests[k - 1].size} 人）`).join('、')}）。`, 'day');
    this.openPropose();
  }

  openPropose() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'propose' || r.ended) return;
    this.arm('propose');
    const leader = g.leaderId();
    if (r.isFake(leader)) r.later(this.wait(2500, 5000), () => { if (g.stage === 'propose' && g.leaderId() === leader) this.botPropose(leader); });
  }

  // ───────────── 操作 ─────────────
  async act(uid, p) {
    const r = this.room;
    const g = this.g;
    if (!g?.avalon || r.ended) throw new Error('现在不在阿瓦隆对局里');
    switch (p.kind) {
      case 'ready': if (g.setReady(uid)) this.begin(); break;
      case 'propose':
        this.propose(uid, Array.isArray(p.team) ? p.team : [], p.quest ?? null); break;
      case 'vote': this.vote(uid, !!p.yes); break;
      case 'quest': this.play(uid, !!p.success); break;
      case 'lady': this.useLady(uid, p.target); break;
      case 'suggest': g.suggestTarget(uid, p.target ?? null); break;
      case 'assassin': this.assassinate(uid, p.target); break;
      default: throw new Error('未知操作');
    }
  }

  propose(uid, team, questNo = null) {
    const r = this.room;
    const g = this.g;
    g.propose(uid, team, questNo);
    r.announce(`队长 **${g.name(uid)}** 提名 ${g.team.map((id) => `**${g.name(id)}**`).join('、')} 去做${g.options.targeting ? `任务 ${g.questNo}（第 ${g.round} 轮` : `第 ${g.round} 轮任务（`}第 ${g.attempt} 次组队${g.attempt === MAX_REJECTS ? '，再被否决坏人直接获胜' : ''}）。所有人投票：赞成还是反对？`, 'vote');
    this.arm('vote');
    for (const p of g.players) if (r.isFake(p.id)) r.later(this.wait(1200, 4000), () => { if (g.stage === 'vote' && !(p.id in g.votes)) this.vote(p.id, this.botVote(p.id)); });
    r.changed();
  }

  vote(uid, yes) {
    const r = this.room;
    const g = this.g;
    if (g.vote(uid, yes)) this.tally();
    r.changed();
  }

  tally() {
    const r = this.room;
    const g = this.g;
    r.cancel(this.timer);
    r.deadline = null;
    const rec = g.tally();
    const list = (ok) => g.players.filter((p) => rec.votes[p.id] === ok).map((p) => `${p.seat}号`).join(' ') || '无';
    r.announce(`开票：${rec.yes} 赞成（${list(true)}） · ${g.n - rec.yes} 反对（${list(false)}）——${rec.approved ? '组队通过，队员去做任务' : '组队被否决'}。`, 'vote');
    if (g.winner) return this.finish();
    if (rec.approved) {
      r.announce(`${rec.team.map((id) => `**${g.name(id)}**`).join('、')} 出任务票。好人只能出「成功」，坏人可以出「失败」；只公开失败票的张数。`, 'day');
      this.arm('quest');
      for (const id of g.team) if (r.isFake(id)) r.later(this.wait(1500, 4000), () => { if (g.stage === 'quest' && !(id in g.cards)) this.play(id, this.botCard(id)); });
      return;
    }
    r.announce(`队长交给 **${g.name(g.leaderId())}**（第 ${g.round} 轮第 ${g.attempt} 次组队${g.attempt === MAX_REJECTS ? '：这次再被否决，坏人直接获胜' : `，已经否决 ${g.attempt - 1} 次`}）。`, 'day');
    this.then('propose');
  }

  play(uid, success) {
    const r = this.room;
    const g = this.g;
    if (g.play(uid, success)) this.questDone();
    r.changed();
  }

  questDone() {
    const r = this.room;
    const g = this.g;
    r.cancel(this.timer);
    r.deadline = null;
    const out = g.reveal();
    r.announce(`第 ${out.round} 轮${g.options.targeting ? `（任务 ${out.quest}）` : '任务'}${out.result === 'success' ? '**成功**' : '**失败**'}：${out.fails} 张失败票。现在 ${g.wins('success')} 次成功 · ${g.wins('fail')} 次失败。`, out.result === 'success' ? 'day' : 'death');
    if (g.winner) return this.finish();
    this.then(g.stage === 'assassin' ? 'assassin' : g.stage === 'lady' ? 'lady' : 'round', this.pauseMs * 2); // 客户端要一张张翻任务票，多停一会儿
  }

  openLady() {
    const r = this.room;
    const g = this.g;
    const holder = g.lady.holder;
    r.announce(`湖中仙女：**${g.name(holder)}** 选一名玩家，偷偷查看他是好人还是坏人（自己和拿过湖中仙女的人不能查）。`, 'day');
    this.arm('lady');
    if (r.isFake(holder)) r.later(this.wait(2000, 4000), () => { if (g.stage === 'lady' && g.lady.holder === holder) this.useLady(holder, pickN(g.ladyOptions(), 1)[0]); });
  }

  useLady(uid, target) {
    const r = this.room;
    const g = this.g;
    g.useLady(uid, target);
    r.cancel(this.timer);
    r.deadline = null;
    r.announce(`**${g.name(uid)}** 用湖中仙女查看了 **${g.name(target)}**，湖中仙女交给了 **${g.name(target)}**。`, 'day');
    this.then('round');
    r.changed();
  }

  openAssassin() {
    const r = this.room;
    const g = this.g;
    const a = g.assassinId();
    r.announce(`好人完成了三次任务！最后的机会：刺客 **${g.name(a)}** 站出来，和同伴商量，指认谁是梅林。指对了坏人获胜，指错了好人获胜。`, 'vote');
    this.story('刺杀', '刺客从阴影里走出来。他只有一次机会。');
    this.arm('assassin');
    const humans = g.evilIds().some((id) => id !== a && !r.isFake(id)); // 有真人同伴（奥伯伦也算）：多等一会儿他们的建议
    if (r.isFake(a)) r.later(humans ? this.wait(40_000) : this.wait(6000, 12000), () => { if (g.stage === 'assassin') this.assassinate(a, this.botMerlinGuess()); });
  }

  assassinate(uid, target) {
    const g = this.g;
    const { merlin } = g.assassinate(uid, target);
    this.room.announce(`刺客 **${g.name(uid)}** 指认 **${g.name(target)}** 是梅林……${merlin ? '他就是梅林！' : `他不是。真正的梅林是 **${g.name(g.idsWith('merlin')[0])}**。`}`, 'death');
    this.finish();
  }

  /** 到点了：替没动作的人随机选。 */
  timeout() {
    const r = this.room;
    const g = this.g;
    if (!g || r.ended) return;
    switch (g.stage) {
      case 'reveal': this.begin(); break;
      case 'propose': {
        const leader = g.leaderId();
        r.announce(`队长 ${g.name(leader)} 没在时限内组队，替他随机选了。`, 'clock');
        this.botPropose(leader, true);
        break;
      }
      case 'vote': {
        const miss = g.missingVotes();
        // 超时按赞成算：随机的话，第 5 次组队时掉线的好人有一半机会直接把胜利送给坏人
        r.announce(`${miss.map((id) => g.name(id)).join('、')} 没投票，按赞成算。`, 'clock');
        for (const id of miss) g.vote(id, true);
        this.tally();
        break;
      }
      case 'quest': {
        const miss = g.missingCards();
        r.announce(`${miss.map((id) => g.name(id)).join('、')} 没出任务票，替他随机出了。`, 'clock');
        for (const id of miss) g.play(id, isGood(g.roleOf(id)) || Math.random() < 0.5);
        this.questDone();
        break;
      }
      case 'lady': {
        const holder = g.lady.holder;
        r.announce(`${g.name(holder)} 没在时限内用湖中仙女，替他随机查了一个人。`, 'clock');
        this.useLady(holder, pickN(g.ladyOptions(), 1)[0]);
        break;
      }
      case 'assassin': {
        const a = g.assassinId();
        const tip = this.topSuggestion();
        r.announce(`刺客没在时限内指认，${tip ? '按同伴的建议' : '随机'}指认了一个人。`, 'clock');
        this.assassinate(a, tip ?? this.botMerlinGuess());
        break;
      }
      default:
    }
  }

  topSuggestion() {
    const count = {};
    for (const t of Object.values(this.g.suggest ?? {})) count[t] = (count[t] ?? 0) + 1;
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  async finish() {
    const r = this.room;
    if (r.ended) return;
    const g = this.g;
    r.cancel(this.timer);
    r.deadline = null;
    r.ended = true;
    r.announce(`${g.winner === 'good' ? '好人获胜！' : '坏人获胜！'}${g.winReason}。`, 'end');
    this.story(g.winner === 'good' ? '亚瑟王的胜利' : '莫德雷德的胜利', g.winner === 'good' ? '圆桌还在。骑士们第一次看清了彼此的脸。' : '王冠落进了泥里。笑得最开心的那个人，一直坐在你旁边。');
    r.changed();
    await r.endRoam();
    await r.closeAllRooms();
    r.syncWatchMute();
  }

  /** 读档 / 暂停后回来：把这一步的计时器重新排上。 */
  resume() {
    const r = this.room;
    const g = this.g;
    if (!g || r.ended) return;
    if (r.roam) { r.endRoam(); r.deadline = null; } // 旧版存档可能停在自由活动里：直接回圆桌，下面接着组队
    if (g.next) { r.later(this.wait(3000), () => this.runNext()); return; } // 停在两步之间（比如翻完任务票正要开始下一轮）
    if (g.stage === 'propose' && r.deadline == null) { r.later(this.wait(3000), () => this.openPropose()); return; } // 自由活动刚结束、还没轮到队长
    if (!this.limits[g.stage]) return;
    const left = Math.max(this.wait(10_000), (r.deadline ?? 0) - Date.now());
    r.deadline = Date.now() + left;
    const key = this.key();
    this.timer = r.later(left, () => { if (this.key() === key) this.timeout(); });
    // 机器人接着做它该做的
    if (g.stage === 'reveal') { for (const p of g.players) if (r.isFake(p.id)) g.setReady(p.id); if (g.ready.length === g.n) r.later(this.wait(1500), () => this.begin()); }
    if (g.stage === 'propose' && r.isFake(g.leaderId())) r.later(this.wait(3000), () => { if (g.stage === 'propose') this.botPropose(g.leaderId()); });
    if (g.stage === 'vote') for (const p of g.players) if (r.isFake(p.id) && !(p.id in g.votes)) r.later(this.wait(1200, 3000), () => { if (g.stage === 'vote' && !(p.id in g.votes)) this.vote(p.id, this.botVote(p.id)); });
    if (g.stage === 'quest') for (const id of g.missingCards()) if (r.isFake(id)) r.later(this.wait(1500, 3000), () => { if (g.stage === 'quest' && !(id in g.cards)) this.play(id, this.botCard(id)); });
    if (g.stage === 'lady' && r.isFake(g.lady.holder)) r.later(this.wait(3000), () => { if (g.stage === 'lady') this.useLady(g.lady.holder, pickN(g.ladyOptions(), 1)[0]); });
    if (g.stage === 'assassin' && r.isFake(g.assassinId())) r.later(this.wait(6000), () => { if (g.stage === 'assassin') this.assassinate(g.assassinId(), this.botMerlinGuess()); });
  }

  // ───────────── 机器人 ─────────────
  /** 这个人信不过谁：自己知道的坏人（梅林）、出过失败任务的人（越多次越可疑）。 */
  suspicion(id) {
    const g = this.g;
    const sus = {};
    for (const q of g.quests) if (q.result === 'fail') for (const x of q.team) sus[x] = (sus[x] ?? 0) + q.fails / q.team.length;
    for (const q of g.quests) if (q.result === 'success') for (const x of q.team) sus[x] = (sus[x] ?? 0) - 0.3;
    if (g.roleOf(id) === 'merlin') for (const k of g.knowledge(id)) sus[k.id] = (sus[k.id] ?? 0) + 10;
    for (const s of g.ladySeen[id] ?? []) sus[s.id] = (sus[s.id] ?? 0) + (s.good ? -5 : 10);
    delete sus[id];
    return sus;
  }

  /** 机器人队长组队：带上自己；好人挑最不可疑的，坏人带一个同伴（第 1 轮不带）再补好人。random：完全随机（真人超时）。 */
  /** 机器人（或超时的真人）队长组队：自选任务时先挑人数最少的任务（random 时随便挑一个）。 */
  botPropose(leader, random = false) {
    const g = this.g;
    const opts = g.questOptions();
    const questNo = random ? pickN(opts, 1)[0] : [...opts].sort((a, b) => g.quests[a - 1].size - g.quests[b - 1].size || a - b)[0];
    this.propose(leader, this.botTeam(leader, random, g.quests[questNo - 1].size), questNo);
  }

  botTeam(leader, random = false, size = this.g.quest().size) {
    const g = this.g;
    const others = g.players.map((p) => p.id).filter((id) => id !== leader);
    if (random) return [leader, ...pickN(others, size - 1)];
    if (isGood(g.roleOf(leader))) {
      const sus = this.suspicion(leader);
      const ranked = pickN(others, others.length).sort((a, b) => (sus[a] ?? 0) - (sus[b] ?? 0));
      return [leader, ...ranked.slice(0, size - 1)];
    }
    const allies = new Set(g.knowledge(leader).map((k) => k.id));
    const goods = pickN(others.filter((id) => !allies.has(id)), others.length);
    return [leader, ...goods].slice(0, size);
  }

  /** 机器人投票。好人：第 5 次总是赞成；队伍里有自己认定的坏人就反对；自己在队里或自己是队长多半赞成。坏人：队里有坏人就赞成。 */
  botVote(id) {
    const g = this.g;
    const team = g.team;
    const mine = team.includes(id) || g.leaderId() === id;
    if (!isGood(g.roleOf(id))) {
      const allies = new Set([id, ...g.knowledge(id).map((k) => k.id)]);
      if (team.some((x) => allies.has(x))) return true;
      return g.attempt < MAX_REJECTS - 1 ? Math.random() < 0.3 : false;
    }
    if (g.attempt >= MAX_REJECTS) return true;
    const sus = this.suspicion(id);
    if (team.some((x) => (sus[x] ?? 0) >= 5)) return false;
    const worst = Math.max(0, ...team.map((x) => sus[x] ?? 0));
    if (mine) return worst < 0.8 || Math.random() < 0.3;
    return worst < 0.4 ? Math.random() < 0.75 : Math.random() < 0.3;
  }

  /** 机器人出任务票：好人成功；坏人第 1 轮一半一半装好人，之后多半失败；队里有好几个坏人时只让需要的那几个出失败。 */
  botCard(id) {
    const g = this.g;
    if (isGood(g.roleOf(id))) return true;
    const q = g.quest();
    const allies = new Set(g.knowledge(id).map((k) => k.id));
    const mates = g.team.filter((x) => x !== id && allies.has(x));
    const before = mates.filter((x) => g.get(x).seat < g.get(id).seat).length; // 座位靠前的同伴先出失败
    if (before >= q.need) return true;
    return Math.random() < (g.round === 1 ? 0.5 : 0.12);
  }

  /** 机器人刺客猜梅林：同伴的建议优先；否则在不是同伴的人里挑最"像梅林"的（从没进过失败任务、反对过有坏人的队伍）。 */
  botMerlinGuess() {
    const g = this.g;
    const a = g.assassinId();
    const tip = this.topSuggestion();
    if (tip) return tip;
    const score = {};
    for (const pr of g.proposals) {
      const dirty = pr.team.some((x) => !g.assassinOptions().includes(x));
      for (const [id, yes] of Object.entries(pr.votes)) if (dirty && !yes) score[id] = (score[id] ?? 0) + 1;
    }
    const cands = pickN(g.assassinOptions(), g.n);
    return cands.sort((x, y) => (score[y] ?? 0) - (score[x] ?? 0))[0];
  }

  // ───────────── 视图 ─────────────
  view(uid, base) {
    const r = this.room;
    const g = this.g;
    const isST = uid === r.stId;
    const spectator = !g.get(uid);
    const showRoles = r.ended || (spectator && r.settings.spectatorGrimoire);
    const lobbyOf = (id) => r.lobby.find((x) => x.id === id);
    const stage = g.stage;
    const me = g.get(uid);
    const view = {
      ...base,
      phase: r.ended ? 'ended' : g.phase,
      spectator: spectator && !isST,
      script: 'avalon',
      day: g.round,
      night: 1,
      deadline: r.deadline ?? null,
      homes: null,
      voiceChannel: r.square ?? null,
      winner: r.ended ? { team: g.winner, reason: g.winReason } : null,
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: true,
        avatar: lobbyOf(p.id)?.avatar ?? null, char: lobbyOf(p.id)?.char ?? null, outfit: r.outfits.get(p.id) ?? null,
        fake: r.isFake(p.id), online: r.online.has(p.id),
        ...(showRoles ? { role: p.role, roleName: AVALON_ROLES[p.role].name, evil: !isGood(p.role) } : {}),
      })),
      rooms: [],
      roam: null,
      avalon: {
        stage, round: g.round, attempt: g.attempt, maxRejects: MAX_REJECTS,
        questNo: g.questNo,                                          // 这一轮做哪个任务（自选任务时队长组队前是 null）
        questOptions: stage === 'propose' ? g.questOptions() : [],  // 队长能挑的任务
        targeting: !!g.options.targeting,
        leader: stage === 'reveal' ? null : g.leaderId(),
        team: g.team,
        quests: g.quests,
        proposals: g.proposals,
        voted: stage === 'vote' ? Object.keys(g.votes) : [],      // 谁投了（投的什么开票前不公开）
        played: stage === 'quest' ? Object.keys(g.cards) : [],    // 谁出了任务票（出的什么永远不公开）
        ready: stage === 'reveal' ? g.ready : [],
        lady: g.lady && { holder: g.lady.holder, used: g.lady.used, log: g.lady.log, options: stage === 'lady' && g.lady.holder === uid ? g.ladyOptions() : null },
        assassin: stage === 'assassin' || r.ended ? g.assassinId() : null, // 刺杀时刺客公开站出来
        guess: g.guess,
        roles: inPlay(g).map((id) => ({ id, name: AVALON_ROLES[id].name, good: isGood(id), ability: AVALON_ROLES[id].ability, count: g.players.filter((p) => p.role === id).length })),
      },
    };
    if (me) {
      const role = AVALON_ROLES[me.role];
      const allies = g.knowledge(uid);
      const isAssassin = me.role === 'assassin';
      view.self = {
        seat: me.seat, alive: true,
        role: { id: me.role, name: role.name, good: role.good, evil: !role.good, ability: role.ability, teamName: role.good ? '好人' : '坏人' },
        sees: allies,
        ladySeen: g.ladySeen[uid] ?? [],
        ready: g.ready.includes(uid),
        myVote: stage === 'vote' && uid in g.votes ? g.votes[uid] : null,
        myCard: stage === 'quest' && uid in g.cards ? g.cards[uid] : null,
        canFail: !role.good,
        // 刺杀阶段：刺客看到同伴的建议；同伴看到自己给的建议
        suggestions: stage === 'assassin' && isAssassin ? g.suggest : null,
        mySuggest: stage === 'assassin' ? g.suggest?.[uid] ?? null : null,
        canSuggest: stage === 'assassin' && !isAssassin && g.evilIds().includes(uid),
        assassinOptions: stage === 'assassin' && g.evilIds().includes(uid) ? g.assassinOptions() : null, // 刺客能指认的人（坏人亮了身份一起商量，奥伯伦也在）
        inbox: r.inbox.get(uid) ?? [],
      };
    }
    return view;
  }
}
