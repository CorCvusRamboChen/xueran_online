// 钟楼广场（座位圈）：和小镇地图同一套线稿画风——石板圆场、三层圆台阶、钟楼；
// 大家的方形肖像围成一圈。投票时一根指针从钟楼指向正在投票的人。夜里整幅画压暗成深青色。
import { useLayoutEffect, useRef, useState } from 'react';
import { toneFilter } from './world/tone.js';
import { getMap } from '../../src/shared/map.js';
import { Portrait } from './util.jsx';
import { useMarks, TAGS, MarkMenu, MarkBadge, LinkLines, LINKS, addLink, useLinkKind, LinkKinds } from './marks.jsx';
import { ClockTower, Tree, Lamp, MAP_COLORS as C, INK } from './art/TownArt.jsx';
import { SCENE_ART } from './art.js';
import { PeltStack } from './Pelt.jsx';

// 手绘广场（白天 / 夜里两张同构图，夜里淡入）；没有就用线稿。
// 每个剧本一张：square-day-<剧本>.webp（暗流涌动不带后缀）；还没画的剧本先用暗流涌动的
// 小剧本借用前两张图：没有自己的广场画就用借用的那张（getMap(剧本).art）
const sceneFor = (name, script) => [script, getMap(script).art].filter((k) => k && k !== 'tb').map((k) => SCENE_ART[`${name}-${k}`]).find(Boolean) ?? SCENE_ART[name];

