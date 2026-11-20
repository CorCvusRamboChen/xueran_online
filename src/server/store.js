// 对局存档：每个频道一份 data/rooms/<key>.json。状态一变就（合并成每 0.5 秒最多一次）写盘，
// 先写临时文件再改名，写到一半断电也不会留下半个文件。服务器启动时把还没打完的局读回来。
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../engine/roles.js';
import { summarizeMark } from '../engine/mark.js';

const DIR = path.resolve('data/rooms');
const MAX_AGE = 24 * 3600_000; // 一天没动静的存档启动时清掉
const fileOf = (key) => path.join(DIR, `${key.replace(/[^\w.-]/g, '_')}.json`);

const pending = new Map(); // room → 定时器

/** 有内容才值得存：对局中，或者大厅里有人。 */
const worthSaving = (room) => !!room.game || room.lobby.length > 0;

export function saveSoon(room) {
  if (pending.has(room)) return;
  pending.set(room, setTimeout(() => { pending.delete(room); saveNow(room); }, 500));
}

export function saveNow(room) {
  const file = fileOf(room.key);
  try {
    if (!worthSaving(room)) { fs.rmSync(file, { force: true }); return; }
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(room.snapshot()));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('[botc] 存档失败：', e.message);
  }
}

/** 关服前把还没写的都写掉。 */
export function flushAll() {
  for (const [room, t] of pending) { clearTimeout(t); saveNow(room); }
  pending.clear();
}

/** 读出所有存档（太旧的删掉）。 */
export function loadAll() {
  let names = [];
  try { names = fs.readdirSync(DIR).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const n of names) {
    const file = path.join(DIR, n);
    try {
      const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - (snap.savedAt ?? 0) > MAX_AGE) { fs.rmSync(file, { force: true }); continue; }
      out.push(snap);
    } catch (e) {
      console.warn(`[botc] 存档 ${n} 读不出来，跳过：`, e.message);
    }
  }
  return out;
}

// ───────────── 往期对局 ─────────────
// 每局结束写一份 data/games/<服务器 id>/<结束时间>_<频道>.json：所有人的身份、整局复盘时间线、票型、胜负。不会自动删。
// decisions（说书人决策日志）、beliefs（玩家标记的变化）、meets（谁和谁进了同一间屋）、records（开局时的战绩）、
// heard（疯狂判定时听到的话和结论）是给线下分析的，文件里有，getGame 不往外给。
const GAMES = path.resolve('data/games');
const safe = (x) => String(x).replace(/[^\w.-]/g, '_');

export function archiveGame(room) {
  const g = room.game;
  if (!g?.winner) return;
  try {
    const dir = path.join(GAMES, safe(room.guildId));
    fs.mkdirSync(dir, { recursive: true });
    const endedAt = Date.now();
    const id = `${endedAt}_${safe(room.key.split(':')[1] ?? 'x')}`;
    const data = {
      id, endedAt, key: room.key, winner: g.winner, reason: g.winReason, days: g.day,
      script: g.script ?? room.settings?.script ?? null, mode: room.settings?.mode ?? 'auto', tutorial: !!room.tutorial, tilt: g.st?.tilt ?? 0, // 胜率统计用（server/winrate.js）
      players: g.players.map((p) => ({ id: p.id, seat: p.seat, name: p.name, avatar: room.users.get(p.id)?.avatar ?? null, role: p.role, evil: g.evilOf?.(p) ?? undefined, shownRole: p.shownRole, alive: p.alive, ...(p.role === 'amnesiac' && p.gained ? { gained: p.gained } : {}) })),
      timeline: g.timeline, votes: room.voteHistory ?? [],
      recordings: `recordings/${safe(room.guildId)}/${safe(g.id)}`, // 这局的录音和转写（server/recorder.js），没开收音的局目录不存在
      decisions: g.st.decisions, beliefs: room.beliefs?.gameId === g.id ? room.beliefs.log : [], meets: room.meets ?? [], records: g.records ?? null, heard: g.heard ?? [],
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data));
  } catch (e) {
    console.warn('[botc] 对局存档失败：', e.message);
  }
}

