// 在 KOOK「👋 新人必看」里发（或更新）玩家群二维码卡片。微信、抖音的群二维码 7 天过期，换新图再跑一次就改掉原来那条，不重发。
// 跑在 ~/apps/botc 里（要 data/kook-layout.json 和 KOOK_TOKEN）：
//   set -a; . ~/apps/botc.env; set +a
//   node scripts/kook-groups.mjs <服务器id> qq=图片 wechat=图片 douyin=图片 [wechatUntil=11月28日] [douyinUntil=11月28日]
// 不给的图沿用上次上传的。
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.KOOK_TOKEN;
if (!token) { console.error('没有 KOOK_TOKEN（先载入 botc.env）'); process.exit(1); }
const [gid, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a) => a.split(/=(.*)/s).slice(0, 2)));
const FILE = path.resolve('data/kook-layout.json');
const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const lay = all[gid];
if (!lay?.hub?.welcome) { console.error('这个服务器还没布置（先跑 kook-setup.mjs）'); process.exit(1); }

const BASE = 'https://www.kookapp.cn/api/v3';
const H = { Authorization: `Bot ${token}` };
async function call(p, body, form = false) {
  const r = await fetch(BASE + p, { method: 'POST', headers: form ? H : { ...H, 'Content-Type': 'application/json' }, body: form ? body : JSON.stringify(body) });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`${p}：${j.message}`);
  return j.data;
}
async function upload(file) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  return (await call('/asset/create', fd, true)).url;
}

const groups = lay.hub.groups ?? {};
for (const k of ['qq', 'wechat', 'douyin']) if (args[k]) groups[k] = { ...(groups[k] ?? {}), img: await upload(args[k]) };
if (args.wechatUntil) groups.wechat.until = args.wechatUntil;
if (args.douyinUntil) groups.douyin.until = args.douyinUntil;

const kmd = (content) => ({ type: 'section', text: { type: 'kmarkdown', content } });
const img = (src) => ({ type: 'container', elements: [{ type: 'image', src }] });
const modules = [
  { type: 'header', text: { type: 'plain-text', content: '加入玩家群' } },
  kmd('约局、开服通知、反馈问题都在群里，扫码加入：'),
];
if (groups.qq?.img) modules.push({ type: 'divider' }, kmd('**QQ 群「血染钟楼 Online」**　群号 `1129952650`'), img(groups.qq.img));
if (groups.wechat?.img) modules.push({ type: 'divider' }, kmd(`**微信群「血染 online」**${groups.wechat.until ? `　二维码 ${groups.wechat.until}前有效` : ''}`), img(groups.wechat.img));
if (groups.douyin?.img) modules.push({ type: 'divider' }, kmd(`**抖音群「血染 Online」**　群号 \`944682119126\`${groups.douyin.until ? `　二维码 ${groups.douyin.until}到期` : ''}`), img(groups.douyin.img));
modules.push({ type: 'context', elements: [{ type: 'plain-text', content: '二维码过期了在 💡 建议反馈 里说一声，管理员会换新的。' }] });
const content = JSON.stringify([{ type: 'card', theme: 'info', size: 'lg', modules }]);

let ok = false;
if (lay.hub.groupsMsg) ok = await call('/message/update', { msg_id: lay.hub.groupsMsg, content }).then(() => true, (e) => { console.warn('改原来那条失败，重发：', e.message); return false; });
if (!ok) lay.hub.groupsMsg = (await call('/message/create', { type: 10, target_id: lay.hub.welcome, content })).msg_id;
lay.hub.groups = groups;
// 只改这一个服务器的 hub（运行中的服务会按文件修改时间重新读）
const fresh = JSON.parse(fs.readFileSync(FILE, 'utf8'));
fresh[gid] = { ...fresh[gid], hub: { ...fresh[gid].hub, groups, groupsMsg: lay.hub.groupsMsg } };
fs.writeFileSync(FILE, JSON.stringify(fresh, null, 1));
console.log(`${ok ? '已更新' : '已发出'}：消息 ${lay.hub.groupsMsg}`);
