// 旅行者的界面（2026-11-16）：观战的人白天加入；任何人提议流放活着的旅行者、全体举手；旅行者自己离开；
// 枪手、法官的白天按钮。规则在 src/engine/travellers.js 和 server/room.js。
import { useState } from 'react';
import { Panel, Btn } from './ui.jsx';
import { useCountdown } from './util.jsx';

/** 观战的人：以旅行者身份加入（白天）。 */
export function TravellerJoin({ s, act }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  if (!s.canTravel) return null;
  if (!open) {
    return (
      <div className="btn-row gossip-row">
        <Btn kind="primary" onClick={() => setOpen(true)} title="开局后才来的人可以当旅行者加入：说书人决定你的阵营，随时可以离开；别人只能流放你，不能处决你">以旅行者身份加入</Btn>
      </div>
    );
  }
  return (
    <div className="traveller-join">
      <p className="lead">选一个旅行者。<b>你的阵营由说书人决定</b>（大多是善良；邪恶的会知道恶魔是谁）。你的角色和能力会公开，阵营不公开。随时可以离开；别人只能「流放」你，不能处决你。</p>
      <div className="traveller-list">
        {s.travellers.map((t) => (
          <button key={t.id} type="button" disabled={t.taken} className={`traveller-opt ${pick === t.id ? 'on' : ''}`} aria-pressed={pick === t.id} onClick={() => setPick(t.id)}>
            <b>{t.name}{t.taken ? '（已有人）' : ''}</b><span>{t.ability}</span>
          </button>
        ))}
      </div>
      <div className="btn-row">
        <Btn kind="primary" disabled={!pick} onClick={async () => { if (await act('traveller', { role: pick })) setOpen(false); }}>加入</Btn>
        <Btn kind="ghost" onClick={() => setOpen(false)}>取消</Btn>
      </div>
    </div>
  );
}

/** 广场上：提议流放活着的旅行者（每名旅行者每天一次）；旅行者自己可以离开。 */
export function TravellerActions({ s, act, setMode }) {
  const me = s.self;
  const meP = s.players.find((p) => p.id === s.me);
  const live = s.players.filter((p) => p.traveller && p.alive && !p.left && p.id !== s.me && !(s.exiledToday ?? []).includes(p.id)); // 不能提议流放自己
  const canPropose = meP && !meP.left && s.phase === 'day' && !s.exile && !s.vote && !s.pendingNom;
  return (
    <>
      {canPropose && live.length > 0 && (
        <div className="btn-row gossip-row">
          {live.map((p) => <Btn key={p.id} onClick={() => act('exile', { target: p.id })} title="任何人都可以提议流放旅行者（死人也行）。所有人举手，过所有玩家的一半就流放。流放不是处决">提议流放 {p.seat}号 {p.name}</Btn>)}
        </div>
      )}
      {me?.canGun && <div className="btn-row gossip-row"><Btn kind="primary" onClick={() => setMode('gun')}>枪手 · 打死一个投过票的人</Btn></div>}
      {me?.isTraveller && meP?.alive && <div className="btn-row gossip-row"><Btn kind="ghost" onClick={() => { if (window.confirm('确定离开这一局吗？离开后不能再回来。')) act('travellerLeave'); }}>离开这一局（旅行者）</Btn></div>}
    </>
  );
}

/** 流放举手：所有人（死人也算，不消耗投票标记）。 */
export function ExilePanel({ s, act, g }) {
  const ex = s.exile;
  const secs = useCountdown(ex.until);
  const t = g(ex.target);
  const meP = s.players.find((p) => p.id === s.me);
  return (
    <Panel title="流放旅行者" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      <p className="lead">{g(ex.by)?.seat}号 提议流放旅行者 <b>{t?.seat}号 {t?.name}</b>（{t?.travellerRole}）。所有人都可以举手，死人也算、不消耗投票标记。</p>
      <p className="muted">已经 {ex.count} 人支持，需要 {ex.need} 人（所有玩家的一半）。流放不是处决，今天照样可以处决别人。</p>
      {meP && !meP.left && <div className="btn-row"><Btn kind={ex.mine ? 'secondary' : 'primary'} onClick={() => act('exileHand', { up: !ex.mine })}>{ex.mine ? '放下手' : '支持流放 ✋'}</Btn></div>}
    </Panel>
  );
}

/** 法官：在别人发起的提名进行中，强制处决成功或失败（每局一次）。 */
export function JudgeButtons({ s, act }) {
  if (!s.self?.canJudge) return null;
  return (
    <div className="btn-row gossip-row">
      <Btn onClick={() => act('judge', { pass: true })} title="每局一次：这次处决强制成功">法官 · 强制成功</Btn>
      <Btn onClick={() => act('judge', { pass: false })} title="每局一次：这次处决强制失败">法官 · 强制失败</Btn>
    </div>
  );
}
