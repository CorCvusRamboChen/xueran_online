// 白天的小镇：PixiJS 画布，斜视角（类 3D，参考极乐迪斯科）。
// 逻辑坐标是俯视平面（和服务器一样），画的时候投影成 2:1 斜视角：屏幕 x = x − y，屏幕 y = (x + y)/2 − 高度。
// · 地面层：Tiled 地图拼成的俯视大图，整层套一个斜切矩阵，直接"压扁"成斜视角；房子地板、海、广场台阶也在这层。
// · 立体层：建筑（程序画的体块，以后换成手绘大图切出来的前景块）、摆设、小人，每帧按前后关系排序互相遮挡。
// · 房子拆成"后墙"和"前墙+屋顶"两块：人在屋里时夹在中间；有人在里面时前墙和屋顶淡掉，露出剖开的室内。
// 头像、名字、地名是 HTML，由 TownMap 按 onFrame 给的屏幕坐标摆放。
import 'pixi.js/unsafe-eval';
import { tonedCanvas } from './tone.js'; // Discord 的内容安全策略不允许 eval，Pixi 需要这个补丁
import { Application, Container, Sprite, Graphics, Texture, ImageSource, CanvasSource, Matrix, Rectangle, ColorMatrixFilter, TilingSprite } from 'pixi.js';
import { positionAt, houseAt, distToLine, pathLength, pointAt } from '../../../src/shared/map.js';
import { TILE, TILE_PX, TILESET_COLS, COBBLE } from '../../../src/shared/tiles.js';
import { footstep, knock } from './footsteps.js';
import { setLake, setWind } from '../ambience.js';
import { setZoneNow } from './ambience.js';
import { loadTileset } from './tileset.js';
import { PROPS, RASTER_SCALE, raster, houseFloor } from './sprites.jsx';
import { serverNow, hue } from '../util.jsx';
import { onDisplay, avatarMode } from '../display.js';
import { MODEL_CHARS } from './models.js';
// 3D 小人（avatar3d.js）先不用：地图上还是 2D 小人。网址带 ?avatar3d（程序搭的）或 ?avatar3d=glb（AI 模型打样）时打开
const HAT = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hat') : null; // 打样：所有 AI 模型戴同一顶帽子
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
const PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf'); // 左上角显示帧率和每帧耗时
const LIVE_PX_PER_M = 128 / (2 * 1.22);
// 3D 小人的衣服颜色（按座位，一人一色）：极乐迪斯科那种旧、灰但分得开的颜色，相邻座位色相差得远
const CLOTH = ['#8a3b33', '#3f6f78', '#b5913f', '#5a4a74', '#6f7a3a', '#a2582f', '#3c5a86', '#d0c4a2',
  '#2f5a45', '#7a4a5e', '#7d8a90', '#9a6b2f', '#3a3f4a', '#b46a6a', '#4f7f6a']; // 实时渲染一格（缩放 1）里 1 米多少像素，和 avatar3d.js 的 FRAME_H / (2·CAM_HALF) 一样
const DIRS = 8; const FRAME_W = 96; const FRAME_H = 128;

const INK = 0x1d2524;
// Codex 画的斜视角小镇大图（和 ?preview=town 导出的底稿对齐；尺寸不同会拉伸到底稿大小）。有它就不画程序占位的地面和建筑。
// 每个剧本一套：暗流涌动在 assets/world/，其他剧本在 assets/world-<剧本>/。
const BASE_FILES = import.meta.glob('../assets/world*/town-base.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' });
const artDir = (id) => (id === 'tb' ? 'world' : `world-${id}`);
const baseFor = (id) => Object.entries(BASE_FILES).find(([p]) => p.split('/').at(-2) === artDir(id))?.[1] ?? null;
export const PAINTED_BASE = baseFor('tb');
/**
 * 手绘大图的贴图：开 mipmap，镜头拉远（缩小显示）时不发虚、不闪；图可以是两倍分辨率的（显示尺寸由调用方定）。
 */
const paintTex = (img) => new Texture({ source: new ImageSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', antialias: true }) });

/** 超过显卡贴图上限的大图（比如两倍分辨率的底图）切成几块再拼，显示在 (x, y, w, h)。 */
function tiledSprites(img, x, y, w, h, max) {
  const cols = Math.ceil(img.width / max); const rows = Math.ceil(img.height / max);
  const out = new Container();
  if (cols === 1 && rows === 1) {
    const s = new Sprite(paintTex(img));
    s.position.set(x, y); s.width = w; s.height = h;
    out.addChild(s);
    return out;
  }
  const tw = Math.ceil(img.width / cols); const th = Math.ceil(img.height / rows);
  const kx = w / img.width; const ky = h / img.height;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = c * tw; const sy = r * th;
      const cw = Math.min(tw, img.width - sx); const ch = Math.min(th, img.height - sy);
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      const s = new Sprite(paintTex(cv));
      s.position.set(x + sx * kx, y + sy * ky); s.width = cw * kx; s.height = ch * ky;
      out.addChild(s);
    }
  }
  return out;
}

/**
 * 建筑身后的一圈柔和暗影（按图的轮廓模糊出来）：前面的房子压在后面的建筑上时，交界处会暗下去一圈，
 * 一眼就看得出谁在前、谁在后；落在地上也像一层接触阴影。src 是图或画布，显示在 (x, y, w, h)。
 */
function haloSprite(src, x, y, w, h, { blur = 12, alpha = 0.5 } = {}) {
  const pad = blur * 2;
  const sil = document.createElement('canvas'); sil.width = src.width; sil.height = src.height;
  const sc = sil.getContext('2d');
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = '#05080a'; sc.fillRect(0, 0, sil.width, sil.height);
  const c = document.createElement('canvas'); c.width = src.width + pad * 2; c.height = src.height + pad * 2;
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(sil, pad, pad);
  const k = w / src.width;
  const sp = new Sprite(paintTex(c));
  sp.position.set(x - pad * k, y - pad * (h / src.height));
  sp.width = c.width * k; sp.height = c.height * (h / src.height);
  sp.alpha = alpha;
  return sp;
}

/** 一张建筑图连同身后的暗影，装进一个容器（淡出时两者一起淡）。 */
function withHalo(sprite, src, rect, opts = {}) {
  const box = new Container();
  const k = opts.alpha ?? 0.5;
  // 两层：贴着轮廓的一圈实一点的暗边（分出前后），外面一层宽而淡的阴影（落在地上像接触阴影）
  box.addChild(
    haloSprite(src, rect.x, rect.y, rect.w, rect.h, { blur: 20, alpha: k * 0.7 }),
    haloSprite(src, rect.x, rect.y, rect.w, rect.h, { blur: 5, alpha: k * 1.3 }),
    sprite,
  );
  return box;
}

const loadImage = (src) => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });

// Codex 画的能进的房子：house-<id>-closed（外观）、house-<id>-closed-lit（亮灯的外观，能进的房子用）、
// house-<id>-open（剖开的室内），都按 houseCrop() 的范围对齐。
const HOUSE_FILES = Object.entries(import.meta.glob('../assets/world*/house-*.{webp,png}', { eager: true, query: '?url', import: 'default' }));
const housesArtFor = (id) => Object.fromEntries(HOUSE_FILES.filter(([p]) => p.split('/').at(-2) === artDir(id))
  .map(([p, url]) => [p.split('/').pop().replace(/\.(webp|png)$/, ''), url]));

/** 一间房子的底稿/手绘图覆盖的世界像素范围：四周留 70，上方多留 180（给尖塔、外伸的结构留地方）。 */
export function houseCrop(hs) {
  const top = (hs.height || 20) + Math.min(hs.w, hs.h) * 0.38 + 40;
  const b = screenBounds(hexOf(hs.x - 70, hs.y - 70, hs.w + 140, hs.h + 140, top + 180));
  return { x: Math.floor(b.l), y: Math.floor(b.t), w: Math.ceil(b.r - b.l), h: Math.ceil(b.b - b.t) };
}

/**
 * 手绘房子图实际铺在哪：先按原来的占地（artW × artH，地图放大或手动调过占地时用得上）算出底稿范围，
 * 再以占地中心的地面点为原点缩放 k（外观用 closedK，室内用 openK）。
 */
export function houseArtRect(hs, k = 1, [ox, oy] = [0, 0]) {
  const aw = hs.artW ?? hs.w; const ah = hs.artH ?? hs.h;
  const cx = hs.x + hs.w / 2 + ox; const cy = hs.y + hs.h / 2 + oy; // ox / oy：这张图单独挪多少（外观可以和室内错开）
  const r = houseCrop({ ...hs, x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah });
  if (k === 1) return r;
  const o = iso(cx, cy);
  return { x: o.x + (r.x - o.x) * k, y: o.y + (r.y - o.y) * k, w: r.w * k, h: r.h * k };
}
/** 外观图的范围（带外观自己的缩放和单独偏移）。 */
export const closedArtRect = (hs) => houseArtRect(hs, hs.closedK ?? 1, [hs.closedDx ?? 0, hs.closedDy ?? 0]);

/** 从一张对齐到 rect 的图里按轮廓切出一块。 */
function cutoutFrom(img, rect, poly) {
  const b = screenBounds(poly);
  const [l, t] = [Math.floor(b.l), Math.floor(b.t)];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.r) - l; canvas.height = Math.ceil(b.b) - t;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - l, y - t) : ctx.moveTo(x - l, y - t)));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, rect.x - l, rect.y - t, rect.w, rect.h);
  const sp = new Sprite(Texture.from(canvas, true));
  sp.position.set(l, t);
  return sp;
}

/** 图片四个角是不是透明的（透明背景的 PNG 整张直接用）。 */
function hasAlpha(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const pts = [[2, 2], [img.width - 3, 2], [2, img.height - 3], [img.width - 3, img.height - 3]];
  return pts.every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 10);
}

/** 透明 PNG 里不透明部分的凸包（换算到世界像素），用来判断"有没有挡住我"。 */
function opaqueHull(img, rect) {
  const step = 8; const w = img.width; const h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) pts.push([rect.x + (x / w) * rect.w, rect.y + (y / h) * rect.h]);
  return pts.length > 2 ? hull(pts) : [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]];
}

/** 透明 PNG 的逐像素点击判定（每 4 像素取一格）：只有点在画出来的房子上才算，凸包里的空地不算。 */
function alphaHit(img, rect) {
  const step = 4; const w = img.width; const h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const mw = Math.ceil(w / step); const mh = Math.ceil(h / step);
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 200) mask[(y / step) * mw + x / step] = 1;
  return (wx, wy) => {
    const u = Math.floor(((wx - rect.x) / rect.w) * mw); const v = Math.floor(((wy - rect.y) / rect.h) * mh);
    return u >= 0 && v >= 0 && u < mw && v < mh && mask[v * mw + u] === 1;
  };
}

/** 从大图里按轮廓切出一块（建筑前景），返回精灵和它的屏幕范围。 */
function cutout(base, poly, G = GUIDE) {
  const b = screenBounds(poly);
  const [l, t] = [Math.floor(b.l), Math.floor(b.t)];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.r) - l; canvas.height = Math.ceil(b.b) - t;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - l, y - t) : ctx.moveTo(x - l, y - t)));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(base, G.x - l, G.y - t, G.w, G.h);
  const s = new Sprite(Texture.from(canvas, true));
  s.position.set(l, t);
  return s;
}
const STEP = 0.34;          // 走一步多少秒
const GROUND_PX = 1.6;      // 地面贴图每个逻辑单位几个像素
const PERSON = 0.79;        // 小人缩放（画框 40×52；原来 0.72，放大了 1.1 倍）
const SPRITE3D = 0.62;      // 3D 小人贴图的缩放（烘焙时 128px 高 → 地图上约 50px；原来 0.56，放大了 1.1 倍）
// 3D 小人的动作播放（图集按动作分段，见 avatar3d.js 的 bakeSheet）
const START_T = 0.3;        // 从站着起步：开头这几秒播起步动作
const RUN_START_T = 0.36;   // 从站着直接跑：开头这几秒播「冲出去」
const FIDGETS = ['shift', 'rub', 'look']; // 站着时偶尔做的小动作
const FIDGET_GAP = [6, 9];  // 两次小动作之间隔几秒：6 + 随机 0–9
const FIDGET_SPEED = 1.4;   // 小动作播快一点（原片 6–9 秒太长，看着像卡住）
const STOP_T = 0.42;        // 停下来用几秒：最后半段开始减速，比服务器晚 STOP_T/2 秒停稳，这段播停步动作
const MAX_RATE = { walk: 2, run: 1.6 }; // 地图上走得比动作本身快时，步频最多加快到几倍，再快就让脚滑一点（不然腿抡成风车）
const HEAD_PAD = 0.12;      // 头像比 3D 小人的头顶（模型身高）再高几米
const TURN_T = 0.06;        // 转身：每转 45° 用几秒（不再一帧掉头）
const bits = (n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1);

/** 斜视角投影：逻辑 (x, y, 高度 z) → 世界像素。 */
export const iso = (x, y, z = 0) => ({ x: x - y, y: (x + y) / 2 - z });
const P = (x, y, z = 0) => [x - y, (x + y) / 2 - z];
/** 一张能无缝平铺的分形噪声（白色 + 透明度），前景雾用。几层不同粗细的平滑噪声叠起来，周期对齐所以铺开看不到接缝。 */
function fogNoise(size = 256) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const octaves = [[4, 0.5], [8, 0.26], [16, 0.15], [32, 0.09]].map(([n, w]) => ({ n, w, g: Array.from({ length: n * n }, () => Math.random()) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const { n, w, g } of octaves) {
      const fx = (x / size) * n; const fy = (y / size) * n;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = smooth(fx - x0); const ty = smooth(fy - y0);
      const at = (i, j) => g[((j % n) * n) + (i % n)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      v += (a + (b - a) * ty) * w;
    }
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (v - 0.38) * 2.4))); // 只留浓的那些团，中间是空的
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
/** 一团中间实、边缘渐隐的白色软圆（地面雾的雾团）。 */
function fogBlob(size = 128) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, a] of [[0, 0.9], [0.45, 0.45], [1, 0]]) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}
/** 竖向渐变（远处的雾气）：上面浓、往下到一半就没了。 */
function hazeGradient() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  return c;
}

/**
 * 地面雾团的默认摆法（没在编辑器里手动摆过时用）：沿溪谷、林子边，再在空地上撒一些。
 * 用固定的随机种子，编辑器里看到的和游戏里一模一样。每团 { x, y（地图坐标）, w（宽，世界像素）, a（浓度）, f（扁度，高 = 宽 × f）, top（盖在房子前面）}。
 */
export function autoFogSpots(town) {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const F = town.fog ?? {}; const k = town.artScale ?? 1; const out = [];
  const add = (x, y, weight) => out.push({ x: Math.round(x), y: Math.round(y), w: Math.round((320 + rnd() * 360) * k), a: Math.round((F.ground ?? 0.3) * weight * (0.6 + rnd() * 0.4) * 100) / 100, f: 0.36 });
  const band = town.water?.band;
  if (band) {
    for (let i = 1; i < band.pts.length; i++) {
      const [ax, ay] = band.pts[i - 1]; const [bx, by] = band.pts[i];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 110));
      for (let j = 0; j < n; j++) add(ax + ((bx - ax) * (j + rnd())) / n, ay + ((by - ay) * (j + rnd())) / n, 1);
    }
  }
  for (const c of town.circles) if (c.kind === 'trees') add(c.x + (rnd() - 0.5) * c.r, c.y + (rnd() - 0.5) * c.r, 0.8);
  const extra = Math.round((town.w * town.h) / 90000);
  for (let i = 0; i < extra; i++) add(rnd() * town.w, rnd() * town.h, 0.55);
  for (const s of town.fogSpots ?? []) add(s.x, s.y, s.a);
  return out;
}
/** 一团地面雾的软圆（编辑器里用 CSS 画同样的渐变）。 */
export const FOG_BLOB_STOPS = [[0, 0.9], [0.45, 0.45], [1, 0]];

/** 底稿（交给 Codex 重绘的整张小镇）覆盖的世界像素范围。手绘大图要和它一样大、一一对齐。 */
export const GUIDE = { x: -1440, y: -120, w: 3280, h: 1760 };
/** 这张地图的手绘底图实际铺多大：地图数据整体放大过（artScale，见 maps/bmr.js）时，底图跟着拉伸；地图比默认范围大时在数据里写 guide。 */
export const guideOf = (town) => { if (town?.guide) return town.guide; const k = town?.artScale ?? 1; return { x: GUIDE.x * k, y: GUIDE.y * k, w: GUIDE.w * k, h: GUIDE.h * k }; };
/** 世界像素 → 地面上的逻辑坐标。 */
export const unIso = (sx, sy) => ({ x: (sx + 2 * sy) / 2, y: (2 * sy - sx) / 2 });

