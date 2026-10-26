// 暗流涌动：恶魔破门的两段过场（每人在镇上有个家）。
// · 恶魔自己：选好目标后变身，从自家冲到受害者家，踹开门，进屋把人杀了（DemonDash）。只在恶魔自己的屏幕上播。
// · 受害者：夜晚结算后，门被一下下踹响，弹出"挡住门"的 QTE——注定挡不住，门被踹开，死去（DoorKick）。
import { useEffect, useRef, useState } from 'react';
import { Portrait } from './util.jsx';
import { ROLE_ART } from './art.js';
import { KillDash } from './TownMap.jsx';
import { doorKick, heartbeat, shove, slash, growl } from './world/footsteps.js';

const MORPH_MS = 1900;
// 恶魔到门口后：两脚踹门、第三脚踹开（毫秒，从到门口算起），然后切进屋里
const MY_KICKS = [0, 420];
const MY_BURST = 800;
const GO_IN = 1150;
// 屋里那段的时间线（毫秒）：门口出现 → 扑上来 → 三下爪击 → 倒下 → 黑屏
const KILL = { growl: 150, lunge: 900, slashes: [1250, 1450, 1650], fall: 1800, end: 3600 };

export function DemonDash({ s, target, roleId, onDone }) {
  const [stage, setStage] = useState('morph'); // morph → dash → kick → kill
  const [kicks, setKicks] = useState(0);
  useEffect(() => {
    doorKick(0.25); // 变身时一声闷响
    const t = setTimeout(() => setStage('dash'), MORPH_MS);
    return () => clearTimeout(t);
  }, []);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const arrive = () => {
    setStage('kick');
    const at = (ms, f) => timers.current.push(setTimeout(f, ms));
    MY_KICKS.forEach((ms, i) => at(ms, () => { doorKick(0.8, false, 0.5 + i * 0.3); setKicks((k) => k + 1); }));
    at(MY_BURST, () => { doorKick(1, true); setKicks((k) => k + 1); });
    at(GO_IN, () => setStage('kill'));
  };
  const me = s.players.find((p) => p.id === s.me);
  const victim = s.players.find((p) => p.id === target);
  if (stage === 'morph') {
    return (
      <div className="kill-scene morph" aria-label="变身">
        <div className="morph-face">{me && <Portrait p={me} size={200} prefer="avatar" frame="#f4f4f0" />}</div>
        {ROLE_ART[roleId] && <img className="morph-demon" src={ROLE_ART[roleId]} alt="" />}
        <div className="morph-flash" />
      </div>
    );
  }
  return (
    <>
      {/* 不能用 key 重挂（会把地图和冲刺重来一遍），震动靠两个同样的动画名来回切 */}
      <div className={`kd-map ${kicks ? `kick-${kicks % 2}` : ''}`} style={{ '--kick': kicks / 3 }}>
        <KillDash s={s} target={target} onArrive={arrive} vanish={kicks >= 3} />
      </div>
      {stage === 'kill' && <DemonKill victim={victim} roleId={roleId} onDone={onDone} />}
    </>
  );
}

