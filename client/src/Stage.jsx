// AI 房主的"舞台效果"（参考极乐迪斯科）：
// · 过场标题卡：入夜、天亮、处决、终局时，整屏压暗，大字标题 + 一句旁白逐字打出来。
// · 技能检定：夜里拿到私密信息时，右上角弹出「逻辑 [被动：成功]」那样的检定条，接着是内心的声音。
// · 旁白都会被语音播报读出来（voice.js）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Md, portraitSrc } from './util.jsx';
import { speak, ttsEnabled, ttsSupported, setTts, onTts } from './voice.js';
import { voiceOf, ROLE_NAMES } from './flavor.js';
import { sfxEnabled, setSfx, onSfx } from './world/footsteps.js';
import { musicEnabled, setMusic, onMusic } from './ambience.js';

/** 逐字打出来的一行字。 */
function Typewriter({ text, speed = 55 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 1)), speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <>{text.slice(0, n)}<span className="tw-rest">{text.slice(n)}</span></>;
}

/** 盯着日志：新的旁白读出来；带标题的排队弹标题卡。刚连上时的旧日志不算。 */
export function useNarrator(log) {
  const seen = useRef(null);
  const [cards, setCards] = useState([]);
  useEffect(() => {
    if (!log) return; // 还没连上
    const last = log.at(-1)?.id ?? 0;
    if (seen.current == null) { seen.current = last; return; }
    const fresh = log.filter((l) => l.id > seen.current && l.kind === 'story');
    seen.current = Math.max(seen.current, last);
    for (const l of fresh) speak(l.text, l.audio);
    const titled = fresh.filter((l) => l.title).map((l) => ({ ...l, key: l.id }));
    if (titled.length) setCards((cur) => [...cur, ...titled].slice(-3));
  }, [log]);
  return [cards[0] ?? null, useCallback(() => setCards((cur) => cur.slice(1)), [])];
}

export function TitleCard({ card, onClose, players = [] }) {
  useEffect(() => {
    if (!card) return undefined;
    const t = setTimeout(onClose, Math.max(4200, card.text.length * 150 + 1800));
    return () => clearTimeout(t);
  }, [card, onClose]);
  if (!card) return null;
  const tone = /处决|邪恶/.test(card.title) ? 'phy' : /夜/.test(card.title) ? 'night' : 'day';
  return (
    <div className={`titlecard tc-${tone}`} key={card.key} onClick={onClose} role="presentation">
      <div className="tc-inner">
        {card.title === '处决' && <Gallows p={players.find((q) => card.text.includes(`${q.seat}号 ${q.name}`))} />}
        <span className="tc-kicker">说书人</span>
        <h2 className="tc-title">{card.title}</h2>
        <p className="tc-line"><Typewriter text={card.text} /></p>
      </div>
    </div>
  );
}

/** 处决：绞刑架画出来 → 绳子垂下 → 活板门打开、红光一闪 → 绳子晃几下。纯 SVG + CSS 动画。 */
function Gallows({ p }) {
  const src = portraitSrc(p);
  return (
    <svg className="gallows" viewBox="0 0 200 220" aria-hidden="true">
      <defs><clipPath id="g-face"><rect x="113" y="104" width="34" height="38" /></clipPath></defs>
      <g className="g-frame" fill="none" stroke="#e9e1cf" strokeWidth="7" strokeLinecap="square">
        <path pathLength="1" d="M40 205 L40 20 L140 20" />
        <path pathLength="1" d="M40 60 L80 20" strokeWidth="5" />
        <path pathLength="1" d="M15 205 L185 205" strokeWidth="5" />
      </g>
      <g className="g-rope">
        <line x1="130" y1="20" x2="130" y2="98" stroke="#c9a46a" strokeWidth="3" />
        <ellipse cx="130" cy="112" rx="11" ry="15" fill="none" stroke="#c9a46a" strokeWidth="3" />
        {p && (
          <g className="g-person">
            <rect x="111" y="102" width="38" height="42" fill="#e9e1cf" />
            {src
              ? <image href={src} x="113" y="104" width="34" height="38" preserveAspectRatio="xMidYMid slice" clipPath="url(#g-face)" />
              : <rect x="113" y="104" width="34" height="38" fill="#5a4a44" />}
            {!src && <text x="130" y="129" textAnchor="middle" fill="#f2efe6" fontSize="18" fontWeight="900">{[...(p.name ?? '?')][0]}</text>}
            <rect x="111" y="144" width="38" height="11" fill="#111" />
            <text x="130" y="152.5" textAnchor="middle" fill="#f2efe6" fontSize="8" fontWeight="900">{p.seat}号</text>
          </g>
        )}
      </g>
      <g className="g-deck" fill="#e9e1cf">
        <rect x="70" y="160" width="40" height="6" className="g-door l" />
        <rect x="110" y="160" width="40" height="6" className="g-door r" />
        <rect x="66" y="166" width="6" height="39" />
        <rect x="148" y="166" width="6" height="39" />
      </g>
    </svg>
  );
}

/** 盯着自己的私密信息：新到的弹一个技能检定。 */
export function useChecks(inbox) {
  const seen = useRef(null);
  const [check, setCheck] = useState(null);
  useEffect(() => {
    const list = inbox ?? [];
    const last = list.at(-1)?.id ?? 0;
    if (seen.current == null) { seen.current = last; return; }
    const fresh = list.filter((m) => m.id > seen.current);
    seen.current = Math.max(seen.current, last);
    if (fresh.length) setCheck({ ...fresh.at(-1), key: fresh.at(-1).id });
  }, [inbox]);
  return [check, useCallback(() => setCheck(null), [])];
}

export function SkillCheck({ check, onClose }) {
  useEffect(() => {
    if (!check) return undefined;
    const t = setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [check, onClose]);
  if (!check) return null;
  const v = voiceOf(check.voice, ROLE_NAMES);
  return (
    <button type="button" className="skillcheck" key={check.key} onClick={onClose} style={{ '--attr': v.color }}>
      <span className="sc-head">
        <b>{v.skill ?? v.who}</b>
        <span className="sc-roll">{v.skill ? '[被动：成功]' : ''}</span>
      </span>
      {v.flavor?.hear && <span className="sc-flavor">「<Typewriter text={v.flavor.hear} speed={35} />」</span>}
      <span className="sc-text"><Md text={check.text} /></span>
    </button>
  );
}

/** 语音播报、脚步音效的开关（存在本机）。 */
export function SoundToggles() {
  const [tts, setT] = useState(ttsEnabled());
  const [sfx, setS] = useState(sfxEnabled());
  const [music, setM] = useState(musicEnabled());
  useEffect(() => onTts(setT), []);
  useEffect(() => onSfx(setS), []);
  useEffect(() => onMusic(setM), []);
  return (
    <div className="sound-toggles">
      {ttsSupported && <button type="button" className={tts ? 'on' : ''} onClick={() => setTts(!tts)} title="AI 房主的语音播报">{tts ? '播报 开' : '播报 关'}</button>}
      <button type="button" className={sfx ? 'on' : ''} onClick={() => setSfx(!sfx)} title="脚步声、敲门声">{sfx ? '音效 开' : '音效 关'}</button>
      <button type="button" className={music ? 'on' : ''} onClick={() => setMusic(!music)} title="背景音乐和风雪声">{music ? '音乐 开' : '音乐 关'}</button>
    </div>
  );
}
