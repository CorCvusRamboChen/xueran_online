// 娱乐模式「阿瓦隆」的界面：身份确认、任务记录板（5 个任务格 + 否决计数）、队长选队员、全体投票、出任务票、
// 湖中仙女、刺杀指认。场景沿用血染的广场座位圈和小镇地图（自由活动），右栏沿用记录面板。规则在 src/engine/avalon.js。
import { useEffect, useState } from 'react';
import { Town } from './Town.jsx';
import { TownMap } from './TownMap.jsx';
import { Tag, Panel, Btn, Stat, HudBar } from './ui.jsx';
import { Portrait, useTick, useCountdown, cnNum } from './util.jsx';
import { AVALON_ROLES, AVALON_TEAMS, QUEST_SIZES, failsNeeded, avalonRoles, isGood, DEFAULT_OPTIONS } from '../../src/engine/avalon.js';
import './avalon.css';

const STAGE_NAME = { reveal: '确认身份', propose: '组队', vote: '投票', quest: '任务', lady: '湖中仙女', assassin: '刺杀', ended: '结束' };

/** 整局的界面。parts：从 App.jsx / Lobby.jsx 借来的零件（自由活动面板、记录、声音开关、观战席），免得文件互相引用。 */
export function AvalonGame({ s, act, ask, parts: { RoamActions, History, SoundToggles, Watchers } }) {
  useTick(1000);
  const a = s.avalon;
  const me = s.self;
  const [tab, setTab] = useState(null);
  const [picked, setPicked] = useState([]);
  const [quit, setQuit] = useState(false);
  const g = (id) => s.players.find((p) => p.id === id);
  const name = (id) => { const p = g(id); return p ? `${p.seat}号 ${p.name}` : '?'; };
  const face = (id, label) => ({ ...g(id), label: label ?? name(id) });
  const av = (kind, p = {}) => act('avalon', { kind, ...p });

  const roaming = !!s.roam;
  const leaderMe = a.leader === s.me;
  const assassinMe = a.stage === 'assassin' && a.assassin === s.me;
  // 现在点肖像是在选什么：队长选队员 / 湖中仙女选人 / 刺客指认 / 同伴给刺客出主意
  const pickSpec = s.phase === 'ended' || roaming ? null
    : a.stage === 'propose' && leaderMe ? { count: a.quests[a.round - 1].size, options: s.players.map((p) => p.id), what: 'team' }
      : a.stage === 'lady' && a.lady?.options ? { count: 1, options: a.lady.options, what: 'lady' }
        : assassinMe ? { count: 1, options: s.players.map((p) => p.id).filter((id) => id !== s.me), what: 'assassin' }
          : a.stage === 'assassin' && me?.canSuggest ? { count: 1, options: s.players.map((p) => p.id).filter((id) => id !== a.assassin), what: 'suggest' } : null;
  const pickKey = `${a.stage}-${a.round}-${a.attempt}-${pickSpec?.what}`;
  useEffect(() => { setPicked([]); }, [pickKey]);
  const onTap = (p) => {
    if (!pickSpec?.options.includes(p.id)) return;
    setPicked((cur) => {
      if (cur.includes(p.id)) return cur.filter((x) => x !== p.id);
      const next = [...cur, p.id];
      return next.length > pickSpec.count ? next.slice(-pickSpec.count) : next;
    });
  };

  // 座位圈上的小标签：队长、队员、谁投了 / 出了票、开票后每个人的票
  const last = a.proposals.at(-1);
  const showLast = last && a.stage === 'propose' && last.round === a.round; // 这一轮被否决的那次开票：每个人的票挂在座位上，直到下一次投票
  const tagsOf = (p) => {
    const t = [];
    if (a.leader === p.id && a.stage !== 'assassin') t.push('队长');
    if (a.lady?.holder === p.id && a.stage !== 'ended') t.push('湖中仙女');
    if (a.team.includes(p.id) && ['vote', 'quest'].includes(a.stage)) t.push('队员');
    if (a.stage === 'vote' && a.voted.includes(p.id)) t.push('已投');
    if (a.stage === 'quest' && a.played.includes(p.id)) t.push('已出票');
    if (a.stage === 'reveal' && a.ready.includes(p.id)) t.push('看好了');
    if (a.stage === 'assassin' && a.assassin === p.id) t.push('刺客');
    if (showLast && p.id in last.votes) t.push(last.votes[p.id] ? '赞成' : '反对');
    return t;
  };
  const ring = { ...s, players: s.players.map((p) => ({ ...p, tags: tagsOf(p) })) };

  const secs = useCountdown(roaming ? s.roam.until : s.deadline);
  const timer = secs != null ? { label: roaming ? '自由活动结束' : `${STAGE_NAME[a.stage]}倒计时`, secs, urgent: secs <= 10 } : null;
  const items = [
    me && { id: 'role', icon: 'role', label: '身份', dot: a.stage === 'reveal' && !me.ready ? '' : 0 },
    { id: 'board', icon: 'roster', label: '任务记录' },
    { id: 'log', icon: 'talk', label: '记录' },
    { id: 'roles', icon: 'grim', label: '角色' },
  ].filter(Boolean);
  const shown = tab ?? (me ? 'role' : 'board');
  const hot = !!pickSpec || (a.stage === 'vote' && me && me.myVote == null) || (a.stage === 'quest' && a.team.includes(s.me) && me?.myCard == null) || (a.stage === 'reveal' && me && !me.ready);

  return (
    <div className="game avalon">
      <section className="scene">
        {!roaming && <Tag className="where">{s.phase === 'ended' ? '圆桌 · 终局' : a.stage === 'reveal' ? '圆桌 · 夜' : `圆桌 · 第${cnNum(a.round)}轮任务`}</Tag>}
        {s.spectator && s.phase !== 'ended' && <div className="spectator-bar">观战中{s.settings?.spectatorGrimoire ? ' · 你能看到所有人的身份，别在语音里说' : ' · 看不到任何人的身份'}</div>}
        {roaming ? (
          <TownMap s={s} onMove={me ? (x, y) => act('move', { x, y }) : () => null} />
        ) : (
          <Town s={ring} picked={picked} pickable={pickSpec?.options ?? null} onTap={onTap}>
            <QuestBoard a={a} />
          </Town>
        )}
        <SoundToggles onFixVoice={me && s.phase !== 'ended' ? () => act('fixVoice') : null} />
        <HudBar items={items} active={tab} onPick={(id) => setTab((cur) => (cur === id ? null : id))} label={STAGE_NAME[a.stage]} timer={timer} />
      </section>

      <section className={`dock ${hot ? 'dock-hot' : ''}`}>
        {roaming && <TalkCard s={s} a={a} name={name} />}
        {roaming ? <RoamActions s={s} act={act} name={name} face={face} setMode={() => {}} />
          : <Stage s={s} a={a} me={me} av={av} act={act} name={name} picked={picked} pickSpec={pickSpec} g={g} />}
        {s.isHost && s.phase !== 'ended' && (
          <div className="link-row av-host">
            {quit ? <button type="button" onClick={() => act('end')} onMouseLeave={() => setQuit(false)}>确定结束这局、回到大厅</button>
              : <button type="button" onClick={() => setQuit(true)}>房主：结束这局</button>}
          </div>
        )}
      </section>

      <aside className={`drawer ${tab ? 'open' : ''}`}>
        <div className="drawer-tabs">
          {items.map((it) => <button key={it.id} type="button" className={shown === it.id ? 'on' : ''} onClick={() => setTab(it.id)}>{it.label}</button>)}
          <button type="button" className="drawer-close" onClick={() => setTab(null)} aria-label="收起">×</button>
        </div>
        <div className="drawer-body">
          {shown === 'role' && me && <RoleSheet me={me} a={a} name={name} />}
          {shown === 'board' && <Record a={a} s={s} g={g} />}
          {shown === 'log' && <History log={s.log} players={s.players} ask={ask} epoch={s.logEpoch} />}
          {shown === 'roles' && <InPlay a={a} />}
          {shown === 'board' && <Watchers s={s} />}
        </div>
      </aside>
    </div>
  );
}