const hex = (c) => (typeof c === 'number' ? c : parseInt(c.slice(1), 16));
function shade(c, k) {
  const n = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

const LINE = { width: 1.3, color: INK, join: 'round' };
/** 画一个面（逻辑坐标的点列）。 */
function face(g, pts, color, line = LINE) {
  g.poly(pts.flatMap((p) => P(...p))).fill(color).stroke(line);
}
/** 竖直墙面上的一个小方块（窗、门）：沿墙从 a 到 b（0–1），高度 z0–z1。 */
function onWall(g, [ax, ay], [bx, by], a, b, z0, z1, color, line = { width: 1, color: INK }) {
  const p = (t, z) => [ax + (bx - ax) * t, ay + (by - ay) * t, z];
  face(g, [p(a, z0), p(b, z0), p(b, z1), p(a, z1)], color, line);
}

// ───────────── 地面 ─────────────

/** 一块地面贴图：Tiled 地块 + 雪堆 + 广场台阶 + 海和码头，俯视画在 canvas 上。 */
async function paintGround(town, map, ox, oy, w, h) {
  const { gather: PLAZA, w: MAP_W, h: MAP_H } = town;
  const TOWER = town.circles.find((c) => c.kind === 'tower');
  const WATER_Y = town.water.below; const PIER = town.walkways[0];
  const tiles = await loadTileset();
  const k = GROUND_PX;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * k); canvas.height = Math.ceil(h * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  const layer = map.layers.find((l) => l.type === 'tilelayer');
  const c0 = Math.floor(ox / TILE); const c1 = Math.ceil((ox + w) / TILE);
  const r0 = Math.floor(oy / TILE); const r1 = Math.ceil((oy + h) / TILE);
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const gid = layer.data[r * map.width + c];
      if (!gid) continue;
      const id = gid - 1;
      // 多画半个像素，避免缩放后格子之间露缝
      ctx.drawImage(tiles, (id % TILESET_COLS) * TILE_PX, Math.floor(id / TILESET_COLS) * TILE_PX, TILE_PX, TILE_PX, c * TILE, r * TILE, TILE + 0.4, TILE + 0.4);
    }
  }
  const s = TILE / TILE_PX; // Tiled 像素 → 逻辑单位
  for (const o of map.layers.find((l) => l.name === 'decals')?.objects ?? []) {
    if (o.type !== 'drift') continue;
    const [x, y, rx, ry] = [(o.x + o.width / 2) * s, (o.y + o.height / 2) * s, (o.width / 2) * s, (o.height / 2) * s];
    ctx.fillStyle = '#f6f6f2'; ctx.strokeStyle = '#c4c6c0'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - rx * 0.16, y - ry * 0.2, rx * 0.45, ry * 0.36, 0, 0, 7); ctx.fill();
  }
  // 钟楼脚下三层圆台阶
  for (const [r, col] of [[TOWER.r + 40, '#dcdad2'], [TOWER.r + 28, '#e4e2db'], [TOWER.r + 16, '#eceae4']]) {
    ctx.fillStyle = '#9d9a90'; ctx.beginPath(); ctx.arc(PLAZA.x + 2, PLAZA.y + 3, r, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.strokeStyle = '#1d2524'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(PLAZA.x, PLAZA.y, r, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.setLineDash([3, 3]); ctx.strokeStyle = '#7d8380';
  ctx.beginPath(); ctx.arc(PLAZA.x, PLAZA.y, PLAZA.r - 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  // 结冰的海 + 码头
  if (oy + h > WATER_Y) {
    ctx.fillStyle = '#56676c'; ctx.fillRect(ox, WATER_Y, w, MAP_H - WATER_Y);
    for (let i = 0; i < 70; i++) {
      const fx = hash(i, 1) * MAP_W; const fy = WATER_Y + 14 + hash(i, 2) * (MAP_H - WATER_Y - 20);
      ctx.fillStyle = hash(i, 3) > 0.5 ? '#c9d6d9' : '#8fa3a8';
      ctx.beginPath(); ctx.ellipse(fx, fy, 8 + hash(i, 4) * 26, 3 + hash(i, 5) * 7, 0.2, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#9b958a'; ctx.fillRect(ox, WATER_Y - 6, w, 8);
    ctx.strokeStyle = '#1d2524'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(ox, WATER_Y + 2); ctx.lineTo(ox + w, WATER_Y + 2); ctx.stroke();
    ctx.fillStyle = '#8b6b4a'; ctx.fillRect(PIER.x, WATER_Y, PIER.w, PIER.h + PIER.y - WATER_Y);
    ctx.strokeStyle = '#5f452e'; ctx.lineWidth = 1;
    for (let y = WATER_Y + 8; y < PIER.y + PIER.h; y += 8) { ctx.beginPath(); ctx.moveTo(PIER.x, y); ctx.lineTo(PIER.x + PIER.w, y); ctx.stroke(); }
    ctx.strokeStyle = '#1d2524'; ctx.strokeRect(PIER.x, WATER_Y, PIER.w, PIER.h + PIER.y - WATER_Y);
  }
  return canvas;
}

/**
 * 没有 Tiled 地图的地图（灰盒）：按地图数据直接画地面——底色、落叶、路、水、桥、集合点。
 * 颜色在地图数据的 palette 里。
 */
function paintPlainGround(town, ox, oy, w, h) {
  const pal = { ground: '#8a7d66', speck: ['#a8452a', '#c8742e', '#6a4a2a'], coach: '#b6a98e', lane: '#a99b80', trail: '#9a8b70', water: '#2c3a42', bank: '#5a4e3e', plaza: '#b9b0a0', ...town.palette };
  const k = GROUND_PX;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * k); canvas.height = Math.ceil(h * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pal.ground; ctx.fillRect(ox, oy, w, h);
  // 分区的地面：边缘虚化，一片慢慢过渡到另一片；后写的区在下面（一个点算第一个圈住它的区）
  const zones = town.zones ?? [];
  const zonePath = (z) => { ctx.beginPath(); z.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  if (zones.length) {
    // 画在一张很小的图上再放大，放大时的插值就是虚边（ctx.filter 的模糊又慢，有的手机还不支持）
    const q = 24; const pad = q * 4;
    const small = document.createElement('canvas');
    small.width = Math.ceil((w + pad * 2) / q); small.height = Math.ceil((h + pad * 2) / q);
    const sc = small.getContext('2d');
    sc.scale(1 / q, 1 / q); sc.translate(pad - ox, pad - oy);
    for (const z of [...zones].reverse()) {
      sc.fillStyle = z.ground; sc.beginPath(); z.poly.forEach(([x, y], i) => (i ? sc.lineTo(x, y) : sc.moveTo(x, y))); sc.closePath(); sc.fill();
    }
    for (const b of town.patches ?? []) { sc.fillStyle = b.color; sc.beginPath(); sc.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, 7); sc.fill(); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, ox - pad, oy - pad, small.width * q, small.height * q);
  }
  // 地上的落叶、草斑
  for (let i = 0; i < 1400; i++) {
    const x = hash(i, 11) * town.w; const y = hash(i, 12) * town.h;
    if (x < ox - 20 || x > ox + w + 20 || y < oy - 20 || y > oy + h + 20) continue;
    const zone = town.zoneAt?.(x, y);
    if (zone?.sparse && hash(i, 17) > zone.sparse) continue;
    const speck = zone?.speck ?? pal.speck;
    ctx.fillStyle = speck[i % speck.length];
    ctx.globalAlpha = 0.35 + hash(i, 13) * 0.4;
    ctx.beginPath(); ctx.ellipse(x, y, 2 + hash(i, 14) * 5, 1.2 + hash(i, 15) * 2.5, hash(i, 16) * 3, 0, 7); ctx.fill();
  }
  // 花圃：深一点的草地上撒满花点（梦殒春宵）
  for (const [i, b] of (town.flowerbeds ?? []).entries()) {
    ctx.globalAlpha = 0.9; ctx.fillStyle = b.dead ? '#7a6f4e' : pal.bed;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, 7); ctx.fill();
    for (let j = 0; j < (b.rx * b.ry) / 42; j++) {
      const a = hash(i + 40, j) * 7; const d = Math.sqrt(hash(i + 41, j)) * 0.94;
      ctx.fillStyle = (b.dead ? ['#6a5a3a', '#8a7a52', '#5a4a30'] : pal.speck)[j % 3];
      ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * d * b.rx, b.y + Math.sin(a) * d * b.ry, 2.4 + hash(i + 42, j) * 2.4, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const stroke = (pts, width, color, dash, cap = 'round') => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = cap; ctx.lineJoin = 'round';
    ctx.setLineDash(dash ?? []);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);
  };
  // 路：先画一圈深色的边，再画路面。小路先画、主路后画，支路接进主路的圆头被主路盖住，不会冒出一个"帽子"
  const rank = { trail: 0, lane: 1, street: 2, coach: 2 };
  const roads = [...town.roads].sort((a, b) => (rank[a.kind] ?? 1) - (rank[b.kind] ?? 1));
  for (const r of roads) stroke(r.pts, r.half * 2 + 4, '#3a3226');
  for (const r of roads) stroke(r.pts, r.half * 2, pal[r.kind] ?? pal.lane);
  for (const r of roads) if (r.kind === 'coach' && !zones.length) stroke(r.pts, 2, '#8a7c62', [10, 14]); // 车辙
  // 分区的路面：同一条路经过哪个区就是哪种路：花街铺石、营地压出车辙、遗迹的石板碎得露出地面
  const paveZone = (z, list) => {
    ctx.save(); zonePath(z); ctx.clip();
    for (const r of list) {
      stroke(r.pts, r.half * 2, z.road);
      if (z.pave === 'cobble') stroke(r.pts, r.half * 2 - 2, z.paveColor, [2, 13], 'butt');
      if (z.pave === 'ruts') for (const d of [-0.45, 0.45]) stroke(r.pts.map(([x, y]) => [x + d * r.half, y + d * r.half]), 3, z.paveColor, [16, 9], 'butt');
      if (z.pave === 'broken') stroke(r.pts, r.half * 2 + 6, z.ground, [13, 41], 'butt');
    }
    ctx.restore();
  };
  // 先铺外面的区，再铺环路以内的区，最后把环路补一遍：环路是花园的边界，归外面的区，路口不能被里面的路盖住
  const outer = [...zones].reverse().filter((z) => z.road && !z.inner);
  outer.forEach((z) => paveZone(z, roads));
  zones.filter((z) => z.inner).forEach((z) => paveZone(z, roads.filter((r) => r.kind !== 'coach')));
  outer.forEach((z) => paveZone(z, roads.filter((r) => r.kind === 'coach')));
  // 集合点：一块圆形石板地
  const G = town.gather;
  ctx.fillStyle = pal.plaza; ctx.strokeStyle = INK_CSS; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(G.x, G.y, G.r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.setLineDash([3, 3]); ctx.strokeStyle = '#6d665a';
  ctx.beginPath(); ctx.arc(G.x, G.y, G.r - 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  // 通往地下洞穴的暗口：一圈旧石头围着黑洞（梦殒春宵）
  for (const m of town.hatches ?? []) {
    ctx.fillStyle = 'rgba(92, 74, 44, .55)'; ctx.beginPath(); ctx.arc(m.x, m.y, 36, 0, 7); ctx.fill(); // 周围的花枯了一圈
    ctx.fillStyle = '#7a7568'; ctx.strokeStyle = INK_CSS; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(m.x, m.y, 15, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#17181a'; ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, 7); ctx.fill();
  }
  // 溪：岸 → 水 → 一道亮一点的水流
  const band = town.water?.band;
  if (band) {
    stroke(band.pts, band.half * 2 + 18, pal.bank);
    stroke(band.pts, band.half * 2, pal.water);
    stroke(band.pts, 3, '#4f6670', [26, 30]);
  }
  // 桥：溪上的桥画成垂直跨过水流的桥面（deck），横着铺木板 / 石条，两边有栏杆
  for (const b of town.walkways.filter((w) => w.deck)) {
    const { cx, cy, ux, uy, along, across, poly } = b.deck;
    const stone = b.kind === 'stone';
    const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.save(); ctx.translate(6, 8); path(poly); ctx.fill(); ctx.restore(); // 影子落在水上
    ctx.fillStyle = stone ? '#a39e92' : '#8b6b4a'; path(poly); ctx.fill();
    ctx.strokeStyle = stone ? '#6a665e' : '#5f452e'; ctx.lineWidth = 1;
    for (let a = -along + 6; a < along; a += stone ? 14 : 8) {
      ctx.beginPath(); ctx.moveTo(cx + ux * a + uy * across, cy + uy * a - ux * across); ctx.lineTo(cx + ux * a - uy * across, cy + uy * a + ux * across); ctx.stroke();
    }
    ctx.strokeStyle = INK_CSS; ctx.lineWidth = 1.6; path(poly); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = stone ? '#7d786c' : '#4a3424'; // 栏杆
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx - ux * along - uy * across * k, cy - uy * along + ux * across * k); ctx.lineTo(cx + ux * along - uy * across * k, cy + uy * along + ux * across * k); ctx.stroke(); }
  }
  for (const b of town.walkways.filter((w) => !w.deck)) {
    ctx.fillStyle = b.kind === 'stone' ? '#a39e92' : '#8b6b4a';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.kind === 'stone' ? '#6a665e' : '#5f452e'; ctx.lineWidth = 1;
    const across = b.w > b.h; // 木板垂直于走向
    for (let t = 6; t < (across ? b.w : b.h); t += b.kind === 'stone' ? 14 : 8) {
      ctx.beginPath();
      if (across) { ctx.moveTo(b.x + t, b.y); ctx.lineTo(b.x + t, b.y + b.h); } else { ctx.moveTo(b.x, b.y + t); ctx.lineTo(b.x + b.w, b.y + t); }
      ctx.stroke();
    }
    ctx.strokeStyle = INK_CSS; ctx.lineWidth = 1.6; ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  return canvas;
}
const INK_CSS = '#1d2524';

// ───────────── 建筑（程序画的体块，占位） ─────────────

const WIN_LIT = 0xf0c66a;
const WIN_DARK = 0x2d3a3a;
const FLOWER_BOX = 0xa878c8;

/** 前面两堵墙（东墙 +x、南墙 +y）+ 窗。 */
function frontWalls(g, b, seed) {
  const { x, y, w, h, height: H } = b;
  const x1 = x + w; const y1 = y + h;
  const wall = hex(b.wall);
  face(g, [[x1, y, 0], [x1, y1, 0], [x1, y1, H], [x1, y, H]], shade(wall, -0.22));
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, H], [x, y1, H]], wall);
  const floors = b.shape === 'tent' ? 0 : H > 58 ? 2 : 1;
  const planter = (a, c, s0, s1, z, tone) => b.flowers && onWall(g, a, c, s0, s1, z - 7, z - 1, shade(FLOWER_BOX, tone)); // 窗台花箱
  for (let f = 0; f < floors; f++) {
    const z0 = H * (floors === 2 ? [0.14, 0.56][f] : 0.3); const z1 = z0 + H * (floors === 2 ? 0.26 : 0.34);
    const nS = Math.max(1, Math.floor(w / 42)); const nE = Math.max(1, Math.floor(h / 42));
    for (let i = 0; i < nS; i++) {
      if (b.door?.side === 'bottom' && Math.abs(x + ((i + 0.5) / nS) * w - b.door.x) < 26 && f === 0) continue;
      const lit = b.lit === true || (b.lit !== false && hash(seed + i, f) > 0.55);
      onWall(g, [x, y1], [x1, y1], (i + 0.3) / nS, (i + 0.7) / nS, z0, z1, lit ? WIN_LIT : WIN_DARK);
      planter([x, y1], [x1, y1], (i + 0.24) / nS, (i + 0.76) / nS, z0, 0);
    }
    for (let i = 0; i < nE; i++) {
      if (b.door?.side === 'right' && Math.abs(y + ((i + 0.5) / nE) * h - b.door.y) < 26 && f === 0) continue;
      const lit = b.lit === true || (b.lit !== false && hash(seed + i, f + 7) > 0.6);
      onWall(g, [x1, y], [x1, y1], (i + 0.3) / nE, (i + 0.7) / nE, z0, z1, lit ? shade(WIN_LIT, -0.12) : shade(WIN_DARK, -0.2));
      planter([x1, y], [x1, y1], (i + 0.24) / nE, (i + 0.76) / nE, z0, -0.18);
    }
  }
  // 帐篷没有窗：能进的那几顶在檐下挂一圈灯，一看就和不能进的旧帐篷不一样
  if (b.shape === 'tent' && b.lit === true) {
    const bulbs = (ax, ay, bx, by) => {
      for (let t = 0.04; t < 1; t += 0.08) g.circle(...P(ax + (bx - ax) * t, ay + (by - ay) * t, H - 7), 3.6).fill(WIN_LIT).stroke({ width: 0.7, color: INK });
    };
    bulbs(x, y1, x1, y1); bulbs(x1, y1, x1, y);
  }
  // 墙根一道深色
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, 4], [x, y1, 4]], shade(wall, -0.4), { width: 0.6, color: INK });
}

/** 双坡屋顶（屋脊沿长边）+ 积雪 + 烟囱。返回屋顶最高点的高度。 */
/** 屋顶的尺寸和烟囱位置（画屋顶、算建筑轮廓共用，保证两边一致）。 */
function roofGeom(b, seed) {
  const { x, y, w, h, height: H } = b;
  const rh = Math.min(w, h) * (b.shape === 'tent' ? 0.8 : 0.38);
  const chimney = !b.shape && hash(seed, 99) > 0.25
    ? { cx: x + w * (0.25 + hash(seed, 98) * 0.5), cy: y + h * 0.3, s: 12, z0: H + rh * 0.4, z1: H + rh + 18 }
    : null;
  return { o: 8, rh, chimney };
}

/** 一栋建筑在屏幕上的轮廓（所有顶点投影后的凸包），用来从手绘大图里把它切出来。 */
function silhouette(b, seed) {
  const { x, y, w, h, height: H } = b;
  const { o, rh, chimney } = roofGeom(b, seed);
  const x1 = x + w; const y1 = y + h;
  const pts = [[x, y1, 0], [x1, y1, 0], [x1, y, 0], [x - o, y - o, H], [x1 + o, y - o, H], [x1 + o, y1 + o, H], [x - o, y1 + o, H]];
  if (b.shape === 'tent') pts.push([x + w / 2, y + h / 2, H + rh + 24]);
  else if (w >= h) pts.push([x - o, (y + y1) / 2, H + rh], [x1 + o, (y + y1) / 2, H + rh]);
  else pts.push([(x + x1) / 2, y - o, H + rh], [(x + x1) / 2, y1 + o, H + rh]);
  if (chimney) {
    const { cx, cy, s: c, z1 } = chimney;
    pts.push([cx, cy, z1], [cx + c, cy, z1], [cx + c, cy + c, z1], [cx, cy + c, z1]);
  }
  return hull(pts.map((p) => P(...p)));
}

/** 凸包（单调链）。 */
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; const upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function roof(g, b, seed) {
  if (b.shape === 'tent') return tentTop(g, b, seed);
  const { x, y, w, h, height: H } = b;
  const x1 = x + w; const y1 = y + h;
  const { o, rh, chimney } = roofGeom(b, seed);
  const col = hex(b.roof); const wall = hex(b.wall);
  const snow = 0xeef0ec;
  const plane = (pts, color) => {
    face(g, pts, color);
    // 积雪：从屋脊往下盖住六成（没有雪的地图 b.snow = 0）
    const k = b.snow ?? 0.6;
    if (!k) return;
    const [r0, r1, e1, e0] = pts;
    const mix = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    face(g, [r0, r1, mix(r1, e1, k + 0.02), mix(r0, e0, k)], snow, { width: 0.7, color: INK });
  };
  if (w >= h) {
    const ym = (y + y1) / 2;
    plane([[x - o, ym, H + rh], [x1 + o, ym, H + rh], [x1 + o, y - o, H], [x - o, y - o, H]], shade(col, -0.12));
    face(g, [[x1, y, H], [x1, y1, H], [x1, ym, H + rh]], shade(wall, -0.22));
    plane([[x - o, ym, H + rh], [x1 + o, ym, H + rh], [x1 + o, y1 + o, H], [x - o, y1 + o, H]], col);
  } else {
    const xm = (x + x1) / 2;
    plane([[xm, y - o, H + rh], [xm, y1 + o, H + rh], [x - o, y1 + o, H], [x - o, y - o, H]], shade(col, -0.05));
    face(g, [[x, y1, H], [x1, y1, H], [xm, y1, H + rh]], wall);
    plane([[xm, y - o, H + rh], [xm, y1 + o, H + rh], [x1 + o, y1 + o, H], [x1 + o, y - o, H]], shade(col, -0.2));
  }
  // 烟囱
  if (chimney) {
    const { cx, cy, s, z0, z1 } = chimney;
    face(g, [[cx + s, cy, z0], [cx + s, cy + s, z0], [cx + s, cy + s, z1], [cx + s, cy, z1]], shade(wall, -0.3));
    face(g, [[cx, cy + s, z0], [cx + s, cy + s, z0], [cx + s, cy + s, z1], [cx, cy + s, z1]], shade(wall, -0.1));
    face(g, [[cx, cy, z1], [cx + s, cy, z1], [cx + s, cy + s, z1], [cx, cy + s, z1]], 0x1d2524);
  }
  return H + rh + 20;
}

/** 帐篷顶：四面收到一根中杆上，红白相间的条纹，顶上一面小旗。返回最高点的高度。 */
function tentTop(g, b, seed) {
  const { x, y, w, h, height: H } = b;
  const x1 = x + w; const y1 = y + h;
  const { o, rh } = roofGeom(b, seed);
  const apex = [x + w / 2, y + h / 2, H + rh];
  const stripes = (a, c, tone) => {
    const n = Math.max(4, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 34));
    const at = (t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, H];
    for (let i = 0; i < n; i++) face(g, [at(i / n), at((i + 1) / n), apex], shade(hex(i % 2 ? b.stripe : b.roof), tone));
  };
  stripes([x - o, y1 + o], [x1 + o, y1 + o], 0);
  stripes([x1 + o, y1 + o], [x1 + o, y - o], -0.2);
  const [tx, ty] = P(...apex);
  g.moveTo(tx, ty).lineTo(tx, ty - 22).stroke({ width: 1.6, color: INK });
  g.poly([tx, ty - 22, tx + 15, ty - 17, tx, ty - 12]).fill(hex(b.roof)).stroke({ width: 1, color: INK });
  return H + rh + 24;
}

