// 大厅：参考极乐迪斯科主菜单——手绘的雪夜小镇铺满首屏，左边大标题和一列竖排菜单；
// 右边是镇民名册（带阵营构成）、挑形象、房间设置（按夜晚 / 白天分组）。
import { Portrait } from './util.jsx';
import { CHARACTERS } from '../../src/shared/characters.js';
import { Tag, Panel, Btn } from './ui.jsx';
import { ClockTower, Tree, Lamp, House, MAP_COLORS as C, INK } from './art/TownArt.jsx';
import { SCENE_ART, ROLE_ART } from './art.js';
import { ROLES, TEAM_NAME } from '../../src/engine/roles.js';
import { ATTR } from './flavor.js';
import { AbilityCard } from './AbilityCard.jsx';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Replay, VoteHistory } from './replay.jsx';
import { SETUPS } from '../../src/shared/setups.js';

// 标题画上的四栋房子（和游戏地图同一套画法）
const hero = (id, name, x, y, w, h, side) => {
  const door = side === 'bottom' ? { x: x + w / 2, y: y + h, nx: 0, ny: 1 } : { x: x + w / 2, y, nx: 0, ny: -1 };
  return { id, name, x, y, w, h, side, door };
};
const HERO_HOUSES = [
  hero('tavern', '酒馆', 560, 24, 150, 96, 'bottom'),
  hero('church', '教堂', 620, 176, 140, 96, 'top'),
  hero('library', '图书馆', 230, 20, 120, 92, 'bottom'),
  hero('bakery', '面包房', 150, 180, 130, 92, 'top'),
];

// 与服务器 roles.js 的 DISTRIBUTION 一致
const DIST = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};

