// 「暗印」在房间里的流程：天亮（死讯、调包人数、起雾、遗言）→ 自由活动（小镇地图、私聊房子，同屋才能看背后；路上可能瞟到）
// → 回到广场圆桌讨论（没有提名，也没有投票）→ 回家 → 夜里在家写下印记 → 午夜结算 → 天亮公布。
// 规则在 engine/mark.js。room.js 里只接了几处：开局（start）、操作（act 的 'mark'）、集合（endRoam 之后转到圆桌）、
// 视图（viewFor）、读档 / 暂停后恢复（resume）、读档（restore）。自由活动、私聊房子、语音、暂停、存档都用房间原来的那套。
import { MarkGame, MARK_ROLES, SUITS, MARKS, suitText, evilCount, evilKnow, colorOf, roleAbility } from '../engine/mark.js';
import { houseCenter, positionAt } from '../shared/map.js';
import { ttsUrl } from './tts.js';

/** 暗印对局里房间接受的操作：大厅那些、自由活动的（锁门、敲门、邀请、提前集合）、语音归位、结束、暗印自己的。血染的提名投票、夜里选人这些都不要。 */
/** 暗印的房间设置（并进 DEFAULT_SETTINGS）：房主能关掉调包和遗言。 */
export const MARK_SETTINGS = { markSwap: true, markLastWords: true };

export const MK_ACTIONS = new Set(['join', 'leave', 'claimHost', 'releaseHost', 'settings', 'character', 'outfit', 'addBots', 'kick', 'markNewbie',
  'start', 'history', 'stats', 'pastGame', 'fixVoice', 'end', 'fullLog', 'gather', 'markStats',
  'lock', 'knock', 'invite', 'inviteReply', 'roamVote', 'mark']);

// 各步的长短（秒）。自由活动、圆桌、夜里写印记跟房间设置走（roamMinutes / nominateMinutes / chooseSeconds），见 secs()
// blast：午夜结算到天亮，写错的人在屋里看完爆炸（约 4 秒）再看一会儿字
const FIXED = { morning: 7, blast: 10, dusk: 4 };
/** 路上「瞟到」：两人隔多近（地图单位）、每对每天命中的概率、多久查一次（毫秒）。 */
export const GLIMPSE = { radius: 55, chance: 0.3, every: 700 };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const LAST_WORDS = ['别信今天第一个跟你说话的人。', '我被骗了。小心那几个热心的。', '昨天告诉我花色的人里，有一个在撒谎。', '下次我自己数。', '钟声比我想的早。'];

export class MarkTable {
  constructor(room) {
    this.room = room;
    this.limits = null; // 测试里调短：{ morning, roam, table, night, blast, dusk }（秒）
    this.speed = 1;     // 机器人想一想的时间乘上这个（测试里调成很小）
    this.glimpse = { ...GLIMPSE };
  }
  get g() { return this.room.game; }
  wait(a, b = a) { return rand(a, b) * this.speed; }

  updateSettings(p) {
    const s = this.room.settings;
    if (typeof p.markSwap === 'boolean') s.markSwap = p.markSwap;
    if (typeof p.markLastWords === 'boolean') s.markLastWords = p.markLastWords;
  }

  /** 这一步多少秒。 */
  secs(stage) {
    if (this.limits?.[stage] != null) return this.limits[stage];
    const s = this.room.settings;
    if (stage === 'roam') return (s.roamMinutes ?? 5) * 60;
    if (stage === 'table') return (s.nominateMinutes ?? 3) * 60;
    if (stage === 'night') return s.chooseSeconds ?? 45;
    return FIXED[stage];
  }

  /** 现在处在哪一步（计时器到点时核对一下，免得上一步的计时器碰到下一步）。 */
  key() { const g = this.g; return g && `${g.stage}-${g.day}-${!!g.blast}`; }

  /** 过 ms 毫秒做 fn，到时候还在同一步才做。 */
  after(ms, fn) {
    const key = this.key();
    return this.room.later(ms, () => { if (this.key() === key && !this.room.ended) fn(); });
  }

  /** 给这一步排上截止时间，到点 timeout()。 */
  arm(stage, ms = this.secs(stage) * 1000) {
    const r = this.room;
    r.cancel(this.timer);
    r.deadline = Date.now() + ms;
    this.timer = this.after(ms, () => this.timeout());
  }
  disarm() { this.room.cancel(this.timer); this.room.deadline = null; }

