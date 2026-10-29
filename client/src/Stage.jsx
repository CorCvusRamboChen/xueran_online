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
import { VolumeButton } from './Volume.jsx';

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

/**
 * 编号对齐：刚连上、或者换了房间实例（epoch 变了：房间被清掉重建、进出教程），把现有的都当成看过的；
 * 编号倒退（老服务器没发 epoch）也重新对齐。返回 true 表示这次只是对齐，没有新内容。
 */
function realign(seen, epochRef, epoch, last) {
  if (seen.current == null || epochRef.current !== epoch || last < seen.current) {
    seen.current = last; epochRef.current = epoch;
    return true;
  }
  return false;
}

/** 盯着日志：新的旁白读出来；带标题的排队弹标题卡。刚连上时的旧日志不算。 */
export function useNarrator(log, epoch) {
  const seen = useRef(null);
  const epochRef = useRef(epoch);
  const [cards, setCards] = useState([]);
  useEffect(() => {
    if (!log) return; // 还没连上
    const last = log.at(-1)?.id ?? 0;
    if (realign(seen, epochRef, epoch, last)) return;
    const fresh = log.filter((l) => l.id > seen.current && l.kind === 'story');
    seen.current = Math.max(seen.current, last);
    for (const l of fresh) speak(l.text, l.audio);
    const titled = fresh.filter((l) => l.title).map((l) => ({ ...l, key: l.id }));
    // "第 N 天"一到就把还没放的旧卡丢掉，直接放它（不然开局时几张卡排队，天亮的卡要等到自由活动开始以后才出来）
    const dawnAt = titled.findIndex((l) => /^第.+天$/.test(l.title));
    if (dawnAt >= 0) setCards(titled.slice(dawnAt));
    else if (titled.length) setCards((cur) => [...cur, ...titled].slice(-3));
  }, [log, epoch]);
  return [cards[0] ?? null, useCallback(() => setCards((cur) => cur.slice(1)), [])];
}

// 白天自由活动时当众发生的事（公开声明、开枪）：做成不挡操作的横幅——点击穿过去，大家正在地图上点着走路，
// 整屏的卡一出来就会被顺手点掉，看起来就像"没有播报"。横幅只能按右上角的 × 关，时间到自己收起。
const BANNER = new Set(['公开声明', '开枪']);
// 整屏的卡刚出来这一会儿不响应点击（防止上一下点地图的连击把它点掉）
const CLICK_GUARD_MS = 1500;

export function TitleCard({ card, onClose, players = [] }) {
  const shownAt = useRef(0);
  useEffect(() => {
    if (!card) return undefined;
    shownAt.current = Date.now();
    const t = setTimeout(onClose, Math.max(BANNER.has(card.title) ? 7000 : 4200, card.text.length * 150 + 1800));
    return () => clearTimeout(t);
  }, [card, onClose]);
  if (!card) return null;
  // "第 N 天"：天亮那张卡做成浅的（只在下方垫一层暗），让后面小屋里的晨光动画露出来
  const tone = /^第.+天$/.test(card.title) ? 'dawn' : /处决|邪恶|开枪/.test(card.title) ? 'phy' : /夜/.test(card.title) ? 'night' : 'day';
  if (BANNER.has(card.title)) {
    return (
      <div className={`tc-banner tc-${tone}`} key={card.key} role="status" aria-live="assertive">
        <button type="button" className="tc-banner-x" onClick={onClose} aria-label="关掉">×</button>
        <span className="tc-kicker">说书人 · 当众</span>
        <h2 className="tc-title">{card.title}</h2>
        <p className="tc-line"><Typewriter text={card.text} speed={40} /></p>
      </div>
    );
  }
  const tryClose = () => { if (Date.now() - shownAt.current > CLICK_GUARD_MS) onClose(); };
  return (
    <div className={`titlecard tc-${tone}`} key={card.key} onClick={tryClose} role="presentation">
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
export function useChecks(inbox, epoch) {
  const seen = useRef(null);
  const epochRef = useRef(epoch);
  const [check, setCheck] = useState(null);
  useEffect(() => {
    const list = inbox ?? [];
    const last = list.at(-1)?.id ?? 0;
    if (realign(seen, epochRef, epoch, last)) return;
    const fresh = list.filter((m) => m.id > seen.current);
    seen.current = Math.max(seen.current, last);
    if (fresh.length) setCheck({ ...fresh.at(-1), key: fresh.at(-1).id });
  }, [inbox, epoch]);
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

/** 语音播报、脚步音效、音乐的开关和音量（存在本机）。onFixVoice：对局中显示"语音归位"（卡在房间里出不来时点）。 */
export function SoundToggles({ onFixVoice = null }) {
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
      <VolumeButton />
      {onFixVoice && <button type="button" onClick={onFixVoice} title="语音卡在别的房间、回不到广场，或者一直被闭着麦时点这里">语音归位</button>}
    </div>
  );
}
