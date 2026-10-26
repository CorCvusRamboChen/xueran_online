// 小镇的 SVG 美术：参考极乐迪斯科游戏内世界地图——灰青线稿建筑、白色积雪、深色墨线。
// 大厅的小镇插画和座位圈直接当 SVG 用（房子拆成三层：地板和室内、屋顶、南墙和门）；
// 白天的斜视角小镇（world/）把摆设和室内陈设栅格化成贴图来用。

export const INK = '#1d2524';
const C = {
  void: '#a9a59c', land: '#e7e6e0', snow: '#f4f4f0', street: '#d3d1c9', cobble: '#c9c6bd',
  roofHi: '#8aa3a0', roofLo: '#647e7b', wall: '#b9c6c2', wallDark: '#93a6a2', win: '#2d3a3a',
  floor: '#d9d1c1', wood: '#8b6b4a', tree: '#6f8f86', treeDark: '#4f6c64',
};
const WALL_H = 26;
const D = 8; // 东侧墙面的进深

/** 钟楼脚下的三层圆台阶（贴在地面上；钟楼本身单独一张图）。 */
export function PlazaSteps({ x, y, r }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r - 10} fill="none" stroke="#7d8380" strokeWidth="1.2" strokeDasharray="3 3" />
      {[44, 36, 28].map((rr, i) => (
        <g key={rr}>
          <circle cx={x} cy={y + 3} r={rr} fill="#9d9a90" />
          <circle cx={x} cy={y} r={rr} fill={['#dcdad2', '#e4e2db', '#eceae4'][i]} stroke={INK} strokeWidth="1.1" />
        </g>
      ))}
    </g>
  );
}

export function ClockTower({ x, y }) {
  const w = 26; const top = y - 74; const base = y + 10;
  return (
    <g stroke={INK} strokeWidth="1.3" strokeLinejoin="round">
      <ellipse cx={x} cy={base + 2} rx="20" ry="5" fill="#000" opacity=".18" stroke="none" />
      {/* 塔身：正面 + 右侧面 */}
      <rect x={x - w / 2} y={top + 22} width={w} height={base - top - 22} fill={C.wall} />
      <polygon points={`${x + w / 2},${top + 22} ${x + w / 2 + 8},${top + 16} ${x + w / 2 + 8},${base - 6} ${x + w / 2},${base}`} fill={C.wallDark} />
      {[0.42, 0.62, 0.82].map((k) => <line key={k} x1={x - w / 2} y1={top + 22 + (base - top - 22) * k} x2={x + w / 2} y2={top + 22 + (base - top - 22) * k} strokeWidth=".6" />)}
      <rect x={x - 4} y={base - 14} width="8" height="14" fill={C.win} />
      {/* 钟面 */}
      <circle cx={x} cy={top + 34} r="9" fill="#f2efe6" />
      <path d={`M${x} ${top + 34} V${top + 28} M${x} ${top + 34} L${x + 5} ${top + 36}`} strokeWidth="1.4" />
      {/* 尖顶 */}
      <polygon points={`${x - w / 2 - 3},${top + 22} ${x + w / 2 + 3},${top + 22} ${x},${top - 8}`} fill={C.roofLo} />
      <polygon points={`${x + w / 2 + 3},${top + 22} ${x + w / 2 + 10},${top + 16} ${x},${top - 8}`} fill={C.roofHi} />
      <line x1={x} y1={top - 8} x2={x} y2={top - 18} />
      <circle cx={x} cy={top - 20} r="2" fill={INK} />
    </g>
  );
}

export function Tree({ x, y }) {
  return (
    <g stroke={INK} strokeWidth="1.1">
      <ellipse cx={x + 3} cy={y + 13} rx="11" ry="3.5" fill="#000" opacity=".15" stroke="none" />
      <line x1={x} y1={y + 12} x2={x} y2={y + 2} strokeWidth="2" />
      <circle cx={x - 6} cy={y - 2} r="8" fill={C.treeDark} />
      <circle cx={x + 6} cy={y - 3} r="8" fill={C.treeDark} />
      <circle cx={x} cy={y - 9} r="9" fill={C.tree} />
      <path d={`M${x - 5} ${y - 12} q4 -3 8 0`} fill="none" stroke="#f4f4f0" strokeWidth="1.2" />
    </g>
  );
}
export const Lamp = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1">
    <line x1={x} y1={y} x2={x} y2={y - 22} strokeWidth="1.8" />
    <rect x={x - 3.5} y={y - 29} width="7" height="8" fill="#f3d48a" className="lamp" />
    <path d={`M${x - 4.5} ${y - 29} h9 l-4.5 -3z`} fill={INK} />
  </g>
);
export const MAP_COLORS = C;

