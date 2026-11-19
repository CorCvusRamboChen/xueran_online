// 大厅：参考极乐迪斯科主菜单——手绘的雪夜小镇铺满首屏，左边大标题和一列竖排菜单；
// 右边是镇民名册（带阵营构成）、挑形象、房间设置（按夜晚 / 白天分组）。
import { Portrait } from './util.jsx';
import { stepWake, wakeOf, WAKE_LABEL } from '../../src/shared/nightWake.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import { MODEL_CHARS } from './world/models.js';
import { AVATAR_3D_ON } from './display.js';
import { Tag, Panel, Btn } from './ui.jsx';
import { ClockTower, Tree, Lamp, House, MAP_COLORS as C, INK } from './art/TownArt.jsx';
import { SCENE_ART, ROLE_ART } from './art.js';
import { ROLES, SCRIPTS, TEAM_NAME, DISTRIBUTION, rolesOf, inScript, engineOf, playersOf, travellersOf } from '../../src/engine/roles.js';
import { AvalonDist, AvalonSettings, AvalonShowcase } from './Avalon.jsx';
import { MarkDist, MarkSettings, MarkShowcase } from './Mark.jsx';
import { ATTR } from './flavor.js';
import { AbilityCard } from './AbilityCard.jsx';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeedbackBoard } from './Feedback.jsx';
import { Replay, VoteHistory } from './replay.jsx';
import { SETUPS, presetsFor, PRESET_SHARE } from '../../src/shared/setups.js';
import { Glossed } from './terms.jsx';
import { NIGHT_ORDER, STEP_NAMES } from '../../src/shared/nightOrder.js';
import { WwShowcase, wwDist } from './Werewolf.jsx';
import { TutorialIntro } from './TutorialIntro.jsx';
import { VolumeButton } from './Volume.jsx';
import { fromKook, inviteFriends, onDiscordMobile, openInBrowser, soloMode } from './connect.js';

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

// 手机 Discord 里坐下时弹一次（这台设备记住，不再弹）
const HINT_KEY = 'botc-browser-hint';
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } };
const markHintSeen = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 存不了就下次再弹 */ } };

/** 手机上 Discord 每次把人拉去别的语音频道（进屋私聊、回广场），活动都可能被收成小窗、甚至退出：建议去浏览器里玩。 */
function BrowserHint({ toast, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="role-modal browser-hint" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="建议在浏览器里玩">
        <h3>手机上建议在浏览器里玩</h3>
        <p>这局进屋私聊、回广场集合时，机器人会把你在不同的语音频道之间移动。手机上的 Discord 每移动一次，都可能把这个小应用收起来或者切出去，你得一次次点回来，容易错过夜里行动和投票。</p>
        <p>在浏览器里打开就不会被打断：还是你、还是这一局，<b>语音照旧在 Discord 里聊</b>，别退出语音频道就行。</p>
        <div className="btn-row">
          <Btn kind="primary" disabled={busy} onClick={async () => { setBusy(true); const msg = await openInBrowser(); if (msg) toast?.(msg); onClose(); }}>在浏览器打开</Btn>
          <Btn kind="ghost" onClick={onClose}>留在 Discord</Btn>
        </div>
        <p className="muted">以后想换，在设置面板的最下面也能点「在浏览器打开」（大厅里叫「设置」，对局里在齿轮里）。</p>
      </div>
    </div>
  );
}

