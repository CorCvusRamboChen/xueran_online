// 白天自由活动的小镇（斜视角，镜头跟着自己走）。地面、建筑、小人画在 Pixi 画布上（world/World.js），
// 头像、名字、敲门气泡、地名和小地图是 HTML，每帧按画布给的屏幕坐标摆放。
// 点哪儿走到哪儿（点房子就走进去），拖动可以看别处，滚轮缩放；走进房子就进那间的私聊语音。
import { useEffect, useRef, useState } from 'react';
import { MAP_W, MAP_H, PLAZA, OBSTACLES, WATER_Y, ROADS, ROAD_HALF, positionAt } from '../../src/shared/map.js';
import { Portrait, serverNow } from './util.jsx';
import { useMarks, MarkMenu, MarkBadge, TAGS } from './marks.jsx';
import town4 from './assets/maps/town-4.json';
import town6 from './assets/maps/town-6.json';

/** 地图下方一排：正在私聊的房子（锁门的排在前面），点一下走过去。 */
function RoomStrip({ s, onGo }) {
  const busy = s.roam.houses.filter((h) => h.members.length).sort((a, b) => Number(b.locked) - Number(a.locked));
  if (!busy.length) return null;
  const g = (id) => s.players.find((p) => p.id === id);
  return (
    <div className="room-strip" onPointerDown={(e) => e.stopPropagation()}>
      {busy.map((h) => (
        <button key={h.id} type="button" className={`room-chip ${h.locked ? 'locked' : ''} ${s.roam.myHouse === h.id ? 'mine' : ''}`} onClick={() => onGo(h)}>
          <span className="rc-name">{h.name}</span>
          <span className="rc-faces">{h.members.map((id) => g(id) && <Portrait key={id} p={g(id)} size={20} prefer="avatar" frame="#f4f4f0" />)}</span>
          {h.locked && <span className="rc-lock">锁门私聊</span>}
        </button>
      ))}
    </div>
  );
}