export const Bench = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1">
    <rect x={x} y={y} width="26" height="5" fill={C.wood} />
    <rect x={x} y={y - 6} width="26" height="3" fill={C.wood} />
    <line x1={x + 3} y1={y + 5} x2={x + 3} y2={y + 9} /><line x1={x + 23} y1={y + 5} x2={x + 23} y2={y + 9} />
  </g>
);
export const Fence = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1">
    <line x1={x} y1={y} x2={x + 46} y2={y} />
    {[0, 12, 24, 36, 46].map((k) => <line key={k} x1={x + k} y1={y} x2={x + k} y2={y + 6} />)}
  </g>
);
export const Notice = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1">
    <rect x={x} y={y} width="22" height="16" fill="#efe9da" />
    <path d={`M${x + 4} ${y + 5}h14M${x + 4} ${y + 9}h10M${x + 4} ${y + 13}h12`} strokeWidth=".6" />
    <line x1={x + 2} y1={y + 16} x2={x + 2} y2={y + 24} strokeWidth="1.6" /><line x1={x + 20} y1={y + 16} x2={x + 20} y2={y + 24} strokeWidth="1.6" />
  </g>
);
export const Well = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round">
    <ellipse cx={x} cy={y + 8} rx="11" ry="5" fill="#9d9a90" />
    <ellipse cx={x} cy={y + 4} rx="11" ry="5" fill="#cfcbbf" />
    <ellipse cx={x} cy={y + 4} rx="6" ry="2.6" fill="#3f4d4c" />
    <path d={`M${x - 9} ${y + 3} v-14 M${x + 9} ${y + 3} v-14`} strokeWidth="1.6" />
    <polygon points={`${x - 13},${y - 10} ${x + 13},${y - 10} ${x},${y - 19}`} fill={C.roofLo} />
  </g>
);
export const Stall = ({ x, y, flip }) => (
  <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round" transform={flip ? `translate(${2 * x + 34} 0) scale(-1 1)` : undefined}>
    <rect x={x} y={y} width="34" height="12" fill="#a98a62" />
    <path d={`M${x + 3} ${y + 12} v6 M${x + 31} ${y + 12} v6`} strokeWidth="1.4" />
    {[0, 1, 2, 3].map((k) => <rect key={k} x={x - 2 + k * 9.5} y={y - 10} width="9.5" height="9" fill={k % 2 ? '#e7e6e0' : '#6f8f86'} />)}
    <path d={`M${x - 2} ${y - 1} h38`} strokeWidth="1.3" />
    <circle cx={x + 9} cy={y + 4} r="3" fill="#c9773a" /><circle cx={x + 17} cy={y + 4} r="3" fill="#b5563f" /><circle cx={x + 25} cy={y + 4} r="3" fill="#d9b44a" />
  </g>
);
export const Crate = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1"><rect x={x} y={y} width="12" height="10" fill="#a98a62" /><path d={`M${x} ${y} l12 10 M${x + 12} ${y} l-12 10`} strokeWidth=".6" /></g>
);
export const Barrel = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1"><ellipse cx={x} cy={y + 8} rx="5.5" ry="2.5" fill={C.wood} /><rect x={x - 5.5} y={y} width="11" height="8" fill={C.wood} stroke="none" />
    <line x1={x - 5.5} y1={y} x2={x - 5.5} y2={y + 8} /><line x1={x + 5.5} y1={y} x2={x + 5.5} y2={y + 8} />
    <ellipse cx={x} cy={y} rx="5.5" ry="2.5" fill="#a5835c" /><line x1={x - 5.5} y1={y + 4} x2={x + 5.5} y2={y + 4} strokeWidth=".6" /></g>
);
export const Cart = ({ x, y }) => (
  <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round">
    <rect x={x} y={y} width="30" height="14" fill="#a98a62" />
    <path d={`M${x} ${y + 5}h30M${x} ${y + 10}h30`} strokeWidth=".6" />
    <line x1={x + 30} y1={y + 10} x2={x + 44} y2={y + 14} strokeWidth="1.6" />
    <circle cx={x + 8} cy={y + 16} r="5" fill={C.land} /><circle cx={x + 8} cy={y + 16} r="1" fill={INK} />
  </g>
);

