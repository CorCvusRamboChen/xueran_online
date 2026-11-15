// 金币和「惩罚聊场外」：白天花金币朝某人扔烂番茄、放乌鸦、套毒舌笼头，东西叠在他头上直到这局结束。
// 只买面子，不影响结算。道具定义在 src/shared/pelt.js，扔的规则在 server/room.js 的 pelt()。
import { useState } from 'react';
import { PELT_ITEMS } from '../../src/shared/pelt.js';
import { Panel, Btn } from './ui.jsx';

/** 道具的小图：自己画的，叠在头上也认得出。 */
export function PeltIcon({ item, size = 16 }) {
  if (item === 'tomato') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <ellipse cx="8" cy="9.5" rx="6.5" ry="5.5" fill="#b8322a" />
        <ellipse cx="6" cy="8" rx="1.6" ry="1" fill="#e27a5c" opacity=".7" />
        <path d="M4 13.5c2-1 4 .5 6-.8" stroke="#5c7a2a" strokeWidth="1.2" fill="none" opacity=".8" />
        <path d="M8 4.5 6 2.5M8 4.5l2.5-1.8M8 4.5 8 2" stroke="#3f6b2a" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (item === 'raven') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 11c2.5-.3 4-1.6 5-3.6C8 5.2 9.6 4 11.4 4.3c1 .2 1.6.8 2 1.6l1.6.3-1.4.8c-.3 2.4-2 4.4-4.4 5.1L7.5 14H6l.7-1.8C5 12.6 3.4 12.3 2 11Z" fill="#17161c" stroke="#d8d2c2" strokeWidth=".7" strokeLinejoin="round" />
        <circle cx="11.6" cy="5.6" r=".7" fill="#d9c27a" />
      </svg>
    );
  }
  return ( // 毒舌笼头：箍在头上的铁笼
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 10V7a5 5 0 0 1 10 0v3" stroke="#8b8f96" strokeWidth="1.6" fill="none" />
      <path d="M8 2v9M5 3.2V10M11 3.2V10" stroke="#8b8f96" strokeWidth="1.2" />
      <rect x="2.5" y="9.5" width="11" height="2.4" rx=".6" fill="#6d7178" />
      <path d="M7 12h2v2.6H7z" fill="#5a5d63" />
    </svg>
  );
}

/** 头上叠的一摞：从下往上叠，太多了只画最上面几个再写总数。 */
export function PeltStack({ items, size = 14, max = 6 }) {
  if (!items?.length) return null;
  const shown = items.slice(-max);
  const counts = items.reduce((m, x) => ({ ...m, [x.item]: (m[x.item] ?? 0) + 1 }), {});
  const title = Object.entries(counts).map(([k, n]) => `${PELT_ITEMS[k]?.name ?? k} ×${n}`).join('、');
  return (
    <span className="pelt-stack" title={`被嫌聊场外：${title}`} style={{ '--ps': `${size}px` }}>
      {shown.map((x, i) => <i key={i} className={`ps-${x.item}`} style={{ '--i': i }}><PeltIcon item={x.item} size={size} /></i>)}
      {items.length > max && <b>×{items.length}</b>}
    </span>
  );
}

/** 白天的按钮：「惩罚场外」，旁边写着余额。 */
export function PeltButton({ s, setMode }) {
  if (s.coins == null || s.phase !== 'day' || !s.self || s.phase === 'ended') return null;
  return (
    <div className="btn-row gossip-row">
      <Btn onClick={() => setMode('pelt')} title="有人聊场外？花金币朝他扔点东西，叠在他头上直到这局结束。不影响游戏。">
        惩罚场外 · <PeltIcon item="tomato" size={13} /> {s.coins} 枚金币
      </Btn>
    </div>
  );
}

/** 选人、选东西、扔。 */
export function PeltPanel({ s, act, onClose }) {
  const [target, setTarget] = useState(null);
  const [item, setItem] = useState('tomato');
  const others = s.players.filter((p) => p.id !== s.me);
  const it = PELT_ITEMS[item];
  const poor = (s.coins ?? 0) < it.cost;
  const throwIt = async () => { if (await act('pelt', { target, item })) onClose(); };
  return (
    <Panel title="惩罚场外" tone="phy" extra={<span className="muted">金币 {s.coins ?? 0} 枚 · 今天还能扔 {Math.max(0, s.peltLeft ?? 0)} 次</span>}>
      <p className="lead">有人聊场外？花金币朝他扔点东西：叠在他头上，直到这局结束。全场都看得到是你扔的。不影响游戏。</p>
      <div className="pelt-items">
        {Object.entries(PELT_ITEMS).map(([k, x]) => (
          <button key={k} type="button" className={`pelt-item ${item === k ? 'on' : ''}`} aria-pressed={item === k} onClick={() => setItem(k)} title={x.flavor}>
            <PeltIcon item={k} size={22} /><b>{x.name}</b><small>{x.cost} 枚</small>
          </button>
        ))}
      </div>
      <p className="muted">{it.flavor}</p>
      <div className="boom-picks">
        {others.map((p) => (
          <button key={p.id} type="button" className={`boom-pick ${target === p.id ? 'on' : ''}`} aria-pressed={target === p.id} onClick={() => setTarget(p.id)}>
            <b>{p.seat}号</b><span>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="btn-row">
        <Btn kind="primary" disabled={!target || poor || (s.peltLeft ?? 0) <= 0} onClick={throwIt}>{poor ? `金币不够（要 ${it.cost} 枚）` : `扔（${it.cost} 枚）`}</Btn>
        <Btn kind="ghost" onClick={onClose}>取消</Btn>
      </div>
    </Panel>
  );
}