/** 这个服务器最近的对局（只要摘要）。 */
/** 暗印打完一局：记每人活到第几天、被谁骗死（生还排行用）。和血染的对局分开放（data/mark/），免得算进血染的胜率。 */
const MARK = path.resolve('data/mark');
export function archiveMark(room) {
  const g = room.game;
  if (!g?.winner || !g.survival) return;
  try {
    const dir = path.join(MARK, safe(room.guildId));
    fs.mkdirSync(dir, { recursive: true });
    const endedAt = Date.now();
    fs.writeFileSync(path.join(dir, `${endedAt}_${safe(room.key.split(':')[1] ?? 'x')}.json`), JSON.stringify({ endedAt, winner: g.winner, days: g.day, players: g.survival() }));
  } catch (e) {
    console.warn('[botc] 暗印存档失败：', e.message);
  }
}

/** 这个服务器的暗印生还排行。 */
export function markStatsFor(guildId) {
  const dir = path.join(MARK, safe(guildId));
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
  const games = names.map((n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { return null; } }).filter(Boolean);
  return summarizeMark(games);
}

export function listGames(guildId, limit = 20) {
  const dir = path.join(GAMES, safe(guildId));
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().reverse().slice(0, limit); } catch { return []; }
  return names.map((n) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      return { id: d.id, endedAt: d.endedAt, winner: d.winner, reason: d.reason, days: d.days, players: d.players.map((p) => ({ id: p.id, seat: p.seat, name: p.name, role: p.role })) };
    } catch { return null; }
  }).filter(Boolean);
}

export function getGame(guildId, id) {
  try {
    const { decisions, beliefs, meets, records, heard, ...open } = JSON.parse(fs.readFileSync(path.join(GAMES, safe(guildId), `${safe(id)}.json`), 'utf8'));
    return open;
  } catch { return null; }
}

let statsCache = null; // { sig, players, guilds }：存档没变就不重算
const RECENT = 10;
const MATE_MIN = 4; // 同队少于这么多局不算（局数太少的胜率没意义；用户 2026-11-04 定 4 局）

/**
 * 战绩：所有服务器打完的局，按真人玩家汇总（机器人不算）：同一个账号在哪个服务器打的都算他的，按结束时间排。
 * 跨服只合并个人数字；games / goodWins 是这个服务器的；players 只列在这个服务器打过的人和 uid 本人，
 * 别的服务器的陌生人不会出现在排行榜上。KOOK 的账号 id 和 Discord 不同，两边不合并。
 * 阵营按终局时的角色算（莽夫这种中途换阵营的按最后的算）；赢 = 自己阵营赢了，死活不论。
 * 每人：总胜负、好人 / 坏人、镇民 / 外来者 / 爪牙 / 恶魔各自的胜负、每个角色的胜负、活到终局几次、
 * 最近 10 局、当前连胜 / 最长连胜；
 * 场上表现：提名 [次数, 提到邪恶, 送上处决台]、被提名 [次数, 被送上台]、被处决几次、夜里被杀几次、
 * 当好人时举手 [次数, 举在邪恶身上]。死因从时间线的"N号 名字（角色） 被处决 / 被恶魔杀死"里按座位号认。
 * 队友：和谁同一阵营打过几局、赢了几局（mates）；战绩卡上的「最好的队友 / 最坏的队友」是同队至少 MATE_MIN 局里胜率最高 / 最低的人。
 */
/** 所有真人的赢局数（补发金币用，server/wallet.js 的 seedWallet）。 */
export function allPlayerWins() { return allStats().players.map((p) => ({ id: p.id, wins: p.wins })); }

