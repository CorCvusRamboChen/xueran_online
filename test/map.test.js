import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMap, MAPS, doorPoint, pathLength, houseAt, distToLine, inRect, positionAt, SPEED, CELL } from '../src/shared/map.js';

for (const town of Object.values(MAPS)) {
  test(`地图 ${town.name}：每间房子从集合点都走得到，回来不超过 8 秒；房门两两隔开`, () => {
    for (const n of [5, 12]) {
      const houses = town.housesFor(n);
      assert.equal(houses.length, n > 8 ? town.open[1] : town.open[0]);
      for (let i = 0; i < n; i++) {
        const seat = town.seatSpot(i, n);
        assert.ok(!town.blockedAt(houses, seat.x, seat.y), `座位 ${i} 站得住`);
      }
      const from = town.seatSpot(0, n);
      for (const h of houses) {
        const inside = { x: h.x + h.w / 2, y: h.y + h.h / 2 };
        const path = town.route(houses, from, inside);
        const end = path.at(-1);
        assert.equal(houseAt(houses, end.x, end.y)?.id, h.id, `${h.name} 走得进去`);
        assert.ok(pathLength(path) / SPEED < 8, `${h.name} 离集合点 ${(pathLength(path) / SPEED).toFixed(1)} 秒`);
      }
    }
    const all = town.allHouses();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = doorPoint(all[i], 0); const b = doorPoint(all[j], 0);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 250, `${all[i].name} 和 ${all[j].name} 的门太近`);
      }
    }
  });

  test(`地图 ${town.name}：能站的地方全部连通（没有走不到的死角）`, () => {
    const houses = town.housesFor(12);
    const g = town.gridFor(houses);
    const start = town.cellOf(town.seatSpot(0, 12)); // 集合点正中可能是钟楼，从座位出发
    const seen = new Uint8Array(g.length);
    const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      const x = c % town.gw; const y = Math.floor(c / town.gw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= town.gw || ny >= town.gh) continue;
        const n = ny * town.gw + nx;
        if (!g[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const lost = [];
    for (let c = 0; c < g.length; c++) if (!g[c] && !seen[c]) lost.push(town.centerOf(c));
    // 地图边上零星一两格被树林、水夹住的空地不算
    assert.ok(lost.length <= 6, `${lost.length} 格走不到，比如 ${JSON.stringify(lost.slice(0, 3))}（格子 ${CELL}）`);
    // 网格会把走不到的死角自己封掉（见 gridFor），但封掉的只能是地图边上的零碎角落，不能是一大片
    assert.ok(g.sealed <= 40, `封掉了 ${g.sealed} 格走不到的空地，太多了`);
  });
}

for (const town of Object.values(MAPS)) {
  test(`地图 ${town.name}：路不从建筑、地标、树林底下穿过，不踩水（只在桥上过溪）`, () => {
    const rects = [...town.allHouses(), ...town.obstacles];
    const problems = [];
    // 集合点是一整块铺地，盖在路上面；广场正中的钟楼 / 绞刑架不算
    const inPlaza = (c) => Math.hypot(c.x - town.gather.x, c.y - town.gather.y) < town.gather.r;
    // 暗流涌动的街道是整片铺的、建筑贴街而建（手绘图已定），只查"不穿过"；新地图要求路离墙至少 8
    const gap = town.id === 'tb' ? -2 : 8;
    for (const r of town.roads) {
      const name = r.name ?? r.kind;
      for (const b of rects) {
        // 一条路的一头就停在这间房子门口（通往它的小路）：房子手动调大后路头压进去一点没关系（手绘底图上路本来就画到门口）
        if (b.door && [r.pts[0], r.pts.at(-1)].some(([x, y]) => Math.hypot(x - b.door.x, y - b.door.y) < 90)) continue;
        let hit = 0;
        for (let x = b.x - gap; x <= b.x + b.w + gap; x += 4) {
          for (let y = b.y - gap; y <= b.y + b.h + gap; y += 4) {
            if (distToLine(r.pts, x, y) >= r.half) continue;
            if (b.door && Math.hypot(x - b.door.x, y - b.door.y) < r.half + 6) continue; // 路通到门口
            hit++;
          }
        }
        if (hit) problems.push(`${name} 压到 ${b.name ?? b.id}`);
      }
      for (const c of town.circles) {
        if (inPlaza(c)) continue;
        if (distToLine(r.pts, c.x, c.y) < c.r + r.half * (c.kind === 'trees' ? 0.3 : 1)) problems.push(`${name} 压到 ${c.name ?? c.id}`);
      }
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, ay] = r.pts[i - 1]; const [bx, by] = r.pts[i]; const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n; const y = ay + ((by - ay) * k) / n;
          if (town.waterDist(x, y) < r.half * 0.5 && !town.walkwayAt(x, y, 4)) { problems.push(`${name} 第 ${i} 段踩水`); break; }
        }
      }
    }
    for (const b of rects) {
      for (const c of town.circles) {
        const cx = Math.max(b.x, Math.min(c.x, b.x + b.w)); const cy = Math.max(b.y, Math.min(c.y, b.y + b.h));
        if (Math.hypot(cx - c.x, cy - c.y) < c.r) problems.push(`${c.name ?? c.id} 压到 ${b.name ?? b.id}`);
      }
      // 房子离水至少 30（留出岸边）
      let near = Infinity;
      for (let x = b.x; x <= b.x + b.w; x += 5) for (let y = b.y; y <= b.y + b.h; y += 5) near = Math.min(near, town.waterDist(x, y));
      if (near < 30) problems.push(`${b.name ?? b.id} 离水只有 ${Math.round(near)}`);
    }
    assert.deepEqual(problems, []);
  });
}