export function Lobby({ s, act, ask, onTutorial }) {
  const host = s.isHost;
  const st = s.settings;
  const joined = s.lobby.some((p) => p.id === s.me);
  const n = s.lobby.length;
  const d = DIST[n];
  const set = (patch) => act('settings', patch);
  const human = st.mode === 'human';

  const art = SCENE_ART['lobby-hero'];
  return (
    <div className="lobby">
      {/* 背景：手绘的雪夜钟楼镇铺满首屏，左边和下面压暗 */}
      <div className="lobby-bg" aria-hidden="true">
        {art ? <img src={art} alt="" /> : (
          <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
            <rect width="800" height="300" fill={C.void} />
            <rect x="6" y="6" width="788" height="288" fill={C.land} stroke={INK} strokeDasharray="14 3 6 3" />
            <rect width="800" height="300" fill="url(#grain)" />
            {HERO_HOUSES.map((h) => <line key={h.id} x1="430" y1="170" x2={h.door.x} y2={h.door.y + h.door.ny * 12} stroke={C.street} strokeWidth="36" strokeLinecap="round" />)}
            <circle cx="430" cy="170" r="96" fill="url(#cob)" stroke={INK} strokeWidth="1.3" />
            {[48, 39, 30].map((rr, i) => (
              <g key={rr}><circle cx="430" cy="173" r={rr} fill="#9d9a90" /><circle cx="430" cy="170" r={rr} fill={['#dcdad2', '#e4e2db', '#eceae4'][i]} stroke={INK} strokeWidth="1.1" /></g>
            ))}
            <g transform="translate(430 170) scale(1.3) translate(-430 -170)"><ClockTower x={430} y={170} /></g>
            {HERO_HOUSES.map((h) => <House key={h.id} h={h} />)}
            <Tree x={300} y={60} /><Tree x={560} y={250} /><Tree x={760} y={150} /><Tree x={330} y={262} />
            <Lamp x={360} y={120} /><Lamp x={500} y={232} />
          </svg>
        )}
      </div>

      <div className="lobby-main">
        {/* 左：标题 + 竖排菜单（像原作主菜单） */}
        <section className="lobby-left">
          <div className="hero-title">
            <h1 className="title">血染钟楼</h1>
            <Tag tone="dark">暗流涌动 · TROUBLE BREWING</Tag>
          </div>
          <nav className="menu">
            {!(human && host) && (joined
              ? <Btn kind="secondary" className="menu-item" onClick={() => act('leave')}>离开座位</Btn>
              : <Btn kind="primary" className="menu-item" onClick={() => act('join')}>加入游戏</Btn>)}
            {host && <Btn kind={n >= 5 ? 'primary' : 'secondary'} className="menu-item" disabled={n < 5} onClick={() => act('start')}>开始游戏{n < 5 ? `（还差 ${5 - n} 人）` : ''}</Btn>}
            {host && <Btn className="menu-item" onClick={() => act('addBots', { count: 1 })}>加一个机器人玩家</Btn>}
            {!host && !s.hostOnline && <Btn className="menu-item" onClick={() => act('claimHost')}>房主不在，接管房主</Btn>}
            {!host && s.hostOnline && <p className="menu-wait">等房主开始……</p>}
            {onTutorial && <Btn className="menu-item menu-tut" onClick={onTutorial}>新手教程（单人练习，约 5 分钟）</Btn>}
          </nav>
          <ul className="lobby-tips">
            <li>大家先进同一个语音频道，<b>房主也要在里面</b>——机器人会把它当成城镇广场。</li>
            <li>从<b>文字频道</b>的应用启动器打开：进房子私聊时被拉去别的语音频道，也不会掉线。</li>
          </ul>
        </section>

        {/* 右：镇民、形象、房间设置 */}
        <section className="lobby-right">
          <Panel title="镇民" className="glass" extra={<span className="muted">{n} / 15</span>}>
            <DistBar n={n} d={d} />
            {n ? (
              <div className="lobby-roster">
                {s.lobby.map((p, i) => (
                  <div key={p.id} className={`lr-item ${p.id === s.me ? 'me' : ''}`}>
                    <Portrait p={p} size={52} frame={p.id === s.me ? 'var(--mot)' : '#f4f4f0'} />
                    <span className="lr-seat">{i + 1}</span>
                    <span className="lr-name">{p.id === s.me ? '你' : p.name}</span>
                    {host && p.id !== s.me && <button type="button" className="kick" onClick={() => act('kick', { target: p.id })} aria-label="请他离开">×</button>}
                  </div>
                ))}
              </div>
            ) : <p className="muted">广场上还空无一人。</p>}
            <Watchers s={s} hint={!joined ? '你现在在观战席。点「加入游戏」坐下；不加入就是观战，开局后能看广场和投票，看不到别人的身份。' : null} />
          </Panel>

          {joined && <CharacterPicker s={s} act={act} />}
          {/* 衣柜（3D 小人换装）先隐藏：<Wardrobe s={s} act={act} /> */}

          <Panel title="房间设置" className="glass" extra={!host ? <span className="muted">只有房主能改</span> : null}>
            <div className="setting mode-row">
              <span>剧本</span>
              <div className="seg">
                <button type="button" className={st.script !== 'bmr' ? 'on' : ''} disabled={!host} onClick={() => set({ script: 'tb' })}>暗流涌动</button>
                <button type="button" className={st.script === 'bmr' ? 'on' : ''} disabled={!host} onClick={() => set({ script: 'bmr' })}>黯月初升</button>
              </div>
            </div>
            <p className="muted setting-note">{st.script === 'bmr' ? '《黯月初升》：中等难度的"死亡盛宴"——恶魔一夜可能杀多人，好人有很多保命和复活手段。推荐 7 人及以上。' : '《暗流涌动》：入门剧本，信息多、规则直白，推荐第一次玩。'}</p>
            <div className="setting mode-row">
              <span>配置</span>
              <select className="preset-select" value={st.preset ?? ''} disabled={!host} onChange={(e) => set({ preset: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">按人数随机抽角色</option>
                {(SETUPS[st.script ?? 'tb'] ?? []).map((x, i) => <option key={i} value={i}>官方八人推荐 {i + 1}：{x.name}</option>)}
              </select>
            </div>
            {st.preset != null && SETUPS[st.script ?? 'tb']?.[st.preset] && (
              <p className="muted setting-note">{n === 8 ? '' : '（只在正好 8 人时生效，现在会按人数随机）'}{SETUPS[st.script ?? 'tb'][st.preset].note}</p>
            )}
            <div className="setting mode-row">
              <span>说书人</span>
              <div className="seg">
                <button type="button" className={!human ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'auto' })}>AI 房主</button>
                <button type="button" className={human ? 'on' : ''} disabled={!host} onClick={() => set({ mode: 'human' })}>真人说书</button>
              </div>
            </div>
            <p className="muted setting-note">{human ? '房主看魔典、审核每条夜间信息；机器人负责发身份、叫人、跑流程。' : 'AI 房主全自动：发身份、夜里叫人、像真人说书人一样做判定、给提名和投票计时、用语音播报旁白，不需要人主持。'}</p>
            <div className="setting-groups">
              <div className="setting-group">
                <h4>夜晚</h4>
                <Toggle label="闭麦闭耳" on={st.nightDeafen} disabled={!host} onChange={(v) => set({ nightDeafen: v })} />
                <Toggle label="发言时其他人闭麦" on={st.speechMute} disabled={!host} onChange={(v) => set({ speechMute: v })} />
                <Select label="选人时限" value={st.chooseSeconds} disabled={!host} options={[45, 60, 90, 120, 180]} unit="秒" onChange={(v) => set({ chooseSeconds: v })} />
                <Toggle label="随机排座位" on={st.shuffle} disabled={!host} onChange={(v) => set({ shuffle: v })} />
              </div>
              <div className="setting-group">
                <h4>白天</h4>
                <Select label="自由活动" value={st.roamMinutes} disabled={!host} options={[2, 3, 5, 8, 10, 0]} unit="分钟" zero="不限时" onChange={(v) => set({ roamMinutes: v })} />
                <Select label="提名环节" value={st.nominateMinutes} disabled={!host} options={[2, 3, 5, 8, 10]} unit="分钟" onChange={(v) => set({ nominateMinutes: v })} />
                <Select label="提名理由" value={st.accuseSeconds} disabled={!host} options={[15, 30, 60, 90, 120]} unit="秒" onChange={(v) => set({ accuseSeconds: v })} />
                <Select label="辩护时间" value={st.defendSeconds} disabled={!host} options={[30, 60, 90, 120, 180]} unit="秒" onChange={(v) => set({ defendSeconds: v })} />
                <Toggle label="提名者自动投一票" on={st.nominatorVotes} disabled={!host} onChange={(v) => set({ nominatorVotes: v })} />
                <Toggle label="小局也互认、发伪装" on={st.smallEvilInfo} disabled={!host} onChange={(v) => set({ smallEvilInfo: v })} />
                <Toggle label="爪牙共用恶魔的 3 个伪装" on={st.minionBluffs} disabled={!host} onChange={(v) => set({ minionBluffs: v })} />
                <Toggle label="投票时隐藏票型（投完公开）" on={st.hideVotes} disabled={!host} onChange={(v) => set({ hideVotes: v })} />
                <Toggle label="观战者能看魔典（所有身份）" on={st.spectatorGrimoire} disabled={!host} onChange={(v) => set({ spectatorGrimoire: v })} />
                <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} disabled={!host} onChange={(v) => set({ muteSpectators: v })} />
                <Select label="投票时钟每人" value={st.voteSeconds} disabled={!host} options={[1, 2, 3, 4, 5]} unit="秒" onChange={(v) => set({ voteSeconds: v })} />
              </div>
            </div>
          </Panel>
        </section>

        <PastGames ask={ask} />
        <RoleShowcase script={st.script} />
      </div>
    </div>
  );
}

