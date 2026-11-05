// 娱乐模式「暗印」（原创）的界面。规则在 src/engine/mark.js，房间流程在 src/server/mark.js。
// · 白天自由活动：沿用小镇地图（TownMap）和私聊房子。在屋里点一个人「看后颈」：他转过身，露出后颈的印记——对视，他也同时看到你的。
//   坏人在这一刻可以调包；路上从别人身后经过可能瞟到；每人每天一封匿名信。
// · 回到广场圆桌讨论：没有提名，也没有投票。
// · 夜里：在自己家的小屋（Cottage）里写下自己的印记。写错的人在屋里看到印记炸开（闪光、冲击、烟尘、震屏、音效），别人天亮只看到死讯。
import { useEffect, useRef, useState } from 'react';
import { Town } from './Town.jsx';
import { TownMap } from './TownMap.jsx';
import { Cottage, DawnWake } from './Cottage.jsx';
import { Tag, Panel, Btn, Stat, HudBar } from './ui.jsx';
import { Portrait, useTick, useCountdown, cnNum, hue } from './util.jsx';
import { audio, heartbeat, tick, sfxEnabled } from './world/footsteps.js';
import { bus } from './mixer.js';
import { SUITS, MARKS, SUIT_INFO, MARK_ROLES, MARK_RULES, evilCount } from '../../src/engine/mark.js';
import './mark.css';

const STAGE_NAME = { setup: '天亮', morning: '天亮', roam: '自由活动', table: '圆桌讨论', dusk: '回家', night: '写下印记', ended: '终局' };
const KIND = { peek: '看了', mutual: '对视时看到', glimpse: '路上瞟到' };

/** 一个印记：红心方块红色，黑桃梅花奶白，鬼牌紫色；雾天看到的「红色 / 黑色」画成一个色块。 */
export function Suit({ suit, big = false, name = false }) {
  const s = SUIT_INFO[suit];
  if (!s) return <span className="mk-suit unknown">?</span>;
  return <span className={`mk-suit ${s.color} ${s.fog ? 'fog' : ''} ${big ? 'big' : ''}`}>{s.ch}{name && !s.fog && <small>{s.name}</small>}</span>;
}

// ───────────── 音效（现场合成，和脚步声同一个 AudioContext、走「音效」那一路音量） ─────────────
let noiseBuf = null;
function noise(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 3, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function ready() { if (!sfxEnabled()) return null; const a = audio(); return a && a.state === 'running' ? a : null; }

/** 印记在皮肤上烧起来：一段越来越尖的「滋——」。 */
function sizzle(sec = 1.4) {
  const a = ready(); if (!a) return;
  const t = a.currentTime + 0.01;
  const src = a.createBufferSource(); src.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(5200, t + sec);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + sec * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + sec + 0.05);
  src.connect(f).connect(g).connect(bus(a, 'sfx'));
  src.start(t, 0, sec + 0.1);
}

/** 爆炸：一记很低的冲击（正弦往下扫）+ 宽频轰鸣（低通往下扫）+ 失真 + 碎片噼啪 + 很长的余响。 */
function boom() {
  const a = ready(); if (!a) return;
  const out = a.createGain(); out.gain.value = 0.95;
  const shaper = a.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 3.2); }
  shaper.curve = curve;
  shaper.connect(out).connect(bus(a, 'sfx'));
  const t = a.currentTime + 0.01;
  const o = a.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.3);
  const og = a.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(1.2, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(og).connect(shaper); o.start(t); o.stop(t + 1.9);
  const n = a.createBufferSource(); n.buffer = noise(a);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(160, t + 2.6);
  const ng = a.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(1, t + 0.006); ng.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  n.connect(lp).connect(ng).connect(shaper); n.start(t, 0, 3.3);
  for (let i = 0; i < 18; i++) {
    const at = t + 0.05 + Math.random() * 0.9;
    const b = a.createBufferSource(); b.buffer = noise(a);
    const hp = a.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800 + Math.random() * 4500; hp.Q.value = 5;
    const bg = a.createGain(); bg.gain.setValueAtTime(0.0001, at); bg.gain.exponentialRampToValueAtTime(0.18 + Math.random() * 0.2, at + 0.002); bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + Math.random() * 0.08);
    b.connect(hp).connect(bg).connect(out); b.start(at, Math.random() * 2, 0.2);
  }
}

/** 被人看后颈 / 有人从背后经过：耳边一声轻轻的「嘶」。 */
function shiver() {
  const a = ready(); if (!a) return;
  const t = a.currentTime + 0.01;
  const src = a.createBufferSource(); src.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(f).connect(g).connect(bus(a, 'sfx')); src.start(t, 0, 1);
}

