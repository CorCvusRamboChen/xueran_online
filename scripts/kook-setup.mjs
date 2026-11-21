// 在服务器上直接布置 KOOK 的桌子（效果和管理员在 KOOK 里发「/血染 布置 N」一样）。
// 跑在 ~/apps/botc 里，布局写进 data/kook-layout.json，正在运行的服务会自己读到新布局（不用重启）。
//   set -a; . ~/apps/botc.env; set +a; node scripts/kook-setup.mjs            列出机器人在的服务器和现在的布局
//   ... node scripts/kook-setup.mjs <服务器id> 3                              布置 3 桌（已有的沿用，删掉的补回来）
import path from 'node:path';
import { KookBot } from '../src/server/kook.js';

const token = process.env.KOOK_TOKEN;
if (!token) { console.error('没有 KOOK_TOKEN（先载入 botc.env）'); process.exit(1); }
const bot = new KookBot({ token, publicUrl: process.env.PUBLIC_URL ?? 'https://botc.rambooo.com', ticketSecret: 'unused', layoutFile: path.resolve('data/kook-layout.json') });
bot.me = await bot.api.get('/user/me');
const [gid, n] = process.argv.slice(2);
if (!gid) {
  const list = await bot.api.get('/guild/list');
  for (const g of list.items ?? []) console.log(`${g.id}  ${g.name}  现在 ${bot.layout.get(String(g.id))?.tables.length ?? 0} 桌`);
  process.exit(0);
}
const lay = await bot.setup(String(gid), Math.max(1, Math.min(10, Number(n) || 3)));
for (const t of lay.tables) console.log(`${t.n}号桌：文字 ${t.text}，广场 ${t.voice}，分组 ${t.category}`);
console.log(`新人必看 ${lay.hub.welcome}，桌子一览 ${lay.hub.board}（消息 ${lay.hub.boardMsg}），社区 ${lay.community.category}`);
process.exit(0);
