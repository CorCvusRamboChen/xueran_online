// 真人说书的开局排版台（2026-11-20 用户：房主当说书人时，初始排版的界面也要做）。
// 左边是一圈座位（像实体魔典：每个座位一枚角色标记，下面是玩家名），右边是改动面板：
// 点一个座位 → 换角色 / 和另一个座位对调；人数表对照 [+2 外来者] 这类说明；酒鬼以为自己是谁、红鲱鱼、恶魔的三个伪装。
// AI 已经按房间设置排好一版，说书人不改也可以直接「发身份」。服务器那边是 server/draft.js。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_ART } from './art.js';
import { SCRIPTS, TEAM_NAME } from '../../src/engine/roles.js';
import { Btn } from './ui.jsx';

const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TONE = { townsfolk: 'int', outsider: 'psy', minion: 'phy', demon: 'phy', traveller: 'mot' };

function Token({ role, name, small = false }) {
  const tone = TONE[role?.team] ?? 'mot';
  return (
    <span className={`dt-token t-${tone}${small ? ' small' : ''}`}>
      {ROLE_ART[role?.id] ? <img src={ROLE_ART[role.id]} alt="" /> : <span className="dt-token-ph">{[...(name ?? '?')][0]}</span>}
    </span>
  );
}

/** 一个座位：角色标记 + 角色名 + 几号谁。 */
function Seat({ seat, i, n, role, picked, swapFrom, onPick, extra }) {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2; // 1 号在正上方，顺时针
  return (
    <button type="button" className={`dt-seat${picked ? ' on' : ''}${swapFrom ? ' swap' : ''}`}
      style={{ '--x': `${50 + 41 * Math.cos(a)}%`, '--y': `${50 + 41 * Math.sin(a)}%` }} onClick={onPick}>
      <Token role={role} name={role?.name} />
      <span className={`dt-role c-${TONE[role?.team]}`}>{role?.name ?? '?'}</span>
      <span className="dt-who" title={seat.name}>{i + 1}号 {seat.name}</span>
      {extra && <span className="dt-mark">{extra}</span>}
    </button>
  );
}

/** 人数表：每类现在几个 / 人数表要几个，加上在场角色改人数的说明。 */
function Counts({ c }) {
  return (
    <div className="dt-counts">
      {TEAMS.map((t) => {
        const off = c.have[t] !== c.base[t];
        return (
          <span key={t} className={`dt-count c-${TONE[t]}${off ? ' off' : ''}`}>
            <b>{c.have[t] ?? 0}</b><small>/ {c.base[t]}</small> {TEAM_NAME[t]}
          </span>
        );
      })}
      {c.mods.length > 0 && <p className="muted dt-mods">{c.mods.map((m) => `${m.name}：${m.text}`).join(' · ')}</p>}
      {c.mods.length === 0 && TEAMS.some((t) => c.have[t] !== c.base[t]) && <p className="muted dt-mods">和人数表对不上：确定要这样也可以发身份。</p>}
    </div>
  );
}

