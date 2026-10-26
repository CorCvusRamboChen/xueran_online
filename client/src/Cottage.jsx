// 夜里的小屋：参考极乐迪斯科开场那间旅馆——一个斜 45° 剖开的房间浮在黑暗里。
// 有画好的位图（assets/art/scenes/cottage-night.webp，天快亮时淡入 cottage-dawn.webp）就用位图，否则用代码画。
// 夜里要行动时你坐在桌边，否则躺在床上睡觉；肖像飘在你头顶。
import { useEffect, useState } from 'react';
import { Portrait, hue } from './util.jsx';
import { SCENE_ART } from './art.js';
import { INK } from './art/TownArt.jsx';

const S = 16.5; const OX = 200; const OY = 112; const H = 6;
const P = (x, y, z = 0) => [OX + (x - y) * S * 0.866, OY + (x + y) * S * 0.5 - z * S];
const pts = (...ps) => ps.map((p) => P(...p).map((v) => v.toFixed(1)).join(',')).join(' ');
const pct = (x, y, z) => { const [px, py] = P(x, y, z); return { left: `${(px / 400) * 100}%`, top: `${(py / 290) * 100}%` }; };

/** 一个盒子：画看得见的三个面（顶、+x 面、+y 面）。 */
function Box({ x, y, z = 0, dx, dy, dz, top, side, front, stroke = INK }) {
  const x1 = x + dx; const y1 = y + dy; const z1 = z + dz;
  return (
    <g stroke={stroke} strokeWidth=".9" strokeLinejoin="round">
      <polygon points={pts([x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1])} fill={side} />
      <polygon points={pts([x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1])} fill={front} />
      <polygon points={pts([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1])} fill={top} />
    </g>
  );
}

// 手绘小屋（4:3，contain 进 400:290 的框，左右各留一点黑边）里床和椅子的位置
const paintSpot = (rx, ry) => ({ left: `${(1 - 290 * 4 / 3 / 400) / 2 * 100 + rx * (290 * 4 / 3 / 400) * 100}%`, top: `${ry * 100}%` });

