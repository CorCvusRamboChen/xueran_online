import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openMic, login, openSocket, report, listenSpeaking, fromKook } from './connect.js';
import { Town, PaintFilters } from './Town.jsx';
import { TownMap, AliveStrip } from './TownMap.jsx';
import { CheatSheet, useSheetMode } from './CheatSheet.jsx';
import { DemonDash, DoorKick } from './KillScenes.jsx';
import { useAmbience } from './world/ambience.js';
import { Cottage, DawnWake } from './Cottage.jsx';
import { Lobby } from './Lobby.jsx';
import { AvalonGame } from './Avalon.jsx';
import { Line, Portrait, clock, syncClock, serverNow, gameClock, useTick, useCountdown, cnNum } from './util.jsx';
import { Tag, Panel, Btn, Stat, Check, Faces, HudBar } from './ui.jsx';
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
import { DISTRIBUTION, ROLES as ROLE_DEFS, SCRIPTS, engineOf, inScript, rolesOf, ragnarokWolves } from '../../src/engine/roles.js';
const ROLE_ABILITY = Object.fromEntries(Object.entries(ROLE_DEFS).map(([id, r]) => [id, r.ability]));

/** 顶部常驻：这局的板子配置（几个镇民、外来者、爪牙、恶魔）。 */
function BoardBar({ n, script }) {
  const d = script === 'rag' && DISTRIBUTION[n] ? [n - ragnarokWolves(n), 0, 0, ragnarokWolves(n)] : DISTRIBUTION[n]; // 诸神黄昏：猎手和狼人
  if (!d) return null;
  const parts = [['镇民', d[0], 'var(--int)'], ['外来者', d[1], 'var(--psy)'], ['爪牙', d[2], '#c9762e'], ['恶魔', d[3], 'var(--phy)']];
  return (
    <div className="board-bar" title={{ bmr: '教父在场时：外来者 +1 或 −1（说书人决定）', snv: '方古在场时外来者 +1；亡骨魔在场时外来者 −1', ngj: '男爵在场时外来者加到两个（这个剧本只有两个外来者）', luf: '气球驾驶员在场时，说书人可以多放一个外来者', rag: '镇民全是猎手（死了可以开一枪，打谁谁死），恶魔全是小恶魔（狼人）', bs7: '男爵 +2、亡骨魔 −1、气球驾驶员 +0~1 外来者；村夫可以有 1–3 个。7 号空座也算一个座位', cat: '教父在场外来者 ±1，方古 +1，亡骨魔 −1，气球驾驶员 +0~1' }[script] ?? '男爵在场时：外来者 +2、镇民 −2'}>
      <span className="bb-script">{SCRIPTS[script]?.name ?? SCRIPTS.tb.name}</span>
      <span className="bb-n">{n} 人局</span>
      {parts.map(([k, v, c]) => <span key={k} className="bb-item"><b style={{ color: c }}>{v}</b>{k}</span>)}
      <span className="bb-note">{{ bmr: '教父在场 外来者±1', snv: '方古 +1 · 亡骨魔 −1', ngj: '男爵在场 外来者补到 2', luf: '气球驾驶员 外来者+0~1', rag: '猎手 vs 狼人', bs7: '7 号空座 · 男爵+2 · 亡骨魔−1', cat: '教父±1 · 方古+1 · 亡骨魔−1' }[script] ?? '男爵在场 外来者+2'}</span>
    </div>
  );
}
/**
 * 提名 / 投票时左上角的「票数」小块：还活着几人、拿到几票就上处决台、全场能投几票（活人 + 死人剩下的那一票）。
 * 点开看细节：哪些死人还有票、处决台上现在几票、下一个人至少要几票才能把他换下来。
 */
