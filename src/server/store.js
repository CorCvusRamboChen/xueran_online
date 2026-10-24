// 对局存档：每个频道一份 data/rooms/<key>.json。状态一变就（合并成每 0.5 秒最多一次）写盘，
// 先写临时文件再改名，写到一半断电也不会留下半个文件。服务器启动时把还没打完的局读回来。
import fs from 'node:fs';
import path from 'node:path';

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
      return { id: d.id, endedAt: d.endedAt, winner: d.winner, reason: d.reason, days: d.days, players: d.players.map((p) => ({ seat: p.seat, name: p.name, role: p.role })) };
    } catch { return null; }
  }).filter(Boolean);
}

export function getGame(guildId, id) {
  try { return JSON.parse(fs.readFileSync(path.join(GAMES, safe(guildId), `${safe(id)}.json`), 'utf8')); } catch { return null; }
}