  /** 一句旁白（客户端弹标题卡、读出来）。 */
  story(title, text) {
    const r = this.room;
    r.log.push({ id: ++r.logSeq, kind: 'story', text, title, audio: ttsUrl(text), at: Date.now() });
    if (r.log.length > 1000) r.log.shift();
  }

  // ───────────── 开局 ─────────────
  async start(seats) {
    const r = this.room;
    const g = new MarkGame(seats.map(({ id, name }) => ({ id, name })), { rules: { swap: r.settings.markSwap !== false, lastWords: r.settings.markLastWords !== false } });
    r.game = g;
    // 本地测试（DEV_LOGIN 的 ?devRole=mk_boss / mk_hand / mk_town）：开局把这个身份和别人对调。线上的 Discord 用户没有 devRole
    for (const p of g.players) {
      const want = r.users.get(p.id)?.devRole;
      const other = MARK_ROLES[want] && p.role !== want && g.players.find((q) => q.role === want);
      if (other) [p.role, other.role] = [other.role, p.role];
    }
    // 每人镇上一栋家（夜里在自己家写印记；白天从自家门口出门）。谁住哪是公开的
    const homes = [...r.town.homes()].sort(() => Math.random() - 0.5);
    r.homes = homes.length >= g.n ? Object.fromEntries(g.players.map((p, i) => [p.id, homes[i].id])) : null;
    const square = await r.safeVoice((v) => v.findSquare(r.hostId, seats.map((p) => p.id)));
    try { await r.claimSquare(square); } catch (e) { r.game = null; r.homes = null; throw e; }
    r.square = square;
    const e = evilCount(g.n);
    r.announce(`游戏开始！《暗印》${g.n} 人：好人 ${g.n - e} · 坏人 ${e}（1 个头头${e > 1 ? `、${e - 1} 个手下` : ''}）。${evilKnow(g.n) ? '坏人互相认识' : '6 人及以下坏人互相不认识'}。${g.rules.swap ? '' : '这局没有调包。'}${g.rules.lastWords ? '' : '这局没有遗言。'}坏人全死好人赢；活着的坏人追平活着的好人，坏人赢。`, 'start');
    this.story('暗印', pick([
      '钟楼敲响第一声的时候，每个人的后颈都烫了一下。那里多了一枚印记——你自己永远看不到它。',
      '镇上流传着一个诅咒：午夜钟响之前，写不出自己后颈上的印记，印记就会在你屋里炸开。',
    ]));
    if (!r.square) r.announce('没检测到大家所在的语音频道，进房子私聊不会生效（房主先进语音再开局即可）。');
    r.syncWatchMute();
    r.watchVoice();
    for (const id of g.evilIds()) {
      if (r.isFake(id)) continue;
      const allies = g.allies(id);
      r.tell(id, `你是${MARK_ROLES[g.get(id).role].name}。${allies.length ? `你的同伴：${allies.map((x) => `**${g.name(x)}**（${MARK_ROLES[g.get(x).role].name}）`).join('、')}。` : '6 人及以下坏人互相不认识，你不知道同伴是谁。'}${g.get(id).role === 'mk_boss' ? '你整局有 2 次机会看自己当天的印记。' : ''}`);
    }
    g.begin();
    this.morning();
  }

  /** 天亮：调包人数、起雾、遗言；等一会儿开始自由活动。 */
  morning() {
    const r = this.room;
    const g = this.g;
    const last = g.nights.at(-1);
    r.announce(`第 ${g.day} 天。钟声响过，每个活着的人后颈都换上了新的印记，自己看不到。只有和别人关在同一栋房子里，才能绕到他身后看（每天最多看 ${g.rules.peeksPerDay} 个人，看的同时他也看到你的）。`, 'day');
    if (last && g.rules.swap) r.announce(`说书人：昨天有 **${last.swaps}** 个人被调包了。`, 'day', true);
    if (g.foggy) { r.announce('今天起雾了：看别人背后，只看得出是红色还是黑色。', 'day', true); this.story('起雾', '雾从钟楼脚下漫上来。今天凑得再近，也只看得清颜色。'); }
    if (last?.dead.length && g.rules.lastWords) {
      r.announce(`${last.dead.map((id) => `**${g.name(id)}**`).join('、')} 今天白天可以留一句遗言，或者公开一个他看过的人的印记。`, 'day');
      for (const id of last.dead) if (r.isFake(id)) r.later(this.wait(4000, 12000), () => { if (!r.ended && this.g === g) this.botLastWord(id); });
    }
    this.disarm();
    this.after(this.secs('morning') * (g.day === 1 ? 1.5 : 1) * 1000, () => this.openRoam());
    r.changed();
  }