/** 门（和锁）：画在门所在的那面墙上。 */
function door(g, hs, locked) {
  const d = { x: hs.door.vx ?? hs.door.x, y: hs.door.vy ?? hs.door.y }; // 画在画里那扇门上（可能比边线往里缩）
  const col = locked ? 0x5a3f2a : 0x3a2e26;
  const W = 13; const Hd = 32;
  if (hs.side === 'bottom') face(g, [[d.x - W, d.y, 0], [d.x + W, d.y, 0], [d.x + W, d.y, Hd], [d.x - W, d.y, Hd]], col);
  else if (hs.side === 'right') face(g, [[d.x, d.y - W, 0], [d.x, d.y + W, 0], [d.x, d.y + W, Hd], [d.x, d.y - W, Hd]], col);
  else { // 墓园的铁门：两根门柱
    for (const k of [-16, 16]) face(g, [[d.x - 3, d.y + k - 3, 0], [d.x + 3, d.y + k + 3, 0], [d.x + 3, d.y + k + 3, 26], [d.x - 3, d.y + k - 3, 26]], 0x4a4f4e);
  }
  if (locked) {
    const [px, py] = P(d.x, d.y, 16);
    g.moveTo(px - 4, py - 1).arc(px, py - 1, 4, Math.PI, 0).stroke({ width: 2, color: INK });
    g.rect(px - 6, py - 1, 12, 10).fill(0xc9a24a).stroke({ width: 1.2, color: INK });
    g.rect(px - 1, py + 2, 2, 4).fill(INK);
  }
}

/**
 * 有人走过门口时门往里推开：门洞变黑、门板绕门轴转进屋里（k：0 关着，1 全开）。
 * 门的位置按 maps/doors.js 对到手绘图上的门；露天的（墓园、地窖）没有门板。
 */
function doorSwing(g, hs, k) {
  g.clear();
  if (k < 0.02 || !hs.height) return;
  const d = { x: hs.door.vx ?? hs.door.x, y: hs.door.vy ?? hs.door.y, nx: hs.door.nx, ny: hs.door.ny };
  const W = 13; const Hd = 32;
  const ax = hs.side === 'right' || hs.side === 'left' ? 0 : 1; const ay = 1 - ax; // 沿墙的方向
  const ix = -d.nx; const iy = -d.ny;                                                 // 往屋里
  const at = (u, z) => [d.x + ax * u, d.y + ay * u, z];
  face(g, [at(-W, 0), at(W, 0), at(W, Hd), at(-W, Hd)], 0x120d0a, { width: 0 });     // 黑洞洞的门洞
  const a = k * 1.45; const L = 2 * W;
  const hx = d.x - ax * W; const hy = d.y - ay * W;                                   // 门轴在门洞西 / 北边
  const ex = hx + (ax * Math.cos(a) + ix * Math.sin(a)) * L; const ey = hy + (ay * Math.cos(a) + iy * Math.sin(a)) * L;
  face(g, [[hx, hy, 0], [ex, ey, 0], [ex, ey, Hd], [hx, hy, Hd]], shade(0x5a4030, -0.25 * k), { width: 1.2, color: INK });
}

/** 房子的后墙（从屋里看得到的两面：北墙、西墙）。 */
function backWalls(g, hs) {
  const { x, y, w, h, height: H } = hs;
  const paper = 0x8a7a62;
  face(g, [[x, y, 0], [x, y + h, 0], [x, y + h, H], [x, y, H]], shade(paper, -0.18));
  face(g, [[x, y, 0], [x + w, y, 0], [x + w, y, H], [x, y, H]], paper);
  face(g, [[x, y, 0], [x + w, y, 0], [x + w, y, H * 0.3], [x, y, H * 0.3]], shade(paper, -0.35), { width: 0.6, color: INK });
  // 墙上挂着的东西：一扇窗、一幅画
  onWall(g, [x, y], [x + w, y], 0.2, 0.34, H * 0.42, H * 0.78, 0x46606a);
  onWall(g, [x, y], [x + w, y], 0.62, 0.74, H * 0.45, H * 0.7, 0xb08a5a);
}

/** 墓园：一圈矮铁栅栏，back=北/西两边，front=南/东两边。 */
function fence(g, hs, sides) {
  const { x, y, w, h, door: d } = hs;
  const seg = { n: [[x, y], [x + w, y]], w: [[x, y], [x, y + h]], s: [[x, y + h], [x + w, y + h]], e: [[x + w, y], [x + w, y + h]] };
  for (const k of sides) {
    const [[ax, ay], [bx, by]] = seg[k];
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t <= len; t += 10) {
      const px = ax + ((bx - ax) * t) / len; const py = ay + ((by - ay) * t) / len;
      if (k === 'w' && Math.abs(py - d.y) < 16) continue; // 门口
      const [sx, sy] = P(px, py, 0); const [, ty] = P(px, py, 16);
      g.moveTo(sx, sy).lineTo(sx, ty);
    }
    for (const z of [6, 14]) {
      if (k === 'w') {
        g.moveTo(...P(ax, ay, z)).lineTo(...P(ax, d.y - 16, z));
        g.moveTo(...P(ax, d.y + 16, z)).lineTo(...P(bx, by, z));
      } else g.moveTo(...P(ax, ay, z)).lineTo(...P(bx, by, z));
    }
  }
  g.stroke({ width: 1.6, color: 0x2b3130 });
}

/** 遗迹地窖：一圈塌得断断续续的矮石墙，back=北/西两边，front=南/东两边，门口留空。 */
function rubbleWall(g, hs, sides) {
  const { x, y, w, h, door: d } = hs;
  const seg = { n: [[x, y], [x + w, y]], w: [[x, y], [x, y + h]], s: [[x, y + h], [x + w, y + h]], e: [[x + w, y], [x + w, y + h]] };
  for (const k of sides) {
    const [[ax, ay], [bx, by]] = seg[k];
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < len - 20; t += 34) {
      const at = (u) => [ax + ((bx - ax) * u) / len, ay + ((by - ay) * u) / len];
      const [px, py] = at(t); const [qx, qy] = at(t + 26);
      if (hash(t, len + sides.length) < 0.25 || Math.hypot((px + qx) / 2 - d.x, (py + qy) / 2 - d.y) < 40) continue;
      const z = 12 + hash(t, len) * 16;
      face(g, [[px, py, 0], [qx, qy, 0], [qx, qy, z], [px, py, z]], k === 'n' || k === 's' ? 0x8f8a7e : 0x77725f);
    }
  }
}

/** 地窖口：石地上一个往下收的方坑，一级级台阶通到黑暗的地下洞穴。 */
function pitStairs(g, hs) {
  const cx = hs.x + hs.w * 0.58; const cy = hs.y + hs.h * 0.52;
  for (let i = 0; i < 6; i++) {
    const k = 1 - i * 0.15; const a = 76 * k; const b = 54 * k;
    face(g, [[cx - a, cy - b, 0], [cx + a, cy - b, 0], [cx + a, cy + b, 0], [cx - a, cy + b, 0]], i === 5 ? 0x0e0f10 : shade(0x8a8474, -0.13 * i));
  }
}

/** 一根断柱，脚点在原点。 */
function brokenColumn(g, height) {
  g.rect(-9, -height, 18, height).fill(0x9c9686).stroke({ width: 1.1, color: INK });
  g.poly([-9, -height, -2, -height - 6, 9, -height + 1]).fill(0x8a8474).stroke({ width: 1, color: INK });
}

/** 一块墓碑（立着的小纸片）。 */
function tomb(g, snow = true) {
  if (!snow) g.ellipse(0, 1, 9, 3).fill(0x4a3e30); // 没雪的地图：墓碑脚下一小块深色的土
  g.roundRect(-6, -18, 12, 18, 5).fill(snow ? 0xb7c0bd : 0x9a9a90).stroke({ width: 1.1, color: INK });
  if (snow) { g.rect(-6, -18, 12, 4).fill(0xeef0ec); g.ellipse(0, 1, 9, 3).fill(0xf4f4f0); }
}

/** 钟楼：方塔 + 四坡尖顶 + 两面钟。 */
function tower(g, TOWER) {
  const s = TOWER.r; const { x: cx, y: cy } = TOWER;
  const x0 = cx - s; const x1 = cx + s; const y0 = cy - s; const y1 = cy + s; const H = 170;
  const wall = 0xb9c6c2;
  face(g, [[x1, y0, 0], [x1, y1, 0], [x1, y1, H], [x1, y0, H]], shade(wall, -0.22));
  face(g, [[x0, y1, 0], [x1, y1, 0], [x1, y1, H], [x0, y1, H]], wall);
  for (const z of [H * 0.35, H * 0.6]) {
    g.moveTo(...P(x0, y1, z)).lineTo(...P(x1, y1, z)).lineTo(...P(x1, y0, z)).stroke({ width: 0.7, color: INK });
  }
  // 钟面：在两面墙上各画一个圆（按墙面投影）
  for (const [a, b] of [[[x0, y1], [x1, y1]], [[x1, y1], [x1, y0]]]) {
    const pts = [];
    for (let i = 0; i < 20; i++) {
      const t = 0.5 + Math.cos((i / 20) * Math.PI * 2) * 0.28; const z = H * 0.8 + Math.sin((i / 20) * Math.PI * 2) * s * 0.56;
      pts.push(P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z));
    }
    g.poly(pts.flat()).fill(0xf2efe6).stroke({ width: 1.3, color: INK });
    const c = P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, H * 0.8);
    g.moveTo(c[0], c[1]).lineTo(c[0], c[1] - 12).moveTo(c[0], c[1]).lineTo(c[0] + 7, c[1] + 3).stroke({ width: 1.6, color: INK });
  }
  onWall(g, [x0, y1], [x1, y1], 0.38, 0.62, 0, 34, 0x2d3a3a);
  const top = [cx, cy, H + 90]; const o = 6;
  face(g, [[x0 - o, y1 + o, H], [x1 + o, y1 + o, H], top], 0x647e7b);
  face(g, [[x1 + o, y1 + o, H], [x1 + o, y0 - o, H], top], 0x4f6764);
  const [tx, ty] = P(...top);
  g.moveTo(tx, ty).lineTo(tx, ty - 18).stroke({ width: 1.6, color: INK });
  g.circle(tx, ty - 20, 2.5).fill(INK);
  return H + 110;
}

/** 破烽火台：粗矮的石塔，城垛塌了几处，塔顶火盆里一点暗红的火。返回顶部高度。 */
function beacon(g, c) {
  const s = c.r * 0.72; const { x: cx, y: cy } = c;
  const x0 = cx - s; const x1 = cx + s; const y0 = cy - s; const y1 = cy + s; const H = 150;
  const wall = 0x8f8a7e;
  face(g, [[x0, y0, H], [x1, y0, H], [x1, y1, H], [x0, y1, H]], shade(wall, -0.45)); // 塔顶
  face(g, [[x1, y0, 0], [x1, y1, 0], [x1, y1, H], [x1, y0, H]], shade(wall, -0.25));
  face(g, [[x0, y1, 0], [x1, y1, 0], [x1, y1, H], [x0, y1, H]], wall);
  for (const z of [H * 0.3, H * 0.62]) g.moveTo(...P(x0, y1, z)).lineTo(...P(x1, y1, z)).lineTo(...P(x1, y0, z)).stroke({ width: 0.7, color: INK });
  onWall(g, [x0, y1], [x1, y1], 0.42, 0.58, 0, 30, 0x2a2622);
  onWall(g, [x0, y1], [x1, y1], 0.46, 0.54, H * 0.55, H * 0.7, 0x2a2622);
  // 火盆（在塔顶正中，先画，前沿的城垛会挡住它的下半截）
  const [fx, fy] = P(cx, cy, H);
  g.ellipse(fx, fy - 4, 14, 6).fill(0x3a2a22).stroke({ width: 1.2, color: INK });
  g.ellipse(fx, fy - 11, 9, 9).fill({ color: 0xd2502a, alpha: 0.9 });
  g.ellipse(fx, fy - 14, 4.5, 6).fill({ color: 0xf2b25c, alpha: 0.9 });
  // 城垛：南沿、东沿各一排齿，塌掉的几个不画
  const broken = new Set([3, 6]);
  for (let i = 0; i < 4; i++) {
    if (!broken.has(i)) onWall(g, [x0, y1], [x1, y1], i / 4 + 0.04, i / 4 + 0.18, H, H + 14, shade(wall, 0.08));
    if (!broken.has(i + 4)) onWall(g, [x1, y1], [x1, y0], i / 4 + 0.04, i / 4 + 0.18, H, H + 14, shade(wall, -0.18));
  }
  return H + 30;
}

/** 遗迹断塔：一边塌掉的石塔，藤蔓爬上塔身，塔脚一个黑洞洞的破口（进不去，所以不亮）。返回顶部高度。 */
function ruin(g, c) {
  const s = c.r * 0.76; const { x: cx, y: cy } = c;
  const x0 = cx - s; const x1 = cx + s; const y0 = cy - s; const y1 = cy + s; const H = 170;
  const wall = 0x8f8a7e;
  face(g, [[x1, y0, 0], [x1, y1, 0], [x1, y1, H * 0.72], [x1, cy + s * 0.2, H * 0.6], [x1, cy - s * 0.3, H * 0.82], [x1, y0, H * 0.7]], shade(wall, -0.25));
  face(g, [[x0, y1, 0], [x1, y1, 0], [x1, y1, H * 0.72], [cx + s * 0.3, y1, H * 0.84], [cx - s * 0.2, y1, H * 0.76], [x0, y1, H]], wall);
  for (const z of [H * 0.24, H * 0.5]) g.moveTo(...P(x0, y1, z)).lineTo(...P(x1, y1, z)).lineTo(...P(x1, y0, z)).stroke({ width: 0.7, color: INK });
  onWall(g, [x0, y1], [x1, y1], 0.34, 0.66, 0, 34, 0x2a2622);
  for (let i = 0; i < 26; i++) { // 藤蔓从地面往上爬，越高越稀
    const t = hash(i, 71); const z = Math.pow(hash(i, 72), 1.7) * H * 0.7;
    g.circle(...P(x0 + (x1 - x0) * t, y1, z), 4 + hash(i, 73) * 4).fill(i % 5 ? 0x5a7a44 : 0x46663a);
  }
  return H + 10;
}

/** 石雕喷泉：大水池、中间一根柱子托着小盘，水是淡紫色的。 */
function fountain(g, c) {
  const [x, y] = P(c.x, c.y); const rx = c.r * 1.4; const ry = rx / 2;
  const disc = (z, r, fill) => g.ellipse(x, y - z, r, r / 2).fill(fill).stroke({ width: 1.2, color: INK });
  g.rect(x - rx, y - 13, rx * 2, 13).fill(0x8e8a7e);
  g.ellipse(x, y, rx, ry).fill(0x8e8a7e).stroke({ width: 1.2, color: INK });
  g.moveTo(x - rx, y).lineTo(x - rx, y - 13).moveTo(x + rx, y).lineTo(x + rx, y - 13).stroke({ width: 1.2, color: INK });
  disc(13, rx, 0xa7a294); disc(14, rx * 0.84, 0xb9a8dc);
  g.rect(x - 5, y - 40, 10, 26).fill(0x9a9588).stroke({ width: 1, color: INK });
  disc(40, rx * 0.44, 0xa7a294); disc(41, rx * 0.34, 0xc9bbe6);
  // 水池中间的花柱：全图最常看见的东西，站在哪个路口都能照着它找回集合点
  g.rect(x - 4, y - 214, 8, 174).fill(0x8a6b48).stroke({ width: 1, color: INK });
  for (let z = 56; z < 214; z += 13) g.circle(x + (z % 2 ? 4 : -4), y - z, 5.5).fill(z % 3 ? 0x9a72cc : 0x5a7f46).stroke({ width: 0.7, color: INK });
  g.ellipse(x, y - 216, 17, 10).fill(0x5a7f46).stroke({ width: 1, color: INK });
  for (let i = 0; i < 8; i++) g.circle(x + Math.cos(i * 0.785) * 14, y - 216 + Math.sin(i * 0.785) * 7, 3.6).fill(i % 2 ? 0xd9b6ea : 0x9a72cc);
  return 232;
}

/** 老井：一圈矮石墙 + 两根柱子撑着小顶。 */
function well(g, c) {
  const { x, y, r } = c; const s = r * 0.8;
  face(g, [[x + s, y - s, 0], [x + s, y + s, 0], [x + s, y + s, 14], [x + s, y - s, 14]], 0x7a756a);
  face(g, [[x - s, y + s, 0], [x + s, y + s, 0], [x + s, y + s, 14], [x - s, y + s, 14]], 0x9a9488);
  face(g, [[x - s, y - s, 14], [x + s, y - s, 14], [x + s, y + s, 14], [x - s, y + s, 14]], 0x1d2524);
  for (const k of [-1, 1]) g.moveTo(...P(x + k * s, y, 14)).lineTo(...P(x + k * s, y, 44)).stroke({ width: 2.4, color: 0x4a3a2a });
  face(g, [[x - s - 4, y, 44], [x + s + 4, y, 44], [x + s + 4, y + s + 4, 36], [x - s - 4, y + s + 4, 36]], 0x5a3a2a);
  return 50;
}

/** 绞刑架：木台 + 立柱 + 横梁 + 绳圈。 */
function gallows(g, c) {
  const { x, y, r } = c; const s = r * 0.85;
  face(g, [[x + s, y - s, 0], [x + s, y + s, 0], [x + s, y + s, 12], [x + s, y - s, 12]], 0x4e3a28);
  face(g, [[x - s, y + s, 0], [x + s, y + s, 0], [x + s, y + s, 12], [x - s, y + s, 12]], 0x6a4e34);
  face(g, [[x - s, y - s, 12], [x + s, y - s, 12], [x + s, y + s, 12], [x - s, y + s, 12]], 0x7a5c3e);
  const post = P(x - s * 0.6, y - s * 0.6, 12); const top = P(x - s * 0.6, y - s * 0.6, 92);
  g.moveTo(...post).lineTo(...top).stroke({ width: 4, color: 0x3a2a1c });
  const end = P(x + s * 0.5, y - s * 0.6, 92);
  g.moveTo(...top).lineTo(...end).stroke({ width: 3.5, color: 0x3a2a1c });
  const knot = P(x + s * 0.5, y - s * 0.6, 62);
  g.moveTo(...end).lineTo(...knot).stroke({ width: 1.2, color: 0xb8a27a });
  g.circle(knot[0], knot[1] + 5, 5).stroke({ width: 1.2, color: 0xb8a27a });
  return 100;
}