/** 一栋房子（大厅里的 SVG 用）：三层叠起来。 */
export function House({ h, open, mine, locked }) {
  return (
    <g>
      <HouseFloor h={h} />
      <HouseRoof h={h} open={open} />
      <HouseFront h={h} locked={locked} mine={mine} />
    </g>
  );
}

const wallYOf = (h) => h.y + h.h - WALL_H;

/** 第一层：投影、地板、室内陈设、东侧墙面。墓园是整块地面。 */
export function HouseFloor({ h }) {
  if (h.id === 'graveyard') return <GraveyardGround h={h} />;
  const { x, y, w } = h;
  const hh = h.h;
  const wallY = wallYOf(h);
  return (
    <g strokeLinejoin="round">
      <rect x={x + 6} y={y + 8} width={w} height={hh} fill="#000" opacity=".16" />
      <rect x={x} y={y} width={w} height={hh} fill="url(#planks)" stroke={INK} strokeWidth="1.2" />
      <Interior h={h} />
      {/* 东侧墙面：斜着往右上退，给房子厚度 */}
      <polygon points={`${x + w},${wallY} ${x + w + D},${wallY - D * 0.7} ${x + w + D},${y + hh - D * 0.7} ${x + w},${y + hh}`} fill={C.wallDark} stroke={INK} strokeWidth="1.2" />
    </g>
  );
}

/** 第二层：屋顶（墓园没有）。open：有人在里面，屋顶淡掉露出室内。 */
export function HouseRoof({ h, open, smoke = true }) {
  if (h.id === 'graveyard') return null;
  const { x, y, w } = h;
  const wallY = wallYOf(h);
  const ridge = y + (wallY - y) * 0.42;
  return (
    <g className={`roof ${open ? 'open' : ''}`} stroke={INK} strokeWidth="1.3" strokeLinejoin="round">
      <polygon points={`${x + w + 4},${y} ${x + w + 4 + D},${y - D * 0.7} ${x + w + 4 + D},${wallY - D * 0.7} ${x + w + 4},${wallY}`} fill="#56706d" />
      <polygon points={`${x - 4},${y} ${x + w + 4},${y} ${x + w + 4},${ridge} ${x - 4},${ridge}`} fill={C.roofHi} />
      <polygon points={`${x - 4},${ridge} ${x + w + 4},${ridge} ${x + w + 4},${wallY} ${x - 4},${wallY}`} fill={C.roofLo} />
      {roofLines(x - 4, y, w + 8, ridge, wallY)}
      {/* 屋脊上的积雪 */}
      <path d={`M${x + 6} ${y + 3} q${w * 0.2} 5 ${w * 0.42} 1 q${w * 0.15} -3 ${w * 0.3} 2 L${x + w - 4} ${y + 9} L${x + 6} ${y + 9}Z`} fill="#f4f4f0" strokeWidth=".7" />
      <path d={`M${x - 2} ${wallY - 4} q${w * 0.3} -4 ${w * 0.5} 0 q${w * 0.2} 3 ${w * 0.5} -1 v4 h-${w + 4}Z`} fill="#f4f4f0" strokeWidth=".7" />
      <line x1={x - 4} y1={ridge} x2={x + w + 4} y2={ridge} strokeWidth="2.2" />
      {(h.id === 'tavern' || h.id === 'library') && <Dormer x={x + w * 0.3} y={ridge + 3} />}
      <Chimney x={x + w * 0.72} y={y + 6} smoke={smoke && (h.id === 'smithy' || h.id === 'bakery')} />
      {h.id === 'church' && <Steeple x={x + w * 0.24} y={wallY} />}
    </g>
  );
}