// ───────────── 整局 ─────────────
/** parts：从 App.jsx / Lobby.jsx 借来的零件（记录、声音开关、观战席、走路），免得文件互相引用。 */
export function MarkGame({ s, act, ask, parts: { History, SoundToggles, Watchers, onMove } }) {
  useTick(1000);
  const m = s.mark;
  const me = s.self;
  const stage = m.stage;
  const [tab, setTab] = useState(null);
  const [card, setCard] = useState(null); // 翻转卡：{ who, mode: 'peek' 我看他 | 'mutual' 他看我（对视） }
  const [quit, setQuit] = useState(false);
  const g = (id) => s.players.find((p) => p.id === id);
  const name = (id) => { const p = g(id); return p ? `${p.seat}号 ${p.name}` : '?'; };
  const mk = (kind, p = {}) => act('mark', { kind, ...p });
  const meP = g(s.me);
  const roaming = stage === 'roam' && !!s.roam;
  useEffect(() => { if (!roaming) setCard(null); }, [roaming]);

  const peek = async (id) => { if (await mk('peek', { target: id })) setCard({ who: id, mode: 'peek', at: Date.now() }); };
  // 别人看了我：同时翻一张卡，露出他的后颈（对视）
  const onMutual = (by) => { if (!card) setCard({ who: by, mode: 'mutual', at: Date.now() }); };

  const ring = { ...s, players: s.players.map((p) => ({ ...p, tags: tagsOf(p, m, s) })) };
  const secs = useCountdown(roaming ? s.roam.until : s.deadline);
  const night = stage === 'night';
  const timer = secs != null ? { label: roaming ? '自由活动结束' : night ? '午夜钟响' : '圆桌结束', secs, urgent: secs <= 10 } : null;
  // 夜里最后 10 秒滴答（只给还没写的人：服务器只给他倒计时）
  useEffect(() => { if (night && secs != null && secs > 0 && secs <= 10) tick(secs <= 3); }, [night ? secs : null]);

  const items = [
    me && { id: 'role', icon: 'role', label: '身份', dot: me.inbox.length || 0 },
    { id: 'record', icon: 'roster', label: '死讯和遗言' },
    { id: 'log', icon: 'talk', label: '记录' },
    { id: 'rules', icon: 'grim', label: '规则' },
  ].filter(Boolean);
  const shown = tab ?? (me ? 'role' : 'record');
  const hot = (night && me?.alive && !me.guess && !m.midnight) || !!me?.lastWord;
  const place = s.phase === 'ended' ? '钟楼镇 · 终局' : night || (stage === 'morning' && me) ? (me ? '你的家' : '钟楼镇 · 夜') : stage === 'dusk' ? '钟楼镇 · 黄昏' : `钟楼镇 · 第${cnNum(s.day)}天`;
  const glowTonight = m.glow?.[s.day] ?? [];

  let scene;
  if (roaming) scene = <TownMap s={s} onMove={me ? onMove : () => null} />;
  else if (night && me && meP) {
    scene = me.exploded ? <Explosion p={meP} why={me.blastWhy} guess={me.blastGuess} suit={me.blastSuit} />
      : <Cottage p={meP} awake={me.alive && !me.guess && !m.midnight} dead={!me.alive} dawn={false} />;
  } else if (stage === 'morning' && me && meP) scene = <DawnWake p={meP} dead={!me.alive} />;
  else scene = <Town s={ring} onTap={() => {}}><TableBoard s={s} m={m} name={name} g={g} /></Town>;

  return (
    <div className={`game mark ${night ? 'mk-night' : ''} ${m.foggy && !night ? 'mk-foggy' : ''}`}>
      <section className="scene">
        {!roaming && <Tag className="where">{place}</Tag>}
        {s.spectator && s.phase !== 'ended' && <div className="spectator-bar">观战中{s.settings?.spectatorGrimoire ? ' · 你能看到所有人的身份，别在语音里说' : ' · 看不到任何人的身份和印记'}</div>}
        {scene}
        {m.foggy && roaming && <div className="mk-fogbar">今天起雾 · 看背后只看得出红黑</div>}
        {night && me?.alive && !me.exploded && <NightBoard me={me} m={m} glow={glowTonight} name={name} />}
        {card && roaming && <PeekCard s={s} me={me} card={card} g={g} mk={mk} onClose={() => setCard(null)} />}
        <Notices s={s} me={me} g={g} onMutual={onMutual} />
        <SoundToggles onFixVoice={me && s.phase !== 'ended' ? () => act('fixVoice') : null} />
        <HudBar items={items} active={tab} onPick={(id) => setTab((cur) => (cur === id ? null : id))} label={STAGE_NAME[stage]} timer={timer} />
      </section>

      <section className={`dock ${hot ? 'dock-hot' : ''}`}>
        {me?.lastWord && <LastWordPanel s={s} me={me} mk={mk} name={name} />}
        <Dock s={s} m={m} me={me} mk={mk} act={act} g={g} name={name} peek={peek} glow={glowTonight} />
        {me && s.phase !== 'ended' && <MeBar s={s} me={me} mk={mk} name={name} />}
        {me?.alive && ['roam', 'table'].includes(stage) && <LetterPanel s={s} me={me} mk={mk} name={name} />}
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
          {shown === 'role' && me && <RoleSheet s={s} me={me} name={name} />}
          {shown === 'record' && <Record s={s} m={m} name={name} />}
          {shown === 'record' && <Watchers s={s} />}
          {shown === 'log' && <History log={s.log} players={s.players} ask={ask} epoch={s.logEpoch} />}
          {shown === 'rules' && <Rules n={s.players.length} />}
        </div>
      </aside>
    </div>
  );
}

/** 座位圈上的小标签：炸死、同伴、发光、说完了。 */
function tagsOf(p, m, s) {
  const t = [];
  if (!p.alive) t.push('炸死');
  const ally = s.self?.allies?.find((a) => a.id === p.id);
  if (ally) t.push(`同伴·${ally.team}`);
  if ((m.glow?.[s.day] ?? []).some((x) => x.id === p.id)) t.push('发光');
  return t;
}

/** 座位圈正中：圆桌讨论 / 黄昏 / 终局。 */
function TableBoard({ s, m, name }) {
  if (s.phase === 'ended') return <div className="mk-board"><small>终局</small><b className={s.winner?.team === 'good' ? 'good' : 'evil'}>{s.winner?.team === 'good' ? '好人获胜' : '坏人获胜'}</b></div>;
  const alive = s.players.filter((p) => p.alive).length;
  const last = m.nights.at(-1);
  if (m.stage === 'table') {
    return (
      <div className="mk-board">
        <small>圆桌讨论</small>
        <b>没有投票</b>
        <span>说完了 {m.done ?? 0} / {alive}{last ? ` · 昨天 ${last.swaps} 人被调包` : ''}</span>
      </div>
    );
  }
  if (m.stage === 'dusk') {
    const glow = m.glow?.[s.day] ?? [];
    return <div className="mk-board"><small>黄昏</small><b>回家</b><span>{glow.length ? glow.map((x) => <span key={x.id}>{name(x.id)} 发光 <Suit suit={x.suit} /> </span>) : '各自回到自己的房间'}</span></div>;
  }
  return <div className="mk-board"><small>第{cnNum(s.day)}天</small><b>暗印</b></div>;
}

// ───────────── 操作区 ─────────────
function Dock({ s, m, me, mk, act, g, name, peek, glow }) {
  const stage = m.stage;
  if (s.phase === 'ended') {
    const good = s.winner?.team === 'good';
    return (
      <Panel title={good ? '好人获胜' : '坏人获胜'} tone={good ? 'int' : 'phy'}>
        <p className="lead">{s.winner?.reason}。</p>
        <p className="muted">所有人的身份写在座位下面。每天每个人的印记、谁调包了谁、匿名信是谁写的、谁被谁骗死，在「死讯和遗言」里。</p>
        {s.isHost && <div className="btn-row"><Btn kind="primary" onClick={() => act('end')}>再来一局</Btn></div>}
      </Panel>
    );
  }
  if (stage === 'roam' && s.roam) return <RoamPanel s={s} me={me} act={act} mk={mk} g={g} name={name} peek={peek} />;
  if (stage === 'morning' || stage === 'setup') {
    const last = m.nights.at(-1);
    return (
      <Panel title={`第${cnNum(s.day)}天 · 天亮`} tone="mot">
        <p className="lead">钟声响过。每个活着的人后颈都换上了新的印记——你自己看不到。</p>
        {last && <p className="mk-hint">说书人：昨天有 <b>{last.swaps}</b> 个人被调包了。{last.dead.length ? `昨晚 ${last.dead.map(name).join('、')} 炸死了。` : '昨晚没有人死。'}</p>}
        {m.foggy && <p className="mk-hint fog">今天起雾：看别人背后只看得出红色还是黑色。</p>}
        <p className="muted">马上开始自由活动：走进房子和别人私聊，请他帮你看后颈（每天最多看 {m.rules.peeksPerDay} 个人）。</p>
      </Panel>
    );
  }
  if (stage === 'table') {
    return (
      <Panel title="圆桌讨论" tone="light">
        <p className="lead">大家回到广场说话。<b>没有提名，也没有投票</b>——说完就回家，夜里各自写下自己的印记。</p>
        {me?.alive ? (
          <div className="btn-row"><Btn kind={me.done ? 'secondary' : 'primary'} onClick={() => mk('done', { on: !me.done })}>{me.done ? '撤回「说完了」' : '说完了'}</Btn></div>
        ) : <p className="muted">{me ? '你已经死了，可以听大家说。' : '观战中。'}</p>}
        <p className="muted">说完了 {m.done ?? 0} 人。所有活人都说完就提前回家。</p>
      </Panel>
    );
  }
  if (stage === 'dusk') return <Panel title="回家" tone="dark"><p className="lead">天快黑了，大家回到自己的房间。</p>{glow.length > 0 && <GlowList glow={glow} name={name} />}</Panel>;
  if (stage === 'night') {
    if (!me) return <Panel title="夜" tone="dark"><p className="lead">大家在自己家里写下后颈的印记……{m.written != null ? `（${m.written} 人写好了）` : ''}</p></Panel>;
    if (me.exploded) return <Panel title="你死了" tone="phy"><p className="lead">印记在你屋里炸开了。{me.blastWhy === 'timeout' ? '你没在钟响前写下印记。' : <>你写的是 <Suit suit={me.blastGuess} name />，其实是 <Suit suit={me.blastSuit} name />。</>}</p><p className="muted">别人天亮才会知道你死了，不知道你写了什么。明天白天你可以留一句遗言。</p></Panel>;
    if (!me.alive) return <Panel title="夜" tone="dark"><p className="lead">你已经死了。等天亮……</p></Panel>;
    return <BrandWriter s={s} me={me} m={m} mk={mk} name={name} glow={glow} />;
  }
  return null;
}

