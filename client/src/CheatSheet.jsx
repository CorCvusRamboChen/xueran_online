// 小地图位置的「技能速查表」：本剧本所有角色的技能，按阵营列在一张小卡片上，像桌游的提示卡。
// 小地图左边的「技能表」按钮切过来，卡片标题栏上的「地图」切回去。
// 每个角色只写一句话简述（roleShort.js），点一行才展开技能全文；「展开 / 缩小」换大小（双击标题栏也行）；按住标题栏能拖到任何地方。位置、大小、开没开着都存在本机。
import { useEffect, useRef, useState } from 'react';
import { ROLES, TEAM_NAME } from '../../src/engine/roles.js';
import { ATTR } from './flavor.js';
import { TEAMS } from './Lobby.jsx';
import { ROLE_SHORT } from './roleShort.js';

const KEY = 'botc.cheatsheet';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...o })); } catch { /* 隐私模式 */ } };

/** 小地图那里显示地图还是技能表。 */
export function useSheetMode() {
  const [on, setOn] = useState(() => !!load().on);
  return [on, (v) => { setOn(v); save({ on: v }); }];
}

export function CheatSheet({ s, onClose }) {
  const sc = s.script === 'bmr' ? 'bmr' : 'tb';
  const ids = Object.keys(ROLES).filter((id) => (ROLES[id].script ?? 'tb') === sc);
  const mine = s.self?.role?.id;
  const [big, setBig] = useState(() => !!load().big);
  const [pos, setPos] = useState(() => load().pos ?? null); // null = 停在小地图的位置
  const [openRow, setOpenRow] = useState(null);
  const ref = useRef(null);
  const drag = useRef(null);

  // 窗口变小时别让卡片跑到屏幕外
  useEffect(() => {
    const fit = () => setPos((p) => (p ? clamp(p, ref.current) : p));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const down = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const box = ref.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, ref.current));
  };
  const up = () => {
    if (drag.current?.moved) setPos((p) => { save({ pos: p }); return p; });
    drag.current = null;
  };
  const toggleBig = () => { setBig(!big); save({ big: !big }); };
  const home = () => { setPos(null); save({ pos: null }); };

  return (
    <div ref={ref} className={`cs ${big ? 'big' : ''} ${pos ? 'moved' : ''}`} style={pos ? { left: pos.x, top: pos.y } : undefined} role="dialog" aria-label="技能速查表">
      <header className="cs-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={toggleBig} title="按住拖动；双击放大 / 缩小">
        <b>技能速查</b>
        <span className="cs-sc">{sc === 'bmr' ? '黯月初升' : '暗流涌动'}</span>
        {pos && <button type="button" onClick={home} title="放回小地图的位置">归位</button>}
        <button type="button" onClick={toggleBig}>{big ? '缩小' : '展开'}</button>
        <button type="button" onClick={onClose} title="换回小地图">地图</button>
      </header>
      <div className="cs-body">
        {TEAMS.map((t) => (
          <section key={t} style={{ '--attr': ATTR[t].color }}>
            <h4>{TEAM_NAME[t]}</h4>
            {ids.filter((id) => ROLES[id].team === t).map((id) => (
              <button key={id} type="button" className={`cs-row ${id === mine ? 'mine' : ''} ${openRow === id ? 'open' : ''}`} onClick={() => setOpenRow(openRow === id ? null : id)}>
                <b>{ROLES[id].name}{id === mine && <i>你</i>}</b>
                <span>{ROLE_SHORT[id] ?? ROLES[id].ability}</span>
                {openRow === id && <small className="cs-full">{ROLES[id].ability}</small>}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function clamp(p, el) {
  const w = el?.offsetWidth ?? 260; const h = el?.offsetHeight ?? 200;
  return { x: Math.max(4, Math.min(window.innerWidth - w - 4, p.x)), y: Math.max(4, Math.min(window.innerHeight - 40, p.y)) };
}