/** 一片树林：圈里散着几棵枫树（橙红，叶上有黑斑）和黑松，从后往前画。返回最高的树梢高度。 */
function trees(g, c, seed, colors) {
  const n = Math.max(3, Math.round((c.r * c.r) / 900));
  const list = [];
  for (let i = 0; i < n * 3 && list.length < n; i++) {
    const a = hash(seed, i * 3) * Math.PI * 2; const d = Math.sqrt(hash(seed, i * 3 + 1)) * c.r * 0.82;
    const t = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, pine: !colors && hash(seed, i * 3 + 2) < 0.4, k: 0.8 + hash(seed, i * 7) * 0.5 };
    if (list.every((o) => Math.hypot(o.x - t.x, o.y - t.y) > 16)) list.push(t);
  }
  list.sort((a, b) => a.x + a.y - (b.x + b.y));
  let top = 0;
  for (const t of list) {
    const [bx, by] = P(t.x, t.y, 0);
    g.ellipse(bx + 6, by + 2, 14 * t.k, 5 * t.k).fill({ color: 0x000000, alpha: 0.18 });
    g.moveTo(bx, by).lineTo(bx, by - 22 * t.k).stroke({ width: 3, color: 0x3a2a1e });
    if (t.pine) {
      const h = 70 * t.k; const w = 18 * t.k;
      for (const [z, ww, col] of [[0.25, 1, 0x26302a], [0.5, 0.78, 0x2e3a32], [0.72, 0.55, 0x36443a]]) {
        g.poly([bx - w * ww, by - h * z + 6, bx + w * ww, by - h * z + 6, bx, by - h * (z + 0.36)]).fill(col).stroke({ width: 1, color: INK });
      }
      top = Math.max(top, h + 10);
    } else {
      const r = 20 * t.k; const cy = by - 22 * t.k - r * 0.8;
      const pal = colors ?? [0xc4502a, 0xe08a3a, 0xa8402a];
      const col = pal[Math.floor(hash(t.x, t.y) * pal.length)];
      g.circle(bx, cy, r).fill(col).stroke({ width: 1.2, color: INK });
      g.circle(bx - r * 0.35, cy - r * 0.3, r * 0.5).fill(shade(col, 0.15));
      if (!colors) for (let j = 0; j < 4; j++) g.circle(bx + (hash(j, t.x) - 0.5) * r * 1.2, cy + (hash(j, t.y) - 0.5) * r * 1.2, 1.6).fill(0x2a1a14); // 黑斑
      top = Math.max(top, 22 * t.k + r * 1.8 + 6);
    }
  }
  return top;
}

/** 一段修剪过的绿篱：一堆圆滚滚的灌木，开满紫罗兰。 */
function hedge(g, c, seed) {
  const list = [];
  for (let i = 0; i < 9; i++) {
    const a = hash(seed, i * 2 + 1) * Math.PI * 2; const d = Math.sqrt(hash(seed, i * 2 + 2)) * c.r * 0.72;
    list.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d });
  }
  list.sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const [i, t] of list.entries()) {
    const [bx, by] = P(t.x, t.y, 0); const r = 24 + hash(seed, i + 30) * 8;
    g.ellipse(bx, by - r * 0.7, r * 1.15, r).fill(shade(0x4f7344, (i % 3) * 0.07 - 0.06)).stroke({ width: 1, color: INK });
    for (let j = 0; j < 6; j++) {
      g.circle(bx + (hash(seed + i, j) - 0.5) * r * 1.7, by - r * 0.7 + (hash(seed + i, j + 9) - 0.6) * r * 1.5, 2.2).fill(j % 3 ? 0x9a72cc : 0xd9b6ea);
    }
  }
  return 62;
}

/** 拱门：路两边两根柱子，上面一道弧。花架是木头缠花，遗迹的是断了半边的石券。 */
function arch(g, a) {
  const H = 66; const rise = 26; const k = a.along === 'y' ? [1, 0] : [0, 1];
  const end = (s) => [a.x + k[0] * a.half * s, a.y + k[1] * a.half * s];
  const color = a.stone ? 0x8f8a7e : 0x6a4c34; const width = a.stone ? 9 : 5;
  const arc = (t) => [...end(t * 2 - 1), H + Math.sin(t * Math.PI) * rise];
  const last = a.stone ? 0.62 : 1; // 石券塌掉一截
  g.moveTo(...P(...end(-1), 0)).lineTo(...P(...end(-1), H)).stroke({ width, color });
  g.moveTo(...P(...end(1), 0)).lineTo(...P(...end(1), a.stone ? H * 0.7 : H)).stroke({ width, color });
  g.moveTo(...P(...arc(0)));
  for (let i = 1; i <= 12; i++) g.lineTo(...P(...arc((i / 12) * last)));
  g.stroke({ width, color });
  for (let i = 0; i <= 18 && !a.stone; i++) g.circle(...P(...arc(i / 18)), 3.4 + hash(i, a.x) * 2.6).fill(i % 2 ? 0x9a72cc : 0x5a7f46);
  return H + rise + 10;
}

/** 宴会长桌：铺白布的长桌，摆着杯盘和花。 */
function banquet(g, b) {
  const { x, y, w, h, height: H } = b; const x1 = x + w; const y1 = y + h;
  face(g, [[x1, y, 0], [x1, y1, 0], [x1, y1, H], [x1, y, H]], 0xb9b2a2);
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, H], [x, y1, H]], 0xdcd5c4);
  face(g, [[x, y, H], [x1, y, H], [x1, y1, H], [x, y1, H]], 0xf0eadc);
  for (let i = 1; i < 7; i++) {
    const [sx, sy] = P(x + (i / 7) * w, y + h / 2, H);
    if (i % 3) g.circle(sx, sy - 2, 3).fill(i % 2 ? 0x8a2f4e : 0xd9a441).stroke({ width: 0.8, color: INK });
    else g.ellipse(sx, sy - 4, 7, 6).fill(0x9a72cc).stroke({ width: 0.8, color: INK });
  }
  return H + 10;
}

/** 马戏团的旧篷车：一节木车厢，弧顶，两个大轮子。 */
function wagon(g, b) {
  const { x, y, w, h, height: H } = b; const x1 = x + w; const y1 = y + h;
  const wall = hex(b.wall); const col = hex(b.roof);
  face(g, [[x1, y, 8], [x1, y1, 8], [x1, y1, H], [x1, y, H]], shade(wall, -0.22));
  face(g, [[x, y1, 8], [x1, y1, 8], [x1, y1, H], [x, y1, H]], wall);
  const arc = (px, t) => [px, y1 - t * h, H + Math.sin(t * Math.PI) * 24];
  for (let i = 0; i < 6; i++) face(g, [arc(x, i / 6), arc(x1, i / 6), arc(x1, (i + 1) / 6), arc(x, (i + 1) / 6)], shade(i % 2 ? col : hex(b.stripe), i > 2 ? -0.16 : 0));
  for (const px of [x + w * 0.2, x + w * 0.8]) g.circle(...P(px, y1 + 2, 16), 15).fill(0x4a3424).stroke({ width: 1.2, color: INK });
  return H + 34;
}

/** 摊子：木柜台，上面一块往前斜的条纹布篷，两根细柱撑着。 */
function stall(g, b) {
  const { x, y, w, h, height: H } = b; const x1 = x + w; const y1 = y + h;
  const counter = 0x8a6b48; const z = H * 0.55;
  face(g, [[x1, y, 0], [x1, y1, 0], [x1, y1, z], [x1, y, z]], shade(counter, -0.24));
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, z], [x, y1, z]], counter);
  face(g, [[x, y, z], [x1, y, z], [x1, y1, z], [x, y1, z]], shade(counter, 0.14));
  for (const px of [x + 4, x1 - 4]) g.moveTo(...P(px, y1 - 2, z)).lineTo(...P(px, y1 - 2, H + 10)).stroke({ width: 2.4, color: 0x4a3424 });
  const n = Math.max(4, Math.round(w / 24));
  for (let i = 0; i < n; i++) {
    const a = x - 8 + ((w + 16) * i) / n; const c = x - 8 + ((w + 16) * (i + 1)) / n;
    face(g, [[a, y - 4, H + 24], [c, y - 4, H + 24], [c, y1 + 12, H + 4], [a, y1 + 12, H + 4]], hex(i % 2 ? b.stripe : b.roof));
  }
  return H + 30;
}

/** 断墙：一段段高低不齐的旧石墙。 */
function lowWall(g, b) {
  const { x, y, w, h, height: H } = b;
  const along = w >= h; const len = along ? w : h; const n = Math.ceil(len / 26);
  for (let i = 0; i < n; i++) {
    const z = H * (0.5 + hash(i, x + y) * 0.5); const col = shade(0x8f8a7e, hash(i, x) * 0.1 - 0.05);
    const a = (i * len) / n; const c = ((i + 1) * len) / n - 2;
    const [x0, y0, x1, y1] = along ? [x + a, y, x + c, y + h] : [x, y + a, x + w, y + c];
    face(g, [[x1, y0, 0], [x1, y1, 0], [x1, y1, z], [x1, y0, z]], shade(col, -0.24));
    face(g, [[x0, y1, 0], [x1, y1, 0], [x1, y1, z], [x0, y1, z]], col);
    face(g, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], shade(col, 0.14));
  }
  return H;
}

/** 宏伟遗迹：两级石台基上两排巨柱，大多断了，只有一段横梁还架着。 */
function ruinHall(g, b) {
  const { x, y, w, h, height: H } = b; const x1 = x + w; const y1 = y + h;
  const stone = 0x9c9686; const base = 16;
  for (const [d, z0, z1] of [[0, 0, 8], [9, 8, base]]) {
    face(g, [[x1 - d, y + d, z0], [x1 - d, y1 - d, z0], [x1 - d, y1 - d, z1], [x1 - d, y + d, z1]], shade(stone, -0.28));
    face(g, [[x + d, y1 - d, z0], [x1 - d, y1 - d, z0], [x1 - d, y1 - d, z1], [x + d, y1 - d, z1]], shade(stone, -0.08));
    face(g, [[x + d, y + d, z1], [x1 - d, y + d, z1], [x1 - d, y1 - d, z1], [x + d, y1 - d, z1]], shade(stone, 0.08));
  }
  const column = (cx, cy, top) => {
    const s = 11;
    face(g, [[cx + s, cy - s, base], [cx + s, cy + s, base], [cx + s, cy + s, top], [cx + s, cy - s, top]], shade(stone, -0.24));
    face(g, [[cx - s, cy + s, base], [cx + s, cy + s, base], [cx + s, cy + s, top], [cx - s, cy + s, top]], stone);
    face(g, [[cx - s, cy - s, top], [cx + s, cy - s, top], [cx + s, cy + s, top], [cx - s, cy + s, top]], shade(stone, 0.14));
  };
  const n = 6; const at = (i) => x + 28 + (i / (n - 1)) * (w - 56);
  const back = [1, 1, 1, 1, 0.42, 0.66]; const front = [0.34, 0.74, 0.22, 0.5, 0.86, 0.3];
  back.forEach((k, i) => column(at(i), y + 30, H * k));
  face(g, [[at(0) - 16, y + 44, H], [at(3) + 16, y + 44, H], [at(3) + 16, y + 44, H + 16], [at(0) - 16, y + 44, H + 16]], shade(stone, 0.04));
  face(g, [[at(0) - 16, y + 16, H + 16], [at(3) + 16, y + 16, H + 16], [at(3) + 16, y + 44, H + 16], [at(0) - 16, y + 44, H + 16]], shade(stone, 0.16));
  front.forEach((k, i) => column(at(i), y1 - 30, H * k));
  for (let i = 0; i < 18; i++) { // 石缝里长出来的绿
    const [sx, sy] = P(x + hash(i, 81) * w, y1 - hash(i, 82) * 8, base + hash(i, 83) * 26);
    g.circle(sx, sy, 3 + hash(i, 84) * 4).fill(0x5a7a44);
  }
  return H + 22;
}

/** 一小块方石头 / 木箱。 */
function block(g, x, y, z, s, h, col) {
  face(g, [[x + s, y - s, z], [x + s, y + s, z], [x + s, y + s, z + h], [x + s, y - s, z + h]], shade(col, -0.24));
  face(g, [[x - s, y + s, z], [x + s, y + s, z], [x + s, y + s, z + h], [x - s, y + s, z + h]], col);
  face(g, [[x - s, y - s, z + h], [x + s, y - s, z + h], [x + s, y + s, z + h], [x - s, y + s, z + h]], shade(col, 0.14));
}

/** 叠起来的货箱。 */
function crates(g, c) {
  block(g, c.x - 4, c.y + 3, 0, c.r * 0.62, 17, 0x8a6b48);
  block(g, c.x + 5, c.y - 4, 0, c.r * 0.5, 14, 0x7a5c3e);
  block(g, c.x - 2, c.y + 2, 17, c.r * 0.44, 12, 0x9a7a54);
  return 34;
}

/** 两只木桶。 */
function barrels(g, c) {
  for (const [dx, dy] of [[-5, -4], [5, 5]]) {
    const [x, y] = P(c.x + dx, c.y + dy);
    g.rect(x - 8, y - 20, 16, 20).fill(0x7a5436).stroke({ width: 1, color: INK });
    g.ellipse(x, y - 20, 8, 4).fill(0x94704a).stroke({ width: 1, color: INK });
    g.ellipse(x, y, 8, 4).fill(0x7a5436).stroke({ width: 1, color: INK });
    g.moveTo(x - 8, y - 11).lineTo(x + 8, y - 11).stroke({ width: 1, color: 0x3a2a1c });
  }
  return 30;
}

/** 路牌：一根柱子，两块指向不同方向的彩色木板。 */
function sign(g, c) {
  const [x, y] = P(c.x, c.y);
  g.moveTo(x, y).lineTo(x, y - 66).stroke({ width: 3.5, color: 0x4a3424 });
  for (const [i, s] of [[0, 1], [1, -1]]) {
    const z = 60 - i * 15;
    g.poly([x, y - z, x + s * 32, y - z, x + s * 39, y - z + 5, x + s * 32, y - z + 10, x, y - z + 10]).fill(hex(c.boards[i])).stroke({ width: 1, color: INK });
  }
  return 72;
}

/** 插彩旗的木杆。 */
function pole(g, c) {
  const [x, y] = P(c.x, c.y);
  g.moveTo(x, y).lineTo(x, y - 96).stroke({ width: 3, color: 0x5a4028 });
  g.poly([x, y - 96, x + 18, y - 90, x, y - 84]).fill(0xb03a48).stroke({ width: 1, color: INK });
  return 100;
}

/** 花园长椅。 */
function bench(g, c) {
  const { x, y } = c;
  block(g, x - 10, y, 0, 2.5, 8, 0x4a3424); block(g, x + 10, y, 0, 2.5, 8, 0x4a3424);
  face(g, [[x - 14, y - 5, 9], [x + 14, y - 5, 9], [x + 14, y + 5, 9], [x - 14, y + 5, 9]], 0x8a6b48);
  face(g, [[x - 14, y - 5, 9], [x + 14, y - 5, 9], [x + 14, y - 5, 22], [x - 14, y - 5, 22]], 0x7a5c3e);
  return 24;
}

/** 铁火盆：遗迹地窖门口的一点火光（能进的地方才有光）。 */
function brazier(g, c) {
  const [x, y] = P(c.x, c.y);
  g.ellipse(x, y - 2, 40, 20).fill({ color: 0xd2702a, alpha: 0.14 });
  g.moveTo(x - 8, y).lineTo(x, y - 22).moveTo(x + 8, y).lineTo(x, y - 22).stroke({ width: 2, color: 0x2a2622 });
  g.ellipse(x, y - 24, 12, 5).fill(0x2a2622).stroke({ width: 1, color: INK });
  g.ellipse(x, y - 31, 8, 9).fill({ color: 0xd2502a, alpha: 0.9 });
  g.ellipse(x, y - 34, 4, 6).fill({ color: 0xf2b25c, alpha: 0.9 });
  return 44;
}

/** 碎石堆。 */
function rubble(g, c) {
  const s = c.r * 0.34;
  block(g, c.x - s, c.y - s * 0.5, 0, s, 10, 0x8a8474); block(g, c.x + s, c.y - s, 0, s * 0.8, 7, 0x7a7568);
  block(g, c.x, c.y + s, 0, s * 1.1, 13, 0x9c9686); block(g, c.x - s * 0.4, c.y + s * 0.6, 13, s * 0.7, 8, 0x8a8474);
  return 28;
}

/** 枯树：光秃的树干和几根枝杈。 */
function deadTrees(g, c, seed) {
  const n = Math.max(2, Math.round((c.r * c.r) / 1000));
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i * 3) * Math.PI * 2; const d = Math.sqrt(hash(seed, i * 3 + 1)) * c.r * 0.7;
    list.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, k: 0.9 + hash(seed, i * 7) * 0.5 });
  }
  list.sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const [i, t] of list.entries()) {
    const [bx, by] = P(t.x, t.y); const h = 62 * t.k;
    g.ellipse(bx + 6, by + 2, 12, 4).fill({ color: 0x000000, alpha: 0.18 });
    g.moveTo(bx, by).lineTo(bx + 2, by - h).stroke({ width: 4.5, color: 0x3a342c });
    for (let j = 0; j < 4; j++) {
      const z = h * (0.5 + j * 0.15); const s = j % 2 ? 1 : -1; const l = (26 - j * 3) * t.k;
      g.moveTo(bx + 1, by - z).lineTo(bx + s * l, by - z - l * (0.6 + hash(i, j) * 0.5)).stroke({ width: 2, color: 0x3a342c });
    }
  }
  return 92;
}

/** 一串彩旗：两点之间往下垂的绳子，挂着三角小旗。 */
function garland(g, { a, b }) {
  const n = Math.max(6, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 26));
  const sag = 26 + Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.05;
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - Math.sin(t * Math.PI) * sag];
  g.moveTo(...P(...at(0)));
  for (let i = 1; i <= n; i++) g.lineTo(...P(...at(i / n)));
  g.stroke({ width: 1, color: 0x4a3a2a });
  const flags = [0xb03a48, 0xe0b458, 0x9a72cc, 0xefe6d2];
  for (let i = 1; i < n; i++) {
    const [x, y] = P(...at(i / n));
    g.poly([x - 5, y, x + 5, y, x, y + 11]).fill(flags[i % flags.length]).stroke({ width: 0.7, color: INK });
  }
}

const LANDMARKS = { beacon, well, gallows, ruin, fountain, crates, barrels, sign, pole, bench, brazier, rubble };
const SHAPES = { table: banquet, wagon, stall, ruin: ruinHall, lowwall: lowWall }; // 不能进的建筑里不是房子的那些（帐篷只换屋顶，走 roof()）

// ───────────── 小人 ─────────────

/** 线稿小人（40×52 的画框，脚底在 (20, 49)）。 */
function makePerson(id) {
  const coat = hslToHex(hue(id), 30, 42);
  const line = { width: 1.6, color: INK, join: 'round' };
  const root = new Container();
  const body = new Container();
  body.pivot.set(20, 49);
  body.scale.set(PERSON);
  const shadow = new Graphics().ellipse(0, 0, 11 * PERSON, 3.5 * PERSON).fill({ color: 0x000000, alpha: 0.22 });
  root.addChild(shadow, body);
  const leg = (x) => { const g = new Graphics().rect(-2.75, 0, 5.5, 12).fill(0x3a3f3e).stroke(line); g.position.set(x, 35); return g; };
  const legL = leg(16.25); const legR = leg(23.75);
  const torso = new Graphics().moveTo(10, 38).lineTo(11, 19).quadraticCurveTo(20, 13, 29, 19).lineTo(30, 38).closePath().fill(coat).stroke(line);
  const arm = new Graphics().rect(-2.5, 0, 5, 12).fill(coat).stroke(line);
  arm.position.set(29.5, 21);
  const head = new Graphics().circle(20, 10, 7).fill(0xe3c4a2).stroke(line)
    .moveTo(13, 8.5).quadraticCurveTo(14, 2.5, 20, 3).quadraticCurveTo(26, 2.5, 27, 8.5).quadraticCurveTo(24, 6, 20, 6).quadraticCurveTo(16, 6, 13, 8.5).fill(0x3a2f28)
    .moveTo(20, 19).lineTo(20, 37).stroke({ width: 0.8, color: INK, alpha: 0.5 });
  body.addChild(legL, legR, torso, arm, head);
  const sprite = new Sprite(Texture.EMPTY);
  sprite.scale.set(SPRITE3D);
  sprite.visible = false;
  root.addChild(sprite);
  return { root, body, legL, legR, arm, shadow, facing: 1, sprite, sheet: null, outfitKey: null, dir: 1, offset: Math.random() };
}