export function statsFor(guildId, uid = null) {
  const { players, guilds } = allStats();
  const here = guilds.get(safe(guildId)) ?? { games: 0, goodWins: 0, ids: new Set() };
  return { games: here.games, goodWins: here.goodWins, players: players.filter((p) => here.ids.has(p.id) || p.id === uid) };
}

/**
 * 全服排行榜：所有服务器（Discord 各服务器、KOOK 各服务器）合起来。games / goodWins 是所有服务器的总局数，
 * players 是所有打过的真人（个人数字本来就跨服合并）；guilds 是有几个服务器打过。KOOK 和 Discord 账号照样不合并。
 * 单机试玩（server/solo.js）的局不存档，不会出现在这里。
 */
export function statsAll() {
  const { players, guilds } = allStats();
  let games = 0; let goodWins = 0;
  for (const g of guilds.values()) { games += g.games; goodWins += g.goodWins; }
  return { games, goodWins, guilds: guilds.size, players: players.filter((p) => !String(p.id).startsWith('solo-')) };
}

/** 删掉一个房间的存档（单机私桌没人回来、清掉时用）。 */
export function forgetSave(key) {
  for (const [room, t] of pending) if (room.key === key) { clearTimeout(t); pending.delete(room); }
  try { fs.rmSync(fileOf(key), { force: true }); } catch { /* 本来就没有 */ }
}

const parsed = new Map(); // 读过的存档：不会再变，每局结束只读新的那一份

/** 战绩用得到的字段。决策日志和标记很占地方，这里不留。 */
function readForStats(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!d?.winner || !Array.isArray(d.players)) return null;
    return { winner: d.winner, endedAt: d.endedAt, players: d.players.filter(Boolean), timeline: (d.timeline ?? []).filter((e) => e?.kind === 'death'), votes: d.votes ?? [] };
  } catch { return null; }
}

