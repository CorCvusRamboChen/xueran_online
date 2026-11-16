// 山上的修道院（2026-11-16 灰盒，剧本之后再定）：暗流涌动背景故事里「远处一座隐约可见的修道院，有人影在一道道门洞间穿行」。
// 还在鸦木布拉夫，所以每个剧本都能用；但三张官方图都没去过这里（海港钟楼、森林驿站、紫罗兰花园）。
// 路网是台地：山坡被两道挡土墙分成下院、回廊、上院三层，正中的大石阶是必经的相遇点；
// 东边崖径是绕远的替代路（三层都通），西边小石阶连回廊和墓园，形成闭环。北边的钟楼是主地标，东北崖上的隐修石窟最偏远。
// 初春清晨，细雨和山雾：和暴雪夜、深秋黄昏、初夏傍晚都分得开。设计说明见 design/abbey-map/README.md。

const props = (kind, list) => list.map(([x, y, r, extra], i) => ({ id: `${kind}${i}`, kind, x, y, r, ...extra }));
const clumps = (id, list, extra) => list.map(([x, y, r], i) => ({ id: `${id}${i}`, kind: 'trees', x, y, r, ...extra }));
// 挡土墙：一段段矮墙，留出石阶的缺口
const wall = (id, x0, x1, y) => ({ id, name: '挡土墙', x: x0, y, w: x1 - x0, h: 16, height: 34, shape: 'lowwall', low: true });