// 等距画面：高的东西（树林、地标、建筑）往屏幕上方长，会盖住画面上在它"后面"的房子。
// 暗流涌动的图已经画好了，有几处已知的（钟楼挡酒馆、b9 挡铁匠铺门口、b12 挡墓园，游戏里靠半透明处理），不查它。
const P = (x, y, z = 0) => [x - y, (x + y) / 2 - z];
const hexOf = (x, y, w, h, top) => [P(x, y + h), P(x + w, y + h), P(x + w, y), P(x + w, y, top), P(x, y, top), P(x, y + h, top)];
function inPoly(poly, x, y) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
const TOP = { trees: 95, beacon: 180, well: 50, gallows: 100, tower: 260 };
for (const town of Object.values(MAPS).filter((t) => t.id !== 'tb')) {
  test(`地图 ${town.name}：能进的房子在画面上不被树、地标、别的建筑挡住（门口一点都不能挡）`, () => {
    const box = (x, y, w, h) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
    const occ = [
      ...town.circles.map((c) => ({ name: c.name ?? c.id, poly: hexOf(c.x - c.r * 0.8, c.y - c.r * 0.8, c.r * 1.6, c.r * 1.6, TOP[c.kind] ?? 60), box: box(c.x - c.r * 0.8, c.y - c.r * 0.8, c.r * 1.6, c.r * 1.6) })),
      ...[...town.obstacles, ...town.allHouses().filter((h) => h.height)].map((o) => ({ id: o.id, name: o.name ?? o.id, poly: hexOf(o.x, o.y, o.w, o.h, o.height + Math.min(o.w, o.h) * 0.38), box: box(o.x, o.y, o.w, o.h) })),
    ];
    const inFront = (o, x, y) => !(o.box.x1 <= x || o.box.y1 <= y);
    const problems = [];
    for (const h of town.allHouses()) {
      let n = 0; const hits = {};
      for (let x = h.x + 4; x < h.x + h.w; x += 8) {
        for (let y = h.y + 4; y < h.y + h.h; y += 8) {
          n++;
          const o = occ.find((q) => q.id !== h.id && inFront(q, x, y) && inPoly(q.poly, ...P(x, y)));
          if (o) hits[o.name] = (hits[o.name] ?? 0) + 1;
        }
      }
      for (const [k, v] of Object.entries(hits)) if (v / n > 0.04) problems.push(`${k} 挡住 ${h.name} ${Math.round((100 * v) / n)}%`);
      const door = occ.find((q) => q.id !== h.id && inFront(q, h.door.x - h.door.nx * 4, h.door.y - h.door.ny * 4) && inPoly(q.poly, ...P(h.door.x, h.door.y, 10)));
      if (door) problems.push(`${door.name} 挡住 ${h.name} 的门口`);
    }
    // 地标之间（老井、绞刑架、烽火台……）在画面上不能叠在一起
    const marks = town.circles.filter((c) => c.kind !== 'trees');
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const [a, b] = [marks[i], marks[j]];
        const ba = (c) => { const [sx, sy] = P(c.x, c.y); return { l: sx - c.r * 1.2, r: sx + c.r * 1.2, t: sy - (TOP[c.kind] ?? 60), b: sy + c.r * 0.6 }; };
        const A = ba(a); const B = ba(b);
        if (A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b) problems.push(`${a.name} 和 ${b.name} 在画面上叠在一起`);
      }
    }
    // 建筑之间至少隔 40，不然屋檐在画面上会穿插、挤在一起
    const all = [...town.allHouses(), ...town.obstacles];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]; const b = all[j];
        const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        if (gap < 40) problems.push(`${a.name ?? a.id} 和 ${b.name ?? b.id} 只隔 ${gap}`);
      }
    }
    assert.deepEqual(problems, []);
  });
}

