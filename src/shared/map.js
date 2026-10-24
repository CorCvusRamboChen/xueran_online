// 白天自由活动的小镇地图。逻辑坐标是俯视的平面（x 向东、y 向南），前端画成斜视角，
// 后端用它判断"走进了哪间房子"、算走路路线。前后端共用这一份。
export const MAP_W = 1800;
export const MAP_H = 1400;
export const SPEED = 240; // 每秒走多少单位

export const PLAZA = { x: 900, y: 640, r: 150 };
export const TOWER = { x: 900, y: 640, r: 42 };   // 广场中间的钟楼，走不过去
export const WATER_Y = 1290;                       // 再往南是结冰的海
export const PIER = { x: 860, y: 1270, w: 80, h: 120 };

/** 街道（石板路）：折线 + 半宽。只影响地面画成石板还是雪地，雪地也能走。 */
export const ROADS = [
  [[900, 0], [900, 1300]],
  [[380, 640], [1460, 640]],
  [[0, 460], [1800, 460]],
  [[0, 1075], [1800, 1075]],
  [[0, 1250], [1800, 1250]],
];
export const ROAD_HALF = 34;

// 能进去私聊的房子。门都开在看得见的一面（南面 bottom / 东面 right），墓园例外（矮栅栏挡不住）。
const HOUSES = [
  { id: 'tavern', name: '酒馆', x: 500, y: 270, w: 210, h: 150, side: 'bottom', wall: '#a07a48', roof: '#7a3a2a', height: 62 },
  { id: 'church', name: '教堂', x: 1100, y: 220, w: 210, h: 180, side: 'bottom', wall: '#b9b2a2', roof: '#3f5a5c', height: 80 },
  { id: 'smithy', name: '铁匠铺', x: 470, y: 860, w: 200, h: 150, side: 'right', wall: '#7c7a72', roof: '#45403c', height: 56 },
  { id: 'bakery', name: '面包房', x: 1110, y: 860, w: 200, h: 150, side: 'bottom', wall: '#c09a62', roof: '#8a432c', height: 58 },
  { id: 'library', name: '图书馆', x: 200, y: 560, w: 180, h: 170, side: 'right', wall: '#7a8460', roof: '#3a4636', height: 66 },
  { id: 'graveyard', name: '墓园', x: 1460, y: 540, w: 220, h: 200, side: 'left', wall: '#6a6c62', roof: '#3a3a44', height: 0 },
];

/** 不能进的建筑（挡路）：[x, y, 宽, 高, 墙高]。 */
export const OBSTACLES = [
  [80, 120, 220, 140, 60], [320, 90, 140, 170, 72], [740, 100, 120, 140, 56], [940, 80, 130, 160, 66],
  [1350, 110, 200, 150, 60], [1590, 260, 160, 150, 50],
  [480, 500, 160, 90, 44], [1160, 500, 170, 90, 46],
  [80, 800, 150, 180, 56], [720, 840, 120, 160, 50], [960, 830, 110, 170, 56], [1400, 820, 170, 170, 62], [1620, 800, 140, 200, 50],
  [120, 1115, 300, 95, 56], [480, 1115, 300, 95, 62], [960, 1115, 280, 95, 54], [1320, 1115, 360, 95, 60],
].map(([x, y, w, h, height], i) => ({ id: `b${i}`, x, y, w, h, height }));

const DOOR = {
  bottom: (h) => [h.x + h.w / 2, h.y + h.h, 0, 1],
  top: (h) => [h.x + h.w / 2, h.y, 0, -1],
  right: (h) => [h.x + h.w, h.y + h.h / 2, 1, 0],
  left: (h) => [h.x, h.y + h.h / 2, -1, 0],
};

/** 所有房子（包括这局没开放的），前端画装饰用。 */
export const allHouses = () => housesFor(99);

/** 人少 4 间房子，人多 6 间。 */
export function housesFor(n) {
  return HOUSES.slice(0, n > 8 ? 6 : 4).map((h) => {
    const [x, y, nx, ny] = DOOR[h.side](h);
    return { ...h, door: { x, y, nx, ny } };
  });
}

const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

export const houseAt = (houses, x, y) => houses.find((h) => inRect(h, x, y)) ?? null;

/** 门外（k>0）或门内（k<0）k 个单位的点。 */
export const doorPoint = (h, k) => ({ x: h.door.x + h.door.nx * k, y: h.door.y + h.door.ny * k });
export const houseCenter = (h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });

// ───────────── 走路：网格寻路 ─────────────
// 每格 20 单位。建筑、海、钟楼、房子的墙都走不过去，房子只能从门进出。
export const CELL = 20;
const GW = MAP_W / CELL;
const GH = MAP_H / CELL;

/** 这个点能不能站人。 */
export function blockedAt(houses, x, y) {
  if (x < 10 || y < 10 || x > MAP_W - 10 || y > MAP_H - 10) return true;
  if (y > WATER_Y && !inRect(PIER, x, y)) return true;
  if (Math.hypot(x - TOWER.x, y - TOWER.y) < TOWER.r + 8) return true;
  if (OBSTACLES.some((o) => inRect(o, x, y, 8))) return true;
  // 这局没开放的房子当普通建筑挡路
  if (HOUSES.some((h) => !houses.some((a) => a.id === h.id) && inRect(h, x, y, 8))) return true;
  for (const h of houses) {
    if (!inRect(h, x, y, 10)) continue;
    if (inRect(h, x, y, -16)) return false; // 室内
    return Math.hypot(x - h.door.x, y - h.door.y) > 22; // 墙，门口除外
  }
  return false;
}

