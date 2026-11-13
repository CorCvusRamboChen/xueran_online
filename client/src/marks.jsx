// 小魔典（自己的标记和笔记）：右键头像 / 镇民面板里给人涂个颜色、猜他的角色（可以猜好几个）、贴角标（毒、醉……）、写笔记，
// 也能给自己记（比如自己打算冒充谁），还能在两个玩家之间连线（信任、怀疑、同伙、对跳、信息指向），广场上画出来。
// 存在自己这台设备上（localStorage），别的玩家看不到。每局一份（按服务器给的局编号），下一局自动清空。
// 标签、猜的角色、连线还会悄悄发给服务器存档（笔记和给自己的标记不发），用来线下看大家在想什么，见 src/server/beliefs.js。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLES, SCRIPTS, rolesOf } from '../../src/engine/roles.js';
import { ATTR } from './flavor.js';
import { getDisplay } from './display.js';

/**
 * 颜色：给人涂一个颜色，头像框跟着变。界面上只写颜色，不写代表什么（2026-11-12 用户：颜色就只是颜色，别告诉玩家有什么意义）。
 * id 沿用旧的四类（旧存档、服务器的 beliefs.js 都按这个存）。
 */
export const TAGS = {
  townsfolk: { label: '蓝', color: 'var(--int)' },
  outsider: { label: '紫', color: 'var(--psy)' },
  minion: { label: '黄', color: 'var(--mot)' },
  demon: { label: '红', color: 'var(--phy)' },
};

/** 角标：贴在头像角上的小圆字，可以同时贴好几个（2026-11-12 用户：多一个毒，还有各种角标）。 */
export const CHIPS = {
  poison: { label: '毒', hint: '中毒', color: '#6fbf4a' },
  drunk: { label: '醉', hint: '醉酒', color: '#c98a3c' },
  protect: { label: '护', hint: '被保护', color: '#5fb8cf' },
  kill: { label: '刀', hint: '可能被恶魔盯上', color: '#db5444' },
  mad: { label: '疯', hint: '疯狂', color: '#b06adf' },
  check: { label: '查', hint: '查验过 / 被查过', color: '#9ad08a' },
  real: { label: '真', hint: '信息是真的', color: '#e9e4d8' },
  fake: { label: '假', hint: '信息是假的 / 在说谎', color: '#8a8478' },
  claim: { label: '跳', hint: '跳过身份', color: '#e2b52c' },
  ask: { label: '?', hint: '存疑', color: '#c9c3b5' },
};

/** 猜的角色（可以好几个）。旧存档只有一个 role。 */
export const rolesOfMark = (m) => (Array.isArray(m?.roles) ? m.roles : m?.role ? [m.role] : []).filter((r) => ROLES[r]);
export const chipsOfMark = (m) => (Array.isArray(m?.chips) ? m.chips : []).filter((c) => CHIPS[c]);

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
let gameId = null;
let me = null;
let sink = null; // App 给的发送函数
let sendTimer = null;
const SEND_DELAY = 4000;
const subs = new Set();

/** 不打断操作：停手几秒后发一份全量，服务器只记变化。 */
function sendSoon() {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    if (!sink || !gameId) return;
    const { _links, ...people } = data;
    const tags = {};
    // 服务器那边一人只记一个角色：发猜的第一个
    for (const [id, m] of Object.entries(people)) if (id !== me && (m?.tag || rolesOfMark(m).length)) tags[id] = { tag: m.tag ?? null, role: rolesOfMark(m)[0] ?? null };
    sink({ gameId, tags, links: _links ?? [] });
  }, SEND_DELAY);
}

export function setMarksSink(fn) { sink = fn; }

function load(k, s) {
  gameId = s.gameId ?? null;
  me = s.me ?? null;
  if (k === key) return;
  key = k;
  try { data = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {}; } catch { data = {}; }
  if (Object.keys(data).length) sendSoon(); // 断线重进：把离线时记的补上
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* 隐私模式：只在这次打开里有效 */ }
  for (const f of subs) f();
  sendSoon();
}

/** 这一局的标记：{ 玩家 id: { tag, roles, role（= roles[0]，旧字段）, chips, note }, _links: [{ a, b, kind }] }。 */
export function useMarks(s) {
  load(`botc.marks.${s.key}.${s.gameId ?? s.players.map((p) => p.id).join(',')}`, s);
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

/** 改猜的角色（一组）：role 跟着写成第一个，旧代码和服务器都只看它。 */
export const setRoles = (id, roles) => setMark(id, { roles, role: roles[0] ?? null });

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
  const sc = SCRIPTS[script] ? script : 'tb';
  return TEAM_ORDER.map((t) => [t, rolesOf(sc, t)]);
}

/** 角色颜色（按阵营）：镇民蓝、外来者紫、爪牙黄、恶魔红。 */
export const roleColor = (id) => (ROLES[id] ? ATTR[ROLES[id].team].color : '#9a9688');