export function Town({ s, picked = [], pickable = null, onTap, children }) {
  const ref = useRef(null);
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const n = s.players.length;
  // 竖屏把圆拉成竖椭圆，用上下的空白：手机上总是拉（中间要放台上的人和举手），平板 / 窄窗口人多时才拉
  const portrait = window.innerHeight > window.innerWidth * 1.2;
  const tall = portrait && window.innerWidth < 600 ? 1.35 : portrait && n > 9 ? 1.25 : 1;
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
  const PAINT_DAY = sceneFor('square-day', s.script);
  // 和小镇地图同一套色调；square 里单独写的项（比如饱和度）盖在上面
  const tone = getMap(s.script).tone;
  const paintTone = toneFilter(tone && { ...tone.map, ...tone.square });
  const PAINT_NIGHT = sceneFor('square-night', s.script);

  const allies = new Set((s.self?.allies ?? []).map((a) => a.id));
  const marks = useMarks(s);
  const [menu, setMenu] = useState(null); // { id, x, y }
  // 左键连线（和镇民面板一样）：没在选人（提名、夜里选人）时，左键依次点两个人连一条线，再点一次起点取消
  const linkable = !pickable && !s.isST;
  const [kind] = useLinkKind();
  const [from, setFrom] = useState(null);
  const seatOf = (id) => s.players.find((q) => q.id === id)?.seat;
  useLayoutEffect(() => { if (!linkable) setFrom(null); }, [linkable]); // 开始提名 / 选人时取消连线
  const tap = (p) => {
    if (!linkable) { onTap?.(p); return; }
    if (!from) { setFrom(p.id); return; }
    if (from === p.id) { setFrom(null); return; }
    addLink(from, p.id, kind);
    setFrom(null);
  };
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
    <div className={`town ${night ? 'night' : ''} ${PAINT_DAY ? 'painted' : ''}`} ref={ref} style={{ '--tk': `${tk}px`, aspectRatio: `1 / ${tall}`, maxWidth: tall > 1 ? `min(100%, calc((var(--vh) - 200px) / ${tall}))` : undefined }}>
      {PAINT_DAY ? (
        <div className="town-paint" aria-hidden="true">
          <img src={PAINT_DAY} alt="" style={{ filter: paintTone }} />
          <img className="town-paint-night" src={PAINT_NIGHT ?? PAINT_DAY} alt="" style={{ filter: paintTone }} />
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
      {/* 小魔典里的连线（只有自己看得到）：画在头像底下 */}
      <LinkLines marks={marks} w={w} h={h} gap={tk * 0.62}
        posOf={(id) => { const i = s.players.findIndex((p) => p.id === id); if (i < 0) return null; const a = rad(i); return { x: ((50 + Rx * Math.cos(a)) / 100) * w, y: ((50 + Ry * Math.sin(a)) / 100) * h }; }} />
      {menuPlayer && <MarkMenu s={s} player={menuPlayer} mark={marks[menu.id]} at={menu} onClose={() => setMenu(null)} />}
      {linkable && from && (
        <div className="town-linkbar" role="status">
          <span>从 <b>{seatOf(from)}号</b> 连「{LINKS[kind].label}」到谁？再点一次 {seatOf(from)}号 取消</span>
          <LinkKinds />
          <button type="button" className="tl-cancel" onClick={() => setFrom(null)}>取消</button>
        </div>
      )}
      {s.storyteller && (
        <div className="st-corner">{/* 左下角：说书人（有无神论者的剧本）。传奇角色在顶栏和右栏「传奇·旅行者」里，这里不重复（2026-11-19 用户） */}
          <StSeat s={s} pickable={pickable} picked={picked} vote={vote} tk={tk} onTap={onTap} />
        </div>
      )}
      {s.players.map((p, i) => {
        const a = rad(i);
        const can = !pickable || pickable.includes(p.id);
        const cls = [
          'token',
          linkable && from === p.id && 'link-from',
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
            data-pid={p.id}
            className={cls}
            style={{ left: `${50 + Rx * Math.cos(a)}%`, top: `${50 + Ry * Math.sin(a)}%` }}
            onClick={() => tap(p)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
            title={`${p.seat}号 ${p.name}${marks[p.id]?.note ? `\n笔记：${marks[p.id].note}` : ''}\n（右键做标记）`}
          >
            <div className="token-face">
              <PeltStack items={s.pelted?.[p.id]} size={Math.max(18, Math.round(tk * 0.48))} />
              <Portrait p={p} size={tk} frame={frameOf(p)} />
              {!p.alive && <span className="stamp">{p.ghostVote ? '亡 · 余一票' : '亡'}</span>}
              <span className="seat">{p.seat}</span>
              {!p.roleName && <MarkBadge mark={marks[p.id]} part="chips" />}
              {marks[p.id]?.note && <i className="token-note" title={marks[p.id].note}>记</i>}
              {vote && yes.has(p.id) && <span className={`raised ${locked.has(p.id) ? 'locked' : ''}`}>举</span>}
              {inRoom.has(p.id) && <span className="mark whisper">密谈</span>}
              {p.traveller && <span className="mark traveller" title={`旅行者：${p.travellerRole}`}>{p.left ? '离开' : `旅 · ${p.travellerRole}`}</span>}
              {s.ww?.sheriff === p.id && <span className="mark sheriff" title="警长">警长</span>}
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
            {/* 猜的角色放在名字下面，一个角色一个方块 */}
            {!p.roleName && <div className="token-guess"><MarkBadge mark={marks[p.id]} part="roles" /></div>}
            {p.roleName && <div className="token-role" style={{ background: p.evil ? 'var(--phy)' : 'var(--int)' }}>{p.roleName}</div>}
            {!p.roleName && (p.tags?.length > 0 || p.nominated || p.nominator) && (
              <div className="token-tags">{(p.tags ?? [p.nominator && '已提名', p.nominated && '被提名']).filter(Boolean).join(' · ')}</div>
            )}
            {p.pips?.length > 0 && <div className="token-pips">{p.pips.map((x, i) => <i key={i} className={x.c} title={x.title}>{x.k}</i>)}</div>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 说书人的座位（2026-11-18 用户：说书人在台上也要展示）：放在圈的左下角外面（左上角有存活人数的信息条），不占玩家的座位。
 * 真人说书显示他的头像（说话、闭麦标记照常）；AI 说书显示说书人的标志（打开的魔典，2026-11-20 用户：不要星星）。有无神论者的剧本可以在提名时点他（被提名 / 上处决台也标出来）。
 */
/** 说书人的标志：一本打开的魔典，书脊上方一枚钟。 */
const StIcon = () => (
  <svg viewBox="0 0 40 40" width="62%" height="62%" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <path d="M20 13c-4-2.6-9-3.2-14-2.4v19c5-.8 10-.2 14 2.4 4-2.6 9-3.2 14-2.4v-19c-5-.8-10-.2-14 2.4z" />
    <path d="M20 13v19" />
    <path d="M10 15.5c2.6-.3 5 .1 7 1M10 20c2.6-.3 5 .1 7 1M23 16.5c2-.9 4.4-1.3 7-1M23 21c2-.9 4.4-1.3 7-1" strokeWidth="1.4" opacity=".8" />
    <circle cx="20" cy="7" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);

function StSeat({ s, pickable, picked, vote, tk, onTap }) {
  const st = s.storyteller;
  const target = 'storyteller';
  const can = !!pickable?.includes(target);
  const onBlock = s.block === target || vote?.nominee === target;
  const cls = ['token', 'st-seat', can && 'pickable', pickable && !can && 'disabled', picked.includes(target) && 'picked', onBlock && 'on-block'].filter(Boolean).join(' ');
  const face = st.human ? { id: st.id, name: st.name, avatar: st.avatar, mic: st.mic } : { id: 'storyteller', name: '说书人', avatar: null };
  return (
    <button type="button" className={cls} onClick={() => can && onTap?.({ id: target })}
      title={`说书人：${st.name}${s.stNominable ? '\n这个剧本有无神论者：可以提名说书人。处决说书人时，真有无神论者善良赢，没有就邪恶赢' : ''}`}>
      <div className="token-face">
        {st.human ? <Portrait p={face} size={Math.round(tk * 0.85)} frame="#e8c66a" /> : <div className="st-star" style={{ width: Math.round(tk * 0.85), height: Math.round(tk * 0.85) }}><StIcon /></div>}
      </div>
      <div className="token-name">{st.human ? `说书人 · ${st.name}` : '说书人'}</div>
      {(s.stNominated || onBlock) && <div className="token-tags">{onBlock ? '处决台上' : '被提名'}</div>}
    </button>
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