/** dawn：快天亮了（夜里最后几秒），窗外透进晨光、油灯熄灭。 */
export function Cottage({ p, awake, dead, dawn = false }) {
  const coat = `hsl(${hue(p.id)} 30% 40%)`;
  const bitmap = SCENE_ART['cottage-night'];
  const dawnArt = SCENE_ART['cottage-dawn'];
  // 肖像位置：醒着在桌边椅子上方，睡着在床头上方
  const spot = bitmap ? (awake ? paintSpot(0.69, 0.6) : paintSpot(0.38, 0.47))
    : awake ? pct(7.4, 3.2, 6.4) : pct(1.8, 5.5, 5.6);
  return (
    <div className="cottage">
      {bitmap ? (
        <>
          <img className="cottage-bitmap" src={bitmap} alt="" />
          {dawnArt && <img className={`cottage-bitmap cottage-dawn ${dawn ? 'on' : ''}`} src={dawnArt} alt="" />}
        </>
      ) : (
        <svg className="cottage-art" viewBox="0 0 400 290" aria-hidden="true">
          <defs>
            <radialGradient id="lampLight"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".55" /><stop offset=".5" stopColor="#f29a4a" stopOpacity=".18" /><stop offset="1" stopColor="#f29a4a" stopOpacity="0" /></radialGradient>
            <linearGradient id="moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a9cde0" stopOpacity=".4" /><stop offset="1" stopColor="#a9cde0" stopOpacity="0" /></linearGradient>
            <pattern id="paper" width="6" height="40" patternUnits="userSpaceOnUse"><rect width="6" height="40" fill="#3d4a4c" /><rect width="1" height="40" fill="#465658" /></pattern>
          </defs>

          {/* 地板厚度（剖面） */}
          <polygon points={pts([10, 0, 0], [10, 10, 0], [10, 10, -0.7], [10, 0, -0.7])} fill="#1f1913" stroke={INK} strokeWidth=".8" />
          <polygon points={pts([0, 10, 0], [10, 10, 0], [10, 10, -0.7], [0, 10, -0.7])} fill="#2b2218" stroke={INK} strokeWidth=".8" />
          {/* 两面墙 */}
          <polygon points={pts([0, 0, 0], [0, 10, 0], [0, 10, H], [0, 0, H])} fill="url(#paper)" stroke={INK} />
          <polygon points={pts([0, 0, 0], [0, 10, 0], [0, 10, 2], [0, 0, 2])} fill="#2f3a39" stroke={INK} strokeWidth=".8" />
          <polygon points={pts([0, 0, 0], [10, 0, 0], [10, 0, H], [0, 0, H])} fill="#48585a" stroke={INK} />
          <polygon points={pts([0, 0, 0], [10, 0, 0], [10, 0, 2], [0, 0, 2])} fill="#36423f" stroke={INK} strokeWidth=".8" />
          {[2, 4, 6, 8].map((k) => <polyline key={k} points={pts([k, 0, 2], [k, 0, H])} stroke="#3c4a4b" strokeWidth=".7" />)}
          {/* 窗户 + 月光 */}
          <polygon points={pts([5.5, 0, 2.4], [8.5, 0, 2.4], [8.5, 0, 5.1], [5.5, 0, 5.1])} fill="#8fb4c9" stroke={INK} strokeWidth="1.4" />
          <polyline points={pts([7, 0, 2.4], [7, 0, 5.1])} stroke={INK} strokeWidth="1.2" fill="none" />
          <polyline points={pts([5.5, 0, 3.75], [8.5, 0, 3.75])} stroke={INK} strokeWidth="1.2" fill="none" />
          <circle cx={P(7.9, 0, 4.6)[0]} cy={P(7.9, 0, 4.6)[1]} r="3.2" fill="#eef4f7" />
          <polygon points={pts([5.1, 0, 2.2], [5.6, 0, 2.2], [5.6, 0, 5.4], [5.1, 0, 5.4])} fill="#6b3e34" stroke={INK} strokeWidth=".7" />
          {/* 地板 */}
          <polygon points={pts([0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0])} fill="#5f4a37" stroke={INK} />
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => <polyline key={k} points={pts([0, k, 0], [10, k, 0])} stroke="#4c3a2a" strokeWidth=".7" fill="none" />)}
          <polygon points={pts([5.6, 0.2, 0], [8.4, 0.2, 0], [9.8, 5.2, 0], [7, 5.2, 0])} fill="url(#moon)" />
          {/* 地毯 */}
          <polygon points={pts([3.8, 4.6, 0], [8.2, 4.6, 0], [8.2, 8.4, 0], [3.8, 8.4, 0])} fill="#6e3f34" stroke={INK} strokeWidth=".8" />
          <polygon points={pts([4.3, 5.1, 0], [7.7, 5.1, 0], [7.7, 7.9, 0], [4.3, 7.9, 0])} fill="none" stroke="#a8674f" strokeWidth=".8" />
          {/* 墙上的外套 */}
          <polygon points={pts([0, 2, 5], [0, 3, 5], [0, 3.2, 2.8], [0, 1.8, 2.8])} fill={coat} stroke={INK} strokeWidth=".9" />
          <circle cx={P(0, 2.5, 5.1)[0]} cy={P(0, 2.5, 5.1)[1]} r="1.6" fill={INK} />
          {/* 床 */}
          <Box x={0.2} y={4.4} dx={3.2} dy={5.2} dz={0.9} top="#3d3024" side="#4a3a2c" front="#3a2d22" />
          <Box x={0.35} y={4.6} dx={2.9} dy={4.9} dz={0.35} z={0.9} top="#cfc8b9" side="#b4ad9f" front="#a59f92" />
          <Box x={0.6} y={4.8} dx={2.4} dy={1.1} dz={0.35} z={1.25} top="#ebe6da" side="#d3cdbf" front="#c9c3b5" />
          <Box x={0.3} y={6.2} dx={3.0} dy={3.4} dz={0.25} z={1.25} top="#556a80" side="#455a6e" front="#3d5063" />
          {!awake && !dead && (
            <g>
              <polygon points={pts([0.8, 6.4, 1.5], [2.8, 6.4, 1.5], [2.8, 8.6, 1.7], [0.8, 8.6, 1.7])} fill="#5f7590" stroke={INK} strokeWidth=".7" />
              <circle cx={P(1.8, 5.5, 1.75)[0]} cy={P(1.8, 5.5, 1.75)[1]} r="5" fill="#d9b896" stroke={INK} strokeWidth=".8" />
              <path d={`M${P(1.8, 5.5, 1.75)[0] - 5} ${P(1.8, 5.5, 1.75)[1] - 1} q5 -6 10 0`} fill="#3a2f28" />
            </g>
          )}
          {/* 桌子 + 油灯 + 酒瓶 + 纸 */}
          <Box x={5.7} y={0.3} dx={2.6} dy={1.8} dz={0.18} z={2.2} top="#7a5a3c" side="#5f452e" front="#6b4f35" />
          {[[5.8, 1.9], [8.1, 1.9]].map(([lx, ly]) => <polyline key={lx} points={pts([lx, ly, 0], [lx, ly, 2.2])} stroke={INK} strokeWidth="2" />)}
          <polygon points={pts([6, 1.2, 2.39], [6.9, 1.2, 2.39], [6.9, 1.9, 2.39], [6, 1.9, 2.39])} fill="#efe9da" stroke={INK} strokeWidth=".5" />
          <Box x={7.5} y={0.6} dx={0.3} dy={0.3} dz={0.9} z={2.38} top="#2f4a3a" side="#2a3f33" front="#355a46" />
          <Box x={6.7} y={0.6} dx={0.45} dy={0.45} dz={0.18} z={2.38} top="#8a6a3a" side="#6b5230" front="#7a5c33" />
          <g className="lamp-flame">
            <ellipse cx={P(6.92, 0.82, 2.95)[0]} cy={P(6.92, 0.82, 2.95)[1]} rx="4" ry="6" fill="#ffd27a" stroke={INK} strokeWidth=".8" />
            <ellipse cx={P(6.92, 0.82, 2.95)[0]} cy={P(6.92, 0.82, 2.95)[1] + 1} rx="1.6" ry="2.6" fill="#fff4cf" />
          </g>
          {/* 椅子 */}
          <Box x={6.6} y={2.6} dx={1.4} dy={1.4} dz={0.15} z={1.2} top="#6b4f35" side="#5a412b" front="#5f452e" />
          <Box x={6.6} y={3.85} dx={1.4} dy={0.15} dz={1.6} z={1.35} top="#6b4f35" side="#5a412b" front="#5f452e" />
          {[[6.7, 2.7], [7.9, 2.7], [6.7, 3.9], [7.9, 3.9]].map(([lx, ly]) => <polyline key={`${lx}${ly}`} points={pts([lx, ly, 0], [lx, ly, 1.2])} stroke={INK} strokeWidth="1.6" />)}
          {awake && !dead && (
            <g stroke={INK} strokeWidth=".9">
              <polygon points={pts([6.9, 3.0, 1.35], [7.8, 3.0, 1.35], [7.7, 3.4, 3.2], [7.0, 3.4, 3.2])} fill={coat} />
              <circle cx={P(7.35, 3.2, 3.6)[0]} cy={P(7.35, 3.2, 3.6)[1]} r="5" fill="#d9b896" />
            </g>
          )}
          {/* 墙顶的剖面 */}
          <polyline points={pts([0, 10, H], [0, 0, H], [10, 0, H])} stroke="#0b0d0d" strokeWidth="5" fill="none" strokeLinejoin="round" />
          {/* 灯光 */}
          <circle cx={P(6.9, 0.8, 2.9)[0]} cy={P(6.9, 0.8, 2.9)[1]} r="120" fill="url(#lampLight)" className="lamp-glow" />
        </svg>
      )}
      <div className={`cottage-me ${dead ? 'dead' : ''}`} style={spot}>
        {dead && <span className="stamp">亡</span>}
        <Portrait p={p} size={40} frame="var(--mot)" />
        {!awake && !dead && <span className="zzz">Z z z</span>}
      </div>
    </div>
  );
}

/**
 * 天亮那几秒（服务器公布死讯、念"第 N 天"，然后才开始自由活动）：不再切到集合广场，
 * 而是在自己的小屋里醒来：夜里的小屋慢慢淡成清晨。
 */
export function DawnWake({ p, dead }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  return (
    <div className={`dawn-wake ${on ? 'on' : ''}`}>
      <Cottage p={p} awake dead={dead} dawn={on} />
    </div>
  );
}
