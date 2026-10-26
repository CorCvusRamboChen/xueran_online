// 新手教程的开场：几页带动效的介绍——故事背景 → 两个阵营 → 一天怎么过 → 怎么赢 → 三个关键操作的演示，
// 最后进单人练习局。演示用的就是练习局里的那几个人（1 号你是共情者、2 号老格、7 号汉娜……），
// 动画都是按进度 t 画出来的（useLoop），练习局里的分步提示（Tutorial.jsx）也复用这几段演示。
import { useEffect, useState } from 'react';
import { SCENE_ART, ROLE_ART, PEOPLE_ART } from './art.js';
import { ATTR } from './flavor.js';
import bakery from './assets/world/house-bakery-closed-lit.png';

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 循环动画的进度 t（0~1，每 ms 毫秒一圈）。开了"减少动态效果"就停在 still。 */
export function useLoop(ms, still = 0.7) {
  const [t, setT] = useState(still);
  useEffect(() => {
    if (reduceMotion()) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const f = (now) => { setT(((now - t0) % ms) / ms); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
  return t;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;
const between = (t, a, b) => t >= a && t < b;

// 演示画布：160 × 110 的坐标，HTML 元素按百分比摆，SVG 用同一个 viewBox，两边对得上
const W = 160; const H = 110;
const px = (x) => `${(x / W) * 100}%`;
const py = (y) => `${(y / H) * 100}%`;

/** 练习局里的 7 个人（和 src/server/tutorial.js 一致）。art 只是演示用的肖像。 */
const SEATS = [
  { seat: 1, name: '你', art: 'student' },
  { seat: 2, name: '老格', art: 'blacksmith' },
  { seat: 3, name: '玛蒂娜', art: 'flowerseller' },
  { seat: 4, name: '卡拉', art: 'baker' },
  { seat: 5, name: '卢卡', art: 'apothecary' },
  { seat: 6, name: '伊万', art: 'priest' },
  { seat: 7, name: '汉娜', art: 'veteran' },
];
const CX = 80; const CY = 49; const R = 35;
const angleOf = (i) => -90 + (i * 360) / SEATS.length;
const ringPos = (i, r = R) => { const a = (angleOf(i) * Math.PI) / 180; return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; };

function Seat({ p, x, y, size = 17, ring, dim, badge, badgeColor, hand, glow }) {
  return (
    <div className={`dm-seat ${glow ? 'glow' : ''}`} style={{ left: px(x), top: py(y), width: px(size), '--ring': ring ?? 'var(--paper)', opacity: dim ? 0.4 : 1 }}>
      <img src={PEOPLE_ART[p.art]} alt="" draggable="false" />
      <span className="dm-no">{p.seat}</span>
      <span className="dm-name">{p.name}</span>
      {badge && <span className="dm-badge" style={{ background: badgeColor ?? 'var(--paper)' }}>{badge}</span>}
      {hand && <span className="dm-hand" aria-hidden="true">✋</span>}
    </div>
  );
}

/** 假的鼠标：x, y 是画布坐标；click 在 0~1 之间时画一圈点击波纹。 */
function Cursor({ x, y, click = 0, right = false }) {
  return (
    <div className="dm-cursor" style={{ left: px(x), top: py(y) }}>
      {click > 0 && click < 1 && <i className="dm-ripple" style={{ transform: `translate(-50%, -50%) scale(${0.3 + click * 1.4})`, opacity: 1 - click, borderColor: right ? 'var(--phy)' : 'var(--mot)' }} />}
      <svg viewBox="0 0 12 18" aria-hidden="true"><path d="M1 1 L1 15 L4.6 11.6 L7.2 17 L9.4 16 L6.9 10.7 L11.5 10.5 Z" fill="#f4f4f0" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" /></svg>
      {right && click > 0 && click < 1 && <b className="dm-rclick">右键</b>}
    </div>
  );
}

/** 鼠标沿着几个关键点移动：keys = [[时间, x, y], …]。 */
const path = (t, keys) => {
  let i = 0;
  while (i < keys.length - 1 && t > keys[i + 1][0]) i += 1;
  const [t0, x0, y0] = keys[i];
  const [t1, x1, y1] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? ease(seg(t, t0, t1)) : 1;
  return { x: lerp(x0, x1, k), y: lerp(y0, y1, k) };
};
const pulse = (t, at, len = 0.07) => (t >= at && t < at + len ? (t - at) / len : 0);

function Caption({ children }) {
  return <div className="dm-cap" key={typeof children === 'string' ? children : undefined}>{children}</div>;
}

// ───────────────────────── 演示一：翻身份牌 ─────────────────────────
export function FlipDemo() {
  const t = useLoop(6500, 0.6);
  const k = ease(seg(t, 0.22, 0.38)) - ease(seg(t, 0.9, 0.98));
  const c = path(t, [[0, 140, 104], [0.18, 92, 60], [0.5, 92, 60], [0.62, 140, 104]]);
  return (
    <div className="demo">
      <div className="dm-card" style={{ left: px(80), top: py(50) }}>
        <div className="dm-card-in" style={{ transform: `rotateY(${k * 180}deg)` }}>
          <div className="dm-face back"><img src={ROLE_ART._back} alt="" draggable="false" /></div>
          <div className="dm-face front" style={{ '--c': ATTR.townsfolk.color }}>
            <img src={ROLE_ART.empath} alt="" draggable="false" />
            <b>共情者</b>
          </div>
        </div>
      </div>
      <Cursor x={c.x} y={c.y} click={pulse(t, 0.19)} />
      <Caption>{k < 0.5 ? '点身份牌把它翻开——别让旁边的人看见' : '你是共情者（镇民）：每晚得知两侧活着的邻座里有几个邪恶'}</Caption>
    </div>
  );
}

// ───────────────────────── 演示二：夜里拿到信息、推理、打标记 ─────────────────────────
export function EmpathDemo() {
  const t = useLoop(10000, 0.8);
  const pts = SEATS.map((_, i) => ringPos(i));
  const draw = ease(seg(t, 0.1, 0.24));
  const num = seg(t, 0.26, 0.32);
  const hannah = t > 0.54;
  const lao = t > 0.76;
  const c = path(t, [[0, 120, 104], [0.44, 120, 104], [0.52, pts[6].x + 4, pts[6].y + 4], [0.62, pts[6].x + 4, pts[6].y + 4], [0.72, pts[1].x + 4, pts[1].y + 4], [1, pts[1].x + 4, pts[1].y + 4]]);
  const cap = t < 0.1 ? '夜里，说书人唤醒你' : t < 0.42 ? '你得知：两侧的邻座（2 号、7 号）里有 1 个邪恶' : t < 0.66 ? '汉娜说自己是士兵，而且已经证实——她是好人' : '那邪恶的就是 2 号老格。右键他，在小魔典里标上「恶魔」';
  return (
    <div className="demo night">
      <svg className="dm-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {[1, 6].map((j) => (
          <line key={j} x1={pts[0].x} y1={pts[0].y} x2={lerp(pts[0].x, pts[j].x, draw)} y2={lerp(pts[0].y, pts[j].y, draw)} stroke="var(--int)" strokeWidth="1.2" strokeDasharray="3 2" opacity={draw ? 0.9 : 0} />
        ))}
      </svg>
      {SEATS.map((p, i) => (
        <Seat key={p.seat} p={p} {...pts[i]} glow={i === 0 && t < 0.3}
          dim={t < 0.3 && i !== 0 && i !== 1 && i !== 6}
          ring={i === 0 ? 'var(--mot)' : i === 6 && hannah ? ATTR.townsfolk.color : i === 1 && lao ? ATTR.demon.color : undefined}
          badge={i === 6 && hannah ? '士兵' : i === 1 && lao ? '恶魔' : null}
          badgeColor={i === 6 ? ATTR.townsfolk.color : ATTR.demon.color} />
      ))}
      {num > 0 && t < 0.5 && <div className="dm-num" style={{ left: px(CX), top: py(CY), transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * ease(num)})`, opacity: num }}><b>1</b><small>个邪恶</small></div>}
      {t >= 0.5 && <div className="dm-num soft" style={{ left: px(CX), top: py(CY) }}><b>?</b><small>推理</small></div>}
      <Cursor x={c.x} y={c.y} click={pulse(t, 0.53) || pulse(t, 0.74)} right={t > 0.7} />
      <Caption>{cap}</Caption>
    </div>
  );
}

// ───────────────────────── 演示三：进房子、锁门、有人敲门 ─────────────────────────
export function KnockDemo() {
  const t = useLoop(9000, 0.65);
  const locked = t > 0.13;
  const walk = t < 0.8 ? ease(seg(t, 0.2, 0.44)) : 1 - ease(seg(t, 0.84, 1));
  const knock = t > 0.46 && t < 0.62;
  const panel = t > 0.56 && t < 0.84;
  const c = path(t, [[0, 120, 100], [0.08, 30, 101], [0.18, 30, 101], [0.62, 128, 64], [0.72, 128, 47], [1, 128, 47]]);
  const cap = t < 0.13 ? '你和玛蒂娜进了面包房：屋里是单独的语音，外面听不到' : t < 0.46 ? '点「锁门私聊」锁上门' : t < 0.62 ? '卢卡走到门口，只能敲门' : t < 0.84 ? '让他进来，还是假装没人？' : '卢卡只好走开了';
  return (
    <div className="demo day">
      <img className="dm-house" src={bakery} alt="" draggable="false" style={{ left: px(64), top: py(50) }} />
      <div className="dm-inside" style={{ left: px(46), top: py(5) }}>
        <img src={PEOPLE_ART.student} alt="" /><img src={PEOPLE_ART.flowerseller} alt="" />
        <span>屋里：你 · 玛蒂娜</span>
      </div>
      <div className={`dm-lock ${locked ? 'on' : ''}`} style={{ left: px(66), top: py(80) }}>{locked ? '🔒' : '🔓'}</div>
      <Seat p={SEATS[4]} x={lerp(12, 46, walk)} y={lerp(96, 86, walk)} size={15} />
      {knock && <div className="dm-knock" style={{ left: px(56), top: py(74) }}>咚咚</div>}
      <button type="button" tabIndex={-1} className={`dm-btn ${locked ? 'on' : ''}`} style={{ left: px(4), top: py(96) }}>{locked ? '已锁门' : '锁门私聊'}</button>
      {panel && (
        <div className="dm-panel" style={{ left: px(110), top: py(24) }}>
          <b>卢卡在敲门</b>
          <span className="dm-mini">让他进来</span>
          <span className={`dm-mini ${t > 0.72 ? 'on' : ''}`}>假装没人</span>
        </div>
      )}
      <Cursor x={c.x} y={c.y} click={pulse(t, 0.1) || pulse(t, 0.71)} />
      <Caption>{cap}</Caption>
    </div>
  );
}

// ───────────────────────── 演示四：提名、投票时钟 ─────────────────────────
const YES = new Set([2, 3, 5, 6, 0]); // 举手的：3、4、6、7 号和你（卢卡是爪牙、老格是恶魔，不举）
const HAND_ORDER = [2, 3, 4, 5, 6, 0, 1]; // 指针从被提名者（2 号）的下一位开始顺时针转一圈
export function VoteDemo() {
  const t = useLoop(11000, 0.95);
  const pts = SEATS.map((_, i) => ringPos(i));
  const arrow = ease(seg(t, 0.12, 0.18));
  const k = seg(t, 0.26, 0.82);
  const step = Math.floor(k * (HAND_ORDER.length - 1) + 0.0001);
  const handA = angleOf(2) + k * (HAND_ORDER.length - 1) * (360 / SEATS.length);
  const youUp = t > 0.42;
  const raised = (i) => t > 0.24 && YES.has(i) && (i !== 0 || youUp);
  const lockedIdx = new Set(t > 0.26 ? HAND_ORDER.slice(0, step + 1) : []);
  const votes = HAND_ORDER.slice(0, t > 0.26 ? step + 1 : 0).filter((i) => raised(i)).length;
  const done = t > 0.84;
  const c = path(t, [[0, 120, 104], [0.04, 146, 100], [0.08, 146, 100], [0.13, pts[1].x + 3, pts[1].y + 3], [0.3, pts[1].x + 3, pts[1].y + 3], [0.38, 146, 100], [1, 146, 100]]);
  const ha = (handA * Math.PI) / 180;
  const cap = t < 0.12 ? '回到广场：点「提名」……' : t < 0.2 ? '……再点 2 号老格。你提名了他' : t < 0.26 ? '你说理由，老格为自己辩护，然后开始投票' : !done ? '指针从 3 号开始顺时针转，转过谁，谁的票就锁定——在它转到你之前点「举手」' : '5 票，达到活人数的一半（7 人要 4 票）：老格被送上处决台';
  return (
    <div className="demo day">
      <svg className="dm-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs><marker id="dm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--opt)" /></marker></defs>
        {arrow > 0 && <line x1={pts[0].x} y1={pts[0].y} x2={lerp(pts[0].x, pts[1].x, arrow * 0.8)} y2={lerp(pts[0].y, pts[1].y, arrow * 0.8)} stroke="var(--opt)" strokeWidth="1.6" markerEnd="url(#dm-arr)" />}
        {t > 0.24 && t < 0.86 && (
          <g>
            <line x1={CX} y1={CY} x2={CX + (R - 9) * Math.cos(ha)} y2={CY + (R - 9) * Math.sin(ha)} stroke="var(--mot)" strokeWidth="2" strokeLinecap="round" />
            <circle cx={CX} cy={CY} r="2.4" fill="var(--mot)" />
          </g>
        )}
      </svg>
      {SEATS.map((p, i) => (
        <Seat key={p.seat} p={p} {...pts[i]} hand={raised(i)}
          dim={lockedIdx.has(i) && !raised(i) && !done}
          ring={i === 1 ? (done ? 'var(--phy)' : 'var(--opt)') : i === 0 ? 'var(--mot)' : lockedIdx.has(i) && raised(i) ? 'var(--ok)' : undefined}
          badge={i === 1 && done ? '处决台' : i === 1 && t > 0.15 ? '被提名' : null}
          badgeColor={done ? 'var(--phy)' : 'var(--opt)'} />
      ))}
      {t > 0.24 && <div className={`dm-count ${votes >= 4 ? 'ok' : ''}`} style={{ left: px(CX), top: py(CY + 13) }}>{votes} 票 / 需要 4</div>}
      <button type="button" tabIndex={-1} className={`dm-btn ${t < 0.24 ? '' : youUp ? 'on' : 'hot'}`} style={{ left: px(124), top: py(96) }}>{t < 0.24 ? '提名' : youUp ? '已举手' : '举手'}</button>
      <Cursor x={c.x} y={c.y} click={pulse(t, 0.05) || pulse(t, 0.13) || pulse(t, 0.4)} />
      <Caption>{cap}</Caption>
    </div>
  );
}

// ───────────────────────── 介绍页里的图 ─────────────────────────
const PHASES = [
  { name: '夜晚', icon: '☾', text: '大家闭上眼睛。说书人按顺序叫醒有夜间能力的人：有人得到信息，恶魔挑一个人杀掉（第一晚不杀）。' },
  { name: '天亮', icon: '☀', text: '说书人宣布昨晚谁死了。死人还能说话，还剩一张票（整局只能用一次）。' },
  { name: '自由活动', icon: '⌂', text: '在小镇里走动，进房子关门私聊、交换情报——也可能是在交换谎言。' },
  { name: '提名', icon: '☝', text: '回到广场。每人每天最多提名一次，每人每天也最多被提名一次。' },
  { name: '投票', icon: '✋', text: '指针绕一圈，举手人数达到活人数的一半，被提名者就上处决台（之后票更多的人会把他换下来）。' },
  { name: '处决', icon: '⚖', text: '黄昏时处决台上的人被处决，天又黑了。' },
];
export function CycleDemo() {
  const t = useLoop(21000, 4.5 / 6);
  const cur = Math.min(PHASES.length - 1, Math.floor(t * PHASES.length));
  const a = ((-90 + t * 360) * Math.PI) / 180;
  const RR = 40;
  const night = cur === 0 || cur === 5;
  return (
    <div className={`demo cycle ${night ? 'night' : 'day'}`}>
      <svg className="dm-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <circle cx={CX} cy={CY} r={RR} fill="none" stroke="rgba(233,228,216,.22)" strokeWidth="1" strokeDasharray="2 2" />
        <circle cx={CX + RR * Math.cos(a)} cy={CY + RR * Math.sin(a)} r="2.6" fill="var(--mot)" />
      </svg>
      {PHASES.map((p, i) => {
        const pa = ((-90 + (i + 0.5) * 60) * Math.PI) / 180;
        return (
          <div key={p.name} className={`dm-phase ${i === cur ? 'on' : ''}`} style={{ left: px(CX + RR * Math.cos(pa)), top: py(CY + RR * Math.sin(pa)) }}>
            <i>{p.icon}</i><span>{p.name}</span>
          </div>
        );
      })}
      <div className="dm-phase-text" key={cur} style={{ left: px(CX), top: py(CY) }}>
        <b>{PHASES[cur].name}</b>
        <p>{PHASES[cur].text}</p>
      </div>
    </div>
  );
}

const TEAMS = [
  { team: 'townsfolk', role: 'washerwoman', side: '善良', text: '大多数人。每人有一个帮好人找线索的能力。' },
  { team: 'outsider', role: 'butler', side: '善良', text: '也是好人，但能力会给好人添乱。' },
  { team: 'minion', role: 'poisoner', side: '邪恶', text: '恶魔的帮手：下毒、捣乱，掩护恶魔。' },
  { team: 'demon', role: 'imp', side: '邪恶', text: '每晚杀一个人。它死了，好人就赢了。' },
];
function TeamsDemo() {
  return (
    <div className="ti-teams">
      {['善良', '邪恶'].map((side) => (
        <div key={side} className={`ti-side ${side === '善良' ? 'good' : 'evil'}`}>
          <h4>{side}阵营</h4>
          <div className="ti-side-cards">
            {TEAMS.filter((x) => x.side === side).map((x, i) => (
              <div key={x.team} className="ti-team" style={{ '--c': ATTR[x.team].color, '--d': `${(side === '善良' ? 0 : 2) * 0.35 + i * 0.35 + 0.2}s` }}>
                <img src={ROLE_ART[x.role]} alt="" draggable="false" />
                <b>{{ townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' }[x.team]}</b>
                <p>{x.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WinDemo() {
  const t = useLoop(9000, 0.97);
  const tokens = (row) => SEATS.map((p, i) => {
    let dead = false; let red = false;
    if (row === 'good') { dead = i === 1 && t > 0.28; red = i === 1 && t > 0.2; }
    else { const order = [2, 3, 6, 4, 0]; const j = order.indexOf(i); dead = j >= 0 && t > 0.2 + j * 0.12; }
    return <span key={p.seat} className={`ti-tok ${dead ? 'dead' : ''} ${red ? 'red' : ''}`}><img src={PEOPLE_ART[p.art]} alt="" /></span>;
  });
  return (
    <div className="ti-win">
      <div className="ti-win-row">
        <div className="ti-tokens">{tokens('good')}</div>
        <p className={t > 0.34 ? 'on good' : ''}>{t > 0.34 ? '恶魔（老格）被处决 → 善良获胜' : '白天投票，把恶魔送上处决台……'}</p>
      </div>
      <div className="ti-win-row">
        <div className="ti-tokens">{tokens('evil')}</div>
        <p className={t > 0.72 ? 'on evil' : ''}>{t > 0.72 ? '只剩 2 个活人，恶魔还在 → 邪恶获胜' : '恶魔每晚杀人，好人又投错了人……'}</p>
      </div>
    </div>
  );
}

/** 序章：钟面走到午夜，敲了十二下之后又多敲了一下（第十三下是红的）。 */
const STRIKE0 = 0.24; const STRIKE_GAP = 0.046;
function StoryDemo() {
  const t = useLoop(15000, 0.9);
  const sweep = ease(seg(t, 0.02, 0.22));
  const minA = -90 + 240 + sweep * 120; // 11:40 → 12:00
  const hourA = -90 + 330 + sweep * 30;
  const n = t < STRIKE0 ? 0 : Math.min(13, Math.floor((t - STRIKE0) / STRIKE_GAP) + 1);
  const since = t < STRIKE0 ? 1 : ((t - STRIKE0) % STRIKE_GAP) / STRIKE_GAP;
  const red = n >= 13;
  const C = { x: 80, y: 50 }; const r = 34;
  const hand = (a, len) => ({ x2: C.x + len * Math.cos((a * Math.PI) / 180), y2: C.y + len * Math.sin((a * Math.PI) / 180) });
  return (
    <div className={`demo story ${red ? 'red' : 'night'}`}>
      <svg className="dm-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {n > 0 && n <= 13 && since < 1 && t < STRIKE0 + 13 * STRIKE_GAP && (
          <circle cx={C.x} cy={C.y} r={r + 2 + since * 22} fill="none" stroke={red ? 'var(--phy)' : 'var(--cream)'} strokeWidth={1.4 * (1 - since)} opacity={1 - since} />
        )}
        <circle cx={C.x} cy={C.y} r={r} fill="#14140f" stroke={red ? 'var(--phy)' : 'var(--cream)'} strokeWidth="1.4" />
        <circle cx={C.x} cy={C.y} r={r - 3} fill="none" stroke="rgba(233,228,216,.25)" strokeWidth=".5" />
        {['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].map((s, i) => {
          const a = ((-90 + i * 30) * Math.PI) / 180;
          return <text key={s} x={C.x + (r - 8) * Math.cos(a)} y={C.y + (r - 8) * Math.sin(a) + 1.8} textAnchor="middle" fontSize="5" fill={i === 0 && red ? 'var(--phy)' : 'var(--cream)'} fontFamily="var(--num)">{s}</text>;
        })}
        <line x1={C.x} y1={C.y} {...hand(hourA, 16)} stroke="var(--cream)" strokeWidth="2.2" strokeLinecap="round" />
        <line x1={C.x} y1={C.y} {...hand(minA, 25)} stroke={red ? 'var(--phy)' : 'var(--cream)'} strokeWidth="1.3" strokeLinecap="round" />
        <circle cx={C.x} cy={C.y} r="1.8" fill={red ? 'var(--phy)' : 'var(--cream)'} />
      </svg>
      {n > 0 && <div className={`dm-strike ${red ? 'red' : ''}`} key={n} style={{ left: px(80), top: py(97) }}>{red ? '……第十三下' : `当——（${n}）`}</div>}
      {red && <div className="dm-vignette" />}
    </div>
  );
}

/** 练习局分步提示里用的演示。 */
export const TUT_DEMOS = { flip: FlipDemo, empath: EmpathDemo, knock: KnockDemo, vote: VoteDemo };

// ───────────────────────── 开场的几页 ─────────────────────────
const PAGES = [
  {
    id: 'story', kicker: '序章', title: '钟楼敲了十三下', bg: 'square-night', stage: StoryDemo,
    lines: [
      '钟楼镇是个安静的小地方：面包房早上冒烟，酒馆晚上点灯，钟楼每个钟点敲一次。',
      '直到某天午夜，钟楼多敲了一下。第二天早上，有人倒在了自家门口。',
      '恶魔混进了镇子，就藏在你们中间：白天它和大家一起在广场上聊天，夜里出来杀人。',
      '你们唯一的武器，是白天的投票。可是谁说的是真话呢？',
    ],
  },
  {
    id: 'teams', kicker: '第一章', title: '两个阵营，四类角色', bg: 'lobby-hero', stage: TeamsDemo,
    lines: [
      '开局每个人秘密拿到一个角色。好人不知道彼此是谁，只能靠各自的能力拼出真相。',
      '邪恶的人（7 人以上的局）一开始就互相认识，恶魔还会知道 3 个可以冒充的好人角色。',
      '四类角色各有一个颜色：镇民蓝、外来者紫、爪牙黄、恶魔红，游戏里到处都用这套颜色。',
    ],
  },
  {
    id: 'cycle', kicker: '第二章', title: '一天怎么过', bg: 'square-day', stage: CycleDemo,
    lines: [
      '游戏在夜晚和白天之间轮转。说书人主持一切：叫醒角色、发信息、宣布死讯——这里大多由程序自动完成。',
      '白天是你的主场：聊天、私聊、提名、投票。夜里你只需要等说书人叫你。',
    ],
  },
  {
    id: 'win', kicker: '第三章', title: '怎么赢', bg: 'square-day', stage: WinDemo,
    lines: [
      '善良阵营：处决恶魔就赢。',
      '邪恶阵营：活着的人只剩 2 个、恶魔还活着就赢。',
      '死人不出局：还能说话、出主意，还有一张票。',
    ],
  },
  {
    id: 'flip', kicker: '操作演示 1', title: '看看你是谁', bg: 'cottage-night', stage: FlipDemo,
    lines: ['开局先翻开右边的身份牌。练习局里你是共情者：每晚说书人会告诉你，左右两个活着的邻座里有几个邪恶。'],
  },
  {
    id: 'empath', kicker: '操作演示 2', title: '夜里的信息，白天的推理', bg: 'square-night', stage: EmpathDemo,
    lines: [
      '信息会出现在「身份」页最上面。把它和别人说的话放在一起推理。',
      '右键（手机长按）一个人，可以在小魔典里给他标上镇民 / 外来者 / 爪牙 / 恶魔、猜他的角色、写笔记、连线——只有你自己看得到。',
    ],
  },
  {
    id: 'knock', kicker: '操作演示 3', title: '私聊和敲门', bg: 'square-day', stage: KnockDemo,
    lines: ['白天可以在小镇里走动。走进一栋房子就进了这栋房子的私聊语音；锁上门，别人只能敲门，开不开由你决定。'],
  },
  {
    id: 'vote', kicker: '操作演示 4', title: '提名和投票', bg: 'square-day', stage: VoteDemo,
    lines: ['回到广场后提名你怀疑的人。投票时指针顺时针转一圈，在它转到你之前举手。票数达到活人数的一半就上处决台，黄昏处决。'],
  },
];

/** 开场介绍。onStart：进练习局；onClose：回大厅。 */
export function TutorialIntro({ onStart, onClose }) {
  const [i, setI] = useState(0);
  const page = PAGES[i];
  const last = i === PAGES.length - 1;
  const go = (d) => setI((x) => Math.max(0, Math.min(PAGES.length - 1, x + d)));
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const Stage = page.stage;
  return (
    <div className="ti" role="dialog" aria-label="新手教程：游戏介绍">
      <div className="ti-bg" key={page.bg} style={{ backgroundImage: SCENE_ART[page.bg] ? `url(${SCENE_ART[page.bg]})` : undefined }} />
      <div className="ti-fog" aria-hidden="true" />
      <header className="ti-head">
        <span>新手教程 · 先花两分钟了解规则</span>
        <div>
          <button type="button" className="ti-link" onClick={onStart}>跳过介绍，直接练习</button>
          <button type="button" className="ti-link" onClick={onClose} aria-label="关闭">✕</button>
        </div>
      </header>
      <main className={`ti-body ${Stage ? '' : 'solo'}`} key={page.id}>
        <section className="ti-text">
          <small className="ti-kicker">{page.kicker}</small>
          <h2>{page.title}</h2>
          {page.lines.map((l, j) => <p key={j} style={{ '--d': `${0.25 + j * (Stage ? 0.35 : 0.9)}s` }}>{l}</p>)}
        </section>
        {Stage && <section className="ti-stage"><Stage /></section>}
      </main>
      <footer className="ti-foot">
        <button type="button" className="ti-prev" onClick={() => go(-1)} disabled={i === 0}>上一页</button>
        <div className="ti-dots">
          {PAGES.map((p, j) => <button key={p.id} type="button" className={j === i ? 'on' : j < i ? 'seen' : ''} onClick={() => setI(j)} aria-label={`第 ${j + 1} 页：${p.title}`} />)}
        </div>
        {last
          ? <button type="button" className="ti-next go" onClick={onStart}>开始练习局</button>
          : <button type="button" className="ti-next" onClick={() => go(1)}>下一页</button>}
      </footer>
    </div>
  );
}
