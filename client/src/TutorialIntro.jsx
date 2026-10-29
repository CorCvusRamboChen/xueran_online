// 新手教程的开场：6 段全屏短动画，每段只讲一件事，讲完进单人练习局。
//   1 恶魔藏在大家中间 → 2 身份是秘密的（自己点牌翻开）→ 3 夜里恶魔杀人、有人拿到线索
//   → 4 白天对口供：两个人都说自己是士兵（必有一个说谎），再对上你的线索，两条都指向老格 → 5 自己举手，把恶魔投出去，好人赢
//   → 6 抓不到恶魔、只剩 2 人，恶魔赢 → 收尾：三句话复述规则。
// 只讲最核心的目标和一天的流程；角色分类、私聊锁门、小魔典这些留到练习局里边玩边学。
// 演示里的人就是练习局那几个（1 号你是共情者、2 号老格是恶魔、7 号汉娜是士兵），推理和练习局一致。
// 动画按时间 t（秒）直接算出来；需要你动手的那一步（翻牌、举手）时间会停住等你点。
import { useEffect, useRef, useState } from 'react';
import { ROLE_ART, PEOPLE_ART } from './art.js';
import { audio, slash, growl, heartbeat, doorKick, tick, shove } from './world/footsteps.js';
import { bus } from './mixer.js';

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
const back = (x) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; }; // 冲过头再回来

/** 练习局里的 7 个人（和 src/server/tutorial.js 一致）。 */
const P = [
  { seat: 1, name: '你', art: 'student' },
  { seat: 2, name: '老格', art: 'blacksmith' },
  { seat: 3, name: '玛蒂娜', art: 'flowerseller' },
  { seat: 4, name: '卡拉', art: 'baker' },
  { seat: 5, name: '卢卡', art: 'apothecary' },
  { seat: 6, name: '伊万', art: 'priest' },
  { seat: 7, name: '汉娜', art: 'veteran' },
];
const DEMON = 1; // 老格

/** 围成一圈的座位（和游戏里的座位圈一样，1 号在正上方，顺时针）。按屏幕实际大小算（像素，相对圈心）：
 *  横屏圈宽一点，竖屏（手机）圈高一点。BOX 由 TutorialIntro 每次渲染前更新。 */
const CY = 55; // 圈心在屏幕高度的 55%
let BOX = { w: 1024, h: 700 };
const ring = (i) => {
  const a = ((-90 + (i * 360) / P.length) * Math.PI) / 180;
  const rx = Math.min(BOX.w * 0.36, BOX.h * 0.4);
  const ry = Math.min(BOX.h * 0.24, BOX.w * 0.42);
  return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
};
const at = ({ x, y }, scale = 1) => ({ left: `calc(50% + ${x}px)`, top: `calc(${CY}% + ${y}px)`, '--s': scale });

/** 一个人：头像 + 名字，可以变暗、死掉、发光、举手、说话、换成恶魔的脸。 */
function Face({ i, pos, scale = 1, dim, dead, ring: ringColor, glow, hand, art, label, labelColor, bubble, bubbleBelow, fall }) {
  const p = P[i];
  return (
    <div className={`f ${dead ? 'dead' : ''} ${dim ? 'dim' : ''} ${glow ? 'glow' : ''} ${fall ? 'fall' : ''}`} style={{ ...at(pos ?? ring(i), scale), '--ring': ringColor ?? 'var(--paper)', '--glow': glow ?? 'transparent' }}>
      <div className="f-img"><img className={art ? "role" : ""} src={art ?? PEOPLE_ART[p.art]} alt="" draggable="false" /></div>
      <span className="f-name"><i>{p.seat}</i>{p.name}</span>
      {label && <span className="f-label" style={{ background: labelColor ?? 'var(--phy)' }}>{label}</span>}
      {hand && <span className="f-hand" aria-hidden="true">✋</span>}
      {bubble && <span className={`f-bubble ${bubbleBelow ? 'below' : ''}`}>{bubble}</span>}
    </div>
  );
}

