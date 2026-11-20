// 真人说书的开局排版台（2026-11-20 用户：房主当说书人时，初始排版的界面也要做；之后又说「有点丑」，重排了一版）。
// 左边是一圈座位（像实体魔典：羊皮纸角色标记、座位号、玩家名），右边是改动面板：
// 选中的座位（角色、能力、换角色、对调）→ 酒鬼以为自己是谁、红鲱鱼、恶魔的三个伪装 → 底部「发身份」。
// AI 已经按房间设置排好一版，说书人不改也可以直接发。服务器那边是 server/draft.js。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_ART } from './art.js';
import { ROLES, SCRIPTS, TEAM_NAME } from '../../src/engine/roles.js';
import { Btn } from './ui.jsx';

const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TONE = { townsfolk: 'int', outsider: 'psy', minion: 'phy', demon: 'phy', traveller: 'mot' };

/** 角色标记：羊皮纸圆片 + 角色画，外圈是阵营色。 */
function Token({ role, size = 'md', no = null }) {
  const tone = TONE[role?.team] ?? 'mot';
  return (
    <span className={`dt-token t-${tone} s-${size}`}>
      {ROLE_ART[role?.id] ? <img src={ROLE_ART[role.id]} alt="" /> : <span className="dt-token-ph">{[...(role?.name ?? '?')][0]}</span>}
      {no != null && <span className="dt-no">{no}</span>}
    </span>
  );
}

/** 一个座位：角色标记 + 角色名 + 玩家名，下面挂标签（红鲱鱼、以为是…、新手）。 */
function Seat({ seat, i, n, role, picked, swapping, onPick, tags }) {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2; // 1 号在正上方，顺时针
  return (
    <button type="button" className={`dt-seat${picked ? ' on' : ''}${swapping && !picked ? ' target' : ''}`}
      style={{ '--x': `${50 + 40 * Math.cos(a)}%`, '--y': `${50 + 40 * Math.sin(a)}%` }} onClick={onPick} title={`${i + 1}号 ${seat.name}`}>
      <Token role={role} no={i + 1} />
      <span className={`dt-role c-${TONE[role?.team]}`}>{role?.name ?? '?'}</span>
      <span className="dt-who">{seat.name}</span>
      {tags.length > 0 && <span className="dt-tags">{tags.map((t) => <span key={t} className="dt-tag">{t}</span>)}</span>}
    </button>
  );
}

