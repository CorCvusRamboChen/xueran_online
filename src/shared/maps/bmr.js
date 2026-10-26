// 黯月初升：深秋转冬的黄昏，森林边上的驿站小镇。主体是驿道边的黯月旅店；
// 一条溪谷斜穿全镇切成两岸，石桥是大家必经的相遇点，东北的吊板桥小路是绕远的闭环；
// 东南山丘上的破烽火台是主地标。设计说明见 design/bmr-map/ 和 .claude/skills/botc-map-design/。
import LAYOUT from './bmr-layout.js';
import FOG_SPOTS from './bmr-fog.js';
import TONE from './bmr-tone.js';

// 下面的坐标都是按底稿（3280×1760 的那张）写的；整张地图再按 SCALE 放大（见文件末尾 scaleTown）。
const raw = {
  id: 'bmr',
  name: '黯月驿站',
  place: '黯月驿站 · 位于黯月初升区',
  minimap: { ground: '#d8d0bf', road: '#b8a98c' },
  palette: { walls: ['#8e7c66', '#9a8a70', '#7e7262', '#a08c6c', '#86786a'], roofs: ['#4a2e28', '#3e3a36', '#5a3424', '#43403a'] },
  w: 1800, h: 1400,
  // 集合点：旅店门前的驿站广场（开局大家站一圈）
  gather: { x: 650, y: 670, r: 115 },
  open: [5, 7],
  weather: 'leaves',
  // 雾（加立体感，见 World.js 的 buildFog）：黄昏的暖灰雾，沿溪谷和林子边最浓
  // groundMul / topMul：编辑器里摆的贴地雾、盖在房子前面的雾整体再乘一个倍数（淡一点不用一团团改）
  fog: { color: 0xc9c1b4, ground: 0.34, haze: 0.32, mist: 0.08, groundMul: 0.7, topMul: 0.6 },
  roofSnow: 0,
  litHousesOnly: true, // 只有能进的房子亮灯
  ground: 'snow', // 脚步声：踩在落叶上，沙沙的，借用雪地那一套
  // 斜穿全镇的溪谷：折线 + 半宽，走不过去；只有桥上能过（按手绘底图上的水面量的：画上的溪比原来的中线偏南、也更宽）
  water: { band: { half: 53, pts: [[1800, 140], [1570, 293], [1341, 482], [1182, 652], [1020, 803], [828, 915], [607, 1025], [366, 1126], [0, 1258]] } },
  walkways: [
    { id: 'stone', name: '石桥', kind: 'stone', x: 955, y: 730, w: 110, h: 120, deckHalf: 40 },   // 主路，人来人往（相遇引擎）
    { id: 'plank', name: '吊板桥', kind: 'pier', x: 1515, y: 230, w: 95, h: 100, deckHalf: 24 },  // 绕远的安静小路
  ],
  // 走不过去的圆：地标（破烽火台、老井、绞刑架）和树林
  circles: [
    { id: 'beacon', kind: 'beacon', name: '破烽火台', x: 1720, y: 600, r: 50 }, // 东边山丘上；画面上它的背后没有房子，挡不住谁
    { id: 'well', kind: 'well', name: '老井', x: 488, y: 585, r: 18 },
    { id: 'gallows', kind: 'gallows', name: '绞刑架', x: 650, y: 670, r: 22 }, // 驿站广场正中：处刑就在大家集合的地方
    ...[
      // 树林放在房子的"画面前方"以外：等距视角下树冠往上长，靠得太近会挡住后面房子的地面和门口
      [1500, 1300, 80], [1680, 1200, 90], [1330, 1370, 60], [1060, 1320, 55], [420, 1330, 80], [160, 1340, 70],
      [1745, 410, 70], [1760, 800, 60], [40, 420, 60], [985, 1265, 55],
    ].map(([x, y, r], i) => ({ id: `t${i}`, kind: 'trees', x, y, r })),
  ],
  // 道路：只影响画法（石板 / 土路），哪里都能走。路只通到门口，不从任何建筑底下穿过（test/map.test.js 会查）
  roads: [
    // 驿道从西边进镇，到驿站广场断开（广场是一块圆石板地，正中是绞刑架），东边接着走，垂直跨过石桥
    { kind: 'coach', name: '驿道', half: 32, pts: [[0, 745], [320, 745], [440, 700], [540, 688]] },
    { kind: 'coach', name: '驿道', half: 32, pts: [[760, 700], [900, 705], [965, 742], [1050, 838], [1150, 880], [1250, 930], [1560, 940], [1700, 1015], [1800, 1040]] },
    { kind: 'lane', name: '旅店门前', half: 22, pts: [[620, 525], [640, 560]] },
    { kind: 'lane', name: '茶馆街', half: 22, pts: [[745, 605], [900, 598], [985, 575], [1000, 540]] },
    { kind: 'lane', name: '磨坊小路', half: 18, pts: [[600, 780], [575, 865], [553, 870]] },
    { kind: 'lane', name: '工坊巷', half: 18, pts: [[333, 600], [450, 620], [540, 650]] },
    { kind: 'lane', name: '礼拜堂门前', half: 18, pts: [[1430, 872], [1430, 925]] },
    // 墓园小径从驿道上一个干脆的丁字口分出去（离石桥南口远一点），林间小径再从它分到猎人小屋
    { kind: 'trail', name: '墓园小径', half: 16, pts: [[1150, 880], [1030, 960], [1040, 1080], [1078, 1080]] },
    { kind: 'trail', name: '林间小径', half: 16, pts: [[1033, 1000], [920, 1090], [860, 1200], [813, 1235]] },
    // 吊桥小路：从茶馆街分出，沿着溪的北岸往东北走，垂直跨过吊板桥，再从东岸的林子边绕回驿道（和石桥连成一个环）
    { kind: 'trail', name: '吊桥小路', half: 16, pts: [[930, 595], [1110, 585], [1180, 500], [1260, 410], [1360, 320], [1440, 275], [1485, 240], [1530, 240], [1592, 332], [1600, 380], [1600, 450], [1590, 620], [1580, 800], [1565, 935]] },
  ],
  // 能进去私聊的房子（顺序 = 开放顺序：人少开前 5 间，人多 7 间）
  houses: [
    { id: 'inn', name: '黯月旅店', x: 470, y: 330, w: 300, h: 190, side: 'bottom', height: 84, wall: '#8a6a4a', roof: '#4a2a26', floor: 'wood' },
    { id: 'teahouse', name: '茶馆', x: 900, y: 395, w: 200, h: 140, side: 'bottom', height: 54, wall: '#b08a5e', roof: '#6a3a2a', floor: 'carpet' },
    { id: 'mill', name: '溪边磨坊', x: 360, y: 805, w: 190, h: 130, side: 'right', height: 66, wall: '#9a8e78', roof: '#4e4438', floor: 'wood' },
    { id: 'chapel', name: '修道院礼拜堂', x: 1330, y: 700, w: 200, h: 170, side: 'bottom', height: 90, wall: '#a8a294', roof: '#3a3f4a', floor: 'stone' },
    { id: 'crowyard', name: '乌鸦墓园', x: 1080, y: 980, w: 240, h: 200, side: 'left', height: 0, wall: '#5e5a52', roof: '#2e2c30', floor: 'gravel', yard: '#7a6e58' },
    { id: 'workshop', name: '钟表工坊', x: 140, y: 520, w: 190, h: 160, side: 'right', height: 60, wall: '#7a6e5e', roof: '#3e3a36', floor: 'tile' },
    { id: 'lodge', name: '猎人小屋', x: 640, y: 1170, w: 170, h: 130, side: 'right', height: 50, wall: '#6e553c', roof: '#3a3024', floor: 'wood' },
  ],
  // 不能进的建筑
  obstacles: [
    { id: 'stable', name: '马厩', x: 820, y: 210, w: 160, h: 110, height: 44 },
    { id: 'h1', name: '民居', x: 120, y: 200, w: 180, h: 130, height: 58 },
    { id: 'h2', name: '民居', x: 370, y: 110, w: 140, h: 120, height: 62 },
    { id: 'store', name: '杂货铺', x: 1110, y: 190, w: 130, h: 100, height: 52 },
    { id: 'h3', name: '民居', x: 1280, y: 120, w: 150, h: 110, height: 56 },
    { id: 'h4', name: '民居', x: 130, y: 860, w: 170, h: 120, height: 54 },
  ],
};

