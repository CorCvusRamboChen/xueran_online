// 梦殒春宵：初夏傍晚的鸦木布拉夫，庆典刚开始，按官方背景故事摆（见 design/snv-map/README.md）。
// 环形路网：中间是紫罗兰花园（集合点，也是宴会），四周一圈树篱只留东南西北四个拱门，外面一圈环路把各处连起来。
// 四个分区，地面、路面、脚步声、环境声都不一样：花园（热闹）、花街（北到东，暖）、马戏营地（西到南，旧）、遗迹郊野（东南，冷、静）。
// 拱门是大家必经的相遇点，环路是绕远的替代路。西边的马戏大帐是主地标，东南角的遗迹地窖最偏远。
// 美术需求在 design/codex-snv.md，返工要求在 design/snv-map/art-review-1.md。

const RING = [[1000, 300], [1368, 452], [1520, 820], [1368, 1188], [1000, 1340], [632, 1188], [480, 820], [632, 452]];
const OLD_TENT = { wall: '#b3a68a', stripe: '#c9bb9c', shape: 'tent' };
const props = (kind, list) => list.map(([x, y, r, extra], i) => ({ id: `${kind}${i}`, kind, x, y, r, ...extra }));
const clumps = (id, list, extra) => list.map(([x, y, r], i) => ({ id: `${id}${i}`, kind: 'trees', x, y, r, ...extra }));