/**
 * 给小人换上（或换掉）3D 搭配：烘焙图集 → 每段动作切成 [朝向][帧] 的贴图。
 * 图集的贴图每个地图（World）自己建一份（world.sheetSources）：换一天地图会整个销毁连贴图一起，
 * 用 Pixi 的全局缓存（Texture.from）的话第二天拿到的是销毁了的贴图，一画就报错、整个地图卡住不动。
 * 贴图顺便套上这张地图的色调（和房子一样），再按地图的雾色压一点，人和手绘背景融在一起。
 */
function dressPerson(w, outfit, char, world) {
  const glb = avatarMode() === 'baked'; // 否则是程序搭的小人（?avatar3d，开发用）
  const key = glb ? `char:${char}` : JSON.stringify(outfit);
  if (w.outfitKey === key) return;
  w.outfitKey = key;
  import('./avatar3d.js').then((m) => m.bakeSheet(outfit, char, glb)).then((sheet) => {
    if (!sheet || w.outfitKey !== key || w.root.destroyed || world.destroyed) return;
    const sourceOf = (cv) => {
      let src = world.sheetSources.get(cv);
      if (!src) { src = new CanvasSource({ resource: tonedCanvas(cv, world.town.tone?.houses), scaleMode: 'linear' }); world.sheetSources.set(cv, src); }
      return src;
    };
    w.anims = {};
    for (const [name, a] of Object.entries(sheet.anims)) {
      const source = sourceOf((sheet.canvases ?? [sheet.canvas])[a.band ?? 0]);
      w.anims[name] = { ...a, tex: Array.from({ length: DIRS }, (_, d) => Array.from({ length: a.n }, (__, i) =>
        new Texture({ source, frame: new Rectangle((a.col + i) * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H) }))) };
    }
    // 地图上 1 米多少单位：烘焙图里 1 米的像素 × 贴图缩放；地面上的 1 米在斜视角里横向缩成 cos45°，而地图 1 单位横向正好 1 像素
    w.upm = sheet.pxPerMeter * SPRITE3D * Math.SQRT1_2;
    w.headPx = sheet.pxPerMeter * SPRITE3D * (sheet.height + HEAD_PAD); // 缩放 1 时头顶离脚底几像素
    w.sheet = true;
    w.sprite.anchor.set(sheet.anchor.x, sheet.anchor.y);
    w.sprite.tint = world.charTint;
    w.sprite.visible = true;
    w.body.visible = false;
    // 影子：3D 小人比线稿小人宽，换一块大一点、软一点的（两层叠出虚边），宽度按人的肩宽
    const r = sheet.pxPerMeter * SPRITE3D * 0.34;
    w.shadow.clear()
      .ellipse(0, 0, r * 1.35, r * 0.48).fill({ color: 0x0a0c10, alpha: 0.16 })
      .ellipse(0, 0, r * 0.95, r * 0.32).fill({ color: 0x0a0c10, alpha: 0.24 });
  }).catch(() => {});
}

/**
 * 实时渲染（设置里「人物：实时 3D」）：在 world.live 的画布上占一格，小人的贴图就是那一格；每帧在 frame() 里推进动画、画一遍。
 */
function dressLive(w, id, char, world, cloth) {
  const key = `live:${char}:${cloth}`;
  if (w.outfitKey === key) return;
  if (w.live) world.live?.remove(id); // 换了形象 / 颜色：先把旧的那格让出来
  w.outfitKey = key;
  world.ensureLive().then((live) => live?.add(id, char, { hat: HAT, cloth })).then((info) => {
    if (!info || w.outfitKey !== key || w.root.destroyed || world.destroyed) return;
    const { rect, anchor, meta } = info;
    w.anims = null; w.live = true;
    // 换一个新的 Sprite：旧的那个（建的时候是空贴图）直接换成这张贴图，Pixi 不会重画，人就看不见
    const old = w.sprite;
    w.sprite = new Sprite(new Texture({ source: world.liveSource, frame: new Rectangle(rect.x, rect.y, rect.w, rect.h) }));
    w.root.addChildAt(w.sprite, w.root.getChildIndex(old));
    old.destroy();
    w.sprite.anchor.set(anchor.x, anchor.y);
    w.sprite.scale.set(SPRITE3D / world.live.rs);
    w.upm = LIVE_PX_PER_M * SPRITE3D * Math.SQRT1_2;
    w.headPx = LIVE_PX_PER_M * SPRITE3D * ((meta.height ?? 1.85) + HEAD_PAD);
    w.sheet = true;
    w.sprite.tint = world.charTint;
    w.sprite.visible = true;
    w.body.visible = false;
    const r = LIVE_PX_PER_M * SPRITE3D * 0.34;
    w.shadow.clear()
      .ellipse(0, 0, r * 1.35, r * 0.48).fill({ color: 0x0a0c10, alpha: 0.16 })
      .ellipse(0, 0, r * 0.95, r * 0.32).fill({ color: 0x0a0c10, alpha: 0.24 });
  }).catch((e) => console.warn('[botc] 实时 3D 小人载入失败：', e));
}

/**
 * 3D 小人显示用的位置：服务器的路线是匀速的，这里只改结尾——最后 STOP_T/2 秒开始减速，
 * 比服务器晚 STOP_T/2 秒停稳（走的总路程一样）。中途接上下一段移动时最多差几个单位，看不出来。
 */
function easedAt(m, now) {
  const pts = m.path ?? [{ x: m.fx, y: m.fy }, { x: m.x, y: m.y }];
  const L = pathLength(pts);
  const T = m.dur / 1000; const v = L / (T || 1);
  const b = Math.min(STOP_T, T); const ts = T - b / 2;
  const e = Math.max(0, now - m.start) / 1000;
  const u = Math.min(b, Math.max(0, e - ts));
  const d = e < ts ? v * e : v * ts + v * (u - (u * u) / (2 * b));
  return { at: pointAt(pts, Math.min(L, d)), d, ahead: pointAt(pts, Math.min(L, d + 12)), L, T, e, ts, b, v };
}
/** 3D 小人这段移动还没播完（包括结尾多出来的减速）。 */
const moving3d = (m, now) => m.dur && now < m.start + m.dur + (Math.min(STOP_T, m.dur / 1000) / 2) * 1000;

/**
 * 这一帧该显示哪一段动作的第几帧，以及走过的步数（踩脚步声用）。m.run：这段是跑。
 * 走 / 跑的相位（w.phase，单位：周期）一直累加、跨段移动不清零：走着双击改成跑、连按方向键一段接一段，腿都不会跳帧。
 */
function pickFrame(w, mv, run, t, dt) {
  const A = w.anims;
  if (mv) {
    w.fidget = null; w.nextFidget = null; // 一走动就不做小动作，停下来以后重新计时
    const { e, ts, b, v } = mv;
    const kind = run && A.run ? 'run' : 'walk';
    const stop = A.stop; // 跑着停也用普通的停步：Mixamo 的跑步急停是急刹，整个人会蹲下去
    const start = kind === 'run' && A.runStart ? A.runStart : A.start;
    if (e >= ts && stop) return { anim: stop, i: Math.min(stop.n - 1, Math.floor(((e - ts) / b) * stop.n)) };
    const startT = kind === 'run' ? RUN_START_T : START_T;
    if (w.fromRest && e < startT && start) {
      w.phase = 0; // 起步完正好从周期开头接上
      return { anim: start, i: Math.min(start.n - 1, Math.floor((e / startT) * start.n)) };
    }
    // 走 / 跑：步频按地图上的速度换算（脚和地面对得上），太快时封顶，多出来的让脚滑
    const g = A[kind];
    const ms = v / w.upm;
    const rate = Math.min(ms / g.stride, (g.speed / g.stride) * (MAX_RATE[kind] ?? 1.5));
    w.phase = (w.phase ?? 0) + rate * dt;
    return { anim: g, i: Math.floor((w.phase % 1) * g.n), steps: Math.floor(w.phase * 2) };
  }
  // 站着：平时播待机，隔一阵随机做一个小动作（倒换重心、搓肩、四处看），做完回到待机
  if (w.fidget) {
    const a = A[w.fidget.name]; const T = a.dur / FIDGET_SPEED; const e = t - w.fidget.t0;
    if (e < T) return { anim: a, i: Math.min(a.n - 1, Math.floor((e / T) * a.n)) };
    w.fidget = null; w.nextFidget = t + FIDGET_GAP[0] + Math.random() * FIDGET_GAP[1];
  }
  w.nextFidget ??= t + 3 + Math.random() * FIDGET_GAP[1];
  const opts = FIDGETS.filter((k) => A[k]);
  if (t >= w.nextFidget && opts.length) {
    w.fidget = { name: opts[Math.floor(Math.random() * opts.length)], t0: t };
    return pickFrame(w, null, run, t, dt);
  }
  const idle = A.idle;
  return { anim: idle, i: Math.floor(((t / (idle.dur || 1) + w.offset) % 1) * idle.n) };
}

// ───────────── 前后遮挡排序 ─────────────
// 每个东西有一个俯视的占地框 box。规则：A 的框整个在 B 的西边或北边（x1 ≤ B.x0 或 y1 ≤ B.y0）→ 先画 A。
// 房子拆成 back / front：屋里的东西夹在两者中间。只比较屏幕上会重叠的东西，再做拓扑排序。

const inside = (p, h) => p.cx > h.x && p.cx < h.x + h.w && p.cy > h.y && p.cy < h.y + h.h;
function before(a, b) {
  if (a.house && a.house === b.house) return a.kind === 'back';
  if (b.house && !a.house && inside(a, b.house)) return b.kind === 'front';
  if (a.house && !b.house && inside(b, a.house)) return a.kind === 'back';
  const A = a.box; const B = b.box;
  if (A.x1 <= B.x0 || A.y1 <= B.y0) return true;
  if (B.x1 <= A.x0 || B.y1 <= A.y0) return false;
  return a.cx + a.cy < b.cx + b.cy;
}
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
function screenBounds(pts) {
  let l = Infinity; let r = -Infinity; let t = Infinity; let b = -Infinity;
  for (const [x, y] of pts) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
  return { l, r, t, b };
}
const hexOf = (x, y, w, h, top) => [P(x, y + h), P(x + w, y + h), P(x + w, y), P(x + w, y, top), P(x, y, top), P(x, y + h, top)];
const boxBounds = (x, y, w, h, top) => screenBounds(hexOf(x, y, w, h, top));
function inPoly(poly, x, y) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

export class World {
  /**
   * 在 el 里建一块画布。town 是这局的地图（shared/map.js 的 getMap），tiled 是暗流涌动的 Tiled 地面（town-4 / town-6，别的地图传 null），
   * houses 是这局的房子。
   * guide: 画底稿，不画摆设和小人。true / 'base'：能进的房子只画地基（交给 Codex 画整张大图）；
   *   'closed' / 'open'：在手绘大图上画出房子的外观 / 剖开的室内（交给 Codex 单独画房子）。
   */
  static async create(el, town, tiled, houses, { guide = false } = {}) {
    const w = new World();
    w.guide = guide;
    w.town = town;
    await w.init(el, tiled, houses);
    return w;
  }

  data = null;       // TownMap 每次渲染塞进来：{ players, roam, me }
  onFrame = null;    // 每帧回调：屏幕坐标，TownMap 用它摆 HTML
  walkers = new Map();
  sheetSources = new Map(); // 3D 小人图集的每张图（canvas）→ 这张地图自己的贴图（见 dressPerson）
  live = null;              // 实时渲染的 3D 小人（live3d.js 的 LiveAvatars），用到才建
  liveSource = null;        // 它那张画布在 Pixi 里的贴图
  /** 3D 小人是不是实时渲染（设置里「模型」选 3D 实时）。 */
  get liveMode() { return avatarMode() === 'live'; }
  ensureLive() {
    this.livePromise ??= import('./live3d.js').then(({ LiveAvatars }) => {
      if (this.destroyed) return null;
      // 每格的分辨率跟着屏幕像素密度：高清屏画大一点（不糊），普通屏小一点（省显卡）
      const dpr = this.app?.renderer.resolution ?? 1;
      const live = new LiveAvatars({ scale: Math.min(1.6, Math.max(0.8, SPRITE3D * dpr * 1.3)) });
      live.setTone(this.town.tone?.houses);
      this.live = live;
      this.liveSource = new CanvasSource({ resource: live.canvas, scaleMode: 'linear' });
      return live;
    });
    return this.livePromise;
  }
  /** 设置里换了「人物」的画法：所有小人卸掉，下一帧按新的画法重新穿上。 */
  resetAvatars() {
    for (const [id, w] of this.walkers) {
      if (w.live) this.live?.remove(id);
      w.outfitKey = null; w.anims = null; w.live = false; w.sheet = null; w.headPx = null;
      w.sprite.visible = false; w.body.visible = true;
      w.shadow.clear().ellipse(0, 0, 11 * PERSON, 3.5 * PERSON).fill({ color: 0x000000, alpha: 0.22 }); // 换回线稿小人的影子
    }
  }
  houses = new Map();
  /** 3D 小人的整体色：往这张地图的雾色压一点（雪夜偏冷、黄昏偏暖），和手绘背景的光一致；压多了人发灰像僵尸。 */
  get charTint() {
    const f = this.town?.fog?.color ?? 0xffffff; const k = 0.12;
    const mix = (sh) => Math.round(255 * (1 - k) + ((f >> sh) & 255) * k);
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
  }
  statics = [];      // 不会动的立体物件（建筑、摆设）
  cam = null;
  zoomMul = 1;
  free = false;      // 玩家拖动了镜头，暂时不跟随
  destroyed = false;

