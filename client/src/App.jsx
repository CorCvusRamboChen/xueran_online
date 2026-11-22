import { useEffect, useRef, useState } from 'react';
import { isEn } from './i18n.js';
import { createPortal } from 'react-dom';
import { openMic, login, openSocket, report, listenSpeaking, fromKook, fromBrowserLink, soloMode } from './connect.js';
import { Town, PaintFilters } from './Town.jsx';
import { TownMap, AliveStrip, ChairToken } from './TownMap.jsx';
import { MadChip, MAD_OPEN } from './MadChip.jsx';
import { CheatSheet, useSheetMode } from './CheatSheet.jsx';
import { DemonDash, DoorKick } from './KillScenes.jsx';
import { useAmbience } from './world/ambience.js';
import { Cottage, DawnWake } from './Cottage.jsx';
import { Lobby } from './Lobby.jsx';
import { AvalonGame } from './Avalon.jsx';
import { MarkGame } from './Mark.jsx';
import { Line, Portrait, clock, syncClock, serverNow, gameClock, useTick, useCountdown, cnNum } from './util.jsx';
import { Tag, Panel, Btn, Stat, Check, Faces, HudBar } from './ui.jsx';
import { PeltButton, PeltPanel, PeltFx } from './Pelt.jsx';
import { AfterGame, CourtFx } from './AfterGame.jsx';
import { TravellerJoin, TravellerActions, ExilePanel, JudgeButtons, ButcherPanel, GnomeButton } from './Travellers.jsx';
import { tick } from './world/footsteps.js';
import { ATTR, FLAVOR, ROLE_NAMES, ROLE_TEAM, voiceOf } from './flavor.js';
import { ROLE_ART } from './art.js';
import { AbilityCard } from './AbilityCard.jsx';
import { useNarrator, TitleCard, useChecks, SkillCheck, SoundToggles } from './Stage.jsx';
import { setAmbience } from './ambience.js';
import { useMarks, TAGS, LINKS, linksOf, addLink, removeLink, MarkMenu, MarkBadge, LinkLines, useLinkKind, LinkKinds, setMarksSink } from './marks.jsx';
import { Tutorial, tutEvent } from './Tutorial.jsx';
import { Watchers } from './Lobby.jsx';
import { WerewolfGame } from './Werewolf.jsx';
import { RoleIndex } from './RoleIndex.jsx';
import { Replay, KeyInfo } from './replay.jsx';
import { savedOutfit } from './Wardrobe.jsx';
import { DISTRIBUTION, ROLES as ROLE_DEFS, SCRIPTS, engineOf, inScript, rolesOf, ragnarokWolves, FABLED, fabledOf, travellersOf, setDemonSwap } from '../../src/engine/roles.js';
const ROLE_ABILITY = Object.fromEntries(Object.entries(ROLE_DEFS).map(([id, r]) => [id, r.ability]));

/**
 * 顶栏的人数修正说明：[悬停全文, 常显短句]。每个剧本都要写——以前没写的剧本落到暗流涌动的「男爵 +2」，
 * 生死未卜没有男爵也显示了（11-11 用户报的）。没写的剧本宁可不显示，也不显示别的剧本的规则。
 */
const BOARD_NOTE = {
  mcw: ['抢椅子：少 1 个爪牙、多 1 个镇民或外来者；恶魔和爪牙都坐在空座位上，所有玩家开局都是善良', '邪恶都在空座位上 · 爪牙−1'],
  tb: ['男爵在场时：外来者 +2、镇民 −2', '男爵在场 外来者+2'],
  bmr: ['教父在场时：外来者 +1 或 −1（说书人决定）', '教父在场 外来者±1'],
  snv: ['方古在场时外来者 +1；亡骨魔在场时外来者 −1', '方古 +1 · 亡骨魔 −1'],
  ngj: ['男爵在场时外来者加到两个（这个剧本只有两个外来者）', '男爵在场 外来者补到 2'],
  luf: ['气球驾驶员在场时，说书人可以多放一个外来者', '气球驾驶员 外来者+0~1'],
  rag: ['镇民全是猎手（死了可以开一枪，打谁谁死），恶魔全是小恶魔（狼人）', '猎手 vs 狼人'],
  bs7: ['男爵 +2、亡骨魔 −1、气球驾驶员 +0~1 外来者；村夫可以有 1–3 个。7 号空座也算一个座位', '7 号空座 · 男爵 +2 · 亡骨魔 −1 · 气球驾驶员 +0~1'],
  cat: ['教父在场外来者 ±1，方古 +1，亡骨魔 −1，气球驾驶员 +0~1', '教父 ±1 · 方古 +1 · 亡骨魔 −1 · 气球驾驶员 +0~1'],
  ucd: ['教父在场时：外来者 +1 或 −1（说书人决定）；提线木偶坐在恶魔旁边', '教父在场 外来者±1'],
  amn: ['全员失忆：每人只知道自己是镇民 / 外来者 / 爪牙 / 恶魔；每天问说书人一次自己是谁；黄昏公布几人弄清了；第 4 天全员揭晓。人数调整照三个官方剧本（男爵 +2、教父 ±1、方古 +1、亡骨魔 −1）', '只知道自己是哪一类 · 每天问一次 · 第 4 天揭晓'],
  roc: ['教父在场时外来者 +1 或 −1；亡骨魔在场时外来者 −1；赏金猎人在场时一名镇民是邪恶的', '教父 ±1 · 亡骨魔 −1 · 赏金猎人带一名邪恶镇民'],
  ecp: ['男爵在场时：外来者 +2、镇民 −2', '男爵在场 外来者+2'],
  hhr: ['男爵在场时外来者 +2（外来者不够就少加）；气球驾驶员 +0~1；提线木偶坐在恶魔旁边', '男爵 +2 · 气球驾驶员 +0~1 · 利维坦不杀人'],
  pie: ['男爵在场时：外来者 +2、镇民 −2；提线木偶坐在恶魔旁边', '男爵在场 外来者+2'],
  trust: ['男爵在场时：外来者 +2；亡骨魔在场时外来者 −1；提线木偶坐在恶魔旁边', '男爵+2 · 亡骨魔−1'],
  twv: ['方古在场时外来者 +1；亡骨魔在场时外来者 −1', '方古 +1 · 亡骨魔 −1'],
  oe: ['传奇角色哨兵：外来者可能 +1 或 −1；有巡山人时落难少女一定在场（没外来者就换掉一个镇民）；异端分子对调胜负；痢蛭和异端分子不同时在场',
    '哨兵 ±1 · 巡山人带落难少女 · 异端分子对调胜负'],
  // 2026-11-19 用户：夜半狂欢顶上只写了哨兵，缺了气球驾驶员这些也会改外来者人数的角色。常显短句要列全；传奇角色名字后面带「传奇」下标（BoardBar 自动加）
  mo: ['传奇角色哨兵：外来者可能 +1 或 −1；传奇角色圣洁之魂：邪恶玩家最多比开局多一名；气球驾驶员在场 +0~1 外来者；有巡山人时落难少女一定在场（没外来者就换掉一个镇民）；亡骨魔在场 −1 外来者；偶尔是无神论者局（没有邪恶）',
    '哨兵±1 · 圣洁之魂 邪恶至多+1 · 气球+0~1 · 亡骨魔−1 · 巡山人带落难少女 · 或无邪恶'],
  sar: ['所有善良都是女裁缝，所有邪恶都是暴乱（爪牙加恶魔的位置全是暴乱）；传奇角色骗人精：整局一次，一名善良玩家可能拿到错误信息', '全员女裁缝 vs 全员暴乱 · 骗人精 一次假信息'],
  booz: ['男爵 +2、方古 +1 外来者；气球驾驶员 +0~1；有巡山人时落难少女一定在场；提线木偶坐在恶魔旁边', '男爵 +2 · 方古 +1 · 气球驾驶员 +0~1 · 巡山人带落难少女'],
};
/** 说明里出现的传奇角色名字后面加「传奇」下标，和普通角色区分开。 */
function markFabled(text, script) {
  const names = fabledOf(script).map((id) => FABLED[id].name);
  if (!names.length) return text;
  const of = (name) => FABLED[fabledOf(script).find((id) => FABLED[id].name === name)];
  // 传奇角色的名字下面画一道下划线，颜色不变；鼠标放上去弹出详细介绍（2026-11-20 用户）
  return text.split(new RegExp(`(${names.join('|')})`)).map((part, i) => (names.includes(part) ? <FabName key={i} name={part} f={of(part)} /> : part));
}
/** 传奇角色的名字：下划线；鼠标放上去（手机上点一下）在旁边弹出这张传奇角色的介绍。弹层挂在 body 上，顶栏截断也不会被裁掉。 */
function FabName({ name, f }) {
  const [at, setAt] = useState(null);
  const show = (e) => { const r = e.currentTarget.getBoundingClientRect(); setAt({ x: Math.min(Math.max(12, r.left + r.width / 2 - 150), window.innerWidth - 312), y: r.bottom + 8 }); };
  return (
    <span className="fab-name" tabIndex={0} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)} onClick={(e) => (at ? setAt(null) : show(e))}>
      {name}
      {at && createPortal(
        <div className="fab-tip" style={{ left: at.x, top: at.y }} role="tooltip">
          <span className="fab-tip-kind">传奇角色</span>
          <b>{name}</b>
          <p>{f?.ability}</p>
          {f?.detail && <p className="muted">{f.detail}</p>}
        </div>, document.body)}
    </span>
  );
}
/** 顶部常驻：这局的板子配置（几个镇民、外来者、爪牙、恶魔）。 */
/** 夜半狂欢换了恶魔时顶栏的说明（亡骨魔 −1 外来者换成对应的）。 */
function boardNote(script, swap) {
  const note = BOARD_NOTE[script];
  if (script !== 'mo' || !note || !swap || swap === 'vigormortis') return note;
  const what = swap === 'lilmonsta' ? ['小怪宝：没有恶魔玩家、多一个爪牙，爪牙每晚选谁照看（他「是恶魔」）', '小怪宝 +1 爪牙'] : ['利维坦：不杀人，处决第二名善良或第 5 天结束邪恶获胜', '利维坦 不杀人'];
  return [note[0].replace('亡骨魔在场 −1 外来者', what[0]), note[1].replace('亡骨魔−1', what[1])];
}
function BoardBar({ n, script, inline = false }) {
  const d = script === 'rag' && DISTRIBUTION[n] ? [n - ragnarokWolves(n), 0, 0, ragnarokWolves(n)] : DISTRIBUTION[n]; // 诸神黄昏：猎手和狼人
  if (!d) return null;
  const parts = [['镇民', d[0], 'var(--int)'], ['外来者', d[1], 'var(--psy)'], ['爪牙', d[2], '#c9762e'], ['恶魔', d[3], 'var(--phy)']];
  const full = boardNote(script, rolesOf('mo', 'demon').find((r) => r !== 'alhadikhia'));
  const note = full?.[1] ?? '';
  return (
    <div className={`board-bar${inline ? ' inline' : ' solo'}`} title={full?.[0] ?? ''}>{/* 说明和人数在同一排（2026-11-20 用户）；太长就截断，悬停看全文 */}
      <span className="bb-n">{n} 人局</span>
      {parts.map(([k, v, c]) => <span key={k} className="bb-item"><b style={{ color: c }}>{v}</b>{k}</span>)}
      {note && <span className="bb-note">{markFabled(note, script)}</span>}
    </div>
  );
}
/**
 * 提名 / 投票时左上角的「票数」小块：还活着几人、拿到几票就上处决台、全场能投几票（活人 + 死人剩下的那一票）。
 * 点开看细节：哪些死人还有票、处决台上现在几票、下一个人至少要几票才能把他换下来。
 */
function VoteStats({ s }) {
  const [open, setOpen] = useState(false);
  if (s.phase !== 'day' || !(s.noms || s.vote || s.pendingNom) || s.riotScript) return null; // 暴乱：不投票，没有票数可看
  const dead = s.players.filter((p) => !p.alive);
  const ghosts = dead.filter((p) => p.ghostVote);
  const total = s.aliveCount + ghosts.length;
  const blockP = s.block && s.players.find((p) => p.id === s.block);
  const toBeat = Math.max(s.threshold, (s.blockVotes || 0) + 1);
  return (
    <div className={`vote-stats ${open ? 'open' : ''}`}>
      <button type="button" className="vs-chip" onClick={() => setOpen(!open)} title="点开看票数细节">
        <span>还活着 <b>{s.aliveCount}</b> 人<small>（共 {s.players.length}）</small></span>
        <span>拿到 <b>{s.threshold}</b> 票就上处决台</span>
        <span>全场能投 <b>{total}</b> 票{ghosts.length ? <small>（含死人 {ghosts.length} 票）</small> : null}</span>
        <i>{open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className="vs-more">
          <p>活着 <b>{s.aliveCount}</b> 人，被提名的人要拿到<b>活人数的一半（{s.threshold} 票）</b>才会上处决台。</p>
          <p>{!dead.length ? '还没有人死。' : <>死了 <b>{dead.length}</b> 人：{ghosts.length ? <>还有票的 <b>{ghosts.length}</b> 人（{ghosts.map((p) => `${p.seat}号`).join('、')}），每人整局只能再投一次</> : '都没有票了'}{dead.length - ghosts.length > 0 && ghosts.length ? `；${dead.length - ghosts.length} 人已经用掉` : ''}。</>}</p>
          <p>全场最多能投 <b>{total}</b> 票（活人 {s.aliveCount} + 死人余票 {ghosts.length}）。</p>
          <p>{blockP
            ? <>处决台上：<b>{blockP.seat}号 {blockP.name}</b>，{s.blockVotes} 票。下一个人要 <b>{toBeat}</b> 票才能换掉他；正好 {s.blockVotes} 票就是平票，谁都不处决。</>
            : s.blockVotes ? <>现在平票（{s.blockVotes} 票），谁都不处决；下一个人要 <b>{toBeat}</b> 票才能上台。</>
              : <>处决台还空着：下一个人拿到 <b>{s.threshold}</b> 票就上台。</>}</p>
        </div>
      )}
    </div>
  );
}

import { getMap, pathLength, positionAt, houseAt, speedOf } from '../../src/shared/map.js';
import { useDockSheet, DockHandle } from './DockSheet.jsx';

/**
 * 走路预测：点了地图就先在本地按同一套寻路开始走，不等服务器回话（一来一回要几百毫秒，走路会"慢半拍"）。
 * 服务器的结果回来后：终点一样就沿用本地这一段，不一样（比如锁着门、被挡在门口）就以服务器为准。
 * 锁门相关的情况交给服务器决定，不预测。
 */
const recentEnds = []; // 最近几次本地预测的终点

function predictMove(s, x, y, run = false) {
  const r = s.roam; const m = r?.pos?.[s.me];
  if (!r || !m) return;
  const now = serverNow();
  const from = positionAt(m, now);
  const town = getMap(r.map);
  const to = town.clampToMap(x, y);
  const target = houseAt(r.houses, to.x, to.y);
  const mine = r.houses.find((h) => h.id === r.myHouse);
  if ((target && target.id !== r.myHouse && target.locked) || (mine?.locked && target?.id !== mine.id)) return;
  const path = town.route(r.houses, from, to);
  const end = path[path.length - 1];
  r.pos[s.me] = { fx: from.x, fy: from.y, x: end.x, y: end.y, start: now, dur: (pathLength(path) / speedOf(run)) * 1000, path, predicted: true, ...(run ? { run: true } : {}) };
  recentEnds.push(end);
  if (recentEnds.length > 16) recentEnds.shift();
}