/** 第三层：南墙、窗、招牌、门和锁。 */
export function HouseFront({ h, locked, mine }) {
  if (h.id === 'graveyard') return <GraveyardFront h={h} locked={locked} mine={mine} />;
  const { x, w } = h;
  const wallY = wallYOf(h);
  const doorFront = h.side === 'bottom';
  const windows = [];
  for (let k = 0; k < Math.floor((w - 20) / 26); k++) windows.push(x + 14 + k * 26);
  return (
    <g strokeLinejoin="round">
      <rect x={x} y={wallY} width={w} height={WALL_H} fill={C.wall} stroke={INK} strokeWidth="1.3" />
      <line x1={x} y1={wallY + 3} x2={x + w} y2={wallY + 3} stroke={INK} strokeWidth=".5" />
      {windows.filter((wx) => !doorFront || Math.abs(wx + 5 - h.door.x) > 16).map((wx) => (
        <g key={wx} stroke={INK} strokeWidth=".9">
          <rect x={wx} y={wallY + 7} width="10" height="12" fill={C.win} className="window" />
          <line x1={wx + 5} y1={wallY + 7} x2={wx + 5} y2={wallY + 19} strokeWidth=".5" stroke="#6f8582" />
          <line x1={wx - 1} y1={wallY + 20} x2={wx + 11} y2={wallY + 20} stroke="#f4f4f0" strokeWidth="1.2" />
        </g>
      ))}
      <Sign h={h} wallY={wallY} />
      {doorFront && <Lantern x={h.door.x + 14} y={wallY + 6} />}
      <Door h={h} locked={locked} />
      {mine && <rect x={x - 3} y={h.y - 3} width={w + 6} height={h.h + 6} fill="none" stroke="#e2b52c" strokeWidth="2.5" strokeDasharray="8 4" />}
    </g>
  );
}

function roofLines(x, y, w, ridge, bottom) {
  const lines = [];
  for (let yy = y + 6; yy < ridge - 2; yy += 6) lines.push(<line key={`a${yy}`} x1={x} y1={yy} x2={x + w} y2={yy} strokeWidth=".45" opacity=".7" />);
  for (let yy = ridge + 6; yy < bottom - 2; yy += 6) lines.push(<line key={`b${yy}`} x1={x} y1={yy} x2={x + w} y2={yy} strokeWidth=".45" opacity=".7" />);
  for (let xx = x + 8; xx < x + w; xx += 16) lines.push(<line key={`c${xx}`} x1={xx} y1={ridge + 2} x2={xx + 3} y2={bottom} strokeWidth=".35" opacity=".5" />);
  return lines;
}

const Dormer = ({ x, y }) => (
  <g>
    <polygon points={`${x},${y + 14} ${x},${y + 4} ${x + 9},${y - 2} ${x + 18},${y + 4} ${x + 18},${y + 14}`} fill={C.wall} />
    <rect x={x + 5} y={y + 5} width="8" height="8" fill={C.win} className="window" />
    <polyline points={`${x - 2},${y + 5} ${x + 9},${y - 3} ${x + 20},${y + 5}`} fill="none" strokeWidth="2" />
  </g>
);
const Lantern = ({ x, y }) => (
  <g strokeWidth=".9">
    <line x1={x} y1={y} x2={x + 5} y2={y} />
    <rect x={x + 3} y={y} width="5" height="7" fill="#f3d48a" className="lamp" />
  </g>
);

const Chimney = ({ x, y, smoke }) => (
  <g>
    <rect x={x} y={y} width="12" height="9" fill={C.wallDark} />
    <rect x={x} y={y + 9} width="12" height="7" fill={C.wall} />
    <rect x={x - 1} y={y - 2} width="14" height="3" fill={INK} />
    {smoke && (
      <g className="smoke" stroke="none" fill="#f4f4f0">
        <circle cx={x + 6} cy={y - 8} r="4" /><circle cx={x + 10} cy={y - 16} r="5.5" /><circle cx={x + 4} cy={y - 24} r="6.5" opacity=".7" />
      </g>
    )}
  </g>
);