/** 猜角色：只列这个剧本的角色，按阵营上色。multi：可以点好几个（value 是数组，onPick 给新的数组）。 */
export function RolePicker({ script, value, onPick, multi = false }) {
  const on = (id) => (multi ? value.includes(id) : value === id);
  const pick = (id) => (multi ? onPick(value.includes(id) ? value.filter((r) => r !== id) : [...value, id]) : onPick(value === id ? null : id));
  const none = multi ? !value.length : !value;
  return (
    <div className="role-picker">
      <button type="button" className={`rp-none ${none ? 'on' : ''}`} onClick={() => onPick(multi ? [] : null)}>不确定</button>
      {rolesOfScript(script).map(([t, ids]) => (
        <div key={t} className="rp-team" style={{ '--c': ATTR[t].color }}>
          <small>{TEAM_LABEL[t]}</small>
          <div className="rp-roles">
            {ids.map((id) => (
              <button key={id} type="button" className={on(id) ? 'on' : ''} onClick={() => pick(id)}>{ROLES[id].name}</button>
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
  // 字号缩放（--ui-zoom）连定位坐标一起放大：下面先按屏幕像素算好，写进样式时除回去
  const z = getDisplay().scale;
  const W = Math.min(300, (window.innerWidth - 16) / z);
  const x = Math.max(8, Math.min(at.x, window.innerWidth - W * z - 8));
  const y = Math.max(8, Math.min(at.y - 150, window.innerHeight - 470 * z));
  // 高度按菜单下面还剩多少地方算，放不下就在菜单里面滚（原来按整屏算，下半截跑到屏幕外、滑不到）
  // 挂到 body 上：放在镇民面板里会吃到面板的缩放
  return createPortal(
    <div className="mark-menu" style={{ left: x / z, top: y / z, width: W, maxHeight: (window.innerHeight - y - 8) / z }} onContextMenu={(e) => e.preventDefault()}>
      <div className="mm-title">{player.seat}号 {player.id === s.me ? '你自己' : player.name}</div>
      <div className="mm-tags">
        {Object.entries(TAGS).map(([id, t]) => (
          <button key={id} type="button" className={mark?.tag === id ? 'on' : ''} style={{ '--c': t.color }} aria-label={t.label}
            onClick={() => setMark(player.id, { tag: mark?.tag === id ? null : id })}>{t.label}</button>
        ))}
      </div>
      <div className="mm-sub">角标（可以贴好几个）</div>
      <div className="mm-chips">
        {Object.entries(CHIPS).map(([id, c]) => {
          const has = chipsOfMark(mark).includes(id);
          return (
            <button key={id} type="button" className={has ? 'on' : ''} style={{ '--c': c.color }} title={c.hint} aria-label={c.hint} aria-pressed={has}
              onClick={() => setMark(player.id, { chips: has ? chipsOfMark(mark).filter((x) => x !== id) : [...chipsOfMark(mark), id] })}>{c.label}</button>
          );
        })}
      </div>
      <div className="mm-sub">{player.id === s.me ? '我打算说自己是' : '猜他是（可以点好几个）'}</div>
      <RolePicker multi script={s.script} value={rolesOfMark(mark)} onPick={(rs) => setRoles(player.id, rs)} />
      <div className="mm-sub">笔记</div>
      <textarea className="mm-note" rows={2} value={mark?.note ?? ''} placeholder={player.id === s.me ? '给自己记点什么…' : '他说了什么、自称什么身份…'}
        onChange={(e) => setMark(player.id, { note: e.target.value })} />
      <div className="mm-sub">连线</div>
      <LinkEditor s={s} from={player.id} marks={marks} />
      <div className="mm-foot">
        <button type="button" onClick={() => { setMark(player.id, { tag: null, role: null, roles: [], chips: [] }); onClose(); }}>清除标记</button>
        <button type="button" onClick={onClose}>好</button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 头像旁边的小标记：猜的每个角色一个名字方块（各按自己的阵营上色，一个叠一个，2026-11-12 用户：不要混在一起）；
 * 只涂了颜色就是一小条色块；加上右上角的角标小圆字。--i：第几个方块，绝对定位的地方按它往外错开。
 * part：'roles' 只画名字方块（放在玩家名字下面用，2026-11-12 用户），'chips' 只画角标，默认都画。
 */
export function MarkBadge({ mark, part = 'all' }) {
  const t = TAGS[mark?.tag];
  const roles = part === 'chips' ? [] : rolesOfMark(mark);
  const chips = part === 'roles' ? [] : chipsOfMark(mark);
  const swatch = part !== 'chips' && t && !roles.length;
  if (!swatch && !roles.length && !chips.length) return null;
  return (
    <>
      {roles.map((r, i) => (
        <span key={r} className="mark-badge" style={{ '--c': roleColor(r), '--ring': t?.color ?? 'transparent', '--i': i }} title={ROLES[r].name}>
          {ROLES[r].name}
        </span>
      ))}
      {swatch && <span className="mark-badge swatch" style={{ '--c': t.color, '--ring': t.color }} />}
      {chips.length > 0 && (
        <span className="mark-chips" aria-label={chips.map((c) => CHIPS[c].hint).join('、')}>
          {chips.map((c) => <b key={c} style={{ '--c': CHIPS[c].color }} title={CHIPS[c].hint}>{CHIPS[c].label}</b>)}
        </span>
      )}
    </>
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