function VoteStats({ s }) {
  const [open, setOpen] = useState(false);
  if (s.phase !== 'day' || !(s.noms || s.vote || s.pendingNom)) return null;
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

import { getMap, pathLength, positionAt, houseAt, SPEED } from '../../src/shared/map.js';

/**
 * 走路预测：点了地图就先在本地按同一套寻路开始走，不等服务器回话（一来一回要几百毫秒，走路会"慢半拍"）。
 * 服务器的结果回来后：终点一样就沿用本地这一段，不一样（比如锁着门、被挡在门口）就以服务器为准。
 * 锁门相关的情况交给服务器决定，不预测。
 */
const recentEnds = []; // 最近几次本地预测的终点

function predictMove(s, x, y) {
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
  r.pos[s.me] = { fx: from.x, fy: from.y, x: end.x, y: end.y, start: now, dur: (pathLength(path) / SPEED) * 1000, path, predicted: true };
  recentEnds.push(end);
  if (recentEnds.length > 16) recentEnds.shift();
}

export default function App() {
  const [s, setS] = useState(null);
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
    const wrongPlace = status.kind === 'error' && /^请从.*文字频道进入/.test(status.error ?? ''); // 从语音频道打开：重新进入也没用，不给那个按钮
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
            <p>{status.kind === 'error' ? '进不去？' : '等太久了？'}点下面重新进入；{fromKook ? '还不行就回 KOOK 频道重新领一次进入链接。' : '还不行就关掉活动，再从文字频道打开一次。'}</p>
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
          : s.script === 'avalon' ? <AvalonGame s={s} act={act} ask={ask} parts={{ RoamActions, History, SoundToggles, Watchers }} /> // 娱乐模式阿瓦隆：另一套界面，见 Avalon.jsx
            : <Game s={s} act={act} ask={ask} />}
      {s.tutorial && <Tutorial s={s} onExit={() => api.current.tutorial(false)} />}
      {toast && <div className="toast">{toast}</div>}
      <TitleCard card={card} onClose={closeCard} players={s?.players} kicker={s?.ww ? '法官' : undefined} />
    </div>
  );
}

// ───────────────────────── 游戏 ─────────────────────────
const ROLES_DEMON = new Set(['imp']); // 暗流涌动的恶魔（破门过场）