const Steeple = ({ x, y }) => (
  <g>
    <rect x={x - 11} y={y - 40} width="22" height="40" fill={C.wall} />
    <rect x={x - 4} y={y - 30} width="8" height="12" fill={C.win} rx="4" />
    <polygon points={`${x - 14},${y - 40} ${x + 14},${y - 40} ${x},${y - 72}`} fill={C.roofLo} />
    <polygon points={`${x},${y - 72} ${x + 14},${y - 40} ${x + 20},${y - 44}`} fill={C.roofHi} />
    <path d={`M${x} ${y - 72} v-10 M${x - 4} ${y - 78} h8`} strokeWidth="1.6" />
  </g>
);

/** 门：南门画在墙上；北门/侧门画成门廊台阶。锁上了就挂锁 + 链子。 */
function Door({ h, locked }) {
  const { door } = h;
  const front = h.side === 'bottom';
  if (front) {
    const x = door.x - 8; const y = door.y - 20;
    return (
      <g stroke={INK} strokeWidth="1.1">
        <rect x={x - 3} y={y - 3} width="22" height="23" fill={C.wallDark} />
        <rect x={x} y={y} width="16" height="20" fill={locked ? '#5a3f2a' : '#3a2e26'} />
        <rect x={x - 4} y={y + 20} width="24" height="3" fill="#cfcbbf" />
        {locked && <Padlock x={door.x} y={y + 11} chain="h" />}
      </g>
    );
  }
  // 门廊：伸出去的台阶 + 小雨棚
  const len = 14;
  const horizontal = door.nx === 0;
  const px = horizontal ? door.x - 12 : door.nx > 0 ? door.x : door.x - len;
  const py = horizontal ? (door.ny < 0 ? door.y - len : door.y) : door.y - 12;
  const pw = horizontal ? 24 : len;
  const ph = horizontal ? len : 24;
  return (
    <g stroke={INK} strokeWidth="1.1">
      <rect x={px} y={py} width={pw} height={ph} fill="#d8d4c8" />
      {horizontal
        ? [4, 8, 12].map((k) => <line key={k} x1={px} y1={py + (door.ny < 0 ? k : ph - k)} x2={px + pw} y2={py + (door.ny < 0 ? k : ph - k)} strokeWidth=".5" />)
        : [4, 8, 12].map((k) => <line key={k} x1={px + (door.nx > 0 ? k : pw - k)} y1={py} x2={px + (door.nx > 0 ? k : pw - k)} y2={py + ph} strokeWidth=".5" />)}
      <rect x={horizontal ? door.x - 8 : door.x - 2} y={horizontal ? door.y - 2 : door.y - 8} width={horizontal ? 16 : 4} height={horizontal ? 4 : 16} fill={locked ? '#5a3f2a' : '#3a2e26'} />
      {h.id === 'bakery' && <Awning x={door.x - 20} y={door.y - 2} />}
      {h.id === 'library' && <g fill={C.land}><rect x={door.x + 2} y={door.y - 16} width="4" height="4" /><rect x={door.x + 2} y={door.y + 12} width="4" height="4" /></g>}
      {h.id === 'smithy' && <Anvil x={door.x + 22} y={door.y - 14} />}
      {locked && <Padlock x={door.x + (horizontal ? 0 : door.nx * 7)} y={door.y + (horizontal ? door.ny * 7 : 0)} chain={horizontal ? 'h' : 'v'} />}
    </g>
  );
}

const Awning = ({ x, y }) => (
  <g>
    {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={x + k * 8} y={y - 10} width="8" height="9" fill={k % 2 ? '#e7e6e0' : '#b5563f'} />)}
    <path d={`M${x} ${y - 1} h40`} strokeWidth="1.4" />
  </g>
);
const Anvil = ({ x, y }) => (
  <g><path d={`M${x} ${y} h14 l-3 4 h-8z`} fill="#4a5452" /><rect x={x + 4} y={y + 4} width="6" height="5" fill="#4a5452" /></g>
);