test('黯月初升：溪水走不过去，只能从石桥或吊板桥过', () => {
  const town = getMap('bmr');
  const houses = town.housesFor(12);
  // 溪上一点（不在桥上）站不住；桥上站得住（坐标按底稿写，地图整体放大过 artScale 倍）
  const k = town.artScale ?? 1;
  assert.ok(town.blockedAt(houses, 820 * k, 900 * k));
  assert.ok(!town.blockedAt(houses, 1010 * k, 790 * k));
  assert.ok(!town.blockedAt(houses, 1560 * k, 280 * k));
  // 从西岸的旅店门口去东岸的礼拜堂，路线一定经过某座桥
  const inn = houses.find((h) => h.id === 'inn'); const chapel = houses.find((h) => h.id === 'chapel');
  const path = town.route(houses, doorPoint(inn, 30), { x: chapel.x + chapel.w / 2, y: chapel.y + chapel.h / 2 });
  const onBridge = (p) => !!town.walkwayAt(p.x, p.y);
  const pts = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i]; const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let k = 0; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  assert.ok(pts.some(onBridge), '过溪要走桥');
  assert.ok(pts.every((p) => town.waterDist(p.x, p.y) >= 0 || onBridge(p)), '路线不踩水');
});

test('剧本 → 地图：暗流涌动用钟楼广场，黯月初升用黯月驿站，不认识的剧本退回暗流涌动', () => {
  assert.equal(getMap('tb').id, 'tb');
  assert.equal(getMap('bmr').id, 'bmr');
  assert.equal(getMap(undefined).id, 'tb');
});

test('暗流涌动：普通建筑能给 15 个人每人分一个家，家门口都走得到集合点', () => {
  const town = getMap('tb');
  const homes = town.homes();
  assert.ok(homes.length >= 15, `只有 ${homes.length} 个家`);
  const houses = town.housesFor(15);
  const from = town.seatSpot(0, 15);
  for (const h of homes) {
    const step = town.homeStep(h.id);
    assert.ok(!town.blockedAt(houses, step.x, step.y), `${h.id} 门口站不住`);
    const path = town.route(houses, step, from);
    const end = path.at(-1);
    assert.ok(Math.hypot(end.x - from.x, end.y - from.y) < 30, `${h.id} 走不到集合点`);
  }
});

for (const town of Object.values(MAPS)) {
  test(`地图 ${town.name}：点街上任意一点，路线不会穿进、擦进任何房子（墙边那一格也停在墙外）`, () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const n of [7, 10]) {
      const houses = town.housesFor(n);
      for (let k = 0; k < 400; k++) {
        const from = town.seatSpot(k % n, n);
        const to = { x: 20 + rnd() * (town.w - 40), y: 20 + rnd() * (town.h - 40) };
        if (houseAt(houses, to.x, to.y)) continue;
        const path = town.route(houses, from, to);
        const m = { fx: from.x, fy: from.y, x: path.at(-1).x, y: path.at(-1).y, start: 0, dur: (pathLength(path) / SPEED) * 1000, path };
        for (let t = 0; t <= m.dur; t += 25) {
          const p = positionAt(m, t); const h = houseAt(houses, p.x, p.y);
          assert.ok(!h, `从 (${Math.round(from.x)}, ${Math.round(from.y)}) 去 (${Math.round(to.x)}, ${Math.round(to.y)}) 时进了${h?.name}`);
        }
      }
    }
  });
}
