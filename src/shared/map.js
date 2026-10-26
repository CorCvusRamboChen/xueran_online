// 白天自由活动的小镇地图。逻辑坐标是俯视的平面（x 向东、y 向南），前端画成斜视角，
// 后端用它判断"走进了哪间房子"、算走路路线。前后端共用这一份。
// 每个剧本一张独立的地图（数据在 maps/ 下），寻路、进屋、站位都只读地图数据：getMap(剧本)。
import TB from './maps/tb.js';
import BMR from './maps/bmr.js';

export const SPEED = 240; // 每秒走多少单位
export const CELL = 20;   // 寻路网格每格 20 单位

export const DOOR = {
  bottom: (h) => [h.x + h.w / 2, h.y + h.h, 0, 1],
  top: (h) => [h.x + h.w / 2, h.y, 0, -1],
  right: (h) => [h.x + h.w, h.y + h.h / 2, 1, 0],
  left: (h) => [h.x, h.y + h.h / 2, -1, 0],
};

export const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** 点到折线的距离。 */
export function distToLine(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]; const [bx, by] = pts[i];
    const dx = bx - ax; const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

export const houseAt = (houses, x, y) => houses.find((h) => inRect(h, x, y)) ?? null;

/** 门外（k>0）或门内（k<0）k 个单位的点。 */
export const doorPoint = (h, k) => ({ x: h.door.x + h.door.nx * k, y: h.door.y + h.door.ny * k });
export const houseCenter = (h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });

export class TownMap {
  constructor(data) {
    Object.assign(this, data);
    this.gw = this.w / CELL;
    this.gh = this.h / CELL;
    this.grids = new Map();
    this.allHouseList = this.housesFor(99);
    // 每个玩家在镇上的"家"：不能进的普通建筑，门开在南面（朝镜头），门口一步能站人的才算
    this.homeList = this.obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, door: { x: o.x + o.w / 2, y: o.y + o.h, nx: 0, ny: 1 } }))
      .filter((o) => { const p = doorPoint(o, 24); return !this.blockedAt(this.allHouseList, p.x, p.y); });
    // 溪上的桥：桥面垂直跨过水流（按桥中心处溪的走向算），能走的就是这块桥面，不是整个外框
    const band = this.water?.band;
    if (band) {
      this.walkways = this.walkways.map((w) => {
        const cx = w.x + w.w / 2; const cy = w.y + w.h / 2;
        let best = null;
        for (let i = 1; i < band.pts.length; i++) {
          const [ax, ay] = band.pts[i - 1]; const [bx, by] = band.pts[i];
          const d = distToLine([[ax, ay], [bx, by]], cx, cy);
          if (!best || d < best.d) best = { d, tx: bx - ax, ty: by - ay };
        }
        const n = Math.hypot(best.tx, best.ty);
        const ux = -best.ty / n; const uy = best.tx / n; // 桥的走向 = 溪的法线
        const along = band.half + 22 + best.d; const across = w.deckHalf ?? 26; // best.d：桥（手绘图）的中心不一定正好在溪的中线上
        const deck = { cx, cy, ux: uy < 0 ? -ux : ux, uy: Math.abs(uy), along, across };
        const c = (a, b) => [cx + deck.ux * a - deck.uy * b, cy + deck.uy * a + deck.ux * b];
        deck.poly = [c(-along, -across), c(along, -across), c(along, across), c(-along, across)];
        return { ...w, deck };
      });
    }
  }

  /** 人少开前几间房子，人多（9 人以上）全开。 */
  housesFor(n) {
    return this.houses.slice(0, n > 8 ? this.open[1] : this.open[0]).map((h) => {
      const [x, y, nx, ny] = DOOR[h.side](h);
      return { ...h, door: { x, y, nx, ny } };
    });
  }

  /** 所有房子（包括这局没开放的），前端画装饰用。 */
  allHouses() { return this.allHouseList; }

  /** 能当玩家的家的普通建筑（门口站得住）。 */
  homes() { return this.homeList; }
  homeById(id) { return this.homeList.find((h) => h.id === id) ?? null; }
  /** 家门口（出门站的地方）。 */
  homeStep(id) { const h = this.homeById(id); return h ? doorPoint(h, 24) : null; }

  /** 离水面多远（负数 = 在水里）。没有水就是无穷远。 */
  waterDist(x, y) {
    const wt = this.water;
    if (wt?.below != null) return wt.below - y;
    if (wt?.band) return distToLine(wt.band.pts, x, y) - wt.band.half;
    return Infinity;
  }

  /** 这一点在不在桥 / 码头上（pad：往外放宽几个单位）。 */
  walkwayAt(x, y, pad = 0) {
    return this.walkways.find((w) => {
      if (!w.deck) return inRect(w, x, y, pad);
      const { cx, cy, ux, uy, along, across } = w.deck;
      const dx = x - cx; const dy = y - cy;
      return Math.abs(dx * ux + dy * uy) <= along + pad && Math.abs(-dx * uy + dy * ux) <= across + pad;
    }) ?? null;
  }

  /** 这个点能不能站人。 */
  blockedAt(houses, x, y) {
    if (x < 10 || y < 10 || x > this.w - 10 || y > this.h - 10) return true;
    if (this.waterDist(x, y) < 0 && !this.walkwayAt(x, y)) return true;
    if (this.circles.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + 8)) return true;
    if (this.obstacles.some((o) => inRect(o, x, y, 8))) return true;
    // 这局没开放的房子当普通建筑挡路
    if (this.houses.some((h) => !houses.some((a) => a.id === h.id) && inRect(h, x, y, 8))) return true;
    for (const h of houses) {
      if (!inRect(h, x, y, 10)) continue;
      if (inRect(h, x, y, -16)) return false; // 室内
      return Math.hypot(x - h.door.x, y - h.door.y) > 22; // 墙，门口除外
    }
    return false;
  }

  gridFor(houses) {
    const key = houses.map((h) => h.id).join();
    let g = this.grids.get(key);
    if (!g) {
      const { gw, gh } = this;
      g = new Uint8Array(gw * gh);
      for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) g[cy * gw + cx] = this.blockedAt(houses, (cx + 0.5) * CELL, (cy + 0.5) * CELL) ? 1 : 0;
      // 从集合点走不到的零碎空地（被溪、树林、地图边夹死的角落）也当成不能站：点到那里就走到最近的走得到的地方，而不是原地不动
      const seen = new Uint8Array(gw * gh);
      const start = this.nearestFree(g, this.cellOf(this.gather));
      const stack = g[start] ? [] : [start]; seen[start] = 1;
      while (stack.length) {
        const c = stack.pop(); const x = c % gw; const y = Math.floor(c / gw);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy; const n = ny * gw + nx;
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !g[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
      let sealed = 0;
      if (!g[start]) for (let c = 0; c < g.length; c++) if (!g[c] && !seen[c]) { g[c] = 1; sealed++; }
      g.sealed = sealed;
      this.grids.set(key, g);
    }
    return g;
  }

  cellOf(p) { return Math.min(this.gh - 1, Math.max(0, Math.floor(p.y / CELL))) * this.gw + Math.min(this.gw - 1, Math.max(0, Math.floor(p.x / CELL))); }
  centerOf(c) { return { x: ((c % this.gw) + 0.5) * CELL, y: (Math.floor(c / this.gw) + 0.5) * CELL }; }

  /** 离格子 c 最近的能站的格子。prefer：优先挑满足它的（比如"和点的地方在同一边：都在街上 / 都在这间屋里"），附近几圈都没有才随便挑。 */
  nearestFree(g, c, prefer = null) {
    const { gw, gh } = this;
    const cx = c % gw; const cy = Math.floor(c / gw);
    let fallback = -1;
    for (let r = 1; r < Math.max(gw, gh); r++) {
      let best = -1; let bd = Infinity;
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= gw || y >= gh || g[y * gw + x]) continue;
          const n = y * gw + x;
          if (fallback < 0) fallback = n;
          if (prefer && !prefer(n)) continue;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best >= 0) return best;
      if (fallback >= 0 && r >= 6) return fallback;
    }
    return fallback >= 0 ? fallback : c;
  }

  /** 每个格子中心在哪间房子里（房子在 houses 里的下标，-1 = 街上）。 */
  houseCells(houses) {
    const key = `${houses.map((h) => h.id).join()}#houses`;
    let hc = this.grids.get(key);
    if (!hc) {
      hc = new Int8Array(this.gw * this.gh).fill(-1);
      for (let c = 0; c < hc.length; c++) { const p = this.centerOf(c); const i = houses.findIndex((h) => inRect(h, p.x, p.y)); hc[c] = i; }
      this.grids.set(key, hc);
    }
    return hc;
  }

  /** 两点之间直线能不能走（每 5 个单位查一次）。pass：这一点能不能踩（比如不许擦进别的房子门口）。 */
  clear(g, a, b, pass = null) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let i = 1; i < n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      if (g[this.cellOf(p)] || (pass && !pass(p))) return false;
    }
    return true;
  }

  astar(g, s, t) {
    const { gw, gh } = this;
    const cost = new Float32Array(gw * gh).fill(Infinity);
    const from = new Int32Array(gw * gh).fill(-1);
    const heap = [[0, s]];
    const tx = t % gw; const ty = Math.floor(t / gw);
    const h = (c) => { const dx = Math.abs((c % gw) - tx); const dy = Math.abs(Math.floor(c / gw) - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
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
      const cx = c % gw; const cy = Math.floor(c / gw);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cx + dx; const y = cy + dy;
          if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
          const n = y * gw + x;
          if (g[n]) continue;
          if (dx && dy && (g[cy * gw + x] || g[y * gw + cx])) continue; // 不斜穿墙角
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

  /** 走路路线：绕开建筑，进出房子都要穿过门。点到走不过去的地方就走到离它最近的空地。 */
  route(houses, from, to) {
    // 路线只许穿过起点、终点所在的房子：别的房子（连门口）一律绕开，免得路过时擦进门里（被当成进屋、敲门、切语音）
    const hc = this.houseCells(houses);
    const zone = (p) => houseAt(houses, p.x, p.y)?.id ?? null;
    const ok = new Set([zone(from), zone(to)]);
    const base = this.gridFor(houses);
    let g = base;
    if (houses.some((h) => !ok.has(h.id))) {
      g = base.slice();
      for (let c = 0; c < g.length; c++) if (hc[c] >= 0 && !ok.has(houses[hc[c]].id)) g[c] = 1;
    }
    const pass = (p) => ok.has(zone(p));
    let s = this.cellOf(from);
    let t = this.cellOf(to);
    if (g[s]) s = this.nearestFree(g, s);
    let end = to;
    // 点到墙边 / 水边那一格：找最近的能站的格子，优先和点的地方同一边（点在墓园墙外就停在墙外，不会绕进墓园里）
    const want = zone(to);
    const same = (c) => (hc[c] >= 0 ? houses[hc[c]].id : null) === want;
    if (g[t]) { t = this.nearestFree(g, t, same); end = this.centerOf(t); }
    else if (this.blockedAt(houses, to.x, to.y)) end = this.centerOf(t); // 格子中心能站、点的那一下却在水边 / 墙边上：站到格子中心，免得踩进水里
    if (this.clear(g, from, end, pass)) return [round(from), round(end)];
    const cells = this.astar(g, s, t);
    if (!cells) return [round(from)];
    const pts = [from, ...cells.slice(1, -1).map((c) => this.centerOf(c)), end];
    // 拉直：从当前点尽量往后连，直到被挡住
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1;) {
      let j = i + 1;
      while (j + 1 < pts.length && this.clear(g, pts[i], pts[j + 1], pass)) j++;
      out.push(pts[j]);
      i = j;
    }
    return out.map(round);
  }

  /** 集合点上围成一圈的座位（自由活动开始时大家站在这里）。 */
  seatSpot(i, n) {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const { x, y, r } = this.gather;
    return { x: x + (r - 40) * Math.cos(a), y: y + (r - 40) * Math.sin(a) };
  }

  /** 街上随便一个能站的地方（机器人溜达用）。 */
  randomSpot(houses, rnd = Math.random) {
    const { x: gx, y: gy, r } = this.gather;
    for (let k = 0; k < 80; k++) {
      const p = { x: 40 + rnd() * (this.w - 80), y: 40 + rnd() * (this.h - 80) };
      if (!this.blockedAt(houses, p.x, p.y) && !houseAt(houses, p.x, p.y) && Math.hypot(p.x - gx, p.y - gy) > 70) return p;
    }
    return { x: gx, y: gy + r - 30 };
  }

  clampToMap(x, y) {
    return {
      x: Math.min(this.w - 14, Math.max(14, Number(x) || 0)),
      y: Math.min(this.h - 14, Math.max(14, Number(y) || 0)),
    };
  }
}

const round = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

export const MAPS = { tb: new TownMap(TB), bmr: new TownMap(BMR) };
/** 剧本 → 地图（没有专属地图的剧本用暗流涌动的）。 */
export const getMap = (script) => MAPS[script] ?? MAPS.tb;

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
export function positionAt(m, now) {
  if (!m.dur || now >= m.start + m.dur) return { x: m.x, y: m.y };
  const pts = m.path ?? [{ x: m.fx, y: m.fy }, { x: m.x, y: m.y }];
  return pointAt(pts, (Math.max(0, now - m.start) / m.dur) * pathLength(pts));
}

// ── 暗流涌动地图的常量：Tiled 地图生成脚本（scripts/gen-map.mjs）和地块约定（tiles.js）在用 ──
const T = MAPS.tb;
export const MAP_W = T.w;
export const MAP_H = T.h;
export const PLAZA = T.gather;
export const WATER_Y = T.water.below;
export const ROADS = T.roads.map((r) => r.pts);
export const ROAD_HALF = 34;
export const OBSTACLES = T.obstacles;