export default {
  id: 'abbey',
  name: '修道院',
  place: '鸦木布拉夫 · 山上的修道院',
  minimap: { ground: '#8e9a86', road: '#b7b0a0' },
  palette: {
    ground: '#7d8a70', speck: ['#9aa48a', '#6c7860', '#b8b49c', '#8a8a74'], bed: '#6c7c58',
    coach: '#a8a294', lane: '#b2ab9a', trail: '#958c76', plaza: '#bdb6a6', street: '#a8a294',
    walls: ['#b8b2a2', '#a8a292', '#c2baa6', '#9c988a'], roofs: ['#4a4e58', '#5a4a44', '#3e4a4a', '#54504a'],
  },
  treeColors: [0x4e6a52, 0x5c7656, 0x40584a, 0x6a7a5a],
  w: 2000, h: 1800,
  guide: { x: -1840, y: -140, w: 3880, h: 2140 }, // 东北的石窟和南边山门都要整块画进底稿
  gather: { x: 1000, y: 900, r: 135 },
  walkways: [],
  weather: 'drizzle',
  fog: { color: 0xc4cad0, ground: 0.2, haze: 0.24, mist: 0.08 },
  fogSpots: [{ x: 1880, y: 260, a: 2.4 }, { x: 1940, y: 600, a: 2 }, { x: 160, y: 1500, a: 1.8 }, { x: 1000, y: 1760, a: 1.6 }],
  roofSnow: 0,
  litHousesOnly: true,
  ground: 'gravel',
  // 分区：第一个圈住这个点的区。崖径要排在前面（它和上院、回廊有重叠）
  zones: [
    { id: 'cliff', name: '崖径', poly: [[1770, -100], [2100, -100], [2100, 1260], [1770, 1260]], ground: '#6e7668', mini: '#8a9284', road: '#8e8774', pave: 'broken', speck: ['#7c7a68', '#5c6450'], sparse: 0.5, surface: 'gravel', roadSurface: 'stone', wind: 0.5 },
    { id: 'upper', name: '上院', poly: [[-100, -100], [1770, -100], [1770, 608], [-100, 608]], ground: '#848c7a', mini: '#a2a896', road: '#bdb6a6', pave: 'cobble', paveColor: '#9c968a', surface: 'stone', roadSurface: 'stone', wind: 0.3 },
    { id: 'cloister', name: '回廊', poly: [[-100, 608], [1770, 608], [1770, 1258], [-100, 1258]], ground: '#7f8e6c', mini: '#a0ac8c', road: '#c2bcac', pave: 'cobble', paveColor: '#a49e90', surface: 'stone', roadSurface: 'cobble', wind: 0.1 },
    { id: 'lower', name: '下院', poly: [[-100, 1258], [2100, 1258], [2100, 1900], [-100, 1900]], ground: '#7a8460', mini: '#9ca484', road: '#a8946e', pave: 'ruts', paveColor: '#86744e', speck: ['#9a8a5c', '#6a7a4a'], surface: 'gravel', roadSurface: 'gravel', wind: 0.15 },
  ],
  circles: [
    { id: 'well', kind: 'well', name: '回廊古井', x: 1000, y: 900, r: 26 },
    { id: 'tower', kind: 'tower', name: '钟楼', x: 880, y: 400, r: 44 }, // 主地标：上院正中、大石阶顶上，从三层台地都看得见
    ...clumps('cy', [[60, 140, 56], [50, 420, 50], [60, 760, 50], [60, 1100, 50]], { colors: [0x3e5a46, 0x46624a] }), // 西边崖下的柏树
    ...clumps('pn', [[1960, 60, 40], [1540, 60, 44], [1980, 860, 36], [1990, 1120, 34]], { colors: [0x40584a, 0x4e6a52] }), // 崖径上的松树
    ...clumps('or', [[1810, 1330, 44], [1760, 1440, 40], [1700, 1700, 46], [1880, 1640, 40]], { colors: [0x6a7a4a, 0x7a8a52] }), // 下院东边的果园
    ...clumps('dd', [[160, 1660, 40], [140, 1460, 32]], { dead: true }), // 墓园边的枯树
    ...props('bench', [[880, 1060, 13], [1120, 790, 13]]),
    ...props('barrels', [[1250, 760, 13], [1240, 1520, 13]]), // 食堂后厨、药草房门口
    ...props('crates', [[1640, 760, 16], [1180, 1700, 16]]),
    ...props('brazier', [[945, 1640, 11], [1055, 1640, 11]]), // 山门两边的火盆
    ...props('rubble', [[1950, 1190, 18], [1840, 420, 16]]), // 崖径上塌下来的碎石
  ],
  // 石阶和山门只是画面，人从中间走过去
  arches: [
    { x: 1000, y: 608, along: 'y', half: 42, stone: true }, // 上院大石阶
    { x: 1000, y: 1258, along: 'y', half: 42, stone: true }, // 下院大石阶
    { x: 300, y: 1258, along: 'y', half: 30, stone: true }, // 墓园小石阶（西）
    { x: 1000, y: 1730, along: 'y', half: 40, stone: true }, // 山门
  ],
  flowerbeds: [
    { x: 1260, y: 1020, rx: 80, ry: 30 }, { x: 740, y: 1040, rx: 64, ry: 26 }, // 回廊里的药草畦
    { x: 1400, y: 1640, rx: 90, ry: 30 }, { x: 1260, y: 1420, rx: 50, ry: 22 }, // 下院菜地
  ],
  patches: [
    { x: 420, y: 1500, rx: 110, ry: 40, color: '#6e6450' }, // 墓园里新翻的土
  ],
  hatches: [],
  roads: [
    // 正中的主路：山门一路上到教堂前，在回廊铺地边上断开
    { kind: 'coach', name: '主阶道（下）', half: 34, pts: [[1000, 1800], [1000, 1035]] },
    { kind: 'coach', name: '主阶道（上）', half: 34, pts: [[1000, 765], [1000, 520]] },
    // 三层各一条横路
    { kind: 'lane', name: '上院横路', half: 24, pts: [[300, 520], [1880, 520]] },
    { kind: 'lane', name: '回廊横路（西）', half: 24, pts: [[300, 900], [865, 900]] },
    { kind: 'lane', name: '回廊横路（东）', half: 24, pts: [[1135, 900], [1880, 900]] },
    { kind: 'lane', name: '下院横路', half: 24, pts: [[300, 1560], [1880, 1560]] },
    // 东边崖径：三层都通，绕远但安静；再往北上到石窟
    { kind: 'trail', name: '崖径', half: 18, pts: [[1880, 1560], [1880, 520], [1880, 400], [1820, 330]] },
    // 西边小石阶：回廊下到墓园
    { kind: 'trail', name: '墓园小石阶', half: 16, pts: [[300, 900], [300, 1560]] },
    // 通到门口的小路：都是直的，正对着门
    { kind: 'lane', name: '院长居所门前', half: 16, pts: [[480, 520], [480, 430]] },
    { kind: 'lane', name: '教堂门前', half: 20, pts: [[1250, 520], [1250, 460]] },
    { kind: 'lane', name: '缮写室门前', half: 16, pts: [[560, 900], [560, 852]] },
    { kind: 'lane', name: '食堂门前', half: 16, pts: [[1440, 900], [1440, 852]] },
    { kind: 'lane', name: '药草房门前', half: 16, pts: [[1380, 1560], [1380, 1486]] },
    { kind: 'trail', name: '墓园门前', half: 14, pts: [[440, 1560], [440, 1608]] },
  ],
  houses: [
    { id: 'church', name: '修道院教堂', x: 1110, y: 250, w: 280, h: 210, side: 'bottom', t: 0.5, height: 84, wall: '#c2baa6', roof: '#3e4a4a', floor: 'stone' },
    { id: 'abbot', name: '院长居所', x: 380, y: 270, w: 200, h: 160, side: 'bottom', height: 62, wall: '#a8a292', roof: '#5a4a44', floor: 'carpet' },
    { id: 'hermit', name: '隐修石窟', x: 1700, y: 140, w: 200, h: 150, side: 'bottom', t: 0.6, height: 40, wall: '#7c786c', roof: '#4a4a4a', floor: 'gravel' },
    { id: 'scriptorium', name: '缮写室', x: 420, y: 700, w: 280, h: 152, side: 'bottom', height: 64, wall: '#b8b2a2', roof: '#4a4e58', floor: 'wood' },
    { id: 'refectory', name: '食堂', x: 1300, y: 700, w: 280, h: 152, side: 'bottom', height: 60, wall: '#c2b49a', roof: '#5a4a44', floor: 'tile' },
    { id: 'infirmary', name: '药草房', x: 1280, y: 1340, w: 200, h: 146, side: 'bottom', height: 54, wall: '#b4b29a', roof: '#54604a', floor: 'tile' },
    { id: 'cemetery', name: '墓园', x: 320, y: 1608, w: 240, h: 170, side: 'top', height: 0, wall: '#6a6c62', roof: '#3a3a44', floor: 'gravel' },
  ],
  obstacles: [
    // 两道挡土墙：留出大石阶（正中）、墓园小石阶（西）和崖径（东头）的缺口
    wall('w1', 120, 958, 600), wall('w2', 1042, 1770, 600),
    wall('w3', 120, 270, 1250), wall('w4', 330, 958, 1250), wall('w5', 1042, 1770, 1250),
    { id: 'o1', name: '小礼拜堂', x: 120, y: 120, w: 150, h: 120, height: 66 },
    { id: 'o2', name: '修士宿舍', x: 680, y: 160, w: 140, h: 120, height: 62 },
    { id: 'o4', name: '回廊拱廊', x: 760, y: 980, w: 150, h: 30, height: 40, shape: 'lowwall', low: true },
    { id: 'o5', name: '回廊拱廊', x: 1090, y: 980, w: 150, h: 30, height: 40, shape: 'lowwall', low: true },
    { id: 'o6', name: '酿酒坊', x: 160, y: 960, w: 100, h: 160, height: 54 },
    { id: 'o7', name: '谷仓', x: 420, y: 1330, w: 160, h: 110, height: 58 },
    { id: 'o8', name: '鸡舍', x: 640, y: 1350, w: 140, h: 90, height: 36, roof: '#6a5a44', stripe: '#b8a888', shape: 'stall' },
    { id: 'o9', name: '山门门房', x: 840, y: 1660, w: 80, h: 80, height: 70 },
    { id: 'o10', name: '山门门房', x: 1080, y: 1660, w: 80, h: 80, height: 70 },
    { id: 'o11', name: '晾衣架', x: 660, y: 1100, w: 110, h: 20, height: 26, roof: '#8a8a7c', stripe: '#d8d2c0', shape: 'stall' }, // 背景故事：屋舍间的细绳上晾着衣物
  ],
};
