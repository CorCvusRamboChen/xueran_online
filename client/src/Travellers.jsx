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
      {!s.vote && !s.pendingNom && <JudgeButtons s={s} act={act} />}
      {me?.canMatron && <MatronSwap s={s} act={act} />}
      {s.bishop && <p className="muted">主教在场：只有说书人可以发起提名。</p>}
      {me?.gnomeAmigo && <p className="muted">侏儒：你的同伴是 {s.players.find((p) => p.id === me.gnomeAmigo)?.seat}号。他被提名时，你可以杀死提名者。</p>}
      {me?.canGiveBeggar && <div className="btn-row gossip-row"><Btn onClick={() => { if (window.confirm('把你唯一的投票标记交给乞丐？给了以后你就不能再投票，乞丐会知道你的阵营。')) act('giveBeggar'); }} title="死亡的玩家可以把投票标记交给乞丐：乞丐会得知你的阵营">把投票标记交给乞丐</Btn></div>}
      {me?.beggarTokens != null && meP?.alive && <p className="muted">乞丐：你只能用别人给的投票标记投票，现在有 {me.beggarTokens} 个。</p>}
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
      {meP && !meP.left && <div className="btn-row"><Btn kind={ex.mine ? 'secondary' : 'primary'} onClick={() => act('exileHand', { up: !ex.mine })}>{ex.mine ? '放下手' : '支持流放 ✋'}</Btn>
        {t?.travellerRole === '怪咖' && <Btn kind={s.laughed ? 'secondary' : 'ghost'} onClick={() => act('laugh', { up: !s.laughed })} title="怪咖：如果他今天表现得很有趣，就不能被流放。一半的人点了，说书人就算他有趣">{s.laughed ? '收回' : '😂 他今天很有趣'}（{s.laughs}）</Btn>}</div>}
    </Panel>
  );
}

/** 屠夫：首次处决后再提名一个人；大家举手（要存活玩家的一半）。 */
export function ButcherPanel({ s, act, g }) {
  const b = s.butcher;
  const secs = useCountdown(b.until);
  const mine = b.by === s.me;
  const targets = s.players.filter((p) => !p.traveller && !p.left && p.id !== b.by);
  return (
    <Panel title="屠夫 · 再提名一次" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      {b.stage === 'pick' ? (mine ? <>
        <p className="lead">今天已经处决过了。你可以再提名一个人（他今天被提名过也行），大家投票，过存活玩家的一半就处决。</p>
        <div className="btn-row gossip-row">{targets.map((p) => <Btn key={p.id} onClick={() => act('butcherNominate', { target: p.id })}>{p.seat}号 {p.name}</Btn>)}</div>
      </> : <p className="lead">屠夫 <b>{g(b.by)?.seat}号 {g(b.by)?.name}</b> 可以再提名一个人……</p>) : <>
        <p className="lead">屠夫提名了 <b>{g(b.target)?.seat}号 {g(b.target)?.name}</b>。赞成处决就举手（死人用幽灵票）。</p>
        <p className="muted">已经 {b.count} 人举手。需要存活玩家的一半，不用超过之前的票数。</p>
        <div className="btn-row"><Btn kind={b.mine ? 'secondary' : 'primary'} onClick={() => act('butcherHand', { up: !b.mine })}>{b.mine ? '放下手' : '赞成处决 ✋'}</Btn></div>
      </>}
    </Panel>
  );
}

/** 侏儒：同伴被提名时，可以杀死提名者（辩护和投票照常）。 */
export function GnomeButton({ s, act, g }) {
  if (!s.self?.canGnome) return null;
  const n = s.pendingNom?.nominator;
  return <div className="btn-row gossip-row"><Btn kind="primary" onClick={() => act('gnome')} title="你的同伴被提名了：你可以杀死提名者">侏儒 · 杀死提名者 {g(n)?.seat}号 {g(n)?.name}</Btn></div>;
}

/** 女舍监：一次选一到三对玩家交换座位。 */
function MatronSwap({ s, act }) {
  const [pairs, setPairs] = useState([['', ''], ['', ''], ['', '']]);
  const ps = s.players.filter((p) => !p.left);
  const set = (i, j, v) => setPairs(pairs.map((pr, k) => (k === i ? pr.map((x, m) => (m === j ? v : x)) : pr)));
  const ready = pairs.filter(([a, b]) => a && b && a !== b);
  const sel = (i, j) => <select value={pairs[i][j]} onChange={(e) => set(i, j, e.target.value)}><option value="">—</option>{ps.map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.name}</option>)}</select>;
  return (
    <div className="traveller-join">
      <p className="lead">女舍监：选一到三对玩家交换座位（每天一次，要一次宣布完）。座位变了，相邻类的能力跟着变。</p>
      {pairs.map((_, i) => <div key={i} className="btn-row">{sel(i, 0)} ⇄ {sel(i, 1)}</div>)}
      <div className="btn-row"><Btn kind="primary" disabled={!ready.length} onClick={() => act('matron', { pairs: ready })}>宣布交换 {ready.length} 对</Btn></div>
    </div>
  );
}

/** 法官：在别人发起的提名进行中，强制处决成功或失败（每局一次）。 */
export function JudgeButtons({ s, act }) {
  if (!s.self?.canJudge) return null;
  return (
    <div className="btn-row gossip-row">
      <Btn onClick={() => act('judge', { pass: true })} title="每局一次：这个人直接被处决，今天的提名到此结束">法官 · 强制成功</Btn>
      <Btn onClick={() => act('judge', { pass: false })} title="每局一次：这次提名算 0 票，提名继续">法官 · 强制失败</Btn>
    </div>
  );
}