function GlowList({ glow, name }) {
  return <p className="mk-glow">发光：{glow.map((x) => <span key={x.id}><b>{name(x.id)}</b> 后颈是 <Suit suit={x.suit} /> </span>)}<small>一天里被三个人看过背后的坏人，印记会发光。</small></p>;
}

/** 夜里写下自己的印记：先点一个，再按「烙下」确认（写了就不能改）。 */
function BrandWriter({ s, me, m, mk, name, glow }) {
  const [pick, setPick] = useState(null);
  const [peeking, setPeeking] = useState(false);
  if (m.midnight) return <Panel title="午夜" tone="dark"><p className="lead">钟声敲过了。等天亮……</p></Panel>;
  if (me.guess) {
    return (
      <Panel title="已写下" tone="dark">
        <p className="lead">你写下了 <Suit suit={me.guess} big name />。吹灭油灯，等午夜的钟声。</p>
        <p className="muted">{m.written} 人写好了。</p>
      </Panel>
    );
  }
  return (
    <Panel title="写下你后颈的印记" tone="mot" className="choose-pnl mk-writer">
      <p className="lead">写错或者没写，午夜钟响时印记就会炸开。抽到鬼牌的人要写「鬼牌」。</p>
      {me.suit && <p className="mk-own">你知道自己今天是 <Suit suit={me.suit} name /></p>}
      {!me.suit && me.reveals?.left > 0 && (
        <p className="mk-own">{peeking ? <><Btn kind="primary" onClick={() => mk('reveal')}>确定用掉一次</Btn> <Btn kind="ghost" onClick={() => setPeeking(false)}>算了</Btn></>
          : <Btn onClick={() => setPeeking(true)}>头头：看自己的印记（剩 {me.reveals.left} 次）</Btn>}</p>
      )}
      {glow.length > 0 && <GlowList glow={glow} name={name} />}
      <div className="mk-suits five">
        {MARKS.map((x) => (
          <button key={x} type="button" className={`mk-suit-btn ${pick === x ? 'on' : ''} ${SUIT_INFO[x].color}`} onClick={() => setPick(x)}>
            <span>{SUIT_INFO[x].ch}</span><small>{SUIT_INFO[x].name}</small>
          </button>
        ))}
      </div>
      <div className="btn-row">
        <Btn kind="primary" disabled={!pick} onClick={() => mk('guess', { suit: pick })}>烙下{pick ? ` ${SUIT_INFO[pick].name}` : ''}（不能改）</Btn>
      </div>
      <Heard s={s} me={me} name={name} />
    </Panel>
  );
}

/** 夜里屋里浮着的烙印板。 */
function NightBoard({ me, m, glow, name }) {
  if (m.midnight) return <div className="mk-nightboard"><b>午夜</b><span>钟声敲过了，等天亮</span></div>;
  return (
    <div className="mk-nightboard">
      <b>{me.guess ? <>已写下 <Suit suit={me.guess} /></> : '写下你后颈的印记'}</b>
      <span>{me.guess ? '吹灭油灯，等钟声' : '在右边（手机在下面）选一个'}</span>
      {glow.length > 0 && <span className="mk-glow-line">窗外有人的印记在发光：{glow.map((x) => <span key={x.id}>{name(x.id)} <Suit suit={x.suit} /> </span>)}</span>}
    </div>
  );
}

/** 今天别人当面告诉你的、门缝里塞进来的匿名信。 */
function Heard({ s, me, name }) {
  const heard = me.heard.filter((t) => t.day === s.day);
  const mail = me.mail.filter((t) => t.day === s.day);
  if (!heard.length && !mail.length) return <p className="muted mk-heard-empty">今天没有人告诉过你你的印记。</p>;
  return (
    <div className="mk-heard">
      <small>今天别人告诉你的</small>
      {heard.map((t) => <span key={`${t.from}-${t.at}`}><b>{name(t.from)}</b> 说你是 <Suit suit={t.suit} /></span>)}
      {mail.map((t) => <span key={`m${t.at}`} className="mail">匿名信：你是 <Suit suit={t.suit} /></span>)}
    </div>
  );
}

