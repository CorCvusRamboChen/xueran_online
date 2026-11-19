// 意见箱（2026-11-20 用户：照 Cromma 的意见箱做一个，放在首页「设置」下面）：
// 每一条都会被看见。四栏：已提议 → 已接管 → 已解决 / 已搁置。谁都能看、能提；只有管理员能接管、解决、搁置，并写一句回复和版本号。
// 存在 data/feedback.json，截图存在 data/feedback-img/。管理员是环境变量 BOTC_ADMINS 里的 Discord 账号（逗号分开）。
import fs from 'node:fs';
import path from 'node:path';

let FILE = path.resolve('data/feedback.json');
let IMG = path.resolve('data/feedback-img');
let data = null;

/** 测试用：换一个文件和图片目录。 */
export function useFeedbackFiles(file, imgDir) { FILE = file; IMG = imgDir; data = null; }

const load = () => {
  if (data) return data;
  data = { seq: 0, items: [] };
  try { data = { seq: 0, items: [], ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* 还没有意见箱文件 */ }
  return data;
};
const save = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(data)); fs.renameSync(`${FILE}.tmp`, FILE); }
  catch (e) { console.warn('[botc] 意见箱存不下来：', e.message); }
};

export const KINDS = { bug: 'Bug', feature: '新功能请求', opinion: '已有功能意见' };
export const STATUS = { open: '已提议', taken: '已接管', done: '已解决', shelved: '已搁置' };
const MAX_TEXT = 800;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 700_000;
const RATE = { n: 5, ms: 10 * 60_000 }; // 每人 10 分钟最多提 5 条
const recent = new Map();

export const isAdmin = (uid) => String(process.env.BOTC_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(String(uid));

/** 给前端的列表：最新的在前。 */
export function listFeedback() {
  return [...load().items].sort((a, b) => (b.updatedAt ?? b.at) - (a.updatedAt ?? a.at));
}

/** 截图：data:image/png|jpeg|webp;base64,... → 存成文件，返回文件名。不认识的格式、太大的不收。 */
function saveImage(id, k, url) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(url ?? ''));
  if (!m) throw new Error('截图只收 PNG、JPG、WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('截图太大了（每张最多 700KB）');
  const name = `${id}-${k}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.mkdirSync(IMG, { recursive: true });
  fs.writeFileSync(path.join(IMG, name), buf);
  return name;
}

/** 提一条意见。user：{ id, name, avatar }。 */
export function addFeedback(user, { kind, text, images = [] } = {}) {
  const body = String(text ?? '').replace(/\r/g, '').trim();
  if (!KINDS[kind]) throw new Error('选一下是 Bug、新功能请求还是已有功能意见');
  if (!body) throw new Error('写点什么再提交吧');
  if ([...body].length > MAX_TEXT) throw new Error(`最多 ${MAX_TEXT} 个字`);
  if (!Array.isArray(images) || images.length > MAX_IMAGES) throw new Error(`截图最多 ${MAX_IMAGES} 张`);
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < RATE.ms);
  if (mine.length >= RATE.n) throw new Error('提得太快了，过几分钟再来');
  const d = load();
  const id = ++d.seq;
  const files = images.map((u, k) => saveImage(id, k, u));
  const item = { id, kind, text: body, images: files, by: { id: user.id, name: String(user.name ?? '玩家').slice(0, 24), avatar: user.avatar ?? null }, at: now, updatedAt: now, status: 'open', note: '', version: '', handler: null };
  d.items.push(item);
  recent.set(user.id, [...mine, now]);
  save();
  return item;
}

/** 管理员改状态：接管 / 解决 / 搁置 / 退回已提议，可以写一句回复和版本号。 */
export function setFeedback(user, { id, status, note, version } = {}) {
  if (!isAdmin(user.id)) throw new Error('只有管理员能处理意见');
  const item = load().items.find((x) => x.id === Number(id));
  if (!item) throw new Error('没有这一条');
  if (status != null) { if (!STATUS[status]) throw new Error('不认识的状态'); item.status = status; }
  if (note != null) item.note = String(note).trim().slice(0, 300);
  if (version != null) item.version = String(version).trim().slice(0, 20);
  item.handler = { id: user.id, name: String(user.name ?? '').slice(0, 24) };
  item.updatedAt = Date.now();
  save();
  return item;
}

/** 截图文件的路径（文件名不合法就 null）。 */
export function imagePath(name) {
  return /^\d+-\d\.(png|jpg|webp)$/.test(String(name)) ? path.join(IMG, name) : null;
}

/** 房间里的 feedback 操作：list / add / set。 */
export function feedbackAct(uid, user, p = {}) {
  const me = { id: uid, name: user?.name ?? '玩家', avatar: user?.avatar ?? null };
  if (p.op === 'add') { addFeedback(me, p); return { items: listFeedback(), admin: isAdmin(uid), notice: '收到了，谢谢！' }; }
  if (p.op === 'set') { setFeedback(me, p); return { items: listFeedback(), admin: true }; }
  return { items: listFeedback(), admin: isAdmin(uid) };
}
