// 小魔典（自己的标记和笔记）：右键头像 / 镇民面板里给人打标签（镇民 / 外来者 / 爪牙 / 恶魔）、猜他的角色、写笔记，
// 也能给自己记（比如自己打算冒充谁），还能在两个玩家之间连线（信任、怀疑、同伙、对跳、信息指向），广场上画出来。
// 只存在自己这台设备上（localStorage），别人看不到。每局一份（按服务器给的局编号），下一局自动清空。
import { useEffect, useState } from 'react';
import { ROLES } from '../../src/engine/roles.js';
import { ATTR } from './flavor.js';

/** 标签 = 你觉得他是哪一类角色，颜色和游戏里四类角色的主题色一致（镇民蓝、外来者紫、爪牙黄、恶魔红）。 */
export const TAGS = {
  townsfolk: { label: '镇民', color: 'var(--int)' },
  outsider: { label: '外来者', color: 'var(--psy)' },
  minion: { label: '爪牙', color: 'var(--mot)' },
  demon: { label: '恶魔', color: 'var(--phy)' },
};

/** 玩家之间的连线：a → b。 */
export const LINKS = {
  trust: { label: '信任', color: '#5fb8cf', hint: 'A 信任 B / 互保' },
  sus: { label: '怀疑', color: '#e2b52c', hint: 'A 怀疑 B' },
  ally: { label: '同伙', color: '#db5444', hint: 'A 和 B 可能是一伙的' },
  counter: { label: '对跳', color: '#b06adf', hint: 'A 和 B 声称同一个角色' },
  info: { label: '信息', color: '#9ad08a', hint: 'A 的信息指向 B（查过 / 看到 / 选过）' },
};

const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_LABEL = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };

let key = null;
let data = {};
const subs = new Set();

function load(k) {
  if (k === key) return;
  key = k;
  try { data = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {}; } catch { data = {}; }
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* 隐私模式：只在这次打开里有效 */ }
  for (const f of subs) f();
}

/** 这一局的标记：{ 玩家 id: { tag, role, note }, _links: [{ a, b, kind }] }。 */
export function useMarks(s) {
  load(`botc.marks.${s.key}.${s.gameId ?? s.players.map((p) => p.id).join(',')}`);
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return data;
}

export function setMark(id, patch) {
  data = { ...data, [id]: { ...data[id], ...patch } };
  save();
}

export const linksOf = (marks) => marks?._links ?? [];

// 左键连线用的连线类型：镇民面板（小魔典）和广场座位圈共用一个，在哪边切了另一边也跟着变
let linkKind = 'sus';
const kindSubs = new Set();
export function useLinkKind() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    kindSubs.add(f);
    return () => kindSubs.delete(f);
  }, []);
  return [linkKind, (k) => { linkKind = k; for (const f of kindSubs) f(); }];
}

/** 连线类型的一排小按钮。 */
export function LinkKinds({ className = 'mg-kinds' }) {
  const [kind, setKind] = useLinkKind();
  return (
    <div className={className}>
      {Object.entries(LINKS).map(([id, k]) => (
        <button key={id} type="button" className={kind === id ? 'on' : ''} style={{ '--c': k.color }} title={k.hint} onClick={(e) => { e.stopPropagation(); setKind(id); }}>{k.label}</button>
      ))}
    </div>
  );
}
export function addLink(a, b, kind) {
  if (!a || !b || a === b || !LINKS[kind]) return;
  const list = linksOf(data).filter((l) => !(l.a === a && l.b === b && l.kind === kind));
  data = { ...data, _links: [...list, { a, b, kind }] };
  save();
}
export function removeLink(i) {
  const list = [...linksOf(data)];
  list.splice(i, 1);
  data = { ...data, _links: list };
  save();
}

/** 这个剧本的角色，按镇民 / 外来者 / 爪牙 / 恶魔分组。 */
function rolesOfScript(script) {
  const sc = script === 'bmr' ? 'bmr' : 'tb';
  return TEAM_ORDER.map((t) => [t, Object.keys(ROLES).filter((id) => (ROLES[id].script ?? 'tb') === sc && ROLES[id].team === t)]);
}

/** 角色颜色（按阵营）：镇民蓝、外来者紫、爪牙黄、恶魔红。 */
export const roleColor = (id) => (ROLES[id] ? ATTR[ROLES[id].team].color : '#9a9688');