export function Lobby({ s, act, ask, onTutorial, toast }) {
  const host = s.isHost;
  const st = s.settings;
  const joined = s.lobby.some((p) => p.id === s.me);
  const n = s.lobby.length;
  const seat7 = !!SCRIPTS[st.script]?.seat7 && n >= 6; // 七步成诗：开局时插进 7 号空座，人数表按多一人算
  const d = DIST[n + (seat7 ? 1 : 0)];
  const ww = !!SCRIPTS[st.script]?.werewolf; // 狼人杀、诸神黄昏：不是血染，配置、房规都不一样
  const [lo, hi] = playersOf(st.script ?? 'tb'); // 小剧本只能 5–6 人
  const set = (patch) => act('settings', patch);
  const human = st.mode === 'human';
  const [intro, setIntro] = useState(false); // 新手教程的开场介绍
  // 不是房主也能点剧本卡「看看」：介绍和角色展示换成那个剧本，房间的剧本不变（2026-11-11 用户要的）
  const [peek, setPeek] = useState(null);
  useEffect(() => { setPeek(null); }, [st.script]); // 房主换了剧本：跟过去
  const shown = peek ?? st.script ?? 'tb';
  const shownWW = !!SCRIPTS[shown]?.werewolf;
  const [browserHint, setBrowserHint] = useState(false); // 手机 Discord 里坐下后：建议去浏览器里玩
  const [feedback, setFeedback] = useState(false); // 意见箱（2026-11-20 用户：设置下面加反馈）
  const [menu, setMenu] = useState(null); // 右键某人的头像：{ id, x, y }（让出房主、标新手、请他离开）

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
            <Tag tone="dark">{`${SCRIPTS[st.script]?.name ?? SCRIPTS.tb.name} · ${(SCRIPTS[st.script]?.en ?? SCRIPTS.tb.en).toUpperCase()}`}</Tag>
            {soloMode && <Tag tone="mot">单机试玩</Tag>}
          </div>
          <nav className="menu">
            {!(human && host) && (joined
              ? <Btn kind="secondary" className="menu-item" onClick={() => act('leave')}>离开座位</Btn>
              : <Btn kind="primary" className="menu-item" onClick={async () => { if (await act('join') && onDiscordMobile() && !hintSeen()) setBrowserHint(true); }}>加入游戏</Btn>)}
            {host && <Btn kind={n >= lo && n <= hi ? 'primary' : 'secondary'} className="menu-item" disabled={n < lo || n > hi} onClick={() => act('start')}>开始游戏{n < lo ? `（还差 ${lo - n} 人）` : n > hi ? `（这个剧本最多 ${hi} 人）` : ''}</Btn>}
            {soloMode && host && <SoloBots s={s} act={act} />}
            {!host && !s.hostOnline && <Btn className="menu-item" onClick={() => act('claimHost')}>房主不在，接管房主</Btn>}
            {!host && s.hostOnline && <p className="menu-wait">等房主{s.hostName ? `「${s.hostName}」` : ''}开始……</p>}
            {!host && s.hostOnline && <Btn kind="secondary" className="menu-item" onClick={() => act('claimHost')}>房主没反应？接管房主</Btn>}
            {onTutorial && <Btn className="menu-item menu-tut" onClick={() => setIntro(true)}>新手教程（1 分钟动画 + 练习局）</Btn>}
            <div className="menu-row">
              <VolumeButton className="btn btn-secondary menu-item menu-vol" label="设置" />
              <Btn className="menu-item" onClick={() => setFeedback(true)}>反馈</Btn>
            </div>
            {feedback && <FeedbackBoard ask={ask} toast={toast} onClose={() => setFeedback(false)} />}
            {intro && createPortal(<TutorialIntro onStart={() => { setIntro(false); onTutorial(); }} onClose={() => setIntro(false)} />, document.body)}
            {browserHint && createPortal(<BrowserHint toast={toast} onClose={() => { markHintSeen(); setBrowserHint(false); }} />, document.body)}
          </nav>
          <ul className="lobby-tips">
            {soloMode ? <>
              <li>单机试玩：这张桌子只有你和机器人，别人进不来；没有语音，机器人自己提名、投票。</li>
              <li>选好剧本，用上面的按钮把机器人加到想要的人数，点「开始游戏」。打完的局不算进排行榜，也不发金币。</li>
              <li>想和朋友一起玩、用语音聊：在 Discord 里打开这个活动，或者在 KOOK 发「/血染」。</li>
            </> : <><li>大家先进同一个语音频道，<b>房主也要在里面</b>——机器人会把它当成城镇广场。</li>
            {fromKook
              ? <li>在 KOOK 文字频道发<b>「/血染」</b>，每个人点卡片上的按钮领自己的进入链接；语音还是在 KOOK 里聊。</li>
              : <li>从<b>文字频道</b>的应用启动器打开：进房子私聊时被拉去别的语音频道，也不会掉线。</li>}</>}
          </ul>
        </section>

        {/* 右：镇民、形象、房间设置 */}
        <section className="lobby-right">
          <Panel title="镇民" className="glass" extra={<span className="lr-extra">
            {host && !soloMode && n < hi && <button type="button" className="lr-addbot" onClick={() => act('addBots', { count: 1 })} title="加一个机器人玩家">＋ 机器人</button>}
            <span className="muted">{n} / {hi}</span>
          </span>}>
            {st.script === 'avalon' ? <AvalonDist n={n} /> : st.script === 'mark' ? <MarkDist n={n} /> : <DistBar n={n} d={d} lo={lo} hi={hi} parts={ww ? wwDist(n, st.script) : null} />}
            {SCRIPTS[st.script]?.seat7 && <p className="muted seat7-note">🪑 灯神规则：<b>7 号座位留空</b>，照样发角色，由说书人替它做决定，每局还会替它发言一次。{seat7 ? `开局后共 ${n + 1} 个座位。` : ''}</p>}
            {!n && <p className="muted">广场上还空无一人。</p>}
            {(
              <div className="lobby-roster">
                {s.lobby.flatMap((p, i) => [
                  // 七步成诗：开局时 7 号座位插一张空椅子，后面的人往后挪一位，这里先画出来
                  ...(seat7 && i === 6 ? [<div key="seat7" className="lr-item lr-empty" title="7 号座位留空：照样发角色，由说书人替它做决定"><span className="lr-chair" aria-hidden="true">🪑</span><span className="lr-seat">7</span><span className="lr-name">空座</span></div>] : []),
                  <div key={p.id} className={`lr-item ${p.id === s.me ? 'me' : ''}`}
                    onContextMenu={(e) => { if (!host || p.id === s.me) return; e.preventDefault(); setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
                    {...longPress(() => host && p.id !== s.me && setMenu((m) => m ?? { id: p.id, ...lastTouch }))}>
                    <Portrait p={p} size={52} frame={p.id === s.me ? 'var(--mot)' : '#f4f4f0'} />
                    <span className="lr-seat">{seat7 && i >= 6 ? i + 2 : i + 1}</span>
                    <span className="lr-name">{p.id === s.me ? '你' : p.name}</span>
                    {/* 新手标记：大家都看得到；房主点一下切换（机器人不用标） */}
                    {(host && !p.id.startsWith('bot-')) ? (
                      <button type="button" className={`lr-newbie ${s.newbies?.includes(p.id) ? 'on' : ''}`} onClick={() => act('markNewbie', { player: p.id, on: !s.newbies?.includes(p.id) })}
                        title="标成新手：发身份时尽量避开难角色，机器人和 AI 说书人也会照顾一下">{s.newbies?.includes(p.id) ? '新手' : '+新手'}</button>
                    ) : s.newbies?.includes(p.id) && <span className="lr-newbie on">新手</span>}
                    {host && p.id !== s.me && <button type="button" className="kick" onClick={() => act('kick', { target: p.id })} aria-label="请他离开">×</button>}
                  </div>,
                ])}
                {seat7 && n === 6 && <div className="lr-item lr-empty" title="7 号座位留空：照样发角色，由说书人替它做决定"><span className="lr-chair" aria-hidden="true">🪑</span><span className="lr-seat">7</span><span className="lr-name">空座</span></div>}
                {/* 最后一格：虚线框里一个加号，点了邀请朋友（Discord 的邀请框 / 分享链接，见 connect.js） */}
                {n < hi && (
                  <div className="lr-item">
                    {soloMode
                      ? host && <button type="button" className="lr-invite" onClick={() => act('addBots', { count: 1 })} aria-label="加一个机器人" title="加一个机器人">+</button>
                      : <button type="button" className="lr-invite" onClick={async () => { const msg = await inviteFriends(); if (msg) toast?.(msg); }} aria-label="邀请朋友进来" title="邀请朋友进来">+</button>}
                  </div>
                )}
              </div>
            )}
            {host && !soloMode && n > 1 && <p className="muted lr-hint">右键（手机长按）别人的头像：让他当房主、标成新手、请他离开</p>}
            {menu && <RosterMenu s={s} act={act} at={menu} onClose={() => setMenu(null)} />}
            <Watchers s={s} hint={!joined ? '你现在在观战席。点「加入游戏」坐下；不加入就是观战，开局后能看广场和投票，看不到别人的身份。' : null} />
          </Panel>

          {joined && AVATAR_3D_ON && <CharacterPicker s={s} act={act} />}
          {/* 衣柜（3D 小人换装）先隐藏：<Wardrobe s={s} act={act} /> */}

          <Panel title="房间设置" className="glass" extra={!host ? <span className="muted">只有房主能改</span> : null}>
            <ScriptPicker value={st.script ?? 'tb'} peek={peek} host={host} onPick={(id) => (host ? set({ script: id }) : setPeek(id === (st.script ?? 'tb') ? null : id))} />
            {peek && (
              <p className="script-peek-note">只是看看《{SCRIPTS[peek].name}》的介绍和角色：房间现在玩的是《{SCRIPTS[st.script ?? 'tb'].name}》，只有房主能换。
                <button type="button" onClick={() => setPeek(null)}>回到当前剧本</button></p>
            )}
            <p className="muted setting-note">{{ bmr: '《黯月初升》：中等难度的"死亡盛宴"——恶魔一夜可能杀多人，好人有很多保命和复活手段。推荐 7 人及以上。', snv: '《梦殒春宵》：困难，最疯狂的一本——信息很多但不一定可靠，角色和阵营都会中途改变，还有疯狂机制。',
              ngj: '《无上愉悦》：官方 5–6 人小剧本，二十分钟一局，又短又吵。角色都来自前三个剧本；关键是弄清在场的是红唇女郎还是男爵。地图是冬夜集市的钟楼广场。',
              ww: '《狼人杀》：娱乐模式，不是血染——经典网杀「预女猎守」。狼人每晚刀人，守卫、女巫、预言家各显神通；第一天竞选警长（1.5 票、定发言顺序）；白天轮流发言、同时投票放逐，平票 PK；狼人可以自爆。屠边：狼人全死好人赢，神职或平民全死狼人赢，同时达成算狼人赢。',
              rag: '《诸神黄昏》：狼人杀的板子（娱乐模式，不是血染），只有狼人和猎人。狼人互相认识，每晚一起刀一人；猎人出局（被刀或被放逐）可以开一枪，打谁谁死，被带走的猎人接着开。白天照狼人杀：竞选警长、发言、放逐投票。狼人全部出局好人胜，猎人全部出局狼人胜。',
              avalon: '《阿瓦隆》：娱乐模式，不是血染——照《抵抗组织：阿瓦隆》原版规则。没有夜里杀人、没有处决：队长组队，所有人公开投票，队员秘密出任务票。好人完成三次任务后，刺客还有一次认出梅林的机会。5–10 人。',
              mark: '《暗印》：原创娱乐模式，不是血染。每天天亮，每个人后颈烙上一个新的印记（♠♥♦♣ 之一），自己看不到——只有和别人关在同一栋房子里，才能绕到他身后看他的（每天看两个人，他只知道你看了他），别人可能骗你。坏人照血染人数（1 个头头，其余手下）：头头有两次机会看自己，手下能在看人背后的那一刻把他的印记调包。回到广场圆桌讨论，没有投票。入夜在自己家里写下自己的印记，写错就在屋里炸开。坏人全死好人赢，坏人追平好人坏人赢。5–15 人。',
              luf: '《窃窃私语》：官方 5–6 人小剧本。恶魔利维坦不杀人，但处决两个好人、或者撑到第五天结束，邪恶就赢；失忆者、食人族不知道自己的能力。地图是雾锁溪谷的驿站。',
              cat: '《冒名钓鱼》（Catfishing，作者 Emily）：最有名的自定义剧本之一，角色全来自三个基础剧本和实验性角色。谁都可能顶着别人的身份：舞蛇人会和恶魔换身，哲学家拿别人的能力，疯子以为自己是恶魔，失忆者不知道自己的能力。人多更好玩。地图是雾夜的钟楼港口。',
              hhr: '《哈罗德的复仇》（Harold Holt\'s Revenge，作者 Theo，官方推荐）：恶魔是不杀人的利维坦——处决两个好人或撑到第五天邪恶就赢；洗脑师、麻脸巫婆、哥布林、提线木偶轮番搅局，政客可能在终局倒戈。地图是涨潮的海港。',
              pie: '《洋葱派》（Onion Pies，作者 Tej，官方推荐）：底子是暗流涌动，新手也能上手；多了小精灵（疯狂地扮演一个镇民，他死了你接手）、食人魔（跟着选的人站队、自己不知道站哪边）和提线木偶。地图是烤派的冬夜。',
              trust: '《大诚小镇》（Trust，作者 Milk）：醉酒中毒很少、信息大多可信，难的是信谁——政客、灵言师（说出他的关键词就变邪恶，大家都会收到收音页）、提线木偶、疯子。地图是守信的晚钟。',
              oe: '《横行霸道》（Outed Evil v4.5.0，作者 Manny，美术 Lei & 摸鱼）：染钟楼谜团剧本世界杯第二名，7–15 人。坏人会「出头」：恐惧之灵换目标全场都知道、精神病患者白天当众杀人、哥布林被提名时自曝；恶魔是小恶魔或痢蛭（宿主活着就杀不死它）。好人有将军、渔夫、博学者这些靠说书人的角色，还有能把胜负对调的异端分子。',
              mo: '《夜半狂欢》（The Midnight Oasis，作者 Zets，钟楼剧本博物馆美术）：「旋转木马」实验角色的快速上手剧本，7–15 人。工程师能把恶魔或爪牙换成别的角色；罂粟种植者活着时坏人互相不认识；精神病患者白天直接杀人，被处决还要猜拳；恶魔哈迪寂亚选三个人，让他们自己选活还是死，三个都活就都死。偶尔整局没有邪恶（无神论者），这时要处决说书人才赢；但没有无神论者时处决说书人，邪恶当场获胜。传奇角色哨兵、圣洁之魂。',
              sar: '《裁缝与暴乱》（作者 Sui，杭州说书人圈子里流传的极速板子）：所有善良都是女裁缝（整局一次，夜里看两个人是不是同一阵营），所有邪恶都是暴乱。白天谁被提名谁当场死，不投票，死的人还能立刻接着提名——第三天必须提名，第三天结束暴乱还活着就是邪恶赢。没有夜刀，也没有别的信息，第一天就吵成一团。传奇角色骗人精：整局一次，一名善良玩家可能拿到错误信息。',
              booz: '《瞒天过海》（Boozling v9，作者 Lau）：2022 年剧本世界杯冠军，集石有官方中文名，中文社区常拿来当新手进阶剧本。好人多是限次能力：猎手一枪、渔夫一问、巡山人能把落难少女救走、魔像整局只能提名一次（提的不是恶魔就当场死）；坏人靠洗脑师、提线木偶、诺-达鲺和酒鬼把信息搅乱。地图是醉醺醺的旅店。',
              twv: '《暗流紫罗兰》（Trouble with Violets，作者 Ben Burns）：暗流涌动的全部好人，对上梦殒春宵的全部坏人。好人信息直白，坏人会换角色、换阵营、让信息全错，邪恶偏强。地图是落雪的紫罗兰花园。',
              ucd: '《生死未卜》（Uncertain Death，作者 Matt）：社区里口碑最稳的自定义剧本之一，角色全来自三个基础剧本和提线木偶。谁会死、怎么死都说不准：刺客无视保护、教父加刀、普卡隔一晚才毒死人、诺-达鲺让邻座镇民一直中毒；提线木偶以为自己是镇民，其实是坐在恶魔旁边的爪牙。地图是守灵夜的钟楼广场。',
              ecp: '《人人可玩》（Everyone Can Play，作者 Ben Burns，官方推荐）：只用三个基础剧本的角色，大部分是暗流涌动的老面孔。夜里多死人（赌徒、刺客、月之子），白天有人处决不死（弄臣、魔鬼代言人），镇长撑到最后能直接赢。新手照常玩，老手当成解谜。地图是早春夜的钟楼广场。',
              bs7: '《七步成诗》：2025 剧本世界杯冠军（作者 TrashWarlock）。7 号座位没有人坐，照样有角色，由 AI 说书人替它选人，每局替它发言一次——它可能是好人，也可能是恶魔。有贵族、村夫、魔术师、落难少女、炸弹人等新角色。地图是月下诗会的驿站。' }[shown] ?? '《暗流涌动》：入门剧本，信息多、规则直白，推荐第一次玩。'}</p>
            {!host ? <p className="muted setting-note host-only-note">配置、说书人、计时和房规由房主决定，只有房主看得到。</p>
              : st.script === 'avalon' ? <AvalonSettings st={st} set={set} n={n} Toggle={Toggle} /> : st.script === 'mark' ? <MarkSettings st={st} set={set} Toggle={Toggle} Select={Select} /> : ww ? (
              <div className="setting-wrap"><div className="setting-groups">
                <div className="setting-col">
                  <div className="setting-group">
                    <h4>开局与夜晚</h4>
                    <p className="muted setting-note">按人数表发身份（下面「狼人杀 · 预女猎守」里有表），法官全自动。</p>
                    <Toggle label="随机排座位" on={st.shuffle} onChange={(v) => set({ shuffle: v })} />
                    {!soloMode && <Toggle label="夜里闭麦闭耳" on={st.nightDeafen} onChange={(v) => set({ nightDeafen: v })} />}
                    <Select label="夜里行动 / 投票时限" value={st.chooseSeconds} options={[30, 45, 60, 90, 120]} unit="秒" onChange={(v) => set({ chooseSeconds: v })} />
                  </div>
                </div>
                <div className="setting-col">
                  <div className="setting-group">
                    <h4>白天</h4>
                    <Select label="每人发言" value={st.speechSeconds ?? 90} options={[30, 60, 90, 120, 180]} unit="秒" onChange={(v) => set({ speechSeconds: v })} />
                    {!soloMode && <Toggle label="发言时其他人闭麦" on={st.speechMute} onChange={(v) => set({ speechMute: v })} />}
                  </div>
                  {!soloMode && <div className="setting-group">
                    <h4>观战</h4>
                    <Toggle label="观战者能看所有身份" on={st.spectatorGrimoire} onChange={(v) => set({ spectatorGrimoire: v })} />
                    <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} onChange={(v) => set({ muteSpectators: v })} />
                  </div>}
                </div>
              </div></div>
            ) : <>
            <div className="setting mode-row">
              <span>配置</span>
              <div className="seg">
                {[['preset', '推荐预设'], ['ai', 'AI 配置'], ['random', '完全随机']].map(([id, label]) => (
                  <button key={id} type="button" className={(st.setupMode ?? 'preset') === id ? 'on' : ''} onClick={() => set({ setupMode: id })}>{label}</button>
                ))}
              </div>
            </div>
            <p className="muted setting-note">{(() => {
              const mode = st.setupMode ?? 'preset';
              if (st.script === 'rag') return '诸神黄昏：按人数定狼人数量（5–6 人 1 只、7–9 人 2 只、10–12 人 3 只、13–15 人 4 只），其余全是猎手；三种配置在这里都一样。';
              if (SCRIPTS[st.script]?.teensy) return '小剧本：按官方人数表随机发角色（三种配置在这里都一样）。男爵在已有一个外来者时只加一个，有气球驾驶员时可能多一个外来者。';
              if (mode === 'ai') return 'AI 配置：随机出几十套，按强弱打分挑中间的——强神对强神、弱神对弱神；还会照顾信息位和保护角色别扎堆。';
              if (mode === 'random') return '完全随机：按人数表纯随机抽角色，不调平衡（可能很偏）。';
              const list = presetsFor(st.script ?? 'tb', n);
              const off = list.filter((x) => x.official).length;
              return list.length
                ? `推荐预设：${n} 人有 ${list.length} 套推荐配置${off ? `（官方 ${off} 套，优先）` : ''}，大约 ${Math.round(PRESET_SHARE * 100)}% 的局从里面挑，其余用 AI 配置。`
                : n ? `推荐预设：${n} 人还没有推荐配置，会用 AI 配置。` : '推荐预设：按坐下的人数从推荐配置里挑，这个人数没有的话用 AI 配置。';
            })()}</p>
            {st.script === 'mo' && <><div className="setting mode-row">
              <span>恶魔</span>
              <div className="seg">
                {[['vigormortis', '亡骨魔'], ['lilmonsta', '小怪宝'], ['leviathan', '利维坦']].map(([id, label]) => (
                  <button key={id} type="button" className={(st.moDemon ?? 'vigormortis') === id ? 'on' : ''} onClick={() => set({ moDemon: id })}>{label}</button>
                ))}
              </div>
            </div>
            <p className="muted setting-note">{{
              vigormortis: '原版：恶魔是哈迪寂亚或亡骨魔。',
              lilmonsta: '亡骨魔换成小怪宝：没有恶魔玩家、多一个爪牙；爪牙每晚选一名爪牙照看它，照看的人「是恶魔」，他死了善良获胜；首夜以外说书人每晚杀一人。',
              leviathan: '亡骨魔换成利维坦：不杀人，所有人都知道它在场；处决第二名善良玩家、或者第 5 个白天结束，邪恶获胜。',
            }[st.moDemon ?? 'vigormortis']}抽到哈迪寂亚的局不受影响。</p></>}
            {s.roleAssign && n > 0 && <RoleAssign s={s} act={act} script={st.script ?? 'tb'} />}
            {!soloMode && <><div className="setting mode-row">
              <span>说书人</span>
              <div className="seg">
                <button type="button" className={!human ? 'on' : ''} onClick={() => set({ mode: 'auto' })}>AI 房主</button>
                <button type="button" className={human ? 'on' : ''} onClick={() => set({ mode: 'human' })}>真人说书</button>
              </div>
            </div>
            <p className="muted setting-note">{human ? '房主看魔典、审核每条夜间信息；机器人负责发身份、叫人、跑流程。' : 'AI 房主全自动：发身份、夜里叫人、像真人说书人一样做判定、给提名和投票计时、用语音播报旁白，不需要人主持。'}</p></>}
            {/* 四组：左边开局和夜晚，右边白天和观战。「房规」是和官方规则不一样的地方，标个小标签 */}
            <div className="setting-wrap"><div className="setting-groups">
              <div className="setting-col">
                <div className="setting-group">
                  <h4>开局与身份</h4>
                  <Toggle label="随机排座位" on={st.shuffle} onChange={(v) => set({ shuffle: v })} />
                  {(st.script ?? 'tb') === 'tb' && <Toggle rule label="7 人以下不发男爵" on={st.smallNoBaron ?? true} onChange={(v) => set({ smallNoBaron: v })} />}
                  <Toggle rule label="小局也互认、发伪装" on={st.smallEvilInfo} onChange={(v) => set({ smallEvilInfo: v })} />
                  <Toggle rule label="爪牙共用恶魔的 3 个伪装" on={st.minionBluffs} onChange={(v) => set({ minionBluffs: v })} />
                </div>
                <div className="setting-group">
                  <h4>夜晚</h4>
                  {!soloMode && <Toggle label="夜里闭麦闭耳" on={st.nightDeafen} onChange={(v) => set({ nightDeafen: v })} />}
                  <Select label="选人时限" value={st.chooseSeconds} options={[30, 45, 60, 90, 120]} unit="秒" onChange={(v) => set({ chooseSeconds: v })} />
                  {['tb', 'bmr'].includes(engineOf(st.script)) && <Toggle rule label="夜里死了仍拿信息（醉酒）" on={!!st.deadDrunk} onChange={(v) => set({ deadDrunk: v })} />}
                  {st.script === 'bmr' && <Toggle rule label="疯子（以为是僵怖）死后照样醒" on={!!st.lunaticGhost} onChange={(v) => set({ lunaticGhost: v })} />}
                  {inScript('mezepheles', st.script) && <Toggle rule label={st.mezEasy !== false ? '灵言师的关键词：简单（日常词，好引导）' : '灵言师的关键词：普通（不常见的词，官方口径）'} on={st.mezEasy !== false} onChange={(v) => set({ mezEasy: v })} />}
                  {(inScript('mutant', st.script) || inScript('cerenovus', st.script)) && s.hearAvailable && <Toggle label="语音判定疯狂（机器人留在广场转写被疯狂的人，开局前告诉大家）" on={!!st.hearMadness} onChange={(v) => set({ hearMadness: v })} />}
                </div>
              </div>
              <div className="setting-col">
                <div className="setting-group">
                  <h4>白天</h4>
                  <Select label="自由活动" value={st.roamMinutes} options={[2, 3, 5, 8, 10, 0]} unit="分钟" zero="不限时" onChange={(v) => set({ roamMinutes: v })} />
                  <Select label="提名环节" value={st.nominateMinutes} options={[2, 3, 5, 8, 10]} unit="分钟" onChange={(v) => set({ nominateMinutes: v })} />
                  <Select label="提名理由" value={st.accuseSeconds} options={[15, 30, 60, 90, 120]} unit="秒" onChange={(v) => set({ accuseSeconds: v })} />
                  <Select label="辩护时间" value={st.defendSeconds} options={[30, 60, 90, 120, 180]} unit="秒" onChange={(v) => set({ defendSeconds: v })} />
                  <Select label="投票时钟每人" value={st.voteSeconds} options={[1, 2, 3, 4, 5]} unit="秒" onChange={(v) => set({ voteSeconds: v })} />
                  {!soloMode && <Toggle label="发言时其他人闭麦" on={st.speechMute} onChange={(v) => set({ speechMute: v })} />}
                  <Toggle rule label="提名者自动举手（可以放下）" on={st.nominatorVotes} onChange={(v) => set({ nominatorVotes: v })} />
                  <Toggle rule label="投票时隐藏票型（投完公开）" on={st.hideVotes} onChange={(v) => set({ hideVotes: v })} />
                  <Toggle label="赛后军事法庭（AI 在输的一方判一名战犯，全场看他被吊起来）" on={st.warCourt !== false} onChange={(v) => set({ warCourt: v })} />
                </div>
                {!soloMode && <div className="setting-group">
                  <h4>观战</h4>
                  <Toggle label="观战者能看魔典（所有身份）" on={st.spectatorGrimoire} onChange={(v) => set({ spectatorGrimoire: v })} />
                  <Toggle label="观战者在语音里闭麦" on={st.muteSpectators} onChange={(v) => set({ muteSpectators: v })} />
                </div>}
              </div>
            </div></div>
            </>}
          </Panel>
        </section>

        <RecordAndHistory s={s} ask={ask} />
        {shownWW ? <WwShowcase n={n} script={shown} /> : shown === 'avalon' ? <AvalonShowcase /> : shown === 'mark' ? <MarkShowcase ask={ask} st={st} /> : <RoleShowcase script={shown} />}
      </div>
    </div>
  );
}