/** 观战席：在线但没坐下的人。 */
export function Watchers({ s, hint }) {
  const list = s.watchers ?? [];
  if (!list.length && !hint) return null;
  return (
    <div className="watchers">
      <span className="w-label">观战 {list.length} 人</span>
      <span className="w-faces">{list.map((u) => <Portrait key={u.id} p={u} size={22} prefer="avatar" speak={false} frame={u.id === s.me ? 'var(--mot)' : '#9a9688'} />)}</span>
      {hint && <p className="muted w-hint">{hint}</p>}
    </div>
  );
}

/** 往期对局：这个服务器最近打完的局，点开看所有人身份、票型和整局复盘。 */
function PastGames({ ask }) {
  const [games, setGames] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { ask?.('history').then((r) => setGames(r?.games ?? [])); }, []);
  if (!games?.length) return null;
  const show = async (id) => { const r = await ask('pastGame', { id }); if (r?.game) setOpen(r.game); };
  const when = (t) => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="lobby-roles glass pnl past-games">
      <header className="roles-head"><h2>往期对局</h2><p className="muted">这个服务器最近打完的局。点开看所有人的身份、票型和整局复盘。</p></header>
      <ul className="pg-list">
        {games.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => show(g.id)}>
              <span className={`pg-win ${g.winner}`}>{g.winner === 'good' ? '善良胜' : '邪恶胜'}</span>
              <span className="pg-when">{when(g.endedAt)}</span>
              <span className="pg-meta">{g.players.length} 人 · {g.days} 天</span>
              <span className="pg-reason">{g.reason}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && createPortal(<PastGame game={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  );
}