/** 画面正中：五个任务格（人数、要几张失败票、成败）和否决计数。 */
export function QuestBoard({ a }) {
  return (
    <div className="av-board">
      <div className="av-quests">
        {a.quests.map((q, i) => (
          <div key={i} className={`av-quest ${q.result ?? ''} ${i + 1 === a.round && !q.result && a.stage !== 'ended' ? 'now' : ''}`} title={`第 ${i + 1} 轮：${q.size} 人${q.need > 1 ? `，要 ${q.need} 张失败票才失败` : ''}`}>
            <b>{q.result === 'success' ? '成' : q.result === 'fail' ? '败' : q.size}</b>
            {q.result ? <small>{q.fails} 张失败</small> : q.need > 1 ? <small>要 2 张失败</small> : <small>{q.size} 人</small>}
          </div>
        ))}
      </div>
      <div className="av-rejects" title={`同一轮连续 ${a.maxRejects} 次组队被否决，坏人直接获胜`}>
        <span>组队</span>
        {Array.from({ length: a.maxRejects }, (_, i) => <i key={i} className={i + 1 < a.attempt ? 'used' : i + 1 === a.attempt && a.stage !== 'ended' ? 'now' : ''}>{i + 1}</i>)}
      </div>
    </div>
  );
}

/** 自由活动时上面那张小卡：这轮要干什么。 */
function TalkCard({ s, a, name }) {
  const q = a.quests[a.round - 1];
  return (
    <Panel title={`第${cnNum(a.round)}轮任务 · 自由活动`} tone="mot">
      <p className="lead">队长 <b>{name(a.leader)}</b> 集合后组 {q.size} 人的队伍{q.need > 1 ? `（这一轮要 ${q.need} 张失败票才失败）` : ''}。先去找人私聊吧。</p>
    </Panel>
  );
}