/** 恶魔这边：踹开门以后，屋里的人回头——恶魔扑上去，三下爪击，人倒下。 */
export function DemonKill({ victim, roleId, onDone }) {
  useEffect(() => {
    const ts = [setTimeout(() => growl(0.55), KILL.growl)];
    KILL.slashes.forEach((ms, i) => ts.push(setTimeout(() => slash(0.6 + i * 0.15), ms)));
    ts.push(setTimeout(() => doorKick(0.45, false, 0.2), KILL.fall + 350)); // 人倒在地板上
    ts.push(setTimeout(onDone, KILL.end));
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div className="kill-scene demon-kill" aria-label="得手">
      <div className="dkl-door"><div className="dkl-doorway" /></div>
      {ROLE_ART[roleId] && <img className="dkl-demon" src={ROLE_ART[roleId]} alt="" />}
      <div className="dkl-victim">{victim && <Portrait p={victim} size={160} prefer="avatar" frame="#f4f4f0" speak={false} />}</div>
      <div className="dkl-claws"><i /><i /><i /></div>
      <div className="dkl-flash" />
      <div className="dkl-fade" />
    </div>
  );
}

// "挡住门"的 QTE 先藏起来（反正注定挡不住）；改成 true 就回来
const QTE = false;

// 受害者的时间线（毫秒）：门外脚步 → 越踹越急的六下 → 最后一脚把门踹开
const KICKS = [900, 1700, 2350, 2900, 3350, 3750];
const BURST = 4150;
const DEAD = 5300;

export function DoorKick() {
  const [t0] = useState(() => performance.now());
  const [now, setNow] = useState(0);
  const [hold, setHold] = useState(0.75); // 门还能撑多久（QTE 进度条）
  const [kicks, setKicks] = useState(0);  // 踹了几下（每下震一次）
  const [shoves, setShoves] = useState(0); // 顶了几下（每下门往回顶一下）
  const done = useRef({ kick: 0, beat: 0, last: 0, burst: false });
  useEffect(() => {
    let raf;
    const tick = () => {
      const t = performance.now() - t0;
      const d = done.current;
      const dt = Math.min(0.1, (t - d.last) / 1000); d.last = t;
      setNow(t);
      while (d.kick < KICKS.length && t >= KICKS[d.kick]) {
        const power = d.kick / (KICKS.length - 1);
        doorKick(0.75 + power * 0.2, false, power);
        setKicks((x) => x + 1);
        setHold((h) => Math.max(0.04, h - (0.1 + power * 0.3)));
        d.kick += 1;
      }
      if (!d.burst && t >= BURST) { d.burst = true; doorKick(1, true); setHold(0); setKicks((x) => x + 1); }
      // 心跳：踹门开始后越来越急
      const gap = t < KICKS[0] ? 900 : Math.max(260, 700 - (t - KICKS[0]) * 0.13);
      if (t < BURST && t - d.beat > gap) { d.beat = t; heartbeat(t < KICKS[0] ? 0.2 : 0.35); }
      // 门一直被往里推，越往后推得越狠（最后一两秒按得再快也顶不住）
      const p = Math.max(0, (t - KICKS[0]) / (BURST - KICKS[0]));
      if (QTE && t > KICKS[0] && t < BURST) setHold((h) => Math.max(0.04, h - dt * (0.2 + 0.9 * p * p)));
      if (t < DEAD + 400) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const live = useRef({});
  live.current.push = () => {
    const t = performance.now() - t0;
    if (!QTE || t < KICKS[0] || t >= BURST) return;
    shove(0.45);
    setShoves((x) => x + 1);
    setHold((h) => Math.min(0.95, h + 0.09));
  };
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) live.current.push(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const qte = QTE && now > KICKS[0] && now < BURST;
  const burst = now >= BURST;
  const dead = now >= DEAD;
  return (
    <div className={`kill-scene door-kick ${QTE ? 'qte' : ''} ${burst ? 'burst' : ''} ${dead ? 'dead' : ''}`}
      onPointerDown={(e) => { e.preventDefault(); live.current.push(); }}>
      <div className={`dk-room kick-${kicks % 2}`} key={`k${kicks}`} style={{ '--kick': Math.min(1, kicks / KICKS.length) }}>
        <div className={`dk-door ${burst ? 'flying' : ''} ${!burst && shoves ? `shove-${shoves % 2}` : ''}`} key={`s${shoves}`}><i /><i /><i /></div>
      </div>
      {now < KICKS[0] && <p className="dk-line">……门外有脚步声，越来越近。</p>}
      {qte && (
        <div className="dk-qte">
          <b>挡住门！</b>
          <span>连按空格 / 连点屏幕</span>
          <div className={`dk-bar ${hold < 0.25 ? 'low' : ''}`}><div style={{ width: `${hold * 100}%` }} /></div>
          {shoves > 0 && <em key={shoves}>顶住 ×{shoves}</em>}
        </div>
      )}
      {burst && !dead && <p className="dk-line big">门被踹开了。</p>}
      {dead && <p className="dk-line big">你死了。</p>}
    </div>
  );
}