  async init(el, map, houses) {
    const town = this.town;
    // 这张地图的手绘大图和房子图（还没画的地图就用程序画的灰盒）
    // 小剧本的地图是前两张图的变体：art 指向借用的那套手绘图
    const paintedBase = baseFor(town.art ?? town.id);
    this.paintedHouses = housesArtFor(town.art ?? town.id);
    const app = new Application();
    await app.init({
      resizeTo: el, background: 0x1a1d1d, antialias: false, preference: 'webgl', powerPreference: 'high-performance', // 手绘图不需要多重采样抗锯齿（高分辨率下很费）；笔记本上请求独立显卡
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
    });
    this.app = app;
    this.map = map;
    if (location.search.includes('debug')) window.__botcWorld = this; // 调试用
    // 设置里换了「人物」的画法就整批换
    let lastAvatars = avatarMode();
    this.offDisplay = onDisplay(() => { const a = avatarMode(); if (a !== lastAvatars) { lastAvatars = a; this.resetAvatars(); } });
    if (PERF) {
      this.perfEl = Object.assign(document.createElement('div'), { className: 'perf-hud' });
      el.appendChild(this.perfEl);
    }
    this.ground = map?.layers.find((l) => l.type === 'tilelayer') ?? null;
    app.canvas.className = 'map-canvas';
    el.prepend(app.canvas);

    this.world = new Container();
    this.plane = new Container();   // 地面层（俯视坐标，套斜切矩阵）
    this.plane.setFromMatrix(new Matrix(1, 0.5, -1, 0.5, 0, 0));
    this.sorted = new Container();
    this.sorted.sortableChildren = true;
    this.groundFog = new Container(); // 贴地的雾团：在地面之上、房子树木小人之下，物件像是从雾里长出来
    this.topFog = new Container();    // 盖在房子前面的雾团（编辑器里勾了「盖在房子前面」的）
    this.world.addChild(this.plane, this.groundFog, this.sorted, this.topFog);
    app.stage.addChild(this.world);

    const houseGuide = this.guide === 'closed' || this.guide === 'open';
    // 手绘底图载入时套上地图色调（编辑器「色调」里调的），从它切出来的树、普通建筑也跟着变
    const rawBase = (!this.guide || houseGuide) && paintedBase ? await loadImage(paintedBase).catch(() => null) : null;
    const base = rawBase && tonedCanvas(rawBase, town.tone?.map);
    if (base) {
      const gl = app.renderer.gl;
      const max = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
      const G = guideOf(town);
      this.world.addChildAt(tiledSprites(base, G.x, G.y, G.w, G.h, max), 0);
      // 画布底色和手绘图四周的暗色一致，镜头拉到地图外面时看不到一条边界线（盖上雾以后尤其明显）
      app.renderer.background.color = 0x0b0f12;
    }

    // 地面：分四块画，避免单张贴图太大（有手绘大图就不画）
    const chunks = [];
    const hw = town.w / 2; const hh = town.h / 2;
    if (!base) for (const oy of [0, hh]) for (const ox of [0, hw]) chunks.push([ox, oy]);
    const grounds = await Promise.all(chunks.map(([ox, oy]) => (map ? paintGround(town, map, ox, oy, hw, hh) : paintPlainGround(town, ox, oy, hw, hh))));
    grounds.forEach((c, i) => {
      const s = new Sprite(Texture.from(c, true));
      s.position.set(chunks[i][0], chunks[i][1]);
      s.scale.set(1 / GROUND_PX);
      this.plane.addChild(s);
    });

    // 建筑的影子（画在地面层，跟着斜切）
    const shadows = new Graphics();
    for (const b of [...(base ? [] : town.obstacles), ...(this.guide ? [] : houses.filter((h) => h.height))]) shadows.poly([b.x + b.w, b.y + 10, b.x + b.w + 26, b.y + 22, b.x + b.w + 26, b.y + b.h + 22, b.x + 14, b.y + b.h + 22, b.x, b.y + b.h]).fill({ color: 0x000000, alpha: 0.14 });
    this.plane.addChild(shadows);

    // 不能进的建筑
    const walls = town.palette?.walls ?? ['#9aa6a2', '#a49a86', '#8f9a8c', '#b0a58f', '#8d9496'];
    const roofs = town.palette?.roofs ?? ['#3f5a5c', '#4a4440', '#5a3a30', '#46524a'];
    town.obstacles.forEach((o, i) => {
      // litHousesOnly：只有能进的房子亮灯（地图设计约定），不能进的建筑窗户全暗
      const b = { ...o, wall: o.wall ?? walls[i % walls.length], roof: o.roof ?? roofs[i % roofs.length], snow: town.roofSnow, lit: !town.litHousesOnly };
      const box = { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
      if (base) { // 手绘：从大图里切出这栋楼
        const poly = silhouette(b, i * 13);
        this.addStatic(cutout(base, poly, guideOf(town)), box, screenBounds(poly), { poly });
        return;
      }
      const g = new Graphics();
      const shape = SHAPES[o.shape];
      if (!shape) frontWalls(g, b, i * 13);
      const top = shape ? shape(g, b, i * 13) : roof(g, b, i * 13);
      this.addStatic(g, box, boxBounds(o.x, o.y, o.w, o.h, top), { poly: hexOf(o.x, o.y, o.w, o.h, (o.height + top) / 2) });
    });

    // 走不过去的圆：钟楼、地标、树林
    for (const [ci, TOWER] of town.circles.entries()) {
    const tBox = { x0: TOWER.x - TOWER.r, y0: TOWER.y - TOWER.r, x1: TOWER.x + TOWER.r, y1: TOWER.y + TOWER.r };
    if (TOWER.kind !== 'tower' && base) {
      // 手绘大图里已经画了树林 / 地标：按占地和高度从大图里切出来，参与前后遮挡（挡住我时会半透明）
      const s = TOWER.r * (TOWER.kind === 'trees' ? 0.82 : 0.75);
      const top = ({ trees: 95, beacon: 180, ruin: 180, fountain: 232, well: 50, gallows: 100 }[TOWER.kind] ?? 60) * (town.artScale ?? 1);
      const poly = hexOf(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, top);
      this.addStatic(cutout(base, poly, guideOf(town)), { x0: TOWER.x - s, y0: TOWER.y - s, x1: TOWER.x + s, y1: TOWER.y + s }, screenBounds(poly), { poly });
      continue;
    }
    if (TOWER.kind !== 'tower') {
      const tg = new Graphics();
      const top = TOWER.hedge ? hedge(tg, TOWER, ci * 31 + 7) : TOWER.dead ? deadTrees(tg, TOWER, ci * 31 + 7) : TOWER.kind === 'trees' ? trees(tg, TOWER, ci * 31 + 7, TOWER.colors ?? town.treeColors) : LANDMARKS[TOWER.kind]?.(tg, TOWER) ?? 0;
      // 占地框按树干 / 塔身算小一点，人能走到树冠后面
      const s = TOWER.r * (TOWER.kind === 'trees' ? 0.82 : 0.75);
      const box = { x0: TOWER.x - s, y0: TOWER.y - s, x1: TOWER.x + s, y1: TOWER.y + s };
      const bounds = boxBounds(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, top);
      this.addStatic(tg, box, bounds, TOWER.kind === 'beacon' || TOWER.kind === 'ruin' ? { poly: hexOf(TOWER.x - s, TOWER.y - s, s * 2, s * 2, top * 0.6) } : {});
      continue;
    }
    if (base) {
      // 沿手绘钟楼的轮廓抠：塔身 → 屋檐 → 顺着两条屋脊到尖顶（z≈258）→ 一根细天线。
      // 不能取凸包：凸包会把塔尖两侧的背景（雪地、后面的地基）也抠进来，盖在后面的房子上。
      // 屋脊往里收 4 像素、只到尖顶，宁可少抠一点也别带进背景（钟楼后面是酒馆的地基，带进来就是一圈浅色边）
      // 塔身按画里的墙宽（r≈42）抠，到屋檐再放宽到屋顶的出檐（r=48）
      const r = TOWER.r + 6; const b = TOWER.r; const { x: tx, y: ty } = TOWER;
      const peak = P(tx, ty, 254);
      const eaveR = P(tx + r, ty - r, 170); const eaveL = P(tx - r, ty + r, 170);
      const wallR = P(tx + b, ty - b, 172); const wallL = P(tx - b, ty + b, 172);
      const poly = [
        P(tx - b, ty + b, 0), P(tx + b, ty + b, 0), P(tx + b, ty - b, 0), wallR,
        [eaveR[0] - 4, eaveR[1]], [peak[0], peak[1] + 4], [eaveL[0] + 4, eaveL[1]], wallL,
      ];
      this.addStatic(cutout(base, poly, guideOf(town)), tBox, screenBounds(poly), { poly });
    } else {
      const tg = new Graphics();
      const top = tower(tg, TOWER);
      this.addStatic(tg, tBox, boxBounds(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, top), { poly: hexOf(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, 190) });
    }
    }

    // 拱门：人从底下穿过去，占地只有柱子那一条
    for (const a of town.arches ?? []) {
      const along = a.along === 'y'; const hw = along ? a.half : 6; const hh = along ? 6 : a.half;
      const box = { x0: a.x - hw, y0: a.y - hh, x1: a.x + hw, y1: a.y + hh };
      if (base) {
        const poly = hexOf(a.x - hw, a.y - hh, hw * 2, hh * 2, 102);
        this.addStatic(cutout(base, poly, guideOf(town)), box, screenBounds(poly), { poly });
      } else {
        const g = new Graphics();
        const top = arch(g, a);
        this.addStatic(g, box, boxBounds(a.x - hw, a.y - hh, hw * 2, hh * 2, top));
      }
    }

    // 彩旗：挂在半空，手绘图里已经画了就不再叠
    if (!base && town.garlands?.length) {
      const g = new Graphics();
      town.garlands.filter((q) => !(this.guide && q.onHouse)).forEach((q) => garland(g, q)); // 挂在房子上的彩旗跟房子一起画，底稿里只有地基
      this.topFog.addChild(g);
    }

    // 摆设（Tiled 里的 props 层）
    // 有手绘大图时不再叠程序画的摆设（树、长椅、路灯……），和手绘风格不搭
    const props = this.guide || base || !map ? [] : map.layers.find((l) => l.name === 'props')?.objects ?? [];
    await Promise.all(props.map(async (o) => {
      const flip = o.properties?.some((p) => p.name === 'flip' && p.value);
      const key = flip && PROPS[`${o.type}:flip`] ? `${o.type}:flip` : o.type;
      const def = PROPS[key];
      if (!def) return;
      const x = (o.x * TILE) / TILE_PX; const y = (o.y * TILE) / TILE_PX;
      const [sx, sy] = P(x, y);
      const k = def.scale;
      const s = new Sprite(Texture.from(await raster(key, def.el, def.box), true));
      s.scale.set(k / RASTER_SCALE);
      s.position.set(sx + def.box[0] * k, sy + (def.box[1] - def.foot) * k);
      const r = 6;
      this.addStatic(s, { x0: x - r, y0: y - r, x1: x + r, y1: y + r },
        { l: s.x, t: s.y, r: s.x + def.box[2] * k, b: s.y + def.box[3] * k });
    }));

    if (this.guide) {
      if (houseGuide) {
        await this.buildHouses(houses, { procedural: true });
        for (const e of this.houses.values()) {
          e.doorLocked.visible = false;
          if (this.guide === 'open') { e.shell.visible = false; e.doorOpen.visible = false; }
        }
      } else this.drawPlots(houses);
      this.buildStaticOrder();
      this.sortScene([]);
      const G = guideOf(town);
      const bg = new Graphics().rect(G.x, G.y, G.w, G.h).fill(0x1a1d1d);
      this.world.addChildAt(bg, 0);
      this.fitGuide();
      app.renderer.on('resize', () => this.fitGuide());
      return;
    }
    await this.buildHouses(houses);
    await this.buildIdleHouses(houses);
    this.buildStaticOrder();

    if (town.fog && !this.guide) this.buildFog(town.fog);
    if (town.weather === 'snow') this.buildSnow();
    else if (town.weather === 'festival') { this.buildSnow({ count: 60, speed: 0.1, storm: false }); this.buildFireworks(); }
    else if (town.weather === 'drizzle') this.buildRain();
    else if (town.weather === 'leaves') this.buildLeaves();
    else if (town.weather === 'petals') this.buildLeaves(['#b79ad8', '#e8a8bf', '#f2e6c8'], 12);
    if (town.lanterns?.length) this.buildLanterns(town.lanterns);
    app.renderer.on('resize', () => this.layout());
    app.ticker.add(() => this.frame());
  }

  /**
   * 暴风雪：一层细密的雪片顺着风往右下猛刮（不要前景的大雪片）。镜头移动时雪按比例错开（视差），
   * 有一点纵深感。画在屏幕坐标里，盖在整个小镇上面。
   */
  buildSnow({ count = 260, speed = 0.3, storm = true } = {}) {
    const dot = (r, soft) => {
      const c = document.createElement('canvas'); c.width = c.height = r * 4;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(r * 2, r * 2, 0, r * 2, r * 2, r * 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, r * 4, r * 4);
      return Texture.from(c);
    };
    const far = dot(3, 0.35);
    this.snow = new Container();
    this.app.stage.addChild(this.snow);
    const layer = (tex, n, [s0, s1], [a0, a1], speed, parallax) => {
      const items = [];
      for (let i = 0; i < n; i++) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.scale.set(s0 + Math.random() * (s1 - s0));
        sp.alpha = a0 + Math.random() * (a1 - a0);
        this.snow.addChild(sp);
        items.push({ sp, x: Math.random(), y: Math.random(), v: speed * (0.7 + Math.random() * 0.6), sway: Math.random() * Math.PI * 2 });
      }
      return { items, parallax };
    };
    this.snowLayers = [layer(far, count, [0.3, 0.7], [0.12, 0.34], speed, 0.6)];
    if (!storm) { this.snowLayers[0].drift = 0.15; return; } // 雪停了：零星几片，慢慢往下落
    // 雪片顺着 45° 的风向拉长一点（和等距视角的斜线一致），像被吹着跑
    for (const f of this.snowLayers[0].items) { f.sp.scale.y *= 1.9; f.sp.rotation = -Math.PI / 4; }
  }

