// 对局右栏的「角色」页：不用再一路往下翻——
// 上面一个搜索框（角色名、英文名、技能里的词都能搜），下面按阵营排好的角色名小块，整个剧本一屏放得下；
// 点一个就在下面展开它的技能，默认展开你自己的角色。打开「多选」可以同时展开好几个角色对着看（比如几个人报的角色）。
// 你在小魔典里猜过某人是这个角色的，小块上会写几号。
import { useEffect, useRef, useState } from 'react';
import { ROLES, TEAM_NAME } from '../../src/engine/roles.js';
import { ROLE_ART } from './art.js';
import { ATTR } from './flavor.js';
import { Glossed } from './terms.jsx';
import { useMarks } from './marks.jsx';
import { AbilityCard } from './AbilityCard.jsx';
import { NightOrder, TEAMS } from './Lobby.jsx';

const has = (id, q) => [ROLES[id].name, ROLES[id].en, ROLES[id].ability].some((t) => t.toLowerCase().includes(q));
const nightsOf = (r) => [r.firstNight > 0 && '首夜醒', r.otherNight > 0 && '每晚醒'].filter(Boolean);
const MULTI_KEY = 'botc.rolesMulti';

export function RoleIndex({ s }) {
  const sc = s.script === 'bmr' ? 'bmr' : 'tb';
  const ids = Object.keys(ROLES).filter((id) => (ROLES[id].script ?? 'tb') === sc);
  const mine = ids.includes(s.self?.role?.id) ? s.self.role.id : null;
  const marks = useMarks(s);
  const guessed = new Map(); // 角色 → 你猜是它的座位号
  for (const p of s.players) {
    const r = marks[p.id]?.role;
    if (r && p.id !== s.me) guessed.set(r, [...(guessed.get(r) ?? []), p.seat]);
  }
  const [q, setQ] = useState('');
  const [multi, setMultiState] = useState(() => { try { return localStorage.getItem(MULTI_KEY) === '1'; } catch { return false; } });
  const [sel, setSel] = useState(mine ? [mine] : []); // 展开的角色，最新点的在最前面
  const [night, setNight] = useState(false);
  const [card, setCard] = useState(null);
  const picked = useRef(null);
  const refs = useRef(new Map());
  const query = q.trim().toLowerCase();
  const hits = ids.filter((id) => !query || has(id, query));
  const setMulti = (v) => {
    setMultiState(v);
    try { localStorage.setItem(MULTI_KEY, v ? '1' : '0'); } catch { /* 隐私模式 */ }
    if (!v) setSel((x) => x.slice(0, 1));
  };
  const tap = (id) => {
    picked.current = id;
    setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : multi ? [id, ...x] : [id]));
  };
  // 单选时搜索：展开第一个搜到的
  const shown = !multi && query && !hits.includes(sel[0]) ? hits.slice(0, 1) : sel;

  // 点了一个角色：它的说明在屏幕下面看不到时，滚到刚好露出来
  useEffect(() => {
    if (picked.current) refs.current.get(picked.current)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    picked.current = null;
  }, [sel]);

  return (
    <section className="ri">
      <div className="ri-top">
        <input className="ri-search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setNight(false); }}
          placeholder="搜角色或技能里的词，比如：中毒、处决" aria-label="搜索角色" />
        <button type="button" className={`ri-night ${multi ? 'on' : ''}`} onClick={() => setMulti(!multi)} title="打开后可以同时展开好几个角色">多选</button>
        <button type="button" className={`ri-night ${night ? 'on' : ''}`} onClick={() => setNight(!night)}>夜间顺序</button>
      </div>
      {night ? <NightOrder script={sc} /> : (
        <>
          {TEAMS.map((t) => {
            const list = hits.filter((id) => ROLES[id].team === t);
            if (!list.length) return null;
            return (
              <div key={t} className="ri-team" style={{ '--attr': ATTR[t].color }}>
                <span className="ri-tlabel">{TEAM_NAME[t]}</span>
                <div className="ri-chips">
                  {list.map((id) => (
                    <button key={id} type="button" className={`ri-chip ${shown.includes(id) ? 'on' : ''} ${id === mine ? 'mine' : ''}`} onClick={() => tap(id)}>
                      {ROLES[id].name}
                      {id === mine && <i>你</i>}
                      {guessed.has(id) && <em>{guessed.get(id).join('、')}号</em>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!hits.length && <p className="muted ri-empty">没有找到「{q}」。</p>}
          {multi && (
            <div className="ri-multi-bar">
              <span>{sel.length ? `已选 ${sel.length} 个角色，点小块可以加减` : '点小块选几个角色，一起对着看'}</span>
              {sel.length > 0 && <button type="button" onClick={() => setSel([])}>清空</button>}
            </div>
          )}
          {shown.map((id) => (
            <RoleDetail key={id} id={id} mine={id === mine} guessed={guessed.get(id)} onCard={() => setCard(id)}
              onClose={multi ? () => setSel((x) => x.filter((y) => y !== id)) : null}
              innerRef={(el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); }} />
          ))}
        </>
      )}
      {card && (
        <div className="sheet-bg" onClick={() => setCard(null)} role="presentation">
          <div className="role-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={ROLES[card].name}>
            <AbilityCard id={card} />
            <button type="button" className="role-modal-close" onClick={() => setCard(null)}>关闭</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** 一个角色的说明：插画、名字、阵营、哪几晚醒、技能全文。多选时右上角有 × 收起。 */
function RoleDetail({ id, mine, guessed, onCard, onClose, innerRef }) {
  const r = ROLES[id];
  return (
    <article ref={innerRef} className="ri-detail" style={{ '--attr': ATTR[r.team].color }}>
      <button type="button" className="ri-art" onClick={onCard} title="看完整的能力牌">
        {ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" /> : null}
      </button>
      <div className="ri-body">
        <header>
          <b>{r.name}</b><small>{r.en}</small>
          <span className="ri-tag">{TEAM_NAME[r.team]}</span>
          {nightsOf(r).map((n) => <span key={n} className="ri-tag night">☾ {n}</span>)}
          {onClose && <button type="button" className="ri-x" onClick={onClose} aria-label={`收起${r.name}`}>×</button>}
        </header>
        <p><Glossed text={r.ability} /></p>
        {mine && <p className="ri-note">这是你的角色。</p>}
        {guessed && <p className="ri-note">小魔典里你猜 {guessed.join('、')} 号是它。</p>}
        <button type="button" className="ri-more" onClick={onCard}>完整能力牌 ▸</button>
      </div>
    </article>
  );
}
