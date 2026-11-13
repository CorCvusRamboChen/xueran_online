// 门的位置编辑器（开发用）：http://localhost:3001/?preview=doors&map=tb（或 bmr、snv）
// 手绘底图上摆着能进的房子（外观图），每间房子的门画成一个红框：拖红框底下的圆点，沿着朝镜头的两面墙（南、东）挪，
// 对到画里的门上。点「保存」写回 src/shared/maps/doors.js（服务器要开 DEV_LOGIN），重新构建、重启服务后游戏里生效。
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMap, DOOR } from '../../../src/shared/map.js';
import SAVED from '../../../src/shared/maps/doors.js';
import { iso, guideOf, houseArtRect, closedArtRect } from './World.js';

const FILES = import.meta.glob('../assets/world*/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
const artDir = (id) => (id === 'tb' ? 'world' : `world-${id}`);
const art = (set, name) => Object.entries(FILES).find(([p]) => p.endsWith(`/${artDir(set)}/${name}`))?.[1];
const DOOR_W = 13; const DOOR_H = 32; // 和游戏里画门的大小一样（World.js 的 door）

/** 门框在屏幕上的四个角（斜视角）。 */
function doorQuad(side, d) {
  const pts = side === 'right'
    ? [[d.x, d.y - DOOR_W, 0], [d.x, d.y + DOOR_W, 0], [d.x, d.y + DOOR_W, DOOR_H], [d.x, d.y - DOOR_W, DOOR_H]]
    : side === 'left'
      ? [[d.x, d.y - DOOR_W, 0], [d.x, d.y + DOOR_W, 0], [d.x, d.y + DOOR_W, DOOR_H], [d.x, d.y - DOOR_W, DOOR_H]]
      : [[d.x - DOOR_W, d.y, 0], [d.x + DOOR_W, d.y, 0], [d.x + DOOR_W, d.y, DOOR_H], [d.x - DOOR_W, d.y, DOOR_H]];
  return pts.map(([x, y, z]) => { const p = iso(x, y, z); return `${p.x},${p.y}`; }).join(' ');
}

export function DoorEditor() {
  const mapId = new URLSearchParams(location.search).get('map') || 'tb';
  const town = getMap(mapId);
  const set = town.art ?? town.id;
  const G = guideOf(town);
  const [fix, setFix] = useState(() => structuredClone(SAVED[set] ?? {}));
  const [sel, setSel] = useState(null);
  const [cam, setCam] = useState({ k: 0.32, x: 0, y: 0 });
  const [msg, setMsg] = useState('');
  const box = useRef(null);
  const drag = useRef(null);
  // 房子用地图里原始的（没套门的修正），门按编辑中的修正现算
  const houses = useMemo(() => town.allHouses().map((h) => {
    const raw = town.houses.find((x) => x.id === h.id);
    const side = fix[h.id]?.side ?? raw.side;
    const [x, y, nx, ny] = DOOR[side](h, fix[h.id]?.t ?? 0.5);
    const k = fix[h.id]?.in ?? 0;
    return { ...h, side, rawSide: raw.side, door: { x, y, vx: x - nx * k, vy: y - ny * k } };
  }), [fix, town]);

  const fitted = useRef(false);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (fitted.current || !width || !height) return;
      fitted.current = true;
      const k = Math.min(width / G.w, height / G.h);
      setCam({ k, x: (width - G.w * k) / 2 - G.x * k, y: (height - G.h * k) / 2 - G.y * k });
    });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  /** 屏幕上一点 → 地图坐标。 */
  const toMap = (cx, cy) => {
    const r = box.current.getBoundingClientRect();
    const wx = (cx - r.left - cam.x) / cam.k; const wy = (cy - r.top - cam.y) / cam.k;
    return { x: wy + wx / 2, y: wy - wx / 2 };
  };
  /** 地图上一点 → 离它最近的那面墙（南、东，原来就在西 / 北的保留原来那面）上的位置。 */
  const snap = (h, p) => {
    const sides = [...new Set(['bottom', 'right', h.rawSide])];
    let best = null;
    for (const side of sides) {
      const along = side === 'bottom' || side === 'top';
      const t = Math.max(0.06, Math.min(0.94, along ? (p.x - h.x) / h.w : (p.y - h.y) / h.h));
      const [x, y] = DOOR[side](h, t);
      const d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.d) best = { d, side, t: Math.round(t * 100) / 100 };
    }
    return best;
  };

  const onDown = (e, id) => {
    e.stopPropagation();
    if (id) setSel(id);
    drag.current = { id, sx: e.clientX, sy: e.clientY, cam };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    if (!d.id) { setCam({ ...d.cam, x: d.cam.x + e.clientX - d.sx, y: d.cam.y + e.clientY - d.sy }); return; }
    const h = houses.find((x) => x.id === d.id);
    const s = snap(h, toMap(e.clientX, e.clientY));
    setFix((F) => ({ ...F, [d.id]: { ...F[d.id], side: s.side, t: s.t } }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => {
    const r = box.current.getBoundingClientRect();
    const px = e.clientX - r.left; const py = e.clientY - r.top;
    const k2 = Math.max(0.1, Math.min(3, cam.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    setCam({ k: k2, x: px - ((px - cam.x) / cam.k) * k2, y: py - ((py - cam.y) / cam.k) * k2 });
  };
  /** 把镜头拉到一间房子跟前。 */
  const focus = (h) => {
    const r = box.current.getBoundingClientRect();
    fitted.current = true; // 别让「一开始放进窗口」随后又把镜头拉回去
    const p = iso(h.x + h.w / 2, h.y + h.h / 2); const k = 1.6;
    setSel(h.id);
    setCam({ k, x: r.width / 2 - p.x * k, y: r.height / 2 - (p.y - 40) * k });
  };
  const save = async () => {
    try {
      const r = await fetch(`/api/dev/doors/${set}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fix) });
      const j = (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : { error: '本地服务还是旧版本，没有这个保存接口：重启服务（npm start）再点保存' };
      setMsg(j.ok ? `已保存到 ${j.path}。重新构建（npm run build）、重启服务后游戏里生效。` : `没存上：${j.error ?? '服务器没开 DEV_LOGIN？'}`);
    } catch (e) { setMsg(`连不上本地服务（${e.message}）`); }
  };

  const order = [...houses].sort((a, b) => (a.x + a.y + a.w + a.h) - (b.x + b.y + b.w + b.h));
  return (
    <div className="layout-editor">
      <div className="le-stage" ref={box} onPointerDown={(e) => onDown(e, null)} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}>
        <div className="le-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          <img className="le-base" src={art(set, 'town-base.webp')} alt="" style={{ left: G.x, top: G.y, width: G.w, height: G.h }} draggable={false} />
          {order.map((hs) => {
            const src = art(set, `house-${hs.id}-closed-lit.png`) ?? art(set, `house-${hs.id}-closed.png`) ?? art(set, `house-${hs.id}-open.png`);
            const closed = !!art(set, `house-${hs.id}-closed.png`);
            const r = closed ? closedArtRect(hs) : houseArtRect(hs, hs.openK ?? 1);
            return src && <img key={hs.id} className={`le-house ${sel === hs.id ? 'on' : ''}`} src={src} alt={hs.name} draggable={false}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel(hs.id); }} />;
          })}
          <svg className="le-marks" style={{ left: G.x, top: G.y, width: G.w, height: G.h }} viewBox={`${G.x} ${G.y} ${G.w} ${G.h}`}>
            {houses.map((hs) => {
              const P = (x, y) => { const p = iso(x, y); return `${p.x},${p.y}`; };
              return (
                <g key={hs.id} className={sel === hs.id ? 'on' : ''}>
                  <polygon points={[P(hs.x, hs.y), P(hs.x + hs.w, hs.y), P(hs.x + hs.w, hs.y + hs.h), P(hs.x, hs.y + hs.h)].join(' ')} />
                  <polygon className="de-door" points={doorQuad(hs.side, { x: hs.door.vx, y: hs.door.vy })} />
                </g>
              );
            })}
          </svg>
          {houses.map((hs) => {
            const p = iso(hs.door.x, hs.door.y); const r = 7 / cam.k;
            return <div key={`d${hs.id}`} className={`le-fog-dot de-handle ${sel === hs.id ? 'on' : ''}`} style={{ left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, borderWidth: `${1.5 / cam.k}px` }} onPointerDown={(e) => onDown(e, hs.id)} />;
          })}
        </div>
      </div>
      <aside className="le-panel">
        <h3>门的位置 · {town.name}</h3>
        <p className="muted">红框是游戏里开门动画画的位置，圆点是人进出的地方（在占地边线上）。拖圆点沿着朝镜头的南墙、东墙挪，画里的门往里缩的再拉「门往里缩」，让红框盖住画里的门；滚轮缩放，空白处拖动看别处。点下面的房子名字直接拉近。</p>
        <div className="le-seg">
          {['tb', 'bmr', 'snv'].map((m) => <button key={m} type="button" className={set === m ? 'on' : ''} onClick={() => { location.search = `?preview=doors&map=${m}`; }}>{getMap(m).name}</button>)}
        </div>
        <div className="le-list">
          {houses.map((hs) => <button key={hs.id} type="button" className={sel === hs.id ? 'on' : ''} onClick={() => focus(hs)}>{hs.name}{fix[hs.id] ? ' ·改' : ''}</button>)}
        </div>
        {sel && (
          <label>门往里缩（画里门前有台阶、平台时）<b>{fix[sel]?.in ?? 0}</b>
            <input type="range" min="0" max="80" step="1" value={fix[sel]?.in ?? 0}
              onChange={(e) => setFix((F) => { const h = houses.find((x) => x.id === sel); return { ...F, [sel]: { side: F[sel]?.side ?? h.side, t: F[sel]?.t ?? 0.5, in: +e.target.value || undefined } }; })} />
          </label>
        )}
        {sel && <p className="muted">{houses.find((h) => h.id === sel)?.name}：{fix[sel] ? `${fix[sel].side === 'bottom' ? '南墙' : fix[sel].side === 'right' ? '东墙' : fix[sel].side} ${Math.round(fix[sel].t * 100)}%` : '默认（那面墙正中间）'}</p>}
        <div className="le-btns">
          {sel && <button type="button" onClick={() => setFix((F) => { const o = { ...F }; delete o[sel]; return o; })}>这间复原</button>}
          <button type="button" className="primary" onClick={save}>保存</button>
        </div>
        {msg && <p className="le-msg">{msg}</p>}
      </aside>
    </div>
  );
}