/** 每一步的操作面板。 */
function Stage({ s, a, me, av, act, name, picked, pickSpec, g }) {
  const q = a.quests[a.round - 1];
  if (s.phase === 'ended') {
    const good = s.winner?.team === 'good';
    return (
      <Panel title={good ? '好人获胜' : '坏人获胜'} tone={good ? 'int' : 'phy'}>
        <p className="lead">{s.winner?.reason}</p>
        <p className="muted">所有人的身份写在肖像下面。完整的组队和投票在「任务记录」里。</p>
        {s.isHost && <div className="btn-row"><Btn kind="primary" onClick={() => act('end')}>再来一局</Btn></div>}
      </Panel>
    );
  }

  if (a.stage === 'reveal') {
    if (!me) return <Panel title="确认身份" tone="dark"><p className="lead">大家正在闭眼确认身份……</p></Panel>;
    return (
      <Panel title="闭上眼睛 · 确认身份" tone="dark">
        <RoleCard me={me} />
        <Sees me={me} name={name} />
        <div className="btn-row">
          {me.ready ? <span className="muted">等其他人看完（{a.ready.length}/{s.players.length}）……</span>
            : <Btn kind="primary" onClick={() => av('ready')}>我看好了</Btn>}
        </div>
      </Panel>
    );
  }

  if (a.stage === 'propose') {
    const last = a.proposals.at(-1);
    const rejected = last && last.round === a.round && !last.approved;
    return (
      <>
        {rejected && <VoteResult rec={last} s={s} name={name} />}
        {pickSpec?.what === 'team' ? (
          <Panel title={`你是队长 · 选 ${q.size} 名队员`} tone="mot" className="choose-pnl">
            <p className="lead">点座位圈上的肖像选人（可以带上自己）。{a.attempt > 1 ? `这一轮已经否决 ${a.attempt - 1} 次` : ''}{a.attempt === a.maxRejects ? '——这次再被否决，坏人直接获胜。' : ''}</p>
            <Chips ids={picked} need={q.size} name={name} />
            <div className="btn-row"><Btn kind="primary" disabled={picked.length !== q.size} onClick={() => av('propose', { team: picked })}>提名这支队伍</Btn></div>
          </Panel>
        ) : (
          <Panel title={`第${cnNum(a.round)}轮 · 组队`} tone="light">
            <p className="lead">队长 <b>{name(a.leader)}</b> 正在挑 {q.size} 名队员{a.attempt > 1 ? `（第 ${a.attempt} 次组队）` : ''}。在语音里说说你想让谁去。</p>
          </Panel>
        )}
      </>
    );
  }

  if (a.stage === 'vote') {
    const mine = me?.myVote;
    return (
      <Panel title={`投票 · 第${cnNum(a.round)}轮第 ${a.attempt} 次组队`} tone="phy" className="choose-pnl">
        <p className="lead">队长 <b>{name(a.leader)}</b> 提名：{a.team.map((id) => <span key={id} className="chip">{name(id)}</span>)}</p>
        <p className="muted">所有人同时投，投完一起公开。过半赞成就组队成功。{a.attempt === a.maxRejects ? '这是这一轮第 5 次组队：再被否决，坏人直接获胜。' : ''}</p>
        <div className="stats"><Stat value={a.voted.length} label="已投" color="var(--opt)" /><Stat value={Math.floor(s.players.length / 2) + 1} label="通过要赞成" color="var(--cream)" /></div>
        {me && (
          <div className="btn-row av-vote">
            <Btn kind={mine === true ? 'primary' : 'secondary'} onClick={() => av('vote', { yes: true })}>赞成</Btn>
            <Btn kind={mine === false ? 'primary' : 'secondary'} onClick={() => av('vote', { yes: false })}>反对</Btn>
            {mine != null && <span className="muted">你投了{mine ? '赞成' : '反对'}（所有人投完前可以改）</span>}
          </div>
        )}
      </Panel>
    );
  }

  if (a.stage === 'quest') {
    const onTeam = a.team.includes(s.me);
    const last = a.proposals.at(-1);
    return (
      <>
        {last && <VoteResult rec={last} s={s} name={name} />}
        {onTeam ? (
          <Panel title="出任务票" tone="mot" className="choose-pnl">
            {me.myCard != null ? <p className="lead">你出了「{me.myCard ? '成功' : '失败'}」。等其他队员（{a.played.length}/{a.team.length}）……</p> : <>
              <p className="lead">秘密出一张票。只公开失败票的张数，没人知道是谁出的。{q.need > 1 ? `这一轮要 ${q.need} 张失败票任务才失败。` : ''}</p>
              <div className="btn-row av-cards">
                <button type="button" className="av-card success" onClick={() => av('quest', { success: true })}>成功</button>
                <button type="button" className="av-card fail" disabled={!me.canFail} onClick={() => av('quest', { success: false })} title={me.canFail ? '' : '好人只能出成功'}>失败</button>
              </div>
              {!me.canFail && <p className="muted">你是好人，只能出「成功」。</p>}
            </>}
          </Panel>
        ) : (
          <Panel title="任务进行中" tone="light">
            <p className="lead">{a.team.map(name).join('、')} 正在出任务票（{a.played.length}/{a.team.length}）。</p>
          </Panel>
        )}
      </>
    );
  }

  if (a.stage === 'lady') {
    return pickSpec?.what === 'lady' ? (
      <Panel title="湖中仙女" tone="psy" className="choose-pnl">
        <p className="lead">选一名玩家，偷偷看他是好人还是坏人。看完湖中仙女交给他。自己和拿过湖中仙女的人不能选。</p>
        <Chips ids={picked} need={1} name={name} />
        <div className="btn-row"><Btn kind="primary" disabled={picked.length !== 1} onClick={() => av('lady', { target: picked[0] })}>查看</Btn></div>
      </Panel>
    ) : (
      <Panel title="湖中仙女" tone="psy"><p className="lead"><b>{name(a.lady.holder)}</b> 正在用湖中仙女查看一名玩家。</p></Panel>
    );
  }

  if (a.stage === 'assassin') {
    const tips = me?.suggestions && Object.entries(me.suggestions);
    if (pickSpec?.what === 'assassin') {
      return (
        <Panel title="你是刺客 · 指认梅林" tone="phy" className="choose-pnl">
          <p className="lead">好人完成了三次任务。只有一次机会：指对梅林，坏人获胜。</p>
          {tips?.length > 0 && <p className="muted">同伴的建议：{tips.map(([by, t]) => `${name(by)} → ${name(t)}`).join('；')}</p>}
          <Chips ids={picked} need={1} name={name} />
          <div className="btn-row"><Btn kind="primary" disabled={picked.length !== 1} onClick={() => av('assassin', { target: picked[0] })}>他是梅林</Btn></div>
        </Panel>
      );
    }
    if (pickSpec?.what === 'suggest') {
      return (
        <Panel title="帮刺客找梅林" tone="phy" className="choose-pnl">
          <p className="lead">刺客 <b>{name(a.assassin)}</b> 要指认梅林。点一个人告诉刺客你觉得是谁（只有刺客看得到），最后由刺客决定。</p>
          <Chips ids={picked} need={1} name={name} />
          <div className="btn-row">
            <Btn kind="primary" disabled={picked.length !== 1} onClick={() => av('suggest', { target: picked[0] })}>建议刺客选他</Btn>
            {me.mySuggest && <span className="muted">你建议了 {name(me.mySuggest)}</span>}
          </div>
        </Panel>
      );
    }
    return (
      <Panel title="刺杀" tone="phy">
        <p className="lead">好人完成了三次任务。刺客 <b>{name(a.assassin)}</b> 正在和同伴商量，要指认谁是梅林。</p>
        {me?.role.id === 'merlin' && <p className="muted">别慌——他还不知道是你。</p>}
      </Panel>
    );
  }
  return null;
}

