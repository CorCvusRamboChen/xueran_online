// AI 说书人帮邪恶的程度跟着真实胜率走（2026-11-20 用户：看坏人的胜率，调整他帮坏人的程度）。
//
// 做法：读这台服务器打完的局（data/games），只算 AI 说书人、真人 ≥ 4 的血染局，看邪恶赢了几成。
// 邪恶赢得少 → tilt 为正：说书人把局势看得比实际更偏善良一点，所有「往落后一方偏」的骰子就多帮邪恶一点；赢得多就反过来。
// tilt 加在 storyteller.balance() 上（-1 邪恶大优 … +1 善良大优），只是挪一下天平，规则一条不变。
//
// 局数少的时候往 0 收（n / (n + SHRINK)），一个剧本的局数不够就看全部剧本的。手动定：环境变量 BOTC_EVIL_TILT（-0.4…0.4）。
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, SCRIPTS, rolesOf } from '../engine/roles.js';

export const TARGET = 0.5;     // 想要的邪恶胜率
export const GAIN = 1.2;       // 胜率差 10 个点 → tilt 0.12（局数够多时）
export const MAX_TILT = 0.35;
export const SHRINK = 20;      // 局数的收缩：20 局时只用一半
export const RECENT = 80;      // 只看最近这么多局（说书人的规则一直在改，太早的局不代表现在）
export const MIN_HUMANS = 4;
const SCRIPT_MIN = 15;         // 一个剧本有这么多局才单独算
const TEAMS = new Set(['townsfolk', 'outsider', 'minion', 'demon', 'traveller']);

const GAMES = path.resolve('data/games');
let cache = null; // { at, games }

/** 老存档没写剧本：按角色猜（所有非旅行者的角色都在这个剧本里；先看三个官方剧本）。 */
export function guessScript(roles) {
  const own = roles.filter((r) => ROLES[r]?.team !== 'traveller');
  const order = ['tb', 'bmr', 'snv', ...Object.keys(SCRIPTS).filter((k) => !['tb', 'bmr', 'snv'].includes(k))];
  return order.find((k) => { let pool; try { pool = rolesOf(k); } catch { return false; } return pool?.length && own.every((r) => pool.includes(r)); }) ?? null;
}

/** 一份存档算不算：血染的局、有胜负、AI 说书人、真人够多。返回 { script, evilWon, endedAt } 或 null。 */
export function usable(d) {
  if (!d || !['good', 'evil'].includes(d.winner) || !Array.isArray(d.players)) return null;
  if (d.mode === 'human' || d.tutorial) return null;
  if (!d.players.every((p) => TEAMS.has(ROLES[p.role]?.team))) return null; // 狼人杀、阿瓦隆、诸神黄昏不算
  const humans = d.players.filter((p) => p.id && !/^bot-/.test(p.id)).length;
  if (humans < MIN_HUMANS) return null;
  return { script: d.script ?? guessScript(d.players.map((p) => p.role)), evilWon: d.winner === 'evil', endedAt: d.endedAt ?? 0 };
}

function readGames(dir = GAMES) {
  const out = [];
  let guilds = [];
  try { guilds = fs.readdirSync(dir); } catch { return out; }
  for (const gdir of guilds) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, gdir)).filter((n) => n.endsWith('.json')); } catch { continue; }
    for (const n of names) {
      try { const u = usable(JSON.parse(fs.readFileSync(path.join(dir, gdir, n), 'utf8'))); if (u) out.push(u); } catch { /* 坏文件跳过 */ }
    }
  }
  return out.sort((a, b) => b.endedAt - a.endedAt).slice(0, RECENT);
}

const rate = (list) => ({ n: list.length, evil: list.filter((x) => x.evilWon).length });
const tiltOf = ({ n, evil }) => (n ? Math.max(-MAX_TILT, Math.min(MAX_TILT, GAIN * (TARGET - evil / n) * (n / (n + SHRINK)))) : 0);

/** 汇总：全部和每个剧本的局数、邪恶胜场、tilt。 */
export function summarize(games) {
  const all = rate(games);
  const by = {};
  for (const g of games) (by[g.script ?? '?'] ??= []).push(g);
  return { all: { ...all, tilt: tiltOf(all) }, scripts: Object.fromEntries(Object.entries(by).map(([k, v]) => { const r = rate(v); return [k, { ...r, tilt: tiltOf(r) }]; })) };
}

/**
 * 这一局该用的 tilt 和说明。剧本局数够就用剧本自己的，不够就用全部的。
 * games 给了就不读盘（测试用）；读盘结果缓存 5 分钟。
 */
export function evilTilt(script, { games, env = process.env } = {}) {
  const manual = Number(env.BOTC_EVIL_TILT);
  if (env.BOTC_EVIL_TILT !== undefined && env.BOTC_EVIL_TILT !== '' && Number.isFinite(manual)) {
    return { tilt: Math.max(-0.4, Math.min(0.4, manual)), why: '手动设定（BOTC_EVIL_TILT）' };
  }
  if (!games) {
    if (!cache || Date.now() - cache.at > 5 * 60_000) cache = { at: Date.now(), games: readGames() };
    games = cache.games;
  }
  const s = summarize(games);
  const own = s.scripts[script];
  const use = own && own.n >= SCRIPT_MIN ? { ...own, label: '这个剧本' } : { ...s.all, label: '所有剧本' };
  if (!use.n) return { tilt: 0, why: '还没有可用的对局' };
  return { tilt: use.tilt, why: `${use.label}最近 ${use.n} 局（AI 说书、真人 ≥ ${MIN_HUMANS}）邪恶赢了 ${use.evil} 局（${Math.round((100 * use.evil) / use.n)}%）` };
}

/** 新的一局打完：下次开局重读。 */
export function forgetRates() { cache = null; }
