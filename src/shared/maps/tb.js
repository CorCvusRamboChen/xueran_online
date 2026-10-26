// 暗流涌动：暴雪夜里的海港小镇。钟楼广场居中，网格街道，南边是结冰的海和一条码头。
export default {
  id: 'tb',
  name: '钟楼广场',
  place: '钟楼镇 · 位于暗流涌动区',
  w: 1800, h: 1400,
  gather: { x: 900, y: 640, r: 150 },
  open: [4, 6],
  weather: 'snow',
  // 雾（加立体感，见 World.js 的 buildFog）：雪夜海港的冷雾，比黯月初升淡，免得和暴风雪抢
  fog: { color: 0xbfc9d2, ground: 0.22, haze: 0.26, mist: 0.07 },
  roofSnow: 0.6,
  ground: 'snow',
  // 能走的水面以外的地方：南边 y > 1290 是海，码头上能走
  water: { below: 1290 },
  walkways: [{ id: 'pier', x: 860, y: 1270, w: 80, h: 120, kind: 'pier' }],
  // 走不过去的圆：广场中间的钟楼
  circles: [{ id: 'tower', kind: 'tower', x: 900, y: 640, r: 42 }],
  // 街道（石板路）：折线 + 半宽，只影响画法
  roads: [
    [[900, 0], [900, 1300]],
    [[380, 640], [1460, 640]],
    [[0, 460], [1800, 460]],
    [[0, 1075], [1800, 1075]],
    [[0, 1250], [1800, 1250]],
  ].map((pts) => ({ kind: 'street', half: 34, pts })),
  // 能进去私聊的房子。门都开在看得见的一面（南面 bottom / 东面 right），墓园例外（矮栅栏挡不住）。
  houses: [
    { id: 'tavern', name: '酒馆', x: 500, y: 270, w: 210, h: 150, side: 'bottom', wall: '#a07a48', roof: '#7a3a2a', height: 62, floor: 'wood' },
    { id: 'church', name: '教堂', x: 1100, y: 220, w: 210, h: 180, side: 'bottom', wall: '#b9b2a2', roof: '#3f5a5c', height: 80, floor: 'stone' },
    { id: 'smithy', name: '铁匠铺', x: 470, y: 860, w: 200, h: 150, side: 'right', wall: '#7c7a72', roof: '#45403c', height: 56, floor: 'stone' },
    { id: 'bakery', name: '面包房', x: 1110, y: 860, w: 200, h: 150, side: 'bottom', wall: '#c09a62', roof: '#8a432c', height: 58, floor: 'tile' },
    { id: 'library', name: '图书馆', x: 200, y: 560, w: 180, h: 170, side: 'right', wall: '#7a8460', roof: '#3a4636', height: 66, floor: 'carpet' },
    { id: 'graveyard', name: '墓园', x: 1460, y: 540, w: 220, h: 200, side: 'left', wall: '#6a6c62', roof: '#3a3a44', height: 0, floor: 'gravel' },
  ],
  // 不能进的建筑：[x, y, 宽, 高, 墙高]
  obstacles: [
    [80, 120, 220, 140, 60], [320, 90, 140, 170, 72], [740, 100, 120, 140, 56], [940, 80, 130, 160, 66],
    [1350, 110, 200, 150, 60], [1590, 260, 160, 150, 50],
    [480, 500, 160, 90, 44], [1160, 500, 170, 90, 46],
    [80, 800, 150, 180, 56], [720, 840, 120, 160, 50], [960, 830, 110, 170, 56], [1400, 820, 170, 170, 62], [1620, 800, 140, 200, 50],
    [120, 1115, 300, 95, 56], [480, 1115, 300, 95, 62], [960, 1115, 280, 95, 54], [1320, 1115, 360, 95, 60],
  ].map(([x, y, w, h, height], i) => ({ id: `b${i}`, x, y, w, h, height })),
};