  openRoam() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'morning') return;
    g.openRoam();
    r.deadline = null;
    r.startRoam(this.secs('roam') / 60);
    r.announce('进房子私聊时点屋里的人「看后颈」：你看到他的，他也看到你的。看完怎么说由你。每人每天还能给一个人塞一封匿名信（只写一个花色）。', 'day');
    this.botRoam();
    this.glimpseLoop();
  }

  /** 集合了（时间到 / 大家同意提前集合 / 房主敲钟）：回到广场圆桌讨论。房间的 endRoam 之后调这里。 */
  gathered() {
    const r = this.room;
    const g = this.g;
    if (!g || r.ended || g.stage !== 'roam') return;
    g.openTable();
    r.announce(`回到广场，圆桌讨论（${Math.round((this.secs('table') / 60) * 10) / 10} 分钟）。没有提名，也没有投票——说完了点「说完了」，所有人都说完就提前回家。`, 'day');
    this.arm('table');
    for (const p of g.alive()) if (r.isFake(p.id)) this.after(this.wait(3000, 9000), () => { if (g.stage === 'table' && p.alive && g.finish(p.id)) this.dusk('大家都说完了'); });
    r.changed();
  }

  // ───────────── 操作 ─────────────
  async act(uid, p) {
    const r = this.room;
    const g = this.g;
    if (!g?.mark || r.ended) throw new Error('现在不在暗印对局里');
    switch (p.kind) {
      case 'peek': this.peek(uid, p.target); break;
      case 'swap': this.swap(uid, p.target, p.suit); break;
      case 'reveal': g.reveal(uid); break;
      case 'tell': this.tell(uid, p.target, p.suit); break;
      case 'letter': this.letter(uid, p.target, p.suit); break;
      case 'done': if (g.finish(uid, p.on !== false)) this.dusk('大家都说完了'); break;
      case 'lastWord': this.lastWord(uid, p); break;
      case 'guess': this.guess(uid, p.suit); break;
      default: throw new Error('未知操作');
    }
    r.changed();
  }

  /** 两个人是不是在同一栋房子里。 */
  together(a, b) {
    const z = this.room.roam?.zone;
    return !!z && !!z.get(a) && z.get(a) === z.get(b);
  }

  peek(uid, target) {
    const r = this.room;
    const g = this.g;
    if (!r.roam || g.stage !== 'roam') throw new Error('只有白天自由活动时能看别人的后颈');
    if (!this.together(uid, target)) throw new Error('得和他在同一栋房子里才能绕到他身后');
    const again = g.peeked(uid).includes(target);
    const { mutual } = g.peek(uid, target);
    if (!again && !r.isFake(target)) r.tell(target, `**${g.name(uid)}** 绕到你身后看了你的后颈——你们对视了一眼，你也看到了他的：**${suitText(mutual)}**。`);
  }

  swap(uid, target, suit) {
    const r = this.room;
    if (!this.together(uid, target)) throw new Error('只能在看他背后的那一刻调包（得和他在同一栋房子里）');
    this.g.swap(uid, target, suit);
    if (!r.isFake(uid)) r.tell(uid, `你把 **${this.g.name(target)}** 今天的印记调包成了 **${suitText(suit)}**。他不会知道。`);
  }

  tell(uid, target, suit) {
    const r = this.room;
    const g = this.g;
    if (!r.roam || g.stage !== 'roam') throw new Error('只有白天自由活动时能这么说');
    if (!this.together(uid, target)) throw new Error('得和他在同一栋房子里才能悄悄告诉他');
    g.tell(uid, target, suit);
    if (!r.isFake(target)) r.tell(target, `**${g.name(uid)}** 凑到你耳边说：「你后颈是 **${suitText(suit)}**。」`);
  }

  letter(uid, target, suit) {
    const r = this.room;
    this.g.letter(uid, target, suit);
    if (!r.isFake(target)) r.tell(target, `门缝里塞进来一封匿名信：「你是 **${suitText(suit)}**。」`);
  }

  lastWord(uid, p) {
    const g = this.g;
    const w = g.lastWord(uid, { text: p.text, reveal: p.reveal });
    this.room.announce(w.reveal
      ? `**${g.name(uid)}** 的遗言：公开 **${g.name(w.reveal.target)}** 第 ${w.reveal.day} 天的印记——${suitText(w.reveal.seen)}。`
      : `**${g.name(uid)}** 的遗言：「${w.text}」`, 'death');
  }

  /** 回家。 */
  dusk(reason) {
    const r = this.room;
    const g = this.g;
    if (!g.daytime()) return;
    if (r.roam) r.endRoam();
    g.dusk();
    this.disarm();
    if (reason) r.announce(`圆桌散了（${reason}）。`, 'day');
    r.announce('天快黑了，每个人回到自己家里。入夜后写下自己后颈的印记——写错或者没写，午夜钟响时印记就会炸开。', 'night');
    this.after(this.secs('dusk') * 1000, () => this.night());
    r.changed();
  }

  night() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'dusk') return;
    if (r.roam) r.endRoam();
    g.startNight();
    r.announce(`第 ${g.night} 夜。关上门，在自己家里写下后颈的印记（${this.secs('night')} 秒，鬼牌就写鬼牌）。`, 'night');
    this.arm('night');
    for (const p of g.alive()) if (r.isFake(p.id)) this.after(this.wait(1500, 6000), () => { if (g.stage === 'night' && !g.blast && !(p.id in g.guesses)) this.guess(p.id, this.botGuess(p.id)); });
    r.changed();
  }

  guess(uid, suit) {
    const g = this.g;
    if (g.guess(uid, suit)) this.after(1500 * Math.min(1, this.speed * 50), () => this.resolve());
    this.room.changed();
  }

  /** 午夜钟响：结算。写错的人在自己屋里看到爆炸，别人什么都不知道，等天亮看死讯。 */
  resolve() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'night' || g.blast) return;
    this.disarm();
    g.resolveNight();
    g.blastUntil = Date.now() + this.secs('blast') * 1000;
    r.announce('午夜的钟声敲了十二下。', 'night');
    this.after(this.secs('blast') * 1000, () => this.dawn());
    r.changed();
  }

  dawn() {
    const r = this.room;
    const g = this.g;
    if (g.stage !== 'night') return;
    g.blastUntil = null;
    const dead = g.dawn();
    r.announce(dead.length
      ? `天亮了。昨晚，${dead.map((id) => `**${g.name(id)}**`).join('、')} 的印记在屋里炸开了。`
      : '天亮了。昨晚没有人死。', dead.length ? 'death' : 'day', true);
    if (g.winner) return this.finish();
    this.morning();
  }

  /** 到点了。 */
  timeout() {
    const g = this.g;
    if (!g || this.room.ended) return;
    if (g.stage === 'table') this.dusk('圆桌时间到');
    else if (g.stage === 'night') this.resolve();
  }

  async finish() {
    const r = this.room;
    if (r.ended) return;
    const g = this.g;
    this.disarm();
    r.ended = true;
    r.announce(`${g.winner === 'good' ? '好人获胜！' : '坏人获胜！'}${g.winReason}。`, 'end');
    this.story(g.winner === 'good' ? '好人的胜利' : '坏人的胜利', g.winner === 'good'
      ? '最后一个说谎的人倒下了。那天早上钟声响过，没有人的后颈再发烫。'
      : '活下来的人互相看着对方的后颈，谁也不再开口。说谎的人，终于和说真话的人一样多了。');
    if (!r.tutorial) r.onMarkEnded?.(r); // 生还排行（server/store.js 的 archiveMark）
    r.changed();
    await r.endRoam();
    await r.closeAllRooms();
    r.syncWatchMute();
  }

  /** 读档 / 暂停后回来：把这一步的计时器重新排上，机器人接着做。 */
  resume() {
    const r = this.room;
    const g = this.g;
    if (!g || r.ended) return;
    const left = (until, min) => Math.max(min, (until ?? 0) - Date.now());
    switch (g.stage) {
      case 'setup': case 'morning':
        this.after(this.wait(3000), () => this.openRoam());
        break;
      case 'roam': {
        const roam = r.roam;
        if (!roam) { this.after(this.wait(3000), () => this.gathered()); break; }
        if (roam.until) r.roamTimer = r.later(left(roam.until, 5000), () => r.endRoam('时间到'));
        r.scheduleRoamSoon();
        for (const [id, m] of roam.pos) if (m.start + m.dur > Date.now()) roam.arrive.set(id, [r.later(m.start + m.dur - Date.now() + 30, () => r.arrive(id))]);
        this.botRoam();
        this.glimpseLoop();
        break;
      }
      case 'table':
        this.arm('table', left(r.deadline, this.wait(15_000)));
        for (const p of g.alive()) if (r.isFake(p.id) && !g.done.includes(p.id)) this.after(this.wait(3000, 6000), () => { if (g.stage === 'table' && g.finish(p.id)) this.dusk('大家都说完了'); });
        break;
      case 'dusk': this.after(this.wait(3000), () => this.night()); break;
      case 'night':
        if (g.blast) { this.after(left(g.blastUntil, this.wait(3000)), () => this.dawn()); break; }
        this.arm('night', left(r.deadline, this.wait(10_000)));
        for (const id of g.missingGuesses()) if (r.isFake(id)) this.after(this.wait(1500, 3000), () => { if (g.stage === 'night' && !(id in g.guesses)) this.guess(id, this.botGuess(id)); });
        break;
      default:
    }
  }

  // ───────────── 路上瞟到 ─────────────
  /** 自由活动时每隔一会儿查一次：正在走路的人经过别人身后（都在街上、隔得够近），这一对今天掷一次骰子。 */
  glimpseLoop() {
    const r = this.room;
    const g = this.g;
    r.later(this.glimpse.every, () => {
      if (!r.roam || g.stage !== 'roam' || r.ended || this.g !== g) return;
      this.glimpseTick();
      this.glimpseLoop();
    });
  }

  glimpseTick(rng = Math.random) {
    const r = this.room;
    const g = this.g;
    const roam = r.roam;
    if (!roam || g.stage !== 'roam') return;
    const now = Date.now();
    const street = g.alive().filter((p) => !roam.zone.get(p.id) && roam.pos.get(p.id));
    for (const a of street) {
      const m = roam.pos.get(a.id);
      if (!(m.start + m.dur > now)) continue; // 站着不动的人不算「经过」
      const pa = positionAt(m, now);
      for (const b of street) {
        if (b.id === a.id) continue;
        const pb = positionAt(roam.pos.get(b.id), now);
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > this.glimpse.radius) continue;
        const seen = g.glimpse(a.id, b.id, rng, this.glimpse.chance);
        if (!seen) continue;
        if (!r.isFake(a.id)) r.tell(a.id, `你从 **${g.name(b.id)}** 身后经过，瞟到了他的后颈：**${suitText(seen)}**。`);
        if (!r.isFake(b.id)) r.tell(b.id, '有人从你背后经过。后颈凉了一下。');
        r.changed();
      }
    }
  }

  // ───────────── 机器人 ─────────────
  /**
   * 机器人自由活动：往有人的房子里钻；和别人在同一间屋里就看他（每天最多两个）、告诉他（好人说真话，坏人多半说谎），
   * 手下偶尔调包（优先当天被很多人看过背后的人）。每次只做一件事，看起来像人。
   */
  botRoam() {
    const r = this.room;
    const g = this.g;
    r.later(this.wait(1500, 3000), () => {
      if (!r.roam || g.stage !== 'roam' || r.ended || this.g !== g) return;
      for (const p of g.alive()) if (r.isFake(p.id)) {
        try { this.botStep(p.id); } catch (e) { console.warn('[mark] 机器人操作失败：', e.message); }
      }
      r.changed();
      this.botRoam();
    });
  }

  botStep(id) {
    const r = this.room;
    const g = this.g;
    const roam = r.roam;
    const hid = roam.zone.get(id);
    const mates = hid ? [...roam.state.get(hid).ids].filter((x) => x !== id && g.get(x)?.alive) : [];
    const allies = new Set(g.allies(id));
    const told = (t) => g.tells.some((x) => x.day === g.day && x.from === id && x.to === t);
    const owes = (t) => g.saw(id, t) && !allies.has(t) && !told(t);
    // 塞一封匿名信（每天一封，随机某个时候）
    if (!g.letters.some((x) => x.day === g.day && x.from === id) && Math.random() < 0.08) this.botLetter(id);
    for (const m of mates) if (!g.saw(id, m) && g.peeksLeft(id) > 0) { this.peek(id, m); return; }
    if (g.get(id).role === 'mk_hand' && g.rules.swap) { // 调包是手下的本事
      const target = mates.filter((m) => !g.swapBlock(id, m)).sort((a, b) => g.viewers(b).length - g.viewers(a).length)[0];
      if (target && Math.random() < 0.12 + 0.12 * g.viewers(target).length) { this.swap(id, target, pick(SUITS.filter((s) => s !== g.suits[target]))); return; }
    }
    for (const m of mates) if (owes(m) && Math.random() < 0.8) { this.tell(id, m, this.botClaim(id, m)); return; }
    // 屋里的事做完了：过一会儿换一间。屋里有真人就多待一会儿（他可能还想问话、想让你看）
    if (hid && mates.some((m) => owes(m))) return;
    if (hid && Math.random() < (mates.some((m) => !r.isFake(m)) ? 0.93 : 0.6)) return;
    const open = roam.houses.filter((h) => !roam.state.get(h.id).locked && h.id !== hid && roam.state.get(h.id).ids.size < 4); // 别全挤进一间
    const want = (x) => g.get(x)?.alive && x !== id && ((!g.saw(id, x) && g.peeksLeft(id) > 0) || owes(x));
    const busy = open.filter((h) => [...roam.state.get(h.id).ids].some(want));
    const h = busy.length && Math.random() < 0.8 ? pick(busy) : pick(open);
    if (!h) return;
    const c = houseCenter(h);
    r.move(id, c.x + (Math.random() - 0.5) * 50, c.y + (Math.random() - 0.5) * 30);
  }

  /** 机器人今天最后一次看到的 target（雾天只是颜色）。 */
  seenBy(id, target) { return this.g.sightings.filter((x) => x.day === this.g.day && x.by === id && x.target === target).at(-1)?.seen ?? null; }

  /** 把「看到的」变成一个能说出口的花色：雾天只知道颜色，就挑一个这个颜色的花色。 */
  sayable(seen) {
    if (MARKS.includes(seen)) return seen;
    return pick(SUITS.filter((s) => colorOf(s) === seen));
  }

  /** 机器人告诉别人的花色：好人说看到的；坏人七成说谎（自己调包过的人就说调包前的样子，和别人说的对得上）。 */
  botClaim(id, target) {
    const g = this.g;
    const seen = this.seenBy(id, target);
    if (!g.isEvil(id) || g.allies(id).includes(target)) return this.sayable(seen ?? pick(SUITS));
    const swapped = g.swaps.find((s) => s.day === g.day && s.by === id && s.target === target);
    if (swapped) return swapped.from;
    if (Math.random() < 0.7) return pick(SUITS.filter((s) => s !== g.suits[target]));
    return this.sayable(seen ?? g.suits[target]);
  }

  /** 机器人的匿名信：好人把看到的写给他；坏人给一个好人写个假的。 */
  botLetter(id) {
    const g = this.g;
    const allies = new Set(g.allies(id));
    if (!g.isEvil(id)) {
      const seen = g.sightings.filter((x) => x.day === g.day && x.by === id && g.get(x.target)?.alive);
      if (!seen.length) return;
      const s = pick(seen);
      this.letter(id, s.target, this.sayable(s.seen));
      return;
    }
    const town = g.aliveIds().filter((x) => x !== id && !allies.has(x) && !g.isEvil(x));
    if (!town.length) return;
    const t = pick(town);
    this.letter(id, t, pick(SUITS.filter((s) => s !== g.suits[t])));
  }

  /** 机器人炸死后的遗言：多半公开一个看过的人，不然留一句话。 */
  botLastWord(id) {
    const g = this.g;
    if (!g.canLastWord(id)) return;
    const seen = g.sightings.filter((x) => x.by === id);
    if (seen.length && Math.random() < 0.65) { const s = seen.at(-1); this.lastWord(id, { reveal: { target: s.target, day: s.day } }); } else this.lastWord(id, { text: pick(LAST_WORDS) });
  }

  /**
   * 机器人回想以前几天：自己活下来了，说明那晚写对了——那天当面跟自己说的对不上的人在说谎，对得上的人说了真话。
   * （被调包过的那天，说真话的人也会被当成说谎：机器人不知道自己被调包了。）返回 { liars, honest }。
   */
  memory(id) {
    const g = this.g;
    const liars = new Set();
    const honest = new Set();
    for (const t of g.tells) {
      if (t.to !== id || t.day >= g.day) continue;
      const real = g.suitLog[t.day]?.[id];
      if (!real) continue;
      (t.suit === real ? honest : liars).add(t.from);
    }
    for (const x of liars) honest.delete(x);
    return { liars, honest };
  }

  /**
   * 机器人夜里写的：头头没把握时用一次机会看自己；
   * 不然按今天听到的打分（说过真话的人当面说的最可信，匿名信打折，说过谎的人不信），没人说就瞎猜。
   */
  botGuess(id) {
    const g = this.g;
    const { liars, honest } = this.memory(id);
    const score = {};
    for (const t of g.heard(id)) if (!liars.has(t.from)) score[t.suit] = (score[t.suit] ?? 0) + (honest.has(t.from) ? 3 : 1);
    for (const t of g.letters.filter((x) => x.to === id && x.day === g.day)) score[t.suit] = (score[t.suit] ?? 0) + 0.6;
    const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
    const sure = best.length > 0 && (best[0][1] >= 3 || (best[0][1] >= 2 && (best[1]?.[1] ?? 0) === 0));
    const revealed = g.reveals.some((x) => x.by === id && x.day === g.day);
    if (g.get(id).role === 'mk_boss' && (revealed || (!sure && g.revealsLeft(id) > 0 && (g.day === 1 || Math.random() < 0.5)))) return g.reveal(id);
    if (best.length) return best[0][0];
    return pick(SUITS);
  }

  // ───────────── 视图 ─────────────
  view(uid, base) {
    const r = this.room;
    const g = this.g;
    const me = g.get(uid);
    const isST = uid === r.stId;
    const spectator = !me;
    const showAll = r.ended || ((spectator || isST) && r.settings.spectatorGrimoire);
    const lobbyOf = (id) => r.lobby.find((x) => x.id === id);
    const allies = me ? new Set(g.allies(uid)) : new Set();
    const stage = r.ended ? 'ended' : g.stage;
    // 倒计时：圆桌大家都看得到；夜里只给还没写的活人
    const deadline = r.ended ? null : stage === 'night' ? (me?.alive && !(uid in g.guesses) && !g.blast ? r.deadline : null) : r.deadline;
    const view = {
      ...base,
      phase: r.ended ? 'ended' : g.phase === 'setup' ? 'day' : g.phase,
      spectator: spectator && !isST,
      script: 'mark',
      day: Math.max(1, g.day),
      night: Math.max(1, g.night),
      deadline,
      homes: r.homes ?? null,
      voiceChannel: r.square ?? null,
      winner: r.ended ? { team: g.winner, reason: g.winReason } : null,
      players: g.players.map((p) => ({
        id: p.id, seat: p.seat, name: p.name, alive: p.alive, diedAt: p.diedAt, cause: p.alive ? null : p.cause,
        avatar: lobbyOf(p.id)?.avatar ?? null, char: lobbyOf(p.id)?.char ?? null, outfit: r.outfits.get(p.id) ?? null,
        fake: r.isFake(p.id), online: r.online.has(p.id),
        ...(showAll || p.id === uid || allies.has(p.id) ? { role: p.role, roleName: MARK_ROLES[p.role].name, evil: g.isEvil(p.id) } : {}),
      })),
      rooms: [],
      roam: r.roam && {
        map: r.town.id,
        until: r.roam.until, since: r.roam.since ?? null,
        houses: r.roam.houses.map((h) => {
          const st = r.roam.state.get(h.id);
          return { ...h, members: [...st.ids], locked: st.locked, knocks: [...st.knocks] };
        }),
        pos: Object.fromEntries(r.roam.pos),
        myHouse: r.roam.zone.get(uid) ?? null,
        invite: r.roam.invites?.get(uid) ?? null,
        endVotes: { count: r.roam.endVotes.size, need: r.roamVoteNeed(), mine: r.roam.endVotes.has(uid) },
      },
      mark: {
        stage,
        evilCount: evilCount(g.n),
        evilKnow: evilKnow(g.n),
        rules: g.rules,
        foggy: g.foggy,
        nights: g.nights,           // 每晚死了谁、那天被调包了几个人（只有人数）
        lastWords: g.lastWords,
        done: stage === 'table' ? g.done.length : null,
        midnight: stage === 'night' && !!g.blast, // 钟已经敲过，等天亮
        written: stage === 'night' && !g.blast ? Object.keys(g.guesses).length : null, // 有几个人写好了（不说是谁）
        // 终局复盘：每天每人的印记（发的、调包后的）、谁看了谁、谁说了什么、匿名信是谁写的、谁调包了谁、谁被谁骗死
        review: r.ended ? { dealt: g.dealt, suitLog: g.suitLog, fog: g.fog, sightings: g.sightings, tells: g.tells, letters: g.letters, swaps: g.swaps, reveals: g.reveals, survival: g.survival(), timeline: g.timeline } : null,
      },
    };
    if (me) {
      const role = MARK_ROLES[me.role];
      const exploded = stage === 'night' && !!g.blast?.ids.includes(uid);
      const myHouse = r.roam?.zone.get(uid);
      const mates = myHouse ? [...r.roam.state.get(myHouse).ids].filter((x) => x !== uid) : [];
      const known = r.ended ? g.suits[uid] : g.reveals.find((x) => x.by === uid && x.day === g.day)?.suit ?? null;
      view.self = {
        seat: me.seat, alive: me.alive,
        role: { id: me.role, name: role.name, good: role.good, evil: !role.good, ability: roleAbility(me.role, g.rules), teamName: role.good ? '好人' : '坏人' },
        allies: g.isEvil(uid) ? g.allies(uid).map((id) => ({ id, team: MARK_ROLES[g.get(id).role].name })) : null,
        suit: me.alive || r.ended ? known : null, // 自己知道的今天的印记（头头看过 / 终局）
        reveals: me.role === 'mk_boss' ? { left: g.revealsLeft(uid), used: g.reveals.filter((x) => x.by === uid) } : null,
        peeksLeft: g.stage === 'roam' ? g.peeksLeft(uid) : g.rules.peeksPerDay,
        sightings: g.sightings.filter((x) => x.by === uid), // 我看到过谁的背后、看到了什么（主动看 / 对视 / 路上瞟到）
        seenBy: g.sightings.filter((x) => x.target === uid && x.kind !== 'mutual').map(({ day, by, kind, at }) => (kind === 'glimpse' ? { day, kind, at } : { day, by, kind, at })), // 谁看过我（瞟到的不知道是谁）
        told: g.tells.filter((x) => x.from === uid).map(({ lie, ...x }) => x), // 是不是假话不给（没看过就随口说的人也不该知道真相）
        heard: g.tells.filter((x) => x.to === uid).map(({ lie, ...x }) => x),
        mail: g.mail(uid),                         // 收到的匿名信（不知道是谁写的）
        sent: g.letters.filter((x) => x.from === uid).map(({ lie, ...x }) => x),
        swaps: g.swaps.filter((x) => x.by === uid),
        // 现在能调包谁：同屋、看过背后的人 → null（能）或者不能的原因
        swapTargets: me.role === 'mk_hand' && g.stage === 'roam' && g.rules.swap ? Object.fromEntries(mates.filter((x) => g.saw(uid, x)).map((x) => [x, g.swapBlock(uid, x)])) : null,
        guess: stage === 'night' ? g.guesses[uid] ?? null : null,
        exploded,
        blastWhy: exploded ? g.blast.why[uid] : null,
        blastGuess: exploded ? g.blast.guesses[uid] ?? null : null,
        blastSuit: exploded ? g.suits[uid] : null, // 炸了才知道自己其实是什么
        lastWord: g.canLastWord(uid),
        done: g.done.includes(uid),
        inbox: r.inbox.get(uid) ?? [],
      };
    }
    return view;
  }
}