const MODES = {
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
  const g = (id) => s.players.find((p) => p.id === id);
  const name = (id) => { const p = g(id); return p ? `${p.seat}号 ${p.name}` : '?'; };

  const night = s.phase === 'night';
  const prompt = night && me?.prompt && !me.prompt.chosen ? me.prompt : null;
  const rk = night && me?.ravenkeeper;
  const pickSpec = rk ? { count: 1, options: s.players.map((p) => p.id) }
    : prompt ? { count: prompt.count, options: prompt.options }
      : mode ? { count: MODES[mode].max ?? 1, options: s.players.map((p) => p.id).filter((id) => mode !== 'pull' || id !== s.me) } : null; // 官方：可以提名自己

  const pickKey = `${s.phase}-${s.night}-${s.day}-${mode}-${!!prompt}-${rk}`;
  useEffect(() => { setPicked([]); setPickedRole(null); }, [pickKey]);
  // 换阶段就取消正在选人的操作；自由活动开始/结束时也取消，只有"开枪"例外（官方规则：白天任何时候都能开枪）
  useEffect(() => { setMode((m) => (s.phase !== 'day' ? null : s.roam && m !== 'slay' ? null : m)); }, [s.phase, !!s.roam]);

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
      if (ok && ROLES_DEMON.has(prompt.roleId) && t && t !== s.me && g(t)?.alive && s.homes?.[s.me] && s.homes?.[t]) setDash({ target: t, roleId: prompt.roleId }); // 选了死人（空刀）不冲过去
    }
    else if (mode === 'nominate') ok = await act('nominate', { target: picked[0] });
    else if (mode === 'slay') ok = await act('slay', { target: picked[0] });
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
    s.isST && { id: 'grim', icon: 'grim', label: '魔典', dot: s.st?.pendingInfo.length || 0 },
    s.isHost && { id: 'menu', icon: 'menu', label: s.isST ? '说书人' : '房主' },
  ].filter(Boolean);
  const myVoteOpen = !!s.vote && !!me && (me.alive || me.ghostVote) && !s.vote.locked.includes(s.me);
  const mySpeech = !!s.pendingNom && ((s.pendingNom.stage === 'accuse' && s.pendingNom.nominator === s.me) || (s.pendingNom.stage === 'defend' && s.pendingNom.nominee === s.me));
  const dockHot = !!(prompt || rk) || myVoteOpen || mySpeech;
  const pick = (id) => { if (id === 'journal') tutEvent('journal'); return id === 'menu' ? setMenu(true) : setTab((cur) => (cur === id ? null : id)); };
  const shown = tab ?? (s.isST ? 'grim' : me ? 'role' : 'log'); // 电脑上右栏默认显示的面板

  return (
    <div className="game">
      <section className="scene">
        {!roaming && <Tag className="where">{place}</Tag>}
        {s.spectator && s.phase !== 'ended' && (
          <div className="spectator-bar">观战中{s.settings?.spectatorGrimoire ? ' · 你能看到所有人的身份，别在语音里说' : ' · 看不到任何人的身份'}{(s.watchers?.length ?? 0) > 1 ? ` · 观战 ${s.watchers.length} 人` : ''}</div>
        )}
        <BoardBar n={s.players.length} script={s.script} />
        <VoteStats s={s} />
        {roaming ? (
          <TownMap s={s} onMove={me ? (x, y) => { predictMove(s, x, y); return act('move', { x, y }); } : () => null} />
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
        <SoundToggles onFixVoice={me && s.phase !== 'ended' ? () => act('fixVoice') : null} onSheet={!roaming && !skills ? () => setSkills(true) : null} />
        <SkillCheck check={check} onClose={closeCheck} />
        <MicDemand me={me} />
        <HudBar items={items} active={tab} onPick={pick} label={t.label}
          timer={timerSpec && { label: timerSpec.label, secs: timerSecs, urgent }} />
        {warn && <div className="nom-warn" key={warn}>{warn}</div>}
      </section>

      {/* 操作面板：电脑上在右栏上方（标签页上面）；手机上排在画面下面 */}
      <section className={`dock ${dockHot ? 'dock-hot' : ''}`}>
        {me?.moonchild && <MoonchildPanel s={s} act={act} fake={me.moonchild === 'fake'} />}
        {me?.klutz && <KlutzPanel s={s} act={act} />}
        {me?.madness && (!me.madness.claimed || (me.mic && !me.micOn)) && <MadnessPanel me={me} />}
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
          {shown === 'log' && <History log={s.log} players={s.players} ask={ask} epoch={s.logEpoch} />}
          {shown === 'votes' && <KeyInfo votes={s.votes} knives={s.knives} execs={s.execs} g={g} name={name} />}
          {shown === 'roster' && <Roster s={s} onTap={s.isST ? (p) => setSheet(p.id) : null} />}
          {shown === 'roster' && <Watchers s={s} />}
          {shown === 'roles' && <RoleIndex s={s} />}
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
  const what = recent && { block: '送上处决台', tie: '平票', lower: '不如台上的票多', fail: '票数不够' }[lv.outcome];
  return (
    <div className="center-box">
      {onBlock.length > 0 && (
        <OnBlock s={s} ids={onBlock}
          label={onBlock.length > 1 ? `平票 · ${s.blockVotes} 票 · 谁都不处决` : `处决台 · ${s.blockVotes} 票`} />
      )}
      {recent && <div className="tally"><b>{lv.count}</b><span>/</span><b className="need">{lv.threshold}</b></div>}
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

/** 猎手按钮（暗流涌动）：白天任何时候谁都能声称猎手开一枪，每人每局一次；真猎手自己看到的是醒目的主按钮。 */
function SlayButton({ s, setMode }) {
  const me = s.self;
  // 暗流涌动和诸神黄昏谁都能声称开枪（死人也行，没有效果）；两个小剧本里只有猜中了猎手能力的失忆者有这把枪（canSlay）
  if ((engineOf(s.script) !== 'tb' && !me?.canSlay) || s.script === 'rag' || s.phase !== 'day' || !me || s.players.find((p) => p.id === s.me)?.shot) return null; // 诸神黄昏的猎手死了才开枪（RagShotPanel）
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
  if (engineOf(s.script) !== 'snv' || s.phase !== 'day' || !me) return null;
  const close = () => setOpen(null);
  return (
    <div className="btn-row gossip-row snv-row">
      {me.canSavant && <Btn kind="primary" onClick={() => act('savant')} title="每个白天一次：得到一真一假两条信息">询问说书人</Btn>}
      {me.canArtist && <Btn kind="primary" onClick={() => setOpen('artist')} title="每局一次：私下问一个是非问题">提问</Btn>}
      {me.canFisherman && <Btn kind="primary" onClick={() => setOpen('fisherman')} title="每局一次：请说书人给一条帮你的阵营获胜的建议">请教说书人</Btn>}
      {me.canAmnesiac && <Btn kind="primary" onClick={() => setOpen('amnesiac')} title="每个白天一次：猜自己的能力，说书人告诉你猜得多准">猜我的能力</Btn>}
      {me.canPardon && <Btn kind="primary" onClick={() => setOpen('pardon')} title="每局一次：台上的人走下来，今天不再处决任何人">特赦</Btn>}
      {me.canDeclare && <Btn kind={me.madness && !me.madness.claimed ? 'primary' : 'secondary'} onClick={() => setOpen('declare')} title="公开说自己是某个角色，全场都看得到">公开声明</Btn>}
      {me.canJuggle && <Btn kind={me.role?.id === 'juggler' ? 'primary' : 'secondary'} onClick={() => setOpen('juggle')} title="公开猜最多五次玩家的角色；只有真杂耍艺人当晚会得知猜对几个">公开猜测</Btn>}
      {me.harpy && !me.harpy.claimed && <Btn kind="primary" onClick={() => setOpen('harpy')} title={`鹰身女妖要你疯狂地证明 ${me.harpy.name} 是邪恶的`}>公开指认</Btn>}
      {me.canDamsel && <Btn kind="secondary" onClick={() => setOpen('damsel')} title="爪牙合计有一次机会：公开猜谁是落难少女，猜中了邪恶获胜。谁都可以这么说">猜落难少女</Btn>}
      {open && createPortal(
        <div className="sheet-bg gossip-bg" onClick={close} role="presentation">
          <div className="gossip-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={{ declare: '公开声明', juggle: '公开猜测', artist: '提问', fisherman: '请教说书人', amnesiac: '猜我的能力', pardon: '特赦', harpy: '公开指认', damsel: '猜落难少女' }[open]}>
            {open === 'declare' && <DeclareForm s={s} act={act} onClose={close} />}
            {open === 'juggle' && <JuggleForm s={s} act={act} onClose={close} />}
            {open === 'artist' && <ArtistForm act={act} onClose={close} />}
            {open === 'amnesiac' && <AmnesiacForm act={act} onClose={close} />}
            {open === 'pardon' && <Confirm title="公开特赦" text="每局只能用一次。全场都会看到：台上的人走下处决台，今天不再处决任何人。" ok="特赦" onOk={() => act('pardon')} onClose={close} />}
            {open === 'harpy' && <Confirm title="公开指认" text={`全场都会看到你说「${me.harpy.name} 是邪恶的」。这就算你疯狂地证明过了；今天不说的话，黄昏时你们之中可能有人死亡。`} ok="公开说" onOk={() => act('harpyClaim')} onClose={close} />}
            {open === 'damsel' && <DamselForm s={s} act={act} onClose={close} />}
            {open === 'fisherman' && <Confirm title="请教说书人" text="每局只能请教一次。说书人会私下给你一条建议，告诉你该去做什么（不一定是一条事实）。现在就用吗？" ok="现在请教" onOk={() => act('fisherman')} onClose={close} />}
          </div>
        </div>, document.body)}
    </div>
  );
}

const scriptRoles = (script) => rolesOf(script);

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

function MadnessPanel({ me }) {
  const plain = me.hearing ? '可以用「公开声明」，也可以在广场上说。' : '用下面的「公开声明」说出来才算数：说书人听不到语音。';
  return (
    <Panel title="疯狂" tone="psy" className="moonchild-pnl">
      <p className="lead">今天你要努力让大家相信你是<b>{me.madness.role}</b>，不然可能被处决。{!me.mic ? plain : me.micOn ? '收音开着，说书人听得到你。' : '要打开收音，说书人才听得到你，只点「公开声明」不够。别人不知道你开了。'}</p>
      {me.mic && !me.micOn && <div className="btn-row"><Btn kind="primary" onClick={() => openMic(me.mic)}>打开收音</Btn></div>}
    </Panel>
  );
}

/** 被洗脑时屏幕中间要求开收音：传上来第一句话就自己消失。可以先收起来，右边的「疯狂」面板还能打开。 */
function MicDemand({ me }) {
  const [later, setLater] = useState(null); // 这个令牌（当天）点过「等会儿再开」
  const [opened, setOpened] = useState(false);
  if (!me?.mic || me.micOn || later === me.mic) return null;
  return createPortal(
    <div className="sheet-bg gossip-bg" role="presentation">
      <div className="gossip-modal mic-demand" role="alertdialog" aria-label="打开收音">
        <h3>你被洗脑了</h3>
        <p className="lead">今天你要努力让大家相信你是<b>{me.madness?.role}</b>。说书人只听得到收音，只点「公开声明」不够，不开收音很可能被处决。</p>
        <p className="muted">{opened ? '在打开的页面里点「开始收音」，然后说话。说书人听到第一句，这里就会关掉。' : '别人不知道你开了。音频不保存，转成文字后发给 AI 说书人判断。'}</p>
        <div className="btn-row">
          <Btn kind="primary" onClick={() => { setOpened(true); openMic(me.mic); }}>{opened ? '再打开一次' : '打开收音'}</Btn>
          <Btn onClick={() => setLater(me.mic)}>等会儿再开</Btn>
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
        ? <>你死了。想让大家以为你是{engineOf(s.script) === 'snv' ? '呆瓜' : '月之子'}的话，可以<b>公开选择一名存活的玩家</b>，大家看到的和真的一样，但不会有任何效果。不想选就点「不选」。</>
        : <>你得知了自己的死亡。<b>公开选择一名存活的玩家</b>——如果他是善良的，今晚他会死。别人也可能假装选人，所以大家不能确定你的身份。</>}</p>
      <Picker s={s} options={alive} picked={t ? [t] : []} onTap={(p) => setT(p.id)} />
      <div className="btn-row"><Btn kind="primary" disabled={!t} onClick={() => act('moonchild', { target: t })}>公开选择</Btn>{fake && <Btn onClick={() => act('moonchildSkip')}>不选</Btn>}</div>
    </Panel>
  );
}

export function Picker({ s, options, picked, onTap }) {
  return (
    <div className="picker">
      {options.map((id) => {
        const p = s.players.find((x) => x.id === id);
        const on = picked.includes(id);
        return (
          <button key={id} type="button" className={`pick ${on ? 'on' : ''} ${p.alive ? '' : 'dead'}`} onClick={() => onTap(p)}>
            <Portrait p={p} size={34} frame={on ? 'var(--red)' : '#f4f4f0'} />
            <span>{p.seat}号 {p.id === s.me ? '你' : p.name}</span>
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
        {s.timeline?.length > 0 ? <Replay timeline={s.timeline} /> : s.journal?.length > 0 && (
          <details className="st-journal">
            <summary>说书人手记 · {s.journal.length} 条判定</summary>
            <ul>{s.journal.map((j, i) => <li key={i}><span className="stamp-time">{j.when}</span>{j.text}</li>)}</ul>
          </details>
        )}
      </Panel>
    );
  }

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
    const needRole = !!prompt?.pickRole;
    const ready = picked.length === pickSpec.count && (!needRole || pickedRole);
    const hint = rk ? '你在今晚死去了。选一个人，乌鸦会告诉你他的身份。'
      : [pickSpec.count ? `选择 ${cnNum(pickSpec.count)} 名玩家` : '', needRole ? (pickSpec.count ? '，再选一个角色' : '选择一个角色') : '', '。', prompt?.optional ? '也可以今晚不用。' : ''].join('');
    return (
      <Panel title={v.who} tone={teamTone(roleId)} className="choose-pnl" extra={<Check color={v.color}>{v.skill}</Check>}>
        <p className="flavor-line">「{rk ? FLAVOR.ravenkeeper.wake : v.flavor?.wake}」</p>
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
        {s.isHost && !s.isST && <div className="btn-row"><Btn onClick={() => act('dawn')}>立刻天亮</Btn></div>}
      </Panel>
    );
  }

  if (mode) {
    const M = MODES[mode];
    return (
      <Panel title={M.title} tone="mot">
        <p className="lead">{M.hint}</p>
        <Picked picked={picked} name={name} need={1} />
        <div className="btn-row">
          <Btn kind="primary" disabled={!picked.length} onClick={confirm}>{M.confirm}</Btn>
          <Btn kind="ghost" onClick={() => setMode(null)}>取消</Btn>
        </div>
      </Panel>
    );
  }

  // 诸神黄昏：倒下的人正在决定开不开枪。自己倒下了就先开枪（自由活动也让路）；别人在自由活动时照常活动，看公告
  if (s.ragShot && (s.ragShot.mine || !s.roam)) return <RagShotPanel s={s} act={act} g={g} />;
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
          {s.vote.hidden ? <Stat value="?" label="票数投完公开" color="var(--opt)" /> : <Stat value={s.vote.yes.length} label="举手" color="var(--opt)" />}
          <Stat value={s.threshold} label="需要" color="var(--cream)" />
          {s.blockVotes > 0 && <Stat value={s.blockVotes} label="台上" color="var(--phy)" />}
        </div>
        {me && (locked
          ? <p className="lead">{raised ? '你举了手。票已锁定。' : '你没有举手。票已锁定。'}</p>
          : !can ? <p className="lead">你的幽灵票已经用掉了。</p>
            : (
              <p className="muted">{raised ? '你举着手（在画面中间可以放下）。' : '赞成处决就点画面中间的「举手」。'}</p>
            ))}
        <VoteTrack s={s} />
        {me && !me.alive && me.ghostVote && !locked && <p className="muted">你是鬼魂，只剩一张幽灵票。</p>}
      </Panel>
    );
  }

  if (s.boom) return <><BoomPanel s={s} act={act} g={g} />{roomCard}</>;
  if (s.pendingNom) return <><NomStage s={s} act={act} g={g} name={name} face={face} />{me?.canGoblin && <GoblinClaim act={act} />}{roomCard}</>;

  const meP = g(s.me);
  const lastDay = [...s.log].reverse().find((l) => l.kind === 'day' || l.kind === 'death');
  return (
    <>
      {roomCard}
      <Panel title={s.dayStage === 'morning' ? '清晨' : s.noms ? '提名' : '广场'} tone="light" className="square-pnl"
        extra={s.noms && !s.noms.timeUp ? <NomClock until={s.noms.until} /> : null}>
        {s.dayStage === 'morning' && lastDay && <p className="lead"><Line text={lastDay.text} /></p>}
        <div className="sq-board">
          <div><b>{s.aliveCount}</b><small>存活</small></div>
          <div><b>{s.threshold}</b><small>处决需要</small></div>
          <div className={s.block ? 'hot' : ''}><b>{s.block ? `${g(s.block)?.seat}号` : '—'}</b><small>{s.block ? `台上 · ${s.blockVotes} 票` : s.blockVotes ? '平票' : '处决台空着'}</small></div>
        </div>
        {s.noms && <p className="sq-status">{s.noms.timeUp ? '提名结束 · 投完这轮入夜' : `已表态 ${s.noms.done} / ${s.aliveCount}`}</p>}
        <GossipButton s={s} act={act} />
        <SlayButton s={s} setMode={setMode} />
        <SnvButtons s={s} act={act} />
        {s.executedToday && <p className="sq-status">今天的处决已经发生</p>}
        <div className="btn-row">
          {me?.alive && !s.executedToday && !meP?.nominator && !s.noms?.timeUp && (s.noms || s.settings?.mode === 'human') && <Btn kind="primary" onClick={() => setMode('nominate')}>提名</Btn>}
          {s.noms && !s.noms.timeUp && me?.alive && !meP?.nominator && !s.noms.skipped && <Btn onClick={() => act('skipNom')}>不提名</Btn>}
        </div>
        <div className="link-row">
          {s.isHost && <button type="button" onClick={() => act('roam')}>再自由活动一次</button>}
          {s.isHost && <button type="button" onClick={() => act('dusk')}>结束白天{s.block ? `（处决 ${g(s.block)?.seat}号）` : ''}</button>}
        </div>
      </Panel>
    </>
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
  const auto = raised && s.vote.nominator === s.me;
  if (auto && s.settings?.nominatorVotes) {
    return (
      <div className={`center-hand on locked ${big ? '' : 'small'}`}>
        <span>✋ 已投赞成</span>
        <small>你是提名者，这一票自动算赞成（锁定）</small>
      </div>
    );
  }
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
  if (me.evilInfo === false) text = '6 人及以下的局，官方规则里恶魔和爪牙互相不知道身份，恶魔也不拿伪装。自己挑一个善良角色来跳吧。（房主可以在大厅打开「小局也互认、发伪装」房规）';
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
export function InfoBox({ me }) {
  useEffect(() => { if (!me.inbox.length) return undefined; const t = setTimeout(() => tutEvent('journal'), 2500); return () => clearTimeout(t); }, [me.inbox.length]);
  return (
    <section className="info-box">
      <header><b>你得到的信息</b><small>{me.inbox.length ? `${me.inbox.length} 条 · 最新的在最上面` : ''}</small></header>
      {me.inbox.length ? <Journal me={me} /> : <p className="muted">还没有。夜里说书人告诉你的信息会出现在这里。</p>}
    </section>
  );
}

function Journal({ me }) {
  return (
    <ul className="journal">
      {[...me.inbox].reverse().map((m) => {
        const v = voiceOf(m.voice, ROLE_NAMES);
        return (
          <li key={m.id}>
            <span className="stamp-time">{m.phase}</span>
            <Line who={v.who} color={v.color} chip={v.skill ? `${v.skill} · 成功` : null} flavor={v.flavor?.hear} text={m.text} />
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
 * 右键（手机长按）一个人打标签、猜角色、写笔记。只存在自己设备上，别人看不到。说书人点人还是打开这个人的详情。
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
      <p className="mg-hint muted">{onTap ? '点一个人看详情。' : from ? `从 ${seat(from)}号 连「${LINKS[kind].label}」到谁？（再点一次 ${seat(from)}号 取消）` : '左键依次点两个人连线；右键（手机长按）一个人打标签、猜角色、写笔记。'}</p>
      <div className="mg-circle" ref={ref} style={{ height: w }}>
        <LinkLines marks={marks} posOf={posOf} w={w} h={w} gap={tk * 0.62} />
        {s.players.map((p, i) => {
          const { x, y } = pos(i);
          const m = marks[p.id] ?? {};
          const mine = p.id === s.me;
          const frame = allies[p.id] ? 'var(--phy)' : mine ? 'var(--mot)' : TAGS[m.tag]?.color ?? '#f4f4f0';
          return (
            <button key={p.id} type="button" className={`mg-token ${p.alive ? '' : 'dead'} ${from === p.id ? 'from' : ''}`} style={{ left: x, top: y, '--tk': `${tk}px` }}
              onClick={() => tap(p)}
              onContextMenu={(e) => { e.preventDefault(); stopHold(); openMenu(p, e.clientX, e.clientY); }}
              onPointerDown={(e) => { if (e.pointerType === 'mouse') return; const at = { x: e.clientX, y: e.clientY }; hold.current = { t: setTimeout(() => { hold.current = { fired: true }; openMenu(p, at.x, at.y); }, 500) }; }}
              onPointerUp={stopHold} onPointerLeave={stopHold}
              title={`${p.seat}号 ${p.name}${m.note ? `\n笔记：${m.note}` : ''}`}>
              <Portrait p={p} size={tk} frame={frame} speak={false} />
              <span className="mg-seat">{p.seat}</span>
              {!p.alive && <span className="mg-dead">{p.ghostVote ? '亡·余票' : '亡'}</span>}
              {m.note && <i className="mg-note">记</i>}
              <span className="mg-name">{mine ? '你' : p.name}</span>
              {p.roleName ? <span className="mg-role" style={{ background: ATTR[p.team]?.color ?? (p.evil ? 'var(--phy)' : 'var(--int)') }}>{p.roleName}</span> : <MarkBadge mark={m} />}
            </button>
          );
        })}
      </div>
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
function StDesk({ s, act, name }) {
  const st = s.st;
  const night = s.phase === 'night';
  return (
    <div className="desk">
      {night && (
        <Panel title="今夜" tone="mot">
          {st.waiting.length > 0 && <p className="lead">还在等：{st.waiting.map(name).join('、')}</p>}
          {st.rkPending && <p className="lead">守鸦人 {name(st.rkPending)} 正在选人。</p>}
          <div className="btn-row"><Btn kind="primary" onClick={() => act('dawn')}>{st.resolved ? '天亮' : '结算这一夜'}</Btn></div>
        </Panel>
      )}
      {st.artistAsks?.map((q) => (
        <Panel key={q.uid} title="艺术家的问题" tone="mot">
          <p className="lead">{name(q.uid)}：{q.text}</p>
          <div className="btn-row">
            {[['true', '是'], ['false', '不是'], ['unknown', '我不知道']].map(([v, label]) => (
              <Btn key={v} onClick={() => act('st', { action: 'artistAnswer', target: q.uid, text: v })}>{label}</Btn>
            ))}
          </div>
        </Panel>
      ))}
      {st.pendingInfo.length > 0 && <Tag>待发的信息 · {st.pendingInfo.length}</Tag>}
      {st.pendingInfo.map((m) => <InfoItem key={m.id} m={m} name={name} act={act} />)}
      {s.bluffs && <p className="muted">恶魔的伪装：{s.bluffs.join('、')}</p>}
      <p className="muted">点肖像（或「镇民」面板）可以杀死、复活、下毒、改角色、私下传话。</p>
      <ul className="history">{[...st.log].reverse().map((l) => <li key={l.id}><Line who="魔典" color="var(--mot)" text={l.text} /></li>)}</ul>
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
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <div className="btn-row">
        <Btn kind="primary" onClick={() => act('info', { id: m.id, action: 'send', text: text === plain ? m.text : text })}>{text === plain ? '发送' : '发送改过的'}</Btn>
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
  const run = (fn) => async () => { await fn(); onClose(); };
  const day = s.phase === 'day';
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