/** 猜角色：只列这个剧本的角色，按阵营上色。 */
export function RolePicker({ script, value, onPick }) {
  return (
    <div className="role-picker">
      <button type="button" className={`rp-none ${!value ? 'on' : ''}`} onClick={() => onPick(null)}>不确定</button>
      {rolesOfScript(script).map(([t, ids]) => (
        <div key={t} className="rp-team" style={{ '--c': ATTR[t].color }}>
          <small>{TEAM_LABEL[t]}</small>
          <div className="rp-roles">
            {ids.map((id) => (
              <button key={id} type="button" className={value === id ? 'on' : ''} onClick={() => onPick(value === id ? null : id)}>{ROLES[id].name}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 从这个人连一条线到别人：先选类型，再选人。已有的连线列在下面，可以删。 */
export function LinkEditor({ s, from, marks }) {
  const [kind, setKind] = useState('sus');
  const mine = linksOf(marks).map((l, i) => ({ ...l, i })).filter((l) => l.a === from || l.b === from);
  const seat = (id) => s.players.find((p) => p.id === id)?.seat;
  return (
    <div className="link-editor">
      <div className="le-kinds">
        {Object.entries(LINKS).map(([id, k]) => (
          <button key={id} type="button" className={kind === id ? 'on' : ''} style={{ '--c': k.color }} title={k.hint} onClick={() => setKind(id)}>{k.label}</button>
        ))}
      </div>
      <select value="" onChange={(e) => { addLink(from, e.target.value, kind); }} aria-label="连到谁">
        <option value="">{`连线（${LINKS[kind].label}）到…`}</option>
        {s.players.filter((p) => p.id !== from).map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.id === s.me ? '你' : p.name}</option>)}
      </select>
      {mine.length > 0 && (
        <div className="le-list">
          {mine.map((l) => (
            <span key={l.i} className="le-chip" style={{ '--c': LINKS[l.kind].color }}>
              {seat(l.a)}号 → {seat(l.b)}号 · {LINKS[l.kind].label}
              <button type="button" onClick={() => removeLink(l.i)} aria-label="删掉这条连线">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 右键菜单：打标签、猜角色、连线。at = 屏幕坐标。 */
export function MarkMenu({ s, player, mark, at, onClose }) {
  const marks = useMarks(s);
  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.('.mark-menu')) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const W = 300;
  const x = Math.max(8, Math.min(at.x, window.innerWidth - W - 8));
  const y = Math.max(8, Math.min(at.y - 150, window.innerHeight - 470));
  // 高度按菜单下面还剩多少地方算，放不下就在菜单里面滚（原来按整屏算，下半截跑到屏幕外、滑不到）
  return (
    <div className="mark-menu" style={{ left: x, top: y, width: W, maxHeight: window.innerHeight - y - 8 }} onContextMenu={(e) => e.preventDefault()}>
      <div className="mm-title">{player.seat}号 {player.id === s.me ? '你自己' : player.name}</div>
      <div className="mm-tags">
        {Object.entries(TAGS).map(([id, t]) => (
          <button key={id} type="button" className={mark?.tag === id ? 'on' : ''} style={{ '--c': t.color }}
            onClick={() => setMark(player.id, { tag: mark?.tag === id ? null : id })}>{t.label}</button>
        ))}
      </div>
      <div className="mm-sub">{player.id === s.me ? '我打算说自己是' : '猜他是'}</div>
      <RolePicker script={s.script} value={mark?.role ?? null} onPick={(r) => setMark(player.id, { role: r })} />
      <div className="mm-sub">笔记</div>
      <textarea className="mm-note" rows={2} value={mark?.note ?? ''} placeholder={player.id === s.me ? '给自己记点什么…' : '他说了什么、自称什么身份…'}
        onChange={(e) => setMark(player.id, { note: e.target.value })} />
      <div className="mm-sub">连线</div>
      <LinkEditor s={s} from={player.id} marks={marks} />
      <div className="mm-foot">
        <button type="button" onClick={() => { setMark(player.id, { tag: null, role: null }); onClose(); }}>清除标记</button>
        <button type="button" onClick={onClose}>好</button>
      </div>
    </div>
  );
}

/** 头像旁边的小标记：标签颜色 + 猜的角色（角色按阵营上色）。 */
export function MarkBadge({ mark }) {
  const t = TAGS[mark?.tag];
  if (!t && !mark?.role) return null;
  return (
    <span className="mark-badge" style={{ '--c': mark.role ? roleColor(mark.role) : t.color, '--ring': t?.color ?? 'transparent' }}>
      {mark.role ? ROLES[mark.role]?.name : t?.label}
    </span>
  );
}

/** 广场上的连线：posOf 给座位中心的像素坐标，w × h 是广场的像素大小；在头像底下画线，箭头指向 b。gap：线两端离头像中心留多远。 */
export function LinkLines({ marks, posOf, w, h, gap = 26 }) {
  const links = linksOf(marks).filter((l) => posOf(l.a) && posOf(l.b));
  if (!links.length) return null;
  return (
    <svg className="town-links" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        {Object.entries(LINKS).map(([id, k]) => (
          <marker key={id} id={`lk-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 z" fill={k.color} />
          </marker>
        ))}
      </defs>
      {links.map((l, i) => {
        const a = posOf(l.a); const b = posOf(l.b);
        // 两端各缩进一点，别压在头像上
        const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const cut = Math.min(gap, len / 3);
        return (
          <line key={i} x1={a.x + (dx / len) * cut} y1={a.y + (dy / len) * cut} x2={b.x - (dx / len) * cut} y2={b.y - (dy / len) * cut}
            stroke={LINKS[l.kind].color} strokeWidth="2.6" strokeOpacity=".9"
            strokeDasharray={l.kind === 'sus' ? '6 4' : undefined} markerEnd={l.kind === 'counter' || l.kind === 'ally' ? undefined : `url(#lk-${l.kind})`} />
        );
      })}
    </svg>
  );
}