/** 人数表：每类现在几个 / 人数表要几个，加上在场角色改人数的说明。 */
function Counts({ c }) {
  const off = TEAMS.some((t) => (c.have[t] ?? 0) !== c.base[t]);
  return (
    <div className="dt-counts">
      <div className="dt-count-grid">
        {TEAMS.map((t) => (
          <span key={t} className={`dt-count${(c.have[t] ?? 0) !== c.base[t] ? ' off' : ''}`}>
            <b className={`c-${TONE[t]}`}>{c.have[t] ?? 0}</b>
            <small>{TEAM_NAME[t]}<em>表上 {c.base[t]}</em></small>
          </span>
        ))}
      </div>
      {c.mods.length > 0 && <p className="dt-mods">{c.mods.map((m) => `${m.name} ${m.text}`).join(' · ')}</p>}
      {c.mods.length === 0 && off && <p className="dt-mods warn">和人数表对不上：确定要这样也可以发身份。</p>}
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
  const selRole = sel ? roleOf[sel.role] : null;
  const goodOut = (r) => (r.team === 'townsfolk' || r.team === 'outsider') && !inPlay.has(r.id) && r.id !== 'drunk';
  const tagsOf = (x) => [x.role === 'drunk' && d.drunkAs ? `以为是${roleOf[d.drunkAs]?.name}` : null, x.id === d.redHerring ? '红鲱鱼' : null, x.newbie ? '新手' : null].filter(Boolean);
  return createPortal(
    <div className="dt-modal" role="dialog" aria-label="开局排版">
      <div className="dt-box">
        <header className="dt-head">
          <div className="dt-title">
            <h3>开局排版</h3>
            <p><span className="dt-chip">《{SCRIPTS[d.script]?.name}》</span><span className="dt-chip">{d.seats.length} 人</span><span className="dt-chip">{d.how ?? '说书人改过'}</span></p>
          </div>
          <div className="dt-head-btns">
            <Btn disabled={busy} onClick={() => { setPick(null); run({ op: 'reroll' }); }}>重新排一版</Btn>
            <Btn kind="ghost" disabled={busy} onClick={() => run({ op: 'cancel' })}>不开了</Btn>
          </div>
        </header>
        <p className="dt-lead">AI 先排好了一版。点座位换角色或对调，满意了就发身份；玩家现在只看到「说书人正在排版」。</p>
        <div className="dt-body">
          <div className={`dt-table${swap ? ' swapping' : ''}${d.seats.length > 10 ? ' crowd' : ''}`}>
            <div className="dt-ring" aria-hidden="true" />
            <div className="dt-center">
              <Counts c={d.counts} />
              {d.moved && <p className="dt-mods">提线木偶要挨着恶魔坐，已经自动挪过去了。</p>}
            </div>
            {d.seats.map((x, i) => (
              <Seat key={x.id} seat={x} i={i} n={d.seats.length} role={roleOf[x.role]} picked={pick === i} swapping={swap}
                onPick={() => onSeat(i)} tags={tagsOf(x)} />
            ))}
          </div>

          <aside className="dt-side">
            <section className={`dt-sec dt-pick${sel ? '' : ' empty'}`}>
              {sel ? <>
                <div className="dt-pick-head">
                  <Token role={selRole} size="lg" />
                  <div>
                    <span className="dt-label">{pick + 1}号 · {sel.name}</span>
                    <h4 className={`c-${TONE[selRole?.team]}`}>{selRole?.name}</h4>
                    <span className="dt-team">{TEAM_NAME[selRole?.team]}</span>
                  </div>
                </div>
                {ROLES[sel.role]?.ability && <p className="dt-ability">{ROLES[sel.role].ability}</p>}
                <label className="dt-field">
                  <span className="dt-label">换成</span>
                  <select value={sel.role} disabled={busy} onChange={(e) => run({ op: 'role', i: pick, role: e.target.value })} aria-label="换角色">
                    {roleOptions(d.roles, () => true)}
                  </select>
                </label>
                <p className="dt-note">选一个已经在场的角色，两个座位会对调。</p>
                <div className="dt-btns">
                  <Btn kind={swap ? 'primary' : 'secondary'} onClick={() => setSwap(!swap)}>{swap ? '点另一个座位……' : '和另一个座位对调'}</Btn>
                  <Btn kind="ghost" onClick={() => { setPick(null); setSwap(false); }}>取消选中</Btn>
                </div>
              </> : <p className="dt-note">点一个座位：看能力、换角色、和别人对调。</p>}
            </section>

            {(d.drunkAs || d.redHerring) && (
              <section className="dt-sec">
                {d.drunkAs && (
                  <label className="dt-field">
                    <span className="dt-label">酒鬼以为自己是</span>
                    <span className="dt-row">
                      <Token role={roleOf[d.drunkAs]} size="sm" />
                      <select value={d.drunkAs} disabled={busy} onChange={(e) => run({ op: 'drunkAs', role: e.target.value })} aria-label="酒鬼以为自己是">
                        {roleOptions(d.roles, (r) => r.team === 'townsfolk' && !inPlay.has(r.id) && !['amnesiac', 'cannibal'].includes(r.id))}
                      </select>
                    </span>
                  </label>
                )}
                {d.redHerring && (
                  <label className="dt-field">
                    <span className="dt-label">占卜师的红鲱鱼</span>
                    <select value={d.redHerring} disabled={busy} onChange={(e) => run({ op: 'herring', id: e.target.value })} aria-label="红鲱鱼">
                      {d.seats.map((x, i) => (roleOf[x.role]?.team === 'townsfolk' || roleOf[x.role]?.team === 'outsider') && <option key={x.id} value={x.id}>{i + 1}号 {x.name}（{roleOf[x.role]?.name}）</option>)}
                    </select>
                    <span className="dt-note">占卜师查到他也会看到「是」。要是一名善良玩家。</span>
                  </label>
                )}
              </section>
            )}

            {d.bluffs.length > 0 && (
              <section className="dt-sec">
                <span className="dt-label">恶魔的三个伪装</span>
                <div className="dt-bluffs">
                  {d.bluffs.map((b, k) => (
                    <span key={k} className="dt-row">
                      <Token role={roleOf[b]} size="sm" />
                      <select value={b} disabled={busy} onChange={(e) => run({ op: 'bluff', k, role: e.target.value })} aria-label={`第 ${k + 1} 个伪装`}>
                        {roleOptions(d.roles, (r) => r.id === b || (goodOut(r) && r.id !== d.drunkAs))}
                      </select>
                    </span>
                  ))}
                </div>
                <span className="dt-note">不在场的善良角色。官方建议两个镇民加一个外来者。</span>
              </section>
            )}

            <Btn kind="primary" className="dt-deal" disabled={busy} onClick={() => run({ op: 'go' })}>发身份，开始第一夜</Btn>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
