// 大厅：参考极乐迪斯科主菜单——手绘的雪夜小镇铺满首屏，左边大标题和一列竖排菜单；
// 右边是镇民名册（带阵营构成）、挑形象、房间设置（按夜晚 / 白天分组）。
import { Portrait } from './util.jsx';
import { CHARACTERS } from '../../src/shared/characters.js';
import { Tag, Panel, Btn } from './ui.jsx';
import { ClockTower, Tree, Lamp, House, MAP_COLORS as C, INK } from './art/TownArt.jsx';
import { SCENE_ART, ROLE_ART } from './art.js';
import { ROLES, TEAM_NAME, DISTRIBUTION, rolesOf } from '../../src/engine/roles.js';
import { ATTR } from './flavor.js';
import { AbilityCard } from './AbilityCard.jsx';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Replay, VoteHistory } from './replay.jsx';
import { SETUPS, presetsFor, PRESET_SHARE } from '../../src/shared/setups.js';
import { Glossed } from './terms.jsx';
import { NIGHT_ORDER, STEP_NAMES } from '../../src/shared/nightOrder.js';
import { TutorialIntro } from './TutorialIntro.jsx';
import { VolumeButton } from './Volume.jsx';
import { fromKook } from './connect.js';

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
  const [intro, setIntro] = useState(false); // 新手教程的开场介绍

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
            <Tag tone="dark">{st.script === 'bmr' ? '黯月初升 · BAD MOON RISING' : '暗流涌动 · TROUBLE BREWING'}</Tag>
          </div>
          <nav className="menu">
            {!(human && host) && (joined
              ? <Btn kind="secondary" className="menu-item" onClick={() => act('leave')}>离开座位</Btn>
              : <Btn kind="primary" className="menu-item" onClick={() => act('join')}>加入游戏</Btn>)}
            {host && <Btn kind={n >= 5 ? 'primary' : 'secondary'} className="menu-item" disabled={n < 5} onClick={() => act('start')}>开始游戏{n < 5 ? `（还差 ${5 - n} 人）` : ''}</Btn>}
            {host && <Btn className="menu-item" onClick={() => act('addBots', { count: 1 })}>加一个机器人玩家</Btn>}
            {!host && !s.hostOnline && <Btn className="menu-item" onClick={() => act('claimHost')}>房主不在，接管房主</Btn>}
            {!host && s.hostOnline && <p className="menu-wait">等房主开始……</p>}
            {onTutorial && <Btn className="menu-item menu-tut" onClick={() => setIntro(true)}>新手教程（1 分钟动画 + 练习局）</Btn>}
            <VolumeButton className="btn btn-secondary menu-item menu-vol" label="声音、字号和背景" />
            {intro && createPortal(<TutorialIntro onStart={() => { setIntro(false); onTutorial(); }} onClose={() => setIntro(false)} />, document.body)}
          </nav>
          <ul className="lobby-tips">
            <li>大家先进同一个语音频道，<b>房主也要在里面</b>——机器人会把它当成城镇广场。</li>
            {fromKook
              ? <li>在 KOOK 文字频道发<b>「/血染」</b>，每个人点卡片上的按钮领自己的进入链接；语音还是在 KOOK 里聊。</li>
              : <li>从<b>文字频道</b>的应用启动器打开：进房子私聊时被拉去别的语音频道，也不会掉线。</li>}
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
                    {/* 新手标记：大家都看得到；房主点一下切换（机器人不用标） */}
                    {(host && !p.id.startsWith('bot-')) ? (
                      <button type="button" className={`lr-newbie ${s.newbies?.includes(p.id) ? 'on' : ''}`} onClick={() => act('markNewbie', { player: p.id, on: !s.newbies?.includes(p.id) })}
                        title="标成新手：发身份时尽量避开难角色，机器人和 AI 说书人也会照顾一下">{s.newbies?.includes(p.id) ? '新手' : '+新手'}</button>
                    ) : s.newbies?.includes(p.id) && <span className="lr-newbie on">新手</span>}
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
              <div className="seg">
                {[['preset', '推荐预设'], ['ai', 'AI 配置'], ['random', '完全随机']].map(([id, label]) => (
                  <button key={id} type="button" className={(st.setupMode ?? 'preset') === id ? 'on' : ''} disabled={!host} onClick={() => set({ setupMode: id })}>{label}</button>
                ))}
              </div>
            </div>
            <p className="muted setting-note">{(() => {
              const mode = st.setupMode ?? 'preset';
              if (mode === 'ai') return 'AI 配置：随机出几十套，按强弱打分挑中间的——强神对强神、弱神对弱神；还会照顾信息位和保护角色别扎堆。';
              if (mode === 'random') return '完全随机：按人数表纯随机抽角色，不调平衡（可能很偏）。';
              const list = presetsFor(st.script ?? 'tb', n);
              const off = list.filter((x) => x.official).length;
              return list.length
                ? `推荐预设：${n} 人有 ${list.length} 套推荐配置${off ? `（官方 ${off} 套，优先）` : ''}，大约 ${Math.round(PRESET_SHARE * 100)}% 的局从里面挑，其余用 AI 配置。`
                : n ? `推荐预设：${n} 人还没有推荐配置，会用 AI 配置。` : '推荐预设：按坐下的人数从推荐配置里挑，这个人数没有的话用 AI 配置。';
            })()}</p>
            {host && s.roleAssign && n > 0 && <RoleAssign s={s} act={act} script={st.script ?? 'tb'} />}
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
                <Select label="选人时限" value={st.chooseSeconds} disabled={!host} options={[30, 45, 60, 90, 120]} unit="秒" onChange={(v) => set({ chooseSeconds: v })} />
                <Toggle label="随机排座位" on={st.shuffle} disabled={!host} onChange={(v) => set({ shuffle: v })} />
                {st.script !== 'bmr' && <Toggle label="房规：7 人以下不发男爵" on={st.smallNoBaron ?? true} disabled={!host} onChange={(v) => set({ smallNoBaron: v })} />}
                <Toggle label="房规：夜里死了仍拿信息（醉酒）" on={!!st.deadDrunk} disabled={!host} onChange={(v) => set({ deadDrunk: v })} />
                {st.script === 'bmr' && <Toggle label="房规：疯子（以为是僵怖）死后照样醒" on={!!st.lunaticGhost} disabled={!host} onChange={(v) => set({ lunaticGhost: v })} />}
              </div>
              <div className="setting-group">
                <h4>白天</h4>
                <Select label="自由活动" value={st.roamMinutes} disabled={!host} options={[2, 3, 5, 8, 10, 0]} unit="分钟" zero="不限时" onChange={(v) => set({ roamMinutes: v })} />
                <Select label="提名环节" value={st.nominateMinutes} disabled={!host} options={[2, 3, 5, 8, 10]} unit="分钟" onChange={(v) => set({ nominateMinutes: v })} />
                <Select label="提名理由" value={st.accuseSeconds} disabled={!host} options={[15, 30, 60, 90, 120]} unit="秒" onChange={(v) => set({ accuseSeconds: v })} />
                <Select label="辩护时间" value={st.defendSeconds} disabled={!host} options={[30, 60, 90, 120, 180]} unit="秒" onChange={(v) => set({ defendSeconds: v })} />
                <Toggle label="房规：提名者自动投一票" on={st.nominatorVotes} disabled={!host} onChange={(v) => set({ nominatorVotes: v })} />
                <Toggle label="房规：小局也互认、发伪装" on={st.smallEvilInfo} disabled={!host} onChange={(v) => set({ smallEvilInfo: v })} />
                <Toggle label="房规：爪牙共用恶魔的 3 个伪装" on={st.minionBluffs} disabled={!host} onChange={(v) => set({ minionBluffs: v })} />
                <Toggle label="房规：投票时隐藏票型（投完公开）" on={st.hideVotes} disabled={!host} onChange={(v) => set({ hideVotes: v })} />
                <Toggle label="观战者能看魔典（所有身份）" on={st.spectatorGrimoire} disabled={!host} onChange={(v) => set({ spectatorGrimoire: v })} />
                <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} disabled={!host} onChange={(v) => set({ muteSpectators: v })} />
                <Select label="投票时钟每人" value={st.voteSeconds} disabled={!host} options={[1, 2, 3, 4, 5]} unit="秒" onChange={(v) => set({ voteSeconds: v })} />
              </div>
            </div>
          </Panel>
        </section>

        <RecordAndHistory s={s} ask={ask} />
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

