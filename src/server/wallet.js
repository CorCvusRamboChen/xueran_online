// 钱包：每个账号的金币（data/wallet.json）。和战绩一样按账号算，哪个服务器赢的都算他的。
// · 第一次启动时补发：所有赢过至少一局的真人各 1 枚（seeded 标记，只发一次）。
// · 以后每赢一局 +1：至少 COIN_MIN_REAL 个真人的完整对局才算，机器人、教程不算。
// · 花：惩罚场外的道具（shared/pelt.js），扣钱和记账在这里。
// 写盘先写临时文件再改名。每笔都记在 log 里（最近 50 笔），方便查账。
import fs from 'node:fs';
import path from 'node:path';
import { COIN_MIN_REAL } from '../shared/pelt.js';

let FILE = path.resolve('data/wallet.json');
let data = null;

/** 测试用：换一个文件（或 null = 只放内存）。 */
export function useWalletFile(file) { FILE = file; data = null; }

function load() {
  if (data) return data;
  data = { seeded: false, users: {} };
  if (FILE) { try { data = { seeded: false, users: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* 还没有钱包文件 */ } }
  return data;
}
function save() {
  if (!FILE) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(data));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (e) { console.warn('[botc] 钱包写盘失败：', e.message); }
}
const user = (uid) => (load().users[uid] ??= { coins: 0, log: [] });
const note = (u, n, why) => { u.log.push({ at: Date.now(), n, why }); if (u.log.length > 50) u.log.splice(0, u.log.length - 50); };

export function balance(uid) { return load().users[uid]?.coins ?? 0; }

export function addCoins(uid, n, why) {
  const u = user(uid);
  u.coins += n;
  note(u, n, why);
  save();
  return u.coins;
}

/** 扣钱：不够就抛错（不扣）。 */
export function spendCoins(uid, n, why) {
  const u = user(uid);
  if (u.coins < n) throw new Error(`金币不够：要 ${n} 枚，你有 ${u.coins} 枚`);
  u.coins -= n;
  note(u, -n, why);
  save();
  return u.coins;
}

/** 补发：赢过至少一局的真人各 1 枚，只发一次。players：[{ id, wins }]（战绩汇总，已经去掉机器人）。返回发了几个人。 */
export function seedWallet(players) {
  const d = load();
  if (d.seeded) return 0;
  let n = 0;
  for (const p of players) if (p.wins > 0 && !String(p.id).startsWith('bot-')) { const u = user(p.id); u.coins += 1; note(u, 1, '补发：赢过的人各一枚'); n++; }
  d.seeded = true;
  save();
  return n;
}

/** 一局打完：赢的一方的真人各 +1。返回拿到金币的人的 id。 */
export function awardWins(room) {
  const g = room.game;
  if (!g?.winner || room.tutorial || typeof g.evilOf !== 'function') return [];
  const real = g.players.filter((p) => !room.isFake(p.id) && !p.seat7);
  if (real.length < COIN_MIN_REAL) return [];
  const won = real.filter((p) => g.evilOf(p) === (g.winner === 'evil'));
  for (const p of won) addCoins(p.id, 1, `赢了一局（${g.winReason ?? ''}）`);
  return won.map((p) => p.id);
}

/** room.wallet 用的接口（测试里可以换成假的）。 */
export const WALLET = { balance, addCoins, spendCoins, awardWins };
