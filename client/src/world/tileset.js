// 地块图 tiles.png：有画好的（assets/world/tiles.png）就用画好的，没有就在浏览器里逐像素画一张占位。
// 占位是极乐迪斯科地图的感觉：纸一样的灰白雪地 + 冷灰石板 + 墨线路沿。
// 布局和编号见 src/shared/tiles.js；所有纹理以 64px 为周期，所以相邻地块的接缝能对上。
import { TILE_PX, TILESET_COLS, TILE_COUNT, cornersOf } from '../../../src/shared/tiles.js';

const PAINTED = Object.values(import.meta.glob('../assets/world/tiles.png', { eager: true, query: '?url', import: 'default' }))[0];

const P = TILE_PX;
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);

/** 以 64px 为周期的值噪声，cell = 每格多少像素。 */
function noise(x, y, cell, seed) {
  const n = P / cell;
  const gx = x / cell; const gy = y / cell;
  const x0 = Math.floor(gx); const y0 = Math.floor(gy);
  const tx = smooth(gx - x0); const ty = smooth(gy - y0);
  const v = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

function snow(x, y) {
  const n = noise(x, y, 16, 3) - 0.5;
  const g = (hash(x, y, 7) - 0.5) * 9;
  const fine = (noise(x, y, 4, 11) - 0.5) * 6;
  const v = 232 + n * 16 + g + fine;
  const cold = Math.max(0, -n) * 30; // 低处带一点冷蓝
  return [v - cold * 0.6, v - cold * 0.25, v + cold * 0.1];
}

// 石板：每格 4×4 个抖动的点做 Voronoi，周期 64px
const CELLS = 4; const CS = P / CELLS;
function cobblePoint(i, j) {
  const wi = ((i % CELLS) + CELLS) % CELLS; const wj = ((j % CELLS) + CELLS) % CELLS;
  return [(i + 0.2 + 0.6 * hash(wi, wj, 21)) * CS, (j + 0.2 + 0.6 * hash(wi, wj, 22)) * CS, hash(wi, wj, 23)];
}
function cobble(x, y) {
  const ci = Math.floor(x / CS); const cj = Math.floor(y / CS);
  let d1 = 1e9; let d2 = 1e9; let best = null;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const p = cobblePoint(i, j);
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
  }
  const edge = d2 - d1;
  if (edge < 2.4) {
    // 石缝：大多是深色，偶尔塞着雪
    if (noise(x, y, 8, 31) > 0.68) return [214, 216, 212];
    return [86, 94, 93];
  }
  const tone = (best[2] - 0.5) * 22;
  const dome = -d1 * 0.9 + Math.min(edge, 6) * 1.6; // 中间亮、边缘暗，像有点鼓
  const lit = ((best[0] - x) + (best[1] - y)) * 0.5; // 左上受光
  const g = (hash(x, y, 9) - 0.5) * 10;
  const v = 168 + tone + dome + lit + g;
  return [v - 4, v, v + 2];
}

/** 一个地块：按四个角的地形插值出一块不规则的石板区，交界处画墨线路沿。 */
function paintTile(img, ox, oy, id) {
  const [nw, ne, sw, se] = cornersOf(id);
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      const u = (x + 0.5) / P; const v = (y + 0.5) / P;
      const base = (nw * (1 - u) + ne * u) * (1 - v) + (sw * (1 - u) + se * u) * v;
      const wobble = (noise(x, y, 8, 77) - 0.5) * 0.5 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      const m = base + wobble;
      const gu = ((1 - v) * (ne - nw) + v * (se - sw)) / P;
      const gv = ((1 - u) * (sw - nw) + u * (se - ne)) / P;
      const grad = Math.hypot(gu, gv);
      const dist = grad > 1e-6 ? Math.abs(m - 0.5) / grad : 99; // 离路沿多少像素
      let c;
      if (dist < 1.2) c = [52, 60, 59];
      else if (m > 0.5) c = cobble(x, y);
      else {
        c = snow(x, y);
        if (dist < 5) { const k = (5 - dist) * 5; c = [c[0] - k, c[1] - k * 0.8, c[2] - k * 0.6]; } // 路沿在雪上的阴影
      }
      const i = ((oy + y) * img.width + ox + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
}

/** 整格变体上的小细节，离边缘留 6px，不影响接缝。 */
function details(ctx, ox, oy, id) {
  const ink = '#2b3433';
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineCap = 'round';
  if (id === 16) { // 枯枝和小石子
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(14, 40); ctx.lineTo(34, 30); ctx.moveTo(26, 34); ctx.lineTo(30, 24); ctx.moveTo(22, 36); ctx.lineTo(18, 30); ctx.stroke();
    ctx.fillStyle = '#7d8380';
    [[44, 46, 2.5], [49, 42, 1.6], [40, 18, 1.8]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  } else if (id === 17) { // 一小堆雪
    ctx.fillStyle = '#f7f7f3'; ctx.strokeStyle = '#c4c6c0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(32, 36, 20, 9, -0.15, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(28, 33, 9, 3.5, -0.15, 0, 7); ctx.fill();
  } else if (id === 18) { // 灰点
    ctx.fillStyle = 'rgba(40,50,50,.35)';
    for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.arc(8 + hash(k, 1, 5) * 48, 8 + hash(k, 2, 5) * 48, 0.6 + hash(k, 3, 5) * 1.2, 0, 7); ctx.fill(); }
  } else if (id === 22) { // 一串脚印
    ctx.fillStyle = 'rgba(120,135,140,.55)';
    for (let k = 0; k < 4; k++) {
      const x = 12 + k * 12; const y = 50 - k * 11 + (k % 2 ? 4 : -4);
      ctx.beginPath(); ctx.ellipse(x, y, 2.6, 4.2, 0.7, 0, 7); ctx.fill();
    }
  } else if (id === 23) { // 结冰的水洼
    ctx.fillStyle = '#b9ccd3'; ctx.strokeStyle = '#6f8a92'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(32, 33, 19, 11, 0.2, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#eef6f8'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(22, 30); ctx.lineTo(32, 27); ctx.moveTo(30, 37); ctx.lineTo(40, 34); ctx.stroke();
  } else if (id === 19) { // 裂开的石板
    ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(18, 20); ctx.lineTo(28, 30); ctx.lineTo(26, 38); ctx.lineTo(38, 46); ctx.stroke();
  } else if (id === 20) { // 石板上的残雪
    ctx.fillStyle = 'rgba(236,237,233,.92)';
    ctx.beginPath(); ctx.ellipse(30, 34, 17, 8, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(44, 24, 7, 4, 0.2, 0, 7); ctx.fill();
  } else if (id === 21) { // 磨损发亮的一块
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.ellipse(32, 32, 20, 14, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/** 程序画的占位地块图（canvas），尺寸和 tiles.png 一样。 */
export function paintTileset() {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = P * TILESET_COLS; canvas.height = P * rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let id = 0; id < TILE_COUNT; id++) paintTile(img, (id % TILESET_COLS) * P, Math.floor(id / TILESET_COLS) * P, id);
  ctx.putImageData(img, 0, 0);
  for (let id = 16; id < TILE_COUNT; id++) details(ctx, (id % TILESET_COLS) * P, Math.floor(id / TILESET_COLS) * P, id);
  return canvas;
}

let cached = null;
/** 地块图：画好的 png 优先。返回可以 drawImage 的对象。 */
export function loadTileset() {
  if (!cached) {
    cached = PAINTED
      ? new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(paintTileset()); im.src = PAINTED; })
      : Promise.resolve(paintTileset());
  }
  return cached;
}