const pct = (w, n) => (n ? `${Math.round((w / n) * 100)}%` : '—');
const rate = (pair) => (pair[0] ? pair[1] / pair[0] : 0);
const TEAM_ROWS = [['townsfolk', '镇民', 'var(--int)'], ['outsider', '外来者', 'var(--psy)'], ['minion', '爪牙', 'var(--phy)'], ['demon', '恶魔', 'var(--phy)']];
// 排行榜的排法；按比例排的要至少打过 3 局（不然 1 局 1 胜就是 100%）
const SORTS = [
  ['wins', '胜场', (p) => p.wins, () => true],
  ['rate', '胜率', (p) => rate([p.games, p.wins]), (p) => p.games >= 3],
  ['good', '好人胜率', (p) => rate(p.good), (p) => p.good[0] >= 3],
  ['evil', '坏人胜率', (p) => rate(p.evil), (p) => p.evil[0] >= 3],
  ['games', '局数', (p) => p.games, () => true],
];

/** 一行"标签 + 比例条 + 胜/局"。 */
function RateRow({ label, pair, color = 'var(--int)', hint }) {
  return (
    <div className="rr" title={hint}>
      <span className="rr-label">{label}</span>
      <span className="rr-bar" style={{ '--w': rate(pair), '--c': color }} aria-hidden="true" />
      <b className="rr-pct">{pct(pair[1], pair[0])}</b>
      <span className="rr-num">{pair[1]} / {pair[0]}</span>
    </div>
  );
}

