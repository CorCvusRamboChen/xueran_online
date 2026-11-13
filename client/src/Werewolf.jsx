// 狼人杀（娱乐模式）的游戏画面：座位圈 + 操作面板 + 右栏。服务器那边见 src/server/werewolfRoom.js，规则见 src/engine/werewolf.js。
// 借用血染的零件（广场座位圈、HUD、记录、小魔典），流程和按钮是狼人杀自己的。
import { useEffect, useState } from 'react';
import { Town } from './Town.jsx';
import { Tag, Panel, Btn, HudBar } from './ui.jsx';
import { Portrait, Line, useTick, useCountdown, cnNum } from './util.jsx';
import { SoundToggles } from './Stage.jsx';
import { Replay } from './replay.jsx';
import { History, InfoBox, Roster, Picker } from './App.jsx';
import { Watchers } from './Lobby.jsx';
import { ROLES } from '../../src/engine/roles.js';
import { WW_SETUPS, ragnarokWolves, abilityIn } from '../../src/engine/werewolf-roles.js';
import { useDockSheet, DockHandle } from './DockSheet.jsx';

const SIDE = { wolf: ['狼人', 'var(--phy)'], god: ['神职', 'var(--int)'], villager: ['平民', 'var(--psy)'] };
const SIDE_OF = (id) => ROLES[id]?.side ?? 'villager';
const GLYPH = { ww_wolf: '狼', ww_seer: '预', ww_witch: '巫', ww_hunter: '猎', ww_guard: '守', ww_villager: '民' };

/** 规则口径：大厅和游戏里的「规则」页共用。和 engine/werewolf.js 顶上的注释一致。 */
export const WW_RULES = [
  '夜晚顺序：守卫守人 → 狼人刀人 → 女巫用药 → 预言家查验。夜里的死亡天亮才结算，当晚被刀的人照样行动。',
  '守卫可以守自己、可以空守，不能连续两晚守同一人；守卫挡不住毒药。',
  '狼人互相认识，每人投一票（可以空刀，也可以刀自己人）。所有狼人选同一个人就立刻定下；时间到时按票数最多的定，并列时法官在并列的里随机挑（「空刀」也算一个选项）。',
  '女巫先看到今晚的刀口，再决定救不救。解药、毒药整局各一瓶，同一晚只能用一瓶；只有首夜能自救；不能毒自己；解药用掉后不再得知刀口。',
  '同一人被守卫守护又被女巫救，反而会死（奶穿）。',
  '天亮只公布谁出局，不公布死因。首夜死者、被放逐的人、被猎人带走的人有遗言；第二夜起夜里死的人没有。',
  '猎人出局时可以开枪带走一人；被女巫毒死不能开枪。每次有人出局都会留同样长的「发动技能」时间，不会从等多久看出谁是猎人。',
  '警长：第一天首夜死者说完遗言后上警。想当的人上警、依次发言（可以退水，退了也不能投票），没上警的人投票选，平票 PK，再平没有警长；没人上警或所有人都上警也没有警长。',
  '警长的放逐票算 1.5 票；白天由警长决定从他哪一侧开始发言，警长最后发言（归票）。警长出局时可以把警徽移交给一名存活玩家，也可以撕掉（超时算撕掉）。',
  '没有警长时，从昨晚死者的下一位开始顺时针发言，平安夜随机挑一个人开始。然后所有存活玩家同时投票（不能投自己，可以弃票）。',
  '票数最多的人被放逐；平票的人 PK 发言，其余人在他们里面再投一次，再平就无人出局。',
  '狼人自爆：上警阶段和白天发言阶段，狼人随时可以自爆——立刻出局、有遗言，当天剩下的发言和投票跳过，直接入夜。上警阶段自爆吞警徽：第一次推迟到第二天重新上警，第二次警徽流失。',
  '屠边：狼人全部出局好人胜；所有神职或所有平民出局狼人胜。两边同时达成算狼人胜（狼刀在先）。出局的人不能说话、不能投票（语音里会被闭麦，说遗言时除外）。',
];

