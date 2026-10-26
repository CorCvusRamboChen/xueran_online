// 房子摆放编辑器（开发用）：http://localhost:3001/?preview=layout
// 手绘底图上摆着 7 间能进的房子：点选一间，拖动挪位置（整栋 / 只挪外观 / 只挪室内）；滑块调外观大小、室内大小（室内多大，人就能走多大）。
// 「地面雾」：点空地加一团雾，拖动挪，滑块调大小、浓度、扁度；保存写回 src/shared/maps/bmr-fog.js。
// 点「保存」写回 src/shared/maps/bmr-layout.js（服务器要开 DEV_LOGIN），重新构建、重启服务后游戏里生效。
import { useEffect, useMemo, useRef, useState } from 'react';
import { BMR_RAW, BMR_SCALE } from '../../../src/shared/maps/bmr.js';
import SAVED from '../../../src/shared/maps/bmr-layout.js';
import SAVED_FOG from '../../../src/shared/maps/bmr-fog.js';
import SAVED_TONE from '../../../src/shared/maps/bmr-tone.js';
import { TONE_KEYS, toneFilter } from './tone.js';
import { getMap, DOOR } from '../../../src/shared/map.js';
import { iso, guideOf, houseArtRect, closedArtRect, autoFogSpots, FOG_BLOB_STOPS } from './World.js';

const ART = import.meta.glob('../assets/world-bmr/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
const art = (name) => Object.entries(ART).find(([p]) => p.endsWith(`/${name}`))?.[1];
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** 发给本地服务保存。服务没重启（还是旧版本，没有这个保存接口）时会返回网页，这里认出来给一句好懂的提示。 */
async function postDev(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!(r.headers.get('content-type') ?? '').includes('json')) return { error: '本地服务还是旧版本，没有这个保存接口。不用刷新这个页面：去终端按 Ctrl+C 停掉服务，再 npm start，回来重新点保存' };
    return await r.json();
  } catch (e) { return { error: `连不上本地服务（${e.message}）` }; }
}

/** 和 maps/bmr.js 的 placeHouse 一样：按当前的微调算出这间房子的占地。 */
function place(h, o) {
  const k = BMR_SCALE; const { dx = 0, dy = 0, cdx = 0, cdy = 0, closed = 1, open = 1 } = o ?? {};
  const cx = (h.x + h.w / 2) * k + dx; const cy = (h.y + h.h / 2) * k + dy;
  const w = h.w * open; const hh = h.h * open;
  return { ...h, x: cx - w / 2, y: cy - hh / 2, w, h: hh, artW: h.w, artH: h.h, closedK: closed, openK: open, closedDx: cdx, closedDy: cdy };
}