/** 自由活动：在屋里能看同屋人的后颈（对视）、悄悄告诉他、坏人调包；门、敲门、邀请和血染一样。 */
function RoamPanel({ s, me, act, mk, g, name, peek }) {
  const r = s.roam;
  const house = r.houses.find((h) => h.id === r.myHouse);
  const [inviting, setInviting] = useState(false);
  const [telling, setTelling] = useState(null);
  const [swapping, setSwapping] = useState(null); // 坏人：展开了谁的调包
  const inv = r.invite;
  const invHouse = inv && r.houses.find((h) => h.id === inv.house);
  const today = (list) => (list ?? []).filter((x) => x.day === s.day);
  const seen = {};
  for (const x of today(me?.sightings)) seen[x.target] = x.seen;
  const said = Object.fromEntries(today(me?.told).map((x) => [x.to, x.suit]));
  const left = me?.peeksLeft ?? 0;
  return (
    <>
      {inv && invHouse && (
        <Panel title="私聊邀请" tone="mot" className="knock-pnl">
          <div className="knock-row">
            <Portrait p={g(inv.from)} size={40} prefer="avatar" frame="#f4f4f0" speak={false} />
            <p className="flavor-line">{name(inv.from)} 邀请你去<b>{invHouse.name}</b>。</p>
          </div>
          <div className="btn-row">
            <Btn kind="primary" onClick={() => act('inviteReply', { yes: true })}>过去</Btn>
            <Btn onClick={() => act('inviteReply', { yes: false })}>不去</Btn>
          </div>
        </Panel>
      )}
      {house?.knocks.map((who) => (
        <Panel key={who} title="有人敲门" tone="mot" className="knock-pnl">
          <div className="knock-row">
            <Portrait p={g(who)} size={40} prefer="avatar" frame="#f4f4f0" speak={false} />
            <p className="flavor-line">「叩，叩，叩。」<br />{name(who)} 站在门外。</p>
          </div>
          <div className="btn-row">
            <Btn kind="primary" onClick={() => act('knock', { house: house.id, who, yes: true })}>让他进来</Btn>
            <Btn onClick={() => act('knock', { house: house.id, who, yes: false })}>假装没人</Btn>
          </div>
        </Panel>
      ))}
      {house ? (
        <Panel title={house.name} tone={house.locked ? 'mot' : 'light'} className="room-pnl"
          extra={<span className={`room-state ${house.locked ? 'locked' : ''}`}>{house.locked ? '锁门私聊中' : '门开着'} · 今天还能看 {left} 个</span>}>
          {house.members.length > 1 && <p className="muted">点一个人「看后颈」：你们<b>对视</b>——你看到他的，他也同时看到你的。每天最多看 {MARK_RULES.peeksPerDay} 个人。</p>}
          <div className="mk-mates">
            {house.members.filter((id) => id !== s.me).map((id) => {
              const p = g(id);
              const canPeek = me?.alive && p?.alive && (seen[id] || left > 0);
              const swapWhy = me?.swapTargets ? me.swapTargets[id] : undefined;
              return (
                <div key={id} className={`mk-mate ${p?.alive ? '' : 'dead'}`}>
                  <Portrait p={p} size={44} prefer="avatar" frame="#f4f4f0" />
                  <span className="mk-mate-name"><i>{p?.seat}号</i>{p?.name}</span>
                  {!p?.alive ? <span className="muted">已死</span> : me?.alive && (
                    <span className="mk-mate-acts">
                      <Btn kind={seen[id] ? 'secondary' : 'primary'} disabled={!canPeek} onClick={() => peek(id)} title={canPeek ? '' : '今天已经看过两个人了'}>{seen[id] ? <>看过 <Suit suit={seen[id]} /></> : '看后颈'}</Btn>
                      <Btn onClick={() => setTelling((x) => (x === id ? null : id))}>{said[id] ? <>说过 <Suit suit={said[id]} /></> : '告诉他…'}</Btn>
                      {swapWhy === null && <Btn kind="ghost" className="mk-swap-btn" onClick={() => setSwapping((x) => (x === id ? null : id))}>调包…</Btn>}
                    </span>
                  )}
                  {telling === id && <TellRow seen={seen[id]} onPick={async (x) => { if (await mk('tell', { target: id, suit: x })) setTelling(null); }} />}
                  {swapping === id && swapWhy === null && <SwapRow why={null} onSwap={async (x) => { const ok = await mk('swap', { target: id, suit: x }); if (ok) setSwapping(null); return ok; }} />}
                </div>
              );
            })}
            {house.members.length <= 1 && <p className="muted">屋里只有你一个人。邀请别人进来，或者去别的房子找人。</p>}
          </div>
          {inviting && (
            <div className="invite-list">
              <p className="muted">点一个人邀请他进来：</p>
              <div className="invite-people">
                {s.players.filter((p) => !house.members.includes(p.id)).map((p) => (
                  <button key={p.id} type="button" onClick={async () => { if (await act('invite', { house: house.id, who: p.id })) setInviting(false); }}>
                    <Portrait p={p} size={32} prefer="avatar" frame={p.alive ? '#f4f4f0' : '#666'} />
                    <span>{p.seat}号</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="btn-row">
            <Btn kind={house.locked ? 'secondary' : 'primary'} onClick={() => act('lock', { house: house.id, locked: !house.locked })}>{house.locked ? '开门' : '锁门私聊'}</Btn>
            <Btn onClick={() => setInviting((x) => !x)}>{inviting ? '收起' : '邀请别人'}</Btn>
            <Btn kind="ghost" disabled={house.locked} onClick={() => { const d = house.door; act('move', { x: d.x + d.nx * 40, y: d.y + d.ny * 40 }); }}>{house.locked ? '门锁着' : '出去'}</Btn>
          </div>
          <EndRoamVote s={s} act={act} />
        </Panel>
      ) : (
        <Panel title="街上" tone="light" className="room-pnl">
          <p className="muted">广场上大家面对面，谁也看不到谁的后颈。<b>走进一栋房子</b>，和别人关在一起才能互相看。走路时从别人身后经过，偶尔能瞟到一眼。</p>
          <div className="stats">
            <Stat value={left} label="今天还能看" color="var(--mot)" />
            <Stat value={today(me?.sightings).length} label="今天看到过" color="var(--int)" />
            <Stat value={today(me?.heard).length + today(me?.mail).length} label="有人告诉你" color="var(--phy)" />
          </div>
          {s.isHost && <div className="btn-row"><Btn kind="secondary" onClick={() => act('gather')}>敲钟集合</Btn></div>}
          <EndRoamVote s={s} act={act} />
        </Panel>
      )}
    </>
  );
}

/** 悄悄告诉他：四个花色加鬼牌，真话那个标出来。 */
function TellRow({ seen, onPick, label = '悄悄告诉他后颈是（真话假话由你）：' }) {
  const fogColor = SUIT_INFO[seen]?.fog ? SUIT_INFO[seen].color : null;
  return (
    <div className="mk-tell">
      <small>{label}{fogColor ? `（起雾了，你只看出是${SUIT_INFO[seen].name}）` : ''}</small>
      {MARKS.map((x) => (
        <button key={x} type="button" className={`mk-suit-btn small ${SUIT_INFO[x].color} ${x === seen || (fogColor && SUIT_INFO[x].color === fogColor) ? 'true' : ''}`} onClick={() => onPick(x)}>
          <span>{SUIT_INFO[x].ch}</span>{x === seen && <small>看到的</small>}
        </button>
      ))}
    </div>
  );
}

/** 坏人：调包他今天的印记（不能的写原因）。点一个花色再确认。 */
function SwapRow({ why, onSwap }) {
  const [pick, setPick] = useState(null);
  if (why) return <p className="mk-swap off">调包：{why}</p>;
  return (
    <div className="mk-swap">
      <small>调包：把他今天的印记换成（他不会知道；之前看过他的人得到的就不对了）：</small>
      {SUITS.map((x) => (
        <button key={x} type="button" className={`mk-suit-btn small ${SUIT_INFO[x].color} ${pick === x ? 'on' : ''}`} onClick={() => setPick(x)}><span>{SUIT_INFO[x].ch}</span></button>
      ))}
      {pick && <Btn kind="primary" onClick={async () => { if (await onSwap(pick)) setPick(null); }}>确定调包成 {SUIT_INFO[pick].ch}</Btn>}
    </div>
  );
}

function EndRoamVote({ s, act }) {
  const v = s.roam?.endVotes;
  if (!v || !s.self) return null;
  return (
    <div className="end-roam">
      <div className="end-roam-bar"><i style={{ width: `${Math.min(100, (v.count / v.need) * 100)}%` }} /></div>
      <div className="link-row">
        <span className="muted">提前集合 {v.count}/{v.need}</span>
        <button type="button" className={`link ${v.mine ? 'on' : ''}`} onClick={() => act('roamVote', { yes: !v.mine })}>{v.mine ? '撤回' : '我想提前集合'}</button>
      </div>
    </div>
  );
}

/** 匿名信：每人每天一封，选一个人、写一个花色。 */
function LetterPanel({ s, me, mk, name }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(null);
  const sent = me.sent.find((x) => x.day === s.day);
  if (sent) return <p className="mk-letter-sent muted">今天的匿名信已经塞给 {name(sent.to)}：<Suit suit={sent.suit} /></p>;
  if (!open) return <div className="link-row mk-letter-open"><button type="button" className="link" onClick={() => setOpen(true)}>塞一封匿名信（今天还有 1 封）</button></div>;
  return (
    <Panel title="匿名信" tone="light" className="mk-letter">
      <p className="muted">塞进他门缝里，只写一个花色。他不会知道是谁写的。</p>
      <div className="invite-people">
        {s.players.filter((p) => p.alive && p.id !== s.me).map((p) => (
          <button key={p.id} type="button" className={to === p.id ? 'on' : ''} onClick={() => setTo(p.id)}>
            <Portrait p={p} size={30} prefer="avatar" frame={to === p.id ? 'var(--mot)' : '#f4f4f0'} />
            <span>{p.seat}号</span>
          </button>
        ))}
      </div>
      {to && <TellRow label={`写给 ${name(to)}：`} onPick={async (x) => { if (await mk('letter', { target: to, suit: x })) { setOpen(false); setTo(null); } }} />}
      <div className="btn-row"><Btn kind="ghost" onClick={() => setOpen(false)}>算了</Btn></div>
    </Panel>
  );
}

/** 遗言：昨晚炸死的人，今天白天留一句话，或者公开一个看过的人。 */
function LastWordPanel({ s, me, mk, name }) {
  const [text, setText] = useState('');
  const seen = [...me.sightings].reverse();
  return (
    <Panel title="留遗言" tone="phy" className="choose-pnl mk-lastword">
      <p className="lead">你昨晚炸死了。今天白天可以留一句话，或者公开一个你看过的人的印记（只能留一次）。</p>
      <div className="mk-lw-row">
        <input value={text} maxLength={MARK_RULES.lastWordMax} placeholder="一句话……" onChange={(e) => setText(e.target.value)} />
        <Btn kind="primary" disabled={!text.trim()} onClick={() => mk('lastWord', { text })}>留下</Btn>
      </div>
      {seen.length > 0 && (
        <div className="mk-lw-seen">
          <small>或者公开：</small>
          {seen.slice(0, 8).map((x) => (
            <button key={`${x.day}-${x.target}-${x.kind}`} type="button" onClick={() => mk('lastWord', { reveal: { target: x.target, day: x.day } })}>
              {name(x.target)} 第{x.day}天 <Suit suit={x.seen} />
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** 操作区顶上一条：我的身份、头头看自己、今天知道的印记、同伴、今天听到的。 */
function MeBar({ s, me, mk, name }) {
  const [confirm, setConfirm] = useState(false);
  const canReveal = me.alive && me.reveals?.left > 0 && !me.suit && ['morning', 'roam', 'table'].includes(s.mark.stage);
  return (
    <div className={`mk-me ${me.role.evil ? 'evil' : 'good'}`}>
      <div className="mk-me-role">
        <b>{me.role.name}</b>
        {me.suit && <span>今天你是 <Suit suit={me.suit} /></span>}
        {me.allies?.length > 0 && <span>同伴 {me.allies.map((a) => `${name(a.id)}（${a.team}）`).join('、')}</span>}
        {me.role.evil && !me.allies?.length && <span>不知道同伴是谁</span>}
        {me.reveals && <span>看自己：剩 {me.reveals.left} 次</span>}
        {!me.alive && <span className="dead">已死</span>}
      </div>
      {canReveal && (
        <div className="mk-reveal">
          {confirm ? <><Btn kind="primary" onClick={async () => { await mk('reveal'); setConfirm(false); }}>确定用掉一次，看今天的印记</Btn> <Btn kind="ghost" onClick={() => setConfirm(false)}>算了</Btn></>
            : <Btn onClick={() => setConfirm(true)}>头头：看自己今天的印记</Btn>}
        </div>
      )}
      {me.alive && !['ended', 'night'].includes(s.mark.stage) && <Heard s={s} me={me} name={name} />}
    </div>
  );
}

// ───────────── 看后颈：他转过身（对视） ─────────────
/** 后颈的样子：后脑勺、头发、脖子、衣领，中间一枚发着暗光的印记（雾天糊成一片红 / 黑）。 */
function Nape({ p, suit }) {
  const h = hue(p?.id ?? 'x');
  const info = SUIT_INFO[suit];
  const fog = info?.fog;
  const ink = info?.color === 'red' ? '#8e0f06' : info?.color === 'joker' ? '#3b0d5c' : '#1a0b06';
  return (
    <svg className="mk-nape" viewBox="0 0 200 240" aria-hidden="true">
      <defs>
        <radialGradient id="mkBrand" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff2c8" /><stop offset=".35" stopColor="#ffb347" /><stop offset=".7" stopColor="#c8401e" stopOpacity=".85" /><stop offset="1" stopColor="#7a1a0c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mkSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9b48f" /><stop offset="1" stopColor="#b98e6a" /></linearGradient>
        <filter id="mkFog"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      <path d="M10 240 C 20 190, 60 176, 100 176 C 140 176, 180 190, 190 240 Z" fill={`hsl(${h} 28% 32%)`} stroke="#0e1010" strokeWidth="3" />
      <path d="M62 182 L100 206 L138 182" fill="none" stroke="#0e1010" strokeWidth="3" />
      <path d="M70 120 C 70 150, 66 172, 62 184 C 80 196, 120 196, 138 184 C 134 172, 130 150, 130 120 Z" fill="url(#mkSkin)" stroke="#0e1010" strokeWidth="3" />
      <ellipse cx="46" cy="96" rx="9" ry="16" fill="#c99f7b" stroke="#0e1010" strokeWidth="3" />
      <ellipse cx="154" cy="96" rx="9" ry="16" fill="#c99f7b" stroke="#0e1010" strokeWidth="3" />
      <path d="M48 92 C 44 40, 76 14, 100 14 C 124 14, 156 40, 152 92 C 150 116, 138 128, 128 132 C 116 124, 84 124, 72 132 C 62 128, 50 116, 48 92 Z" fill={`hsl(${(h + 40) % 360} 18% 16%)`} stroke="#0e1010" strokeWidth="3" />
      {[64, 82, 100, 118, 136].map((x) => <path key={x} d={`M${x} 30 C ${x - 4} 70, ${x + 2} 100, ${x - 2} 126`} stroke="rgba(255,255,255,.08)" strokeWidth="2" fill="none" />)}
      <g className="mk-brand">
        <circle cx="100" cy="158" r="30" fill="url(#mkBrand)" className="mk-brand-glow" />
        <circle cx="100" cy="158" r="17" fill="none" stroke="#5a1a10" strokeWidth="2" opacity=".7" />
        {info && (fog
          ? <circle cx="100" cy="158" r="12" fill={ink} filter="url(#mkFog)" />
          : <text x="100" y="167" textAnchor="middle" fontSize={suit === 'joker' ? 22 : 28} fontWeight="900" fill={ink} stroke="#ffd79a" strokeWidth="1">{info.ch}</text>)}
      </g>
      {fog && <rect x="0" y="0" width="200" height="240" fill="rgba(200,205,210,.28)" />}
    </svg>
  );
}

/**
 * 翻转卡：mode 'peek' 是我看他（他转过身，露出后颈；我可以告诉他、坏人可以调包）；
 * mode 'mutual' 是他看了我——对视，我同时看到他的后颈。卡正面是他的脸，翻过来是他的后颈。
 */
function PeekCard({ s, me, card, g, mk, onClose }) {
  const target = g(card.who);
  const kind = card.mode === 'peek' ? 'peek' : 'mutual';
  const sight = (me?.sightings ?? []).filter((x) => x.day === s.day && x.target === card.who && x.kind === kind).at(-1);
  const seen = sight?.seen;
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    if (!seen) return undefined;
    const t = setTimeout(() => { setTurned(true); shiver(); }, 450);
    return () => clearTimeout(t);
  }, [seen]);
  const said = (me?.told ?? []).filter((x) => x.day === s.day && x.to === card.who).at(-1);
  const swapWhy = me?.swapTargets ? me.swapTargets[card.who] : undefined;
  if (!target) return null;
  const info = SUIT_INFO[seen];
  return (
    <div className="mk-peek" onPointerDown={(e) => e.stopPropagation()}>
      {card.mode === 'mutual' && <div className="mk-burn" aria-hidden="true" />}
      <div className="mk-peek-stage">
        <div className={`mk-peek-card ${turned ? 'turned' : ''}`}>
          <div className="mk-face front"><Portrait p={target} size={150} prefer="avatar" frame="#f4f4f0" speak={false} /></div>
          <div className="mk-face back"><Nape p={target} suit={seen} /></div>
        </div>
      </div>
      <div className="mk-peek-text">
        {!turned ? <p>{card.mode === 'peek' ? `${target.seat}号 ${target.name} 转过身，撩起后颈的头发……` : `${target.seat}号 ${target.name} 绕到了你身后——你们对视了一眼……`}</p> : (
          <>
            <p className="mk-peek-result">{card.mode === 'peek' ? '他后颈是' : '你也看到了他的：'} <Suit suit={seen} big name />{info?.fog && <small className="mk-fognote">（起雾了，只看得出颜色）</small>}</p>
            <p className="muted">{card.mode === 'peek' ? '你们对视了：他也同时看到了你的印记。他看到了什么，只有他知道。' : '他看到了你的印记，你也看到了他的。谁说真话，各凭良心。'}</p>
            {card.mode === 'peek' && <TellRow seen={seen} label={said ? `你告诉过他 ${SUIT_INFO[said.suit]?.ch ?? ''}，改口：` : '要不要悄悄告诉他（真话假话由你）：'} onPick={(x) => mk('tell', { target: card.who, suit: x })} />}
            {card.mode === 'peek' && swapWhy !== undefined && <SwapRow why={swapWhy} onSwap={(x) => mk('swap', { target: card.who, suit: x })} />}
          </>
        )}
        <div className="btn-row"><Btn kind="ghost" onClick={onClose}>{turned ? '好了' : '算了'}</Btn></div>
      </div>
    </div>
  );
}

/**
 * 别人对我做的事：看了我的后颈（翻一张对视卡）、从我背后经过（屏幕边缘一凉）、我路上瞟到了谁（一条提示）。
 * 刚连上 / 刷新时以前的不提醒。
 */
function Notices({ s, me, g, onMutual }) {
  const seenBy = me?.seenBy ?? [];
  const mine = (me?.sightings ?? []).filter((x) => x.kind === 'glimpse');
  const counts = useRef(null);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!me) return undefined;
    if (!counts.current) { counts.current = { by: seenBy.length, gl: mine.length }; return undefined; }
    let t;
    const show = (n) => { setNote(n); shiver(); clearTimeout(t); t = setTimeout(() => setNote(null), 3800); };
    if (seenBy.length > counts.current.by) {
      const fresh = seenBy.slice(counts.current.by);
      const peek = fresh.findLast((x) => x.kind === 'peek');
      if (peek) onMutual(peek.by);
      else show({ kind: 'behind' });
    }
    if (mine.length > counts.current.gl) { const x = mine.at(-1); show({ kind: 'glimpse', who: x.target, seen: x.seen }); }
    counts.current = { by: seenBy.length, gl: mine.length };
    return () => clearTimeout(t);
  }, [seenBy.length, mine.length]);
  if (!note) return null;
  const p = note.who && g(note.who);
  return (
    <>
      {note.kind === 'behind' && <div className="mk-burn cold" aria-hidden="true" />}
      <div className="mk-peeked" key={`${note.kind}-${note.who ?? ''}`}>
        {note.kind === 'behind'
          ? <span><b>有人从你背后经过。</b><small>后颈凉了一下。是谁？你没看见。</small></span>
          : <><Portrait p={p} size={34} prefer="avatar" frame="#f4f4f0" speak={false} /><span>你从 <b>{p?.seat}号 {p?.name}</b> 身后经过，瞟到了他的后颈：<Suit suit={note.seen} /><small>他只知道有人从背后经过。</small></span></>}
      </div>
    </>
  );
}

// ───────────── 爆炸 ─────────────
const SHARDS = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * 360 + Math.random() * 18, d: 140 + Math.random() * 220, r: Math.random() * 720 - 360, s: 6 + Math.random() * 12 }));
const PUFFS = Array.from({ length: 16 }, (_, i) => ({ x: -110 + Math.random() * 220, y: -90 + Math.random() * 140, s: 0.9 + Math.random() * 1.1, d: i * 0.06 }));

/**
 * 在自己屋里爆炸（只有本人看到）：印记烧红、心跳越来越急 → 白光 → 冲击波、碎片、震屏 → 烟尘、焦痕 → 一行字。
 * 时间线（毫秒）：0 烧红 · 1500 爆炸 · 2300 烟尘 · 3800 字。
 */
export function Explosion({ p, why, guess, suit }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    sizzle(1.45);
    const ts = [0, 520, 900, 1160, 1360].map((ms, i) => setTimeout(() => heartbeat(0.3 + i * 0.06), ms));
    ts.push(setTimeout(() => { setT(1); boom(); }, 1500));
    ts.push(setTimeout(() => setT(2), 2300));
    ts.push(setTimeout(() => setT(3), 3800));
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div className={`mk-blast t${t}`} aria-label="爆炸">
      <div className="mk-blast-room"><Cottage p={p} awake dead={t >= 1} dawn={false} /></div>
      <div className="mk-blast-glow" />
      {t === 0 && guess && <div className="mk-blast-mark"><Suit suit={guess} big /></div>}
      <div className="mk-blast-flash" />
      <div className="mk-blast-ring" /><div className="mk-blast-ring r2" />
      <div className="mk-blast-shards">{SHARDS.map((x, i) => <i key={i} style={{ '--a': `${x.a}deg`, '--d': `${x.d}px`, '--r': `${x.r}deg`, '--s': `${x.s}px` }} />)}</div>
      <div className="mk-blast-scorch" />
      <div className="mk-blast-haze" />
      <div className="mk-blast-smoke">{PUFFS.map((x, i) => <i key={i} style={{ '--x': `${x.x}%`, '--y': `${x.y}%`, '--s': x.s, '--d': `${x.d}s` }} />)}</div>
      <div className="mk-blast-embers">{SHARDS.slice(0, 12).map((x, i) => <i key={i} style={{ '--a': `${x.a + 9}deg`, '--d': `${x.d * 0.6}px` }} />)}</div>
      {t >= 3 && (
        <div className="mk-blast-text">
          <b>印记在你屋里炸开了。</b>
          <span>{why === 'timeout' ? '午夜钟响时，你还没写下印记。' : <>你写的是 <Suit suit={guess} name />，其实是 <Suit suit={suit} name />。</>}</span>
          <small>别人天亮才会知道你死了。</small>
        </div>
      )}
    </div>
  );
}

// ───────────── 右栏 ─────────────
function RoleSheet({ s, me, name }) {
  const days = [...new Set([...me.sightings, ...me.heard, ...me.told, ...me.seenBy, ...me.mail, ...me.sent, ...me.swaps].map((x) => x.day))].sort((a, b) => b - a);
  return (
    <>
      <section className={`mk-role ${me.role.evil ? 'evil' : 'good'}`}>
        <Tag tone={me.role.evil ? 'phy' : 'int'}>{me.role.name}</Tag>
        <p>{me.role.ability}</p>
        {me.allies?.length > 0 && <p>你的同伴：{me.allies.map((a) => <b key={a.id}>{name(a.id)}（{a.team}） </b>)}</p>}
        {me.reveals?.used.length > 0 && <p>你看过自己：{me.reveals.used.map((x) => <span key={x.day}>第{x.day}天 <Suit suit={x.suit} /> </span>)}</p>}
        {me.suit && <p>今天你后颈是 <Suit suit={me.suit} name /></p>}
      </section>
      <section className="mk-notes">
        <h4>你的小本子</h4>
        {!days.length && <p className="muted">还没看过谁，也没人告诉过你什么。</p>}
        {days.map((d) => (
          <div key={d} className="mk-note-day">
            <small>第{cnNum(d)}天</small>
            {me.sightings.filter((x) => x.day === d).map((x, i) => <p key={`s${i}`}>你{KIND[x.kind]} <b>{name(x.target)}</b>：<Suit suit={x.seen} /></p>)}
            {me.swaps.filter((x) => x.day === d).map((x) => <p key={`w${x.target}`} className="evil">你把 <b>{name(x.target)}</b> 从 <Suit suit={x.from} /> 调包成 <Suit suit={x.to} /></p>)}
            {me.told.filter((x) => x.day === d).map((x) => <p key={`t${x.to}`}>你告诉 <b>{name(x.to)}</b>：他是 <Suit suit={x.suit} /></p>)}
            {me.sent.filter((x) => x.day === d).map((x) => <p key={`l${x.to}`}>你给 <b>{name(x.to)}</b> 塞了匿名信：<Suit suit={x.suit} /></p>)}
            {me.heard.filter((x) => x.day === d).map((x) => <p key={`h${x.from}`}><b>{name(x.from)}</b> 说你是 <Suit suit={x.suit} /></p>)}
            {me.mail.filter((x) => x.day === d).map((x, i) => <p key={`m${i}`}>匿名信：你是 <Suit suit={x.suit} /></p>)}
            {me.seenBy.filter((x) => x.day === d).map((x, i) => <p key={`b${i}`} className="muted">{x.by ? `${name(x.by)} 看过你的后颈` : '有人从你背后经过'}</p>)}
          </div>
        ))}
      </section>
    </>
  );
}

function Record({ s, m, name }) {
  const days = [...new Set([...m.nights.map((x) => x.night), ...Object.keys(m.glow ?? {}).map(Number), ...m.lastWords.map((x) => x.day)])].sort((a, b) => a - b);
  const rv = m.review;
  const seat = (id) => s.players.find((p) => p.id === id)?.seat;
  return (
    <section className="mk-record">
      <h4>死讯、发光和遗言</h4>
      {!days.length && <p className="muted">还没有人死。</p>}
      {days.map((d) => (
        <div key={d} className="mk-rec-day">
          <small>第{cnNum(d)}天</small>
          {m.lastWords.filter((x) => x.day === d).map((x) => <p key={x.by}><b>{name(x.by)}</b> 的遗言：{x.reveal ? <>公开 {name(x.reveal.target)} 第{x.reveal.day}天 <Suit suit={x.reveal.seen} /></> : `「${x.text}」`}</p>)}
          {(m.glow?.[d] ?? []).map((x) => <p key={`g${x.id}`} className="mk-rec-glow">{name(x.id)} 的印记发光：<Suit suit={x.suit} /></p>)}
          {m.nights.filter((x) => x.night === d).map((x) => <p key="n" className="mk-rec-night">第{cnNum(d)}夜：{x.dead.length ? `${x.dead.map(name).join('、')} 炸死` : '没有人死'} · 这天 {x.swaps} 人被调包</p>)}
        </div>
      ))}
      {rv && (
        <>
          <h4>每天的印记（终局公开）</h4>
          <div className="mk-suitlog">
            <table>
              <thead><tr><th>座位</th>{Object.keys(rv.suitLog).map((d) => <th key={d}>第{d}天{rv.fog[d] ? '·雾' : ''}</th>)}</tr></thead>
              <tbody>
                {s.players.map((p) => (
                  <tr key={p.id} className={p.evil ? 'evil' : ''}>
                    <td>{p.seat}号 {p.name}{p.roleName ? `（${p.roleName}）` : ''}</td>
                    {Object.keys(rv.suitLog).map((d) => {
                      const real = rv.suitLog[d][p.id];
                      const dealt = rv.dealt[d]?.[p.id];
                      const lies = rv.tells.filter((t) => t.day === Number(d) && t.to === p.id && t.suit !== real).length;
                      return <td key={d}>{dealt && dealt !== real && <><Suit suit={dealt} />→</>}{real ? <Suit suit={real} /> : '—'}{lies > 0 && <i className="mk-lie" title={`这天有 ${lies} 个人当面骗了他`}>骗×{lies}</i>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rv.swaps.length > 0 && <><h4>调包</h4>{rv.swaps.map((x, i) => <p key={i}>第{x.day}天 {name(x.by)} 把 {name(x.target)} 从 <Suit suit={x.from} /> 换成 <Suit suit={x.to} /></p>)}</>}
          {rv.letters.length > 0 && <><h4>匿名信是谁写的</h4>{rv.letters.map((x, i) => <p key={i}>第{x.day}天 {seat(x.from)}号 → {seat(x.to)}号：<Suit suit={x.suit} /></p>)}</>}
          <h4>谁被谁骗死</h4>
          {rv.survival.filter((x) => x.fooledBy.length).map((x) => <p key={x.id}>{x.seat}号 {x.name}（第{x.day}夜）：{x.fooledBy.map((f) => `${f.name}${f.how === 'letter' ? '的匿名信' : f.how === 'swap' ? '的调包' : ''}`).join('、')}</p>)}
          {!rv.survival.some((x) => x.fooledBy.length) && <p className="muted">没有人是被骗死的。</p>}
        </>
      )}
    </section>
  );
}

export function Rules({ n }) {
  const e = n >= 5 && n <= 15 ? evilCount(n) : null;
  return (
    <section className="mk-rules">
      <h4>暗印 · 规则</h4>
      <ol>
        <li><b>身份</b>：好人，和藏在里面的坏人（人数照血染：5–9 人 2 个、10–12 人 3 个、13–15 人 4 个{e ? `，这局 ${e} 个` : ''}）。坏人里 1 个头头，其余是手下；7 人及以上坏人互相认识。</li>
        <li><b>天亮</b>：钟声响过，每个活人后颈换上一个新的随机印记 ♠♥♦♣，极少数是<b>鬼牌</b>，自己看不到。说书人公布「昨天有 N 个人被调包」（只说人数）。有些白天会<b>起雾</b>：看背后只看得出红色还是黑色。</li>
        <li><b>自由活动</b>：只有和别人进了<b>同一栋房子</b>才能看后颈，每天最多看两个人，而且是<b>对视</b>——你看他的同时他也看到你的。路上从别人身后经过，偶尔能<b>瞟到</b>一眼（他只知道有人从背后经过）。说真话还是说谎由你；每人每天还能塞一封只写一个花色的<b>匿名信</b>。</li>
        <li><b>坏人</b>：头头整局有 2 次机会，自己挑哪天看自己当天的印记；手下一次都没有。坏人看某人背后的那一刻可以<b>调包</b>，把他今天的印记换掉（每个坏人每两天最多一次，同一个人整局只被调包一次，不能调包自己人，被调包的人不知道）。坏人一天里被三个不同的人看过背后，当晚他的印记会<b>发光</b>，所有人都看得到。</li>
        <li><b>圆桌</b>：回到广场讨论，没有提名，也没有投票。说完了各自回家。</li>
        <li><b>夜里</b>：每人在自己家写下自己的印记（鬼牌就写鬼牌），有时限。写错或者没写，午夜钟响时印记在屋里炸开。天亮只公布谁死了。炸死的人第二天白天可以留一句<b>遗言</b>，或者公开一个他看过的人的印记。</li>
        <li><b>胜负</b>：坏人全死，好人赢；活着的坏人人数追平活着的好人，坏人赢。</li>
      </ol>
    </section>
  );
}

// ───────────── 大厅 ─────────────
export function MarkDist({ n }) {
  if (n < 5 || n > 15) return <p className="muted dist-empty">{n < 5 ? `暗印至少 5 人开局（现在 ${n} 人）` : '暗印最多 15 人'}</p>;
  const e = evilCount(n);
  return (
    <div className="dist">
      <div className="dist-bar"><i style={{ flex: n - e, background: 'var(--int)' }} /><i style={{ flex: e, background: 'var(--phy)' }} /></div>
      <div className="dist-legend"><span><b style={{ color: 'var(--int)' }}>{n - e}</b>好人</span><span><b style={{ color: 'var(--phy)' }}>{e}</b>坏人（1 头头）</span><span>{n >= 7 ? '坏人互相认识' : '坏人互不认识'}</span></div>
    </div>
  );
}

/** 房主设置：自由活动、圆桌、夜里写印记的时长。 */
export function MarkSettings({ st, set, Toggle, Select }) {
  return (
    <div className="setting-wrap"><div className="setting-groups">
      <div className="setting-col">
        <div className="setting-group">
          <h4>一天</h4>
          <Select label="自由活动" value={st.roamMinutes} options={[2, 3, 5, 8, 10]} unit="分钟" onChange={(v) => set({ roamMinutes: v })} />
          <Select label="圆桌讨论" value={st.nominateMinutes} options={[1, 2, 3, 5]} unit="分钟" onChange={(v) => set({ nominateMinutes: v })} />
          <Select label="夜里写印记" value={st.chooseSeconds} options={[30, 45, 60, 90]} unit="秒" onChange={(v) => set({ chooseSeconds: v })} />
          <p className="muted setting-note">所有真人同意就能提前集合；圆桌上所有活人都点了「说完了」就提前回家。</p>
        </div>
      </div>
      <div className="setting-col">
        <div className="setting-group">
          <h4>其他</h4>
          <Toggle label="随机排座位" on={st.shuffle} onChange={(v) => set({ shuffle: v })} />
          <Toggle label="观战者能看所有身份" on={st.spectatorGrimoire} onChange={(v) => set({ spectatorGrimoire: v })} />
          <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} onChange={(v) => set({ muteSpectators: v })} />
        </div>
      </div>
    </div></div>
  );
}

/** 大厅下面：规则、身份牌、生还排行。 */
export function MarkShowcase({ ask }) {
  const [board, setBoard] = useState(null);
  useEffect(() => { ask?.('markStats').then((r) => setBoard(r?.stats ?? [])).catch(() => setBoard([])); }, []);
  return (
    <section className="lobby-roles glass pnl av-showcase mk-showcase">
      <header className="roles-head">
        <div>
          <h2>暗印 · 规则</h2>
          <p className="muted">原创娱乐模式：你后颈的印记，只有别人看得到。</p>
        </div>
      </header>
      <div className="mk-show-row">{MARKS.map((x) => <Suit key={x} suit={x} big />)}</div>
      <div className="av-roles">
        {Object.entries(MARK_ROLES).map(([id, r]) => <div key={id} className={`av-r ${r.good ? 'good' : 'evil'}`}><b>{r.name}</b><p>{r.ability}</p></div>)}
      </div>
      <Rules n={0} />
      <section className="mk-board-list">
        <h4>生还排行</h4>
        {board == null ? <p className="muted">读取中……</p> : !board.length ? <p className="muted">还没有人打完过一局暗印。</p> : (
          <table>
            <thead><tr><th>#</th><th>玩家</th><th>局数</th><th>平均活到</th><th>活到终局</th><th>被谁骗死过</th></tr></thead>
            <tbody>
              {board.slice(0, 15).map((x, i) => (
                <tr key={x.id}>
                  <td>{i + 1}</td><td>{x.name}</td><td>{x.games}</td><td>第 {x.avgDay} 天</td><td>{x.survived}</td>
                  <td>{Object.entries(x.fooledBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
