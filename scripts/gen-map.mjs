// 生成小镇的 Tiled 地图（client/src/assets/maps/）：town-4.json（4 间房）、town-6.json（6 间房）、tiles.json（地块集）。
// 用 Tiled（https://www.mapeditor.org）可以直接打开这些文件继续改：地块集里配好了"雪地/石板"地形笔刷。
// 房子、建筑、海和码头以 src/shared/map.js 为准（服务器要用来寻路），这里只生成地面和摆设。
// 用法：npm run map
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { housesFor, doorPoint, blockedAt, houseAt, PLAZA, ROADS, ROAD_HALF, OBSTACLES, WATER_Y, MAP_W } from '../src/shared/map.js';
import { TILE, TILE_PX, GRID_W, GRID_H, PX_PER_UNIT, TILESET_COLS, TILE_COUNT, SNOW, COBBLE, cornersOf, tileName } from '../src/shared/tiles.js';

const OUT = fileURLToPath(new URL('../client/src/assets/maps/', import.meta.url));
const px = (v) => Math.round(v * PX_PER_UNIT * 10) / 10;

// 稳定的伪随机数：同一份代码每次生成的地图一样
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (list, weights, r) => {
  let acc = 0;
  for (let i = 0; i < list.length; i++) if ((acc += weights[i]) > r) return list[i];
  return list[0];
};

function segDist(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** 所有石板路段：主街 + 每扇门接到最近那条街的小路。 */
function roadSegments(houses) {
  const segs = ROADS.flatMap((line) => line.slice(1).map((b, i) => [{ x: line[i][0], y: line[i][1] }, { x: b[0], y: b[1] }]));
  for (const h of houses) {
    const d = doorPoint(h, 6);
    let best = null; let bd = Infinity;
    for (const [a, b] of segs) {
      const dx = b.x - a.x; const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((d.x - a.x) * dx + (d.y - a.y) * dy) / (dx * dx + dy * dy)));
      const p = { x: a.x + dx * t, y: a.y + dy * t };
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < bd) { bd = dist; best = p; }
    }
    segs.push([d, best]);
  }
  return segs;
}
const onRoad = (segs, p, pad = 0) => Math.hypot(p.x - PLAZA.x, p.y - PLAZA.y) <= PLAZA.r + pad || segs.some(([a, b]) => segDist(p, a, b) <= ROAD_HALF + pad);

function ground(houses, segs) {
  // 先决定每个格点（格子的角）是不是石板，再按四个角选地块
  const cob = [];
  for (let r = 0; r <= GRID_H; r++) {
    cob.push([]);
    for (let c = 0; c <= GRID_W; c++) {
      const p = { x: c * TILE, y: r * TILE };
      const inHouse = houses.some((h) => p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h);
      cob[r].push(!inHouse && onRoad(segs, p) ? 1 : 0);
    }
  }
  const data = [];
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const id = cob[r][c] + cob[r][c + 1] * 2 + cob[r + 1][c] * 4 + cob[r + 1][c + 1] * 8;
      const rnd = hash(c, r);
      const tile = id === 0 ? pick(SNOW, [70, 9, 8, 7, 4, 2], rnd * 100)
        : id === 15 ? pick(COBBLE, [72, 10, 9, 9], rnd * 100)
          : id;
      data.push(tile + 1); // Tiled 的 gid 从 1 开始
    }
  }
  return data;
}

/** 摆设：[类型, x, y, 选项]，x、y 是逻辑坐标（脚底的位置）。 */
function props(houses, segs) {
  const rand = rng(7);
  const out = [['clocktower', PLAZA.x, PLAZA.y]];
  const free = (x, y, pad = 24) => !blockedAt(houses, x, y) && !houseAt(houses, x, y)
    && !houses.some((h) => x > h.x - pad && x < h.x + h.w + pad && y > h.y - pad && y < h.y + h.h + pad)
    && !OBSTACLES.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
  const taken = [];
  const room = (x, y, d) => taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > d);
  const put = (type, x, y, opt, d = 30) => {
    if (!free(x, y, 10) || !room(x, y, d)) return false;
    out.push([type, x, y, opt]); taken.push([x, y]); return true;
  };
  // 路灯：沿每条主街两侧，每 180 一盏
  for (const line of ROADS) {
    const [a, b] = [line[0], line[line.length - 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len; const ny = (b[0] - a[0]) / len;
    for (let d = 90; d < len; d += 180) {
      const side = Math.round(d / 180) % 2 ? 1 : -1;
      put('lamp', a[0] + ((b[0] - a[0]) * d) / len + nx * (ROAD_HALF + 10) * side, a[1] + ((b[1] - a[1]) * d) / len + ny * (ROAD_HALF + 10) * side);
    }
  }
  // 广场：长椅、井、摊位、公告栏
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + 0.5;
    put(k % 3 ? 'bench' : 'stall', PLAZA.x + Math.cos(ang) * (PLAZA.r + 18), PLAZA.y + Math.sin(ang) * (PLAZA.r + 18), k === 3 ? { flip: true } : undefined);
  }
  put('well', PLAZA.x - 230, PLAZA.y + 120); put('notice', PLAZA.x + 190, PLAZA.y - 150);
  // 仓库门口的木箱、木桶，码头边的手推车
  for (const o of OBSTACLES.filter((b) => b.y > 1100)) {
    for (let k = 0; k < 3; k++) put(['crate', 'barrel', 'crate'][k], o.x + 30 + rand() * (o.w - 60), o.y - 14 - rand() * 8, undefined, 14);
    put('cart', o.x + o.w - 50, o.y + o.h + 40);
  }
  put('fence', 1480, 770); put('fence', 1560, 770);
  // 树：散在雪地里，不挡路
  for (let k = 0, n = 0; k < 2000 && n < 80; k++) {
    const x = 30 + rand() * (MAP_W - 60); const y = 30 + rand() * (WATER_Y - 80);
    if (onRoad(segs, { x, y }, 16)) continue;
    if (put('tree', x, y, undefined, 46)) n++;
  }
  return out;
}