/**
 * 整张地图放大 SCALE 倍，房子之间更宽松：路、溪、桥、树、普通建筑、集合点都跟着放大（手绘底图也一起拉伸，见 World.js 的 artScale），
 * 7 间能进的房子保持原来的大小（它们的手绘图是按原尺寸画的），只把位置移到放大后的地基中心。
 */
const SCALE = 1.2;
function scaleTown(t, k) {
  const p = ([x, y]) => [Math.round(x * k), Math.round(y * k)];
  const box = (o) => ({ ...o, x: Math.round(o.x * k), y: Math.round(o.y * k), w: Math.round(o.w * k), h: Math.round(o.h * k) });
  return {
    ...t,
    artScale: k,
    w: Math.round(t.w * k), h: Math.round(t.h * k),
    gather: { x: Math.round(t.gather.x * k), y: Math.round(t.gather.y * k), r: Math.round(t.gather.r * k) },
    water: { band: { half: Math.round(t.water.band.half * k), pts: t.water.band.pts.map(p) } },
    walkways: t.walkways.map((w) => ({ ...box(w), deckHalf: Math.round(w.deckHalf * k) })),
    circles: t.circles.map((c) => ({ ...c, x: Math.round(c.x * k), y: Math.round(c.y * k), r: Math.round(c.r * k) })),
    roads: t.roads.map((r) => ({ ...r, half: Math.round(r.half * k), pts: r.pts.map(p) })),
    houses: t.houses.map((h) => placeHouse(h, k, LAYOUT[h.id] ?? {})),
    obstacles: t.obstacles.map((o) => ({ ...box(o), height: Math.round(o.height * k) })),
  };
}

/**
 * 一间能进的房子放到放大后的地图上：中心按 k 放大再加上手动微调（dx, dy）；占地按 open 缩放（室内多大，人就能走多大）。
 * artW / artH 记住原来的占地：手绘图按原占地对齐，再按 closedK / openK 缩放（见 World.js 的 houseArtRect）。
 */
function placeHouse(h, k, { dx = 0, dy = 0, cdx = 0, cdy = 0, closed = 1, open = 1 } = {}) {
  const cx = (h.x + h.w / 2) * k + dx; const cy = (h.y + h.h / 2) * k + dy;
  const w = Math.round(h.w * open); const hh = Math.round(h.h * open);
  // cdx / cdy：外观图在这个位置上再单独挪多少（室内图和能走的地面不动）
  return { ...h, x: Math.round(cx - w / 2), y: Math.round(cy - hh / 2), w, h: hh, artW: h.w, artH: h.h, closedK: closed, openK: open, closedDx: cdx, closedDy: cdy };
}

// 手动摆的地面雾（坐标已经是放大后的，改 SCALE 后要重新摆）
export default { ...scaleTown(raw, SCALE), fogSpots: FOG_SPOTS, tone: TONE };
export { raw as BMR_RAW, SCALE as BMR_SCALE };