/** 单机试玩：去掉一个机器人（加机器人用上面的按钮，或者座位最后的「+」）。 */
function SoloBots({ s, act }) {
  const bots = s.lobby.filter((p) => p.fake);
  if (!bots.length) return null;
  return <Btn className="menu-item" onClick={() => act('kick', { target: bots.at(-1).id })}>去掉一个机器人</Btn>;
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

      {(p.bestMate || p.worstMate) && (
        <section className="rec-sec">
          <h3>队友 <small>同一阵营打过 4 局以上的人</small></h3>
          <div className="rec-mates">
            {[['最好的队友', p.bestMate, 'good'], ['最坏的队友', p.worstMate, 'bad']].filter(([, m]) => m).map(([label, m, tone]) => (
              <div key={label} className={`rec-mate ${tone}`}>
                <Portrait p={{ id: m.id, name: m.name, avatar: m.avatar }} size={34} prefer="avatar" speak={false} frame="#6d6a62" />
                <div>
                  <small>{label}</small>
                  <b>{m.name}</b>
                  <span>一起 {m.games} 局，赢 {m.wins} 局 · {pct(m.wins, m.games)}</span>
                </div>
              </div>
            ))}
          </div>
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
 * 战绩和往期对局（大厅最下面一整块）：个人胜率合并所有服务器，排行榜列在这个服务器打过的人，往期对局只有这个服务器的（服务器 statsFor / listGames）。
 * 左边是一个人的战绩卡（默认是你，点右边表里的人看他的）；右边两页：排行榜（表头可以点着换排法）和往期对局
 * （选中的人参加过的局会标出他那局的角色和输赢）。
 */
function RecordAndHistory({ s, ask }) {
  const [st, setSt] = useState(null);
  const [all, setAll] = useState(null); // 全服排行榜：所有服务器合计（服务器 statsAll）
  const [games, setGames] = useState(null);
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState('wins');
  const [tab, setTab] = useState(soloMode ? 'all' : 'board'); // 单机试玩没有「这个服务器」，只有全服排行榜
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!soloMode) {
      ask?.('stats').then((r) => setSt(r?.stats ?? null)).catch(() => {});
      ask?.('history').then((r) => setGames(r?.games ?? [])).catch(() => {});
    }
    ask?.('stats', { scope: 'all' }).then((r) => setAll(r?.stats ?? null)).catch(() => {});
  }, []);
  if (!st?.games && !games?.length && !all?.games) return null;
  const cur = tab === 'all' ? all : st;
  const players = cur?.players ?? [];
  const me = players.find((p) => p.id === s.me);
  const [, , key, ok] = SORTS.find((x) => x[0] === sort);
  const board = players.filter(ok).sort((a, b) => key(b) - key(a) || b.games - a.games);
  const shown = players.find((p) => p.id === pick) ?? me ?? (soloMode ? board[0] : null); // 单机试玩自己没有战绩：先看榜首的
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
        <h2>{soloMode ? '全服排行榜' : '战绩与往期对局'}</h2>
        <p className="muted">{tab === 'all'
          ? `${all?.games ? `所有服务器合计打完了 ${all.games} 局（${all.guilds} 个服务器），善良赢 ${pct(all.goodWins, all.games)}。` : ''}这里是所有服务器的真人玩家合起来排的${soloMode ? '；单机试玩的局不算进排行榜' : ''}。点表里的人看他的战绩。`
          : `${st?.games ? `这个服务器打完了 ${st.games} 局，善良赢 ${pct(st.goodWins, st.games)}，邪恶赢 ${pct(st.games - st.goodWins, st.games)}。` : ''}个人胜率合并了所有服务器。点表里的人看他的战绩，点往期的局看所有人的身份、票型和整局复盘。`}</p>
      </header>
      <div className="rh-grid">
        <div className="rh-left">
          {shown ? <RecordCard p={shown} isMe={shown.id === s.me} /> : <p className="rec-none">{soloMode ? '单机试玩的局不记战绩。点右边表里的人，看看他们的战绩。' : '你还没打完过一局。点右边表里的人，看看他们的战绩。'}</p>}
          {pick && pick !== s.me && me && <button type="button" className="rec-back" onClick={() => setPick(null)}>← 看我自己的</button>}
        </div>
        <div className="rh-right">
          <div className="rh-tabs" role="tablist">
            {!soloMode && <button type="button" role="tab" aria-selected={tab === 'board'} className={tab === 'board' ? 'on' : ''} onClick={() => { setTab('board'); setPick(null); }}>排行榜 <small>{st?.players?.length ?? 0} 人</small></button>}
            <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => { setTab('all'); setPick(null); }}>全服排行榜 <small>{all?.players?.length ?? 0} 人</small></button>
            {!soloMode && <button type="button" role="tab" aria-selected={tab === 'games'} className={tab === 'games' ? 'on' : ''} onClick={() => setTab('games')}>往期对局 <small>最近 {games?.length ?? 0} 局</small></button>}
          </div>
          {tab !== 'games' ? (
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
              <span><b>{p.seat}号 {p.name}</b><small>{ROLES[p.role]?.name}{p.role === 'drunk' ? `（以为是${ROLES[p.shownRole]?.name}）` : ''}{p.role === 'amnesiac' && p.gained ? `（能力是${ROLES[p.gained]?.name}）` : ''}{p.alive ? '' : ' · 死亡'}</small></span>
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

// 手机上没有右键：长按 0.5 秒当右键（记下按的位置，菜单开在那里）
let lastTouch = { x: 0, y: 0 };
function longPress(fn) {
  let t = null;
  const stop = () => { clearTimeout(t); t = null; };
  return {
    onTouchStart: (e) => { const p = e.touches[0]; lastTouch = { x: p.clientX, y: p.clientY }; stop(); t = setTimeout(fn, 500); },
    onTouchEnd: stop, onTouchMove: stop, onTouchCancel: stop,
  };
}

/** 房主右键大厅里某人的头像（2026-11-20 用户：让出房主改成右键别人头像选）：让他当房主、标成新手、请他离开。 */
function RosterMenu({ s, act, at, onClose }) {
  const p = s.lobby.find((x) => x.id === at.id);
  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.('.roster-menu')) onClose(); };
    const esc = (e) => e.key === 'Escape' && onClose();
    setTimeout(() => { addEventListener('pointerdown', close); addEventListener('keydown', esc); }, 0);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, []);
  if (!p) return null;
  const bot = p.id.startsWith('bot-');
  const newbie = s.newbies?.includes(p.id);
  const run = (fn) => async () => { onClose(); await fn(); };
  const x = Math.min(at.x, innerWidth - 220); const y = Math.min(at.y, innerHeight - 170);
  return createPortal(
    <div className="mark-menu roster-menu" style={{ left: x, top: y }} role="menu">
      <b>{p.name}</b>
      {!bot && <button type="button" role="menuitem" onClick={run(() => act('giveHost', { target: p.id }))}>让他当房主</button>}
      {!bot && <button type="button" role="menuitem" onClick={run(() => act('markNewbie', { player: p.id, on: !newbie }))}>{newbie ? '取消新手标记' : '标成新手'}</button>}
      <button type="button" role="menuitem" className="danger" onClick={run(() => act('kick', { target: p.id }))}>{bot ? '去掉这个机器人' : '请他离开'}</button>
    </div>,
    document.body,
  );
}