function PastGame({ game, onClose }) {
  const g = (id) => game.players.find((p) => p.id === id);
  const name = (id) => { const p = g(id); return p ? `${p.seat}号 ${p.name}` : '?'; };
  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="role-modal past-game" onClick={(e) => e.stopPropagation()}>
        <h3>{game.winner === 'good' ? '善良阵营获胜' : '邪恶阵营获胜'} · {game.reason}</h3>
        <div className="pg-players">
          {game.players.map((p) => (
            <div key={p.id} className={`pg-p team-${ROLES[p.role]?.team}`}>
              <Portrait p={p} size={36} prefer="avatar" frame={['minion', 'demon'].includes(ROLES[p.role]?.team) ? 'var(--phy)' : '#f4f4f0'} />
              <span><b>{p.seat}号 {p.name}</b><small>{ROLES[p.role]?.name}{p.role === 'drunk' ? `（以为是${ROLES[p.shownRole]?.name}）` : ''}{p.alive ? '' : ' · 死亡'}</small></span>
            </div>
          ))}
        </div>
        {game.votes?.length > 0 && <details><summary>票型 · {game.votes.length} 次投票</summary><VoteHistory votes={game.votes} g={g} name={name} /></details>}
        <Replay timeline={game.timeline ?? []} />
        <button type="button" className="role-modal-close" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_HINT = {
  townsfolk: '善良阵营。每人有一个有用的能力，帮大家找出恶魔。',
  outsider: '善良阵营，但能力往往帮倒忙。',
  minion: '邪恶阵营。知道谁是恶魔，帮他藏身、搅乱信息。',
  demon: '邪恶阵营的核心。每晚杀一个人；恶魔死了，善良就赢了。',
};

/** 首页：暗流涌动全部 22 个角色的技能。可以按阵营筛选，点一张看完整的能力牌。 */
export function RoleShowcase({ compact = false, script = 'tb' }) {
  const sc = script === 'bmr' ? 'bmr' : 'tb';
  const ids = Object.keys(ROLES).filter((id) => ROLES[id].script === sc);
  const [team, setTeam] = useState('all');
  const [open, setOpen] = useState(null);
  const shown = TEAMS.filter((t) => team === 'all' || team === t);
  return (
    <section className={compact ? 'roles-compact' : 'lobby-roles glass pnl'}>
      <header className="roles-head">
        <div>
          <h2>{sc === 'bmr' ? '黯月初升' : '暗流涌动'} · 全部角色</h2>
          <p className="muted">这个剧本一共 {ids.length} 个角色，每局按人数抽一部分。开局前先认识一下大家可能拿到什么。</p>
        </div>
        <div className="seg roles-tabs">
          <button type="button" className={team === 'all' ? 'on' : ''} onClick={() => setTeam('all')}>全部</button>
          {TEAMS.map((t) => (
            <button key={t} type="button" className={team === t ? 'on' : ''} onClick={() => setTeam(t)}>{TEAM_NAME[t]}</button>
          ))}
        </div>
      </header>
      {shown.map((t) => (
        <div key={t} className="roles-team">
          <h3 style={{ color: ATTR[t].color }}>{TEAM_NAME[t]}<small>{TEAM_HINT[t]}</small></h3>
          <div className="roles-grid">
            {ids.filter((id) => ROLES[id].team === t).map((id) => (
              <button key={id} type="button" className="role-tile" style={{ '--attr': ATTR[t].color }} onClick={() => setOpen(id)}>
                <span className="rt-art">{ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" loading="lazy" /> : null}</span>
                <span className="rt-body">
                  <b>{ROLES[id].name}<i>{ROLES[id].en}</i></b>
                  <span>{ROLES[id].ability}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(null)} role="presentation">
          <div className="role-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={ROLES[open].name}>
            <AbilityCard id={open} />
            <button type="button" className="role-modal-close" onClick={() => setOpen(null)}>关闭</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** 人数对应的阵营构成：一条四色的条，下面写数字。 */
function DistBar({ n, d }) {
  if (!d) return <p className="muted dist-empty">{n < 5 ? `至少 5 人开局（现在 ${n} 人）` : '最多 15 人'}</p>;
  const parts = [['镇民', d[0], 'var(--int)'], ['外来者', d[1], 'var(--psy)'], ['爪牙', d[2], '#c9762e'], ['恶魔', d[3], 'var(--phy)']];
  return (
    <div className="dist">
      <div className="dist-bar">{parts.map(([k, v, c]) => v > 0 && <i key={k} style={{ flex: v, background: c }} />)}</div>
      <div className="dist-legend">{parts.map(([k, v, c]) => <span key={k}><b style={{ color: c }}>{v}</b>{k}</span>)}</div>
    </div>
  );
}

function Toggle({ label, on, disabled, onChange }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <button type="button" className={`switch ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}><i /></button>
    </label>
  );
}

function Select({ label, value, options, unit, zero, disabled, onChange }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o) => <option key={o} value={o}>{o === 0 && zero ? zero : `${o} ${unit}`}</option>)}
      </select>
    </label>
  );
}

/** 挑一个人物形象（同一个人物只能一个人用）。 */
function CharacterPicker({ s, act }) {
  const me = s.lobby.find((p) => p.id === s.me);
  const mine = me?.char ?? null;
  return (
    <Panel title="你的形象" className="glass" extra={<span className="muted">在小镇里你就长这样</span>}>
      <div className="char-grid">
        <button type="button" className={`char ${!mine ? 'on' : ''}`} onClick={() => act('character', { id: null })}>
          <Portrait p={{ ...me, char: null }} size={54} frame={!mine ? 'var(--red)' : '#f4f4f0'} />
          <span>Discord 头像</span>
        </button>
        {CHARACTERS.map((c) => {
          const holder = s.lobby.find((p) => p.char === c.id && p.id !== s.me);
          const on = mine === c.id;
          return (
            <button key={c.id} type="button" className={`char ${on ? 'on' : ''} ${holder ? 'taken' : ''}`} disabled={!!holder}
              onClick={() => act('character', { id: c.id })}>
              <Portrait p={{ id: c.id, name: c.name, char: c.id }} size={54} frame={on ? 'var(--red)' : '#f4f4f0'} />
              <span>{c.name}</span>
              {holder && <small>{holder.fake ? holder.name : holder.name}</small>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