function allStats() {
  const files = []; // [文件名, 服务器目录]
  let dirs = [];
  try { dirs = fs.readdirSync(GAMES); } catch { /* 还没打完过一局 */ }
  for (const g of dirs) {
    try { for (const n of fs.readdirSync(path.join(GAMES, g))) if (n.endsWith('.json')) files.push([n, g]); } catch { /* 不是目录 */ }
  }
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sig = `${files.length}:${files.at(-1)?.[0] ?? ''}`;
  if (statsCache?.sig === sig) return statsCache;
  const by = new Map();
  const guilds = new Map(); // 服务器目录 → { games, goodWins, ids }
  const blank = (p) => ({
    id: p.id, name: p.name, avatar: p.avatar ?? null, games: 0, wins: 0, good: [0, 0], evil: [0, 0],
    teams: { townsfolk: [0, 0], outsider: [0, 0], minion: [0, 0], demon: [0, 0] }, roles: {}, alive: 0,
    recent: [], streak: 0, bestStreak: 0, noms: [0, 0, 0], nominated: [0, 0], executed: 0, nightKilled: 0, votes: [0, 0], last: 0,
    mates: {}, // 队友 id → [同队局数, 赢的局数]
  });
  for (const [n, g] of files) { // 文件名以结束时间开头：按时间先后
    const key = `${g}/${n}`;
    if (!parsed.has(key)) parsed.set(key, readForStats(path.join(GAMES, g, n)));
    const d = parsed.get(key);
    if (!d) continue;
    if (!guilds.has(g)) guilds.set(g, { games: 0, goodWins: 0, ids: new Set() });
    const here = guilds.get(g);
    here.games++;
    if (d.winner === 'good') here.goodWins++;
    // 梦殒春宵有"善良的恶魔""邪恶的镇民"，阵营要看存下来的；旧存档没有这个字段才按角色猜
    const evilOf = new Map(d.players.filter((p) => ROLES[p.role]).map((p) => [p.id, p.evil ?? ['minion', 'demon'].includes(ROLES[p.role].team)]));
    // 死因：座位号 → [被处决几次, 夜里被杀几次]（复活过的人可能死两次）
    const deaths = new Map();
    for (const e of d.timeline ?? []) {
      if (e.kind !== 'death') continue;
      const m = /^(\d+)号 .*?） (.+)$/.exec(e.text ?? '');
      if (!m || /复活|仍然活着|接任/.test(m[2])) continue; // 复活、僵怖假死、恶魔传位都不是真的死
      const c = deaths.get(+m[1]) ?? [0, 0];
      if (/处决/.test(m[2])) c[0]++; else if (/夜|恶魔|杀死|毒发/.test(m[2]) || /夜/.test(e.when ?? '')) c[1]++;
      deaths.set(+m[1], c);
    }
    for (const p of d.players) {
      if (!p.id || /^bot-/.test(p.id) || !ROLES[p.role]) continue;
      here.ids.add(p.id);
      const team = ROLES[p.role].team;
      const evil = evilOf.get(p.id);
      const won = (d.winner === 'evil') === evil;
      const s = by.get(p.id) ?? blank(p);
      if (d.endedAt >= s.last) { s.name = p.name; s.avatar = p.avatar ?? s.avatar; s.last = d.endedAt; } // 名字按最近一局的
      const add = (pair) => { pair[0]++; if (won) pair[1]++; };
      s.games++; if (won) s.wins++;
      add(evil ? s.evil : s.good);
      if (s.teams[team]) add(s.teams[team]);
      add(s.roles[p.role] ??= [0, 0]);
      if (p.alive) s.alive++;
      s.recent.push({ w: won, evil, role: p.role, at: d.endedAt });
      if (s.recent.length > RECENT) s.recent.shift();
      s.streak = won ? s.streak + 1 : 0;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      const died = deaths.get(p.seat);
      if (died) { s.executed += died[0]; s.nightKilled += died[1]; }
      for (const q of d.players) { // 同一阵营的真人队友
        if (!q.id || q.id === p.id || /^bot-/.test(q.id) || !ROLES[q.role] || evilOf.get(q.id) !== evil) continue;
        add(s.mates[q.id] ??= [0, 0]);
      }
      for (const v of d.votes ?? []) {
        const onBlock = v.outcome === 'block' || v.outcome === 'tie';
        if (v.nominator === p.id) { s.noms[0]++; if (evilOf.get(v.nominee)) s.noms[1]++; if (onBlock) s.noms[2]++; }
        if (v.nominee === p.id) { s.nominated[0]++; if (onBlock) s.nominated[1]++; }
        if (!evil && v.voters?.includes(p.id) && v.nominee !== p.id) { s.votes[0]++; if (evilOf.get(v.nominee)) s.votes[1]++; }
      }
      by.set(p.id, s);
    }
  }
  // 最好 / 最坏的队友：同队够局数的人里胜率最高 / 最低（一样就看同队局数多的）。只给名字头像，不给整张队友表
  for (const s of by.values()) {
    const list = Object.entries(s.mates).filter(([id, [g]]) => g >= MATE_MIN && by.has(id))
      .map(([id, [g, w]]) => ({ id, name: by.get(id).name, avatar: by.get(id).avatar, games: g, wins: w, rate: w / g }));
    const best = [...list].sort((a, b) => b.rate - a.rate || b.games - a.games)[0] ?? null;
    const worst = [...list].sort((a, b) => a.rate - b.rate || b.games - a.games)[0] ?? null;
    s.bestMate = best && { ...best, rate: undefined };
    s.worstMate = worst && worst.id !== best?.id ? { ...worst, rate: undefined } : null; // 只有一个够局数的队友：只显示最好的
    delete s.mates;
  }
  const players = [...by.values()].sort((a, b) => b.wins - a.wins || b.games - a.games);
  statsCache = { sig, players, guilds };
  return statsCache;
}
