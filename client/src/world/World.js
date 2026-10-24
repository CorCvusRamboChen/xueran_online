// 白天的小镇：PixiJS 画布，斜视角（类 3D，参考极乐迪斯科）。
// 逻辑坐标是俯视平面（和服务器一样），画的时候投影成 2:1 斜视角：屏幕 x = x − y，屏幕 y = (x + y)/2 − 高度。
// · 地面层：Tiled 地图拼成的俯视大图，整层套一个斜切矩阵，直接"压扁"成斜视角；房子地板、海、广场台阶也在这层。
// · 立体层：建筑（程序画的体块，以后换成手绘大图切出来的前景块）、摆设、小人，每帧按前后关系排序互相遮挡。
// · 房子拆成"后墙"和"前墙+屋顶"两块：人在屋里时夹在中间；有人在里面时前墙和屋顶淡掉，露出剖开的室内。
// 头像、名字、地名是 HTML，由 TownMap 按 onFrame 给的屏幕坐标摆放。
import 'pixi.js/unsafe-eval'; // Discord 的内容安全策略不允许 eval，Pixi 需要这个补丁
import { Application, Container, Sprite, Graphics, Texture, ImageSource, Matrix, Rectangle, ColorMatrixFilter } from 'pixi.js';
import { MAP_W, MAP_H, PLAZA, TOWER, WATER_Y, PIER, OBSTACLES, positionAt, houseAt, blockedAt, allHouses } from '../../../src/shared/map.js';
import { TILE, TILE_PX, TILESET_COLS, COBBLE } from '../../../src/shared/tiles.js';
import { footstep, knock } from './footsteps.js';
import { setLake } from '../ambience.js';
import { loadTileset } from './tileset.js';
import { PROPS, RASTER_SCALE, raster, houseFloor } from './sprites.jsx';
import { serverNow, hue } from '../util.jsx';
// 3D 小人（avatar3d.js）先不用：地图上还是 2D 小人。要打开就把 USE_3D 改成 true
const USE_3D = false;
const DIRS = 8; const WALK_FRAMES = 8; const FRAME_W = 96; const FRAME_H = 128;

const INK = 0x1d2524;
// Codex 画的斜视角小镇大图（和 ?preview=town 导出的底稿对齐；尺寸不同会拉伸到底稿大小）。有它就不画程序占位的地面和建筑。
export const PAINTED_BASE = Object.values(import.meta.glob('../assets/world/town-base.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' }))[0];
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
const PAINTED_HOUSES = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/world/house-*.{webp,png}', { eager: true, query: '?url', import: 'default' }))
    .map(([p, url]) => [p.split('/').pop().replace(/\.(webp|png)$/, ''), url]),
);

/** 一间房子的底稿/手绘图覆盖的世界像素范围：四周留 70，上方多留 180（给尖塔、外伸的结构留地方）。 */
export function houseCrop(hs) {
  const top = (hs.height || 20) + Math.min(hs.w, hs.h) * 0.38 + 40;
  const b = screenBounds(hexOf(hs.x - 70, hs.y - 70, hs.w + 140, hs.h + 140, top + 180));
  return { x: Math.floor(b.l), y: Math.floor(b.t), w: Math.ceil(b.r - b.l), h: Math.ceil(b.b - b.t) };
}

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

/** 从大图里按轮廓切出一块（建筑前景），返回精灵和它的屏幕范围。 */
function cutout(base, poly) {
  const b = screenBounds(poly);
  const [l, t] = [Math.floor(b.l), Math.floor(b.t)];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.r) - l; canvas.height = Math.ceil(b.b) - t;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - l, y - t) : ctx.moveTo(x - l, y - t)));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(base, GUIDE.x - l, GUIDE.y - t, GUIDE.w, GUIDE.h);
  const s = new Sprite(Texture.from(canvas, true));
  s.position.set(l, t);
  return s;
}
const STEP = 0.34;          // 走一步多少秒
const GROUND_PX = 1.6;      // 地面贴图每个逻辑单位几个像素
const PERSON = 0.72;        // 小人缩放（画框 40×52）
const SPRITE3D = 0.56;      // 3D 小人贴图的缩放（烘焙时 128px 高 → 地图上约 45px）
// 每间房子的地板材质（脚步声用）
const FLOOR = { tavern: 'wood', church: 'stone', smithy: 'stone', bakery: 'tile', library: 'carpet', graveyard: 'gravel' };
const bits = (n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1);