export function LayoutEditor() {
  const town = getMap('bmr');
  const G = guideOf(town);
  const [layout, setLayout] = useState(() => structuredClone(SAVED));
  const [sel, setSel] = useState(BMR_RAW.houses[0].id);
  const [view, setView] = useState('closed'); // closed | open | both（室内上面叠半透明的外观，方便对齐）
  const [mode, setMode] = useState('all');     // 拖动时挪什么：all 整栋 | closed 只挪外观 | open 只挪室内（外观留在原地）
  const [cam, setCam] = useState({ k: 0.32, x: 0, y: 0 });
  const [msg, setMsg] = useState('');
  const [tool, setTool] = useState('houses'); // houses 房子 | fog 地面雾 | tone 色调
  const [tone, setTone] = useState(() => ({ map: { ...(SAVED_TONE.map ?? {}) }, houses: { ...(SAVED_TONE.houses ?? {}) } }));
  const setToneKey = (group, k, v) => setTone((T) => ({ ...T, [group]: { ...T[group], [k]: v } }));
  const saveTone = async () => {
    const clean = Object.fromEntries(['map', 'houses'].map((g) => [g, Object.fromEntries(TONE_KEYS.filter(([k, , , , def]) => tone[g][k] != null && tone[g][k] !== def).map(([k]) => [k, tone[g][k]]))]));
    if (SAVED_TONE.square) clean.square = SAVED_TONE.square; // 集合广场单独的项（编辑器里还没有它的滑块）照原样留着
    const r = await postDev('/api/dev/tone/bmr', clean);
    setMsg(r.ok ? `已保存到 ${r.path}。重新构建（npm run build）后游戏里生效。` : `没存上：${r.error ?? '服务器没开 DEV_LOGIN？'}`);
  };
  const [fog, setFog] = useState(() => (SAVED_FOG.length ? structuredClone(SAVED_FOG) : autoFogSpots(town)));
  const [fogSel, setFogSel] = useState(null);
  const fogHex = town.fog?.color ?? 0xc8c4bc;
  const fogRGB = [(fogHex >> 16) & 255, (fogHex >> 8) & 255, fogHex & 255].join(',');
  const fogCur = fogSel != null ? fog[fogSel] : null;
  const setFogCur = (patch) => setFog((F) => F.map((o, i) => (i === fogSel ? { ...o, ...patch } : o)));
  /** 屏幕上一点 → 地图坐标（斜视角反算）。 */
  const toMap = (clientX, clientY) => {
    const r = box.current.getBoundingClientRect();
    const wx = (clientX - r.left - cam.x) / cam.k; const wy = (clientY - r.top - cam.y) / cam.k;
    return { x: Math.round(wy + wx / 2), y: Math.round(wy - wx / 2) };
  };
  const box = useRef(null);
  const drag = useRef(null);
  const houses = useMemo(() => BMR_RAW.houses.map((h) => place(h, layout[h.id])), [layout]);
  const cur = layout[sel] ?? {};
  const set = (patch) => setLayout((L) => ({ ...L, [sel]: { ...L[sel], ...patch } }));

  // 一开始把整张图放进窗口（等舞台量得出大小再放）
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

  const onFogDown = (e, i) => {
    e.stopPropagation();
    setFogSel(i);
    drag.current = { fog: i, sx: e.clientX, sy: e.clientY, cam, start: { ...fog[i] } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDown = (e, id) => {
    e.stopPropagation();
    if (id) setSel(id);
    // 只有一张图的（墓园）没有外观可单独挪，总是整栋挪
    const single = id && !art(`house-${id}-closed.png`);
    drag.current = { id, mode: single ? 'all' : mode, sx: e.clientX, sy: e.clientY, cam, start: id ? { ...(layout[id] ?? {}) } : null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const mx = e.clientX - d.sx; const my = e.clientY - d.sy;
    if (Math.abs(mx) + Math.abs(my) > 4) d.moved = true;
    if (d.fog != null) {
      const wx = mx / cam.k; const wy = my / cam.k;
      setFog((F) => F.map((o, i) => (i === d.fog ? { ...o, x: Math.round(d.start.x + wy + wx / 2), y: Math.round(d.start.y + wy - wx / 2) } : o)));
      return;
    }
    if (!d.id) { setCam({ ...d.cam, x: d.cam.x + mx, y: d.cam.y + my }); return; }
    // 屏幕上挪了 (wx, wy) 世界像素 → 斜视角反算回地图坐标
    const wx = mx / cam.k; const wy = my / cam.k;
    const dx = wy + wx / 2; const dy = wy - wx / 2;
    const s0 = d.start; const r = Math.round;
    // 整栋：房子（室内 + 能走的地面 + 外观）一起挪；只挪外观：只改外观的单独偏移；只挪室内：房子挪、外观反向补回来留在原地
    const patch = d.mode === 'closed' ? { cdx: r((s0.cdx ?? 0) + dx), cdy: r((s0.cdy ?? 0) + dy) }
      : d.mode === 'open' ? { dx: r((s0.dx ?? 0) + dx), dy: r((s0.dy ?? 0) + dy), cdx: r((s0.cdx ?? 0) - dx), cdy: r((s0.cdy ?? 0) - dy) }
        : { dx: r((s0.dx ?? 0) + dx), dy: r((s0.dy ?? 0) + dy) };
    setLayout((L) => ({ ...L, [d.id]: { ...L[d.id], ...patch } }));
  };
  const onUp = (e) => {
    const d = drag.current; drag.current = null;
    // 地面雾：在空地上点一下（没拖动）就加一团，照着刚才选中的那团的大小浓度来
    if (tool === 'fog' && d && !d.id && d.fog == null && !d.moved) {
      const p = toMap(e.clientX, e.clientY);
      const like = fogCur ?? { w: 480, a: 0.3, f: 0.36 };
      setFogSel(fog.length);
      setFog((F) => [...F, { x: p.x, y: p.y, w: like.w, a: like.a, f: like.f ?? 0.36, ...(like.top ? { top: true } : {}) }]);
    }
  };
  const onWheel = (e) => {
    const r = box.current.getBoundingClientRect();
    const px = e.clientX - r.left; const py = e.clientY - r.top;
    const k2 = Math.max(0.1, Math.min(2, cam.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    setCam({ k: k2, x: px - ((px - cam.x) / cam.k) * k2, y: py - ((py - cam.y) / cam.k) * k2 });
  };

  const saveFog = async () => {
    const r = await postDev('/api/dev/fog/bmr', fog);
    setMsg(r.ok ? `已保存 ${r.count} 团雾到 ${r.path}。重新构建（npm run build）后游戏里生效。` : `没存上：${r.error ?? '服务器没开 DEV_LOGIN？'}`);
  };
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(layout).map(([id, o]) => [id, Object.fromEntries(Object.entries(o).filter(([k, v]) => (['dx', 'dy', 'cdx', 'cdy'].includes(k) ? v !== 0 : v !== 1)))]).filter(([, o]) => Object.keys(o).length));
    const r = await postDev('/api/dev/layout/bmr', clean);
    setMsg(r.ok ? `已保存到 ${r.path}。重新构建（npm run build）、重启服务后游戏里生效。` : `没存上：${r.error ?? '服务器没开 DEV_LOGIN？'}`);
  };

  /** 一组雾团：top=false 贴地（画在房子下面），top=true 盖在房子前面（画在房子上面）。 */
  const fogLayer = (top) => fog.map((o, i) => {
    if (!!o.top !== top) return null;
    const p = iso(o.x, o.y); const h = o.w * (o.f ?? 0.36);
    const mul = top ? town.fog?.topMul ?? 1 : town.fog?.groundMul ?? 1; // 和游戏里一样乘上整层的倍数
    const stops = FOG_BLOB_STOPS.map(([at, a]) => `rgba(${fogRGB},${a * o.a * mul}) ${at * 100}%`).join(', ');
    return (
      <div key={i} className={`le-fog ${tool === 'fog' && fogSel === i ? 'on' : ''}`}
        style={{ left: p.x - o.w / 2, top: p.y - h / 2, width: o.w, height: h, background: `radial-gradient(ellipse closest-side, ${stops})`, outlineWidth: `${2 / cam.k}px` }} />
    );
  });

  // 画的顺序：越靠前（屏幕上越低）越后画
  const order = [...houses].sort((a, b) => (a.x + a.y + a.w + a.h) - (b.x + b.y + b.w + b.h));
  const P = (x, y) => { const p = iso(x, y); return `${p.x},${p.y}`; };

  return (
    <div className="layout-editor">
      <div className="le-stage" ref={box} onPointerDown={(e) => onDown(e, null)} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}>
        <div className="le-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          <img className="le-base" src={art('town-base.webp')} alt="" style={{ left: G.x, top: G.y, width: G.w, height: G.h, filter: toneFilter(tone.map) }} draggable={false} />
          {/* 雾团画在地面和房子之间，和游戏里一样 */}
          {fogLayer(false)}
          {order.map((hs) => {
            const closedSrc = art(`house-${hs.id}-closed-lit.png`) ?? art(`house-${hs.id}-closed.png`);
            const showOpen = view !== 'closed' || !closedSrc;
            const showClosed = view !== 'open' && closedSrc;
            const ro = houseArtRect(hs, hs.openK); const rc = closedArtRect(hs);
            return (
              <span key={hs.id}>
                {showOpen && <img className={`le-house ${tool === 'houses' && sel === hs.id ? 'on' : ''} ${tool === 'fog' ? 'pass' : ''}`} src={art(`house-${hs.id}-open.png`)} alt={hs.name} draggable={false}
                  style={{ left: ro.x, top: ro.y, width: ro.w, height: ro.h, filter: tool === 'houses' && sel === hs.id ? undefined : toneFilter(tone.houses) }} onPointerDown={(e) => onDown(e, hs.id)} />}
                {showClosed && <img className={`le-house ${tool === 'houses' && sel === hs.id ? 'on' : ''} ${tool === 'fog' ? 'pass' : ''}`} src={closedSrc} alt={hs.name} draggable={false}
                  style={{ left: rc.x, top: rc.y, width: rc.w, height: rc.h, opacity: view === 'both' ? 0.5 : 1, filter: tool === 'houses' && sel === hs.id ? undefined : toneFilter(tone.houses) }} onPointerDown={(e) => onDown(e, hs.id)} />}
              </span>
            );
          })}
          {fogLayer(true)}
          {tool === 'fog' && fog.map((o, i) => {
            const p = iso(o.x, o.y); const r = 7 / cam.k;
            return <div key={`h${i}`} className={`le-fog-dot ${fogSel === i ? 'on' : ''}`} style={{ left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, borderWidth: `${1.5 / cam.k}px` }} onPointerDown={(e) => onFogDown(e, i)} />;
          })}
          {tool === 'houses' && <svg className="le-marks" style={{ left: G.x, top: G.y, width: G.w, height: G.h }} viewBox={`${G.x} ${G.y} ${G.w} ${G.h}`}>
            {houses.map((hs) => {
              const [dx, dy] = DOOR[hs.side](hs); const d = { x: dx, y: dy };
              return (
                <g key={hs.id} className={sel === hs.id ? 'on' : ''}>
                  <polygon points={[P(hs.x, hs.y), P(hs.x + hs.w, hs.y), P(hs.x + hs.w, hs.y + hs.h), P(hs.x, hs.y + hs.h)].join(' ')} />
                  <circle cx={iso(d.x, d.y).x} cy={iso(d.x, d.y).y} r={4 / cam.k} />
                </g>
              );
            })}
          </svg>}
        </div>
      </div>
      <aside className="le-panel">
        <div className="le-seg le-tools">
          <button type="button" className={tool === 'houses' ? 'on' : ''} onClick={() => setTool('houses')}>房子</button>
          <button type="button" className={tool === 'fog' ? 'on' : ''} onClick={() => setTool('fog')}>地面雾</button>
          <button type="button" className={tool === 'tone' ? 'on' : ''} onClick={() => setTool('tone')}>色调</button>
        </div>
        {tool === 'tone' ? (
          <>
            <h3>色调</h3>
            <p className="muted">「地图」管手绘底图（连同里面的树、普通建筑、桥、烽火台）和集合广场；「建筑」管 7 间能进的房子（外观和室内）。左边图上马上看到效果。</p>
            {[['map', '地图'], ['houses', '建筑']].map(([g, label]) => (
              <div key={g} className="le-tone">
                <h4>{label} <button type="button" onClick={() => setTone((T) => ({ ...T, [g]: {} }))}>复原</button></h4>
                {TONE_KEYS.map(([k, name, min, max, def, step]) => (
                  <label key={k}>{name} <b>{round(tone[g][k] ?? def)}</b>
                    <input type="range" min={min} max={max} step={step} value={tone[g][k] ?? def} onChange={(e) => setToneKey(g, k, +e.target.value)} />
                  </label>
                ))}
              </div>
            ))}
            <div className="le-btns"><button type="button" className="primary" onClick={saveTone}>保存</button></div>
            {msg && <p className="le-msg">{msg}</p>}
          </>
        ) : tool === 'fog' ? (
          <>
            <h3>地面雾</h3>
            <p className="muted">点地图上任何地方加一团雾（照着选中那团的大小和浓度）；每团雾中间有个小圆点，点圆点选中、拖圆点挪位置；按住空白处拖动看别处。贴地的雾在房子下面，勾了「盖在房子前面」的在房子上面，和游戏里一样。现在一共 {fog.length} 团。</p>
            {fogCur ? (
              <>
                <label>大小 <b>{fogCur.w}</b>
                  <input type="range" min="80" max="1600" step="10" value={fogCur.w} onChange={(e) => setFogCur({ w: +e.target.value })} />
                </label>
                <label>浓度 <b>{round(fogCur.a)}</b>
                  <input type="range" min="0.02" max="0.9" step="0.01" value={fogCur.a} onChange={(e) => setFogCur({ a: +e.target.value })} />
                </label>
                <label>扁度（越小越扁） <b>{round(fogCur.f ?? 0.36)}</b>
                  <input type="range" min="0.12" max="1" step="0.01" value={fogCur.f ?? 0.36} onChange={(e) => setFogCur({ f: +e.target.value })} />
                </label>
                <label className="le-check"><input type="checkbox" checked={!!fogCur.top} onChange={(e) => setFogCur({ top: e.target.checked || undefined })} /> 盖在房子前面（不勾就是贴地，在房子下面）</label>
                <div className="le-btns">
                  <button type="button" onClick={() => { setFog((F) => F.filter((_, i) => i !== fogSel)); setFogSel(null); }}>删掉这团</button>
                </div>
              </>
            ) : <p className="muted">还没选中雾团。</p>}
            <div className="le-btns">
              <button type="button" onClick={() => { if (window.confirm('清空所有雾团？')) { setFog([]); setFogSel(null); } }}>全部清空</button>
              <button type="button" onClick={() => { setFog(autoFogSpots(town)); setFogSel(null); }}>恢复默认摆法</button>
              <button type="button" className="primary" onClick={saveFog}>保存</button>
            </div>
            {msg && <p className="le-msg">{msg}</p>}
          </>
        ) : (<>
        <h3>房子摆放</h3>
        <p className="muted">点房子选中，拖动挪位置；空白处拖动看别处，滚轮缩放。虚线框是走得到的地面，圆点是门。</p>
        <div className="le-seg">
          <button type="button" className={view === 'closed' ? 'on' : ''} onClick={() => setView('closed')}>看外观</button>
          <button type="button" className={view === 'open' ? 'on' : ''} onClick={() => setView('open')}>看室内</button>
          <button type="button" className={view === 'both' ? 'on' : ''} onClick={() => setView('both')}>叠在一起</button>
        </div>
        <div className="le-seg">
          <span className="muted">拖动时挪：</span>
          {[['all', '整栋'], ['closed', '只挪外观'], ['open', '只挪室内']].map(([m, label]) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
        <div className="le-list">
          {houses.map((hs) => <button key={hs.id} type="button" className={sel === hs.id ? 'on' : ''} onClick={() => setSel(hs.id)}>{hs.name}</button>)}
        </div>
        <label>外观大小 <b>{round(cur.closed ?? 1)}</b>
          <input type="range" min="0.5" max="1.8" step="0.01" value={cur.closed ?? 1} onChange={(e) => set({ closed: +e.target.value })} />
        </label>
        <label>室内大小（也是能走的范围） <b>{round(cur.open ?? 1)}</b>
          <input type="range" min="0.5" max="1.8" step="0.01" value={cur.open ?? 1} onChange={(e) => set({ open: +e.target.value })} />
        </label>
        <p className="muted">房子（室内）偏移：{cur.dx ?? 0}, {cur.dy ?? 0}　外观再偏：{cur.cdx ?? 0}, {cur.cdy ?? 0}</p>
        <div className="le-btns">
          <button type="button" onClick={() => setLayout((L) => ({ ...L, [sel]: {} }))}>这间复原</button>
          <button type="button" className="primary" onClick={save}>保存</button>
        </div>
        {msg && <p className="le-msg">{msg}</p>}
        </>)}
      </aside>
    </div>
  );
}