/** 左下角：所有人（死了的变灰）。点头像镜头就转到他身上（再点自己回来）；右键给他打自己的标记。 */
function AliveStrip({ s, watching, onWatch }) {
  const alive = s.players.filter((p) => p.alive);
  const houseOf = (id) => s.roam.houses.find((h) => h.members.includes(id));
  const marks = useMarks(s);
  const allies = Object.fromEntries((s.self?.allies ?? []).map((a) => [a.id, a.team]));
  const [menu, setMenu] = useState(null); // { id, x, y }
  const menuPlayer = menu && s.players.find((p) => p.id === menu.id);
  return (
    <div className="alive-strip" onPointerDown={(e) => e.stopPropagation()}>
      {menuPlayer && <MarkMenu player={menuPlayer} mark={marks[menu.id]} at={menu} onClose={() => setMenu(null)} />}
      <span className="as-label">存活 {alive.length} / {s.players.length}</span>
      <div className="as-faces">
        {s.players.map((p) => {
          const h = houseOf(p.id);
          return (
            <button key={p.id} type="button" title={`${p.seat}号 ${p.name}${h ? ` · 在${h.name}${h.locked ? '（锁门）' : ''}` : ''}（右键做标记）`}
              className={['as-face', watching === p.id && 'on', p.id === s.me && 'me', !p.alive && 'dead', h && 'inside', h?.locked && 'locked'].filter(Boolean).join(' ')}
              onClick={() => onWatch(p.id)}
              onContextMenu={(e) => { e.preventDefault(); if (p.id !== s.me) setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}>
              <Portrait p={p} size={44} prefer="avatar" speak={false} frame={p.id === s.me ? 'var(--mot)' : allies[p.id] ? 'var(--phy)' : TAGS[marks[p.id]?.tag]?.color ?? '#f4f4f0'} />
              <i>{p.seat}</i>
              {allies[p.id] ? <span className="mark-badge ally">队友·{allies[p.id]}</span> : <MarkBadge mark={marks[p.id]} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TownMap({ s, onMove }) {
  const r = s.roam;
  const marks = useMarks(s);
  const [walkerMenu, setWalkerMenu] = useState(null); // { id, x, y }
  const walkerMenuPlayer = walkerMenu && s.players.find((p) => p.id === walkerMenu.id);
  const ref = useRef(null);
  const world = useRef(null);
  const tags = useRef(new Map());
  const labels = useRef(new Map());
  const dots = useRef(new Map());
  const drag = useRef(null);
  const [ready, setReady] = useState(false);
  const [watching, setWatching] = useState(null);
  const watch = (id) => {
    if (!world.current) return;
    if (id === s.me || id === watching) world.current.follow();
    else world.current.watch(id);
  };

  // 每次渲染把最新数据交给画布，画布每帧自己读
  const data = { players: s.players, roam: r, me: s.me };
  if (world.current) world.current.data = data;
  const big = r.houses.length > 4;

  useEffect(() => {
    let dead = false;
    let made = null;
    import('./world/World.js').then(({ World }) => World.create(ref.current, big ? town6 : town4, r.houses)).then((wd) => {
      made = wd;
      if (dead) { wd.destroy(); return; }
      wd.data = data;
      wd.onWatch = setWatching;
      wd.onFrame = ({ walkers, houses }) => {
        for (const [id, p] of Object.entries(walkers)) {
          const el = tags.current.get(id);
          if (el) { el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`; el.style.zIndex = 10 + Math.round(p.y); el.style.visibility = p.hidden ? 'hidden' : ''; }
          const dot = dots.current.get(id);
          if (dot) { dot.setAttribute('cx', p.map.x); dot.setAttribute('cy', p.map.y); }
        }
        for (const [id, p] of Object.entries(houses)) {
          const el = labels.current.get(id);
          if (el) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
        }
      };
      world.current = wd;
      setReady(true);
      try { sessionStorage.removeItem('botc.reloaded'); } catch { /* 隐私模式 */ }
    }).catch((e) => {
      // 游戏开着的时候服务器部署了新版本，旧的地图模块文件已经不在了：刷新一次拿到新版本
      console.warn('[botc] 小镇地图加载失败：', e);
      try {
        if (!sessionStorage.getItem('botc.reloaded')) { sessionStorage.setItem('botc.reloaded', '1'); location.reload(); }
      } catch { /* 隐私模式 */ }
    });
    return () => { dead = true; made?.destroy(); world.current = null; };
  }, [big]);

  // 键盘：WASD / 方向键，按住连续走，可以两个键斜着走。方向按屏幕算（W 就是往屏幕上方走）。
  const live = useRef({ s, onMove });
  live.current = { s, onMove };
  useEffect(() => {
    const dirs = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
    const held = new Set();
    const typing = (e) => e.target.closest?.('input, textarea, select');
    const here = () => {
      const { s: cur } = live.current;
      const m = cur.roam?.pos[cur.me];
      return m ? positionAt(cur.roam.houses, m, serverNow()) : null;
    };
    // 每 90ms 往按住的方向预约一小段（50 单位 ≈ 0.2 秒的路）；本地立刻开始走（见 App 的走路预测）
    const step = () => {
      if (!held.size) return;
      let sx = 0; let sy = 0;
      for (const k of held) { sx += dirs[k][0]; sy += dirs[k][1]; }
      if (!sx && !sy) return;
      // 屏幕方向 → 俯视平面：屏幕右 = (1, -1)，屏幕下 = (1, 1)
      const lx = sx + sy; const ly = sy - sx; const n = Math.hypot(lx, ly);
      const at = here();
      if (at) live.current.onMove(at.x + (lx / n) * 50, at.y + (ly / n) * 50);
    };
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (!dirs[k] || typing(e)) return;
      e.preventDefault();
      if (held.has(k)) return; // 系统的按键连发不管
      held.add(k);
      step(); // 按下立刻走，不等下一拍
    };
    // 松开所有方向键就原地停下，不再往前滑
    const stop = () => { const at = here(); if (at) live.current.onMove(at.x, at.y); };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (!held.delete(k)) return;
      if (!held.size) stop(); else step();
    };
    const clear = () => { if (held.size) { held.clear(); stop(); } };
    const timer = setInterval(step, 90);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => { clearInterval(timer); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);

  // 滚轮缩放（要 passive: false 才能拦住页面滚动）
  useEffect(() => {
    const el = ref.current;
    const onWheel = (e) => { if (!world.current) return; e.preventDefault(); world.current.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e) => { const b = ref.current.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const down = (e) => {
    if (e.target.closest('.minimap')) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    ref.current.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x; const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true;
    world.current?.panBy(dx, dy);
    d.x = e.clientX; d.y = e.clientY;
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !world.current) return;
    const t = world.current.pick(...local(e));
    if (t) onMove(t.x, t.y);
  };
  const miniTap = (e) => {
    const svg = e.currentTarget.getBoundingClientRect();
    onMove(((e.clientX - svg.left) / svg.width) * MAP_W, ((e.clientY - svg.top) / svg.height) * MAP_H);
    world.current?.follow();
  };

  const knocking = new Set(r.houses.flatMap((h) => h.knocks));

  return (
    <div className={`map ${ready ? 'ready' : ''}`} ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}>
      <div className="map-fog" aria-hidden="true" />
      <div className="map-place">
        <small>钟楼镇 · 位于暗流涌动区</small>
        <b>{r.houses.find((h) => h.id === r.myHouse)?.name ?? '血染钟楼特别行政区'}</b>
      </div>
      <div className="map-cross" aria-hidden="true"><i /><i /><i /><i /></div>

      {/* 地名不显示，只在锁着的房子上方挂一个"锁" */}
      {r.houses.map((h) => (
        <div key={h.id} className={`map-label ${h.locked ? '' : 'hidden'}`} ref={(el) => { if (el) labels.current.set(h.id, el); else labels.current.delete(h.id); }}>
          <span className="lock-mark">锁</span>
        </div>
      ))}

      {s.players.map((p) => {
        if (!r.pos[p.id]) return null;
        return (
          <div
            key={p.id}
            ref={(el) => { if (el) tags.current.set(p.id, el); else tags.current.delete(p.id); }}
            className={['walker', p.id === s.me && 'me', !p.alive && 'ghost'].filter(Boolean).join(' ')}
          >
            <div className="walker-head">
              {knocking.has(p.id) && <div className="speech">“叩，叩。”</div>}
              <div className="float" title={p.id === s.me ? '你' : `${p.seat}号 ${p.name}（点头像做标记）`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { if (p.id !== s.me) setWalkerMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
                onContextMenu={(e) => { e.preventDefault(); if (p.id !== s.me) setWalkerMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}>
                <Portrait p={p} size={24} prefer="avatar" frame={p.id === s.me ? 'var(--mot)' : TAGS[marks[p.id]?.tag]?.color ?? '#f4f4f0'} />
                <i className="walker-seat">{p.seat}</i>
                {p.id !== s.me && <MarkBadge mark={marks[p.id]} />}
              </div>
            </div>
            <div className="walker-name">{p.id === s.me ? '你' : p.name}</div>
          </div>
        );
      })}

      {walkerMenuPlayer && <MarkMenu player={walkerMenuPlayer} mark={marks[walkerMenu.id]} at={walkerMenu} onClose={() => setWalkerMenu(null)} />}
      <RoomStrip s={s} onGo={(h) => { onMove(h.x + h.w / 2, h.y + h.h / 2); world.current?.follow(); }} />
      <AliveStrip s={s} watching={watching} onWatch={watch} />

      <svg className="minimap" viewBox={`0 0 ${MAP_W} ${MAP_H}`} onPointerDown={miniTap} aria-label="小地图">
        <rect width={MAP_W} height={MAP_H} fill="#e7e6e0" />
        <rect y={WATER_Y} width={MAP_W} height={MAP_H - WATER_Y} fill="#6f8086" />
        {ROADS.map((l, i) => <polyline key={i} points={l.map((p) => p.join(',')).join(' ')} stroke="#bdbab1" strokeWidth={ROAD_HALF * 2} fill="none" />)}
        <circle cx={PLAZA.x} cy={PLAZA.y} r={PLAZA.r} fill="#c9c6bd" />
        {OBSTACLES.map((o) => <rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} fill="#8a9592" />)}
        {r.houses.map((h) => <rect key={h.id} x={h.x} y={h.y} width={h.w} height={h.h} fill={h.locked ? '#c9a24a' : '#4f6764'} stroke="#111" strokeWidth="8" />)}
        {s.players.map((p) => r.pos[p.id] && (
          <circle key={p.id} ref={(el) => { if (el) dots.current.set(p.id, el); else dots.current.delete(p.id); }}
            cx={r.pos[p.id].x} cy={r.pos[p.id].y} r={p.id === s.me ? 34 : 22}
            fill={p.id === s.me ? 'var(--mot)' : p.alive ? '#1d2524' : '#888'} stroke={p.id === s.me ? '#111' : 'none'} strokeWidth="8" />
        ))}
      </svg>
    </div>
  );
}