function Padlock({ x, y, chain }) {
  return (
    <g className="padlock" stroke={INK} strokeWidth="1.1">
      {chain === 'h'
        ? <path d={`M${x - 9} ${y - 2} q9 7 18 0`} fill="none" strokeWidth="1.6" strokeDasharray="2 1.5" />
        : <path d={`M${x - 2} ${y - 9} q7 9 0 18`} fill="none" strokeWidth="1.6" strokeDasharray="2 1.5" />}
      <path d={`M${x - 3} ${y + 1} v-3 a3 3 0 0 1 6 0 v3`} fill="none" strokeWidth="1.5" />
      <rect x={x - 4.5} y={y + 1} width="9" height="7" fill="#c9a24a" />
      <rect x={x - .7} y={y + 3} width="1.4" height="3" fill={INK} stroke="none" />
    </g>
  );
}

function Sign({ h, wallY }) {
  const signs = { tavern: '酒', smithy: '铁', bakery: '面', library: '书' };
  if (!signs[h.id]) return null;
  const x = h.x + 8;
  return (
    <g stroke={INK} strokeWidth="1">
      <line x1={x} y1={wallY + 4} x2={x} y2={wallY + 10} />
      <rect x={x - 6} y={wallY + 10} width="12" height="12" fill="#efe9da" />
      <text x={x} y={wallY + 20} textAnchor="middle" fontSize="9" fontWeight="900" fill={INK} stroke="none">{signs[h.id]}</text>
    </g>
  );
}

/** 室内陈设：屋顶透明后看得到。 */
export function Interior({ h }) {
  const { x, y, w } = h;
  const hh = h.h - WALL_H;
  const items = {
    tavern: <g><rect x={x + 10} y={y + 10} width={w - 20} height="10" fill={C.wood} /><circle cx={x + 34} cy={y + 52} r="9" fill="#a98a62" /><circle cx={x + 90} cy={y + 52} r="9" fill="#a98a62" /></g>,
    church: <g>{[0, 1, 2].map((k) => <rect key={k} x={x + 20} y={y + 22 + k * 16} width={w - 40} height="6" fill={C.wood} />)}<rect x={x + w / 2 - 10} y={y + 6} width="20" height="8" fill="#efe9da" /></g>,
    smithy: <g><rect x={x + 10} y={y + 10} width="26" height="20" fill="#5a4a42" /><circle cx={x + 23} cy={y + 20} r="5" fill="#d9773a" /><Anvil x={x + 70} y={y + 30} /></g>,
    bakery: <g><rect x={x + 10} y={y + 10} width="30" height="22" fill="#9a7b5a" /><rect x={x + 60} y={y + 14} width={w - 74} height="10" fill={C.wood} /></g>,
    library: <g>{[0, 1, 2].map((k) => <rect key={k} x={x + 8} y={y + 8 + k * 20} width={w - 40} height="8" fill="#7a5f45" />)}</g>,
    // 黯月初升
    inn: <g><rect x={x + 12} y={y + 10} width="40" height="16" fill="#5a4a42" /><circle cx={x + 32} cy={y + 18} r="5" fill="#d9773a" /><rect x={x + 70} y={y + 60} width={w - 110} height="16" fill={C.wood} />{[0, 1, 2, 3].map((k) => <circle key={k} cx={x + 84 + k * 44} cy={y + 90} r="7" fill="#a98a62" />)}<rect x={x + w - 34} y={y + 10} width="22" height="60" fill="#7a5f45" /></g>,
    teahouse: <g><rect x={x + 12} y={y + 10} width="26" height="18" fill="#5a4a42" /><circle cx={x + 25} cy={y + 19} r="4" fill="#d9773a" />{[0, 1, 2, 3].map((k) => <rect key={k} x={x + 56 + k * 18} y={y + 10} width="10" height="12" fill="#b08a5e" />)}<rect x={x + 60} y={y + 56} width="30" height="26" rx="6" fill="#8a3a2a" /><rect x={x + 100} y={y + 56} width="30" height="26" rx="6" fill="#8a3a2a" /></g>,
    mill: <g><circle cx={x + 50} cy={y + 50} r="26" fill="#9a958a" /><circle cx={x + 50} cy={y + 50} r="6" fill="#5a554c" />{[0, 1, 2].map((k) => <ellipse key={k} cx={x + 110 + k * 22} cy={y + 30} rx="9" ry="12" fill="#c8b48a" />)}</g>,
    chapel: <g>{[0, 1, 2].map((k) => <rect key={k} x={x + 24} y={y + 40 + k * 18} width={w - 48} height="6" fill={C.wood} />)}<rect x={x + w / 2 - 14} y={y + 8} width="28" height="12" fill="#efe9da" /><rect x={x + w / 2 - 2} y={y + 4} width="4" height="18" fill="#7a5f45" /></g>,
    workshop: <g><rect x={x + 10} y={y + 10} width={w - 40} height="14" fill={C.wood} />{[0, 1, 2, 3].map((k) => <circle key={k} cx={x + 26 + k * 34} cy={y + 17} r="5" fill="#d8c48a" />)}<circle cx={x + 40} cy={y + 70} r="14" fill="none" stroke="#b08a3a" strokeWidth="3" /><circle cx={x + 64} cy={y + 80} r="9" fill="none" stroke="#b08a3a" strokeWidth="3" /></g>,
    lodge: <g><rect x={x + 12} y={y + 12} width="30" height="20" fill="#5a4a42" /><ellipse cx={x + 90} cy={y + 60} rx="30" ry="16" fill="#8a6a4a" /><rect x={x + 30} y={y + 70} width="40" height="10" fill={C.wood} /></g>,
  }[h.id];
  return <g stroke={INK} strokeWidth=".8" opacity=".9">{items}<rect x={x} y={y} width={w} height={hh + WALL_H} fill="none" /></g>;
}