  /** 细雨（窃窃私语）：又细又淡的雨丝，几乎竖直往下落，比雪快得多。和雪共用 snowFrame。 */
  buildRain() {
    const c = document.createElement('canvas'); c.width = 2; c.height = 26;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 26);
    g.addColorStop(0, 'rgba(210,225,230,0)'); g.addColorStop(1, 'rgba(210,225,230,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 26);
    const tex = Texture.from(c);
    this.snow = new Container();
    this.app.stage.addChild(this.snow);
    const items = [];
    for (let i = 0; i < 150; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5); sp.rotation = -0.12;
      sp.scale.set(0.6 + Math.random() * 0.5);
      sp.alpha = 0.08 + Math.random() * 0.16;
      this.snow.addChild(sp);
      items.push({ sp, x: Math.random(), y: Math.random(), v: 1.1 * (0.8 + Math.random() * 0.4), sway: 0 });
    }
    this.snowLayers = [{ items, parallax: 0.7, drift: 0.12 }];
  }

  /**
   * 烟花（无上愉悦）：按 45° 视角的立体来做。每隔几秒从镜头里的某条街上升起一支火箭，拖着一道细尾巴到半空，
   * 在空中按球面炸开：几十颗火星各带一小段拖尾（按上一瞬间的位置连线），受重力往下弯、越飞越慢，最后闪几下熄灭；
   * 炸开的一瞬有一团很短的光晕。坐标是世界的 (x, y, 高度)，用和地图一样的投影画，所以球面炸开在画面上是正确的扁圆。
   * 两种：牡丹（彩色、炸得快）和柳（金色、慢、垂得长）。火星用正常混合、颜色要浓：底下大多是雪地，叠加混合在白雪上看不见。
   */
  buildFireworks() {
    this.fw = { g: new Graphics(), flashes: new Container(), rockets: [], sparks: [], next: 2 };
    this.fw.flashTex = Texture.from(fogBlob(64));
    this.world.addChild(this.fw.flashes, this.fw.g);
  }

  /** 屏幕上的一点对应的地面（高度 0）坐标。 */
  groundAt(sx, sy) {
    const k = this.world.scale.x || 1;
    const wx = (sx - this.world.x) / k; const wy = (sy - this.world.y) / k;
    return { x: wy + wx / 2, y: wy - wx / 2 };
  }

  fireworksFrame(dt) {
    const F = this.fw;
    if (!F) return;
    dt = Math.min(dt, 0.05);
    F.next -= dt;
    if (F.next <= 0) {
      F.next = 2.5 + Math.random() * 4.5;
      const W = this.app.screen.width; const H = this.app.screen.height;
      const o = this.groundAt(W * (0.25 + Math.random() * 0.5), H * (0.6 + Math.random() * 0.3));
      const willow = Math.random() < 0.3;
      const color = willow ? 0xf2b33c : [0xe8402a, 0x2f9e5a, 0x3a72d8, 0xd2409e, 0xf0a020][Math.floor(Math.random() * 5)];
      F.rockets.push({ x: o.x, y: o.y, z: 0, vz: 380 + Math.random() * 60, top: 260 + Math.random() * 110, color, willow });
    }
    for (const r of F.rockets) {
      r.z += r.vz * dt; r.vz *= 1 - dt * 0.5;
      if (r.z < r.top) continue;
      r.done = true;
      const n = r.willow ? 64 : 96; const speed = r.willow ? 150 : 230;
      for (let i = 0; i < n; i++) {
        // 球面上均匀取方向
        const u = Math.random() * 2 - 1; const t = Math.random() * Math.PI * 2; const q = Math.sqrt(1 - u * u);
        const v = speed * (0.85 + Math.random() * 0.3);
        F.sparks.push({ x: r.x, y: r.y, z: r.z, vx: q * Math.cos(t) * v, vy: q * Math.sin(t) * v, vz: u * v, age: 0,
          life: (r.willow ? 2.6 : 1.5) + Math.random() * 0.6, color: Math.random() < 0.12 ? 0xfff1c8 : r.color, willow: r.willow });
      }
      const p = iso(r.x, r.y, r.z);
      const fl = new Sprite(F.flashTex);
      fl.anchor.set(0.5); fl.tint = 0xfff0c0; fl.position.set(p.x, p.y); fl.width = fl.height = 40;
      F.flashes.addChild(fl);
    }
    F.rockets = F.rockets.filter((r) => !r.done);
    for (const fl of [...F.flashes.children]) {
      fl.alpha -= dt * 3.5; fl.width = fl.height = fl.width + dt * 260;
      if (fl.alpha <= 0) fl.destroy();
    }
    const g = F.g;
    g.clear();
    const px = 1 / (this.world.scale.x || 1); // 线宽按屏幕像素算：镜头拉远时火星不会细到看不见
    for (const r of F.rockets) { // 火箭：一道细尾巴
      const a = iso(r.x, r.y, r.z); const b = iso(r.x, r.y, Math.max(0, r.z - 34));
      g.moveTo(b.x, b.y).lineTo(a.x, a.y).stroke({ width: 1.6 * px, color: 0xffe2a0, alpha: 0.85 });
    }
    F.sparks = F.sparks.filter((f) => {
      f.age += dt;
      if (f.age >= f.life) return false;
      const drag = f.willow ? 1.6 : 1.9;
      f.vx *= 1 - dt * drag; f.vy *= 1 - dt * drag; f.vz *= 1 - dt * drag;
      f.vz -= (f.willow ? 70 : 55) * dt; // 重力：往下弯
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const left = 1 - f.age / f.life;
      const tail = (f.willow ? 0.32 : 0.16) * Math.min(1, f.age * 4); // 拖尾：上一小段时间里的位置（刚炸开时短）
      const at = (k) => iso(f.x - f.vx * tail * k, f.y - f.vy * tail * k, f.z - f.vz * tail * k + (f.willow ? 10 * k * k : 0));
      const flicker = left < 0.3 ? (Math.sin(f.age * 50 + f.x) > 0 ? 1 : 0.25) : 1; // 快熄时闪几下
      const alpha = Math.min(1, left * 1.6) * flicker;
      const pts = [at(0), at(0.35), at(0.7), at(1)];
      // 先垫一道深色的宽线：底下多是白雪，没有暗边的火星看不清
      g.moveTo(pts[0].x, pts[0].y).lineTo(pts[2].x, pts[2].y).stroke({ width: 3.6 * px, color: 0x1a1008, alpha: alpha * 0.28 });
      [1, 0.55, 0.22].forEach((k, i) => g.moveTo(pts[i].x, pts[i].y).lineTo(pts[i + 1].x, pts[i + 1].y).stroke({ width: (2 - i * 0.4) * px, color: f.color, alpha: alpha * k }));
      g.circle(pts[0].x, pts[0].y, 1.9 * px).fill({ color: f.age < 0.25 ? 0xfff6dc : f.color, alpha });
      return true;
    });
  }

  /** 灯笼串（无上愉悦）：两端挂在屋角和钟楼上，中间垂下来一道弧，上面一串暖光，慢慢一明一暗。 */
  buildLanterns(list) {
    const cord = new Graphics();
    const glowTex = Texture.from(fogBlob(64));
    this.lanternGlows = [];
    const lights = new Container();
    const pools = new Container(); // 地上的暖光：画在地面雾那一层（雪地上、房子和人底下）
    for (const [[ax, ay, az], [bx, by, bz]] of list) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(iso(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t - 26 * Math.sin(Math.PI * t)));
      }
      cord.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) cord.lineTo(q.x, q.y);
      pts.slice(1, -1).forEach((q, i) => {
        const color = [0xffcf6b, 0xff8a4a, 0xffe6a0][i % 3];
        const glow = new Sprite(glowTex);
        glow.anchor.set(0.5); glow.tint = color; glow.blendMode = 'add'; glow.width = glow.height = 46; glow.alpha = 0.55;
        glow.position.set(q.x, q.y + 5);
        const bulb = new Graphics().roundRect(q.x - 3.5, q.y, 7, 10, 3).fill(color).stroke({ width: 1, color: 0x5a2a12, alpha: 0.6 });
        lights.addChild(glow, bulb);
        this.lanternGlows.push({ glow, ph: Math.random() * Math.PI * 2 });
        if (i % 2) return;
        const t = (i + 1) / 12; // 灯正下方地上的那一点
        const g = iso(ax + (bx - ax) * t, ay + (by - ay) * t);
        const pool = new Sprite(glowTex);
        pool.anchor.set(0.5); pool.tint = 0xffb45a; pool.blendMode = 'add'; pool.alpha = 0.22;
        pool.width = 150; pool.height = 75;
        pool.position.set(g.x, g.y);
        pools.addChild(pool);
      });
    }
    cord.stroke({ width: 1.4, color: 0x2a1c12, alpha: 0.8 });
    this.groundFog.addChild(pools);
    this.topFog.addChild(cord, lights);
  }

  lanternFrame(t) {
    for (const l of this.lanternGlows ?? []) l.glow.alpha = 0.45 + 0.15 * Math.sin(t * 1.7 + l.ph);
  }

  snowFrame(dt, t) {
    if (!this.snowLayers) return;
    const W = this.app.screen.width; const H = this.app.screen.height;
    const cam = this.cam ?? { x: 0, y: 0 };
    const last = this.snowCam ?? cam;
    const dx = (cam.x - last.x) * this.zoom; const dy = (cam.y - last.y) * this.zoom;
    this.snowCam = { ...cam };
    for (const L of this.snowLayers) {
      for (const f of L.items) {
        f.y += f.v * dt - (dy * L.parallax) / H;
        f.x += (f.v * (H / W) * dt) * (L.drift ?? 1) - (dx * L.parallax) / W; // 暴风雪：正 45° 往右下刮（横竖走同样的像素）；drift 小的几乎竖直落
        f.x -= Math.floor(f.x); f.y -= Math.floor(f.y);
        f.sp.position.set(f.x * W + Math.sin(t * 2.2 + f.sway) * 4, f.y * H);
        if (f.spin) f.sp.rotation += f.spin * dt;
      }
    }
  }

  /**
   * 雾（加立体感）：三层。
   * ① 地面雾：一团团压扁的软圆，沿溪谷、林子边和空地铺开，画在地面和物件之间，慢慢飘、明暗起伏；
   * ② 远处的雾气：屏幕上方（地图远处）蒙一层雾色，越远越朦胧（空气透视）；
   * ③ 前景雾：两层平铺的噪声雾盖在最上面，镜头移动时比地面挪得快（视差），像隔着雾看下去。
   * fog：{ color, ground（地面雾浓度）, haze（远处）, mist（前景）}，见各地图数据。
   */
  buildFog(F) {
    const town = this.town;
    const color = F.color ?? 0xc8c4bc;
    // ① 地面雾：在编辑器（?preview=layout 的「地面雾」）里手动摆过就用手动的，否则按默认摆法
    const blob = Texture.from(fogBlob());
    const spots = town.fogSpots?.length ? town.fogSpots : autoFogSpots(town);
    this.fogBlobs = spots.map(({ x, y, w: width, a, f = 0.36, top = false }) => {
      const p = iso(x, y);
      const sp = new Sprite(blob);
      sp.anchor.set(0.5); sp.tint = color;
      sp.width = width; sp.height = width * f;
      const alpha = a * (top ? F.topMul ?? 1 : F.groundMul ?? 1);
      const span = (town.w + town.h) / 2; // 地图在屏幕上从上到下的高度（斜视角）
      sp.alpha = alpha; sp.position.set(p.x, p.y);
      (top ? this.topFog : this.groundFog).addChild(sp);
      return { sp, x: p.x, y: p.y, a: alpha, ph: Math.random() * Math.PI * 2, yn: Math.max(0, Math.min(1, p.y / span)) };
    });
    // ② ③ 屏幕上的两层，放在小镇上面、落叶下面
    this.fogScreen = new Container();
    const haze = new Sprite(Texture.from(hazeGradient()));
    haze.tint = color; haze.alpha = F.haze ?? 0.3;
    const noise = Texture.from(fogNoise());
    this.fogMist = [[1.35, 2.6, 1, 14], [1.8, 3.8, 0.7, 24]].map(([parallax, scale, k, wind]) => {
      const ts = new TilingSprite({ texture: noise, width: 16, height: 16 });
      ts.tint = color; ts.alpha = (F.mist ?? 0.1) * k;
      this.fogScreen.addChild(ts);
      return { ts, parallax, scale, wind };
    });
    this.fogScreen.addChildAt(haze, 0);
    this.fogHaze = haze; this.hazeA = haze.alpha;
    for (const m of this.fogMist) m.a0 = m.ts.alpha;
    this.fogBorn = Date.now();
    this.app.stage.addChildAt(this.fogScreen, this.app.stage.getChildIndex(this.world) + 1);
  }

  fogFrame(dt, t) {
    if (!this.fogScreen) return;
    const W = this.app.screen.width; const H = this.app.screen.height;
    // 地面雾跟着同一股缓慢的"气流"走：位移是位置的平滑函数，挨着的雾团往同一个方向漂（联动），
    // 浓淡起伏是一道道斜着扫过地面的波；再叠一点点各自的小晃动，免得太整齐。幅度都很小。
    // 一天里的时辰：自由活动刚开始是清晨，雾最淡；快集合时是傍晚，雾最浓（没有限时就按 5 分钟算）
    const r = this.data?.roam; const now = serverNow();
    const since = r?.since ?? this.fogBorn; const span = r?.until && r?.since ? r.until - r.since : 300_000;
    const day = Math.max(0, Math.min(1, (now - since) / span));
    const thick = 0.45 + 0.8 * day; // 早上 0.45 倍 → 傍晚 1.25 倍
    for (const f of this.fogBlobs) {
      const u = f.x * 0.0021; const v = f.y * 0.0042;
      const side = thick;
      const flowX = Math.sin(t * 0.11 + u + v * 0.6) + 0.6 * Math.sin(t * 0.067 - v * 1.3 + u * 0.4);
      const flowY = Math.cos(t * 0.09 + v - u * 0.5) * 0.45;
      f.sp.position.set(f.x + flowX * 22 + Math.sin(t * 0.21 + f.ph) * 4, f.y + flowY * 14 + Math.sin(t * 0.17 + f.ph) * 2);
      const wave = Math.sin(t * 0.16 - (u + v) * 1.6);
      f.sp.alpha = f.a * side * (0.82 + 0.14 * wave + 0.04 * Math.sin(t * 0.3 + f.ph));
    }
    this.fogHaze.width = W; this.fogHaze.height = H;
    this.fogHaze.alpha = this.hazeA * (0.55 + 0.6 * day); // 远处的雾气也是早上淡、傍晚浓
    const cam = this.cam ?? { x: 0, y: 0 }; const z = this.zoom ?? 1;
    for (const m of this.fogMist) {
      m.ts.width = W; m.ts.height = H;
      m.ts.alpha = m.a0 * (0.55 + 0.6 * day);
      m.ts.tileScale.set(z * m.scale);
      // 视差：前景雾跟着镜头挪得比地面快；再加一点风，往右下慢慢飘
      m.ts.tilePosition.set(-cam.x * z * m.parallax + t * m.wind, -cam.y * z * m.parallax + t * m.wind * 0.5);
    }
  }

  /** 落叶：稀稀拉拉的几片橙红叶子打着旋往右下飘（黯月初升）；换颜色、加数量就是花瓣（梦殒春宵）。和雪共用 snowFrame。 */
  buildLeaves(colors = ['#c4502a', '#e08a3a', '#8a3a22'], count = 5) {
    const leaf = (col) => {
      const c = document.createElement('canvas'); c.width = 14; c.height = 8;
      const ctx = c.getContext('2d');
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(7, 4, 6, 3, 0, 0, 7); ctx.fill();
      return Texture.from(c);
    };
    const texs = colors.map(leaf);
    this.snow = new Container();
    this.app.stage.addChild(this.snow);
    const items = [];
    // 只有零星几片，而且在远处：小、淡、飘得慢、跟镜头的视差也小
    for (let i = 0; i < count; i++) {
      const sp = new Sprite(texs[i % texs.length]);
      sp.anchor.set(0.5);
      sp.scale.set(0.35 + Math.random() * 0.25);
      sp.alpha = 0.3 + Math.random() * 0.2;
      this.snow.addChild(sp);
      items.push({ sp, x: Math.random(), y: Math.random(), v: 0.03 * (0.7 + Math.random() * 0.6), sway: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2 });
    }
    this.snowLayers = [{ items, parallax: 0.45 }];
  }

  /** 底稿里能进的房子只画一圈石头地基，房子本身之后单独画、单独叠上去。 */
  drawPlots(houses) {
    const g = new Graphics();
    for (const h of houses) {
      g.rect(h.x - 6, h.y - 6, h.w + 12, h.h + 12).fill(0xcfccc2).stroke({ width: 3, color: 0x1d2524 });
      g.rect(h.x + 6, h.y + 6, h.w - 12, h.h - 12).fill(0xe2dfd6).stroke({ width: 1, color: 0x7d8380 });
    }
    this.plane.addChild(g);
  }

  fitGuide() {
    const G = guideOf(this.town);
    const k = Math.min(this.app.screen.width / G.w, this.app.screen.height / G.h);
    this.world.scale.set(k);
    this.world.position.set((this.app.screen.width - G.w * k) / 2 - G.x * k, (this.app.screen.height - G.h * k) / 2 - G.y * k);
  }

  /** 把底稿按 1 世界像素 = 1 像素导出成 canvas（默认整张 GUIDE，也可以给一个范围）。 */
  exportGuide(rect = guideOf(this.town)) {
    const { x, y } = this.world; const k = this.world.scale.x;
    this.world.position.set(0, 0); this.world.scale.set(1);
    const canvas = this.app.renderer.extract.canvas({ target: this.world, frame: new Rectangle(rect.x, rect.y, rect.w, rect.h), resolution: 1 });
    this.world.position.set(x, y); this.world.scale.set(k);
    return canvas;
  }

  addStatic(node, box, bounds, extra = {}) {
    const item = { node, box, ...bounds, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, ...extra };
    this.statics.push(item);
    this.sorted.addChild(node);
    return item;
  }

  async buildHouses(houses, { procedural = false } = {}) {
    await Promise.all(houses.map(async (hs) => {
      if (!procedural && (await this.buildPaintedHouse(hs))) return;
      const f = houseFloor(hs);
      const floor = new Sprite(Texture.from(await raster(`floor:${hs.id}`, f.el, f.box), true));
      floor.position.set(hs.x, hs.y);
      floor.scale.set(1 / RASTER_SCALE);
      this.plane.addChild(floor);

      const box = { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h };
      const back = new Graphics();
      const front = new Container();
      const shell = new Graphics();
      const doorOpen = new Graphics(); const doorLocked = new Graphics();
      let top = 30;
      if (!hs.height) { // 露天的（墓园）：一圈矮栅栏；遗迹地窖是断墙和下沉的洞口
        const edge = hs.pit ? rubbleWall : fence;
        if (hs.pit) pitStairs(back, hs);
        edge(back, hs, ['n', 'w']);
        door(doorOpen, hs, false); door(doorLocked, hs, true);
        back.addChild(doorOpen, doorLocked);
        edge(shell, hs, ['s', 'e']);
      } else {
        backWalls(back, hs);
        frontWalls(shell, { ...hs, door: { ...hs.door, side: hs.side }, lit: this.town.litHousesOnly || undefined }, hs.x);
        top = roof(shell, { ...hs, snow: this.town.roofSnow }, hs.x);
        door(doorOpen, hs, false); door(doorLocked, hs, true);
      }
      front.addChild(shell);
      const swing = new Graphics();
      if (hs.height) front.addChild(doorOpen, doorLocked, swing);
      const bounds = boxBounds(hs.x, hs.y, hs.w, hs.h, top);
      const entry = { hs, shell, doorOpen, doorLocked, swing, doorK: 0, labelZ: top + 14 };
      entry.back = this.addStatic(back, box, bounds, { house: hs, kind: 'back' });
      entry.front = this.addStatic(front, box, bounds, { house: hs, kind: 'front', poly: hexOf(hs.x, hs.y, hs.w, hs.h, (hs.height + top) / 2) });
      // 遗迹地窖的断柱
      if (hs.pit) {
        for (const [u, v, tall] of [[0.1, 0.14, 70], [0.34, 0.1, 44], [0.86, 0.14, 58], [0.12, 0.82, 34], [0.9, 0.8, 50]]) {
          const tx = hs.x + hs.w * u; const ty = hs.y + hs.h * v;
          const g = new Graphics(); brokenColumn(g, tall);
          const [sx, sy] = P(tx, ty); g.position.set(sx, sy);
          this.addStatic(g, { x0: tx - 8, y0: ty - 8, x1: tx + 8, y1: ty + 8 }, { l: sx - 10, r: sx + 10, t: sy - tall - 7, b: sy + 2 });
        }
      }
      // 墓碑
      if (!hs.height && !hs.pit) {
        for (let i = 0; i < 8; i++) {
          const tx = hs.x + 36 + (i % 4) * 46 + (Math.floor(i / 4) % 2) * 18; const ty = hs.y + 50 + Math.floor(i / 4) * 70;
          const g = new Graphics(); tomb(g, !!this.town.roofSnow);
          const [sx, sy] = P(tx, ty); g.position.set(sx, sy);
          this.addStatic(g, { x0: tx - 5, y0: ty - 5, x1: tx + 5, y1: ty + 5 }, { l: sx - 9, r: sx + 9, t: sy - 20, b: sy + 4 });
        }
      }
      this.houses.set(hs.id, entry);
    }));
  }

  /**
   * 手绘的房子：open 图是"地板 + 后墙 + 室内"（人在屋里时夹在中间），closed 图是整栋外观（有人在里面时淡掉）。
   * 透明背景的 PNG 整张直接用（房子可以造型奇特、超出占地）；不透明的图按轮廓切。
   * 锁门时在门上画一把小锁。没有图就返回 false，退回程序画的房子。
   */
  async buildPaintedHouse(hs) {
    const art = this.paintedHouses;
    const openUrl = art[`house-${hs.id}-open`];
    // 能进的房子用亮着灯的外观（有的话）
    const closedUrl = art[`house-${hs.id}-closed-lit`] ?? art[`house-${hs.id}-closed`];
    if (!openUrl || (!closedUrl && hs.height)) return false;
    const tone = (img) => img && tonedCanvas(img, this.town.tone?.houses); // 建筑色调
    const [openImg, closedImg] = await Promise.all([loadImage(openUrl).then(tone), closedUrl ? loadImage(closedUrl).then(tone) : null]).catch(() => [null, null]);
    if (!openImg) return false;
    // 外观、室内可以分别缩放（手动微调，见 maps/bmr-layout.js）
    const rect = closedArtRect(hs);
    const openRect = houseArtRect(hs, hs.openK ?? 1);
    const box = { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h };
    const wallH = hs.height || 18;
    const whole = (img, r = rect) => { const sp = new Sprite(paintTex(img)); sp.position.set(r.x, r.y); sp.width = r.w; sp.height = r.h; return sp; };
    const rectPoly = [[openRect.x, openRect.y], [openRect.x + openRect.w, openRect.y], [openRect.x + openRect.w, openRect.y + openRect.h], [openRect.x, openRect.y + openRect.h]];
    const transparent = hasAlpha(openImg);
    let backPoly = hexOf(hs.x - 8, hs.y - 8, hs.w + 16, hs.h + 16, wallH + 6);
    const back = transparent ? whole(openImg, openRect) : cutoutFrom(openImg, openRect, backPoly);
    if (transparent) backPoly = rectPoly;
    const front = new Container();
    let shell = new Container();
    let frontPoly = backPoly; let top = wallH; let hitTest = null;
    if (closedImg) {
      top = hs.height + Math.min(hs.w, hs.h) * 0.38 + 20;
      if (hasAlpha(closedImg)) { shell = withHalo(whole(closedImg), closedImg, rect); frontPoly = opaqueHull(closedImg, rect); hitTest = alphaHit(closedImg, rect); top = Math.max(top, (hs.x + hs.y + (hs.w + hs.h) / 2) / 2 - frontPoly.reduce((m, p) => Math.min(m, p[1]), Infinity)); }
      else { frontPoly = silhouette(hs, hs.x); shell = cutoutFrom(closedImg, rect, frontPoly); }
    }
    const doorOpen = new Graphics(); const doorLocked = new Graphics();
    door(doorLocked, hs, true);
    const swing = new Graphics();
    front.addChild(shell, doorLocked, swing);
    const entry = { hs, shell, doorOpen, doorLocked, swing, doorK: 0, labelZ: top + 14, painted: true, single: !closedImg, hitTest }; // single：只有一张图（墓园），没有外观可关
    entry.back = this.addStatic(back, box, screenBounds(backPoly), { house: hs, kind: 'back' });
    entry.front = this.addStatic(front, box, screenBounds(frontPoly), { house: hs, kind: 'front', poly: frontPoly });
    this.houses.set(hs.id, entry);
    setTimeout(() => this.warmTextures(back), 400 + Math.random() * 1600);
    return true;
  }

  /** 把一棵节点下所有贴图先传到显卡，免得第一次显示时卡一下、露出底下的地面。 */
  warmTextures(node) {
    const tex = this.app?.renderer?.texture;
    if (!tex?.initSource || node.destroyed) return;
    const walk = (n) => {
      if (n.texture?.source) { try { tex.initSource(n.texture.source); } catch { /* 传不上就等第一次显示 */ } }
      for (const c of n.children ?? []) walk(c);
    };
    walk(node);
  }

  /** 这局没开放的房子：有手绘图就画出外观，当成不能进的普通建筑（不然地图上只剩一块空地基）。 */
  async buildIdleHouses(active) {
    const idle = this.town.allHouses().filter((h) => !active.some((a) => a.id === h.id));
    const art = this.paintedHouses;
    await Promise.all(idle.map(async (hs) => {
      const url = art[`house-${hs.id}-closed`] ?? art[`house-${hs.id}-open`];
      if (!url) { this.buildIdleBox(hs); return; }
      const img = await loadImage(url).then((im) => tonedCanvas(im, this.town.tone?.houses)).catch(() => null);
      if (!img) return;
      const rect = closedArtRect(hs);
      const sp = new Sprite(paintTex(img));
      sp.position.set(rect.x, rect.y); sp.width = rect.w; sp.height = rect.h;
      const poly = hasAlpha(img) ? opaqueHull(img, rect) : silhouette(hs, hs.x);
      this.addStatic(hasAlpha(img) ? withHalo(sp, img, rect) : sp, { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h }, screenBounds(poly), { poly, idle: true });
    }));
  }

  /** 没有手绘图的空房子：画成普通的体块建筑，免得只剩一块空地基。 */
  buildIdleBox(hs) {
    if (!hs.height) { // 露天的墓园没开放就只是一块空地；遗迹地窖的洞口还在，只是不能私聊
      if (!hs.pit) return;
      const pit = new Graphics();
      pitStairs(pit, hs);
      rubbleWall(pit, hs, ['n', 'w', 's', 'e']);
      this.addStatic(pit, { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h }, boxBounds(hs.x, hs.y, hs.w, hs.h, 30), { idle: true });
      return;
    }
    const g = new Graphics();
    const b = { ...hs, snow: this.town.roofSnow, door: null, lit: !this.town.litHousesOnly };
    frontWalls(g, b, hs.x);
    const top = roof(g, b, hs.x);
    this.addStatic(g, { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h }, boxBounds(hs.x, hs.y, hs.w, hs.h, top), { poly: hexOf(hs.x, hs.y, hs.w, hs.h, (hs.height + top) / 2), idle: true });
  }

  /** 静态物件之间的先后关系只算一次。 */
  buildStaticOrder() {
    const S = this.statics;
    S.forEach((s, i) => { s.i = i; s.after = []; });
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        const a = S[i]; const b = S[j];
        if (!overlap(a, b) && !(a.house && a.house === b.house)) continue;
        if (before(a, b)) a.after.push(j); else b.after.push(i);
      }
    }
  }

  /** 每帧：把小人插进静态物件的先后关系里，拓扑排序出 zIndex。 */
  sortScene(walkers) {
    const S = this.statics;
    const all = S.concat(walkers);
    const n = all.length;
    const indeg = new Int32Array(n);
    const extra = walkers.map(() => []);
    const after = (k) => (k < S.length ? S[k].after : extra[k - S.length]);
    const addEdge = (a, b) => { after(a).push(b); }; // 临时边只挂在小人身上
    const tempIn = []; // 静态物件指向小人的临时边
    walkers.forEach((w, wi) => {
      const k = S.length + wi;
      w.occluders = [];
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        if (!overlap(w, s) && !(s.house && inside(w, s.house))) continue;
        if (before(s, w)) tempIn.push([i, k]); else { addEdge(k, i); w.occluders.push(s); }
      }
      for (let j = wi + 1; j < walkers.length; j++) {
        const v = walkers[j];
        if (!overlap(w, v)) continue;
        if (before(w, v)) addEdge(k, S.length + j); else addEdge(S.length + j, k);
      }
    });
    for (let i = 0; i < n; i++) for (const j of after(i)) indeg[j]++;
    for (const [, k] of tempIn) indeg[k]++;
    const tempOut = new Map();
    for (const [i, k] of tempIn) { if (!tempOut.has(i)) tempOut.set(i, []); tempOut.get(i).push(k); }
    const done = new Uint8Array(n);
    const ready = [];
    for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
    let z = 0;
    for (let count = 0; count < n; count++) {
      let pick = -1;
      if (ready.length) {
        let bi = 0;
        for (let r = 1; r < ready.length; r++) if (all[ready[r]].cx + all[ready[r]].cy < all[ready[bi]].cx + all[ready[bi]].cy) bi = r;
        pick = ready[bi]; ready.splice(bi, 1);
      } else { // 有环（不该发生）：挑最靠后的那个硬排
        for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || all[i].cx + all[i].cy < all[pick].cx + all[pick].cy)) pick = i;
      }
      done[pick] = 1;
      all[pick].node.zIndex = z++;
      const outs = after(pick).concat(tempOut.get(pick) ?? []);
      for (const j of outs) if (!done[j] && --indeg[j] === 0) ready.push(j);
    }
  }

  // ───────────── 镜头 ─────────────

  baseZoom() { return Math.max(0.42, Math.min(1, this.app.screen.height / 760)); }
  get zoom() { return this.baseZoom() * this.zoomMul; }

  zoomBy(f) { this.zoomMul = Math.max(0.6, Math.min(1.4, this.zoomMul * f)); }
  panBy(dx, dy) {
    if (!this.cam) return;
    this.free = true;
    this.unwatch();
    this.cam.x -= dx / this.zoom; this.cam.y -= dy / this.zoom;
  }
  follow() { this.free = false; this.unwatch(); }
  /** 镜头跟着另一个人（左下角点头像）。拖动地图或自己走路时回到自己身上。 */
  watch(id) { this.watchId = id; this.free = false; this.onWatch?.(id); }
  unwatch() { if (this.watchId) { this.watchId = null; this.onWatch?.(null); } }

  clampCam() {
    const z = this.zoom; const hw = this.app.screen.width / 2 / z; const hh = this.app.screen.height / 2 / z;
    const { w: MW, h: MH } = this.town;
    const [minX, maxX, minY, maxY] = [-MH - 60, MW + 60, -260, (MW + MH) / 2 + 40];
    this.cam.x = maxX - minX < hw * 2 ? (minX + maxX) / 2 : Math.max(minX + hw, Math.min(maxX - hw, this.cam.x));
    this.cam.y = maxY - minY < hh * 2 ? (minY + maxY) / 2 : Math.max(minY + hh, Math.min(maxY - hh, this.cam.y));
  }

  layout() {
    if (!this.cam) return;
    const z = this.zoom;
    this.world.scale.set(z);
    this.world.position.set(this.app.screen.width / 2 - this.cam.x * z, this.app.screen.height / 2 - this.cam.y * z);
  }

  toScreen(x, y, z = 0) {
    const p = iso(x, y, z);
    return { x: (p.x - this.cam.x) * this.zoom + this.app.screen.width / 2, y: (p.y - this.cam.y) * this.zoom + this.app.screen.height / 2 };
  }

  /** 点了屏幕上的 (px, py)：点到房子就进房子，点到别的建筑就走到它门前，否则走到地面上那一点。 */
  pick(px, py) {
    if (!this.cam) return null;
    const wx = (px - this.app.screen.width / 2) / this.zoom + this.cam.x;
    const wy = (py - this.app.screen.height / 2) / this.zoom + this.cam.y;
    const hit = (b, top) => inPoly(hexOf(b.x, b.y, b.w, b.h, top), wx, wy);
    const g = unIso(wx, wy);
    const list = [...this.houses.values()].map((e) => e.hs);
    // 1. 地面上那一点在某间房子里：直接走过去（进屋）
    if (list.some((h) => g.x > h.x && g.x < h.x + h.w && g.y > h.y && g.y < h.y + h.h)) return g;
    // 2. 点在房子的画上（屋顶、墙）：进这间房子。手绘的按像素判定（点到房子旁边的空地不算）；
    //    墓园这种平铺在地上的露天场地没有"墙"，点它的地面已经在第 1 步里走进去了，这里跳过（不然它四周一大片空地都点不到）
    for (const e of this.houses.values()) {
      if (e.single) continue;
      const on = e.hitTest ? e.hitTest(wx, wy) : inPoly(e.painted ? e.front.poly : hexOf(e.hs.x, e.hs.y, e.hs.w, e.hs.h, e.labelZ), wx, wy);
      if (on) return { x: e.hs.x + e.hs.w / 2, y: e.hs.y + e.hs.h / 2 };
    }
    // 3. 地面能站人：就走到那一点
    if (!this.town.blockedAt(list, g.x, g.y)) return g;
    // 4. 点在不能进的建筑上：走到它门前
    for (const o of this.town.obstacles) if (hit(o, o.height + Math.min(o.w, o.h) * 0.38)) return { x: o.x + o.w / 2, y: o.y + o.h + 24 };
    return g;
  }

  // ───────────── 每帧 ─────────────

  frame() {
    if (DEBUG) window.__botcWorld = this; // 调试用：指向正在画的那张地图（页面上可能同时有好几张）
    const d = this.data;
    if (!d?.roam) return;
    const r = d.roam;
    const dt = Math.min(0.1, this.app.ticker.deltaMS / 1000);
    const t = performance.now() / 1000;
    const now = serverNow();
    const knocking = new Set(r.houses.flatMap((h) => h.knocks));

    // 小人
    const seen = new Set();
    const list = [];
    const spots = {};
    const sounds = [];
    const movers = []; // 这一帧在走动的人（开门用）
    const liveIds = [];  // 这一帧要实时画的 3D 小人
    let mine = null;
    // 别人在一间我不在的房子里就看不见他；墓园这种露天的（只有一张图）照样看得见
    const hiddenIn = new Set(r.houses.filter((h) => h.id !== r.myHouse && !this.houses.get(h.id)?.single).flatMap((h) => h.members));
    for (const p of d.players) {
      const m = r.pos[p.id];
      if (!m) continue;
      seen.add(p.id);
      let w = this.walkers.get(p.id);
      if (!w) { w = makePerson(p.id); this.walkers.set(p.id, w); this.sorted.addChild(w.root); }
      const mode = avatarMode();
      // 实时渲染 AI 模型（按大厅里挑的形象）。没挑形象（或挑的还没有模型）的都是镇民，衣服按座位染色分开；挑了的保留人物自己的配色（认得出是谁）
      if (mode === 'live') dressLive(w, p.id, p.char, this, MODEL_CHARS.has(p.char) ? null : CLOTH[d.players.indexOf(p) % CLOTH.length]);
      else if (mode === 'baked' || (mode === 'proc' && p.outfit)) dressPerson(w, p.outfit || {}, p.char, this); // 预渲染的图集
      const is3d = !!(w.anims || w.live);
      // 3D 小人停下来要多减速一小会儿，「在走」也多算这一会儿
      const walking = is3d ? moving3d(m, now) : m.dur && now < m.start + m.dur;
      // 3D 小人：新的一段移动开始时记下是不是从站着起步（上一段早就走完了），决定要不要播起步
      if (is3d && walking && w.moveStart !== m.start) { w.fromRest = !(w.moveEnd > m.start - 150); w.moveStart = m.start; }
      if (walking) w.moveEnd = m.start + m.dur;
      const mv = is3d && walking ? easedAt(m, now) : null;
      const at = mv ? mv.at : positionAt(m, now);
      // 朝向：按屏幕上的左右
      const prev = w.last;
      if (prev && walking) {
        const dx = (at.x - at.y) - (prev.x - prev.y); if (Math.abs(dx) > 0.2) w.facing = dx < 0 ? -1 : 1;
      }
      if (w.live && mv) { // 实时渲染：朝向是连续的角度（地图上的方向），LiveChar 自己慢慢转过去
        const mx = mv.ahead.x - at.x; const my = mv.ahead.y - at.y;
        if (Math.hypot(mx, my) > 0.5) w.angle = Math.atan2(my, mx);
      }
      if (w.anims) {
        // 3D 小人：按路线前方一点的方向选 8 个朝向里最近的，一格一格转过去
        if (mv) {
          const mx = mv.ahead.x - at.x; const my = mv.ahead.y - at.y;
          if (Math.hypot(mx, my) > 0.5) w.dirGoal = ((Math.round(Math.atan2(my, mx) / (Math.PI / 4)) % DIRS) + DIRS) % DIRS;
        }
        const goal = w.dirGoal ?? w.dir;
        if (goal !== w.dir && t - (w.turnAt ?? 0) >= TURN_T) {
          const diff = (goal - w.dir + DIRS) % DIRS;
          w.dir = (w.dir + (diff <= DIRS / 2 ? 1 : -1) + DIRS) % DIRS;
          w.turnAt = t;
        }
      }
      w.last = at;
      const [sx, sy] = P(at.x, at.y);
      w.root.position.set(sx, sy);
      w.root.visible = !hiddenIn.has(p.id);
      w.body.scale.x = PERSON * w.facing;
      const phase = Math.sin((t / STEP) * Math.PI * 2);
      const swing = walking ? phase * 0.28 : 0;
      w.legL.rotation = swing; w.legR.rotation = -swing; w.arm.rotation = swing;
      w.body.y = walking ? -Math.abs(phase) * 1.5 : 0;
      const knock = knocking.has(p.id) && !walking;
      w.body.x = knock ? Math.sin(t * 20) * 0.9 : 0;
      let steps = null;
      if (w.anims) {
        const fr = pickFrame(w, mv, m.run, t, dt);
        w.sprite.texture = fr.anim.tex[w.dir][fr.i];
        w.sprite.x = w.body.x;
        steps = fr.steps;
      } else if (w.live && this.live) {
        steps = this.live.drive(p.id, dt, { mv, run: m.run, fromRest: w.fromRest, upm: w.upm, angle: w.angle ?? null });
        w.sprite.x = w.body.x;
        // 画面外、藏在别人屋里的不画（省显卡）
        if (w.root.visible && !p.vanish) {
          const sp = this.toScreen(at.x, at.y);
          if (sp.x > -120 && sp.x < this.app.screen.width + 120 && sp.y > -60 && sp.y < this.app.screen.height + 260) liveIds.push(p.id);
        }
      }
      // 脚步：跟着迈腿的节奏，每半个周期一步（鬼魂没有脚步声）；3D 小人按动作里实际落脚
      if (is3d) {
        if (walking && p.alive && steps != null) {
          if (w.stepIdx != null && steps !== w.stepIdx) sounds.push({ kind: 'step', at, me: p.id === d.me });
          w.stepIdx = steps;
        } else w.stepIdx = null;
      } else if (walking && p.alive) {
        w.offset ??= Math.random();
        const idx = Math.floor(((t + w.offset) * 2) / STEP);
        if (w.stepIdx != null && idx !== w.stepIdx) sounds.push({ kind: 'step', at, me: p.id === d.me });
        w.stepIdx = idx;
      } else w.stepIdx = null;
      if (knock && !w.knocking) sounds.push({ kind: 'knock', at, me: p.id === d.me });
      w.knocking = knock;
      // 恶魔变身：放大、染成暗红（只在恶魔自己的破门动画里出现）；钻进门里就看不见了
      if (!!p.monster !== !!w.monster) {
        w.monster = !!p.monster;
        const red = new ColorMatrixFilter(); red.matrix = [0.9, 0.3, 0, 0, 0.12, 0.05, 0.1, 0, 0, 0, 0.05, 0, 0.1, 0, 0, 0, 0, 0, 1, 0];
        w.root.filters = w.monster ? [red] : null;
        w.root.scale.set(w.monster ? 1.45 : 1);
      }
      if (p.vanish) w.root.visible = false;
      if (!p.monster && !p.alive !== !!w.ghost) {
        w.ghost = !p.alive;
        const gray = new ColorMatrixFilter(); gray.desaturate();
        w.root.filters = w.ghost ? [gray] : null;
        w.root.alpha = w.ghost ? 0.5 : 1;
      }
      const item = { node: w.root, box: { x0: at.x - 3, y0: at.y - 3, x1: at.x + 3, y1: at.y + 3 }, cx: at.x, cy: at.y, l: sx - 13, r: sx + 13, t: sy - Math.max(46, w.headPx ?? 0), b: sy + 4 };
      list.push(item);
      if (p.id === d.me) { mine = { item, at, walking, m }; }
      if (walking) movers.push(at);
      spots[p.id] = { x: at.x, y: at.y, knock, hidden: hiddenIn.has(p.id), head: w.headPx ? w.headPx * (w.monster ? 1.45 : 1) : 0 };
    }
    for (const [id, w] of this.walkers) if (!seen.has(id)) { if (w.live) this.live?.remove(id); w.root.destroy({ children: true }); this.walkers.delete(id); }
    // 实时 3D 小人：画面里的每个人画一遍，再让 Pixi 重新上传那张画布
    if (this.live) {
      const t1 = performance.now();
      this.live.render(liveIds);
      this.liveSource.update();
      this.perfLive = performance.now() - t1;
    }
    const G = this.town.gather;
    this.playSounds(sounds, mine?.at ?? { x: G.x, y: G.y }, r.houses);
    // 水边的声音：离海 / 溪越近越响（码头、桥上最响）
    const ear = mine?.at ?? G;
    setLake(Math.max(0, Math.min(1, 1 - this.town.waterDist(ear.x, ear.y) / 260)));
    // 走进另一个分区：换地名、风声和环境声
    const zone = this.town.zoneAt?.(ear.x, ear.y) ?? null;
    if (zone !== this.zone) {
      this.zone = zone;
      setWind(zone?.wind ?? 1); setZoneNow(zone?.id ?? null);
      this.onZone?.(zone);
    }
    this.sortScene(list);

    // 房子：有人在里面（或者我在里面）就剖开；挡住我的建筑半透明
    // 挡住我的建筑：按实际轮廓判断，只算能进的房子（摆设太小、这局没开放的房子当普通建筑，都不让开）
    const body = mine && [mine.item.l + 12, mine.item.b - 22];
    const fade = new Set((mine?.item.occluders ?? []).filter((o) => o.poly && !o.idle && inPoly(o.poly, ...body)));
    for (const h of r.houses) {
      const e = this.houses.get(h.id);
      if (!e) continue;
      // 只有自己在屋里才剖开、看得到室内；别人在里面时外观照常关着（看不见里面的人）
      const open = r.myHouse === h.id || (!!mine && !h.locked && !e.single && houseAt(r.houses, mine.at.x, mine.at.y)?.id === h.id);
      const target = open ? (e.painted ? 0 : 0.1) : fade.has(e.front) ? 0.45 : 1;
      e.shell.alpha += (target - e.shell.alpha) * Math.min(1, dt * 7);
      // 手绘的室内图比外观轮廓大一圈，不进屋就整张藏起来，免得地板、后墙从边上露出来
      if (e.painted && !e.single) {
        const node = e.back.node;
        // 进屋：室内立刻铺满，外观再淡出（不然中间会露出底下的地面）；出屋：外观盖回来以后室内再收起
        if (open) node.alpha = 1;
        else if (e.shell.alpha > 0.9) node.alpha += (0 - node.alpha) * Math.min(1, dt * 12);
        node.visible = node.alpha > 0.01;
      }
      e.doorOpen.visible = !h.locked; e.doorLocked.visible = h.locked;
      // 有人在门口走过：门推开，人过去了再慢慢合上（锁着的门不开）
      if (e.swing) {
        const dv = e.hs.door; const dx = dv.vx ?? dv.x; const dy = dv.vy ?? dv.y;
        const near = !h.locked && movers.some((q) => Math.hypot(q.x - dx, q.y - dy) < 34);
        const k = e.doorK + ((near ? 1 : 0) - e.doorK) * Math.min(1, dt * (near ? 9 : 3));
        if (Math.abs(k - e.doorK) > 0.004 || (k < 0.02) !== (e.doorK < 0.02)) doorSwing(e.swing, e.hs, k);
        e.doorK = k;
        e.swing.alpha = e.shell.alpha;
      }
    }
    for (const s of this.statics) {
      if (s.house) continue;
      const target = fade.has(s) ? 0.45 : 1;
      s.node.alpha += (target - s.node.alpha) * Math.min(1, dt * 7);
    }

    // 镜头：跟着自己走
    if (mine?.walking && mine.m.start !== this.lastMove) { this.lastMove = mine.m.start; this.free = false; this.unwatch(); }
    const watched = this.watchId && spots[this.watchId];
    const focus = watched ? iso(watched.x, watched.y, 24) : mine ? iso(mine.at.x, mine.at.y, 24) : iso(G.x, G.y, 40);
    if (!this.cam) this.cam = { ...focus };
    if (!this.free) { this.cam.x += (focus.x - this.cam.x) * Math.min(1, dt * 4); this.cam.y += (focus.y - this.cam.y) * Math.min(1, dt * 4); }
    this.clampCam();
    this.layout();
    this.snowFrame(dt, t);
    this.fogFrame(dt, t);
    this.fireworksFrame(dt);
    this.lanternFrame(t);

    // 给 HTML 层的屏幕坐标
    const screen = { walkers: {}, houses: {}, zoom: this.zoom, project: (x, y, z) => this.toScreen(x, y, z) };
    for (const [id, p] of Object.entries(spots)) screen.walkers[id] = { ...this.toScreen(p.x, p.y), knock: p.knock, hidden: p.hidden, head: p.head ? Math.round(p.head * this.zoom) : 0, map: p };
    for (const { hs, labelZ } of this.houses.values()) screen.houses[hs.id] = this.toScreen(hs.x + hs.w / 2, hs.y + hs.h / 2, labelZ);
    this.onFrame?.(screen);
    if (this.perfEl && t - (this.perfAt ?? 0) > 0.5) {
      this.perfAt = t;
      this.perfEl.textContent = `${Math.round(this.app.ticker.FPS)} fps · 小人实时 ${(this.perfLive ?? 0).toFixed(1)}ms · ${this.live ? '实时' : '预渲染'}`;
    }
  }

  /** 脚下是什么地面。 */
  surfaceAt(houses, x, y) {
    const h = houseAt(houses, x, y);
    if (h) return h.floor ?? 'wood';
    const town = this.town;
    const bridge = town.walkwayAt(x, y, 6);
    if (bridge) return bridge.kind === 'stone' ? 'stone' : 'pier';
    if (town.circles.some((c) => c.kind === 'tower' && Math.hypot(x - c.x, y - c.y) < c.r + 42)) return 'stone';
    if (!this.ground) { // 没有 Tiled 地面：按路算
      const road = town.roads.find((rd) => distToLine(rd.pts, x, y) < rd.half);
      const zone = town.zoneAt?.(x, y);
      if (road) return zone?.roadSurface ?? (road.kind === 'trail' ? 'gravel' : 'cobble');
      if (Math.hypot(x - town.gather.x, y - town.gather.y) < town.gather.r) return 'cobble';
      return zone?.surface ?? town.ground ?? 'snow';
    }
    const c = Math.floor(x / TILE); const r = Math.floor(y / TILE);
    const id = (this.ground?.data[r * this.map.width + c] ?? 1) - 1;
    return COBBLE.includes(id) || (id < 16 && bits(id) >= 2) ? 'cobble' : 'snow';
  }

  /** 这一帧的脚步声、敲门声：自己的最响，别人的按距离衰减、按左右声像。 */
  playSounds(sounds, ear, houses) {
    for (const s of sounds) {
      const dist = Math.hypot(s.at.x - ear.x, s.at.y - ear.y);
      const vol = s.me ? 0.09 : 0.05 * Math.max(0, 1 - dist / 380);
      const pan = ((s.at.x - s.at.y) - (ear.x - ear.y)) / 420;
      if (s.kind === 'knock') knock(s.me ? 0.3 : vol * 5, pan);
      else footstep(this.surfaceAt(houses, s.at.x, s.at.y), vol, pan);
    }
  }

  destroy() {
    this.destroyed = true;
    this.offDisplay?.();
    this.perfEl?.remove();
    this.live?.dispose(); // 每天换地图都会建一个新的：旧的显卡上下文要释放，不然攒多了浏览器会丢掉最早的
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