export default function App() {
  const [s, setS] = useState(null);
  // 夜半狂欢的恶魔开关：对局里看这局的，大厅里看房间设置。技能表、角色页、夜晚顺序都按它换掉亡骨魔（渲染子组件之前就记下）
  setDemonSwap('mo', s?.demonSwap !== undefined ? s.demonSwap : s?.settings?.moDemon);
  const [status, setStatus] = useState({ kind: 'connecting' });
  const [step, setStep] = useState('正在走进这座小镇……');
  const [slow, setSlow] = useState(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (s) return undefined;
    const t = setTimeout(() => { setSlow(true); report('进入超过 15 秒', stepRef.current); }, 15_000);
    return () => clearTimeout(t);
  }, [!s]);
  const [toast, setToast] = useState(null);
  const [updated, setUpdated] = useState(false); // 服务器换了新版本：提示刷新
  const phaseRef = useRef(null);
  phaseRef.current = s?.phase ?? null;
  const api = useRef(null);
  const [card, closeCard] = useNarrator(s?.log ?? null, s?.logEpoch);
  // 说话绿框：订阅大家所在的语音频道（活动开在文字频道时用服务器找到的那个语音频道）
  useEffect(() => { if (s?.voiceChannel) listenSpeaking(s.voiceChannel); }, [s?.voiceChannel]);

  // 环境声：哪个阶段放哪首曲子、在不在屋里（风声变闷）
  const stage = !s ? 'lobby' : s.phase === 'lobby' ? 'lobby' : s.phase === 'ended' ? 'end' : s.phase === 'night' ? 'night'
    : s.vote ? 'vote' : s.noms || s.pendingNom ? 'nominate' : 'day';
  const indoors = !!s && ((s.phase === 'night' && !!s.self) || !!s.roam?.myHouse);
  useEffect(() => { setAmbience({ stage, indoors, wind: stage !== 'lobby' }); }, [stage, indoors]);

  useEffect(() => {
    login(setStep)
      .then((hello) => {
        setStep('正在走进这座小镇……');
        api.current = openSocket(hello, {
          onState: (st) => {
            syncClock(st.now);
            setS((cur) => {
              // 完整状态里我的位置是服务器那份（晚出发几百毫秒）：如果终点就是我刚预测的那步，保留本地这份，免得往回跳
              const local = cur?.roam?.pos?.[st.me];
              const server = st.roam?.pos?.[st.me];
              if (local?.predicted && server && recentEnds.some((e) => Math.hypot(e.x - server.x, e.y - server.y) < 3)) st.roam.pos[st.me] = local;
              return st;
            });
          },
          // 别人走路：直接改地图用的位置表（画布每帧自己读），不触发整个界面重新渲染——
          // 不然有人按着方向键走，所有人的界面每秒都要重绘好几次，画面就卡
          onPos: ({ id, move, now }) => {
            syncClock(now);
            setS((cur) => {
              const pos = cur?.roam?.pos;
              if (!pos) return cur;
              const local = pos[id];
              // 自己走路：本地已经按预测在走了。服务器回的是我最近预测过的某一步就不打断
              // （连续按方向键时，上一步的回话会晚于下一步的预测到达）；不一样说明被挡了，以服务器为准
              const mine = id === cur.me && local?.predicted && recentEnds.some((e) => Math.hypot(e.x - move.x, e.y - move.y) < 3);
              if (!mine) pos[id] = move;
              return cur;
            });
          },
          onStatus: (kind, error) => setStatus({ kind, error }),
          onUpdate: () => { if (!phaseRef.current || ['lobby', 'ended'].includes(phaseRef.current)) location.reload(); else setUpdated(true); },
        });
      })
      .catch((e) => setStatus({ kind: 'error', error: e.message }));
  }, []);

  const showToast = (text) => {
    setToast(text);
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(null), 3200);
  };
  const ask = (action, payload) => api.current.act(action, payload);
  useEffect(() => { setMarksSink((payload) => api.current.act('marks', payload)); return () => setMarksSink(null); }, []);
  // 进房间时把这台设备上存的小人搭配带过去（在哪个房间都穿同一身）
  useEffect(() => { const o = savedOutfit(); if (s && !s.myOutfit && o) api.current.act('outfit', { outfit: o }); }, [s?.key, !!s?.myOutfit]);
  const act = async (action, payload) => {
    const r = await api.current.act(action, payload);
    if (!r.ok) showToast(r.error);
    else if (r.notice) showToast(r.notice);
    return r.ok;
  };

  if (status.kind === 'error' || !s) {
    const wrongPlace = status.kind === 'error' && (/^请从.*文字频道进入/.test(status.error ?? '') || /^Please enter from .*text channel/.test(status.error ?? '')); // 从语音频道打开：重新进入也没用，不给那个按钮
    return (
      <div className="splash">
        <PaintFilters />
        <h1 className="title">血染<br />钟楼</h1>
        <p className={`splash-note ${wrongPlace ? 'splash-block' : ''}`}>{status.kind === 'error' ? status.error : status.kind === 'online' ? '正在走进这座小镇……' : step}</p>
        {wrongPlace && (
          <div className="splash-help">
            <p>先关掉这个活动，到上面说的文字频道，从输入框旁边的应用启动器打开。人留在语音频道里就行。</p>
          </div>
        )}
        {!wrongPlace && (slow || status.kind === 'error') && (
          <div className="splash-help">
            <p>{status.kind === 'error' ? '进不去？' : '等太久了？'}点下面重新进入；{soloMode ? '还不行就过几分钟再来。' : fromKook ? '还不行就回 KOOK 频道重新领一次进入链接。' : fromBrowserLink ? '还不行就回 Discord 活动里，在「设置」里再点一次「在浏览器打开」。' : '还不行就关掉活动，再从文字频道打开一次。'}</p>
            <button type="button" className="splash-retry" onClick={() => location.reload()}>重新进入</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`app phase-${s.phase}`}>
      <PaintFilters />
      {status.kind !== 'online' && <div className="reconnect">连接断开了，正在重连……</div>}
      {updated && status.kind === 'online' && (
        <button type="button" className="update-bar" onClick={() => location.reload()}>游戏更新了 · 点这里刷新（进度不会丢）</button>
      )}
      {s.phase === 'lobby' ? <Lobby s={s} act={act} ask={ask} toast={showToast} onTutorial={() => api.current.tutorial(true)} />
        : s.ww ? <WerewolfGame s={s} act={act} ask={ask} />
          : s.script === 'avalon' ? <AvalonGame s={s} act={act} ask={ask} parts={{ History, SoundToggles, Watchers }} /> // 娱乐模式阿瓦隆：另一套界面，见 Avalon.jsx
            : s.script === 'mark' ? <MarkGame s={s} act={act} ask={ask} parts={{ History, SoundToggles, Watchers, onMove: (x, y, run) => { predictMove(s, x, y, run); return act('move', { x, y, run }); } }} /> // 娱乐模式暗印：见 Mark.jsx
            : <Game s={s} act={act} ask={ask} />}
      {s.tutorial && <Tutorial s={s} onExit={() => api.current.tutorial(false)} />}
      {toast && <div className="toast">{toast}</div>}
      <TitleCard card={card} onClose={closeCard} players={s?.players} kicker={s?.ww ? '法官' : s?.script === 'mark' ? '钟楼' : undefined} />
    </div>
  );
}

// ───────────────────────── 游戏 ─────────────────────────
const ROLES_DEMON = new Set(['imp']); // 暗流涌动的恶魔（破门过场）

const ST_FACE = { id: 'storyteller', seat: '★', name: '说书人', alive: true };

const MODES = {
  gun: { title: '枪手 · 开枪', hint: '选一名今天投过票的玩家：他死亡。每天一次。', confirm: '开枪' },
  pelt: { title: '惩罚场外', hint: '选一个人和一样东西，叠在他头上。', confirm: '扔' }, // 面板是 Pelt.jsx 的 PeltPanel，这里只给选人模式占个位
  psycho: { title: '精神病患者 · 杀人', hint: '公开站出来说你是精神病患者，选一名玩家：他死亡。每天一次，要在提名开始之前。', confirm: '杀死' },
  nominate: { title: '提名', hint: '选一个人，站出来指着他。', confirm: '提名' },
  slay: { title: '声称是猎手 · 开枪', hint: '任何人都可以站出来声称自己是猎手，当众向一个人开枪（可以用来诈身份）。只有真猎手打中恶魔，对方才会倒下；每人每局只能开一次。', confirm: '开枪' },
  pull: { title: '拉进密室', hint: '选人拉进私聊房间；只选一个人就是和你单独谈。', confirm: '带走', max: 3 },
};

function Game({ s, act, ask }) {
  const [mode, setMode] = useState(null);     // 白天的选人模式
  const [picked, setPicked] = useState([]);
  const [pickedRole, setPickedRole] = useState(null); // 侍臣、赌徒还要选一个角色
  const [sheet, setSheet] = useState(null);   // 说书人点开的玩家
  const [tab, setTab] = useState(null);       // 打开的面板
  const [menu, setMenu] = useState(false);
  const [dash, setDash] = useState(null);     // 恶魔破门过场：{ target, roleId }
  useTick(1000);
  const [skills, setSkills] = useSheetMode(); // 地图上由 TownMap 自己放，别的场景放在这里
  const me = s.self;
  const g = (id) => (id === 'storyteller' ? ST_FACE : s.players.find((p) => p.id === id)); // 有无神论者的剧本可以提名说书人
  const name = (id) => { if (id === 'storyteller') return '说书人'; const p = g(id); return p ? `${p.seat}号 ${p.name}` : '?'; };

  const night = s.phase === 'night';
  const prompt = night && me?.prompt && !me.prompt.chosen ? me.prompt : null;
  const rk = night && me?.ravenkeeper;
  const pickSpec = rk ? { count: 1, options: s.players.map((p) => p.id) }
    : prompt ? { count: prompt.count, options: prompt.options }
      : mode ? { count: MODES[mode].max ?? 1, options: [...s.players.map((p) => p.id).filter((id) => mode !== 'pull' || id !== s.me), ...(mode === 'nominate' && s.stNominable && !s.stNominated ? ['storyteller'] : [])] } : null; // 官方：可以提名自己；有无神论者的剧本也能提名说书人

  const pickKey = `${s.phase}-${s.night}-${s.day}-${mode}-${!!prompt}-${rk}`;
  useEffect(() => { setPicked([]); setPickedRole(null); }, [pickKey]);
  // 换阶段就取消正在选人的操作；自由活动开始/结束时也取消，只有"开枪"例外（官方规则：白天任何时候都能开枪）
  useEffect(() => { setMode((m) => (s.phase !== 'day' ? null : s.roam && m !== 'slay' && m !== 'psycho' && m !== 'pelt' && m !== 'gun' ? null : m)); }, [s.phase, !!s.roam]);
  // 有人提名了 / 开始投票：「提名」的选人模式退出（这时本来也提名不了）。以前一直停在选人面板上，被提名的哥布林看不到「我是哥布林」（2026-11-23）
  useEffect(() => { if (s.pendingNom || s.vote) setMode((m) => (m === 'nominate' ? null : m)); }, [!!s.pendingNom, !!s.vote]);

  const onTap = (p) => {
    if (pickSpec) {
      if (!pickSpec.options.includes(p.id)) return;
      setPicked((cur) => {
        if (cur.includes(p.id)) return cur.filter((x) => x !== p.id);
        const next = [...cur, p.id];
        return next.length > pickSpec.count ? next.slice(-pickSpec.count) : next;
      });
      return;
    }
    if (s.isST) setSheet(p.id);
  };

  const confirm = async () => {
    let ok = false;
    if (rk) ok = await act('ravenkeeper', { target: picked[0] });
    else if (prompt) {
      ok = await act('choose', { night: prompt.night, targets: picked, role: pickedRole });
      // 恶魔选好了人（不是自己）：播变身 + 冲去他家的过场（只有自己看得到）
      const t = picked[0];
      if (ok && ROLES_DEMON.has(prompt.roleId) && t && t !== s.me && g(t)?.alive && s.killScene && s.homes?.[s.me] && s.homes?.[t]) setDash({ target: t, roleId: prompt.roleId }); // 选了死人（空刀）不冲过去
    }
    else if (mode === 'nominate') ok = await act('nominate', { target: picked[0] });
    else if (mode === 'slay') ok = await act('slay', { target: picked[0] });
    else if (mode === 'psycho') ok = await act('psycho', { target: picked[0] });
    else if (mode === 'gun') ok = await act('gunslinger', { target: picked[0] });
    else if (mode === 'pull') ok = await act('pull', { targets: picked });
    if (ok) { setMode(null); setPicked([]); }
  };

  const roaming = !!s.roam && !pickSpec;
  useAmbience(getMap(s.script).art ?? s.script, roaming ? 'roam' : night && me ? 'night' : null); // 黯月初升：偶尔狼嚎、鸟群惊飞
  const t = gameClock(s);
  const secs = useCountdown(s.deadline);
  // 右下角只显示当前阶段的倒计时
  // 夜里：服务器只在轮到自己选的时候发自己的截止时间（不显示整夜还剩多久：看着它突然变长会漏出"场上有疯子"之类的信息）
  const timerSpec = night ? (s.deadline ? { label: '选择倒计时', until: s.deadline } : null)
    : s.vote ? { label: '投票倒计时', until: s.deadline }
      : s.moonchildDue ? { label: '遗言时间', until: s.moonchildDue }
      : s.riot ? { label: '接着提名', until: s.riot.until }
      : s.rps ? { label: '猜拳', until: s.rps.until }
      : s.pendingNom?.until ? { label: s.pendingNom.stage === 'accuse' ? '提名陈述' : '辩护', until: s.pendingNom.until }
        : s.noms && !s.noms.timeUp ? { label: '提名结束', until: s.noms.until }
          : s.roam?.until ? { label: '自由活动结束', until: s.roam.until } : null;
  const timerSecs = useCountdown(timerSpec?.until ?? null);
  // 提名快结束：剩 60 / 30 / 10 秒各提醒一次，最后 10 秒滴答；轮到自己发言的最后 10 秒也滴答
  const nomSecs = timerSpec?.label === '提名结束' ? timerSecs : null;
  const roamSecs = timerSpec?.label === '自由活动结束' ? timerSecs : null; // 自由活动快结束：同样剩 60 / 30 / 10 秒提醒、最后 10 秒滴答
  const chooseSecs = timerSpec?.label === '选择倒计时' ? timerSecs : null; // 夜里自己选人：剩 30 / 10 秒提醒、最后 10 秒滴答
  const speechStage = !!s.pendingNom?.until && !!timerSpec && !['提名结束', '选择倒计时'].includes(timerSpec.label);
  const urgent = (nomSecs != null && nomSecs <= 30) || (roamSecs != null && roamSecs <= 30) || (chooseSecs != null && chooseSecs <= 10) || (speechStage && timerSecs != null && timerSecs <= 10);
  const [warn, setWarn] = useState(null);
  const warned = useRef(new Set());
  useEffect(() => {
    if (nomSecs != null) {
      for (const th of [60, 30, 10]) {
        const key = `${s.day}-${s.noms?.until}-${th}`;
        if (nomSecs <= th && nomSecs > th - 3 && !warned.current.has(key)) {
          warned.current.add(key);
          setWarn(`提名还剩 ${th} 秒`);
          clearTimeout(warned.t);
          warned.t = setTimeout(() => setWarn(null), 3000);
        }
      }
      if (nomSecs > 0 && nomSecs <= 10) tick(nomSecs <= 3);
    } else if (roamSecs != null) {
      for (const th of [60, 30, 10]) {
        const key = `roam-${s.day}-${s.roam?.until}-${th}`;
        if (roamSecs <= th && roamSecs > th - 3 && !warned.current.has(key)) {
          warned.current.add(key);
          setWarn(`自由活动还剩 ${th} 秒，快回广场`);
          clearTimeout(warned.t);
          warned.t = setTimeout(() => setWarn(null), 3000);
        }
      }
      if (roamSecs > 0 && roamSecs <= 10) tick(roamSecs <= 3);
    } else if (chooseSecs != null) {
      for (const th of [30, 10]) {
        const key = `choose-${s.night}-${s.deadline}-${th}`;
        if (chooseSecs <= th && chooseSecs > th - 3 && !warned.current.has(key)) {
          warned.current.add(key);
          setWarn(`选择还剩 ${th} 秒`);
          clearTimeout(warned.t);
          warned.t = setTimeout(() => setWarn(null), 3000);
        }
      }
      if (chooseSecs > 0 && chooseSecs <= 10) tick(chooseSecs <= 3);
    } else if (speechStage && timerSecs != null && timerSecs > 0 && timerSecs <= 10) {
      const mine = (s.pendingNom.stage === 'accuse' ? s.pendingNom.nominator : s.pendingNom.nominee) === s.me;
      if (mine) tick(timerSecs <= 3);
    }
  }, [nomSecs, roamSecs, chooseSecs, speechStage ? timerSecs : null]);
  const myHouse = s.roam?.houses.find((h) => h.id === s.roam.myHouse);
  const town = getMap(s.script);
  const place = night ? (me ? '你的小屋' : '魔典') : roaming ? (myHouse ? myHouse.name : `${town.place.split(' · ')[0]} · 街上`) : town.name;
  const meP = g(s.me);
  const [check, closeCheck] = useChecks(me?.inbox, s.logEpoch);

  const items = [
    me && { id: 'role', icon: 'role', label: '身份', dot: me.inbox.length || 0 },
    { id: 'log', icon: 'talk', label: '记录' },
    { id: 'votes', icon: 'roster', label: '关键信息', dot: s.votes?.length && tab !== 'votes' && s.votes.at(-1).at > Date.now() - 60_000 ? '' : 0 },
    { id: 'roster', icon: 'roster', label: '镇民' },
    { id: 'roles', icon: 'grim', label: '角色' },
    (fabledOf(s.script).length || travellersOf(s.script).length) && { id: 'extras', icon: 'grim', label: fabledOf(s.script).length ? '传奇' : '旅行者' }, // 2026-11-20 用户：收成一个词，有传奇角色就叫传奇，只有旅行者叫旅行者
    s.isST && { id: 'grim', icon: 'grim', label: '魔典', dot: stTodo(s.st) },
    s.isHost && { id: 'menu', icon: 'menu', label: s.isST ? '说书人' : '房主' },
  ].filter(Boolean);
  const myVoteOpen = !!s.vote && !!me && (me.alive || me.ghostVote) && !s.vote.locked.includes(s.me);
  const mySpeech = !!s.pendingNom && ((s.pendingNom.stage === 'accuse' && s.pendingNom.nominator === s.me) || (s.pendingNom.stage === 'defend' && s.pendingNom.nominee === s.me));
  // 提名阶段大家在等我表态（提名或不提名）；点了「提名」「开枪」「拉进密室」正在选人，也算轮到我
  const myNomOpen = !!s.noms && !s.noms.timeUp && !!me?.alive && !meP?.nominator && !s.noms.skipped && !s.executedToday && !s.vote && !s.pendingNom && !s.riot;
  const dockHot = !!(prompt || rk) || myVoteOpen || mySpeech || myNomOpen || !!s.riot?.mine || !!mode;
  const [dockMin, toggleDock, dockRef] = useDockSheet(dockHot);
  const pick = (id) => { if (id === 'journal') tutEvent('journal'); return id === 'menu' ? setMenu(true) : setTab((cur) => (cur === id ? null : id)); };
  const shown = tab ?? (s.isST ? 'grim' : me ? 'role' : 'log'); // 电脑上右栏默认显示的面板

  return (
    <div className="game">
      <PeltFx s={s} />{/* 扔东西的动画：全场都看得到 */}
      <CourtFx s={s} />{/* 赛后军事法庭：全场同时看战犯被吊起来 */}
      <section className="scene">
        {!roaming && <div className="where">{place !== town.name && <Tag>{place}</Tag>}{/* 白天广场不写地名，只写剧本名（2026-11-20 用户）；夜里的「你的小屋」「魔典」照常 */}<Tag className="where-script">{SCRIPTS[s.script]?.name ?? SCRIPTS.tb.name}</Tag></div>}
        {s.spectator && s.phase !== 'ended' && (
          <div className="spectator-bar">观战中{s.settings?.spectatorGrimoire ? ' · 你能看到所有人的身份，别在语音里说' : ' · 看不到任何人的身份'}{(s.watchers?.length ?? 0) > 1 ? ` · 观战 ${s.watchers.length} 人` : ''}</div>
        )}
        <BoardBar n={s.players.filter((p) => !p.traveller).length} script={s.script} /> {/* 旅行者不算进人数配置。人数条在顶栏居中（2026-11-20 用户：不要挪到左上角） */}
        {/* 票数统计块（VoteStats）2026-11-20 用户说不需要，不再显示 */}
        {roaming ? (
          <TownMap s={s} onMove={me ? (x, y, run) => { predictMove(s, x, y, run); return act('move', { x, y, run }); } : () => null} />
        ) : dash && night ? (
          <DemonDash s={s} target={dash.target} roleId={dash.roleId} onDone={() => setDash(null)} />
        ) : night && me && meP ? (
          <Cottage p={meP} awake={!!(prompt || rk)} dead={!me.alive} dawn={false} />
        ) : s.transit === 'dawn' && me && meP ? (
          // 天亮到开始自由活动之间：在自己的小屋里醒来（不切到集合广场）
          <DawnWake p={meP} dead={!me.alive} />
        ) : (
          <Town s={s} picked={picked} pickable={pickSpec?.options ?? null} onTap={onTap}>
            <Center s={s} name={name} act={act} me={me} />
          </Town>
        )}
        {!roaming && !dash && me && meP && (night || s.transit === 'dawn') && <AliveStrip s={s} />}
        {night && me?.killedTonight && <DoorKick />}
        {!roaming && skills && <CheatSheet s={s} onClose={() => setSkills(false)} />}
        {/* 右上角单独的「技能表」按钮去掉了（和齿轮里的重复，2026-11-20 用户）；地图上小地图左边那个由 TownMap 自己放 */}
        <SoundToggles onFixVoice={me && s.phase !== 'ended' && !soloMode ? () => act('fixVoice') : null} onSheet={!roaming && !skills ? () => setSkills(true) : null} />
        <SkillCheck check={check} onClose={closeCheck} />
        <MicDemand me={me} day={s.day} />
        <MadnessBrief me={me} gameId={s.gameId} />
        {me?.mic && me.micOn && <div className="mic-chip" title="收音页开着：说书人听得到你。关掉收音页大约 45 秒后，这里会重新提醒。">● 收音开着</div>}
        <HudBar items={items} active={tab} onPick={pick} label={t.label}
          timer={timerSpec && { label: timerSpec.label, secs: timerSecs, urgent }} />
        {warn && <div className="nom-warn" key={warn}>{warn}</div>}
      </section>

      {/* 操作面板：电脑上在右栏上方（标签页上面）；手机上排在画面下面 */}
      <section ref={dockRef} className={`dock ${dockHot ? 'dock-hot' : ''} ${dockHot && dockMin ? 'dock-min' : ''}`}>
        {dockHot && <DockHandle min={dockMin} onToggle={toggleDock} />}
        {me?.moonchild && <MoonchildPanel s={s} act={act} fake={me.moonchild === 'fake'} />}
        {me?.klutz && <KlutzPanel s={s} act={act} />}
        {(me?.madness && (!me.madness.claimed || (me.mic && !me.micOn)) || (me?.mutant && me.mic && !me.micOn)) && <MadnessPanel me={me} />}
        <Actions s={s} act={act} me={me} name={name} g={g} mode={mode} setMode={setMode} picked={picked} onTap={onTap}
          prompt={prompt} rk={rk} pickSpec={pickSpec} confirm={confirm} pickedRole={pickedRole} setPickedRole={setPickedRole}
          skip={() => act('choose', { night: prompt.night, targets: [], role: null })} />
      </section>

      <aside className={`drawer ${tab ? 'open' : ''}`}>
        <div className="drawer-tabs">
          {items.filter((it) => it.id !== 'menu').map((it) => (
            <button key={it.id} type="button" className={shown === it.id ? 'on' : ''} onClick={() => { if (it.id === 'journal') tutEvent('journal'); setTab(it.id); }}>{it.label}</button>
          ))}
          <button type="button" className="drawer-close" onClick={() => setTab(null)} aria-label="收起">×</button>
        </div>
        <div className="drawer-body">
          {shown === 'role' && me?.newbie && <NewbieTips me={me} />}
          {shown === 'role' && me && <InfoBox me={me} />}
          {shown === 'role' && me && <RoleCard me={me} />}
          {shown === 'role' && me?.bluffs && <BluffCards me={me} act={act} />}
          {shown === 'role' && me && !me.bluffs && <EvilNote me={me} />}
          {shown === 'role' && me?.lunatic && (
            <div className="bluffs">
              <Tag tone="phy">疯子</Tag>
              <p className="muted"><b>{name(me.lunatic.id)}</b> 是疯子：他以为自己是{ROLE_NAMES[me.lunatic.as] ?? '恶魔'}。每晚他选了谁，轮到你选人时会写在选人面板上。</p>
            </div>
          )}
          {shown === 'log' && <History log={s.log} players={s.players} ask={ask} epoch={s.logEpoch} />}
          {shown === 'votes' && <KeyInfo votes={s.votes} knives={s.knives} execs={s.execs} pubs={s.pubs} g={g} name={name} />}
          {shown === 'roster' && <Roster s={s} onTap={s.isST ? (p) => setSheet(p.id) : null} />}
          {shown === 'roster' && <Watchers s={s} />}
          {shown === 'roles' && <RoleIndex s={s} />}
          {shown === 'extras' && <ExtrasInfo s={s} />}
          {shown === 'grim' && s.isST && <StDesk s={s} act={act} name={name} />}
        </div>
      </aside>

      {sheet && <PlayerSheet s={s} p={g(sheet)} act={act} name={name} onClose={() => setSheet(null)} />}
      {menu && <HostMenu s={s} act={act} onClose={() => setMenu(false)} setMode={setMode} />}
    </div>
  );
}

/** 左下角：我的肖像 + 两个小方块（像游戏里的生命/士气）。 */
function MeCard({ me, p }) {
  return (
    <div className="mecard">
      <div className="me-stats">
        <span className={`me-sq ${me.alive ? 'red' : 'dead'}`} title={me.alive ? '活着' : '已死亡'}>{me.alive ? '活' : '亡'}</span>
        <span className={`me-sq ${me.alive || me.ghostVote ? 'blue' : 'dead'}`} title="投票权">{me.alive ? '票' : me.ghostVote ? '1' : '0'}</span>
      </div>
      <Portrait p={p} size={44} frame="#f4f4f0" />
      <span className="me-seat">{cnNum(me.seat)}号</span>
    </div>
  );
}

function Center({ s, name, act, me }) {
  const countdown = useCountdown(s.vote && s.vote.idx < 0 ? s.deadline : null);
  useTick(1000); // 投票结果在中间停留几秒
  if (s.winner) {
    return (
      <div className={`center-box win ${s.winner.team}`}>
        <Tag tone={s.winner.team === 'good' ? 'int' : 'phy'}>{s.winner.team === 'good' ? '善良获胜' : '邪恶获胜'}</Tag>
      </div>
    );
  }
  if (s.vote) {
    const raised = s.vote.yes.includes(s.me);
    const locked = s.vote.locked.includes(s.me);
    const can = me && (me.alive || me.ghostVote) && !locked;
    return (
      <div className="center-box vote-center">
        <OnBlock s={s} ids={[s.vote.nominee]} label="被提名" />
        <div className="vc-title">处决 <b>{name(s.vote.nominee)}</b>？<span>{s.block ? `要 ${Math.max(s.threshold, s.blockVotes + 1)} 票才换下台上的人（${s.blockVotes} 票平票）` : `需要 ${Math.max(s.threshold, (s.blockVotes || 0) + 1)} 票`}</span></div>
        {can
          ? <HandButton s={s} act={act} raised={raised} />
          : me && <span className="center-locked">{raised ? '你举了手 · 已锁定' : locked ? '你没举手 · 已锁定' : '你的幽灵票已用掉，不能投票'}</span>}
        <VoteTrack s={s} />
        <small>{countdown != null ? `${countdown} 秒后指针开始转，离开你时锁定` : '指针停在你面前时还能改，离开你时锁定'}</small>
      </div>
    );
  }
  const lv = s.lastVote;
  const recent = lv && Date.now() - lv.endedAt < 9000;
  // 处决台：票数够的人一直站在台上；同票的几个人一起站上去（平票时谁都不会被处决）
  const onBlock = s.phase === 'day' ? (s.block ? [s.block] : s.blockTied ?? []) : [];
  if (!recent && !onBlock.length) return null;
  const what = recent && { block: '送上处决台', tie: '平票', lower: '不如台上的票多', fail: '票数不够', secret: '票数保密（街头风琴手）' }[lv.outcome];
  return (
    <div className="center-box">
      {onBlock.length > 0 && (
        <OnBlock s={s} ids={onBlock}
          label={onBlock.length > 1 ? `平票 · ${s.blockVotes} 票 · 谁都不处决` : `处决台 · ${s.blockVotes} 票`} />
      )}
      {recent && lv.count != null && <div className="tally"><b>{lv.count}</b><span>/</span><b className="need">{lv.threshold}</b></div>}
      {recent && <small>{name(lv.nominee)} · {what}</small>}
    </div>
  );
}

/** 画面正中的处决台：站在台上的人的头像（一个人 = 黄昏会被处决；几个人 = 平票）。 */
function OnBlock({ s, ids, label }) {
  const ps = ids.map((id) => s.players.find((p) => p.id === id)).filter(Boolean);
  if (!ps.length) return null;
  return (
    <div className={`on-block ${ps.length > 1 ? 'tied' : ''}`}>
      <div className="ob-faces">
        {ps.map((p) => (
          <figure key={p.id}>
            <Portrait p={p} size={ps.length > 1 ? 52 : 64} prefer="avatar" frame="#c8473a" />
            <figcaption>{p.seat}号 {p.name}</figcaption>
          </figure>
        ))}
      </div>
      <div className="ob-plank" aria-hidden="true" />
      <small>{label}</small>
    </div>
  );
}

// ───────────────────────── 操作区（正常的卡片和按钮） ─────────────────────────
function Picked({ picked, name, need }) {
  return (
    <div className="chips">
      {picked.map((id) => <span key={id} className="chip">{name(id)}</span>)}
      {picked.length < need && <span className="chip empty">点上面的肖像选人（{picked.length}/{need}）</span>}
    </div>
  );
}

/** 夜里在小屋里选人：一排肖像按钮。 */
/** 选一个角色（侍臣、赌徒）：按类型分组的角色按钮。 */
function RolePicker({ ids, value, onPick }) {
  const teams = ['townsfolk', 'outsider', 'minion', 'demon'];
  return (
    <div className="role-picker">
      {teams.map((t) => {
        const list = ids.filter((id) => ROLE_DEFS[id]?.team === t);
        if (!list.length) return null;
        return (
          <div key={t} className="rp-team">
            <span className="rp-label" style={{ color: ATTR[t].color }}>{TEAM_NAME_CN[t]}</span>
            {list.map((id) => (
              <button key={id} type="button" className={value === id ? 'on' : ''} style={{ '--attr': ATTR[t].color }} onClick={() => onPick(value === id ? null : id)}>{ROLE_NAMES[id]}</button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
const TEAM_NAME_CN = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };

/** 造谣者式的公开声明：挑一种说法，填玩家/角色。 */
const STATEMENTS = [
  ['role', '某人是某个角色', true, true], ['evil', '某人是邪恶的', true, false], ['good', '某人是善良的', true, false],
  ['demon', '某人是恶魔', true, false], ['inplay', '场上有某个角色', false, true], ['notinplay', '场上没有某个角色', false, true],
];
/**
 * 造谣者按钮：点开是声明表单（单独的组件，状态放这里）。黯月初升的白天谁都能用（广场、街上、房子里都有），
 * 每人每天一次；真造谣者自己看到的是醒目的主按钮（只在他自己屏幕上，别人看不出来）。
 */
function GossipButton({ s, act }) {
  const [open, setOpen] = useState(false);
  const me = s.self;
  if (!inScript('gossip', s.script) || s.phase !== 'day' || !me?.alive || me.gossipDone) return null;
  // 表单开成屏幕中间的弹窗（以前塞在右上角的操作面板里展开，面板高度不够，大半被挡住，看起来像没弹出来）
  return (
    <div className="btn-row gossip-row">
      <Btn kind={me.role?.id === 'gossip' ? 'primary' : 'secondary'} onClick={() => setOpen(true)}
        title="谁都可以公开发表声明；只有真造谣者的声明为真时，今晚会有人死亡。每人每天一次。">发表声明（造谣者）</Btn>
      {open && createPortal(
        <div className="sheet-bg gossip-bg" onClick={() => setOpen(false)} role="presentation">
          <div className="gossip-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="发表声明">
            <h3>发表声明</h3>
            <GossipForm s={s} act={act} onClose={() => setOpen(false)} />
          </div>
        </div>, document.body)}
    </div>
  );
}

/** 猎手按钮（有猎手的剧本）：白天任何时候谁都能声称猎手开一枪，每人每局一次；真猎手自己看到的是醒目的主按钮。 */
/** 精神病患者：白天提名开始前，公开选一名玩家杀死（只有真精神病患者看得到这个按钮）。 */
function PsychoButton({ s, setMode }) {
  if (!s.self?.canPsycho) return null;
  return (
    <div className="btn-row gossip-row">
      <Btn kind="primary" onClick={() => setMode('psycho')} title="公开说你是精神病患者，选一名玩家：他死亡。每天一次，要在提名开始之前。">精神病患者 · 杀一个人</Btn>
    </div>
  );
}

/** 精神病患者被处决前猜拳：两个人各出一手，其他人看倒计时。 */
function RpsPanel({ s, act, g }) {
  const r = s.rps;
  const secs = useCountdown(r.until);
  const clock = secs != null ? <span className="nom-clock">{secs}</span> : null;
  const nm = (id) => (id === 'storyteller' ? '说书人' : `${g(id)?.seat}号 ${g(id)?.name}`);
  const HAND = { rock: '✊ 石头', scissors: '✌️ 剪刀', paper: '✋ 布' };
  return (
    <Panel title="精神病患者 · 猜拳" tone="phy" extra={clock}>
      <p className="lead"><b>{nm(r.a)}</b> 是精神病患者，要和 <b>{nm(r.b)}</b> 猜拳：只有他输了，这次处决才会让他死。</p>
      {r.mine && (r.hand
        ? <p className="muted">你出了{HAND[r.hand]}，等对方出手……</p>
        : <div className="btn-row">{['rock', 'scissors', 'paper'].map((h) => <Btn key={h} kind="primary" onClick={() => act('rps', { hand: h })}>{HAND[h]}</Btn>)}</div>)}
      {!r.mine && <p className="muted">两个人正在出手，时间到还没出的随机出。</p>}
    </Panel>
  );
}

function SlayButton({ s, setMode }) {
  const me = s.self;
  // 有猎手的剧本（暗流涌动、生死未卜……）谁都能声称开枪（死人也行，没有效果）；只给真猎手显示等于把身份亮给了全场。
  // 没有猎手的剧本里只有猜中了猎手能力的失忆者有这把枪（canSlay）。诸神黄昏的猎手死了才开枪（RagShotPanel）
  if ((engineOf(s.script) !== 'tb' && !inScript('slayer', s.script) && !me?.canSlay) || s.script === 'rag' || s.phase !== 'day' || !me || s.players.find((p) => p.id === s.me)?.shot) return null; // 诸神黄昏的猎手死了才开枪（RagShotPanel）
  return (
    <div className="btn-row gossip-row">
      <Btn kind={me.role?.id === 'slayer' || me.canSlay ? 'primary' : 'secondary'} onClick={() => setMode('slay')}
        title="谁都可以声称自己是猎手开一枪；只有真猎手打中恶魔才会有人倒下。每人每局一次。">声称猎手 · 开枪</Btn>
    </div>
  );
}

/**
 * 梦殒春宵（和两个小剧本）白天的操作：公开声明、公开猜测（谁都能用），博学者、艺术家、渔夫、失忆者的私下询问（只有本人看得到）。
 * 被提名时声明自己是哥布林在提名面板下面（GoblinClaim）。
 */
function SnvButtons({ s, act }) {
  const [open, setOpen] = useState(null);
  const me = s.self;
  if (s.phase !== 'day' || !me || engineOf(s.script) !== 'snv') return null; // 通用的公开声明 11-11 去掉了（只留造谣者的「发表声明」）
  const close = () => setOpen(null);
  return (
    <div className="btn-row gossip-row snv-row">
      {me.canSavant && <Btn kind="primary" onClick={() => act('savant')} title="每个白天一次：得到一真一假两条信息">询问说书人</Btn>}
      {me.canArtist && <Btn kind="primary" onClick={() => setOpen('artist')} title="每局一次：私下问一个是非问题">提问</Btn>}
      {me.canFisherman && <Btn kind="primary" onClick={() => setOpen('fisherman')} title="每局一次：请说书人给一条帮你的阵营获胜的建议">请教说书人</Btn>}
      {me.canAmnesiac && <Btn kind="primary" onClick={() => setOpen('amnesiac')} title="每个白天一次：猜自己的能力，说书人告诉你猜得多准">猜我的能力</Btn>}
      {me.canPardon && <Btn kind="primary" onClick={() => setOpen('pardon')} title="每局一次：台上的人走下来，今天不再处决任何人">特赦</Btn>}
      {me.canJuggle && <Btn kind={me.role?.id === 'juggler' ? 'primary' : 'secondary'} onClick={() => setOpen('juggle')} title="公开猜最多五次玩家的角色；只有真杂耍艺人当晚会得知猜对几个">公开猜测</Btn>}
      {me.harpy && !me.harpy.claimed && <Btn kind="primary" onClick={() => setOpen('harpy')} title={`鹰身女妖要你疯狂地证明 ${me.harpy.name} 是邪恶的`}>公开指认</Btn>}
      {me.canDamsel && <Btn kind="secondary" onClick={() => setOpen('damsel')} title="爪牙合计有一次机会：公开猜谁是落难少女，猜中了邪恶获胜。谁都可以这么说">猜落难少女</Btn>}
      {me.canAlsaahir && <Btn kind={me.role?.id === 'alsaahir' ? 'primary' : 'secondary'} onClick={() => setOpen('alsaahir')} title="每个白天一次：公开猜谁是恶魔、谁是爪牙。真戏法师全猜对，善良直接获胜。谁都可以这么说">戏法师 · 猜恶魔和爪牙</Btn>}
      {me.canDoom && <Btn kind="secondary" onClick={() => setOpen('doom')} title="传奇角色末日预言者：活人不少于 4 个时，每人每局可以公开用一次，说书人让一名和你同阵营的存活玩家死亡">末日预言者</Btn>}
      {me.duchess?.open && <Btn kind={me.duchess.mine ? 'primary' : 'secondary'} onClick={() => act('duchess', { on: !me.duchess.mine })}
        title="传奇角色公爵夫人：黄昏时正好三人报名，当晚三人各自得知三人里有几个邪恶（其中一人的数是错的）">{me.duchess.mine ? `不去拜访公爵夫人（${me.duchess.ids.length}/3）` : `拜访公爵夫人（${me.duchess.ids.length}/3）`}</Btn>}
      {me.canCult && <Btn kind={me.role?.id === 'cultleader' ? 'primary' : 'secondary'} onClick={() => setOpen('cult')} title="异教领袖：每天一次，公开发起教派，所有善良玩家都加入，你所在的阵营获胜。谁都可以这么说">发起教派</Btn>}
      {me.gangTargets && <Btn kind="primary" onClick={() => setOpen('gang')} title="黑帮：每天一次，杀掉一个活着的邻座，要另一边的活邻座同意">黑帮 · 动手</Btn>}
      {me.canPuzzle && <Btn kind="primary" onClick={() => setOpen('puzzle')} title="每局一次：猜谁是被你弄醉的人。猜对了得知谁是恶魔，猜错了得到错误的「谁是恶魔」（说书人不说你猜没猜对）">解谜大师 · 猜谁醉了</Btn>}
      {me.knaves && <KnavesPick me={me} act={act} />}
      {me.yaggPhrase && <span className="muted yagg-note" title="白天每公开说一次，当晚就可能有一名玩家死亡（要开着收音页说）">你的暗号「{me.yaggPhrase.phrase}」· 今天说了 {me.yaggPhrase.today} 次</span>}
      {open && createPortal(
        <div className="sheet-bg gossip-bg" onClick={close} role="presentation">
          <div className="gossip-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={{ declare: '公开声明', juggle: '公开猜测', artist: '提问', fisherman: '请教说书人', amnesiac: '猜我的能力', pardon: '特赦', harpy: '公开指认', damsel: '猜落难少女', alsaahir: '戏法师', doom: '末日预言者', puzzle: '解谜大师', cult: '发起教派', gang: '黑帮' }[open]}>
            {open === 'declare' && <DeclareForm s={s} act={act} onClose={close} />}
            {open === 'juggle' && <JuggleForm s={s} act={act} onClose={close} />}
            {open === 'artist' && <ArtistForm act={act} onClose={close} />}
            {open === 'amnesiac' && <AmnesiacForm act={act} onClose={close} />}
            {open === 'pardon' && <Confirm title="公开特赦" text="每局只能用一次。全场都会看到：台上的人走下处决台，今天不再处决任何人。" ok="特赦" onOk={() => act('pardon')} onClose={close} />}
            {open === 'harpy' && <Confirm title="公开指认" text={`全场都会看到你说「${me.harpy.name} 是邪恶的」。这就算你疯狂地证明过了；今天不说的话，黄昏时你们之中可能有人死亡。`} ok="公开说" onOk={() => act('harpyClaim')} onClose={close} />}
            {open === 'damsel' && <DamselForm s={s} act={act} onClose={close} />}
            {open === 'alsaahir' && <AlsaahirForm s={s} act={act} onClose={close} />}
            {open === 'puzzle' && <PuzzleForm s={s} act={act} onClose={close} />}
            {open === 'cult' && <Confirm title="发起教派" text="全场都会看到。大家有一小段时间举手加入（死人也算）。只有真异教领袖、而且所有善良玩家都加入，你所在的阵营才获胜。每天一次。" ok="公开发起" onOk={() => act('cult')} onClose={close} />}
            {open === 'gang' && <div className="gossip-form"><h3>黑帮 · 动手</h3><p className="muted">选一个活着的邻座。另一边的活邻座同意，他就死。每天一次（对方不同意可以换一边再试）。</p>
              <div className="btn-row">{me.gangTargets.map((id) => <Btn key={id} kind="primary" onClick={async () => { if (await act('gangster', { target: id })) close(); }}>{s.players.find((p) => p.id === id)?.seat}号 {s.players.find((p) => p.id === id)?.name}</Btn>)}<Btn onClick={close}>取消</Btn></div></div>}
            {open === 'doom' && <Confirm title="末日预言者" text="每人每局只能用一次，全场都会看到。说书人会挑一名和你同阵营的存活玩家（可能是你自己）当场死亡。现在就用吗？" ok="公开使用" onOk={() => act('doomsayer')} onClose={close} />}
            {open === 'fisherman' && <Confirm title="请教说书人" text="每局只能请教一次。说书人会私下给你一条建议，告诉你该去做什么（不一定是一条事实）。现在就用吗？" ok="现在请教" onOk={() => act('fisherman')} onClose={close} />}
          </div>
        </div>, document.body)}
    </div>
  );
}

const scriptRoles = (script) => rolesOf(script);

/** 抢椅子（Will 版）：入夜前悄悄决定换不换——和一名活着的玩家，或一个空座位（换之前不知道上面是什么）。 */
function ChairPanel({ s, me, act }) {
  const c = me.chair;
  const secs = useCountdown(c.until);
  const [t, setT] = useState(c.pick);
  const pick = async (target) => { if (await act('chair', { target })) setT(target); };
  return (
    <Panel title="抢椅子" tone="psy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      <p className="lead">入夜前：要不要换座位？换了就拿走那个座位的<b>角色和阵营</b>，你原来的留给对方。你还能换 <b>{c.left}</b> 次。</p>
      <p className="muted">空座位上是什么，换之前不知道。被你换的人会得知自己的新角色，但不知道是谁换的。</p>
      <div className="btn-row">{c.chairs.map((x) => <Btn key={x.id} kind={t === x.id ? 'primary' : 'secondary'} onClick={() => pick(x.id)}>{x.name}</Btn>)}</div>
      <Picker s={s} options={c.players} picked={t && !t.startsWith('chair:') ? [t] : []} onTap={(p) => pick(p.id)} />
      <div className="btn-row"><Btn kind={c.done && !t ? 'primary' : 'ghost'} onClick={async () => { if (await act('chair', { target: null })) setT(null); }}>这晚不换</Btn></div>
      {c.done && <p className="muted">{t ? '选好了，到点就换（可以改）。' : '这晚不换（可以改）。'}</p>}
    </Panel>
  );
}

/** 异教领袖发起了教派：所有人（死人也算）举手加入。 */
function CultPanel({ s, act, g }) {
  const c = s.cult;
  const secs = useCountdown(c.until);
  const by = g(c.by);
  return (
    <Panel title="教派" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      <p className="lead"><b>{by?.seat}号 {by?.name}</b> 以异教领袖的身份发起教派。想加入就举手（死人也算、不消耗投票标记）。</p>
      <p className="muted">已经 {c.count} 人加入。所有善良玩家都加入、而且他真是异教领袖，他所在的阵营就获胜。</p>
      {s.players.some((p) => p.id === s.me) && <div className="btn-row"><Btn kind={c.mine ? 'secondary' : 'primary'} onClick={() => act('cultHand', { up: !c.mine })}>{c.mine ? '退出教派' : '加入教派 ✋'}</Btn></div>}
    </Panel>
  );
}

/** 黑帮要杀一个邻座：等另一边的邻座同意。 */
function GangPanel({ s, act, g }) {
  const k = s.gangAsk;
  const secs = useCountdown(k.until);
  const nm = (id) => `${g(id)?.seat}号 ${g(id)?.name}`;
  return (
    <Panel title="黑帮" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      <p className="lead">黑帮 <b>{nm(k.by)}</b> 想杀掉 <b>{nm(k.target)}</b>，要 <b>{nm(k.other)}</b> 同意。</p>
      {k.other === s.me ? <div className="btn-row"><Btn kind="primary" onClick={() => act('gangAgree', { yes: true })}>同意</Btn><Btn onClick={() => act('gangAgree', { yes: false })}>不同意</Btn></div>
        : <p className="muted">等 {nm(k.other)} 表态（到时间没表态就算不同意）。</p>}
    </Panel>
  );
}

/** 诡诈杰克：选找哪位说书人拿信息（甲 / 乙，一真一假，不知道哪位说真话）。随时能换，下一次拿信息时生效。 */
function KnavesPick({ me, act }) {
  const pick = me.knaves.pick;
  return (
    <div className="btn-row knaves-pick" title="诡诈杰克：两位说书人一真一假。能力给的信息由你选的那位给，随时能换">
      <span className="muted">找说书人</span>
      {['A', 'B'].map((k) => <Btn key={k} kind={pick === k ? 'primary' : 'secondary'} onClick={() => act('knaves', { pick: k })}>{k === 'A' ? '甲' : '乙'}</Btn>)}
    </div>
  );
}

/** 解谜大师：猜谁是被弄醉的那个人（每局一次，结果只告诉他自己）。 */
function PuzzleForm({ s, act, onClose }) {
  const [target, setTarget] = useState('');
  const send = async () => { if (await act('puzzle', { target })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>解谜大师 · 猜谁醉了</h3>
      <p className="muted">每局只能猜一次。猜对了，说书人告诉你谁是恶魔；猜错了，说书人告诉你一个不是恶魔的人。说书人不会说你猜没猜对。</p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="猜谁是醉酒的人">
        <option value="">选一名玩家</option>
        {s.players.filter((p) => p.id !== s.me).map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.name}</option>)}
      </select>
      <div className="btn-row"><Btn kind="primary" disabled={!target} onClick={send}>就猜他</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

/** 戏法师：公开猜每个人是恶魔、爪牙还是都不是。每人每天一次；真戏法师全猜对（所有恶魔和爪牙，死了的也算），善良获胜。 */
function AlsaahirForm({ s, act, onClose }) {
  const [pick, setPick] = useState({}); // id → 'demon' | 'minion'
  const demons = Object.keys(pick).filter((id) => pick[id] === 'demon');
  const minions = Object.keys(pick).filter((id) => pick[id] === 'minion');
  const send = async () => { if (await act('alsaahir', { demons, minions })) onClose(); };
  const set = (id, v) => setPick((p) => ({ ...p, [id]: p[id] === v ? undefined : v }));
  return (
    <div className="gossip-form">
      <h3>戏法师 · 猜恶魔和爪牙</h3>
      <p className="muted">全场都会看到你的猜测。要把所有恶魔（死了的也算）和所有爪牙都点对、不能多点：只有真戏法师猜对，善良才直接获胜。每人每天一次。</p>
      <ul className="alsaahir-list">
        {s.players.filter((p) => !p.traveller).map((p) => (
          <li key={p.id}>
            <span>{p.seat}号 {p.name}{p.alive ? '' : '（已死亡）'}</span>
            <span className="btn-row">
              <Btn kind={pick[p.id] === 'demon' ? 'primary' : 'secondary'} onClick={() => set(p.id, 'demon')}>恶魔</Btn>
              <Btn kind={pick[p.id] === 'minion' ? 'primary' : 'secondary'} onClick={() => set(p.id, 'minion')}>爪牙</Btn>
            </span>
          </li>
        ))}
      </ul>
      <div className="btn-row"><Btn kind="primary" disabled={!demons.length} onClick={send}>公开猜（{demons.length} 恶魔 · {minions.length} 爪牙）</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

/** 公开猜谁是落难少女：每人每局一次。只有爪牙的第一次猜测算数（爪牙合计一次），猜中邪恶获胜。 */
function DamselForm({ s, act, onClose }) {
  const [target, setTarget] = useState('');
  const send = async () => { if (await act('damsel', { target })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>猜落难少女</h3>
      <p className="muted">全场都会看到你猜的是谁。只有爪牙猜才算数，爪牙合计只有一次机会：猜中了邪恶获胜，猜错了爪牙就再没有机会。每人每局只能猜一次。</p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="猜谁是落难少女">
        <option value="">选一名玩家</option>
        {s.players.filter((p) => p.id !== s.me).map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.name}</option>)}
      </select>
      <div className="btn-row"><Btn kind="primary" disabled={!target} onClick={send}>公开猜</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

function DeclareForm({ s, act, onClose }) {
  const [role, setRole] = useState('');
  const mad = s.self?.madness;
  const send = async () => { if (await act('declare', { role })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>公开声明</h3>
      <p className="muted">全场都会看到「我是某个角色」。{mad && !mad.claimed ? `你今天要证明自己是${mad.role}。` : '每天最多两次。'}</p>
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="声明的角色">
        <option value="">选一个角色</option>
        {scriptRoles(s.script).map((r) => <option key={r} value={r}>{ROLE_DEFS[r].name}</option>)}
      </select>
      <div className="btn-row"><Btn kind="primary" disabled={!role} onClick={send}>公开声明</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

function JuggleForm({ s, act, onClose }) {
  const [rows, setRows] = useState([{ target: '', role: '' }]);
  const put = (i, k, v) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const ready = rows.filter((x) => x.target && x.role);
  const send = async (guesses) => { if (await act('juggle', { guesses })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>公开猜测</h3>
      <p className="muted">最多猜 5 次，每次一名玩家和一个角色，全场都看得到。只能猜一轮。也可以只声明自己是杂耍艺人、一个都不猜，当晚得知 0。</p>
      {rows.map((x, i) => (
        <div className="juggle-row" key={i}>
          <select value={x.target} onChange={(e) => put(i, 'target', e.target.value)} aria-label={`第 ${i + 1} 个猜测的玩家`}>
            <option value="">选玩家</option>
            {s.players.map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.name}</option>)}
          </select>
          <select value={x.role} onChange={(e) => put(i, 'role', e.target.value)} aria-label={`第 ${i + 1} 个猜测的角色`}>
            <option value="">选角色</option>
            {scriptRoles(s.script).map((r) => <option key={r} value={r}>{ROLE_DEFS[r].name}</option>)}
          </select>
        </div>
      ))}
      <div className="btn-row">
        {rows.length < 5 && <Btn onClick={() => setRows([...rows, { target: '', role: '' }])}>再猜一个</Btn>}
        <Btn kind="primary" disabled={!ready.length} onClick={() => send(ready)}>公开猜测</Btn>
        <Btn onClick={() => send([])} title="公开说自己是杂耍艺人，一个都不猜">只声明，不猜</Btn>
        <Btn onClick={onClose}>取消</Btn>
      </div>
    </div>
  );
}

/**
 * 被提名、还没开始投票：谁都可以公开说自己是哥布林（窃窃私语）。只有真哥布林当天被处决才算数，别人说了只是一句话。
 * 提名阶段右栏换成了提名面板，SnvButtons 不显示，所以单独放在提名面板下面。点两下才发出去。
 */
function GoblinClaim({ act }) {
  const [sure, setSure] = useState(false);
  return (
    <Panel title="被提名了" tone="phy">
      <p className="lead">可以在投票开始前公开声明「我是哥布林」：如果你真是哥布林、今天又被处决，你的阵营获胜。不是哥布林的话，这只是一句话。</p>
      <div className="btn-row">
        {sure
          ? <><Btn kind="primary" onClick={() => act('goblin')}>确定公开声明</Btn><Btn kind="ghost" onClick={() => setSure(false)}>算了</Btn></>
          : <Btn onClick={() => setSure(true)}>我是哥布林</Btn>}
      </div>
    </Panel>
  );
}

/** 确认一下再做（每局一次的能力、公开的声明）。 */
function Confirm({ title, text, ok, onOk, onClose }) {
  const go = async () => { if (await onOk()) onClose(); };
  return (
    <div className="gossip-form">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      <div className="btn-row"><Btn kind="primary" onClick={go}>{ok}</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

function AmnesiacForm({ act, onClose }) {
  const [text, setText] = useState('');
  const send = async () => { if (await act('amnesiac', { text })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>猜我的能力</h3>
      <p className="muted">每个白天猜一次，可以很具体，也可以只问个方向。说书人只回答四档：无关、有关、接近、完美。</p>
      <textarea value={text} maxLength={120} rows={3} placeholder="比如：我是不是每晚会得知一个数字？" onChange={(e) => setText(e.target.value)} />
      <div className="btn-row"><Btn kind="primary" disabled={!text.trim()} onClick={send}>猜</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

function ArtistForm({ act, onClose }) {
  const [text, setText] = useState('');
  const send = async () => { if (await act('artist', { text })) onClose(); };
  return (
    <div className="gossip-form">
      <h3>问说书人一个是非问题</h3>
      <p className="muted">答案是「是」「不是」或「我不知道」，只有你看得到。每局只能问一次，问得含糊也算用掉。</p>
      <textarea value={text} maxLength={120} rows={3} placeholder="比如：3 号是恶魔吗？" onChange={(e) => setText(e.target.value)} />
      <div className="btn-row"><Btn kind="primary" disabled={!text.trim()} onClick={send}>提问</Btn><Btn onClick={onClose}>取消</Btn></div>
    </div>
  );
}

/** 这个人今天要做的疯狂：被洗脑的要证明自己是某个角色；畸形秀演员不能让人相信自己是外来者。 */
const madnessGoal = (me) => (me.madness
  ? <>今天你要<b>真心实意</b>地让大家相信你是<b>{me.madness.role}</b>，不然可能被处决。暗示自己是被逼的、敷衍、故意聊爆，都算没有疯狂。<b>别人说你被洗脑了、或者有人也跳了{me.madness.role}，要马上站出来否认、和他争</b>——不吭声就等于默认，会被处决。</>
  : <>你是畸形秀演员：<b>不能让大家相信你是外来者</b>，不然可能被处决。暗示、故意说漏也算。</>);

function MadnessPanel({ me }) {
  // 2026-11-11 起没有通用的「公开声明」了：疯狂只靠后台听语音（广场机器人、收音页）
  const plain = soloMode ? '单机试玩没有语音，说书人会按局势判定你够不够疯狂。' : me.hearing ? '在广场上说，说书人听得到。' : '说书人现在听不到语音，会按局势判定你够不够疯狂。';
  return (
    <Panel title="疯狂" tone="psy" className="moonchild-pnl">
      <p className="lead">{madnessGoal(me)}{!me.mic ? plain : me.micOn ? '收音开着，说书人听得到你。' : '要打开收音，说书人才听得到你。别人不知道你开了。'}</p>
      {me.mic && !me.micOn && <div className="btn-row"><Btn kind="primary" onClick={() => openMic(me.mic)}>打开收音</Btn></div>}
    </Panel>
  );
}

/** 被洗脑的各条注意事项（2026-11-20 用户：被洗脑之后屏幕上要显示被洗脑的各个注意事项）。弹窗和画面上的小牌子共用。 */
function MadnessRules({ me }) {
  const role = me.madness.role;
  return (
    <ol className="mad-rules">
      <li><b>目标</b>：今天要<b>真心实意、尽最大努力</b>让大家相信你就是<b>{role}</b>——给理由、讲你拿到的信息和做过的事、回应别人的质疑、一直坚持这个说法。</li>
      <li className="must"><b>不能默许</b>：有人说你被洗脑了、问你「是不是疯了」，要<b>马上坚决否认</b>；有人也跳了{role}，要<b>站出来和他争</b>，坚持你才是。不吭声就等于默认自己被洗脑，<b>会被处决</b>。说书人第一次遇到时会私下提醒你一次。</li>
      <li><b>这些都算没有疯狂</b>：只干巴巴说一句就转去聊别的；阴阳怪气、敷衍、故意演砸、笑场；暗示自己是被逼的（「懂的都懂」「我只能说我是……」「你们自己理解」）；故意聊爆、说出自己真正的角色。</li>
      <li><b>说书人怎么听</b>：{me.mic ? <>打开收音页，说书人在哪都听得到你{me.micOn ? <>（<b>现在开着</b>）</> : <>（<b>现在没开</b>，不开很可能被处决）</>}。</> : me.hearing ? '在广场上说，机器人听得到；进屋里私聊时听不到。' : '说书人现在听不到语音，会按局势判定你够不够疯狂。'}</li>
      <li><b>死了也一样</b>：死人破坏疯狂照样会被处决（算当天的处决）。</li>
    </ol>
  );
}

/**
 * 刚被洗脑：先弹一张须知卡，点「我知道了」才关（这次洗脑记在本机，刷新不再弹）；之后画面上一直挂一个「你被洗脑了 · 须知」的小牌子，点开再看。
 * 要开收音的，卡片上直接有「打开收音」。
 */
function MadnessBrief({ me, gameId }) {
  const key = me?.madness ? `botc-mad-${gameId}-${me.madness.role}-${me.madness.night ?? ''}` : null;
  const seen = () => { try { return !!key && localStorage.getItem(key) === '1'; } catch { return false; } };
  const [open, setOpen] = useState(() => !!key && !seen());
  useEffect(() => { if (key && !seen()) setOpen(true); }, [key]);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener(MAD_OPEN, f); return () => window.removeEventListener(MAD_OPEN, f); }, []);
  if (!me?.madness) return null;
  const close = () => { try { localStorage.setItem(key, '1'); } catch { /* 隐私模式 */ } setOpen(false); };
  return <>
    <MadChip me={me} loose />{/* 有存活条时这个藏起来，用存活条上面那个 */}
    {open && createPortal(
      <div className="sheet-bg gossip-bg" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="gossip-modal mad-brief" role="alertdialog" aria-label="你被洗脑了">
          <span className="mad-kicker">疯狂</span>
          <h3>你被洗脑了：你是「{me.madness.role}」</h3>
          <MadnessRules me={me} />
          <div className="btn-row">
            {me.mic && !me.micOn && <Btn kind="primary" onClick={() => openMic(me.mic)}>打开收音</Btn>}
            <Btn kind={me.mic && !me.micOn ? 'secondary' : 'primary'} onClick={close}>我知道了</Btn>
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>;
}

/** 为什么所有人都要开收音：灵言师听关键词，将军、政客要听大家的发言判局势和责任。 */
export function listenReason(why = ['mezepheles']) {
  const parts = [];
  if (why?.includes('mezepheles')) parts.push(<>有<b>灵言师</b>：说书人要听大家说的话，才知道谁说出了他的关键词。</>);
  if (why?.includes('general')) parts.push(<>有<b>将军</b>：说书人要听大家的发言，判断现在哪一方在赢。</>);
  if (why?.includes('politician')) parts.push(<>有<b>政客</b>：终局时说书人要按整局的发言，判断谁对本方落败负最大责任。</>);
  return <>这个剧本里{parts.map((x, i) => <span key={i}>{x}</span>)}</>;
}

/** 被洗脑、或者是畸形秀演员时，屏幕中间要求开收音：传上来第一句话就自己消失。可以先收起来，右边的「疯狂」面板还能打开。 */
function MicDemand({ me, day }) {
  const [later, setLater] = useState(null); // 今天点过「等会儿再开」（令牌整局不变，按天记，第二天再提醒）
  const [opened, setOpened] = useState(false);
  if (!me?.mic || me.micOn || later === `${me.mic}-${day}` || me.madness) return null; // 被洗脑的：MadnessBrief 的须知卡里有「打开收音」
  return createPortal(
    <div className="sheet-bg gossip-bg" role="presentation">
      <div className="gossip-modal mic-demand" role="alertdialog" aria-label="打开收音">
        <h3>{me.madness ? '你被洗脑了' : '说书人要听你说话'}</h3>
        <p className="lead">{me.micWhy === 'listen' ? <>{listenReason(me.listenWhy)}所以每个人都会收到这个提示。<b>你不用证明任何东西</b>，正常玩、正常说话就好；开着收音页，说书人才听得到你。</>
          : me.micWhy === 'pixie' ? <>你是小精灵：如果你<b>疯狂地证明自己就是{me.pixie?.role}</b>，等他死了你就获得他的能力（不证明也不会被罚）。</> : madnessGoal(me)}
          说书人只听得到收音{me.madness ? '，不开收音很可能被处决' : ''}。</p>
        <p className="muted">{opened ? '在打开的页面里点「开始收音」，这里就会关掉。收音页开着就行，晚上会自动暂停，第二天接着收，不用重开。' : '别人不知道你开了。录音和转写会保存下来（复盘和改进说书人用），转出的文字会发给 AI 说书人判断。'}</p>
        <div className="btn-row">
          <Btn kind="primary" onClick={() => { setOpened(true); openMic(me.mic); }}>{opened ? '再打开一次' : '打开收音'}</Btn>
          <Btn onClick={() => setLater(`${me.mic}-${day}`)}>等会儿再开</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function KlutzPanel({ s, act }) {
  const [t, setT] = useState(null);
  const alive = s.players.filter((p) => p.alive && p.id !== s.me).map((p) => p.id);
  return (
    <Panel title="呆瓜" tone="psy" className="moonchild-pnl">
      <p className="lead">你得知了自己的死亡。<b>公开选择一名存活的玩家</b>——如果他是邪恶的，你的阵营落败。</p>
      <Picker s={s} options={alive} picked={t ? [t] : []} onTap={(p) => setT(p.id)} />
      <div className="btn-row"><Btn kind="primary" disabled={!t} onClick={() => act('klutz', { target: t })}>公开选择</Btn></div>
    </Panel>
  );
}

function GossipForm({ s, act, onClose }) {
  // 服务器配了 AI 判定：可以自由说一句话（默认选这个）；没配就只能用固定句式
  const free = !!s.self?.gossipFree;
  const kinds = free ? [['free', '自由说一句话（AI 判真假）', false, false], ...STATEMENTS] : STATEMENTS;
  const [kind, setKind] = useState(free ? 'free' : 'role');
  const [target, setTarget] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const spec = kinds.find((x) => x[0] === kind);
  const roles = rolesOf(s.script);
  const ok = kind === 'free' ? !!text.trim() : (!spec[2] || target) && (!spec[3] || role);
  const send = async () => { if (await act('gossip', { statement: kind === 'free' ? { kind, text } : { kind, target: target || null, role: role || null } })) onClose(); };
  return (
    <div className="gossip-form">
      <p className="muted">声明会公开播报给所有人。只有真造谣者的声明为真时，今晚会有一人死亡。</p>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      {kind === 'free' && (
        <textarea value={text} maxLength={120} rows={3} placeholder="比如：我们之中有两个爪牙 / 5号 昨晚没有醒来 / 3号 和 6号 至少有一个是邪恶的" onChange={(e) => setText(e.target.value)} />
      )}
      {spec[2] && (
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">选一名玩家</option>
          {s.players.map((p) => <option key={p.id} value={p.id}>{p.seat}号 {p.name}</option>)}
        </select>
      )}
      {spec[3] && (
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">选一个角色</option>
          {roles.map((id) => <option key={id} value={id}>{ROLE_NAMES[id]}</option>)}
        </select>
      )}
      <div className="btn-row">
        <Btn kind="primary" disabled={!ok} onClick={send}>公开声明</Btn>
        <Btn kind="ghost" onClick={onClose}>取消</Btn>
      </div>
    </div>
  );
}

/** 月之子得知自己死亡：公开选一名存活玩家。 */
function MoonchildPanel({ s, act, fake }) {
  const [t, setT] = useState(null);
  const alive = s.players.filter((p) => p.alive && p.id !== s.me).map((p) => p.id);
  return (
    <Panel title={fake ? '公开选人' : '月之子'} tone="psy" className="moonchild-pnl">
      <p className="lead">{fake
        ? <>你死了。想让大家以为你是{inScript('klutz', s.script) && inScript('moonchild', s.script) ? '月之子或呆瓜' : inScript('klutz', s.script) ? '呆瓜' : '月之子'}的话，可以<b>公开选择一名存活的玩家</b>，大家看到的和真的一样，但不会有任何效果。不想选就点「不选」。</>
        : <>你得知了自己的死亡。<b>公开选择一名存活的玩家</b>——如果他是善良的，今晚他会死。别人也可能假装选人，所以大家不能确定你的身份。</>}</p>
      <Picker s={s} options={alive} picked={t ? [t] : []} onTap={(p) => setT(p.id)} />
      <div className="btn-row"><Btn kind="primary" disabled={!t} onClick={() => act('moonchild', { target: t })}>公开选择</Btn>{fake && <Btn onClick={() => act('moonchildSkip')}>不选</Btn>}</div>
    </Panel>
  );
}

/** 「传奇·旅行者」页：这个剧本的传奇角色（全场规则）和旅行者（开局后来的人用的角色），各自是什么、怎么玩。 */
function ExtrasInfo({ s }) {
  const fab = fabledOf(s.script);
  const trs = travellersOf(s.script);
  const joined = s.players.filter((p) => p.traveller);
  return (
    <section className="extras">
      <h4>传奇角色</h4>
      <p className="muted">传奇角色不是哪个玩家的身份，是说书人给这一局加的全场规则（集石百科）：没人拿这张牌，它不会死、不会醉酒中毒；说书人会告诉大家加了哪些，但不会说它这局具体造成了什么。</p>
      {fab.length ? fab.map((id) => (
        <div key={id} className="ex-card"><b>{FABLED[id].name}{!isEn && <i>{FABLED[id].en}</i>}</b><p>{FABLED[id].ability}</p><p className="muted">{FABLED[id].detail}</p></div>
      )) : <p>这个剧本没有传奇角色。</p>}
      <h4>旅行者</h4>
      <p className="muted">给开局后才来、或者要提前走的人用的角色（集石百科）。</p>
      {!trs.length && <p>这个剧本发布时没有列旅行者，所以这局不开：开局后来的人只能观战。下面是有旅行者的剧本（暗流涌动、黯月初升、梦殒春宵等）的规则。</p>}
      <ul>
        <li>观战的人随时可以加入（存活玩家 7 人以上时），坐在圈的最后；夜里加入的下一晚才行动。</li>
        <li>角色公开，阵营由说书人决定（大多是善良）；邪恶旅行者会得知恶魔是谁。</li>
        <li>不能被提名处决，只能被「流放」：任何人（死人也行）都能提议，所有人举手，过所有玩家的一半就流放。流放不是处决，角色能力挡不住。</li>
        <li>随时可以自己离开；「只剩两人」不算旅行者。</li>
      </ul>
      {joined.length > 0 && <p>这局加入的旅行者：{joined.map((p) => `${p.seat}号 ${p.name}（${p.travellerRole}${p.left ? '，已离开' : p.alive ? '' : '，已出局'}）`).join('、')}</p>}
      {trs.length ? trs.map((id) => (
        <div key={id} className="ex-card"><b>{ROLE_DEFS[id].name}{!isEn && <i>{ROLE_DEFS[id].en}</i>}</b><p>{ROLE_DEFS[id].ability}</p></div>
      )) : null}
    </section>
  );
}

/** 赛后 MVP 投票（2026-11-18 用户）：这局的真人每人一票，不能投自己；都投完或 90 秒后公布。 */
function MvpVote({ s, act, g }) {
  const m = s.mvp;
  const secs = useCountdown(m?.until);
  if (!m) return null;
  if (m.result) {
    return <div className="mvp-box"><p className="mvp-result">🏆 本局 MVP：{m.result.ids.length ? m.result.ids.map((id) => `${g(id)?.seat ?? ''}号 ${g(id)?.name ?? ''}`).join('、') : '没有人投票'}{m.result.votes ? `（${m.result.votes} 票）` : ''}</p></div>;
  }
  return (
    <div className="mvp-box">
      <p className="lead"><b>投一票选 MVP</b>：这局谁表现最好？（不能投自己）{secs != null && <span className="muted"> · 还有 {secs} 秒 · 已投 {m.count}/{m.need}</span>}</p>
      {m.canVote ? (
        <div className="mvp-picks">
          {s.players.filter((p) => p.id !== s.me && !p.left).map((p) => (
            <button key={p.id} type="button" className={`mvp-pick ${m.mine === p.id ? 'on' : ''}`} aria-pressed={m.mine === p.id} onClick={() => act('mvp', { target: p.id })}>
              <Portrait p={p} size={26} speak={false} /><span>{p.seat}号 {p.name}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted">这局的玩家正在投票……</p>}
    </div>
  );
}

export function Picker({ s, options, picked, onTap }) {
  return (
    <div className="picker">
      {options.map((id) => {
        const p = id === 'storyteller' ? ST_FACE : s.players.find((x) => x.id === id); // 有无神论者的剧本：说书人也能选
        if (!p) return null;
        const on = picked.includes(id);
        return (
          <button key={id} type="button" className={`pick ${on ? 'on' : ''} ${p.alive ? '' : 'dead'}`} onClick={() => onTap(p)}>
            <Portrait p={p} size={34} frame={on ? 'var(--red)' : '#f4f4f0'} />
            <span>{p.id === 'storyteller' ? '说书人' : `${p.seat}号 ${p.id === s.me ? '你' : p.name}`}</span>
          </button>
        );
      })}
    </div>
  );
}

function Actions({ s, act, me, name, g, mode, setMode, picked, onTap, prompt, rk, pickSpec, confirm, pickedRole, setPickedRole, skip }) {
  const night = s.phase === 'night';
  const face = (id, label) => ({ ...g(id), label: label ?? name(id) });

  if (s.phase === 'ended') {
    const good = s.winner?.team === 'good';
    return (
      <Panel title={good ? '善良获胜' : '邪恶获胜'} tone={good ? 'int' : 'phy'}>
        <p className="lead">{s.winner?.reason}</p>
        <p className="muted">魔典已经公开，每个人的真实身份写在肖像下面。</p>
        {s.isHost && <div className="btn-row"><Btn kind="primary" onClick={() => act('end')}>再来一局</Btn></div>}
        <AfterGame s={s} />{/* 赛后总结 + 军事法庭，下面是 MVP 投票（2026-11-19 用户：放在一起） */}
        <MvpVote s={s} act={act} g={g} />
        {s.timeline?.length > 0 ? <Replay timeline={s.timeline} /> : s.journal?.length > 0 && (
          <details className="st-journal">
            <summary>说书人手记 · {s.journal.length} 条判定</summary>
            <ul>{s.journal.map((j, i) => <li key={i}><span className="stamp-time">{j.when}</span>{j.text}</li>)}</ul>
          </details>
        )}
      </Panel>
    );
  }

  if (me?.chair) return <ChairPanel s={s} me={me} act={act} />; // 抢椅子（Will 版）：入夜前换座位

  if (rk || prompt) {
    const roleId = rk ? 'ravenkeeper' : prompt.roleId;
    const v = voiceOf(roleId, ROLE_NAMES);
    if (prompt?.waiting) {
      return (
        <Panel title={v.who} tone={teamTone(roleId)} extra={<Check color={v.color}>{v.skill}</Check>}>
          <p className="lead">等疯子先行动……他选完，你会知道他选了谁，然后轮到你。</p>
        </Panel>
      );
    }
    if (prompt?.roleId === 'organgrinder') { // 街头风琴手：点头或摇头
      return (
        <Panel title="街头风琴手" tone="phy">
          <p className="lead">今晚要不要<b>醉酒到下个黄昏</b>？</p>
          <p className="muted">清醒：明天大家闭眼投票，票数和结果都保密，黄昏才宣布处决谁。醉酒：明天投票照常睁眼、公开票数。</p>
          <div className="btn-row">
            <Btn kind="primary" onClick={() => act('choose', { night: prompt.night, targets: [], role: 'og_sober' })}>保持清醒</Btn>
            <Btn onClick={() => act('choose', { night: prompt.night, targets: [], role: 'og_drunk' })}>醉酒到黄昏</Btn>
          </div>
        </Panel>
      );
    }
    if (prompt?.roleId === 'ah_choice') { // 哈迪寂亚选中了你：悄悄选活还是死
      return (
        <Panel title="哈迪寂亚选中了你" tone="phy">
          <p className="lead">恶魔选了你和另外两个人。悄悄决定：活下去，还是死去。如果三个人最后都活着，三个人一起死。</p>
          <p className="muted">死了的人选「活下去」会复活。别人只会在天亮时知道这三个人谁活着。</p>
          <div className="btn-row">
            <Btn kind="primary" onClick={() => act('choose', { night: prompt.night, targets: [], role: 'ah_live' })}>活下去</Btn>
            <Btn onClick={() => act('choose', { night: prompt.night, targets: [], role: 'ah_die' })}>死去</Btn>
          </div>
        </Panel>
      );
    }
    const needRole = !!prompt?.pickRole;
    const ready = picked.length === pickSpec.count && (!needRole || pickedRole);
    const hint = rk ? '你在今晚死去了。选一个人，乌鸦会告诉你他的身份。'
      : [pickSpec.count ? `选择 ${cnNum(pickSpec.count)} 名玩家` : '', needRole ? (pickSpec.count ? '，再选一个角色' : '选择一个角色') : '', '。', prompt?.optional ? '也可以今晚不用。' : ''].join('');
    return (
      <Panel title={v.who} tone={teamTone(roleId)} className="choose-pnl" extra={<Check color={v.color}>{v.skill}</Check>}>
        <p className="flavor-line">「{rk ? FLAVOR.ravenkeeper.wake : v.flavor?.wake}」</p>
        {prompt?.lunaticPick && <p className="lead lunatic-pick">{prompt.lunaticPick}</p>}
        {me?.knaves && <KnavesPick me={me} act={act} />}
        <p className="lead">{hint}</p>
        {roleId === 'imp' && <p className="muted">也可以选你自己：你会死去，一个活着的爪牙接任小恶魔（官方规则的"自杀传位"）。想空刀就选一名已经死了的玩家：今晚没人死。</p>}
        {roleId === 'po' && pickSpec.count === 3 && <p className="muted">你上次没有选人：今晚要选三名玩家。</p>}
        {pickSpec.count > 0 && <Picker s={s} options={pickSpec.options} picked={picked} onTap={onTap} />}
        {needRole && <RolePicker ids={prompt.roleOptions} value={pickedRole} onPick={setPickedRole} />}
        <div className="btn-row">
          <Btn kind="primary" disabled={!ready} onClick={confirm}>确认</Btn>
          {prompt && (prompt.optional || prompt.options.length < prompt.count) && <Btn kind="ghost" onClick={skip}>{prompt.optional ? '今晚不用' : '没得选，跳过'}</Btn>}
        </div>
      </Panel>
    );
  }

  if (night) {
    const chosen = me?.prompt?.chosen;
    const chosenRole = me?.prompt?.chosenRole;
    return (
      <Panel title="夜晚" tone="dark">
        <p className="flavor-line">「当，当，当。整座镇子都睡了。」</p>
        <p className="lead">
          {chosen ? (chosen.length || chosenRole ? `你选了 ${[chosen.map(name).join('、'), chosenRole ? `角色「${ROLE_NAMES[chosenRole]}」` : ''].filter(Boolean).join('，')}。闭上眼睛，等天亮。` : '你今晚没有使用能力。闭上眼睛，等天亮。')
            : s.isST ? '夜里的选择和结算都在「魔典」面板里。'
              : me && !me.alive ? '你已经死了，但还在这座镇子里。' : '闭上眼睛，等天亮。'}
        </p>
        {me?.knaves && <KnavesPick me={me} act={act} />}
        {s.isHost && !s.isST && <div className="btn-row"><Btn onClick={() => act('dawn')}>立刻天亮</Btn></div>}
        <TravellerJoin s={s} act={act} />
      </Panel>
    );
  }

  // 停在别的选人模式（开枪、扔东西……）里被提名了：「我是哥布林」也照样显示，不被选人面板盖住
  const goblinClaim = s.pendingNom && me?.canGoblin ? <GoblinClaim act={act} /> : null;
  if (mode === 'pelt') return <>{goblinClaim}<PeltPanel s={s} act={act} onClose={() => setMode(null)} /></>;
  if (mode) {
    const M = MODES[mode];
    return (
      <>{goblinClaim}<Panel title={M.title} tone="mot">
        <p className="lead">{M.hint}</p>
        {/* 手机上面板盖住了广场：直接在名单里点人（电脑上点广场上的肖像） */}
        <div className="dock-picker"><Picker s={s} options={pickSpec.options} picked={picked} onTap={onTap} /></div>
        <Picked picked={picked} name={name} need={1} />
        <div className="btn-row">
          <Btn kind="primary" disabled={!picked.length} onClick={confirm}>{M.confirm}</Btn>
          <Btn kind="ghost" onClick={() => setMode(null)}>取消</Btn>
        </div>
      </Panel></>
    );
  }

  // 诸神黄昏：倒下的人正在决定开不开枪。自己倒下了就先开枪（自由活动也让路）；别人在自由活动时照常活动，看公告
  if (s.ragShot && (s.ragShot.mine || !s.roam)) return <RagShotPanel s={s} act={act} g={g} />;
  if (s.exile) return <ExilePanel s={s} act={act} g={g} />; // 流放举手：自由活动时也要能举
  if (s.cult) return <CultPanel s={s} act={act} g={g} />; // 异教领袖的教派举手：自由活动时也要能举
  if (s.gangAsk) return <GangPanel s={s} act={act} g={g} />;
  if (s.butcher) return <ButcherPanel s={s} act={act} g={g} />;
  if (s.roam) return <RoamActions s={s} act={act} name={name} face={face} setMode={setMode} />;

  if (s.transit) return <TransitCard s={s} />;

  const myRoom = s.rooms.find((r) => r.mine);
  const roomCard = myRoom && (
    <Panel title="密室" tone="psy">
      <p className="lead">你正在和 {myRoom.members.filter((x) => x !== s.me).map(name).join('、') || '说书人'} 单独谈话。</p>
      <div className="btn-row"><Btn onClick={() => act('endWhisper', { room: myRoom.id })}>结束谈话</Btn></div>
    </Panel>
  );

  if (s.vote) {
    const raised = s.vote.yes.includes(s.me);
    const locked = s.vote.locked.includes(s.me);
    const can = me && (me.alive || me.ghostVote);
    return (
      <Panel title="投票" tone="phy" extra={<span className="muted">指针离开你时锁定</span>}>
        <Faces people={[face(s.vote.nominator, `${g(s.vote.nominator)?.seat}号 提名`), face(s.vote.nominee, `${g(s.vote.nominee)?.seat}号 被提名`)]} />
        <div className="stats">
          {s.vote.secret ? <Stat value="?" label="闭眼投票 · 票数保密" color="var(--opt)" /> : s.vote.hidden ? <Stat value="?" label="票数投完公开" color="var(--opt)" /> : <Stat value={s.vote.yes.length} label="举手" color="var(--opt)" />}
          <Stat value={s.threshold} label="需要" color="var(--cream)" />
          {s.blockVotes > 0 && <Stat value={s.blockVotes} label="台上" color="var(--phy)" />}
        </div>
        {me && (locked
          ? <p className="lead">{raised ? '你举了手。票已锁定。' : '你没有举手。票已锁定。'}</p>
          : !can ? <p className="lead">你的幽灵票已经用掉了。</p>
            : (<>
              <p className="muted dock-hand-hint">{raised ? '你举着手（在画面中间可以放下）。' : '赞成处决就点画面中间的「举手」。'}</p>
              {/* 手机上面板盖住了画面中间：在这里也能举手、放下（电脑上不显示） */}
              <div className="btn-row dock-hand"><Btn kind={raised ? 'secondary' : 'primary'} onClick={() => act('hand', { up: !raised })}>{raised ? '放下手' : '举手 ✋'}</Btn></div>
            </>))}
        <VoteTrack s={s} />
        <JudgeButtons s={s} act={act} />
        {me && !me.alive && me.ghostVote && !locked && <p className="muted">你是鬼魂，只剩一张幽灵票。</p>}
      </Panel>
    );
  }

  if (s.boom) return <><BoomPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.exile) return <><ExilePanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.cult) return <><CultPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.gangAsk) return <><GangPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.butcher) return <><ButcherPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.rps) return <><RpsPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.riot) return <><RiotPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.pendingNom) return <><NomStage s={s} act={act} g={g} name={name} face={face} />{me?.canGoblin && <GoblinClaim act={act} />}<JudgeButtons s={s} act={act} /><GnomeButton s={s} act={act} g={g} />{roomCard}</>;

  const meP = g(s.me);
  const lastDay = [...s.log].reverse().find((l) => l.kind === 'day' || l.kind === 'death');
  return (
    <>
      {roomCard}
      <Panel title={s.dayStage === 'morning' ? '清晨' : s.noms ? '提名' : '广场'} tone="light" className="square-pnl"
        extra={s.noms && !s.noms.timeUp ? <NomClock until={s.noms.until} /> : null}>
        {s.dayStage === 'morning' && lastDay && <p className="lead"><Line text={lastDay.text} /></p>}
        {s.riotScript ? (
          <div className="sq-board">
            <div><b>{s.aliveCount}</b><small>存活</small></div>
            <div><b>第 {s.day} 天</b><small>{s.day >= 3 ? '今天必须提名' : '第三天结束邪恶赢'}</small></div>
            <div className="hot"><b>当场死</b><small>被提名 · 不投票</small></div>
          </div>
        ) : (
          <div className="sq-board">
            <div><b>{s.aliveCount}</b><small>存活</small></div>
            <div><b>{s.threshold}</b><small>处决需要</small></div>
            <div className={s.block ? 'hot' : ''}><b>{s.block ? `${g(s.block)?.seat}号` : '—'}</b><small>{s.block ? `台上 · ${s.blockVotes} 票` : s.blockVotes ? '平票' : '处决台空着'}</small></div>
          </div>
        )}
        {s.riotScript && s.noms && !s.noms.timeUp && <p className="muted">暴乱在场：你提名谁，谁就当场死亡，然后由他接着提名。</p>}
        {s.noms && <p className="sq-status">{s.noms.timeUp ? (s.riotScript ? '提名结束 · 准备入夜' : '提名结束 · 投完这轮入夜') : `已表态 ${s.noms.done} / ${s.aliveCount}`}</p>}
        <GossipButton s={s} act={act} />
        <SlayButton s={s} setMode={setMode} />
        {!s.noms && <PsychoButton s={s} setMode={setMode} />}
        <PeltButton s={s} setMode={setMode} />
        <TravellerActions s={s} act={act} setMode={setMode} />
        <TravellerJoin s={s} act={act} />
        <SnvButtons s={s} act={act} />
        {s.executedToday && <p className="sq-status">今天的处决已经发生</p>}
        <div className="btn-row">
          {me?.alive && !s.executedToday && !meP?.nominator && !s.noms?.timeUp && (s.noms || s.settings?.mode === 'human') && <Btn kind="primary" onClick={() => setMode('nominate')}>提名</Btn>}
          {s.noms && !s.noms.timeUp && me?.alive && !meP?.nominator && !s.noms.skipped && <Btn onClick={() => act('skipNom')}>不提名</Btn>}
          {s.stNominable && !s.stNominated && me?.alive && !s.executedToday && !meP?.nominator && !s.noms?.timeUp && (s.noms || s.settings?.mode === 'human') && (
            <Btn onClick={() => act('nominate', { target: 'storyteller' })} title="有无神论者的剧本：可以提名说书人。处决了说书人，场上真有无神论者善良赢，没有就邪恶赢。">提名说书人</Btn>
          )}
        </div>
        <div className="link-row">
          {s.isHost && <button type="button" onClick={() => act('roam')}>再自由活动一次</button>}
          {s.isHost && <button type="button" onClick={() => act('dusk')}>结束白天{s.block ? `（处决 ${g(s.block)?.seat}号）` : ''}</button>}
        </div>
      </Panel>
    </>
  );
}

/** 裁缝与暴乱：有人被提名、当场死亡，正在想下一个提名谁。是自己就点人（第一、二天也可以不提名，今天就结束）；别人看倒计时。 */
function RiotPanel({ s, act, g }) {
  const r = s.riot;
  const secs = useCountdown(r.until);
  const who = g(r.id);
  const clock = secs != null ? <span className="nom-clock">{secs}</span> : null;
  if (!r.mine) {
    return (
      <Panel title="暴乱 · 提名链" tone="phy" extra={clock}>
        <p className="lead"><b>{who?.seat}号 {who?.name}</b> 被提名，当场死亡。{r.must ? '今天是第三天，他必须接着提名下一个人。' : '他可以接着提名下一个人；不提名，今天的提名就结束。'}</p>
      </Panel>
    );
  }
  const alive = s.players.filter((p) => p.alive && p.id !== s.me && !p.nominated);
  return (
    <Panel title="你倒下了 · 接着提名" tone="phy" extra={clock}>
      <p className="lead">{r.must ? '第三天：你必须提名一个人，他也会当场死亡。时间到了说书人替你提名。' : '点一个人提名他，他会当场死亡并接着提名。不提名，今天的提名就结束、入夜。'}</p>
      <div className="boom-picks">
        {alive.map((p) => (
          <button key={p.id} type="button" className="boom-pick" onClick={() => act('nominate', { target: p.id })}>
            <b>{p.seat}号</b><span>{p.name}</span>
          </button>
        ))}
      </div>
      {!r.must && <div className="btn-row"><Btn onClick={() => act('riotPass')}>不提名（今天结束）</Btn></div>}
    </Panel>
  );
}

/** 提名环节剩余时间。 */
/** 诸神黄昏：有人倒下了，正在决定开不开枪。是自己就选人（猎手）或等时间到（狼人）；别人只看到倒计时。 */
function RagShotPanel({ s, act, g }) {
  const r = s.ragShot;
  const secs = useCountdown(r.until);
  const who = g(r.id);
  const clock = secs != null ? <span className="nom-clock">{secs}</span> : null;
  if (!r.mine) return <Panel title="有人倒下了" tone="phy" extra={clock}><p className="lead"><b>{who?.seat}号 {who?.name}</b> 倒下了。如果他是猎手，可以开一枪带走一个人，打谁谁死。</p></Panel>;
  if (!r.canShoot) return <Panel title="你倒下了" tone="phy" extra={clock}><p className="lead">你是狼人，死了不能开枪。等时间到就好——大家看不出谁开不了枪。</p></Panel>;
  const alive = s.players.filter((p) => p.alive && p.id !== s.me);
  return (
    <Panel title="你倒下了 · 开一枪" tone="phy" extra={clock}>
      <p className="lead">打谁谁死。被你打死的如果也是猎手，他还能接着开枪。时间到才开枪，之前可以改。</p>
      <div className="boom-picks">
        {alive.map((p) => (
          <button key={p.id} type="button" className={`boom-pick ${r.target === p.id ? 'on' : ''}`} aria-pressed={r.target === p.id} onClick={() => act('ragShoot', { target: p.id })}>
            <b>{p.seat}号</b><span>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="btn-row"><Btn kind={r.target ? 'secondary' : 'primary'} onClick={() => act('ragShoot', { target: null })}>不开枪</Btn></div>
      <p className="muted">{r.target ? `你瞄准了 ${g(r.target)?.seat}号。` : '还没有瞄准任何人（时间到就是不开枪）。'}</p>
    </Panel>
  );
}

/** 炸弹人引爆后的倒数：每个人（死人也算）指一名还活着的人，被最多人指着的死亡；平票没人死。可以改。 */
function BoomPanel({ s, act, g }) {
  const secs = useCountdown(s.boom.until);
  return (
    <Panel title="💣 炸弹人引爆了" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}</span> : null}>
      <p className="lead">只剩三个人。倒数结束时，被最多人指着的那个死亡；平票就没有人死。</p>
      <div className="boom-picks">
        {s.boom.alive.map((id) => {
          const p = g(id);
          return (
            <button key={id} type="button" className={`boom-pick ${s.boom.mine === id ? 'on' : ''}`} aria-pressed={s.boom.mine === id} onClick={() => act('boomPoint', { target: id })}>
              <b>{p?.seat}号</b><span>{p?.name}</span>
            </button>
          );
        })}
      </div>
      <p className="muted">{s.boom.mine ? `你指着 ${g(s.boom.mine)?.seat}号（倒数结束前可以改）。` : '点一个人，用手指指着他。'}已经有 {s.boom.count} 人指了。</p>
    </Panel>
  );
}

function NomClock({ until }) {
  const secs = useCountdown(until);
  if (secs == null) return null;
  return <span className="nom-clock">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>;
}

/** 一次提名：提名者陈述 → 被提名者辩护 → 自动投票（AI 房主计时）。 */
function NomStage({ s, act, g, name, face }) {
  const nom = s.pendingNom;
  const secs = useCountdown(nom.until);
  const speaker = nom.stage === 'accuse' ? nom.nominator : nom.stage === 'defend' ? nom.nominee : null;
  const mine = speaker === s.me;
  return (
    <Panel title="提名" tone="phy" extra={secs != null ? <span className="nom-clock">{secs}s</span> : null}>
      <Faces people={[face(nom.nominator, `${g(nom.nominator)?.seat}号 提名`), face(nom.nominee, `${g(nom.nominee)?.seat}号 被提名`)]} />
      {speaker ? (
        <p className="lead">
          {mine ? (nom.stage === 'accuse' ? '轮到你说理由了。大家都在听。' : '轮到你辩护了。说服他们。')
            : `${name(speaker)} 正在${nom.stage === 'accuse' ? '说理由' : '辩护'}……`}
        </p>
      ) : <p className="lead">提名的人说理由，被提名的人辩护，然后开始投票。</p>}
      <div className="btn-row">
        {mine && <Btn kind="primary" onClick={() => act('nomDone')}>我说完了</Btn>}
        {!speaker && ([nom.nominator, nom.nominee].includes(s.me) || s.isHost) && <Btn kind="primary" onClick={() => act('startVote')}>开始投票</Btn>}
        {speaker && s.isHost && !mine && <Btn kind="ghost" onClick={() => act('nomDone')}>跳过这段发言</Btn>}
      </div>
    </Panel>
  );
}

/** 自由活动时右上角：街上只显示还剩多久；进了房子就是这间屋子的私聊面板（谁在、锁门、出去、有人敲门）。 */
function RoamActions({ s, act, name, face, setMode }) {
  const r = s.roam;
  const house = r.houses.find((h) => h.id === r.myHouse);
  const secs = useCountdown(r.until);
  const left = secs != null ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : null;
  const busy = r.houses.filter((h) => h.members.length).length;
  const [inviting, setInviting] = useState(false);
  const inv = r.invite;
  const invHouse = inv && r.houses.find((h) => h.id === inv.house);
  return (
    <>
      {inv && invHouse && (
        <Panel title="私聊邀请" tone="mot" className="knock-pnl">
          <div className="knock-row">
            <Portrait p={face(inv.from)} size={40} prefer="avatar" frame="#f4f4f0" speak={false} />
            <p className="flavor-line">{name(inv.from)} 邀请你去<b>{invHouse.name}</b>私聊。</p>
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
            {/* 不套"正在说话"的绿框：敲门的人在门外（广场频道）说话，屋里听不到，头像却会一直闪 */}
            <Portrait p={face(who)} size={40} prefer="avatar" frame="#f4f4f0" speak={false} />
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
          extra={<span className={`room-state ${house.locked ? 'locked' : ''}`}>{house.locked ? '锁门私聊中' : '门开着'}</span>}>
          <div className="room-people">
            {house.members.map((id) => (
              <div key={id} className={`rp ${id === s.me ? 'me' : ''}`}>
                <Portrait p={face(id)} size={44} prefer="avatar" frame={id === s.me ? 'var(--mot)' : '#f4f4f0'} />
                <span>{id === s.me ? '你' : name(id).replace(/^\d+号 /, '')}</span>
              </div>
            ))}
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
          <GossipButton s={s} act={act} />
          <SlayButton s={s} setMode={setMode} />
          <PsychoButton s={s} setMode={setMode} />
          <PeltButton s={s} setMode={setMode} />
          <TravellerActions s={s} act={act} setMode={setMode} />
          <TravellerJoin s={s} act={act} />
          <SnvButtons s={s} act={act} />
          <EndRoamVote s={s} act={act} />
        </Panel>
      ) : (
        <Panel title="街上" tone="light" className="room-pnl" extra={left ? <span className="nom-clock">{left}</span> : null}>
          <div className="stats">
            <Stat value={busy} label="间在私聊" color="var(--mot)" />
            <Stat value={s.players.filter((p) => p.alive).length} label="存活" color="var(--int)" />
          </div>
          {s.isHost && <div className="btn-row"><Btn kind="secondary" onClick={() => act('gather')}>敲钟集合</Btn></div>}
          <GossipButton s={s} act={act} />
          <SlayButton s={s} setMode={setMode} />
          <PsychoButton s={s} setMode={setMode} />
          <PeltButton s={s} setMode={setMode} />
          <TravellerActions s={s} act={act} setMode={setMode} />
          <TravellerJoin s={s} act={act} />
          <SnvButtons s={s} act={act} />
          <EndRoamVote s={s} act={act} />
        </Panel>
      )}
    </>
  );
}

/** 投票提前集合：过半的人点了就结束自由活动。 */
function EndRoamVote({ s, act }) {
  const v = s.roam?.endVotes;
  if (!v || !s.self) return null;
  return (
    <div className="end-roam">
      <div className="end-roam-bar"><i style={{ width: `${Math.min(100, (v.count / v.need) * 100)}%` }} /></div>
      <div className="link-row">
        <span className="muted">提前集合 {v.count}/{v.need}</span>
        <button type="button" className={`link ${v.mine ? 'on' : ''}`} onClick={() => act('roamVote', { yes: !v.mine })}>
          {v.mine ? '撤回' : '我想提前集合'}
        </button>
      </div>
    </div>
  );
}

/** 新手（房主在大厅标记的）：身份面板顶上多一段"这局你要干什么"。按自己看到的阵营讲，不剧透。 */
const NEWBIE_TIPS = {
  townsfolk: ['你是好人（镇民）。好人赢的办法只有一个：在白天把恶魔处决掉。', '每晚得到的信息会出现在下面「你得到的信息」里，也会记进「记录」。白天可以说出来，也可以先藏着，等确认对方是好人再说。', '别人说的话不一定是真的，坏人也会说自己是好人。'],
  outsider: ['你是好人（外来者）。你的能力对好人有点添乱，但你仍然要帮好人在白天处决恶魔。', '外来者的身份可以先不急着公开，看清局势再说。', '别人说的话不一定是真的，坏人也会说自己是好人。'],
  minion: ['你是坏人（爪牙）。第一晚已经告诉你恶魔是谁，你的任务是保护他活到最后。', '白天要装成好人：可以从下面的伪装卡里挑一个角色，说成是自己的身份。', '必要的时候可以把怀疑引到别人身上，甚至牺牲自己保住恶魔。'],
  demon: ['你是恶魔。每晚选一个人杀掉，坏人活到只剩两个人时就赢了。', '白天要装成好人：从下面的伪装卡里挑一个角色，说成是自己的身份，别被处决。', '爪牙是你的队友，他们会帮你打掩护。'],
};
function NewbieTips({ me }) {
  const tips = NEWBIE_TIPS[me.role?.team];
  if (!tips) return null;
  return (
    <section className="newbie-tips">
      <Tag tone="mot">新手提示</Tag>
      <ul>{tips.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="muted">夜里轮到你时，右上角会出现选人的面板；白天可以在镇上走进房子找人私聊。不确定怎么做，就直接问房主。</p>
    </section>
  );
}

const teamTone = (roleId) => ({ townsfolk: 'int', outsider: 'psy', minion: 'mot', demon: 'phy' }[ROLE_TEAM[roleId]] ?? 'light');

// ───────────────────────── 面板：身份 / 日志 / 记录 / 镇民 ─────────────────────────
/**
 * 身份卡，照原作技能卡的做法：卡面就是一整张插画（不加框），名字条和说明由界面叠上去。
 * 翻开前是统一的卡背（像思维内阁里还没研究的想法）；翻开后是彩色大图 + 白底名字条 + 能力说明。
 */
/** 举手按钮：没举手 = 举手；举着手 = 写明"再点放下"（提名者是自动举的手，提醒一下别点掉）。 */
const TRANSIT = {
  dawn: { title: '天亮了', next: '马上开始自由活动……' },
  gather: { title: '集合', next: '大家回到广场，马上开放提名……' },
  dusk: { title: '黄昏', next: '马上入夜……' },
};

/** 两个阶段之间那几秒：只说刚发生了什么、接下来是什么，不出提名/投票的按钮和票数。 */
function TransitCard({ s }) {
  const t = TRANSIT[s.transit];
  const last = [...s.log].reverse().find((l) => ['day', 'death', 'night'].includes(l.kind));
  return (
    <Panel title={t.title} tone="light" className="square-pnl">
      {last && <p className="lead"><Line text={last.text} /></p>}
      <p className="muted">{t.next}</p>
    </Panel>
  );
}

function HandButton({ s, act, raised, big = true }) {
  const auto = raised && s.vote.nominator === s.me; // 提名者一开始自动举手，可以放下（2026-11-16 用户）
  return (
    <button type="button" className={`center-hand ${big ? '' : 'small'} ${raised ? 'on' : ''}`} onClick={() => act('hand', { up: !raised })}>
      <span>{raised ? '✋ 已举手' : '举手'}</span>
      <small>{raised ? (auto ? '你是提名者，已自动举手 · 点这里放下' : '赞成处决 · 点这里放下') : '赞成处决就点'}</small>
    </button>
  );
}

/** 投票顺序：指针从被提名者的下一位开始转一圈。已经过的灰掉，当前的高亮；票型公开时举手的标红。 */
function VoteTrack({ s }) {
  const v = s.vote;
  const cur = v.idx >= 0 ? v.order[v.idx] : null;
  return (
    <div className="vote-track">
      {v.order.map((id) => {
        const p = s.players.find((x) => x.id === id);
        const passed = v.locked.includes(id);
        const up = v.yes.includes(id) && (!v.hidden || id === s.me);
        return (
          <span key={id} className={`vt ${passed ? 'passed' : ''} ${id === cur ? 'now' : ''} ${up ? 'up' : ''} ${id === s.me ? 'me' : ''}`} title={p?.name}>
            {p?.seat}{up && !v.hidden ? '✋' : ''}
          </span>
        );
      })}
    </div>
  );
}

/** 恶魔的 3 张伪装牌：这些善良角色不在场，可以自称是其中之一。点一张放大看完整能力。 */
function BluffCards({ me, act }) {
  const [open, setOpen] = useState(null);
  const ids = me.bluffs;
  const minions = (me.allies ?? []).filter((a) => a.team === '爪牙').length;
  return (
    <div className="bluffs">
      <Tag tone="phy">{me.bluffsMine ? '你的伪装 · 3 张' : '恶魔告诉你的伪装 · 3 张'}</Tag>
      <p className="muted">{me.bluffsMine
        ? '这 3 个善良角色这局不在场，你可以自称是其中之一。点牌看它的能力，想好别人问起时怎么圆。'
        : '恶魔把这 3 个不在场的善良角色告诉了你，你也可以挑一个来跳——和恶魔商量好，别撞同一件衣服。'}</p>
      <div className="bluff-cards">
        {ids.map((id) => (
          <button key={id} type="button" className="bluff-card" onClick={() => setOpen(id)} title={ROLE_ABILITY[id]}>
            <span className="bc-art">{ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" /> : null}</span>
            <b>{ROLE_NAMES[id]}</b>
            <small>点开看能力</small>
          </button>
        ))}
      </div>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(null)} role="presentation">
          <div className="role-modal" onClick={(e) => e.stopPropagation()}>
            <AbilityCard id={open} />
            <button type="button" className="role-modal-close" onClick={() => setOpen(null)}>关闭</button>
          </div>
        </div>
      )}
      {me.bluffsMine && minions > 0 && (me.bluffsShared
        ? <p className="muted bluff-shared">爪牙已经能看到这 3 张。</p>
        : <Btn onClick={() => act('shareBluffs')}>把这 3 张伪装告诉爪牙</Btn>)}
    </div>
  );
}

/** 邪恶玩家没有伪装牌时说明原因（官方规则）。 */
function EvilNote({ me }) {
  const team = ROLE_TEAM[me.role.id];
  if (team !== 'minion' && team !== 'demon') return null;
  let text;
  if (me.role.id === 'riot') text = me.evilInfo === false ? '裁缝与暴乱：6 人及以下的局，暴乱之间互相不知道。所有善良都是女裁缝，没有伪装可拿，就说自己是女裁缝。' : '裁缝与暴乱：所有善良都是女裁缝，没有伪装可拿，就说自己是女裁缝。';
  else if (me.evilInfo === false) text = '6 人及以下的局，官方规则里恶魔和爪牙互相不知道身份，恶魔也不拿伪装。自己挑一个善良角色来跳吧。（房主可以在大厅打开「小局也互认、发伪装」房规）';
  else if (!me.allies) text = '第一夜结束后你会知道队友是谁' + (team === 'demon' ? '，并拿到 3 张伪装。' : '。');
  else if (team === 'minion') text = '官方规则里爪牙不拿伪装，自己挑一个善良角色来跳；恶魔可以把它的 3 张伪装分享给你。';
  else text = '你是接任的恶魔：官方规则里接任的恶魔不再拿伪装，继续跳你原来的身份。';
  return (
    <div className="bluffs">
      <Tag tone="phy">伪装</Tag>
      <p className="muted">{text}</p>
    </div>
  );
}

function RoleCard({ me }) {
  const [open, setOpen] = useState(false);
  const r = me.role;
  return (
    <div className="idcard-wrap">
      <button type="button" className={`idcard ${open ? 'open' : ''}`} onClick={() => { setOpen((x) => !x); tutEvent('flip'); }} aria-label={open ? '合上身份卡' : '翻开身份卡'}>
        <span className="idcard-inner">
        <span className="idface idback">
          <span className="id-art">{ROLE_ART._back ? <img src={ROLE_ART._back} alt="" /> : <CardBack />}</span>
          <span className="id-name">翻开身份</span>
        </span>
        <span className="idface idfront"><AbilityCard id={r.id} /></span>
        </span>
      </button>
      <p className="muted id-hint">{open ? `你坐在${cnNum(me.seat)}号${me.alive ? '' : '，已经死了'}。点卡片扣回去。` : '点卡片翻开。别让旁边的人看见。'}</p>
    </div>
  );
}

/** 没有卡背图时的占位：一个断了指针的钟面。 */
function CardBack() {
  return (
    <svg viewBox="-50 -70 100 140" aria-hidden="true">
      <rect x="-50" y="-70" width="100" height="140" fill="#0d0f0f" />
      <circle r="26" fill="none" stroke="#3a3f3f" strokeWidth="2" filter="url(#brush)" />
      <path d="M0 0 L0 -15 M0 0 L9 5" stroke="#4a5050" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M0 26 C1 40 -1 50 0 62" stroke="#7a1c2a" strokeWidth="2" fill="none" filter="url(#brush)" />
    </svg>
  );
}

/** 身份页最上面：夜里（和白天）私下得到的所有信息，最新的在最上面。 */
// 身份页的记录 = 说书人告诉你的信息 + 你自己夜里选了谁（旅店老板、僧侣这类不收信息的角色也能回看自己护了谁），按时间排
export function InfoBox({ me }) {
  useEffect(() => { if (!me.inbox.length) return undefined; const t = setTimeout(() => tutEvent('journal'), 2500); return () => clearTimeout(t); }, [me.inbox.length]);
  const list = [...me.inbox, ...(me.acts ?? [])].sort((a, b) => a.id - b.id);
  return (
    <section className="info-box">
      <header><b>你的记录</b><small>{list.length ? `${list.length} 条 · 最新的在最上面` : ''}</small></header>
      {list.length ? <Journal list={list} /> : <p className="muted">还没有。夜里你选了谁、说书人告诉你的信息都会记在这里。</p>}
    </section>
  );
}

function Journal({ list }) {
  return (
    <ul className="journal">
      {[...list].reverse().map((m) => {
        const v = voiceOf(m.voice, ROLE_NAMES);
        return (
          <li key={m.id} className={m.mine ? 'j-mine' : ''}>
            <span className="stamp-time">{m.phase}</span>
            {m.mine
              ? <Line who="你的行动" color={v.color} text={m.text} />
              : <Line who={v.who} color={v.color} chip={v.skill ? `${v.skill} · 成功` : null} flavor={v.flavor?.hear} text={m.text} />}
          </li>
        );
      })}
    </ul>
  );
}

const KIND_VOICE = {
  start: ['说书人', 'var(--mot)'], end: ['说书人', 'var(--mot)'], night: ['钟楼', 'var(--cream)'], day: ['钟楼', 'var(--cream)'],
  death: ['镇民们', 'var(--phy)'], vote: ['镇民们', 'var(--cream)'], whisper: ['街坊', 'var(--psy)'], info: ['钟楼', 'var(--cream)'],
  story: ['说书人', 'var(--mot)'],
};

// 记录默认只显示关键信息（死亡、提名投票、公开声明、开枪、私聊、天亮的死讯……）；旁白和操作提示收起来，想看可以打开
const isKey = (l) => l.key ?? ['death', 'vote', 'start', 'end', 'whisper'].includes(l.kind); // 旧存档没有 key 标记：按类型猜

export function History({ log: recent, players = [], ask, epoch }) {
  const [all, setAll] = useState(false);
  // 状态推送只带最后 40 条，更早的打开时向服务器要一次；开着的时候又过了 40 条，再要一次补上空档
  const [older, setOlder] = useState([]);
  const gap = older.length > 0 && recent[0]?.id > older.at(-1).id;
  useEffect(() => {
    let on = true;
    ask('fullLog').then((r) => { if (on && r?.log) setOlder(r.log); });
    return () => { on = false; };
  }, [epoch, gap]);
  const first = recent[0]?.id ?? Infinity;
  const log = [...older.filter((l) => l.id < first), ...recent];
  if (!log.length) return <p className="muted">还没有人说话。</p>;
  const shownLog = all ? log : log.filter(isKey);
  // 一条记录里提到的人（"3号 小明"），按出现顺序，最多 2 个
  const mentioned = (text) => {
    const out = [];
    for (const m of text.matchAll(/(\d+)号/g)) {
      const p = players.find((q) => q.seat === Number(m[1]));
      if (p && !out.includes(p)) out.push(p);
      if (out.length >= 2) break;
    }
    return out;
  };
  return (
    <>
    <label className="history-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 也显示说书人旁白和操作提示</label>
    {!shownLog.length && <p className="muted">还没有关键信息。</p>}
    <ul className="history">
      {[...shownLog].reverse().map((l) => {
        const [who, color] = KIND_VOICE[l.kind] ?? KIND_VOICE.info;
        const faces = mentioned(l.text);
        return (
          <li key={l.id} className={`k-${l.kind}${l.kind === 'story' ? ' story' : ''}${faces.length ? ' has-faces' : ''}`}>
            {faces.length > 0 && <span className="h-faces">{faces.map((p) => <Portrait key={p.id} p={p} size={20} prefer="avatar" speak={false} frame={p.alive ? '#f4f4f0' : '#666'} />)}</span>}
            <Line who={who} color={color} text={l.text} />
          </li>
        );
      })}
    </ul>
    </>
  );
}

/**
 * 镇民面板（小魔典）：大家按座位围成一圈。左键依次点两个人连一条线（先选上面的连线类型；再点一次起点取消），
 * 右键（手机长按）一个人涂颜色、贴角标、猜角色、写笔记。只存在自己设备上，别人看不到。说书人点人还是打开这个人的详情。
 */
export function Roster({ s, onTap }) {
  const marks = useMarks(s);
  const ref = useRef(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const [kind] = useLinkKind(); // 和广场座位圈共用
  const [from, setFrom] = useState(null); // 连线的起点
  const [menu, setMenu] = useState(null); // { id, x, y }
  const hold = useRef(null);              // 手机长按
  const n = s.players.length;
  const tk = Math.round(Math.min(46, Math.max(26, ((w * Math.PI * 0.82) / n) * 0.52)));
  const R = w / 2 - tk / 2 - 16;
  const pos = (i) => { const a = ((-90 + (i * 360) / n) * Math.PI) / 180; return { x: w / 2 + R * Math.cos(a), y: w / 2 + R * Math.sin(a) }; };
  const posOf = (id) => { const i = s.players.findIndex((p) => p.id === id); return i < 0 ? null : pos(i); };
  const seat = (id) => s.players.find((p) => p.id === id)?.seat;
  const allies = Object.fromEntries((s.self?.allies ?? []).map((a) => [a.id, a.team]));
  const tap = (p) => {
    if (hold.current?.fired) { hold.current = null; return; } // 长按已经打开菜单了
    if (onTap) { onTap(p); return; }
    if (!from) { setFrom(p.id); return; }
    if (from === p.id) { setFrom(null); return; }
    addLink(from, p.id, kind);
    setFrom(null);
  };
  const openMenu = (p, x, y) => { setFrom(null); setMenu({ id: p.id, x, y }); };
  const stopHold = () => { if (hold.current?.t) { clearTimeout(hold.current.t); hold.current = null; } };
  const menuPlayer = menu && s.players.find((p) => p.id === menu.id);
  const links = linksOf(marks).map((l, i) => ({ ...l, i }));
  const notes = s.players.filter((p) => marks[p.id]?.note);
  return (
    <div className="mini-grim">
      {!onTap && <LinkKinds />}
      <p className="mg-hint muted">{onTap ? '点一个人看详情。' : from ? `从 ${seat(from)}号 连「${LINKS[kind].label}」到谁？（再点一次 ${seat(from)}号 取消）` : '左键依次点两个人连线；右键（手机长按）一个人涂颜色、贴角标、猜角色、写笔记。'}</p>
      <div className="mg-circle" ref={ref} style={{ height: w }}>
        <LinkLines marks={marks} posOf={posOf} w={w} h={w} gap={tk * 0.62} />
        {s.players.map((p, i) => {
          const { x, y } = pos(i);
          const m = marks[p.id] ?? {};
          const mine = p.id === s.me;
          const frame = allies[p.id] ? 'var(--phy)' : mine ? 'var(--mot)' : TAGS[m.tag]?.color ?? '#f4f4f0';
          return (
            <button key={p.id} type="button" data-pid={p.id} className={`mg-token ${p.alive ? '' : 'dead'} ${from === p.id ? 'from' : ''}`} style={{ left: x, top: y, '--tk': `${tk}px` }}
              onClick={() => tap(p)}
              onContextMenu={(e) => { e.preventDefault(); stopHold(); openMenu(p, e.clientX, e.clientY); }}
              onPointerDown={(e) => { if (e.pointerType === 'mouse') return; const at = { x: e.clientX, y: e.clientY }; hold.current = { t: setTimeout(() => { hold.current = { fired: true }; openMenu(p, at.x, at.y); }, 500) }; }}
              onPointerUp={stopHold} onPointerLeave={stopHold}
              title={`${p.seat}号 ${p.name}${m.note ? `\n笔记：${m.note}` : ''}`}>
              <Portrait p={p} size={tk} frame={frame} />{/* 「镇民」页也显示说话 / 闭麦（2026-11-18 用户） */}
              <span className="mg-seat">{p.seat}</span>
              {!p.alive && <span className="mg-dead">{p.ghostVote ? '亡·余票' : '亡'}</span>}
              {m.note && <i className="mg-note">记</i>}
              <span className="mg-name">{mine ? '你' : p.name}</span>
              {p.roleName ? <span className="mg-role" style={{ background: ATTR[p.team]?.color ?? (p.evil ? 'var(--phy)' : 'var(--int)') }}>{p.roleName}</span> : <MarkBadge mark={m} />}
            </button>
          );
        })}
      </div>
      {s.chairs?.length > 0 && (
        <div className="mg-chairs">
          <span className="muted">空座位（没人坐，上面是什么不公开）</span>
          <div>{s.chairs.map((c) => <ChairToken key={c.id} c={c} size={36} />)}</div>
        </div>
      )}
      {links.length > 0 && (
        <div className="mg-list">
          {links.map((l) => (
            <span key={l.i} className="le-chip" style={{ '--c': LINKS[l.kind].color }}>
              {seat(l.a)}号 → {seat(l.b)}号 · {LINKS[l.kind].label}
              <button type="button" onClick={() => removeLink(l.i)} aria-label="删掉这条连线">×</button>
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="mg-notes">
          {notes.map((p) => <li key={p.id}><b>{p.seat}号{p.id === s.me ? '（你）' : ''}</b> {marks[p.id].note}</li>)}
        </ul>
      )}
      {menuPlayer && <MarkMenu s={s} player={menuPlayer} mark={marks[menu.id]} at={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

// ───────────────────────── 说书人 ─────────────────────────
/** 说书台上要说书人拿主意的事有几件（「魔典」标签上的红点）。 */
const stTodo = (st) => (st ? st.pendingInfo.length + (st.artistAsks?.length ?? 0) + (st.asks?.length ?? 0) : 0);

/**
 * 说书台（2026-11-20 用户：房主当说书人时，系统性的不用他来，需要人脑抉择的地方由他决定）。
 * 叫人、计时、提名投票、照规则算的信息都由机器人跑；这里只放要他拿主意的：
 * 上面「待你决定」——醉酒中毒的假信息、误登记影响的信息、艺术家 / 渔夫 / 失忆者的问题、AI 听到的疯狂（都带 AI 的建议）；
 * 夜里结算完停在天亮前时，列出 AI 今晚替他做的判定，看完点「天亮」（不点也会到点自动天亮）。
 */
function StDesk({ s, act, name }) {
  const st = s.st;
  const night = s.phase === 'night';
  const todo = stTodo(st);
  return (
    <div className="desk">
      {night && (
        <Panel title="今夜" tone="mot" extra={st.held ? <span className="st-clock">等你点天亮</span> : null}>
          <ol className="st-steps">
            {['大家选择', '结算', '你过目', '天亮'].map((t, i) => {
              const at = st.resolved ? 2 : st.waiting.length || st.rkPending ? 0 : 1;
              return <li key={t} className={i < at ? 'done' : i === at ? 'now' : ''}>{t}</li>;
            })}
          </ol>
          {!st.resolved && st.waiting.length > 0 && <p className="lead">还在等：{st.waiting.map(name).join('、')}（到时间没选的随机）</p>}
          {!st.resolved && !st.waiting.length && <p className="lead">大家都选好了，正在结算……</p>}
          {st.rkPending && <p className="lead">守鸦人 {name(st.rkPending)} 正在选人。</p>}
          {st.resolved && <p className="lead">{!st.pendingInfo.length ? '结算完了：看一眼 AI 替你做的判定，没问题就天亮。' : st.notes?.length ? `结算完了：还有 ${st.pendingInfo.length} 条信息等你过目，再看一眼 AI 替你做的判定，然后点「天亮」。` : `结算完了：还有 ${st.pendingInfo.length} 条信息等你过目，处理完就天亮。`}</p>}
          <div className="btn-row">
            {st.pendingInfo.length > 1 && <Btn onClick={() => act('info', { action: 'sendAll' })}>全部照建议发</Btn>}
            <Btn kind="primary" onClick={() => act('dawn')}>{st.resolved ? '天亮' : '现在就结算'}</Btn>
          </div>
        </Panel>
      )}
      {todo > 0 && <Tag tone="mot">待你决定 · {todo}</Tag>}
      {st.pendingInfo.map((m) => <InfoItem key={m.id} m={m} name={name} act={act} />)}
      {st.artistAsks?.map((q) => (
        <div key={q.uid} className="info-item ask-item">
          <div className="info-head"><b>{name(q.uid)}</b><Check color="var(--mot)">艺术家的问题</Check></div>
          <p className="lead">{q.text}</p>
          <AiSays none={q.noAi} v={q.suggest === 'retry' ? '问得有歧义，让他重问' : { true: '是', false: '不是', unknown: '我不知道' }[q.suggest]} />
          <div className="btn-row">
            {[['true', '是'], ['false', '不是'], ['unknown', '我不知道'], ['retry', '有歧义，请他重问']].map(([v, label]) => (
              <Btn key={v} kind={q.suggest === v ? 'primary' : 'secondary'} onClick={() => act('st', { action: 'artistAnswer', target: q.uid, text: v })}>{label}</Btn>
            ))}
          </div>
        </div>
      ))}
      {st.asks?.map((a) => <AskItem key={a.id} a={a} name={name} act={act} />)}
      {night && st.notes?.length > 0 && (
        <details className="st-notes" open={st.notes.length <= 2}>
          <summary>AI 今晚替你做的判定 · {st.notes.length}</summary>
          <ul>{st.notes.map((t, i) => <li key={i}>{t.replace(/（局势：[^）]*）$/, '')}</li>)}</ul>
          <p className="muted">不同意的话，天亮前点肖像改：杀死、复活、下毒、改角色。</p>
        </details>
      )}
      {!night && todo === 0 && <p className="muted">现在没有要你拿主意的事。流程（自由活动、提名、投票、黄昏）机器人在跑，你可以在「房主」菜单里提前推进。</p>}
      {s.bluffs && <p className="muted">恶魔的伪装：{s.bluffs.join('、')}</p>}
      <p className="muted">点肖像（或「镇民」面板）可以杀死、复活、下毒、改角色、私下传话。</p>
      <ul className="history">{[...st.log].reverse().map((l) => <li key={l.id}><Line who="魔典" color="var(--mot)" text={l.text} /></li>)}</ul>
    </div>
  );
}

const AiSays = ({ v, none = false }) => <p className="ai-says">{none ? '没接 AI：你来判断' : v == null ? 'AI 还在想……' : <>AI 建议：<b>{v}</b></>}</p>;

/** 一件要说书人拿主意的事：渔夫要建议、失忆者猜能力、AI 听到的疯狂。 */
function AskItem({ a, name, act }) {
  const [text, setText] = useState(a.suggest ?? '');
  useEffect(() => { if (a.suggest && !text) setText(a.suggest); }, [a.suggest]);
  const go = (answer, extra = {}) => act('stAsk', { id: a.id, answer, ...extra });
  const head = { fisherman: '渔夫来请教建议', amnesiac: '失忆者猜自己的能力', mad: '疯狂：要不要处决', bishop: '主教在场：由你提名' }[a.kind];
  return (
    <div className={`info-item ask-item ask-${a.kind}`}>
      <div className="info-head"><b>{name(a.who)}</b><Check color="var(--mot)">{head}</Check></div>
      {a.hint && <p className="ask-why">{a.hint}</p>}
      {a.kind === 'fisherman' && <>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={a.suggest == null ? 'AI 还在想……也可以直接写' : '给他一句建议'} />
        <div className="btn-row">
          <Btn kind="primary" disabled={!text.trim()} onClick={() => go('send', { text })}>发给他</Btn>
          <Btn kind="ghost" onClick={() => go('drop')}>不理</Btn>
        </div>
      </>}
      {a.kind === 'amnesiac' && <>
        <p className="lead">他猜：{a.text}</p>
        <p className="muted">他的能力其实是：{a.truth}</p>
        <AiSays v={a.suggest} />
        <div className="btn-row">
          {['无关', '有关', '接近', '完美'].map((v) => <Btn key={v} kind={a.suggest === v ? 'primary' : 'secondary'} onClick={() => go(v)}>{v}</Btn>)}
        </div>
      </>}
      {a.kind === 'bishop' && <>
        <p className="lead">{a.why}</p>
        <p className="muted">点一个人提名，他辩护后自动投票；处决了就入夜，没处决可以接着提名。标「对立」的是和主教阵营相反的玩家。</p>
        <div className="bishop-picks">
          {a.options?.map((o) => (
            <Btn key={o.id} kind={o.opp ? 'secondary' : 'ghost'} disabled={a.busy} onClick={() => go('nominate', { text: o.id })}>
              {name(o.id)}{o.opp && <span className="opp">对立</span>}
            </Btn>
          ))}
        </div>
        <div className="btn-row"><Btn kind="ghost" disabled={a.busy} onClick={() => go('done')}>今天提名完了，入夜</Btn></div>
      </>}
      {a.kind === 'mad' && <>
        <p className="lead">{a.why}</p>
        <p className="muted">AI 听到的（或他公开声明的）。处决算今天的处决；夜里处决当场公布。</p>
        <div className="btn-row">
          <Btn kind="primary" onClick={() => go('execute')}>处决他</Btn>
          <Btn onClick={() => go('spare')}>放过</Btn>
        </div>
      </>}
    </div>
  );
}

function InfoItem({ m, name, act }) {
  // 编辑框里不显示 ** 加粗记号；没改动就原样发（玩家那边保留加粗）
  const plain = m.text.replace(/\*\*/g, '');
  const [text, setText] = useState(plain);
  const v = voiceOf(m.voice, ROLE_NAMES);
  return (
    <div className="info-item">
      <div className="info-head"><b>{name(m.playerId)}</b><Check color={v.color}>{v.who}</Check></div>
      {m.why && <p className="ask-why">{m.why}</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <div className="btn-row">
        <Btn kind="primary" onClick={() => act('info', { id: m.id, action: 'send', text: text === plain ? m.text : text })}>{text === plain ? '照这样发' : '发送改过的'}</Btn>
        <Btn kind="ghost" onClick={() => act('info', { id: m.id, action: 'drop' })}>不发</Btn>
      </div>
    </div>
  );
}

function PlayerSheet({ s, p, act, name, onClose }) {
  const [role, setRole] = useState(p.role);
  const [text, setText] = useState('');
  const st = (action, extra = {}) => act('st', { action, target: p.id, ...extra }).then((ok) => ok && action !== 'tell' && onClose());
  const teams = [['townsfolk', '镇民'], ['outsider', '外来者'], ['minion', '爪牙'], ['demon', '恶魔']];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <Panel title={name(p.id)} tone={p.evil ? 'phy' : 'int'} extra={<span className="muted">{p.roleName} · {p.alive ? '活着' : '已死亡'}</span>}>
          <div className="btn-row">
            {p.alive ? <Btn kind="primary" onClick={() => st('kill')}>杀死</Btn> : <Btn onClick={() => st('revive')}>复活</Btn>}
            {(p.alive || s.phase === 'day') && engineOf(s.script) === 'snv' && <Btn onClick={() => st('madExecute')} title={s.phase === 'day' ? '他疯狂证明得不够：处决他，算今天的处决（死人也可以处决，他不会再死一次）' : '他疯狂证明得不够：处决他，当场公布，不占白天的处决'}>疯狂处决</Btn>}
            <Btn onClick={() => st('poison')}>下毒</Btn>
            {s.bishop && s.phase === 'day' && !p.traveller && <Btn onClick={() => st('nominate')} title="主教在场：只有说书人可以提名">提名他（主教）</Btn>}
            <Btn onClick={() => act('pull', { targets: [p.id] }).then((ok) => ok && onClose())}>单独谈话</Btn>
          </div>
          <div className="field-row">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {teams.map(([t, label]) => (
                <optgroup key={t} label={label}>
                  {s.st.roles.filter((r) => r.team === t).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              ))}
            </select>
            <Btn disabled={role === p.role} onClick={() => st('role', { role })}>改角色</Btn>
          </div>
          <textarea placeholder="私下告诉他一句话……" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          <div className="btn-row">
            <Btn disabled={!text.trim()} onClick={() => st('tell', { text }).then(() => setText(''))}>悄悄告诉他</Btn>
            <Btn kind="ghost" onClick={onClose}>关闭</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function HostMenu({ s, act, onClose, setMode }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [madPick, setMadPick] = useState(null); // 疯狂处决：null 没打开，'' 在选人，id 选好了等确认
  const run = (fn) => async () => { await fn(); onClose(); };
  const day = s.phase === 'day';
  const canMad = day && !s.isST && engineOf(s.script) === 'snv' && !s.executedToday;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <Panel title={s.isST ? '说书人' : '房主'} tone="mot">
          <div className="btn-col">
            {day && !s.roam && <Btn onClick={run(() => act('roam'))}>宣布自由活动</Btn>}
            {day && s.roam && <Btn onClick={run(() => act('gather'))}>敲钟集合</Btn>}
            {day && <Btn onClick={run(() => setMode('pull'))}>把人拉进密室</Btn>}
            {day && <Btn onClick={run(() => act('dusk'))}>结束这一天</Btn>}
            {s.phase === 'night' && !s.isST && <Btn onClick={run(() => act('dawn'))}>立刻天亮</Btn>}
            {canMad && madPick === null && <Btn kind="ghost" onClick={() => setMadPick('')}>疯狂处决……</Btn>}
            {canMad && madPick === '' && (
              <div className="host-mad">
                <p className="muted">选一名破坏了疯狂的玩家：当场处决，算今天的处决。</p>
                <div className="btn-row">
                  {s.players.map((p) => <Btn key={p.id} kind="ghost" onClick={() => setMadPick(p.id)}>{p.seat}号 {p.name}{p.alive ? '' : '（死）'}</Btn>)}
                </div>
              </div>
            )}
            {canMad && madPick && (() => {
              const p = s.players.find((q) => q.id === madPick);
              return <Btn kind="primary" onClick={run(() => act('hostMadExecute', { target: madPick }))}>确定处决 {p?.seat}号 {p?.name}（因为疯狂）</Btn>;
            })()}
            {!s.isST && (!confirmRelease
              ? <Btn kind="ghost" onClick={() => setConfirmRelease(true)}>让出房主……</Btn>
              : <Btn kind="primary" onClick={run(() => act('releaseHost'))}>确定让出房主（交给在线的玩家）</Btn>)}
            {!confirmEnd
              ? <Btn kind="ghost" onClick={() => setConfirmEnd(true)}>结束这一局……</Btn>
              : <Btn kind="primary" onClick={run(() => act('end'))}>确定结束（进度会丢失）</Btn>}
            <Btn kind="ghost" onClick={onClose}>返回</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}