/** 墓园：没有屋顶，一圈铁栅栏、几块墓碑、一棵枯树、一座小墓室。 */
function GraveyardGround({ h }) {
  const { x, y, w } = h;
  const hh = h.h;
  const pickets = [];
  for (let px = x; px <= x + w; px += 6) pickets.push(px);
  return (
    <g stroke={INK} strokeWidth="1">
      <rect x={x} y={y} width={w} height={hh} fill="#dedcd4" />
      <rect x={x} y={y} width={w} height={hh} fill="url(#grain)" />
      {[[x + 26, y + 30], [x + 52, y + 30], [x + 78, y + 30], [x + 26, y + 66], [x + 52, y + 66], [x + 90, y + 72]].map(([tx, ty]) => (
        <g key={`${tx}${ty}`}>
          <path d={`M${tx} ${ty + 14} v-10 a5 5 0 0 1 10 0 v10z`} fill="#b7c0bd" />
          <rect x={tx + 10} y={ty + 4} width="3" height="10" fill="#8d9895" />
          <ellipse cx={tx + 5} cy={ty + 16} rx="7" ry="2" fill={C.snow} />
        </g>
      ))}
      <g><rect x={x + w - 30} y={y + 8} width="22" height="18" fill={C.wall} /><polygon points={`${x + w - 32},${y + 8} ${x + w - 6},${y + 8} ${x + w - 19},${y - 4}`} fill={C.roofLo} /><rect x={x + w - 23} y={y + 16} width="8" height="10" fill={C.win} /></g>
      <path d={`M${x + 100} ${y + 104} v-24 M${x + 100} ${y + 90} l-8 -8 M${x + 100} ${y + 84} l7 -9`} strokeWidth="1.8" fill="none" />
      {/* 栅栏（门口留空） */}
      {pickets.map((px) => <line key={`t${px}`} x1={px} y1={y} x2={px} y2={y - 6} />)}
      {pickets.map((px) => <line key={`b${px}`} x1={px} y1={y + hh} x2={px} y2={y + hh - 6} />)}
      <line x1={x} y1={y - 3} x2={x + w} y2={y - 3} /><line x1={x} y1={y + hh - 3} x2={x + w} y2={y + hh - 3} />
      <line x1={x + w} y1={y} x2={x + w} y2={y + hh} strokeWidth="2" />
      <line x1={x} y1={y} x2={x} y2={h.door.y - 16} strokeWidth="2" /><line x1={x} y1={h.door.y + 16} x2={x} y2={y + hh} strokeWidth="2" />
    </g>
  );
}
function GraveyardFront({ h, locked, mine }) {
  const { x, y, w } = h;
  return (
    <g>
      <Door h={h} locked={locked} />
      {mine && <rect x={x - 3} y={y - 9} width={w + 6} height={h.h + 12} fill="none" stroke="#e2b52c" strokeWidth="2.5" strokeDasharray="8 4" />}
    </g>
  );
}