/** 抖屏：在 [起点, 时长] 这些时间段里抖，越往后越弱。 */
const shake = (t, wins, amp = 1.6) => {
  for (const [a, len] of wins) {
    if (t >= a && t < a + len) {
      const k = 1 - (t - a) / len;
      return `translate(${Math.sin(t * 90) * amp * k}cqmin, ${Math.cos(t * 73) * amp * 0.7 * k}cqmin)`;
    }
  }
  return 'none';
};
/** 闪一下：返回 0–1 的不透明度。 */
const flash = (t, a, len = 0.45) => (t >= a && t < a + len ? 1 - (t - a) / len : 0);

/** 钟声 / 胜利和弦（音效那一路）。 */
function chime(freqs, vol = 0.25, dur = 2.4) {
  const a = audio();
  if (!a || a.state !== 'running') return;
  const out = a.createGain(); out.gain.value = vol; out.connect(bus(a, 'sfx'));
  const t = a.currentTime + 0.02;
  freqs.forEach((f, k) => {
    for (const [mul, g] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
      const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const e = a.createGain(); const t0 = t + k * 0.09;
      e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g * 0.5, t0 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(e).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  });
}

/** 时间到了放一次声音（快进跳过去的不补放）。 */
function useCues(t, cues) {
  const fired = useRef(new Set());
  useEffect(() => {
    cues.forEach(([when, fn], k) => {
      if (t >= when && !fired.current.has(k)) { fired.current.add(k); if (t - when < 0.5) fn(); }
    });
  });
}

/** 大标题：出现时砸下来。 */
const Headline = ({ children, tone }) => <h2 className={`hl ${tone ?? ''}`} key={typeof children === 'string' ? children : undefined}>{children}</h2>;
const Sub = ({ children }) => <p className="sub">{children}</p>;

// ───────────────────────── 1 恶魔藏在大家中间 ─────────────────────────
function BeatDemon({ t }) {
  useCues(t, [[3.1, () => { growl(0.6); heartbeat(0.5); }]]);
  const sweep = t < 1.4 ? 0 : t < 2.9 ? (t - 1.4) / 1.5 : 1;
  const spotI = t < 2.9 ? Math.min(P.length - 1, Math.floor(sweep * P.length)) : DEMON;
  const reveal = t >= 3.1 && t < 4.3;
  const spot = t >= 1.4 && t < 4.3;
  const sp = ring(spotI);
  return (
    <>
      <Headline>镇上混进了一个恶魔</Headline>
      <div className="spot" style={{ opacity: spot ? 1 : 0, '--sx': `calc(50% + ${sp.x}px)`, '--sy': `calc(${CY}% + ${sp.y}px)`, '--tint': reveal ? 'rgba(110, 0, 0, .6)' : 'rgba(0, 0, 0, .74)' }} />
      {P.map((p, i) => t >= 0.35 + i * 0.12 && (
        <Face key={i} i={i} scale={reveal && i === DEMON ? 1.35 : 1}
          art={reveal && i === DEMON ? ROLE_ART.imp : undefined}
          ring={reveal && i === DEMON ? 'var(--phy)' : undefined} glow={reveal && i === DEMON ? 'var(--phy)' : undefined} />
      ))}
      <div className="flash red" style={{ opacity: flash(t, 3.1, 0.6) * 0.8 }} />
      {t >= 4.3 && <Sub>它看起来和大家一模一样。<b>你们要把它找出来。</b></Sub>}
    </>
  );
}
BeatDemon.dur = 5.4;
BeatDemon.shakes = [[3.1, 0.55]];

// ───────────────────────── 2 你的身份是秘密 ─────────────────────────
const MINI = [0, 1, 0, 0, 1, 0, 0]; // 1 = 坏人
function BeatRole({ t, gate, act, acted }) {
  useCues(t, [[0.6, () => doorKick(0.35, false, 0.3)], [gate + 0.05, () => shove(0.5)]]);
  const drop = back(seg(t, 0.15, 0.6));
  const flip = acted ? ease(seg(t, gate, gate + 0.5)) : 0;
  const after = acted ? t - gate : -1;
  return (
    <>
      <Headline>每个人拿到一张<em>秘密</em>身份牌</Headline>
      <button type="button" className={`card ${!acted && t >= gate ? 'ask' : ''} ${after >= 0.9 ? 'up' : ''}`} onClick={() => !acted && t >= gate && act()} aria-label="翻开身份牌"
        style={{ '--drop': `${(1 - drop) * -120}cqh`, '--tilt': `${(1 - drop) * -14}deg`, '--flip': `${flip * 180}deg` }}>
        <span className="card-in">
          <span className="card-face back"><img src={ROLE_ART._back} alt="" draggable="false" /></span>
          <span className="card-face front"><img src={ROLE_ART.empath} alt="" draggable="false" /><b>你是好人</b></span>
        </span>
      </button>
      {!acted && t >= gate && <div className="tap-hint">点一下，翻开你的牌</div>}
      {after >= 0.9 && (
        <div className="minis">
          {MINI.map((evil, k) => (
            <span key={k} className={`mini ${evil ? 'evil' : 'good'} ${after >= 1 + k * 0.12 ? 'show' : ''}`}>
              <b>{after >= 1 + k * 0.12 ? (evil ? '坏人' : '好人') : ''}</b>
            </span>
          ))}
        </div>
      )}
      {after >= 1.9 && <Sub>大多数人是<b className="good">好人</b>；少数是<b className="evil">坏人</b>——他们知道彼此是谁，<b>而且会撒谎</b>。</Sub>}
    </>
  );
}
BeatRole.gate = 1;
BeatRole.dur = 1 + 3.4;
BeatRole.shakes = [[0.6, 0.3]];

// ───────────────────────── 3 夜晚 ─────────────────────────
const VICTIM = 3; // 卡拉
const NEIGHBORS = [DEMON, 6]; // 你两边：2 号老格、7 号汉娜
function BeatNight({ t }) {
  useCues(t, [[1.6, () => slash(0.8)], [3.5, () => tick(false)]]);
  const killed = t >= 2;
  return (
    <>
      <div className="moon" style={{ transform: `translateY(${(1 - ease(seg(t, 0, 1.2))) * 40}cqh)` }} />
      <Headline tone="night">夜晚，恶魔杀一个人</Headline>
      {P.map((p, i) => (
        <Face key={i} i={i} dim={!(i === 0 && t >= 3.4) && !(i === VICTIM && t >= 1.5) && !(NEIGHBORS.includes(i) && t >= 3.6)} dead={i === VICTIM && killed} fall={i === VICTIM && killed}
          label={i === VICTIM && killed ? '死了' : NEIGHBORS.includes(i) && t >= 3.6 ? '？' : null} labelColor={i === VICTIM ? 'var(--phy)' : 'var(--int)'}
          glow={i === 0 && t >= 3.4 ? 'var(--int)' : undefined} ring={(i === 0 && t >= 3.4) || (NEIGHBORS.includes(i) && t >= 3.6) ? 'var(--int)' : undefined}
          bubble={i === 0 && t >= 3.5 ? <>线索：你两边的人里<br /><big>有 1 个坏人</big></> : null} bubbleBelow />
      ))}
      {t >= 1.5 && t < 2.6 && (
        <div className="claw" style={at(ring(VICTIM))}><i /><i /><i /></div>
      )}
      <div className="flash red" style={{ opacity: flash(t, 1.6, 0.5) * 0.7 }} />
      {t >= 3.4 && <Sub>有些好人会在夜里收到<b className="good">一条线索</b>。</Sub>}
    </>
  );
}
BeatNight.dur = 6;
BeatNight.shakes = [[1.6, 0.5]];

// ───────────────────────── 4 白天：对口供 ─────────────────────────
// 两条线索交叉：伊万和老格都说自己是士兵（必有一个说谎）；你的线索是"老格、汉娜里有 1 个坏人"。两边都有老格。
const IVAN = 5;
function BeatDay({ t }) {
  useCues(t, [[2.9, () => shove(0.6)], [5.3, () => heartbeat(0.45)]]);
  const clash = t >= 2.9;
  const clue = t >= 4.1;
  const pick = t >= 5.3;
  const ivan = ring(IVAN); const lao = ring(DEMON);
  const mx = (ivan.x + lao.x) / 2; const my = (ivan.y + lao.y) / 2;
  const tag = (i) => {
    if (pick && i === DEMON) return ['都指向他！', 'var(--phy)'];
    if (clue && (i === DEMON || i === 6)) return ['线索', 'var(--int)'];
    if (clash && (i === DEMON || i === IVAN)) return ['士兵？', 'var(--mot)'];
    return null;
  };
  return (
    <>
      <Headline tone="day">白天，揪出说谎的人</Headline>
      {clash && !clue && (
        <svg className="bolt" viewBox={`${-BOX.w / 2} ${(-BOX.h * CY) / 100} ${BOX.w} ${BOX.h}`} aria-hidden="true">
          <polyline points={`${ivan.x},${ivan.y} ${mx - 5},${my + 4} ${mx + 5},${my - 4} ${lao.x},${lao.y}`} />
        </svg>
      )}
      {P.map((p, i) => {
        const tg = tag(i);
        return (
          <Face key={i} i={i} dead={i === VICTIM}
            ring={pick && i === DEMON ? 'var(--phy)' : tg ? tg[1] : i === 0 && clue ? 'var(--int)' : undefined}
            scale={pick && i === DEMON ? 1.3 : 1} glow={pick && i === DEMON ? 'var(--phy)' : undefined}
            label={tg?.[0]} labelColor={tg?.[1]}
            bubble={i === IVAN && t >= 0.8 && t < 4.1 ? '我是士兵。' : i === DEMON && t >= 1.8 && t < 4.1 ? '不，我才是士兵！' : i === 0 && clue ? <>我的线索：老格、汉娜里<br />有 1 个坏人</> : null}
            bubbleBelow={i === 0} />
        );
      })}
      {clash && !clue && <div className="stamp">必有一个在说谎</div>}
      {t >= 4.1 && <Sub>好人说真话，坏人编故事。<b>把线索对一对，就能找出最可疑的人。</b></Sub>}
    </>
  );
}
BeatDay.dur = 7.2;
BeatDay.shakes = [[2.9, 0.35]];

// ───────────────────────── 5 投票 ─────────────────────────
const BOT_YES = [[2, 0.9], [6, 1.5]]; // 玛蒂娜、汉娜先举手
function BeatVote({ t, gate, act, acted }) {
  const after = acted ? t - gate : -1;
  useCues(t, [
    [0.9, () => tick(false)], [1.5, () => tick(false)], [gate + 0.02, () => tick(true)],
    [gate + 0.9, () => doorKick(0.8, true, 0.9)], [gate + 2.1, () => growl(0.5)], [gate + 2.8, () => chime([523, 659, 784, 1046], 0.22)],
  ]);
  const toCenter = ease(seg(t, 0.2, 0.7));
  const lp = ring(DEMON);
  const pos = { x: lp.x * (1 - toCenter), y: lp.y * (1 - toCenter) - 0.08 * Math.min(BOX.w, BOX.h) * toCenter }; // 移到圈中间偏上，下面留地方放票数
  const votes = BOT_YES.filter(([, w]) => t >= w).length + (acted ? 1 : 0);
  const executed = after >= 0.9;
  const revealed = after >= 2.1;
  const won = after >= 2.8;
  return (
    <>
      <Headline tone={won ? 'good' : ''}>{won ? '好人获胜！' : '投票，处决最可疑的人'}</Headline>
      {won && <div className="rays" />}
      {P.map((p, i) => (i === DEMON ? null : (
        <Face key={i} i={i} dead={i === VICTIM} hand={BOT_YES.some(([k, w]) => k === i && t >= w) || (i === 0 && acted)}
          ring={i === 0 ? 'var(--mot)' : undefined} />
      )))}
      <Face i={DEMON} pos={pos} scale={1 + toCenter * 0.45} fall={executed && !revealed}
        art={revealed ? ROLE_ART.imp : undefined} ring={revealed ? 'var(--phy)' : 'var(--opt)'} glow={revealed ? 'var(--phy)' : undefined}
        label={revealed ? '他就是恶魔！' : '被提名'} labelColor={revealed ? 'var(--phy)' : 'var(--opt)'} />
      {t >= 0.8 && !executed && (
        <div className={`count ${votes >= 3 ? 'ok' : ''}`}>{votes} / 3 票<small>{votes >= 3 ? '够了！' : !acted && t >= gate ? '还差你这一票' : '活人的一半就够'}</small></div>
      )}
      {!acted && t >= gate && <button type="button" className="raise" onClick={act}>✋ 举手</button>}
      {executed && !revealed && <div className="stamp big">处决</div>}
      <div className="flash red" style={{ opacity: flash(t, gate + 0.9, 0.5) * 0.6 }} />
      <div className="flash blue" style={{ opacity: acted ? flash(t, gate + 2.8, 0.8) * 0.6 : 0 }} />
      {won && <Sub>把恶魔处决，<b className="good">好人就赢了</b>。</Sub>}
    </>
  );
}
BeatVote.gate = 2.2;
BeatVote.dur = 2.2 + 4.4;
BeatVote.shakes = [[2.2 + 0.9, 0.5]];

// ───────────────────────── 6 恶魔怎么赢 ─────────────────────────
const NIGHTS = [[3, 1.0], [5, 1.7], [0, 2.4], [6, 3.1], [2, 3.8]]; // 一晚死一个，最后剩老格和卢卡
function BeatLose({ t }) {
  useCues(t, [...NIGHTS.map(([, w]) => [w, () => slash(0.45)]), [4.5, () => { growl(0.7); heartbeat(0.6); }]]);
  const lost = t >= 4.5;
  const nightNow = NIGHTS.some(([, w]) => t >= w - 0.15 && t < w + 0.35);
  return (
    <>
      <div className={`dusk ${nightNow ? 'on' : ''}`} />
      <Headline tone={lost ? 'evil' : ''}>{lost ? '只剩 2 人：恶魔获胜' : '要是一直抓不到恶魔……'}</Headline>
      {P.map((p, i) => {
        const d = NIGHTS.find(([k]) => k === i);
        const dead = d && t >= d[1];
        return <Face key={i} i={i} dead={dead} fall={dead} art={lost && i === DEMON ? ROLE_ART.imp : undefined} ring={lost && i === DEMON ? 'var(--phy)' : undefined} glow={lost && i === DEMON ? 'var(--phy)' : undefined} scale={lost && i === DEMON ? 1.3 : 1} />;
      })}
      {t >= 1 && !lost && <div className="nights" key={NIGHTS.filter(([, w]) => t >= w).length}>第 {NIGHTS.filter(([, w]) => t >= w).length + 1} 晚</div>}
      <div className="flash red" style={{ opacity: lost ? 0.25 + flash(t, 4.5, 0.7) * 0.5 : 0 }} />
      {lost && <Sub>恶魔每晚杀一个人。<b>所以白天的每一票都很重要。</b></Sub>}
    </>
  );
}
BeatLose.dur = 6.2;
BeatLose.shakes = [[4.5, 0.6]];

// ───────────────────────── 收尾 ─────────────────────────
const RECAP = ['恶魔藏在大家中间', '夜里，它杀一个人', '白天，大家投票处决它'];
function BeatGo({ t, onStart, onClose }) {
  return (
    <>
      <Headline>规则就这些</Headline>
      <ol className="recap">
        {RECAP.map((x, k) => t >= 0.3 + k * 0.35 && <li key={k}><i>{k + 1}</i>{x}</li>)}
      </ol>
      {t >= 1.5 && (
        <>
          <Sub>剩下的边玩边学。接下来是一局练习：你坐 1 号，是个<b className="good">好人</b>。</Sub>
          <div className="go-row">
            <button type="button" className="go" onClick={onStart}>开始练习局</button>
            <button type="button" className="go-ghost" onClick={onClose}>回大厅</button>
          </div>
        </>
      )}
    </>
  );
}
BeatGo.dur = 1.6;
BeatGo.final = true;

const BEATS = [
  { C: BeatDemon, mood: 'dark' },
  { C: BeatRole, mood: 'dark' },
  { C: BeatNight, mood: 'night' },
  { C: BeatDay, mood: 'day' },
  { C: BeatVote, mood: 'day' },
  { C: BeatLose, mood: 'night' },
  { C: BeatGo, mood: 'dark' },
];

/** 一段的时钟：秒数；gate 处停住等 act()；skip() 快进到下一个停点或结尾。 */
function useBeatClock(C, freeze) {
  const { gate, dur } = C;
  const [raw, setRaw] = useState(0);
  const [jump, setJump] = useState(() => (reduceMotion() ? 99 : 0));
  const [actedAt, setActedAt] = useState(null);
  useEffect(() => {
    if (freeze) return undefined; // 定格时不用每帧刷新
    let id = 0; const t0 = performance.now();
    const f = (now) => { setRaw((now - t0) / 1000); id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f);
    return () => cancelAnimationFrame(id);
  }, []);
  if (freeze) { // 预览页（?preview=intro&beat=&t=&acted=1）：停在某一帧，截图和检查用
    const acted = gate != null && freeze.acted;
    const t = gate != null && !acted ? Math.min(freeze.t, gate) : freeze.t;
    return { t, acted, act: () => {}, waiting: false, done: false, skip: () => {}, gate };
  }
  const r = raw + jump;
  const acted = actedAt != null;
  const t = gate == null ? Math.min(r, dur) : !acted ? Math.min(r, gate) : Math.min(dur, gate + (r - actedAt));
  const waiting = gate != null && !acted && t >= gate;
  const done = t >= dur;
  const act = () => setActedAt(r);
  const skip = () => { const target = gate != null && !acted ? gate : dur; setJump((j) => j + Math.max(0, target - t) + 0.01); };
  return { t, acted, act, waiting, done, skip, gate };
}

function Beat({ C, onStart, onClose, onNext, freeze }) {
  const clock = useBeatClock(C, freeze);
  const tr = shake(clock.t, C.shakes ?? []);
  const click = (e) => {
    if (e.target.closest('button') || C.final || clock.waiting) return;
    if (clock.done) onNext(); else clock.skip();
  };
  useEffect(() => {
    const k = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (clock.waiting) clock.act();
      else if (clock.done) { if (C.final) onStart(); else onNext(); } else clock.skip();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <div className="beat" onClick={click} role="presentation">
      <div className="beat-in" style={{ transform: tr }}>
        <C t={clock.t} gate={clock.gate} act={clock.act} acted={clock.acted} onStart={onStart} onClose={onClose} />
      </div>
      {clock.done && !C.final && <div className="next-hint">点击任意处继续 ▸</div>}
      {!clock.done && !clock.waiting && !C.final && <div className="next-hint dim">点击快进</div>}
    </div>
  );
}

/** 开场介绍。onStart：进练习局；onClose：回大厅。 */
export function TutorialIntro({ onStart, onClose, freeze = null }) {
  const [i, setI] = useState(freeze?.beat ?? 0);
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const f = () => setBox({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  BOX = box;
  const beat = BEATS[i];
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`ti2 mood-${beat.mood}`} role="dialog" aria-label="新手教程：一分钟看懂规则">
      <div className="ti2-bg" />
      <header className="ti2-head">
        <div className="ti2-prog">
          {BEATS.map((b, k) => <button key={k} type="button" className={k < i ? 'seen' : k === i ? 'on' : ''} disabled={k > i} onClick={() => setI(k)} aria-label={`第 ${k + 1} 段`} />)}
        </div>
        <div className="ti2-tools">
          {i > 0 && <button type="button" onClick={() => setI(i - 1)}>上一段</button>}
          <button type="button" onClick={onStart}>跳过，直接练习</button>
          <button type="button" onClick={onClose} aria-label="关闭">✕</button>
        </div>
      </header>
      <Beat key={i} C={beat.C} freeze={freeze} onStart={onStart} onClose={onClose} onNext={() => setI((x) => Math.min(BEATS.length - 1, x + 1))} />
    </div>
  );
}