const roleOptions = (roles, filter) => TEAMS.map((t) => {
  const list = roles.filter((r) => r.team === t && filter(r));
  return list.length ? <optgroup key={t} label={TEAM_NAME[t]}>{list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup> : null;
});

export function StSetup({ d, act }) {
  const [pick, setPick] = useState(null);   // 选中的座位
  const [swap, setSwap] = useState(false);  // 下一次点座位 = 和选中的对调
  const [busy, setBusy] = useState(false);
  const roleOf = Object.fromEntries(d.roles.map((r) => [r.id, r]));
  const inPlay = new Set(d.seats.map((x) => x.role));
  const run = async (p) => { setBusy(true); const ok = await act('draft', p); setBusy(false); return ok; };
  const onSeat = async (i) => {
    if (swap && pick != null && pick !== i) { setSwap(false); await run({ op: 'swap', i: pick, j: i }); setPick(i); return; }
    setSwap(false); setPick(pick === i ? null : i);
  };
  const sel = pick != null ? d.seats[pick] : null;
  const herring = d.seats.find((x) => x.id === d.redHerring);
  const goodOut = (r) => (r.team === 'townsfolk' || r.team === 'outsider') && !inPlay.has(r.id) && r.id !== 'drunk';
  return createPortal(
    <div className="dt-modal" role="dialog" aria-label="开局排版">
      <div className="dt-box">
        <header className="dt-head">
          <div>
            <h3>开局排版</h3>
            <p className="muted">《{SCRIPTS[d.script]?.name}》{d.seats.length} 人 · AI 先排了一版（{d.how ?? '说书人改过'}）。点座位改角色或对调，满意了就发身份。玩家现在只看到「说书人正在排版」。</p>
          </div>
        </header>
        <div className="dt-body">
          <div className={`dt-circle${swap ? ' swapping' : ''}`}>
            <div className="dt-center">
              <Counts c={d.counts} />
              {d.moved && <p className="muted">提线木偶要挨着恶魔坐，已经自动挪过去了。</p>}
            </div>
            {d.seats.map((x, i) => (
              <Seat key={x.id} seat={x} i={i} n={d.seats.length} role={roleOf[x.role]} picked={pick === i} swapFrom={swap && pick === i}
                onPick={() => onSeat(i)}
                extra={[x.role === 'drunk' && d.drunkAs ? `以为是${roleOf[d.drunkAs]?.name}` : null, x.id === d.redHerring ? '红鲱鱼' : null, x.newbie ? '新手' : null].filter(Boolean).join(' · ') || null} />
            ))}
          </div>

          <aside className="dt-side">
            {sel ? (
              <section className="dt-sec">
                <h4>{pick + 1}号 {sel.name}</h4>
                <div className="dt-row">
                  <Token role={roleOf[sel.role]} name={roleOf[sel.role]?.name} small />
                  <select value={sel.role} disabled={busy} onChange={(e) => run({ op: 'role', i: pick, role: e.target.value })} aria-label="换角色">
                    {roleOptions(d.roles, () => true)}
                  </select>
                </div>
                <p className="muted">选一个已经在场的角色，两个座位会对调。</p>
                <div className="dt-btns">
                  <Btn kind={swap ? 'primary' : 'secondary'} onClick={() => setSwap(!swap)}>{swap ? '点另一个座位对调……' : '和另一个座位对调'}</Btn>
                  <Btn kind="ghost" onClick={() => { setPick(null); setSwap(false); }}>取消选中</Btn>
                </div>
              </section>
            ) : <p className="muted dt-hint">点一个座位：换角色、和别人对调。</p>}

            {d.drunkAs && (
              <section className="dt-sec">
                <h4>酒鬼以为自己是</h4>
                <select value={d.drunkAs} disabled={busy} onChange={(e) => run({ op: 'drunkAs', role: e.target.value })} aria-label="酒鬼以为自己是">
                  {roleOptions(d.roles, (r) => r.team === 'townsfolk' && !inPlay.has(r.id) && !['amnesiac', 'cannibal'].includes(r.id))}
                </select>
              </section>
            )}
            {(d.redHerring || herring) && (
              <section className="dt-sec">
                <h4>占卜师的红鲱鱼</h4>
                <select value={d.redHerring ?? ''} disabled={busy} onChange={(e) => run({ op: 'herring', id: e.target.value })} aria-label="红鲱鱼">
                  {d.seats.map((x, i) => (roleOf[x.role]?.team === 'townsfolk' || roleOf[x.role]?.team === 'outsider') && <option key={x.id} value={x.id}>{i + 1}号 {x.name}（{roleOf[x.role]?.name}）</option>)}
                </select>
                <p className="muted">占卜师查到他也会看到「是」。要是一名善良玩家。</p>
              </section>
            )}
            {d.bluffs.length > 0 && (
              <section className="dt-sec">
                <h4>恶魔的三个伪装</h4>
                <div className="dt-bluffs">
                  {d.bluffs.map((b, k) => (
                    <label key={k} className="dt-row">
                      <Token role={roleOf[b]} name={roleOf[b]?.name} small />
                      <select value={b} disabled={busy} onChange={(e) => run({ op: 'bluff', k, role: e.target.value })} aria-label={`第 ${k + 1} 个伪装`}>
                        {roleOptions(d.roles, (r) => r.id === b || (goodOut(r) && r.id !== d.drunkAs))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="muted">不在场的善良角色。官方建议两个镇民加一个外来者。</p>
              </section>
            )}

            <div className="dt-go">
              <Btn kind="primary" disabled={busy} onClick={() => run({ op: 'go' })}>发身份，开始第一夜</Btn>
              <div className="dt-btns">
                <Btn disabled={busy} onClick={() => { setPick(null); run({ op: 'reroll' }); }}>重新排一版</Btn>
                <Btn kind="ghost" disabled={busy} onClick={() => run({ op: 'cancel' })}>不开了，回大厅</Btn>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