/** 斜视角投影：逻辑 (x, y, 高度 z) → 世界像素。 */
export const iso = (x, y, z = 0) => ({ x: x - y, y: (x + y) / 2 - z });
const P = (x, y, z = 0) => [x - y, (x + y) / 2 - z];
/** 底稿（交给 Codex 重绘的整张小镇）覆盖的世界像素范围。手绘大图要和它一样大、一一对齐。 */
export const GUIDE = { x: -1440, y: -120, w: 3280, h: 1760 };
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
async function paintGround(map, ox, oy, w, h) {
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

// ───────────── 建筑（程序画的体块，占位） ─────────────

const WIN_LIT = 0xf0c66a;
const WIN_DARK = 0x2d3a3a;

/** 前面两堵墙（东墙 +x、南墙 +y）+ 窗。 */
function frontWalls(g, b, seed) {
  const { x, y, w, h, height: H } = b;
  const x1 = x + w; const y1 = y + h;
  const wall = hex(b.wall);
  face(g, [[x1, y, 0], [x1, y1, 0], [x1, y1, H], [x1, y, H]], shade(wall, -0.22));
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, H], [x, y1, H]], wall);
  const floors = H > 58 ? 2 : 1;
  for (let f = 0; f < floors; f++) {
    const z0 = H * (floors === 2 ? [0.14, 0.56][f] : 0.3); const z1 = z0 + H * (floors === 2 ? 0.26 : 0.34);
    const nS = Math.max(1, Math.floor(w / 42)); const nE = Math.max(1, Math.floor(h / 42));
    for (let i = 0; i < nS; i++) {
      if (b.door?.side === 'bottom' && Math.abs(x + ((i + 0.5) / nS) * w - b.door.x) < 26 && f === 0) continue;
      const lit = hash(seed + i, f) > 0.55;
      onWall(g, [x, y1], [x1, y1], (i + 0.3) / nS, (i + 0.7) / nS, z0, z1, lit ? WIN_LIT : WIN_DARK);
    }
    for (let i = 0; i < nE; i++) {
      if (b.door?.side === 'right' && Math.abs(y + ((i + 0.5) / nE) * h - b.door.y) < 26 && f === 0) continue;
      const lit = hash(seed + i, f + 7) > 0.6;
      onWall(g, [x1, y], [x1, y1], (i + 0.3) / nE, (i + 0.7) / nE, z0, z1, lit ? shade(WIN_LIT, -0.12) : shade(WIN_DARK, -0.2));
    }
  }
  // 墙根一道深色
  face(g, [[x, y1, 0], [x1, y1, 0], [x1, y1, 4], [x, y1, 4]], shade(wall, -0.4), { width: 0.6, color: INK });
}