/** 场上表现的一格：大数字 + 名字 + 一行说明。 */
function Tile({ value, label, sub, tone }) {
  return (
    <div className={`rec-tile ${tone ?? ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** 一个人的战绩卡：分成 阵营 / 身份 / 走势 / 常玩角色 / 场上表现 几段。 */
function RecordCard({ p, isMe }) {
  const roles = Object.entries(p.roles).filter(([id]) => ROLES[id]).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, 3);
  const noms = p.noms ?? [0, 0, 0];
  const nominated = Array.isArray(p.nominated) ? p.nominated : [p.nominated ?? 0, 0];
  return (
    <div className="rec-card">
      <div className="rec-who">
        <Portrait p={{ id: p.id, name: p.name, avatar: p.avatar }} size={40} prefer="avatar" speak={false} frame={isMe ? 'var(--mot)' : '#6d6a62'} />
        <div className="rec-who-txt">
          <b>{isMe ? `你 · ${p.name}` : p.name}</b>
          <small>{p.games} 局 · {p.wins} 胜 {p.games - p.wins} 负 · 最近一局 {new Date(p.last).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small>
        </div>
        <div className="rec-big"><b>{pct(p.wins, p.games)}</b><small>总胜率</small></div>
      </div>

      <section className="rec-sec">
        <h3>阵营</h3>
        <div className="rec-rates">
          <RateRow label="当好人" pair={p.good} color="var(--int)" />
          <RateRow label="当坏人" pair={p.evil} color="var(--phy)" />
          <RateRow label="活到终局" pair={[p.games, p.alive]} color="var(--cream)" hint="终局时还活着的局数" />
        </div>
      </section>

      <section className="rec-sec">
        <h3>身份</h3>
        <div className="rec-teams">
          {TEAM_ROWS.map(([k, name, c]) => (
            <div key={k} className={p.teams[k][0] ? '' : 'none'} style={{ '--c': c }}>
              <small>{name}</small>
              <b>{p.teams[k][0] ? pct(p.teams[k][1], p.teams[k][0]) : '—'}</b>
              <span>{p.teams[k][1]} / {p.teams[k][0]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rec-sec">
        <h3>走势 <small>最近 {p.recent.length} 局 · {p.streak >= 2 ? `${p.streak} 连胜中 · ` : ''}最长 {p.bestStreak} 连胜</small></h3>
        <ol className="rec-form">
          {p.recent.map((r, i) => (
            <li key={i} className={`${r.w ? 'w' : 'l'} ${r.evil ? 'evil' : 'good'}`} title={`${ROLES[r.role]?.name ?? ''} · ${r.w ? '赢' : '输'}`}>
              {ROLE_ART[r.role] ? <img src={ROLE_ART[r.role]} alt="" /> : null}
              <i>{r.w ? '胜' : '负'}</i>
            </li>
          ))}
        </ol>
      </section>

      {!!roles.length && (
        <section className="rec-sec">
          <h3>常玩角色</h3>
          <ul className="rec-roles">
            {roles.map(([id, [g, w]]) => (
              <li key={id}>
                <span className="rec-ricon">{ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" /> : null}</span>
                <b style={{ color: ATTR[ROLES[id].team]?.color }}>{ROLES[id].name}</b>
                <span className="rr-bar" style={{ '--w': w / g, '--c': ATTR[ROLES[id].team]?.color ?? 'var(--int)' }} aria-hidden="true" />
                <span className="rec-rnum">{w} 胜 / {g} 局</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rec-sec">
        <h3>场上表现</h3>
        <div className="rec-tiles">
          <Tile value={noms[0]} label="提名" sub={noms[0] ? `${noms[1]} 次提到邪恶（${pct(noms[1], noms[0])}）· ${noms[2]} 次送上台` : '还没提名过'} />
          <Tile value={nominated[0]} label="被提名" sub={nominated[0] ? `${nominated[1]} 次被送上处决台` : '还没被提名过'} />
          <Tile value={p.votes[0] ? pct(p.votes[1], p.votes[0]) : '—'} label="好人举手准度" sub={p.votes[0] ? `举手 ${p.votes[0]} 次，${p.votes[1]} 次举在邪恶身上` : '当好人时还没举过手'} tone="int" />
          <Tile value={`${p.executed ?? 0} / ${p.nightKilled ?? 0}`} label="被处决 / 夜里死" sub={`活到终局 ${p.alive} 局`} tone="phy" />
        </div>
      </section>
    </div>
  );
}

/**
 * 战绩和往期对局（大厅最下面一整块）：这个服务器打完的所有局（服务器 statsFor / listGames）。
 * 左边是一个人的战绩卡（默认是你，点右边表里的人看他的）；右边两页：排行榜（表头可以点着换排法）和往期对局
 * （选中的人参加过的局会标出他那局的角色和输赢）。
 */
function RecordAndHistory({ s, ask }) {
  const [st, setSt] = useState(null);
  const [games, setGames] = useState(null);
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState('wins');
  const [tab, setTab] = useState('board');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    ask?.('stats').then((r) => setSt(r?.stats ?? null)).catch(() => {});
    ask?.('history').then((r) => setGames(r?.games ?? [])).catch(() => {});
  }, []);
  if (!st?.games && !games?.length) return null;
  const players = st?.players ?? [];
  const me = players.find((p) => p.id === s.me);
  const shown = players.find((p) => p.id === pick) ?? me;
  const [, , key, ok] = SORTS.find((x) => x[0] === sort);
  const board = players.filter(ok).sort((a, b) => key(b) - key(a) || b.games - a.games);
  const show = async (id) => { const r = await ask('pastGame', { id }); if (r?.game) setOpen(r.game); };
  const when = (t) => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const th = (k, label) => (
    <th scope="col" aria-sort={sort === k ? 'descending' : 'none'}>
      <button type="button" className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}{sort === k ? ' ↓' : ''}</button>
    </th>
  );
  return (
    <section className="lobby-roles glass pnl past-games rh">
      <header className="roles-head">
        <h2>战绩与往期对局</h2>
        <p className="muted">{st?.games ? `这个服务器打完了 ${st.games} 局，善良赢 ${pct(st.goodWins, st.games)}，邪恶赢 ${pct(st.games - st.goodWins, st.games)}。` : ''}点表里的人看他的战绩，点往期的局看所有人的身份、票型和整局复盘。</p>
      </header>
      <div className="rh-grid">
        <div className="rh-left">
          {shown ? <RecordCard p={shown} isMe={shown.id === s.me} /> : <p className="rec-none">你还没在这个服务器打完过一局。点右边表里的人，看看他们的战绩。</p>}
          {pick && pick !== s.me && me && <button type="button" className="rec-back" onClick={() => setPick(null)}>← 看我自己的</button>}
        </div>
        <div className="rh-right">
          <div className="rh-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'board'} className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>排行榜 <small>{players.length} 人</small></button>
            <button type="button" role="tab" aria-selected={tab === 'games'} className={tab === 'games' ? 'on' : ''} onClick={() => setTab('games')}>往期对局 <small>最近 {games?.length ?? 0} 局</small></button>
          </div>
          {tab === 'board' ? (
            board.length ? (
              <div className="rh-scroll">
                <table className="rh-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col" className="rh-name">玩家</th>
                      {th('games', '局数')}
                      {th('wins', '胜场')}
                      {th('rate', '胜率')}
                      {th('good', '好人胜率')}
                      {th('evil', '坏人胜率')}
                      <th scope="col">最近 5 局</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((p, i) => (
                      <tr key={p.id} className={`${p.id === s.me ? 'me' : ''} ${p.id === shown?.id ? 'on' : ''}`} onClick={() => setPick(p.id)}>
                        <td className="rh-rank">{i + 1}</td>
                        <td className="rh-name">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setPick(p.id); }}>
                            <Portrait p={{ id: p.id, name: p.name, avatar: p.avatar }} size={22} prefer="avatar" speak={false} frame="#6d6a62" />
                            <span>{p.name}{p.id === s.me ? '（你）' : ''}</span>
                          </button>
                        </td>
                        <td>{p.games}</td>
                        <td>{p.wins}</td>
                        <td><Pct pair={[p.games, p.wins]} c="var(--mot)" /></td>
                        <td><Pct pair={p.good} c="var(--int)" /></td>
                        <td><Pct pair={p.evil} c="var(--phy)" /></td>
                        <td>
                          <ol className="rh-form">
                            {p.recent.slice(-5).map((r, k) => <li key={k} className={`${r.w ? 'w' : 'l'} ${r.evil ? 'evil' : 'good'}`} title={`${ROLES[r.role]?.name ?? ''} · ${r.w ? '赢' : '输'}`} />)}
                          </ol>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="rec-none">{`还没有人${sort === 'good' ? '当好人' : sort === 'evil' ? '当坏人' : '打'}满 3 局。`}</p>
          ) : (
            games?.length ? (
              <ul className="pg-list">
                {games.map((g) => {
                  const mine = shown && g.players.find((q) => q.id === shown.id);
                  const evil = mine && ['minion', 'demon'].includes(ROLES[mine.role]?.team);
                  const won = mine && (g.winner === 'evil') === evil;
                  return (
                    <li key={g.id}>
                      <button type="button" onClick={() => show(g.id)}>
                        <span className={`pg-win ${g.winner}`}>{g.winner === 'good' ? '善良胜' : '邪恶胜'}</span>
                        <span className="pg-when">{when(g.endedAt)}</span>
                        <span className="pg-meta">{g.players.length} 人 · {g.days} 天</span>
                        <span className="pg-reason">{g.reason}</span>
                        {mine && ROLES[mine.role] && (
                          <span className={`pg-mine ${won ? 'w' : 'l'}`} title={`${shown.id === s.me ? '你' : shown.name}这局是${ROLES[mine.role].name}`}>
                            {shown.id === s.me ? '你' : shown.name} · <b style={{ color: ATTR[ROLES[mine.role].team]?.color }}>{ROLES[mine.role].name}</b> · {won ? '赢' : '输'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="rec-none">还没有打完的局。</p>
          )}
        </div>
      </div>
      {open && createPortal(<PastGame game={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  );
}

/** 表格里的比例：百分比 + 细条 + 胜/局（没打过就是一条横线）。 */
function Pct({ pair, c }) {
  if (!pair[0]) return <span className="rh-pct none">—</span>;
  return (
    <span className="rh-pct" style={{ '--w': rate(pair), '--c': c }}>
      <b>{pct(pair[1], pair[0])}</b>
      <i aria-hidden="true" />
      <small>{pair[1]}/{pair[0]}</small>
    </span>
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

export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_HINT = {
  townsfolk: '善良阵营。每人有一个有用的能力，帮大家找出恶魔。',
  outsider: '善良阵营，但能力往往帮倒忙。',
  minion: '邪恶阵营。知道谁是恶魔，帮他藏身、搅乱信息。',
  demon: '邪恶阵营的核心。每晚杀一个人；恶魔死了，善良就赢了。',
};

/** 首页：暗流涌动全部 22 个角色的技能。可以按阵营筛选，点一张看完整的能力牌。 */
/** 夜间顺序：首夜 / 其他夜晚各一列，每步写这个角色醒来做什么，最后讲为什么这么排（照官方的夜晚顺序表）。 */
export function NightOrder({ script }) {
  const o = NIGHT_ORDER[script];
  const row = ([id, what], i) => {
    const r = ROLES[id];
    const color = r ? ATTR[r.team].color : 'var(--muted)';
    return (
      <li key={`${id}-${i}`} style={{ '--attr': color }}>
        <span className="no-n">{i + 1}</span>
        <span className="no-art">{r && ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" loading="lazy" /> : null}</span>
        <span className="no-body"><b>{r ? r.name : STEP_NAMES[id]}</b><span><Glossed text={what} /></span></span>
      </li>
    );
  };
  return (
    <div className="night-order">
      <p className="muted">说书人每晚按这个顺序叫人。没在场的角色直接跳过；死了的人不再醒（守鸦人这种死了才触发的除外）。</p>
      <div className="no-cols">
        <section><h3>☾ 首夜</h3><ol>{o.first.map(row)}</ol></section>
        <section><h3>☾ 其他夜晚</h3><ol>{o.other.map(row)}</ol></section>
      </div>
      <h3>为什么这么排</h3>
      <ul className="no-why">{o.why.map((t) => <li key={t}><Glossed text={t} /></li>)}</ul>
    </div>
  );
}

export function RoleShowcase({ compact = false, script = 'tb' }) {
  const sc = script === 'bmr' ? 'bmr' : 'tb';
  const ids = Object.keys(ROLES).filter((id) => ROLES[id].script === sc);
  const [team, setTeam] = useState('all');
  const [open, setOpen] = useState(null);
  const shown = team === 'night' ? [] : TEAMS.filter((t) => team === 'all' || team === t);
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
          <button type="button" className={team === 'night' ? 'on' : ''} onClick={() => setTeam('night')}>夜间顺序</button>
        </div>
      </header>
      {team === 'night' && <NightOrder script={sc} />}
      {shown.map((t) => (
        <div key={t} className="roles-team">
          <h3 style={{ color: ATTR[t].color }}>{TEAM_NAME[t]}<small>{TEAM_HINT[t]}</small></h3>
          <div className="roles-grid">
            {ids.filter((id) => ROLES[id].team === t).map((id) => (
              <button key={id} type="button" className="role-tile" style={{ '--attr': ATTR[t].color }} onClick={() => setOpen(id)}>
                <span className="rt-art">{ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" loading="lazy" /> : null}</span>
                <span className="rt-body">
                  <b>{ROLES[id].name}<i>{ROLES[id].en}</i></b>
                  <span><Glossed text={ROLES[id].ability} /></span>
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
/** 房主指定每个人的角色（只有房主看得到）：不指定的座位开局时按人数表随机补齐。 */
function RoleAssign({ s, act, script }) {
  const [open, setOpen] = useState(false);
  const assign = Object.fromEntries(Object.entries(s.roleAssign).filter(([id, r]) => s.lobby.some((p) => p.id === id) && ROLES[r]?.script === script));
  const k = Object.keys(assign).length;
  const n = s.lobby.length;
  const dist = DISTRIBUTION[n];
  const holder = (r) => s.lobby.findIndex((p) => assign[p.id] === r);
  const count = (t) => Object.values(assign).filter((r) => ROLES[r].team === t).length;
  const over = dist && TEAMS.filter((t, i) => count(t) > dist[i] + (t === 'outsider' ? 2 : 0));
  const meSeated = s.lobby.some((p) => p.id === s.me);
  return (
    <div className="role-assign">
      <div className="setting mode-row">
        <span>指定角色</span>
        <button type="button" className="ra-toggle" onClick={() => setOpen(!open)}>
          {k ? `已指定 ${k} 人` : '全部随机'} · {open ? '收起' : '逐个指定'}
        </button>
      </div>
      {open && (
        <>
          <p className="muted setting-note">
            只有你看得到。没指定的座位开局时按人数表随机补齐（男爵、教父带来的外来者变化会自动算）；指定了角色就不用上面的推荐配置。
            {s.settings?.shuffle && ' 开着"随机排座位"：开局时座位号会打乱，角色跟着人走。'}
            {meSeated && k > 0 && <b className="ra-warn"> 你也坐在桌上：指定了别人的角色，你就知道他们的身份了。</b>}
            {over?.length > 0 && <b className="ra-warn"> {over.map((t) => TEAM_NAME[t]).join('、')}指定得比人数表多，开局会以你的指定为准、少补镇民。</b>}
          </p>
          <div className="ra-list">
            {s.lobby.map((p, i) => (
              <label key={p.id} className="ra-row">
                <span className="ra-seat">{i + 1}</span>
                <span className="ra-name">{p.id === s.me ? '你' : p.name}</span>
                <select value={assign[p.id] ?? ''} onChange={(e) => act('assignRole', { player: p.id, role: e.target.value || null })}>
                  <option value="">随机</option>
                  {TEAMS.map((t) => (
                    <optgroup key={t} label={TEAM_NAME[t]}>
                      {rolesOf(script, t).map((r) => {
                        const h = holder(r);
                        return <option key={r} value={r}>{ROLES[r].name}{h >= 0 && s.lobby[h].id !== p.id ? `（现在给了 ${h + 1}号）` : ''}</option>;
                      })}
                    </optgroup>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {k > 0 && <p className="ra-clear"><button type="button" onClick={() => Object.keys(assign).forEach((id) => act('assignRole', { player: id, role: null }))}>全部改回随机</button></p>}
        </>
      )}
    </div>
  );
}

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
          <span>{fromKook ? 'KOOK 头像' : 'Discord 头像'}</span>
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