const grids = new Map();
function gridFor(houses) {
  const key = houses.map((h) => h.id).join();
  let g = grids.get(key);
  if (!g) {
    g = new Uint8Array(GW * GH);
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) g[cy * GW + cx] = blockedAt(houses, (cx + 0.5) * CELL, (cy + 0.5) * CELL) ? 1 : 0;
    grids.set(key, g);
  }
  return g;
}

const cellOf = (p) => Math.min(GH - 1, Math.max(0, Math.floor(p.y / CELL))) * GW + Math.min(GW - 1, Math.max(0, Math.floor(p.x / CELL)));
const centerOf = (c) => ({ x: ((c % GW) + 0.5) * CELL, y: (Math.floor(c / GW) + 0.5) * CELL });

function nearestFree(g, c) {
  const cx = c % GW; const cy = Math.floor(c / GW);
  for (let r = 1; r < Math.max(GW, GH); r++) {
    let best = -1; let bd = Infinity;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH || g[y * GW + x]) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) { bd = d; best = y * GW + x; }
      }
    }
    if (best >= 0) return best;
  }
  return c;
}

/** 两点之间直线能不能走（每 5 个单位查一次）。 */
function clear(g, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
  for (let i = 1; i < n; i++) if (g[cellOf({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })]) return false;
  return true;
}

function astar(g, s, t) {
  const cost = new Float32Array(GW * GH).fill(Infinity);
  const from = new Int32Array(GW * GH).fill(-1);
  const heap = [[0, s]];
  const tx = t % GW; const ty = Math.floor(t / GW);
  const h = (c) => { const dx = Math.abs((c % GW) - tx); const dy = Math.abs(Math.floor(c / GW) - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1; const r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  cost[s] = 0;
  while (heap.length) {
    const [, c] = pop();
    if (c === t) break;
    const cx = c % GW; const cy = Math.floor(c / GW);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx; const y = cy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const n = y * GW + x;
        if (g[n]) continue;
        if (dx && dy && (g[cy * GW + x] || g[y * GW + cx])) continue; // 不斜穿墙角
        const nc = cost[c] + (dx && dy ? 1.414 : 1);
        if (nc < cost[n]) { cost[n] = nc; from[n] = c; push([nc + h(n), n]); }
      }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const cells = [t];
  while (cells[0] !== s) cells.unshift(from[cells[0]]);
  return cells;
}

const round = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

/** 走路路线：绕开建筑，进出房子都要穿过门。点到走不过去的地方就走到离它最近的空地。 */
export function route(houses, from, to) {
  const g = gridFor(houses);
  let s = cellOf(from);
  let t = cellOf(to);
  if (g[s]) s = nearestFree(g, s);
  let end = to;
  if (g[t]) { t = nearestFree(g, t); end = centerOf(t); }
  if (clear(g, from, end)) return [round(from), round(end)];
  const cells = astar(g, s, t);
  if (!cells) return [round(from)];
  const pts = [from, ...cells.slice(1, -1).map(centerOf), end];
  // 拉直：从当前点尽量往后连，直到被挡住
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1;) {
    let j = i + 1;
    while (j + 1 < pts.length && clear(g, pts[i], pts[j + 1])) j++;
    out.push(pts[j]);
    i = j;
  }
  return out.map(round);
}

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** 沿路线走了 dist 之后的位置。 */
export function pointAt(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (dist <= seg) {
      const t = seg ? dist / seg : 1;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    dist -= seg;
  }
  return pts[pts.length - 1];
}

/** 一段移动 {fx, fy, x, y, start, dur, path} 在 now 时刻的位置。路线由服务器算好放在 path 里。 */
export function positionAt(houses, m, now) {
  if (!m.dur || now >= m.start + m.dur) return { x: m.x, y: m.y };
  const pts = m.path ?? [{ x: m.fx, y: m.fy }, { x: m.x, y: m.y }];
  return pointAt(pts, (Math.max(0, now - m.start) / m.dur) * pathLength(pts));
}

/** 广场上围成一圈的座位（自由活动开始时大家站在这里）。 */
export function seatSpot(i, n) {
  const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
  const r = PLAZA.r - 40;
  return { x: PLAZA.x + r * Math.cos(a), y: PLAZA.y + r * Math.sin(a) };
}

/** 街上随便一个能站的地方（机器人溜达用）。 */
export function randomSpot(houses, rnd = Math.random) {
  for (let k = 0; k < 60; k++) {
    const p = { x: 40 + rnd() * (MAP_W - 80), y: 40 + rnd() * (WATER_Y - 60) };
    if (!blockedAt(houses, p.x, p.y) && !houseAt(houses, p.x, p.y) && Math.hypot(p.x - PLAZA.x, p.y - PLAZA.y) > 70) return p;
  }
  return { x: PLAZA.x, y: PLAZA.y + PLAZA.r - 30 };
}

export const clampToMap = (x, y) => ({
  x: Math.min(MAP_W - 14, Math.max(14, Number(x) || 0)),
  y: Math.min(MAP_H - 14, Math.max(14, Number(y) || 0)),
});