/** 双坡屋顶（屋脊沿长边）+ 积雪 + 烟囱。返回屋顶最高点的高度。 */
/** 屋顶的尺寸和烟囱位置（画屋顶、算建筑轮廓共用，保证两边一致）。 */
function roofGeom(b, seed) {
  const { x, y, w, h, height: H } = b;
  const rh = Math.min(w, h) * 0.38;
  const chimney = hash(seed, 99) > 0.25
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
  if (w >= h) pts.push([x - o, (y + y1) / 2, H + rh], [x1 + o, (y + y1) / 2, H + rh]);
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
  const { x, y, w, h, height: H } = b;
  const x1 = x + w; const y1 = y + h;
  const { o, rh, chimney } = roofGeom(b, seed);
  const col = hex(b.roof); const wall = hex(b.wall);
  const snow = 0xeef0ec;
  const plane = (pts, color) => {
    face(g, pts, color);
    // 积雪：从屋脊往下盖住六成
    const [r0, r1, e1, e0] = pts;
    const mix = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    face(g, [r0, r1, mix(r1, e1, 0.62), mix(r0, e0, 0.6)], snow, { width: 0.7, color: INK });
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

/** 门（和锁）：画在门所在的那面墙上。 */
function door(g, hs, locked) {
  const { door: d } = hs;
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

/** 一块墓碑（立着的小纸片）。 */
function tomb(g) {
  g.roundRect(-6, -18, 12, 18, 5).fill(0xb7c0bd).stroke({ width: 1.1, color: INK });
  g.rect(-6, -18, 12, 4).fill(0xeef0ec);
  g.ellipse(0, 1, 9, 3).fill(0xf4f4f0);
}

/** 钟楼：方塔 + 四坡尖顶 + 两面钟。 */
function tower(g) {
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

// ───────────── 小人 ─────────────

/** 线稿小人（40×52 的画框，脚底在 (20, 49)）。 */
function makePerson(id) {
  const coat = hslToHex(hue(id), 30, 42);
  const line = { width: 1.6, color: INK, join: 'round' };
  const root = new Container();
  const body = new Container();
  body.pivot.set(20, 49);
  body.scale.set(PERSON);
  root.addChild(new Graphics().ellipse(0, 0, 11 * PERSON, 3.5 * PERSON).fill({ color: 0x000000, alpha: 0.22 }), body);
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
  return { root, body, legL, legR, arm, facing: 1, sprite, sheet: null, outfitKey: null, dir: 1, offset: Math.random() };
}

/** 给小人换上（或换掉）3D 搭配：烘焙图集 → 切成 [朝向][帧] 的贴图。 */
function dressPerson(w, outfit) {
  if (!USE_3D) return;
  const key = JSON.stringify(outfit);
  if (w.outfitKey === key) return;
  w.outfitKey = key;
  import('./avatar3d.js').then((m) => m.bakeSheet(outfit)).then((sheet) => {
    if (!sheet || w.outfitKey !== key || w.root.destroyed) return;
    const source = Texture.from(sheet.canvas).source;
    w.sheet = Array.from({ length: DIRS }, (_, d) => Array.from({ length: 1 + WALK_FRAMES }, (__, f) =>
      new Texture({ source, frame: new Rectangle(f * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H) })));
    w.sprite.anchor.set(sheet.anchor.x, sheet.anchor.y);
    w.sprite.visible = true;
    w.body.visible = false;
  }).catch(() => {});
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
   * 在 el 里建一块画布。map 是 Tiled 地图（town-4 / town-6），houses 是这局的房子。
   * guide: 画底稿，不画摆设和小人。true / 'base'：能进的房子只画地基（交给 Codex 画整张大图）；
   *   'closed' / 'open'：在手绘大图上画出房子的外观 / 剖开的室内（交给 Codex 单独画房子）。
   */
  static async create(el, map, houses, { guide = false } = {}) {
    const w = new World();
    w.guide = guide;
    await w.init(el, map, houses);
    return w;
  }

  data = null;       // TownMap 每次渲染塞进来：{ players, roam, me }
  onFrame = null;    // 每帧回调：屏幕坐标，TownMap 用它摆 HTML
  walkers = new Map();
  houses = new Map();
  statics = [];      // 不会动的立体物件（建筑、摆设）
  cam = null;
  zoomMul = 1;
  free = false;      // 玩家拖动了镜头，暂时不跟随
  destroyed = false;

  async init(el, map, houses) {
    const app = new Application();
    await app.init({
      resizeTo: el, background: 0x1a1d1d, antialias: false, preference: 'webgl', powerPreference: 'high-performance', // 手绘图不需要多重采样抗锯齿（高分辨率下很费）；笔记本上请求独立显卡
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
    });
    this.app = app;
    this.map = map;
    if (location.search.includes('debug')) window.__botcWorld = this; // 调试用
    this.ground = map.layers.find((l) => l.type === 'tilelayer');
    app.canvas.className = 'map-canvas';
    el.prepend(app.canvas);

    this.world = new Container();
    this.plane = new Container();   // 地面层（俯视坐标，套斜切矩阵）
    this.plane.setFromMatrix(new Matrix(1, 0.5, -1, 0.5, 0, 0));
    this.sorted = new Container();
    this.sorted.sortableChildren = true;
    this.world.addChild(this.plane, this.sorted);
    app.stage.addChild(this.world);

    const houseGuide = this.guide === 'closed' || this.guide === 'open';
    const base = (!this.guide || houseGuide) && PAINTED_BASE ? await loadImage(PAINTED_BASE).catch(() => null) : null;
    if (base) {
      const gl = app.renderer.gl;
      const max = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
      this.world.addChildAt(tiledSprites(base, GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h, max), 0);
    }

    // 地面：分四块画，避免单张贴图太大（有手绘大图就不画）
    const chunks = [];
    if (!base) for (const oy of [0, MAP_H / 2]) for (const ox of [0, MAP_W / 2]) chunks.push([ox, oy]);
    const grounds = await Promise.all(chunks.map(([ox, oy]) => paintGround(map, ox, oy, MAP_W / 2, MAP_H / 2)));
    grounds.forEach((c, i) => {
      const s = new Sprite(Texture.from(c, true));
      s.position.set(chunks[i][0], chunks[i][1]);
      s.scale.set(1 / GROUND_PX);
      this.plane.addChild(s);
    });

    // 建筑的影子（画在地面层，跟着斜切）
    const shadows = new Graphics();
    for (const b of [...(base ? [] : OBSTACLES), ...(this.guide ? [] : houses.filter((h) => h.height))]) shadows.poly([b.x + b.w, b.y + 10, b.x + b.w + 26, b.y + 22, b.x + b.w + 26, b.y + b.h + 22, b.x + 14, b.y + b.h + 22, b.x, b.y + b.h]).fill({ color: 0x000000, alpha: 0.14 });
    this.plane.addChild(shadows);

    // 不能进的建筑
    OBSTACLES.forEach((o, i) => {
      const b = { ...o, wall: ['#9aa6a2', '#a49a86', '#8f9a8c', '#b0a58f', '#8d9496'][i % 5], roof: ['#3f5a5c', '#4a4440', '#5a3a30', '#46524a'][i % 4] };
      const box = { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
      if (base) { // 手绘：从大图里切出这栋楼
        const poly = silhouette(b, i * 13);
        this.addStatic(cutout(base, poly), box, screenBounds(poly), { poly });
        return;
      }
      const g = new Graphics();
      frontWalls(g, b, i * 13);
      const top = roof(g, b, i * 13);
      this.addStatic(g, box, boxBounds(o.x, o.y, o.w, o.h, top), { poly: hexOf(o.x, o.y, o.w, o.h, (o.height + top) / 2) });
    });

    // 钟楼
    const tBox = { x0: TOWER.x - TOWER.r, y0: TOWER.y - TOWER.r, x1: TOWER.x + TOWER.r, y1: TOWER.y + TOWER.r };
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
      this.addStatic(cutout(base, poly), tBox, screenBounds(poly), { poly });
    } else {
      const tg = new Graphics();
      const top = tower(tg);
      this.addStatic(tg, tBox, boxBounds(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, top), { poly: hexOf(TOWER.x - TOWER.r, TOWER.y - TOWER.r, TOWER.r * 2, TOWER.r * 2, 190) });
    }

    // 摆设（Tiled 里的 props 层）
    // 有手绘大图时不再叠程序画的摆设（树、长椅、路灯……），和手绘风格不搭
    const props = this.guide || base ? [] : map.layers.find((l) => l.name === 'props')?.objects ?? [];
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
      const bg = new Graphics().rect(GUIDE.x, GUIDE.y, GUIDE.w, GUIDE.h).fill(0x1a1d1d);
      this.world.addChildAt(bg, 0);
      this.fitGuide();
      app.renderer.on('resize', () => this.fitGuide());
      return;
    }
    await this.buildHouses(houses);
    await this.buildIdleHouses(houses);
    this.buildStaticOrder();

    this.buildSnow();
    app.renderer.on('resize', () => this.layout());
    app.ticker.add(() => this.frame());
  }

  /**
   * 暴风雪：一层细密的雪片顺着风往右下猛刮（不要前景的大雪片）。镜头移动时雪按比例错开（视差），
   * 有一点纵深感。画在屏幕坐标里，盖在整个小镇上面。
   */
  buildSnow() {
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
    this.snowLayers = [layer(far, 260, [0.3, 0.7], [0.12, 0.34], 0.3, 0.6)];
    // 雪片顺着 45° 的风向拉长一点（和等距视角的斜线一致），像被吹着跑
    for (const f of this.snowLayers[0].items) { f.sp.scale.y *= 1.9; f.sp.rotation = -Math.PI / 4; }
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
        f.x += (f.v * (H / W) * dt) - (dx * L.parallax) / W; // 暴风雪：正 45° 往右下刮（横竖走同样的像素）
        f.x -= Math.floor(f.x); f.y -= Math.floor(f.y);
        f.sp.position.set(f.x * W + Math.sin(t * 2.2 + f.sway) * 4, f.y * H);
      }
    }
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
    const k = Math.min(this.app.screen.width / GUIDE.w, this.app.screen.height / GUIDE.h);
    this.world.scale.set(k);
    this.world.position.set((this.app.screen.width - GUIDE.w * k) / 2 - GUIDE.x * k, (this.app.screen.height - GUIDE.h * k) / 2 - GUIDE.y * k);
  }

  /** 把底稿按 1 世界像素 = 1 像素导出成 canvas（默认整张 GUIDE，也可以给一个范围）。 */
  exportGuide(rect = GUIDE) {
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
      if (hs.id === 'graveyard') {
        fence(back, hs, ['n', 'w']);
        door(doorOpen, hs, false); door(doorLocked, hs, true);
        back.addChild(doorOpen, doorLocked);
        fence(shell, hs, ['s', 'e']);
      } else {
        backWalls(back, hs);
        frontWalls(shell, { ...hs, door: { ...hs.door, side: hs.side } }, hs.x);
        top = roof(shell, hs, hs.x);
        door(doorOpen, hs, false); door(doorLocked, hs, true);
      }
      front.addChild(shell);
      if (hs.id !== 'graveyard') front.addChild(doorOpen, doorLocked);
      const bounds = boxBounds(hs.x, hs.y, hs.w, hs.h, top);
      const entry = { hs, shell, doorOpen, doorLocked, labelZ: top + 14 };
      entry.back = this.addStatic(back, box, bounds, { house: hs, kind: 'back' });
      entry.front = this.addStatic(front, box, bounds, { house: hs, kind: 'front', poly: hexOf(hs.x, hs.y, hs.w, hs.h, (hs.height + top) / 2) });
      // 墓碑
      if (hs.id === 'graveyard') {
        for (let i = 0; i < 8; i++) {
          const tx = hs.x + 36 + (i % 4) * 46 + (Math.floor(i / 4) % 2) * 18; const ty = hs.y + 50 + Math.floor(i / 4) * 70;
          const g = new Graphics(); tomb(g);
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
    const openUrl = PAINTED_HOUSES[`house-${hs.id}-open`];
    // 能进的房子用亮着灯的外观（有的话）
    const closedUrl = PAINTED_HOUSES[`house-${hs.id}-closed-lit`] ?? PAINTED_HOUSES[`house-${hs.id}-closed`];
    if (!openUrl || (!closedUrl && hs.id !== 'graveyard')) return false;
    const [openImg, closedImg] = await Promise.all([loadImage(openUrl), closedUrl ? loadImage(closedUrl) : null]).catch(() => [null, null]);
    if (!openImg) return false;
    const rect = houseCrop(hs);
    const box = { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h };
    const wallH = hs.height || 18;
    const whole = (img) => { const sp = new Sprite(paintTex(img)); sp.position.set(rect.x, rect.y); sp.width = rect.w; sp.height = rect.h; return sp; };
    const rectPoly = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]];
    const transparent = hasAlpha(openImg);
    let backPoly = hexOf(hs.x - 8, hs.y - 8, hs.w + 16, hs.h + 16, wallH + 6);
    const back = transparent ? whole(openImg) : cutoutFrom(openImg, rect, backPoly);
    if (transparent) backPoly = rectPoly;
    const front = new Container();
    let shell = new Container();
    let frontPoly = backPoly; let top = wallH;
    if (closedImg) {
      top = hs.height + Math.min(hs.w, hs.h) * 0.38 + 20;
      if (hasAlpha(closedImg)) { shell = withHalo(whole(closedImg), closedImg, rect); frontPoly = opaqueHull(closedImg, rect); top = Math.max(top, (hs.x + hs.y + (hs.w + hs.h) / 2) / 2 - frontPoly.reduce((m, p) => Math.min(m, p[1]), Infinity)); }
      else { frontPoly = silhouette(hs, hs.x); shell = cutoutFrom(closedImg, rect, frontPoly); }
    }
    const doorOpen = new Graphics(); const doorLocked = new Graphics();
    door(doorLocked, hs, true);
    front.addChild(shell, doorLocked);
    const entry = { hs, shell, doorOpen, doorLocked, labelZ: top + 14, painted: true, single: !closedImg }; // single：只有一张图（墓园），没有外观可关
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
    const idle = allHouses().filter((h) => !active.some((a) => a.id === h.id));
    await Promise.all(idle.map(async (hs) => {
      const url = PAINTED_HOUSES[`house-${hs.id}-closed`] ?? PAINTED_HOUSES[`house-${hs.id}-open`];
      if (!url) return;
      const img = await loadImage(url).catch(() => null);
      if (!img) return;
      const rect = houseCrop(hs);
      const sp = new Sprite(paintTex(img));
      sp.position.set(rect.x, rect.y); sp.width = rect.w; sp.height = rect.h;
      const poly = hasAlpha(img) ? opaqueHull(img, rect) : silhouette(hs, hs.x);
      this.addStatic(hasAlpha(img) ? withHalo(sp, img, rect) : sp, { x0: hs.x, y0: hs.y, x1: hs.x + hs.w, y1: hs.y + hs.h }, screenBounds(poly), { poly, idle: true });
    }));
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
    const [minX, maxX, minY, maxY] = [-MAP_H - 60, MAP_W + 60, -260, (MAP_W + MAP_H) / 2 + 40];
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
    // 2. 点在房子的画上（屋顶、墙）：进这间房子
    for (const e of this.houses.values()) {
      const shape = e.painted ? e.front.poly : hexOf(e.hs.x, e.hs.y, e.hs.w, e.hs.h, e.labelZ);
      if (inPoly(shape, wx, wy)) return { x: e.hs.x + e.hs.w / 2, y: e.hs.y + e.hs.h / 2 };
    }
    // 3. 地面能站人：就走到那一点
    if (!blockedAt(list, g.x, g.y)) return g;
    // 4. 点在不能进的建筑上：走到它门前
    for (const o of OBSTACLES) if (hit(o, o.height + Math.min(o.w, o.h) * 0.38)) return { x: o.x + o.w / 2, y: o.y + o.h + 24 };
    return g;
  }

  // ───────────── 每帧 ─────────────

  frame() {
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
    let mine = null;
    // 别人在一间我不在的房子里就看不见他；墓园这种露天的（只有一张图）照样看得见
    const hiddenIn = new Set(r.houses.filter((h) => h.id !== r.myHouse && !this.houses.get(h.id)?.single).flatMap((h) => h.members));
    for (const p of d.players) {
      const m = r.pos[p.id];
      if (!m) continue;
      seen.add(p.id);
      let w = this.walkers.get(p.id);
      if (!w) { w = makePerson(p.id); this.walkers.set(p.id, w); this.sorted.addChild(w.root); }
      if (USE_3D && p.outfit) dressPerson(w, p.outfit);
      const at = positionAt(r.houses, m, now);
      const walking = m.dur && now < m.start + m.dur;
      // 朝向：按屏幕上的左右
      const prev = w.last;
      if (prev && walking) {
        const dx = (at.x - at.y) - (prev.x - prev.y); if (Math.abs(dx) > 0.2) w.facing = dx < 0 ? -1 : 1;
        // 3D 小人：按地图上的移动方向选 8 个朝向里最近的
        const mx = at.x - prev.x; const my = at.y - prev.y;
        if (Math.hypot(mx, my) > 0.15) w.dir = ((Math.round(Math.atan2(my, mx) / (Math.PI / 4)) % DIRS) + DIRS) % DIRS;
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
      if (w.sheet) {
        const f = walking ? 1 + (Math.floor((((t + w.offset * STEP) / STEP) % 1) * WALK_FRAMES) % WALK_FRAMES) : 0;
        w.sprite.texture = w.sheet[w.dir][f];
        w.sprite.x = w.body.x;
      }
      // 脚步：跟着迈腿的节奏，每半个周期一步（鬼魂没有脚步声）
      if (walking && p.alive) {
        w.offset ??= Math.random();
        const idx = Math.floor(((t + w.offset) * 2) / STEP);
        if (w.stepIdx != null && idx !== w.stepIdx) sounds.push({ kind: 'step', at, me: p.id === d.me });
        w.stepIdx = idx;
      } else w.stepIdx = null;
      if (knock && !w.knocking) sounds.push({ kind: 'knock', at, me: p.id === d.me });
      w.knocking = knock;
      if (!p.alive !== !!w.ghost) {
        w.ghost = !p.alive;
        const gray = new ColorMatrixFilter(); gray.desaturate();
        w.root.filters = w.ghost ? [gray] : null;
        w.root.alpha = w.ghost ? 0.5 : 1;
      }
      const item = { node: w.root, box: { x0: at.x - 3, y0: at.y - 3, x1: at.x + 3, y1: at.y + 3 }, cx: at.x, cy: at.y, l: sx - 12, r: sx + 12, t: sy - 42, b: sy + 4 };
      list.push(item);
      if (p.id === d.me) { mine = { item, at, walking, m }; }
      spots[p.id] = { x: at.x, y: at.y, knock, hidden: hiddenIn.has(p.id) };
    }
    for (const [id, w] of this.walkers) if (!seen.has(id)) { w.root.destroy({ children: true }); this.walkers.delete(id); }
    this.playSounds(sounds, mine?.at ?? { x: PLAZA.x, y: PLAZA.y }, r.houses);
    // 湖边的声音：离南边的海越近越响（码头上最响）
    const ey = mine?.at.y ?? this.camLogicalY ?? PLAZA.y;
    setLake(Math.max(0, Math.min(1, 1 - (WATER_Y - ey) / 260)));
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
    }
    for (const s of this.statics) {
      if (s.house) continue;
      const target = fade.has(s) ? 0.45 : 1;
      s.node.alpha += (target - s.node.alpha) * Math.min(1, dt * 7);
    }

    // 镜头：跟着自己走
    if (mine?.walking && mine.m.start !== this.lastMove) { this.lastMove = mine.m.start; this.free = false; this.unwatch(); }
    const watched = this.watchId && spots[this.watchId];
    const focus = watched ? iso(watched.x, watched.y, 24) : mine ? iso(mine.at.x, mine.at.y, 24) : iso(PLAZA.x, PLAZA.y, 40);
    if (!this.cam) this.cam = { ...focus };
    if (!this.free) { this.cam.x += (focus.x - this.cam.x) * Math.min(1, dt * 4); this.cam.y += (focus.y - this.cam.y) * Math.min(1, dt * 4); }
    this.clampCam();
    this.layout();
    this.snowFrame(dt, t);

    // 给 HTML 层的屏幕坐标
    const screen = { walkers: {}, houses: {}, zoom: this.zoom };
    for (const [id, p] of Object.entries(spots)) screen.walkers[id] = { ...this.toScreen(p.x, p.y), knock: p.knock, hidden: p.hidden, map: p };
    for (const { hs, labelZ } of this.houses.values()) screen.houses[hs.id] = this.toScreen(hs.x + hs.w / 2, hs.y + hs.h / 2, labelZ);
    this.onFrame?.(screen);
  }

  /** 脚下是什么地面。 */
  surfaceAt(houses, x, y) {
    const h = houseAt(houses, x, y);
    if (h) return FLOOR[h.id] ?? 'wood';
    if (x >= PIER.x && x <= PIER.x + PIER.w && y >= WATER_Y - 6) return 'pier';
    if (Math.hypot(x - TOWER.x, y - TOWER.y) < TOWER.r + 42) return 'stone';
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
    this.app?.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
