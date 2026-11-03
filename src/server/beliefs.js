// 玩家的小魔典是一个隐形指标：不用打断游戏问大家怎么想，看他们给谁打了什么标签、猜了什么角色、连了什么线就大概知道。
// 只收这几样：笔记正文不收，给自己的标记也不收（那是他打算冒充谁的计划，不是他对别人的看法）。
// 这份数据只进存档和往期对局文件，不发给任何客户端，也不参与说书人的判定：先看它准不准，再说要不要用。
import { ROLES } from '../engine/roles.js';

const TAGS = new Set(['townsfolk', 'outsider', 'minion', 'demon']);
const LINKS = new Set(['trust', 'sus', 'ally', 'counter', 'info']);
const EVIL_TEAMS = new Set(['minion', 'demon']);
const MAX_LINKS = 64;   // 一个人的连线上限
const MAX_EVENTS = 2000; // 一局的变化条数上限，够 15 个人每人改 130 多次

/** 客户端发来的标记只留认识的内容，别的都扔掉。 */
export function cleanMarks(raw, ids, uid) {
  const tags = {};
  for (const id of ids) {
    if (id === uid) continue;
    const m = Object.hasOwn(raw?.tags ?? {}, id) ? raw.tags[id] : null;
    const tag = TAGS.has(m?.tag) ? m.tag : null;
    const role = typeof m?.role === 'string' && Object.hasOwn(ROLES, m.role) ? m.role : null;
    if (tag || role) tags[id] = { tag, role };
  }
  const seen = new Set();
  const links = [];
  for (const l of Array.isArray(raw?.links) ? raw.links.slice(0, MAX_LINKS * 2) : []) {
    if (!ids.has(l?.a) || !ids.has(l?.b) || l.a === l.b || !LINKS.has(l?.kind)) continue;
    const k = linkKey(l);
    if (!seen.has(k) && links.length < MAX_LINKS) { seen.add(k); links.push({ a: l.a, b: l.b, kind: l.kind }); }
  }
  return { tags, links };
}

const linkKey = (l) => `${l.a}>${l.b}:${l.kind}`;
const sameTag = (x, y) => x?.tag === y?.tag && x?.role === y?.role;

/** 两份标记差在哪：tags 里 null 表示删了。没变就返回 null。 */
export function diffMarks(prev, next) {
  const tags = {};
  for (const id of new Set([...Object.keys(prev.tags), ...Object.keys(next.tags)])) {
    if (!sameTag(prev.tags[id], next.tags[id])) tags[id] = next.tags[id] ?? null;
  }
  const had = new Set(prev.links.map(linkKey));
  const has = new Set(next.links.map(linkKey));
  const add = next.links.filter((l) => !had.has(linkKey(l)));
  const del = prev.links.filter((l) => !has.has(linkKey(l)));
  return Object.keys(tags).length || add.length || del.length ? { tags, add, del } : null;
}

const blank = () => ({ tags: {}, links: [] });

/** 记下一个人最新的标记：只存变化，这样能看出谁在第几天改了主意。客户端每次发全量，重发不会多记。 */
export function noteMarks(state, g, uid, raw, at = Date.now()) {
  const s = state?.gameId === g.id ? state : { gameId: g.id, now: {}, log: [] };
  const next = cleanMarks(raw, new Set(g.players.map((p) => p.id)), uid);
  const change = diffMarks(s.now[uid] ?? blank(), next);
  if (!change) return s;
  s.now[uid] = next;
  if (s.log.length < MAX_EVENTS) s.log.push({ at, night: g.night ?? 0, day: g.day ?? 0, phase: g.phase, by: uid, ...change });
  return s;
}

/** 按变化记录倒回到某一刻的标记：upTo(事件) 为假的就停。线下分析用。 */
export function replayMarks(log, upTo = () => true) {
  const now = {};
  for (const e of log ?? []) {
    if (!upTo(e)) break;
    const m = (now[e.by] ??= blank());
    for (const [id, v] of Object.entries(e.tags ?? {})) { if (v) m.tags[id] = v; else delete m.tags[id]; }
    const gone = new Set((e.del ?? []).map(linkKey));
    m.links = [...m.links.filter((l) => !gone.has(linkKey(l))), ...(e.add ?? [])];
  }
  return now;
}

/**
 * by 觉得 target 怎么样：1 偏邪恶，-1 偏善良，0 没表态。猜的角色最明确，其次标签，最后才看连线。
 * 连线只算从自己连出去的：「3 号怀疑 5 号」多半是在记 3 号的想法，不是自己的。
 */
export function leaning(marks, by, target) {
  const m = marks?.tags?.[target];
  const team = m?.role ? ROLES[m.role]?.team : m?.tag;
  if (team) return EVIL_TEAMS.has(team) ? 1 : -1;
  const own = (marks?.links ?? []).filter((l) => l.a === by && l.b === target);
  if (own.some((l) => l.kind === 'sus')) return 1;
  if (own.some((l) => l.kind === 'trust')) return -1;
  return 0;
}

/**
 * 全镇的看法。from(id) 决定算谁的标记（比如只算善良玩家：邪恶知道答案，他们的标记不代表"猜"）。
 * 每人：evil / good 各有几个人这么想，suspect 是平滑过的怀疑度（没人表态时 0.5）。
 */
export function readTown(now, ids, from = () => true) {
  const out = {};
  for (const id of ids) {
    let evil = 0; let good = 0;
    for (const [by, marks] of Object.entries(now)) {
      if (by === id || !from(by)) continue;
      const v = leaning(marks, by, id);
      if (v > 0) evil++; else if (v < 0) good++;
    }
    out[id] = { evil, good, suspect: (evil + 1) / (evil + good + 2) };
  }
  return out;
}
