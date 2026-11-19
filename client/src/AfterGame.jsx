// 赛后（2026-11-19 用户）：AI 赛后总结 + 军事法庭（AI 判一名战犯，全场同时看他被吊起来，啪一下，然后彩带、欢呼）+ MVP 投票放在一起。
// 服务器在 view.after / view.court 里给结果；court.at 是动画开始的时间，所有人同时看。
import { useEffect, useRef, useState } from 'react';
import { Portrait } from './util.jsx';
import { audio, sfxEnabled } from './world/footsteps.js';
import { bus } from './mixer.js';

const playerOf = (s, id) => s.players?.find((p) => p.id === id);

/** 结算面板里的「赛后」一节：总结、话最多的人、军事法庭的判词（可以再放一遍）。 */
export function AfterGame({ s, onReplay = () => window.dispatchEvent(new Event('court-replay')) }) {
  const a = s.after;
  const c = s.court;
  if (!a && !c) return null;
  const crim = c && playerOf(s, c.id);
  return (
    <section className="after-game">
      {a && (
        <div className="ag-recap">
          <h4>📜 赛后总结</h4>
          {a.pending ? <p className="muted">AI 说书人正在整理这局……</p> : a.recap ? <>
            <p>{a.recap}</p>
            {a.moments?.length > 0 && <ul>{a.moments.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </> : <p className="muted">这局没有 AI 总结（没配 AI 或没收到发言）。</p>}
          {a.talkers?.length > 0 && <p className="ag-talk muted">话最多：{a.talkers.map((t) => `${playerOf(s, t.id)?.seat ?? ''}号 ${playerOf(s, t.id)?.name ?? ''}（${t.chars} 字）`).join('、')}</p>}
        </div>
      )}
      {crim && (
        <div className="ag-court">
          <h4>⚖️ 军事法庭</h4>
          <div className="ag-verdict">
            <Portrait p={crim} size={44} speak={false} />
            <div>
              <b>{crim.seat}号 {crim.name}</b> 被判为本局战犯
              {c.reason && <p>{c.reason}</p>}
              {c.evidence?.length > 0 && <p className="ag-evidence">罪证：{c.evidence.map((e, i) => <q key={i}>{e}</q>)}</p>}
            </div>
          </div>
          <button type="button" className="ag-replay" onClick={onReplay}>再吊一次</button>
        </div>
      )}
    </section>
  );
}

// ───────────── 音效（现场合成，走「音效」那一路）─────────────
function ready() { if (!sfxEnabled()) return null; const a = audio(); return a && a.state === 'running' ? a : null; }
let noiseBuf = null;
const noise = (a) => {
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return noiseBuf;
};
/** 鼓点滚奏：一段越来越响的「嗒嗒嗒嗒」。 */
function drumroll(sec = 1.4) {
  const a = ready(); if (!a) return;
  const t = a.currentTime + 0.02;
  for (let k = 0; k < sec * 22; k++) {
    const t0 = t + k / 22;
    const src = a.createBufferSource(); src.buffer = noise(a);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 1.2;
    const g = a.createGain(); const v = 0.05 + 0.25 * (k / (sec * 22));
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(f).connect(g).connect(bus(a, 'sfx')); src.start(t0, Math.random(), 0.06);
  }
}
/** 「啪」：活板门打开、绳子绷紧的一记闷响。 */
function snap() {
  const a = ready(); if (!a) return;
  const t = a.currentTime + 0.01;
  const o = a.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  const g = a.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(bus(a, 'sfx')); o.start(t); o.stop(t + 0.4);
  const src = a.createBufferSource(); src.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
  const h = a.createGain(); h.gain.setValueAtTime(0.5, t); h.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  src.connect(f).connect(h).connect(bus(a, 'sfx')); src.start(t, 0, 0.1);
}
/** 欢呼：一段上行的小号和弦 + 一阵人群的「哗——」（带通噪声）。 */
function cheer() {
  const a = ready(); if (!a) return;
  const t = a.currentTime + 0.02;
  [523, 659, 784, 1047].forEach((fq, k) => {
    const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = fq;
    const g = a.createGain(); const t0 = t + k * 0.11;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g).connect(bus(a, 'sfx')); o.start(t0); o.stop(t0 + 1);
  });
  const src = a.createBufferSource(); src.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  src.connect(f).connect(g).connect(bus(a, 'sfx')); src.start(t, 0, 2);
}

const LEN = 7200; // 动画总长（毫秒）

/**
 * 全场同时看的动画：绞刑架上三个小人——两边是戴头套的刽子手，中间那个顶着战犯的头像；
 * 鼓点滚奏，「啪」一下活板门打开、他掉下去晃荡，然后彩带炸开、欢呼。只放一次（同一个判决），可以再放。
 */
export function CourtFx({ s }) {
  const c = s.court;
  const seen = useRef(new Set());
  const [show, setShow] = useState(null);
  const [replay, setReplay] = useState(0); // 结算面板上点「再吊一次」
  useEffect(() => { const f = () => setReplay((r) => r + 1); window.addEventListener('court-replay', f); return () => window.removeEventListener('court-replay', f); }, []);
  useEffect(() => {
    if (!c?.id) return undefined;
    const key = `${c.id}-${c.at}-${replay}`;
    if (seen.current.has(key)) return undefined;
    const late = Date.now() - c.at;
    if (!replay && late > 5000) { seen.current.add(key); return undefined; } // 进来时已经吊完了：不补放
    seen.current.add(key);
    const wait = replay ? 0 : Math.max(0, -late);
    const timers = [
      setTimeout(() => { setShow({ key, p: playerOf(s, c.id) }); drumroll(); }, wait),
      setTimeout(snap, wait + 1600),
      setTimeout(cheer, wait + 2100),
      setTimeout(() => setShow(null), wait + LEN),
    ];
    return () => timers.forEach(clearTimeout);
  }, [c?.id, c?.at, replay]);
  if (!show?.p) return null;
  const p = show.p;
  return (
    <div className="court-fx" key={show.key} aria-hidden="true">
      <div className="cf-stage">
        <p className="cf-title">⚖️ 军事法庭</p>
        <p className="cf-verdict"><b>{p.seat}号 {p.name}</b> 被判为本局战犯</p>
        <div className="cf-gallows">
          <i className="cf-post" /><i className="cf-beam" /><i className="cf-rope" />
          <i className="cf-floor" /><i className="cf-trap" />
          <div className="cf-man cf-left"><i className="cf-hood" /><i className="cf-body" /></div>
          <div className="cf-man cf-convict">
            <span className="cf-head"><Portrait p={p} size={40} speak={false} /></span><i className="cf-noose" /><i className="cf-body" />
          </div>
          <div className="cf-man cf-right"><i className="cf-hood" /><i className="cf-body" /></div>
          <b className="cf-pa">啪！</b>
        </div>
        <p className="cf-cheer">欢呼～ 🎉</p>
      </div>
      <div className="cf-confetti">{Array.from({ length: 48 }, (_, i) => (
        <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 7) * 0.12}s`, '--r': `${(i * 53) % 360}deg`, '--c': ['#e8c66a', '#c0392b', '#7d9cc4', '#9c6fd6', '#6fae6a'][i % 5] }} />
      ))}</div>
    </div>
  );
}