export default {
  id: 'snv',
  name: '紫罗兰花园',
  place: '鸦木布拉夫 · 位于梦殒春宵区',
  minimap: { ground: '#a9bb82', road: '#c8bb98' },
  palette: {
    ground: '#86a05e', speck: ['#8a6bb8', '#d98aa8', '#e8d27a', '#6a8a4a'], bed: '#688a4c',
    coach: '#c2b594', lane: '#b9aa88', trail: '#a39272', plaza: '#c8bfae',
    walls: ['#b89a7a', '#c2a988', '#a98e74', '#bfa27e', '#a7987e'], roofs: ['#6a3b4c', '#4e4a6a', '#7a4a3a', '#4a5a4a'],
  },
  treeColors: [0x5f8a4a, 0x7a9e52, 0x4e7a48, 0xd8a0b8],
  w: 2000, h: 1700,
  guide: { x: -1760, y: -160, w: 3820, h: 2080 }, // 比默认底稿大：东南角的遗迹和地窖要整块画进去
  gather: { x: 1000, y: 820, r: 135 },
  walkways: [], // 这张图没有水，也没有桥
  weather: 'petals',
  fog: { color: 0xd8c8c0, ground: 0.14, haze: 0.16, mist: 0.04 },
  fogSpots: [{ x: 1500, y: 1480, a: 2.4 }, { x: 1720, y: 1400, a: 2.4 }, { x: 1880, y: 1420, a: 2 }, { x: 1300, y: 1560, a: 2 }, { x: 1680, y: 1640, a: 2 }],
  roofSnow: 0,
  litHousesOnly: true,
  ground: 'snow', // 脚步声：草地上软软的，借用雪地那一套
  // 分区：一个点算第一个圈住它的区。road 换路面，pave 是路面花纹，surface / roadSurface 是脚步声，wind 是风声大小（1 = 暴风雪）
  zones: [
    { id: 'garden', name: '紫罗兰花园', poly: RING, ground: '#93b565', mini: '#b6cd8a', road: '#d2c8b0', inner: true, surface: 'snow', roadSurface: 'cobble', wind: 0 },
    { id: 'ruin', name: '遗迹郊野', poly: [[1040, 1800], [1000, 1340], [990, 1290], [1340, 1150], [1470, 1100], [2100, 1100], [2100, 1800]], ground: '#6c7a5c', mini: '#8f9a82', road: '#96917f', pave: 'broken', speck: ['#7c7a68', '#5c6450', '#8a8470'], sparse: 0.4, surface: 'gravel', roadSurface: 'stone', wind: 0.4 },
    { id: 'street', name: '花街', poly: [[660, -100], [2100, -100], [2100, 1100], [1470, 1100], [1368, 1188], [1000, 820], [660, 420]], ground: '#90a766', mini: '#b4c088', road: '#cdb99e', pave: 'cobble', paveColor: '#a8927a', surface: 'snow', roadSurface: 'cobble', wind: 0.05 },
    { id: 'camp', name: '马戏营地', poly: [[-100, -100], [660, -100], [660, 420], [1000, 820], [1000, 1340], [1040, 1800], [-100, 1800]], ground: '#a39b62', mini: '#c0b480', road: '#b39a6e', pave: 'ruts', paveColor: '#8a7450', speck: ['#d8c478', '#c4a860', '#7a8a4a'], surface: 'gravel', roadSurface: 'gravel', wind: 0.1 },
  ],
  // 走不过去的圆：喷泉、树篱、遗迹断塔、地图边上的树林，还有路边的小东西
  circles: [
    { id: 'fountain', kind: 'fountain', name: '花园喷泉', x: 1000, y: 820, r: 32 },
    { id: 'ruin', kind: 'ruin', name: '遗迹断塔', x: 1890, y: 1270, r: 50 },
    ...[
      [1075, 600], [1166, 620], [1240, 680], [1270, 745], // 东北段
      [1270, 895], [1240, 960], [1166, 1020], [1075, 1040], // 东南段
      [925, 1040], [834, 1020], [760, 960], [730, 895],    // 西南段
      [730, 745], [760, 680], [834, 620], [925, 600],     // 西北段
    ].map(([x, y], i) => ({ id: `h${i}`, kind: 'trees', hedge: true, x, y, r: 44 })),
    ...clumps('t', [[1500, 40, 50], [1940, 180, 60], [1960, 420, 44], [1960, 800, 44]]), // 花街外面：开花的树
    ...clumps('c', [[60, 180, 70], [190, 50, 50], [430, 44, 44], [36, 1000, 44], [60, 1620, 80], [250, 1650, 56], [500, 1660, 50], [760, 1660, 50]], { colors: [0x56703e, 0x66783e, 0x4a6238] }), // 营地外面：灰扑扑的树
    ...clumps('d', [[1160, 1640, 50], [1340, 1650, 56], [1950, 1560, 44], [1960, 1200, 30]], { dead: true }), // 遗迹外面：枯树
    ...props('sign', [ // 路牌：大路口都有，第一块板朝画面右边、第二块朝左边，指向那个方向的分区，靠颜色认路，不写字
      [1092, 246, 8, { boards: ['#e0b458', '#b03a48'] }],
      [1566, 768, 8, { boards: ['#e0b458', '#7c7a68'] }],
      [962, 1152, 8, { boards: ['#7c7a68', '#b03a48'] }],
      [440, 700, 8, { boards: ['#9a72cc', '#b03a48'] }],
    ]),
    ...props('pole', [[230, 602, 9], [44, 930, 9], [448, 640, 9]]),
    ...props('crates', [[1150, 186, 16], [436, 950, 16], [476, 1256, 16], [660, 1500, 16]]),
    ...props('barrels', [[860, 130, 13], [1180, 150, 13], [420, 1000, 13], [640, 1436, 13]]),
    ...props('bench', [[868, 745, 13], [1118, 898, 13]]),
    ...props('brazier', [[1640, 1668, 11]]),
    ...props('rubble', [[1644, 1390, 20], [1650, 1130, 20], [1490, 1340, 18], [1460, 1670, 18]]),
  ],
  // 拱门只是画面，人从底下穿过去：四个花架拱门，加一道通往遗迹的断石门
  arches: [
    { x: 1000, y: 600, along: 'y', half: 34 },
    { x: 1270, y: 820, along: 'x', half: 34 },
    { x: 1000, y: 1040, along: 'y', half: 34 },
    { x: 730, y: 820, along: 'x', half: 34 },
    { x: 1408, y: 1285, along: 'y', half: 38, stone: true },
  ],
  // 彩旗：大帐顶拉到地上的旗杆，花园的拱门之间（东到南那一段会横穿集合点，不拉）
  garlands: [
    { a: [230, 775, 276], b: [230, 602, 88], onHouse: true }, { a: [230, 775, 276], b: [44, 930, 88], onHouse: true }, { a: [230, 775, 276], b: [448, 640, 88], onHouse: true },
    { a: [1000, 600, 96], b: [1270, 820, 96] }, { a: [1000, 1040, 96], b: [730, 820, 96] }, { a: [730, 820, 96], b: [1000, 600, 96] },
  ],
  // 地面上的花圃（能踩）；dead 是枯掉的，越靠近遗迹花越少
  flowerbeds: [
    { x: 870, y: 700, rx: 72, ry: 40 }, { x: 1130, y: 940, rx: 72, ry: 40 }, { x: 880, y: 900, rx: 40, ry: 22 }, { x: 1120, y: 745, rx: 40, ry: 22 },
    { x: 760, y: 262, rx: 64, ry: 26 }, { x: 1250, y: 340, rx: 70, ry: 30 }, { x: 1560, y: 585, rx: 66, ry: 24 }, { x: 1640, y: 400, rx: 60, ry: 26 }, { x: 1420, y: 960, rx: 44, ry: 24 },
    { x: 1190, y: 1400, rx: 70, ry: 26, dead: true }, { x: 1320, y: 1500, rx: 60, ry: 26, dead: true },
  ],
  // 踩秃的地：大帐门前、营地空地
  patches: [
    { x: 430, y: 775, rx: 72, ry: 110, color: '#b8a878' }, { x: 410, y: 370, rx: 150, ry: 90, color: '#b8a878' }, { x: 560, y: 1390, rx: 90, ry: 60, color: '#b8a878' },
    { x: 1735, y: 780, rx: 96, ry: 70, color: '#a58a62' }, // 钟表铺搬走后的空地：跳秃了的舞池
  ],
  // 通往地下洞穴的暗口：酒馆后面、杂耍小棚旁边、花园里各一个，周围的花枯了一小圈
  hatches: [{ x: 1150, y: 262 }, { x: 544, y: 1282 }, { x: 1190, y: 758 }],
  // 道路只影响画法，哪里都能走（树篱和房子除外）；路只通到门口
  roads: [
    // 环路：一圈路，经过哪个分区就是哪种路面
    { kind: 'coach', name: '环路', half: 30, pts: [...RING, RING[0]] },
    // 四条穿过拱门的路：到集合点那块铺地边上断开
    { kind: 'lane', name: '北拱门', half: 24, pts: [[1000, 300], [1000, 685]] },
    { kind: 'lane', name: '东拱门', half: 24, pts: [[1135, 820], [1520, 820]] },
    { kind: 'lane', name: '南拱门', half: 24, pts: [[1000, 955], [1000, 1340]] },
    { kind: 'lane', name: '西拱门', half: 24, pts: [[480, 820], [865, 820]] },
    // 出南拱门后大家斜着走：一条去杂耍小棚，一条去遗迹
    { kind: 'lane', name: '南门西路', half: 18, pts: [[1000, 1110], [632, 1188]] },
    { kind: 'lane', name: '南门东路', half: 18, pts: [[1000, 1110], [1368, 1188]] },
    // 通到各家门口的小路
    { kind: 'lane', name: '酒馆门前', half: 18, pts: [[1000, 300], [1000, 236]] },
    { kind: 'lane', name: '大帐入口', half: 22, pts: [[480, 820], [446, 775], [398, 775]] },
    { kind: 'lane', name: '画室小路', half: 18, pts: [[1368, 452], [1500, 336]] },
    { kind: 'lane', name: '花房小路', half: 18, pts: [[1444, 636], [1745, 640], [1745, 626]] },
    { kind: 'lane', name: '钟表铺小路', half: 18, pts: [[1520, 820], [1550, 1060], [1685, 1060], [1685, 1046]] },
    { kind: 'lane', name: '小棚小路', half: 18, pts: [[632, 1188], [610, 1370], [526, 1370]] },
    { kind: 'trail', name: '遗迹小径', half: 16, pts: [[1368, 1188], [1404, 1285], [1470, 1400], [1510, 1630], [1680, 1630], [1680, 1616]] },
  ],
  // 能进去私聊的房子
  houses: [
    { id: 'tavern', name: '哲人酒馆', x: 890, y: 60, w: 220, h: 160, side: 'bottom', height: 62, wall: '#a58258', roof: '#6a3b4c', floor: 'wood', flowers: true },
    { id: 'bigtop', name: '马戏大帐', x: 80, y: 650, w: 300, h: 250, side: 'right', height: 70, wall: '#c9b48a', roof: '#a8323f', stripe: '#efe6d2', shape: 'tent', floor: 'carpet' },
    { id: 'studio', name: '画室', x: 1400, y: 170, w: 200, h: 150, side: 'bottom', height: 58, wall: '#c2a988', roof: '#4e4a6a', floor: 'wood', flowers: true },
    { id: 'clockshop', name: '钟表铺', x: 1590, y: 880, w: 190, h: 150, side: 'bottom', height: 60, wall: '#a98e74', roof: '#4a5a4a', floor: 'tile', flowers: true },
    { id: 'greenhouse', name: '花房', x: 1640, y: 470, w: 210, h: 140, side: 'bottom', height: 54, wall: '#a9c2a8', roof: '#6a8a7a', floor: 'tile' },
    { id: 'sideshow', name: '杂耍小棚', x: 300, y: 1290, w: 210, h: 160, side: 'right', height: 50, wall: '#b89a7a', roof: '#7a4a6a', stripe: '#d6c8a6', shape: 'tent', floor: 'carpet' },
    { id: 'crypt', name: '遗迹地窖', x: 1560, y: 1420, w: 240, h: 180, side: 'bottom', height: 0, wall: '#6a6c62', roof: '#2e2c30', floor: 'gravel', yard: '#6e6a58', pit: true },
  ],
  // 不能进的建筑
  obstacles: [
    { id: 'o1', name: '民居', x: 680, y: 90, w: 150, h: 120, height: 56, flowers: true },
    { id: 'o2', name: '民居', x: 1205, y: 60, w: 130, h: 100, height: 52, flowers: true },
    { id: 'o3', name: '旧帐篷', x: 1880, y: 1010, w: 110, h: 80, height: 40, roof: '#7d5a58', ...OLD_TENT },
    { id: 'o4', name: '旧帐篷', x: 90, y: 440, w: 170, h: 130, height: 44, roof: '#6d5f7a', ...OLD_TENT },
    { id: 'o5', name: '小吃摊', x: 720, y: 1470, w: 170, h: 90, height: 40, roof: '#a8323f', stripe: '#efe6d2', shape: 'stall' },
    { id: 'o6', name: '废屋', x: 1090, y: 1460, w: 180, h: 120, height: 54, wall: '#8a8478', roof: '#45434a' },
    { id: 'o7', name: '旧篷车', x: 70, y: 1130, w: 150, h: 100, height: 44, wall: '#8a5a48', roof: '#7a4a6a', stripe: '#c9bb9c', shape: 'wagon' },
    { id: 'o8', name: '旧帐篷', x: 1680, y: 120, w: 140, h: 110, height: 42, roof: '#6a6a50', ...OLD_TENT },
    { id: 'o9', name: '宏伟遗迹', x: 1540, y: 1180, w: 230, h: 150, height: 104, shape: 'ruin' },
    { id: 'o10', name: '宴会长桌', x: 1070, y: 668, w: 120, h: 34, height: 18, shape: 'table' },
    { id: 'o11', name: '宴会长桌', x: 810, y: 938, w: 120, h: 34, height: 18, shape: 'table' },
    { id: 'o12', name: '旧帐篷', x: 300, y: 230, w: 170, h: 130, height: 44, roof: '#7a5a48', ...OLD_TENT },
    { id: 'o13', name: '空兽笼', x: 490, y: 110, w: 120, h: 80, height: 44, wall: '#6a4c34', roof: '#4a4a44', stripe: '#6a6858', shape: 'wagon' },
    // 遗迹外面一圈断墙，和废屋、大殿连成一道，只有断石门能进；大殿和断塔之间的缺口是东边的安静小路
    { id: 'o15', name: '断墙', x: 1270, y: 1278, w: 100, h: 14, height: 30, shape: 'lowwall', low: true },
    { id: 'o16', name: '断墙', x: 1270, y: 1292, w: 14, h: 168, height: 30, shape: 'lowwall', low: true },
    { id: 'o17', name: '断墙', x: 1446, y: 1278, w: 94, h: 14, height: 30, shape: 'lowwall', low: true },
    { id: 'o14', name: '售票亭', x: 530, y: 1540, w: 100, h: 70, height: 40, roof: '#7a4a6a', stripe: '#d6c8a6', shape: 'stall' },
    // 绝望狂欢的摆设，见 design/snv-map/README.md：营地西南空地上停转的旋转木马，北边没人的乐台
    { id: 'o18', name: '旋转木马', x: 280, y: 1040, w: 130, h: 130, height: 34, roof: '#7d5a58', ...OLD_TENT },
    { id: 'o19', name: '乐台', x: 530, y: 260, w: 110, h: 80, height: 34, roof: '#6d5f7a', stripe: '#c9bb9c', shape: 'stall' },
  ],
};
