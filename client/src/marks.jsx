// 自己的标记和笔记：右键头像给人打标签（好人 / 可疑 / 邪恶 / 恶魔）、猜他的角色，镇民面板里还能写笔记。
// 只存在自己这台设备上（localStorage），别人看不到。每局一份（按服务器给的局编号），下一局自动清空。
import { useEffect, useState } from 'react';
import { ROLE_NAMES } from './flavor.js';

export const TAGS = {
  good: { label: '好人', color: '#5fb8cf' },
  sus: { label: '可疑', color: '#e2b52c' },
  evil: { label: '邪恶', color: '#d24a3a' },
  demon: { label: '恶魔', color: '#9b111e' },
};

let key = null;
let data = {};
const subs = new Set();

function load(k) {
  if (k === key) return;
  key = k;
  try { data = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {}; } catch { data = {}; }
}

/** 这一局的标记：{ 玩家 id: { tag, role, note } }。 */
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
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* 隐私模式：只在这次打开里有效 */ }
  for (const f of subs) f();
}

const ROLE_OPTIONS = Object.entries(ROLE_NAMES);

/** 右键菜单：打标签、猜角色。at = 屏幕坐标。 */
export function MarkMenu({ player, mark, at, onClose }) {
  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.('.mark-menu')) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const x = Math.min(at.x, window.innerWidth - 220);
  const y = Math.max(8, Math.min(at.y - 150, window.innerHeight - 190));
  return (
    <div className="mark-menu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="mm-title">{player.seat}号 {player.name}</div>
      <div className="mm-tags">
        {Object.entries(TAGS).map(([id, t]) => (
          <button key={id} type="button" className={mark?.tag === id ? 'on' : ''} style={{ '--c': t.color }}
            onClick={() => setMark(player.id, { tag: mark?.tag === id ? null : id })}>{t.label}</button>
        ))}
      </div>
      <label className="mm-role">
        <span>猜他是</span>
        <select value={mark?.role ?? ''} onChange={(e) => setMark(player.id, { role: e.target.value || null })}>
          <option value="">不确定</option>
          {ROLE_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <div className="mm-foot">
        <button type="button" onClick={() => { setMark(player.id, { tag: null, role: null }); onClose(); }}>清除标记</button>
        <button type="button" onClick={onClose}>好</button>
      </div>
    </div>
  );
}

/** 头像旁边的小标记：标签颜色 + 猜的角色。 */
export function MarkBadge({ mark }) {
  if (!mark?.tag && !mark?.role) return null;
  const t = TAGS[mark.tag];
  return (
    <span className="mark-badge" style={{ '--c': t?.color ?? '#9a9688' }}>
      {mark.role ? ROLE_NAMES[mark.role] : t?.label}
    </span>
  );
}
