// 练习局分步提示里的小演示（Tutorial.jsx 用）：用练习局里的那几个人（1 号你是共情者、2 号老格、7 号汉娜……），
// 假鼠标示范翻身份牌、夜里信息 + 标记、锁门敲门、提名投票。动画按进度 t 画（useLoop）。
import { useEffect, useState } from 'react';
import { ROLE_ART, PEOPLE_ART } from './art.js';
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

/** 练习局分步提示里用的演示。 */
export const TUT_DEMOS = { flip: FlipDemo, empath: EmpathDemo, knock: KnockDemo, vote: VoteDemo };