/** 诸神黄昏（狼人杀的板子，只有狼人和猎人）的规则：没有守卫、女巫、预言家，其余照狼人杀。 */
export const RAG_RULES = [
  '只有狼人和猎人：按人数定狼人数量（5–6 人 1 只、7–9 人 2 只、10–12 人 3 只、13–15 人 4 只），其余全是猎人。',
  '狼人互相认识，每晚一起刀一人：每人投一票，所有狼人选同一个人就立刻定下；时间到时按票数最多的定（可以空刀）。',
  '猎人出局（被刀或被放逐）可以开一枪带走一人，打谁谁死；被带走的猎人接着开。每次有人出局都会留同样长的「发动技能」时间，看不出谁是猎人。',
  '天亮只公布谁出局，不公布死因。首夜死者、被放逐的人、被猎人带走的人有遗言。',
  '白天照狼人杀：第一天竞选警长（1.5 票、定发言方向），轮流发言，同时投票放逐，平票 PK；狼人可以自爆。',
  '狼人全部出局好人胜；猎人全部出局狼人胜。两边同时达成算狼人胜（狼刀在先）。',
];
const rulesOf = (script) => (script === 'rag' ? RAG_RULES : WW_RULES);

/** 人数配置表（大厅显示）。 */
export function WwSetupTable({ n, script = 'ww' }) {
  if (script === 'rag') {
    return (
      <table className="ww-table">
        <thead><tr><th>人数</th><th>狼人</th><th>猎人</th></tr></thead>
        <tbody>
          {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((k) => (
            <tr key={k} className={k === n ? 'on' : ''}><td>{k}</td><td>{ragnarokWolves(k)}</td><td>{k - ragnarokWolves(k)}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  const rows = Object.entries(WW_SETUPS);
  return (
    <table className="ww-table">
      <caption className="muted">9 人、12 人是标准板子，其余人数是按比例推的（非标准）。都有警长和狼人自爆。</caption>
      <thead><tr><th>人数</th><th>狼人</th><th>神职</th><th>平民</th></tr></thead>
      <tbody>
        {rows.map(([k, x]) => (
          <tr key={k} className={Number(k) === n ? 'on' : ''}>
            <td>{k}{['9', '12'].includes(k) ? '' : '（非标准）'}</td><td>{x.wolves}</td><td>{x.gods.map((r) => ROLES[r].name).join('、')}</td><td>{x.villagers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 某人数的阵营构成：狼人 / 神职 / 平民（诸神黄昏：狼人 / 猎人）。 */
export function wwDist(n, script = 'ww') {
  if (script === 'rag') return n >= 5 && n <= 15 ? [['狼人', ragnarokWolves(n), SIDE.wolf[1]], ['猎人', n - ragnarokWolves(n), SIDE.god[1]]] : null;
  const x = WW_SETUPS[n];
  return x ? [['狼人', x.wolves, SIDE.wolf[1]], ['神职', x.gods.length, SIDE.god[1]], ['平民', x.villagers, SIDE.villager[1]]] : null;
}

/** 一张狼人杀的身份牌（不用血染的能力牌：那上面写的是镇民 / 恶魔）。 */
function WwCard({ id, script = 'ww' }) {
  const r = ROLES[id];
  const [side, color] = SIDE[r.side];
  return (
    <article className="acard ww-card" style={{ '--attr': color }}>
      <div className="acard-art ww-art"><span className="ww-glyph">{GLYPH[id]}</span></div>
      <header className="acard-name"><b>{r.name}</b><small>{r.en.toUpperCase()}</small></header>
      <div className="acard-body">
        <p className="acard-kicker">{side} · {r.side === 'wolf' ? '狼人阵营' : '好人阵营'}</p>
        <p className="acard-text">{abilityIn(id, script)}</p>
      </div>
    </article>
  );
}

/** 大厅：这个模式的全部角色、人数表和规则口径。 */
export function WwShowcase({ n, script = 'ww' }) {
  const rag = script === 'rag';
  return (
    <section className="lobby-roles glass pnl ww-showcase">
      <header className="roles-head">
        <div>
          <h2>{rag ? '诸神黄昏 · 狼人与猎人' : '狼人杀 · 预女猎守'}</h2>
          <p className="muted">{rag ? '狼人杀的板子，不是血染：只有狼人和猎人，猎人倒下开枪、被带走的猎人接着开。法官（AI）只负责叫人、计时、唱票。' : '经典网杀规则，不是血染：没有说书人的判断，法官（AI）只负责叫人、计时、唱票。'}</p>
        </div>
      </header>
      <div className="roles-grid ww-roles">
        {(rag ? ['ww_wolf', 'ww_hunter'] : ['ww_wolf', 'ww_seer', 'ww_witch', 'ww_hunter', 'ww_guard', 'ww_villager']).map((id) => <WwCard key={id} id={id} script={script} />)}
      </div>
      <h3>人数配置</h3>
      <WwSetupTable n={n} script={script} />
      <h3>规则口径</h3>
      <ul className="no-why">{rulesOf(script).map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}

const PICK_KINDS = new Set(['guard', 'wolf', 'seer', 'hunter', 'vote']);

export function WerewolfGame({ s, act, ask }) {
  const [picked, setPicked] = useState(null);
  const [poison, setPoison] = useState(false); // 女巫正在选毒谁
  const [tab, setTab] = useState(null);
  useTick(1000);
  const me = s.self;
  const ww = s.ww;
  const prompt = me?.prompt;
  const g = (id) => s.players.find((p) => p.id === id);
  const name = (id) => { const p = g(id); return p ? `${p.seat}号 ${p.id === s.me ? '你' : p.name}` : '?'; };
  const night = s.phase === 'night';
  const key = `${ww.seq}-${prompt?.kind}`;
  useEffect(() => { setPicked(null); setPoison(false); }, [key]);

  const options = poison && prompt?.kind === 'witch' ? prompt.poisonOptions : PICK_KINDS.has(prompt?.kind) ? prompt.options : null;
  const onTap = (p) => { if (options?.includes(p.id)) setPicked((cur) => (cur === p.id ? null : p.id)); };
  const secs = useCountdown(s.deadline);
  const timerLabel = night ? '行动倒计时' : ww.stageName;
  const items = [
    me && { id: 'role', icon: 'role', label: '身份', dot: me.inbox.length || 0 },
    { id: 'log', icon: 'talk', label: '记录' },
    { id: 'votes', icon: 'roster', label: '票型' },
    { id: 'roster', icon: 'roster', label: '玩家' },
    { id: 'rules', icon: 'grim', label: '规则' },
    s.isHost && { id: 'host', icon: 'menu', label: '房主' },
  ].filter(Boolean);
  const shown = tab ?? (me ? 'role' : 'log');
  const dockHot = !!prompt && prompt.kind !== 'dying' && !(prompt.kind === 'vote' && prompt.mine !== undefined);
  const [dockMin, toggleDock, dockRef] = useDockSheet(dockHot);

  return (
    <div className="game ww-game">
      <section className="scene">
        <Tag className="where">{night ? `第${cnNum(s.night)}夜` : s.phase === 'ended' ? '终局' : `第${cnNum(s.day)}天 · ${ww.stageName}`}</Tag>
        {s.spectator && s.phase !== 'ended' && <div className="spectator-bar">观战中{s.settings?.spectatorGrimoire ? ' · 你能看到所有人的身份，别在语音里说' : ' · 看不到任何人的身份'}</div>}
        <div className="board-bar">
          <span className="bb-script">狼人杀</span>
          <span className="bb-n">{s.players.length} 人局</span>
          {(wwDist(s.players.length, s.script) ?? []).map(([k, v, c]) => <span key={k} className="bb-item"><b style={{ color: c }}>{v}</b>{k}</span>)}
          <span className="bb-note">屠边</span>
        </div>
        <Town s={s} picked={picked ? [picked] : []} pickable={options} onTap={onTap}>
          <WwCenter s={s} name={name} g={g} />
        </Town>
        <SoundToggles onFixVoice={me && s.phase !== 'ended' ? () => act('fixVoice') : null} />
        <HudBar items={items} active={tab} onPick={(id) => setTab((cur) => (cur === id ? null : id))} label={night ? `第${cnNum(s.night)}夜` : `第${cnNum(s.day)}天`}
          timer={s.deadline && secs != null ? { label: timerLabel, secs, urgent: secs <= 10 } : null} />
      </section>

      <section ref={dockRef} className={`dock ${dockHot ? 'dock-hot' : ''} ${dockHot && dockMin ? 'dock-min' : ''}`}>
        {dockHot && <DockHandle min={dockMin} onToggle={toggleDock} />}
        <WwActions s={s} act={act} me={me} prompt={prompt} name={name} g={g} picked={picked} setPicked={setPicked} poison={poison} setPoison={setPoison} />
      </section>

      <aside className={`drawer ${tab ? 'open' : ''}`}>
        <div className="drawer-tabs">
          {items.map((it) => <button key={it.id} type="button" className={shown === it.id ? 'on' : ''} onClick={() => setTab(it.id)}>{it.label}</button>)}
          <button type="button" className="drawer-close" onClick={() => setTab(null)} aria-label="收起">×</button>
        </div>
        <div className="drawer-body">
          {shown === 'role' && me && <WwSelf me={me} name={name} />}
          {shown === 'log' && <History log={s.log} players={s.players} ask={ask} epoch={s.logEpoch} />}
          {shown === 'votes' && <WwVotes votes={ww.votes} name={name} />}
          {shown === 'roster' && <><Roster s={s} /><Watchers s={s} /></>}
          {shown === 'rules' && <><WwSetupTable n={s.players.length} script={s.script} /><ul className="no-why">{rulesOf(s.script).map((t) => <li key={t}>{t}</li>)}</ul></>}
          {shown === 'host' && s.isHost && <WwHost s={s} act={act} />}
        </div>
      </aside>
    </div>
  );
}

/** 座位圈中间：现在谁在发言 / 投票进度 / 出局的人。 */
function WwCenter({ s, name, g }) {
  const ww = s.ww;
  if (s.winner) {
    return <div className={`center-box win ${s.winner.team}`}><Tag tone={s.winner.team === 'good' ? 'int' : 'phy'}>{s.winner.team === 'good' ? '好人获胜' : '狼人获胜'}</Tag></div>;
  }
  if (s.phase === 'night') return <div className="center-box"><small>天黑请闭眼</small></div>;
  const face = (id, label) => (
    <figure key={id} className="ww-face">
      <Portrait p={g(id)} size={56} prefer="avatar" frame="#f4f4f0" />
      <figcaption>{name(id)}</figcaption>
      {label && <small>{label}</small>}
    </figure>
  );
  if (ww.speaker) return <div className="center-box">{face(ww.speaker, { words: '遗言', pk: 'PK 发言', campaign: '警上发言', campaignPk: '警上 PK' }[ww.stage] ?? '发言中')}</div>;
  if (ww.voting) {
    return (
      <div className="center-box">
        <div className="vc-title">{ww.voting.election ? (ww.voting.pk ? '警上 PK 投票' : '警下投票选警长') : ww.voting.pk ? 'PK 投票' : '放逐投票'}<span>已投 {ww.voting.done.length} / {ww.voting.voters.length}</span></div>
        {(ww.voting.pk || ww.voting.election) && <div className="ww-faces">{ww.voting.candidates.map((id) => face(id))}</div>}
      </div>
    );
  }
  if (ww.stage === 'signup') return <div className="center-box"><div className="vc-title">{ww.election?.postponed ? '重新上警' : '竞选警长'}<span>已表态 {ww.election?.decided ?? 0} / {s.players.filter((p) => p.alive).length}</span></div></div>;
  if (ww.stage === 'order' || ww.stage === 'badge') return <div className="center-box">{face(ww.sheriff, ww.stage === 'order' ? '警长定发言顺序' : '警长移交警徽')}</div>;
  if (ww.dying) return <div className="center-box"><div className="ww-faces">{ww.dying.map((id) => face(id, '出局'))}</div><small>等待出局的人发动技能</small></div>;
  const last = ww.votes.at(-1);
  if (last && last.day === s.day && last.exiled) return <div className="center-box">{face(last.exiled, '被放逐')}</div>;
  return null;
}

/** 操作面板。 */
function WwActions({ s, act, me, prompt, name, g, picked, setPicked, poison, setPoison }) {
  const ww = s.ww;
  const pick = (kind) => prompt && <Picker s={s} options={kind === 'poison' ? prompt.poisonOptions : prompt.options} picked={picked ? [picked] : []} onTap={(p) => setPicked((cur) => (cur === p.id ? null : p.id))} />;
  const send = async (type, payload) => { if (await act(type, payload)) setPicked(null); };

  if (s.phase === 'ended') {
    const good = s.winner?.team === 'good';
    return (
      <Panel title={good ? '好人获胜' : '狼人获胜'} tone={good ? 'int' : 'phy'}>
        <p className="lead">{s.winner?.reason}</p>
        <p className="muted">所有人的身份写在肖像下面。</p>
        {s.isHost && <div className="btn-row"><Btn kind="primary" onClick={() => act('end')}>再来一局</Btn></div>}
        {s.timeline?.length > 0 && <Replay timeline={s.timeline} />}
      </Panel>
    );
  }

  switch (prompt?.kind) {
    case 'guard':
      return (
        <Panel title="守卫" tone="int" className="choose-pnl">
          <p className="lead">选一名玩家守护：他今晚不会被狼人刀死。可以守自己，也可以空守。</p>
          {prompt.last && <p className="muted">昨晚守了 {name(prompt.last)}，今晚不能再守他。</p>}
          {pick()}
          <div className="btn-row">
            <Btn kind="primary" disabled={!picked} onClick={() => send('wwGuard', { target: picked })}>守护</Btn>
            <Btn kind="ghost" onClick={() => send('wwGuard', { target: null })}>空守</Btn>
          </div>
        </Panel>
      );
    case 'wolf': {
      const mates = Object.entries(prompt.picks).filter(([id]) => id !== s.me);
      return (
        <Panel title="狼人" tone="phy" className="choose-pnl">
          <p className="lead">和同伴商量今晚刀谁。所有狼人选同一个人就立刻定下；时间到按票数最多的定。</p>
          <p className="muted">同伴：{(me.allies ?? []).map((a) => `${name(a.id)}${g(a.id)?.alive ? '' : '（已出局）'}`).join('、') || '没有，你是唯一的狼人'}</p>
          {mates.length > 0 && <p className="muted">同伴的选择：{mates.map(([id, t]) => `${g(id)?.seat}号 → ${t ? name(t) : '空刀'}`).join('；')}</p>}
          {prompt.mine !== undefined && <p className="muted">你现在选的是：<b>{prompt.mine ? name(prompt.mine) : '空刀'}</b>（还能改）</p>}
          {pick()}
          <div className="btn-row">
            <Btn kind="primary" disabled={!picked} onClick={() => send('wwWolf', { target: picked })}>刀他</Btn>
            <Btn kind="ghost" onClick={() => send('wwWolf', { target: null })}>空刀</Btn>
          </div>
        </Panel>
      );
    }
    case 'witch':
      return (
        <Panel title="女巫" tone="int" className="choose-pnl">
          <p className="lead">{!prompt.knows ? '解药已经用掉了，你不再得知今晚的刀口。' : prompt.knife ? <>今晚被刀的是 <b>{name(prompt.knife)}</b>。</> : '今晚没有人被刀（狼人空刀）。'}</p>
          {prompt.selfBlocked && <p className="muted">刀口是你自己：首夜之后不能自救。</p>}
          <p className="muted">解药 {prompt.knows ? '还在' : '已用'} · 毒药 {prompt.canPoison ? '还在' : '已用'} · 同一晚只能用一瓶</p>
          {poison ? (
            <>
              <p className="lead">毒谁？</p>
              {pick('poison')}
              <div className="btn-row">
                <Btn kind="primary" disabled={!picked} onClick={() => send('wwWitch', { poison: picked })}>毒他</Btn>
                <Btn kind="ghost" onClick={() => { setPoison(false); setPicked(null); }}>返回</Btn>
              </div>
            </>
          ) : (
            <div className="btn-row">
              {prompt.canSave && <Btn kind="primary" onClick={() => send('wwWitch', { save: true })}>用解药救{prompt.knife === s.me ? '自己' : '他'}</Btn>}
              {prompt.canPoison && <Btn onClick={() => setPoison(true)}>用毒药</Btn>}
              <Btn kind="ghost" onClick={() => send('wwWitch', {})}>今晚不用药</Btn>
            </div>
          )}
        </Panel>
      );
    case 'seer':
      return (
        <Panel title="预言家" tone="int" className="choose-pnl">
          <p className="lead">查验一名玩家：你会得知他是好人还是狼人。</p>
          {pick()}
          <div className="btn-row"><Btn kind="primary" disabled={!picked} onClick={() => send('wwSeer', { target: picked })}>查验</Btn></div>
          {me.checks?.length > 0 && <SeerChecks checks={me.checks} name={name} />}
        </Panel>
      );
    case 'hunter':
      return (
        <Panel title="猎人" tone="phy" className="choose-pnl">
          <p className="lead">你出局了。可以开枪带走一名存活的玩家，也可以不开。</p>
          {pick()}
          <div className="btn-row">
            <Btn kind="primary" disabled={!picked} onClick={() => send('wwShoot', { target: picked })}>开枪</Btn>
            <Btn kind="ghost" onClick={() => send('wwShoot', { target: null })}>不开枪</Btn>
          </div>
        </Panel>
      );
    case 'dying':
      return (
        <Panel title="出局" tone="dark">
          <p className="lead">{prompt.poisoned ? '你被女巫毒死了，不能开枪。' : '你出局了，没有可以发动的技能。'}</p>
          <p className="muted">大家都会等同样长的时间，别人看不出谁是猎人。</p>
        </Panel>
      );
    case 'speak':
      return (
        <Panel title={{ words: '遗言', pk: 'PK 发言', campaign: '警上发言', campaignPk: '警上 PK 发言' }[prompt.stage] ?? '轮到你发言'} tone="mot">
          <p className="lead">{prompt.stage === 'words' ? '你出局了，留下最后几句话。' : '现在只有你能说话（其他人在语音里被闭麦）。'}</p>
          {s.self?.sheriff && prompt.stage === 'speech' && <p className="muted">你是警长，最后一个发言：可以归票。</p>}
          <div className="btn-row">
            <Btn kind="primary" onClick={() => send('wwDone')}>说完了</Btn>
            {prompt.canWithdraw && <Btn kind="ghost" onClick={() => send('wwWithdraw')}>退水</Btn>}
          </div>
          {ww.canBoom && <BoomButton act={act} election={!!ww.election} />}
        </Panel>
      );
    case 'signup':
      return (
        <Panel title={ww.election?.postponed ? '重新上警' : '竞选警长'} tone="mot" className="choose-pnl">
          <p className="lead">要不要上警？上警的人依次发言，没上警的人投票选警长。警长的放逐票算 1.5 票，白天由他定发言顺序、最后发言。</p>
          <p className="muted">上了警就不能投票（中途退水也一样）。</p>
          {prompt.mine !== undefined && <p className="lead">你选了：<b>{prompt.mine ? '上警' : '不上警'}</b>（还能改）</p>}
          <div className="btn-row">
            <Btn kind={prompt.mine === true ? 'primary' : 'secondary'} onClick={() => send('wwSignup', { yes: true })}>上警</Btn>
            <Btn kind={prompt.mine === false ? 'primary' : 'ghost'} onClick={() => send('wwSignup', { yes: false })}>不上警</Btn>
          </div>
          {ww.canBoom && <BoomButton act={act} election={!!ww.election} />}
        </Panel>
      );
    case 'withdraw':
      return (
        <Panel title="你在警上" tone="mot">
          <p className="lead">{ww.speaker ? `${name(ww.speaker)} 正在发言。` : ''}不想竞选了可以退水（退了也不能投票）。</p>
          <div className="btn-row"><Btn kind="ghost" onClick={() => send('wwWithdraw')}>退水</Btn></div>
          {ww.canBoom && <BoomButton act={act} election={!!ww.election} />}
        </Panel>
      );
    case 'order':
      return (
        <Panel title="警长定发言顺序" tone="mot" className="choose-pnl">
          <p className="lead">今天从哪一边开始发言？你最后发言（归票）。</p>
          <div className="btn-row">
            <Btn kind="primary" onClick={() => send('wwOrder', { dir: 'up' })}>从 {name(prompt.up)} 开始（座位号递增）</Btn>
            <Btn kind="primary" onClick={() => send('wwOrder', { dir: 'down' })}>从 {name(prompt.down)} 开始（座位号递减）</Btn>
          </div>
        </Panel>
      );
    case 'badge':
      return (
        <Panel title="移交警徽" tone="mot" className="choose-pnl">
          <p className="lead">你是警长，你出局了。把警徽交给一名存活的玩家，或者撕掉（这局就没有警长了）。</p>
          {pick()}
          <div className="btn-row">
            <Btn kind="primary" disabled={!picked} onClick={() => send('wwBadge', { target: picked })}>移交警徽</Btn>
            <Btn kind="ghost" onClick={() => send('wwBadge', { target: null })}>撕掉警徽</Btn>
          </div>
        </Panel>
      );
    case 'vote':
      return (
        <Panel title={prompt.election ? (prompt.pk ? '警上 PK 投票' : '投票选警长') : prompt.pk ? 'PK 投票' : '放逐投票'} tone="phy" className="choose-pnl">
          {prompt.mine !== undefined ? <p className="lead">你投了 <b>{prompt.mine ? name(prompt.mine) : '弃票'}</b>。等其他人投完一起公布。</p>
            : <p className="lead">{prompt.election ? '在警上的人里投一个当警长（一人一票）。' : prompt.pk ? '在 PK 的人里投一个出局。' : '投一个人出局，票数最多的被放逐。'}所有人同时投，投完一起公布。</p>}
          {!prompt.election && s.self?.sheriff && <p className="muted">你是警长：你这一票算 1.5 票。</p>}
          {prompt.mine === undefined && (
            <>
              {pick()}
              <div className="btn-row">
                <Btn kind="primary" disabled={!picked} onClick={() => send('wwVote', { target: picked })}>投他</Btn>
                <Btn kind="ghost" onClick={() => send('wwVote', { target: null })}>弃票</Btn>
              </div>
            </>
          )}
        </Panel>
      );
    default: break;
  }

  if (ww.canBoom) {
    return (
      <Panel title={ww.stageName} tone="light">
        {ww.speaker && <p className="lead">{name(ww.speaker)} 正在发言。</p>}
        <BoomButton act={act} election={!!ww.election} />
      </Panel>
    );
  }
  if (s.phase === 'night') {
    return (
      <Panel title="夜晚" tone="dark">
        <p className="flavor-line">「天黑请闭眼。」</p>
        <p className="lead">{me && !me.alive ? '你已经出局了。' : '闭上眼睛，等法官叫到你。'}</p>
      </Panel>
    );
  }
  const stage = ww.stage;
  return (
    <Panel title={ww.stageName} tone="light">
      {ww.speaker && <p className="lead">{stage === 'words' ? '遗言' : '发言'}：<b>{name(ww.speaker)}</b></p>}
      {ww.speakers && <p className="muted">发言顺序：{ww.speakers.map((id, i) => <span key={id} className={i < ww.spoke ? 'ww-spoke' : i === ww.spoke ? 'ww-now' : ''}>{g(id)?.seat}号 </span>)}</p>}
      {ww.voting && <p className="lead">已投 {ww.voting.done.length} / {ww.voting.voters.length}{me && !ww.voting.voters.includes(s.me) ? (me.alive ? '（你在 PK 台上，不能投）' : '（你已出局，不能投）') : ''}</p>}
      {ww.dying && <p className="lead">{ww.dying.map(name).join('、')} 出局，等待发动技能……</p>}
      {stage === 'dusk' && <p className="lead">今天的放逐结束，马上入夜。</p>}
      {ww.election?.runners && <p className="muted">还在竞选：{ww.election.runners.map((id) => `${g(id)?.seat}号`).join('、') || '没有人'}{ww.election.ran.length > ww.election.runners.length ? `（退水：${ww.election.ran.filter((id) => !ww.election.runners.includes(id)).map((id) => `${g(id)?.seat}号`).join('、')}）` : ''}</p>}
      {ww.sheriff && <p className="muted">警长：{name(ww.sheriff)}</p>}
      {me && !me.alive && <p className="muted">你已经出局：不能发言、不能投票。</p>}
      {s.isHost && ww.speaker && ww.speaker !== s.me && <div className="link-row"><button type="button" onClick={() => act('wwSkip')}>跳过他（掉线 / 挂机）</button></div>}
    </Panel>
  );
}

function SeerChecks({ checks, name }) {
  return (
    <ul className="ww-checks">
      {checks.map((c) => <li key={`${c.night}-${c.target}`}><span className="stamp-time">第{cnNum(c.night)}夜</span>{name(c.target)} · <b style={{ color: c.wolf ? 'var(--phy)' : 'var(--int)' }}>{c.wolf ? '狼人' : '好人'}</b></li>)}
    </ul>
  );
}

/** 身份页：身份牌、同伴 / 查验记录 / 药，再下面是私密信息。 */
function WwSelf({ me, name }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InfoBox me={me} />
      <div className="idcard-wrap">
        <button type="button" className={`idcard ${open ? 'open' : ''}`} onClick={() => setOpen((x) => !x)} aria-label={open ? '合上身份卡' : '翻开身份卡'}>
          <span className="idcard-inner">
            <span className="idface idback"><span className="id-art ww-back">?</span><span className="id-name">翻开身份</span></span>
            <span className="idface idfront"><WwCard id={me.role.id} script={s.script} /></span>
          </span>
        </button>
        <p className="muted id-hint">{open ? `你坐在${cnNum(me.seat)}号${me.alive ? '' : '，已经出局'}。点卡片扣回去。` : '点卡片翻开。别让旁边的人看见。'}</p>
      </div>
      {me.allies && <p className="lead">狼人同伴：{me.allies.length ? me.allies.map((a) => name(a.id)).join('、') : '没有，你是唯一的狼人'}</p>}
      {me.checks && <><p className="lead">查验记录</p>{me.checks.length ? <SeerChecks checks={me.checks} name={name} /> : <p className="muted">还没有查验过。</p>}</>}
      {me.potions && <p className="lead">解药 {me.potions.save ? '还在' : '已用'} · 毒药 {me.potions.poison ? '还在' : '已用'}</p>}
      {me.lastGuard !== null && me.lastGuard !== undefined && <p className="muted">昨晚守了 {name(me.lastGuard)}。</p>}
    </>
  );
}

/** 每天的票型（唱票后公开）。 */
function WwVotes({ votes, name }) {
  if (!votes?.length) return <p className="muted">还没有投过票。</p>;
  return (
    <ul className="ww-votes">
      {[...votes].reverse().map((v, i) => {
        const rows = Object.entries(v.tally).sort((a, b) => b[1] - a[1]);
        const abstain = Object.entries(v.ballots).filter(([, t]) => !t).map(([id]) => id);
        return (
          <li key={i}>
            <header><span className="stamp-time">第{cnNum(v.day)}天{v.election ? ' · 警长' : ''}{v.pk ? ' · PK' : ''}</span>
              <b>{v.election ? (v.elected ? `${name(v.elected)} 当选警长` : v.pkList ? '平票，警上 PK' : '没有选出警长') : v.exiled ? `${name(v.exiled)} 被放逐` : v.why === 'pk' ? '平票，进入 PK' : '无人出局'}</b></header>
            {v.sheriff && <Line text={`警长 ${name(v.sheriff)} 的票算 1.5 票`} />}
            {rows.map(([t, c]) => <Line key={t} text={`${name(t)} ${c} 票 ← ${Object.entries(v.ballots).filter(([, x]) => x === t).map(([id]) => name(id)).join('、')}`} />)}
            {abstain.length > 0 && <Line text={`弃票：${abstain.map(name).join('、')}`} />}
          </li>
        );
      })}
    </ul>
  );
}

/** 房主：提前结束这局、让出房主。点两次才生效。 */
function WwHost({ s, act }) {
  const [sure, setSure] = useState(null);
  const twice = (id, fn) => (sure === id ? (setSure(null), fn()) : setSure(id));
  return (
    <section className="ww-host">
      <p className="muted">法官（AI）全自动，房主不用主持。有人掉线挂机时，发言阶段可以在操作面板里「跳过他」。</p>
      <div className="btn-row">
        <Btn kind={sure === 'end' ? 'primary' : 'secondary'} onClick={() => twice('end', () => act('end'))}>{sure === 'end' ? '确定结束，回大厅' : '结束这局'}</Btn>
        {s.phase !== 'ended' && <Btn kind={sure === 'release' ? 'primary' : 'secondary'} onClick={() => twice('release', () => act('releaseHost'))}>{sure === 'release' ? '确定让出房主' : '让出房主'}</Btn>}
      </div>
    </section>
  );
}

/** 狼人自爆：点两次才生效。 */
function BoomButton({ act, election = false }) {
  const [sure, setSure] = useState(false);
  return (
    <div className="ww-boom">
      <Btn kind={sure ? 'primary' : 'secondary'} onClick={() => (sure ? act('wwBoom') : setSure(true))} onMouseLeave={() => setSure(false)}>
        {sure ? '确定自爆（立刻出局，今天直接入夜）' : '自爆'}
      </Btn>
      <small className="muted">只有你看得到这个按钮。{election ? '上警阶段自爆会吞掉警徽（第一次推迟到明天竞选，第二次警徽流失）。' : '自爆后有遗言。'}</small>
    </div>
  );
}
