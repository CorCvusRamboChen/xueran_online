// 钟楼广场（座位圈）：和小镇地图同一套线稿画风——石板圆场、三层圆台阶、钟楼；
// 大家的方形肖像围成一圈。投票时一根指针从钟楼指向正在投票的人。夜里整幅画压暗成深青色。
import { useLayoutEffect, useRef, useState } from 'react';
import { Portrait } from './util.jsx';
import { useMarks, TAGS, MarkMenu, MarkBadge } from './marks.jsx';
import { ClockTower, Tree, Lamp, MAP_COLORS as C, INK } from './art/TownArt.jsx';
import { SCENE_ART } from './art.js';

// 手绘广场（白天 / 夜里两张同构图，夜里淡入）；没有就用线稿
const PAINT_DAY = SCENE_ART['square-day'];
const PAINT_NIGHT = SCENE_ART['square-night'];

export function Town({ s, picked = [], pickable = null, onTap, children }) {
  const ref = useRef(null);
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const n = s.players.length;
  // 竖屏人多时把圆拉成竖椭圆，用上下的空白
  const tall = n > 9 && window.innerHeight > window.innerWidth * 1.2 ? 1.25 : 1;
  const h = w * tall;
  const tk = Math.round(Math.min(52, Math.max(28, ((w * Math.PI * 0.78 * (1 + tall) / 2) / n) * 0.38)));
  const Rx = 50 - ((tk / 2 + 18) / w) * 100;
  const Ry = 50 - ((tk * 0.6 + 26) / h) * 100;
  const rad = (i) => ((-90 + (i * 360) / n) * Math.PI) / 180;
  const vote = s.vote;
  const voterIdx = vote && vote.idx >= 0 ? s.players.findIndex((p) => p.id === vote.order[vote.idx]) : -1;
  const yes = new Set(vote?.yes ?? []);
  const locked = new Set(vote?.locked ?? []);
  const inRoom = new Set(s.rooms?.flatMap((r) => r.members) ?? []);
  const night = s.phase === 'night';

  const allies = new Set((s.self?.allies ?? []).map((a) => a.id));
  const marks = useMarks(s);
  const [menu, setMenu] = useState(null); // { id, x, y }
  const menuPlayer = menu && s.players.find((p) => p.id === menu.id);
  const frameOf = (p) => {
    if (picked.includes(p.id)) return '#f2efe6';
    if (allies.has(p.id) && p.evil == null) return 'var(--phy)';
    if (vote?.nominee === p.id || s.block === p.id) return 'var(--phy)';
    if (p.evil != null) return p.evil ? 'var(--phy)' : 'var(--int)';
    if (p.id === s.me) return 'var(--mot)';
    return TAGS[marks[p.id]?.tag]?.color ?? '#f4f4f0';
  };

  // 背景画布 400 × 400·tall，和容器同比例，不会变形
  const VW = 400; const VH = 400 * tall;
  const cx = VW / 2; const cy = VH / 2;
  const pr = Math.min(Rx, Ry * tall) / 100 * VW + 22;

  return (
    <div className={`town ${night ? 'night' : ''} ${PAINT_DAY ? 'painted' : ''}`} ref={ref} style={{ '--tk': `${tk}px`, aspectRatio: `1 / ${tall}` }}>
      {PAINT_DAY ? (
        <div className="town-paint" aria-hidden="true">
          <img src={PAINT_DAY} alt="" />
          <img className="town-paint-night" src={PAINT_NIGHT ?? PAINT_DAY} alt="" />
        </div>
      ) : <svg className="town-bg" viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
        <rect width={VW} height={VH} fill={C.void} />
        <rect x="6" y="6" width={VW - 12} height={VH - 12} fill={C.land} stroke={INK} strokeWidth="1" strokeDasharray="14 3 6 3" />
        <rect width={VW} height={VH} fill="url(#grain)" />
        {/* 四条街从广场伸出去 */}
        {[[cx, 0], [cx, VH], [0, cy], [VW, cy]].map(([x, y]) => (
          <line key={`${x}${y}`} x1={cx} y1={cy} x2={x} y2={y} stroke={C.street} strokeWidth="44" />
        ))}
        <ellipse cx={cx} cy={cy} rx={pr * (Rx / Math.min(Rx, Ry * tall))} ry={pr * (Ry * tall / Math.min(Rx, Ry * tall))} fill="url(#cob)" stroke={INK} strokeWidth="1.3" />
        {[[70, 60, 30, 9], [VW - 80, VH - 70, 36, 10], [VW - 70, 80, 22, 7], [80, VH - 60, 26, 8]].map(([x, y, rx, ry]) => (
          <ellipse key={`${x}${y}`} cx={x} cy={y} rx={rx} ry={ry} fill={C.snow} stroke="#c9c8c2" strokeWidth=".8" />
        ))}
        {[44, 36, 28].map((rr, i) => (
          <g key={rr}>
            <circle cx={cx} cy={cy + 3} r={rr * 1.2} fill="#9d9a90" />
            <circle cx={cx} cy={cy} r={rr * 1.2} fill={['#dcdad2', '#e4e2db', '#eceae4'][i]} stroke={INK} strokeWidth="1.1" />
          </g>
        ))}
        <g transform={`translate(${cx} ${cy}) scale(1.15) translate(${-cx} ${-cy})`}><ClockTower x={cx} y={cy} /></g>
        <Tree x={32} y={36} /><Tree x={VW - 34} y={40} /><Tree x={30} y={VH - 30} /><Tree x={VW - 30} y={VH - 28} />
        <Lamp x={cx - 64} y={cy - 52} /><Lamp x={cx + 64} y={cy + 72} />
      </svg>}
      {/* 夜里：路灯和钟楼窗户的暖光（不受压暗滤镜影响） */}
      {!PAINT_DAY && <svg className="town-glow" viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
        <defs>
          <radialGradient id="warm"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".75" /><stop offset=".4" stopColor="#f2a24a" stopOpacity=".28" /><stop offset="1" stopColor="#f2a24a" stopOpacity="0" /></radialGradient>
        </defs>
        <g className="flicker">
          <circle cx={cx - 64} cy={cy - 77} r="46" fill="url(#warm)" />
          <circle cx={cx + 64} cy={cy + 47} r="46" fill="url(#warm)" />
        </g>
        <circle cx={cx} cy={cy - 47} r="30" fill="url(#warm)" />
        <circle cx={cx} cy={cy + 2} r="16" fill="url(#warm)" />
      </svg>}
      {voterIdx >= 0 && (() => {
        const dx = (Rx / 100) * w * Math.cos(rad(voterIdx));
        const dy = (Ry / 100) * h * Math.sin(rad(voterIdx));
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
        return <div className="clock-hand" style={{ height: `${Math.hypot(dx, dy) - tk * 0.6}px`, transform: `rotate(${deg}deg)` }} />;
      })()}
      <div className="town-center">{children}</div>
      {menuPlayer && <MarkMenu player={menuPlayer} mark={marks[menu.id]} at={menu} onClose={() => setMenu(null)} />}
      {s.players.map((p, i) => {
        const a = rad(i);
        const can = !pickable || pickable.includes(p.id);
        const cls = [
          'token',
          !p.alive && 'dead',
          picked.includes(p.id) && 'picked',
          pickable && can && 'pickable',
          pickable && !can && 'disabled',
          (s.block === p.id || vote?.nominee === p.id) && 'on-block',
          i === voterIdx && 'voting',
          !p.online && !p.fake && 'offline',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={p.id}
            type="button"
            className={cls}
            style={{ left: `${50 + Rx * Math.cos(a)}%`, top: `${50 + Ry * Math.sin(a)}%` }}
            onClick={() => onTap?.(p)}
            onContextMenu={(e) => { e.preventDefault(); if (p.id !== s.me) setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
            title={`${p.seat}号 ${p.name}${marks[p.id]?.note ? `\n笔记：${marks[p.id].note}` : ''}\n（右键做标记）`}
          >
            <div className="token-face">
              <Portrait p={p} size={tk} frame={frameOf(p)} />
              {!p.alive && <span className="stamp">{p.ghostVote ? '亡 · 余一票' : '亡'}</span>}
              <span className="seat">{p.seat}</span>
              {p.id !== s.me && !p.roleName && <MarkBadge mark={marks[p.id]} />}
              {marks[p.id]?.note && <i className="token-note" title={marks[p.id].note}>记</i>}
              {vote && yes.has(p.id) && <span className={`raised ${locked.has(p.id) ? 'locked' : ''}`}>举</span>}
              {inRoom.has(p.id) && <span className="mark whisper">密谈</span>}
              <span className="marks">
                {p.poisoned && <i className="m-phy">毒</i>}
                {p.drunk && <i className="m-psy">醉</i>}
                {p.fakeDead && <i className="m-phy">假死</i>}
                {p.protected && <i className="m-int">护</i>}
                {p.redHerring && <i className="m-psy">鱼</i>}
                {p.master && <i className="m-mot">主</i>}
              </span>
            </div>
            <div className="token-name">{p.id === s.me ? '你' : p.name}</div>
            {p.roleName && <div className="token-role" style={{ background: p.evil ? 'var(--phy)' : 'var(--int)' }}>{p.roleName}</div>}
            {!p.roleName && (p.nominated || p.nominator) && (
              <div className="token-tags">{[p.nominator && '已提名', p.nominated && '被提名'].filter(Boolean).join(' · ')}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 滤镜和图案的定义；地图把 SVG 栅格化成贴图时也要带上这一份。 */
export function PaintDefs() {
  return (
    <defs>
      <filter id="paint" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9" result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.1 1.25" result="ga" />
        <feComposite in="d" in2="ga" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" />
      </filter>
      <filter id="brush"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="2" /><feDisplacementMap in="SourceGraphic" scale="4" /></filter>
      <filter id="gn"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .12 0" /></filter>
      <pattern id="grain" width="140" height="140" patternUnits="userSpaceOnUse"><rect width="140" height="140" filter="url(#gn)" /></pattern>
      <pattern id="cob" width="12" height="9" patternUnits="userSpaceOnUse">
        <rect width="12" height="9" fill="#c9c6bd" />
        <path d="M0 4.5h12M6 0v4.5M2 4.5v4.5M10 4.5v4.5" stroke="#b0ada3" strokeWidth=".8" />
      </pattern>
      <pattern id="planks" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#d9d1c1" />
        <path d="M0 9.5h10M4 0v9.5" stroke="#b9ad97" strokeWidth=".8" />
      </pattern>
    </defs>
  );
}

/** 全局 SVG 滤镜和图案：整页只放一份。 */
export function PaintFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <PaintDefs />
    </svg>
  );
}
