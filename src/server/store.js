// 对局存档：每个频道一份 data/rooms/<key>.json。状态一变就（合并成每 0.5 秒最多一次）写盘，
// 先写临时文件再改名，写到一半断电也不会留下半个文件。服务器启动时把还没打完的局读回来。
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../engine/roles.js';

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
      players: g.players.map((p) => ({ id: p.id, seat: p.seat, name: p.name, avatar: room.users.get(p.id)?.avatar ?? null, role: p.role, shownRole: p.shownRole, alive: p.alive })),
      timeline: g.timeline, votes: room.voteHistory ?? [],
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data));
  } catch (e) {
    console.warn('[botc] 对局存档失败：', e.message);
  }
}

/** 这个服务器最近的对局（只要摘要）。 */
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
  try { return JSON.parse(fs.readFileSync(path.join(GAMES, safe(guildId), `${safe(id)}.json`), 'utf8')); } catch { return null; }
}

const statsCache = new Map(); // guildId → { sig, stats }：存档没变就不重算
const RECENT = 10;

/**
 * 战绩：这个服务器所有打完的局，按真人玩家汇总（机器人不算）。
 * 阵营按终局时的角色算（莽夫这种中途换阵营的按最后的算）；赢 = 自己阵营赢了，死活不论。
 * 每人：总胜负、好人 / 坏人、镇民 / 外来者 / 爪牙 / 恶魔各自的胜负、每个角色的胜负、活到终局几次、
 * 最近 10 局、当前连胜 / 最长连胜；
 * 场上表现：提名 [次数, 提到邪恶, 送上处决台]、被提名 [次数, 被送上台]、被处决几次、夜里被杀几次、
 * 当好人时举手 [次数, 举在邪恶身上]。死因从时间线的"N号 名字（角色） 被处决 / 被恶魔杀死"里按座位号认。
 */
export function statsFor(guildId) {
  const dir = path.join(GAMES, safe(guildId));
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch { return { games: 0, goodWins: 0, players: [] }; }
  const sig = `${names.length}:${names.at(-1) ?? ''}`;
  const hit = statsCache.get(guildId);
  if (hit?.sig === sig) return hit.stats;
  const by = new Map();
  let games = 0; let goodWins = 0;
  const blank = (p) => ({
    id: p.id, name: p.name, avatar: p.avatar ?? null, games: 0, wins: 0, good: [0, 0], evil: [0, 0],
    teams: { townsfolk: [0, 0], outsider: [0, 0], minion: [0, 0], demon: [0, 0] }, roles: {}, alive: 0,
    recent: [], streak: 0, bestStreak: 0, noms: [0, 0, 0], nominated: [0, 0], executed: 0, nightKilled: 0, votes: [0, 0], last: 0,
  });
  for (const n of names) { // 文件名以结束时间开头：按时间先后
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { continue; }
    if (!d?.winner || !Array.isArray(d.players)) continue;
    games++;
    if (d.winner === 'good') goodWins++;
    const evilOf = new Map(d.players.filter((p) => ROLES[p.role]).map((p) => [p.id, ['minion', 'demon'].includes(ROLES[p.role].team)]));
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
      for (const v of d.votes ?? []) {
        const onBlock = v.outcome === 'block' || v.outcome === 'tie';
        if (v.nominator === p.id) { s.noms[0]++; if (evilOf.get(v.nominee)) s.noms[1]++; if (onBlock) s.noms[2]++; }
        if (v.nominee === p.id) { s.nominated[0]++; if (onBlock) s.nominated[1]++; }
        if (!evil && v.voters?.includes(p.id) && v.nominee !== p.id) { s.votes[0]++; if (evilOf.get(v.nominee)) s.votes[1]++; }
      }
      by.set(p.id, s);
    }
  }
  const players = [...by.values()].sort((a, b) => b.wins - a.wins || b.games - a.games);
  const stats = { games, goodWins, players };
  statsCache.set(guildId, { sig, stats });
  return stats;
}