function drifts(houses, segs) {
  const rand = rng(11);
  const out = [];
  for (let k = 0; k < 600 && out.length < 50; k++) {
    const x = 40 + rand() * (MAP_W - 80); const y = 40 + rand() * (WATER_Y - 80);
    if (blockedAt(houses, x, y) || houseAt(houses, x, y) || onRoad(segs, { x, y }, 10)) continue;
    out.push([x, y, 22 + rand() * 30, 8 + rand() * 6]);
  }
  return out;
}

function tmj(n) {
  const houses = housesFor(n);
  const segs = roadSegments(houses);
  let oid = 1;
  const propObjs = props(houses, segs).map(([type, x, y, opt]) => ({
    id: oid++, name: '', type, x: px(x), y: px(y), point: true, width: 0, height: 0, rotation: 0, visible: true,
    ...(opt?.flip ? { properties: [{ name: 'flip', type: 'bool', value: true }] } : {}),
  }));
  const driftObjs = drifts(houses, segs).map(([x, y, rx, ry]) => ({
    id: oid++, name: '', type: 'drift', x: px(x - rx), y: px(y - ry), width: px(rx * 2), height: px(ry * 2), ellipse: true, rotation: 0, visible: true,
  }));
  const rect = (o, type, name, props = []) => ({ id: oid++, name, type, x: px(o.x), y: px(o.y), width: px(o.w), height: px(o.h), rotation: 0, visible: true, properties: props });
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.2', orientation: 'orthogonal', renderorder: 'right-down',
    width: GRID_W, height: GRID_H, tilewidth: TILE_PX, tileheight: TILE_PX, infinite: false,
    backgroundcolor: '#a9a59c', nextlayerid: 5, nextobjectid: oid + 100,
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', x: 0, y: 0, width: GRID_W, height: GRID_H, opacity: 1, visible: true, data: ground(houses, segs) },
      { id: 2, name: 'decals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: driftObjs },
      { id: 3, name: 'props', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: propObjs },
      // 建筑由程序按 map.js 画，这一层只是方便在 Tiled 里看位置，改了不生效
      {
        id: 4, name: 'buildings (只读参考)', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 0.5, visible: true, locked: true,
        objects: [
          ...houses.map((h) => rect(h, 'house', h.name, [{ name: 'houseId', type: 'string', value: h.id }])),
          ...OBSTACLES.map((o) => rect(o, 'building', '')),
        ],
      },
    ],
    tilesets: [{ firstgid: 1, source: 'tiles.json' }],
  };
}

function tileset() {
  const ids = [...Array(TILE_COUNT).keys()];
  return {
    type: 'tileset', version: '1.10', tiledversion: '1.11.2', name: 'town',
    tilewidth: TILE_PX, tileheight: TILE_PX, tilecount: TILE_COUNT, columns: TILESET_COLS, margin: 0, spacing: 0,
    image: 'tiles.png', imagewidth: TILE_PX * TILESET_COLS, imageheight: TILE_PX * Math.ceil(TILE_COUNT / TILESET_COLS),
    tiles: ids.map((id) => ({ id, properties: [{ name: 'name', type: 'string', value: tileName(id) }] })),
    wangsets: [{
      name: '雪地/石板', type: 'corner', tile: 15,
      colors: [
        { name: '雪地', color: '#f0f0ea', tile: 0, probability: 1 },
        { name: '石板', color: '#7d8380', tile: 15, probability: 1 },
      ],
      // wangid 顺序：上、右上、右、右下、下、左下、左、左上（角落类型只填四个角）
      wangtiles: ids.map((id) => {
        const [nw, ne, sw, se] = cornersOf(id).map((v) => v + 1);
        return { tileid: id, wangid: [0, ne, 0, se, 0, sw, 0, nw] };
      }),
    }],
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}town-4.json`, JSON.stringify(tmj(4)));
writeFileSync(`${OUT}town-6.json`, JSON.stringify(tmj(10)));
writeFileSync(`${OUT}tiles.json`, JSON.stringify(tileset(), null, 1));
console.log('maps written to', OUT);