function Chips({ ids, need, name }) {
  return (
    <div className="chips">
      {ids.map((id) => <span key={id} className="chip">{name(id)}</span>)}
      {ids.length < need && <span className="chip empty">点座位圈上的肖像选人（{ids.length}/{need}）</span>}
    </div>
  );
}

/** 开票结果：谁赞成、谁反对。 */
function VoteResult({ rec, s, name }) {
  const ps = s.players;
  return (
    <Panel title={`开票 · ${rec.approved ? '组队通过' : '组队被否决'}`} tone={rec.approved ? 'int' : 'phy'} className="av-result">
      <p className="muted">第{cnNum(rec.round)}轮第 {rec.attempt} 次 · 队长 {name(rec.leader)} · 队员 {rec.team.map((id) => `${s.players.find((p) => p.id === id)?.seat}号`).join(' ')}</p>
      <div className="av-votes">
        {ps.map((p) => (
          <div key={p.id} className={`av-v ${rec.votes[p.id] ? 'yes' : 'no'}`}>
            <Portrait p={p} size={30} prefer="avatar" frame={rec.votes[p.id] ? 'var(--int)' : 'var(--phy)'} speak={false} />
            <span>{p.seat}号 {rec.votes[p.id] ? '赞成' : '反对'}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RoleCard({ me }) {
  const r = me.role;
  return (
    <div className={`av-role ${r.good ? 'good' : 'evil'}`}>
      <small>{r.good ? '亚瑟的忠臣 · 好人' : '莫德雷德的爪牙 · 坏人'}</small>
      <b>{r.name}</b>
      <p>{r.ability}</p>
    </div>
  );
}

/** 开局看到的人。 */
function Sees({ me, name }) {
  const r = me.role.id;
  if (!me.sees.length) {
    const why = r === 'oberon' ? '你不认识其他坏人，他们也不认识你。' : r === 'merlin' ? '你没有看到任何坏人（他们可能都是莫德雷德）。' : '你没有特殊信息。';
    return <p className="muted av-sees">{why}</p>;
  }
  const label = r === 'merlin' ? '这些人是坏人（莫德雷德不在里面）' : r === 'percival' ? '这两个人一个是梅林、一个是莫甘娜，你分不清' : '你的坏人同伴（不知道各自是什么角色；奥伯伦不在里面）';
  return (
    <div className="av-sees">
      <small>{label}</small>
      <div className="chips">{me.sees.map((k) => <span key={k.id} className={`chip ${k.as === 'merlin' ? 'merlin' : 'evil'}`}>{name(k.id)}{k.as === 'merlin' ? ' · 梅林？' : ''}</span>)}</div>
    </div>
  );
}

function RoleSheet({ me, a, name }) {
  return (
    <Panel title="你的身份" tone={me.role.good ? 'int' : 'phy'}>
      <RoleCard me={me} />
      <Sees me={me} name={name} />
      {me.ladySeen.length > 0 && (
        <div className="av-sees">
          <small>湖中仙女看到的（只有你知道）</small>
          <div className="chips">{me.ladySeen.map((x) => <span key={x.id} className={`chip ${x.good ? '' : 'evil'}`}>{name(x.id)} · {x.good ? '好人' : '坏人'}</span>)}</div>
        </div>
      )}
      {a.stage === 'reveal' && <p className="muted">看完在操作面板点「我看好了」。</p>}
    </Panel>
  );
}

/** 任务记录板：每一轮每一次组队的队长、队员、每个人的票，和任务结果。 */
function Record({ a, s, g }) {
  const ps = s.players;
  const rounds = a.quests.map((q, i) => ({ q, i: i + 1, props: a.proposals.filter((x) => x.round === i + 1) })).filter((x) => x.props.length || x.q.result);
  return (
    <Panel title="任务记录板" tone="light">
      <QuestBoard a={a} />
      {!rounds.length && <p className="muted">还没有组过队。每次组队的队长、队员和每个人的票都会记在这里。</p>}
      <div className="av-record">
        <table>
          <thead>
            <tr><th>轮</th><th>队长</th>{ps.map((p) => <th key={p.id} title={p.name}>{p.seat}</th>)}<th>结果</th></tr>
          </thead>
          <tbody>
            {rounds.flatMap(({ q, i, props }) => props.map((pr, k) => (
              <tr key={`${i}-${k}`} className={pr.approved ? 'ok' : ''}>
                <td>{i}-{pr.attempt}</td>
                <td>{g(pr.leader)?.seat}号</td>
                {ps.map((p) => (
                  <td key={p.id} className={`${pr.team.includes(p.id) ? 'on' : ''} ${pr.votes[p.id] ? 'y' : 'n'}`} title={`${p.seat}号 ${pr.votes[p.id] ? '赞成' : '反对'}${pr.team.includes(p.id) ? ' · 队员' : ''}`}>
                    {pr.votes[p.id] ? '✓' : '✗'}
                  </td>
                ))}
                <td>{!pr.approved ? '否决' : q.result ? `${q.result === 'success' ? '成功' : '失败'} · ${q.fails} 败` : '进行中'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="muted av-legend">✓ 赞成 ✗ 反对；高亮的格子是这次的队员。</p>
      {a.lady?.log.length > 0 && <p className="muted">湖中仙女：{a.lady.log.map((x) => `第${x.round}轮 ${g(x.from)?.seat}号 查看 ${g(x.to)?.seat}号`).join('；')}</p>}
    </Panel>
  );
}

/** 这局在场的角色。 */
function InPlay({ a }) {
  return (
    <Panel title="在场的角色" tone="light">
      <div className="av-roles">
        {a.roles.map((r) => (
          <div key={r.id} className={`av-r ${r.good ? 'good' : 'evil'}`}>
            <b>{r.name}{r.count > 1 ? ` ×${r.count}` : ''}</b>
            <p>{r.ability}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ───────────── 大厅 ─────────────
/** 大厅的人数条：好人 / 坏人。 */
export function AvalonDist({ n }) {
  const t = AVALON_TEAMS[n];
  if (!t) return <p className="muted dist-empty">{n < 5 ? `阿瓦隆至少 5 人开局（现在 ${n} 人）` : '阿瓦隆最多 10 人'}</p>;
  return (
    <div className="dist">
      <div className="dist-bar"><i style={{ flex: t[0], background: 'var(--int)' }} /><i style={{ flex: t[1], background: 'var(--phy)' }} /></div>
      <div className="dist-legend"><span><b style={{ color: 'var(--int)' }}>{t[0]}</b>好人</span><span><b style={{ color: 'var(--phy)' }}>{t[1]}</b>坏人</span><span>任务 {QUEST_SIZES[n].join('-')}{n >= 7 ? ' · 第 4 轮要 2 张失败' : ''}</span></div>
    </div>
  );
}

/** 房主设置：可选角色、湖中仙女、每轮自由活动多久。 */
export function AvalonSettings({ st, set, n, Toggle, Select }) {
  const opts = { ...DEFAULT_OPTIONS, ...st.avalonRoles };
  const roles = AVALON_TEAMS[n] ? avalonRoles(n, opts) : null;
  const flip = (k) => set({ avalonRoles: { ...opts, [k]: !opts[k] } });
  return (
    <div className="setting-wrap"><div className="setting-groups">
      <div className="setting-col">
        <div className="setting-group">
          <h4>可选角色</h4>
          <Toggle label="派西维尔（看到梅林和莫甘娜）" on={opts.percival} onChange={() => flip('percival')} />
          <Toggle label="莫甘娜（在派西维尔眼里像梅林）" on={opts.morgana} onChange={() => flip('morgana')} />
          <Toggle label="莫德雷德（梅林看不到）" on={opts.mordred} onChange={() => flip('mordred')} />
          <Toggle label="奥伯伦（不认识同伴）" on={opts.oberon} onChange={() => flip('oberon')} />
          <p className="muted setting-note">梅林和刺客总在。坏人位置不够时按莫甘娜、莫德雷德、奥伯伦的顺序放，其余是爪牙和忠臣。</p>
          {roles && <p className="muted setting-note">{n} 人这局：{roles.map((r) => AVALON_ROLES[r].name).join('、')}</p>}
        </div>
      </div>
      <div className="setting-col">
        <div className="setting-group">
          <h4>流程</h4>
          <Toggle label="湖中仙女（第 2、3、4 轮后查一个人的阵营）" on={!!st.avalonLady} onChange={(v) => set({ avalonLady: v })} />
          <Select label="每轮任务前自由活动" value={st.avalonRoamMinutes ?? 2} options={[0, 1, 2, 3, 5]} unit="分钟" zero="不自由活动" onChange={(v) => set({ avalonRoamMinutes: v })} />
          <Toggle label="随机排座位" on={st.shuffle} onChange={(v) => set({ shuffle: v })} />
          <p className="muted setting-note">队长组队 2 分钟、投票 1 分钟、出任务票 45 秒，到点没动作的替他随机选。湖中仙女官方推荐 7 人及以上用。</p>
        </div>
        <div className="setting-group">
          <h4>观战</h4>
          <Toggle label="观战者能看所有身份" on={st.spectatorGrimoire} onChange={(v) => set({ spectatorGrimoire: v })} />
          <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} onChange={(v) => set({ muteSpectators: v })} />
        </div>
      </div>
    </div></div>
  );
}

/** 大厅下面的角色一览。 */
export function AvalonShowcase() {
  return (
    <section className="lobby-roles glass pnl av-showcase">
      <header className="roles-head">
        <div>
          <h2>阿瓦隆 · 全部角色</h2>
          <p className="muted">《抵抗组织：阿瓦隆》原版规则：不杀人、不处决，靠组队、投票和任务分胜负。</p>
        </div>
      </header>
      <div>
        <div className="av-roles">
          {Object.entries(AVALON_ROLES).map(([id, r]) => (
            <div key={id} className={`av-r ${isGood(id) ? 'good' : 'evil'}`}><b>{r.name}</b><p>{r.ability}</p></div>
          ))}
        </div>
        <p className="muted">每轮：队长提名队员 → 所有人同时投赞成 / 反对，过半通过 → 队员秘密出成功 / 失败（好人只能出成功）。三次成功好人赢（除非刺客认出梅林），三次失败或同一轮连续 5 次否决坏人赢。7 人及以上第 4 轮要 {failsNeeded(7, 4)} 张失败票才失败。</p>
      </div>
    </section>
  );
}