export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_HINT = {
  townsfolk: '善良阵营。每人有一个有用的能力，帮大家找出恶魔。',
  outsider: '善良阵营，但能力往往帮倒忙。',
  minion: '邪恶阵营。知道谁是恶魔，帮他藏身、搅乱信息。',
  demon: '邪恶阵营的核心。每晚杀一个人；恶魔死了，善良就赢了。',
  traveller: '开局后才来的人可以当旅行者加入：阵营由说书人决定，角色公开；别人只能「流放」他，不能处决他。不算进人数配置。',
};

/** 首页：暗流涌动全部 22 个角色的技能。可以按阵营筛选，点一张看完整的能力牌。 */
/** 夜间顺序：首夜 / 其他夜晚各一列，每步写这个角色醒来做什么，最后讲为什么这么排（照官方的夜晚顺序表）。 */
export function NightOrder({ script }) {
  const o = NIGHT_ORDER[script];
  // 夜半狂欢的恶魔开关：这局没有的那几个恶魔（亡骨魔 / 小怪宝 / 利维坦）不列
  const here = (([id]) => !['vigormortis', 'lilmonsta', 'leviathan'].includes(id) || rolesOf(script).includes(id));
  const row = (first) => ([id, what], i) => {
    const r = ROLES[id];
    const color = r ? ATTR[r.team].color : 'var(--muted)';
    const w = stepWake(id, first);
    const note = r && wakeOf(id).note && w !== 'wake' ? wakeOf(id).note : null;
    return (
      <li key={`${id}-${i}`} style={{ '--attr': color }}>
        <span className="no-n">{i + 1}</span>
        <span className="no-art">{r && ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" loading="lazy" /> : null}</span>
        <span className="no-body"><b>{r ? r.name : STEP_NAMES[id]}{w && <i className={`no-wake ${w}`} title={note ?? undefined}>{WAKE_LABEL[w]}</i>}</b><span><Glossed text={what} /></span>{note && <small className="no-note">{note}</small>}</span>
      </li>
    );
  };
  return (
    <div className="night-order">
      <p className="muted">说书人每晚按这个顺序走。<b className="no-wake wake">睁眼</b> 这个人会被叫醒；<b className="no-wake if">条件</b> 满足条件才醒（或醒的是别人）；<b className="no-wake st">判定</b> 本人不醒，说书人自己结算。没在场的角色直接跳过；死了的人不再醒（守鸦人这种死了才触发的除外）。</p>
      <div className="no-cols">
        <section><h3>☾ 首夜</h3><ol>{o.first.filter(here).map(row(true))}</ol></section>
        <section><h3>☾ 其他夜晚</h3><ol>{o.other.filter(here).map(row(false))}</ol></section>
      </div>
      <h3>为什么这么排</h3>
      <ul className="no-why">{o.why.map((t) => <li key={t}><Glossed text={t} /></li>)}</ul>
    </div>
  );
}

export function RoleShowcase({ compact = false, script = 'tb' }) {
  const sc = SCRIPTS[script] ? script : 'tb';
  const travellers = travellersOf(sc); // 这个剧本的旅行者（官方推荐 / 剧本里列的）
  const ids = [...rolesOf(sc), ...travellers];
  const teams = travellers.length ? [...TEAMS, 'traveller'] : TEAMS;
  const [team, setTeam] = useState('all');
  const [open, setOpen] = useState(null);
  const shown = team === 'night' ? [] : teams.filter((t) => team === 'all' || team === t);
  return (
    <section className={compact ? 'roles-compact' : 'lobby-roles glass pnl'}>
      <header className="roles-head">
        <div>
          <h2>{SCRIPTS[sc].name} · 全部角色</h2>
          <p className="muted">这个剧本一共 {ids.length - travellers.length} 个角色，每局按人数抽一部分。{travellers.length ? `另有 ${travellers.length} 个旅行者，给开局后才来的人。` : '这个剧本没有旅行者。'}开局前先认识一下大家可能拿到什么。</p>
        </div>
        <div className="seg roles-tabs">
          <button type="button" className={team === 'all' ? 'on' : ''} onClick={() => setTeam('all')}>全部</button>
          {teams.map((t) => (
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
  const assign = Object.fromEntries(Object.entries(s.roleAssign).filter(([id, r]) => s.lobby.some((p) => p.id === id) && !!ROLES[r] && inScript(r, script)));
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

// 剧本选择：标准剧本和 5–6 人的小剧本分两组；每张卡写难度、人数和地图，左边一条剧本自己的颜色（和地图的气氛一致）
const SCRIPT_CARDS = {
  tb: { tag: '入门', map: '雪夜 · 钟楼广场', color: '#8fb4d0' },
  bmr: { tag: '中等', map: '黄昏 · 黯月驿站', color: '#d07a3a' },
  snv: { tag: '困难 · 疯狂', map: '初夏 · 紫罗兰花园', color: '#a98be0' },
  ngj: { tag: '20 分钟一局', map: '冬夜集市 · 钟楼广场', color: '#e8b04a' },
  luf: { tag: '利维坦 · 五天', map: '雾锁溪谷 · 黯月驿站', color: '#7fa8a2' },
  rag: { tag: '全员猎人 vs 狼人 · 5–15 人', map: '狼人杀的板子 · 不是血染', color: '#c63d2a' },
  bs7: { tag: '2025 冠军 · 7 号空座', map: '月下诗会 · 黯月驿站', color: '#8f9fd6' },
  cat: { tag: '最有名的自定义剧本 · 偏难', map: '雾夜港口 · 钟楼广场', color: '#6fa3a8' },
  ucd: { tag: '死得不明不白', map: '守灵夜 · 钟楼广场', color: '#a08f78' },
  ecp: { tag: '新手老手都能玩', map: '早春夜 · 钟楼广场', color: '#d9a2b8' },
  hhr: { tag: '利维坦不杀人 · 撑五天 · 政客', map: '涨潮的海港 · 钟楼广场', color: '#6f8db0' },
  pie: { tag: '暗流涌动加料', map: '烤派的冬夜 · 钟楼广场', color: '#d6a46a' },
  trust: { tag: '信息都真 · 难在信谁', map: '守信的晚钟 · 黯月驿站', color: '#c2b48a' },
  oe: { tag: '世界杯第二名 · 坏人出头 · 7–15 人', map: '恶人横行的雨夜 · 钟楼广场', color: '#b5524a' },
  mo: { tag: '实验角色快速上手 · 7–15 人', map: '午夜的绿洲 · 黯月驿站', color: '#b07ad8' },
  sar: { tag: '极速板子 · 最多三天', map: '暴乱的三天 · 钟楼广场', color: '#d0603a' },
  booz: { tag: '2022 冠军 · 中文社区常玩', map: '醉醺醺的旅店 · 黯月驿站', color: '#c8874a' },
  twv: { tag: '暗流好人 vs 梦殒坏人 · 偏难', map: '紫罗兰下的雪 · 鸦木布拉夫', color: '#9c8fd0' },
  ww: { tag: '预女猎守 · 6–15 人', map: '经典网杀 · 不是血染', color: '#6f8f4e' },
  avalon: { tag: '组队 · 投票 · 任务', map: '5–10 人 · 不杀人', color: '#c9a227' },
  mark: { tag: '看不到自己的印记', map: '原创 · 同屋才能看后颈', color: '#e0703a' },
};

// 剧本越来越多（2026-11-11 用户：选剧本的地方优化下）：一排分类标签，只展开一类；默认打开当前剧本所在的那类。
// 标签上写这类有几个、人数；当前剧本不在打开的这类里时，标签上挂一个点，下面一行提示现在选的是哪个。
const SCRIPT_GROUPS = [
  // 标准三部和比赛 / 社区剧本合成一类（11-11 用户：分成三大类）；类里再分两组，各有小标题（和以前的排版一样），不混在一个格子里
  { id: 'std', title: '血染剧本', n: '5–15 人', ids: ['tb', 'bmr', 'snv', 'bs7', 'cat', 'ucd', 'ecp', 'hhr', 'pie', 'trust', 'twv', 'booz', 'sar', 'mo', 'oe'],
    // 社区剧本按玩法再分四组（11-16 用户：比赛和社区剧本太多、标签重复）；组名说了的（官方推荐、社区热门、冠军）标签里就不再写
    parts: [
      { title: '标准剧本', n: '官方三部', ids: ['tb', 'bmr', 'snv'] },
      { title: '新手友好', n: '官方推荐 · 规则直白', ids: ['ecp', 'pie', 'mo'] },
      { title: '剧本世界杯', n: '比赛剧本 · 冠亚军', ids: ['bs7', 'booz', 'oe'] },
      { title: '进阶', n: '社区热门 · 信息战', ids: ['cat', 'ucd', 'trust', 'twv'] },
      { title: '特殊玩法', n: '胜负条件不一样', ids: ['hhr', 'sar'] },
    ] },
  { id: 'teensy', title: '小剧本', n: '5–6 人', ids: ['ngj', 'luf'] },
  { id: 'fun', title: '娱乐模式', n: '不是血染', ids: ['ww', 'rag', 'avalon', 'mark'] },
];

/** host：房主点了就换剧本；别人点了只是看看（peek 是正在看的那个）。 */
function ScriptPicker({ value, peek = null, host = true, onPick }) {
  const home = SCRIPT_GROUPS.find((g) => g.ids.includes(value)) ?? SCRIPT_GROUPS[0];
  const [tab, setTab] = useState(home.id);
  useEffect(() => { setTab(home.id); }, [home.id]); // 房主换了剧本（或者别人看着房主换）：跟过去
  const open = SCRIPT_GROUPS.find((g) => g.id === tab) ?? home;
  return (
    <div className="script-pick">
      <div className="script-pick-top">
        <span className="script-pick-label">剧本</span>
        {open.id !== home.id && SCRIPTS[value] && <span className="script-pick-now">现在：<b style={{ color: SCRIPT_CARDS[value]?.color }}>{SCRIPTS[value].name}</b></span>}
      </div>
      <div className="script-tabs" role="tablist" aria-label="剧本分类">
        {SCRIPT_GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={g.id === open.id} className={`script-tab ${g.id === open.id ? 'on' : ''} ${g.id === home.id ? 'has' : ''}`} onClick={() => setTab(g.id)}>
            <b>{g.title}</b><span>{g.ids.length} 个 · {g.n}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {(open.parts ?? [{ title: null, ids: open.ids }]).map((part) => (
          <div key={part.title ?? open.id} className="script-group">
            {part.title && <div className="script-group-head"><b>{part.title}</b><span>{part.n}</span></div>}
            <div className={`script-cards n${part.ids.length}`}>
              {part.ids.map((id) => {
                const c = SCRIPT_CARDS[id];
                return (
                  <button key={id} type="button" className={`script-card ${value === id ? 'on' : ''} ${peek === id ? 'peek' : ''}`} style={{ '--sc': c.color }} aria-pressed={value === id}
                    title={host ? `换成《${SCRIPTS[id].name}》` : value === id ? '房间现在玩的剧本' : `看看《${SCRIPTS[id].name}》的介绍和角色（只有房主能换剧本）`} onClick={() => onPick(id)}>
                    <b>{SCRIPTS[id].name}</b>
                    <small>{c.tag}</small>
                    <i>{c.map}</i>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistBar({ n, d, lo = 5, hi = 15, parts: own = null }) {
  if ((!d && !own) || n < lo || n > hi) return <p className="muted dist-empty">{n < lo ? `至少 ${lo} 人开局（现在 ${n} 人）` : `最多 ${hi} 人`}</p>;
  const parts = own ?? [['镇民', d[0], 'var(--int)'], ['外来者', d[1], 'var(--psy)'], ['爪牙', d[2], '#c9762e'], ['恶魔', d[3], 'var(--phy)']]; // own：别的分法（狼人杀的狼人 / 神职 / 平民）
  return (
    <div className="dist">
      <div className="dist-bar">{parts.map(([k, v, c]) => v > 0 && <i key={k} style={{ flex: v, background: c }} />)}</div>
      <div className="dist-legend">{parts.map(([k, v, c]) => <span key={k}><b style={{ color: c }}>{v}</b>{k}</span>)}</div>
    </div>
  );
}

/** 开关。rule：这是房规（和官方规则不一样），标签后面挂一个小「房规」。 */
function Toggle({ label, on, disabled, onChange, rule = false }) {
  return (
    <label className="setting">
      <span>{label}{rule && <em className="rule-tag" title="房规：和官方规则不一样的地方">房规</em>}</span>
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

/**
 * 挑一个人物形象（同一个人物只能一个人用）：只列已经有 3D 模型的（world/models.js），挑的是地图上 3D 小人的样子；
 * 头像不跟着变，一直是自己的。不挑就是普通镇民。
 */
function CharacterPicker({ s, act }) {
  const me = s.lobby.find((p) => p.id === s.me);
  const mine = me?.char ?? null;
  return (
    <Panel title="你的形象" className="glass" extra={<span className="muted">地图上的 3D 小人（设置里「模型」选 3D 时）</span>}>
      <div className="char-grid">
        <button type="button" className={`char ${!mine || !MODEL_CHARS.has(mine) ? 'on' : ''}`} onClick={() => act('character', { id: null })}>
          <Portrait p={{ ...me, char: null }} size={54} frame={!mine || !MODEL_CHARS.has(mine) ? 'var(--red)' : '#f4f4f0'} />
          <span>普通镇民</span>
        </button>
        {CHARACTERS.filter((c) => MODEL_CHARS.has(c.id)).map((c) => {
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
