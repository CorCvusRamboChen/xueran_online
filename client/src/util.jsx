import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../src/shared/characters.js';
import { PEOPLE_ART, ROLE_ART } from './art.js';
import { ROLES } from '../../src/engine/roles.js';
import { useSpeaking } from './speaking.js';

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** 服务器时间 - 本地时间。走路动画、倒计时都按服务器时间算。 */
export const clock = { offset: 0, n: 0 };
export const serverNow = () => Date.now() + clock.offset;

/**
 * 用服务器发来的时间戳对表。每条消息都带着不同的网络延迟，直接覆盖的话表会前后跳几十毫秒，
 * 地图上的小人和镜头就一顿一顿的。所以只信延迟最小的那次（偏差最大的那个样本最接近真实时差），
 * 其余样本只用来非常缓慢地跟上两边时钟的漂移。
 */
export function syncClock(serverTime) {
  if (typeof serverTime !== 'number') return;
  const sample = serverTime - Date.now();
  if (clock.n++ === 0 || sample > clock.offset) clock.offset = sample;
  else clock.offset += (sample - clock.offset) * 0.01;
}

/** 只认 **加粗**，服务器发来的信息都是这个格式。 */
export function Md({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>);
}

// FNV 哈希再按黄金角打散：id 只差一个字符也能分得开
export const hue = (id) => {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.round(((h >>> 0) * 137.508) % 360);
};

/** 方形油画肖像：先用挑的人物画像，再用 Discord 头像，都没有就是一块色彩 + 首字。 */
/** prefer='avatar'：Discord 头像优先（小镇里头顶飘的那个），没有再用人物立绘。 */
export function Portrait({ p, size, frame = 'var(--cream)', prefer = 'art', speak = true }) {
  const speaking = useSpeaking(speak ? p?.id : null);
  const ch = p.char ? CHAR_BY_ID[p.char] : null;
  const art = ch && PEOPLE_ART[ch.id];
  const srcs = (prefer === 'avatar' ? [p.avatar, art] : [art, p.avatar]).filter(Boolean);
  const [failed, setFailed] = useState(0);
  useEffect(() => { setFailed(0); }, [p.char, p.avatar]);
  const initial = ch ? [...ch.name][0] : p.fake ? p.name.replace(/D/g, '') || '机' : [...(p.name ?? '?')][0];
  const src = srcs[failed];
  // Discord 头像本来就是正方形：用正方形框完整显示；画好的人物肖像是竖的 5:6
  const square = !!src && src === p.avatar;
  const w = size; const h = square ? size : Math.round(size * 1.2);
  return (
    <div className={`portrait ${square ? 'is-avatar' : ''} ${speaking ? 'speaking' : ''}`} style={{ width: w, height: h, '--frame': speaking ? '#3fd47a' : frame }}>
      {src
        ? <img src={src} alt="" onError={() => setFailed((x) => x + 1)} />
        : <div className="portrait-paint" style={{ background: `hsl(${ch ? ch.hue : hue(p.id)} 28% 38%)`, fontSize: w * 0.5 }}>{initial}</div>}
    </div>
  );
}

/** 这个人的头像图（优先 Discord 头像，其次画好的人物肖像）。 */
export function portraitSrc(p) {
  const ch = p?.char ? CHAR_BY_ID[p.char] : null;
  return p?.avatar ?? (ch && PEOPLE_ART[ch.id]) ?? null;
}

/** 服务器给的截止时间 → 剩余秒数。 */
export function useCountdown(deadline) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
}

/** 每隔 ms 刷新一次（让时钟走起来）。 */
export function useTick(ms = 1000) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const cnNum = (n) => (n <= 10 ? CN[n] : n < 20 ? `十${CN[n - 10]}` : `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ''}`);

const hhmm = (min) => {
  const m = Math.round(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

/** 游戏里的时刻：天亮 08:00，自由活动 12:00→17:00，黄昏 17:40 起，深夜 00:30→04:00。 */
export function gameClock(s) {
  const now = serverNow();
  if (s.phase === 'ended') return { time: '06:00', label: '黎明' };
  if (s.phase === 'night') {
    const span = (s.settings?.chooseSeconds ?? 90) * 1000;
    const t = s.deadline ? 1 - (s.deadline - now) / span : 0.5; // 夜里玩家只在自己选人时才拿到截止时间，其余时候时钟停在深夜
    return { time: hhmm(lerp(30, 240, t)), label: `第${cnNum(s.night)}夜` };
  }
  const day = `第${cnNum(s.day)}日`;
  if (s.dayStage === 'roam') {
    const until = s.roam?.until;
    const span = (s.settings?.roamMinutes || 5) * 60_000;
    const t = until ? 1 - (until - now) / span : 0.4;
    return { time: hhmm(lerp(12 * 60, 17 * 60, t)), label: day };
  }
  if (s.dayStage === 'square') return { time: s.vote ? '18:05' : '17:40', label: `${day} · 黄昏` };
  return { time: '08:00', label: `${day} · 清晨` };
}

/**
 * 极乐迪斯科式对话框。lines：[{who, color, chip, chipColor, text, flavor}]；
 * options：[{label, hint, onClick, disabled, hi}]；keys 为 true 时电脑上按数字键选（同一时间只给一个对话框开）。
 */
export function Dialogue({ lines = [], options = [], children, keys = false }) {
  useEffect(() => {
    if (!keys) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      const o = options.filter((x) => x?.onClick)[n - 1];
      if (o && !o.disabled) { e.preventDefault(); o.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, keys]);
  let n = 0;
  return (
    <div className="dlg">
      {lines.filter(Boolean).map((l, i) => <Line key={i} {...l} />)}
      {children}
      {options.filter(Boolean).length > 0 && (
        <ol className="opts">
          {options.filter(Boolean).map((o, i) => {
            const num = o.onClick ? ++n : null;
            return (
              <li key={i}>
                <button type="button" className={`opt ${o.hi ? 'hi' : ''}`} disabled={o.disabled || !o.onClick} onClick={o.onClick}>
                  <span className="opt-n">{num ? `${num}.` : '—'}</span>
                  <span>{o.label}{o.hint && <span className="opt-hint">{o.hint}</span>}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const ROLE_BY_NAME = Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [r.name, id]));
// 魔典的一行（服务器 Game.grimoire() 的格式）：【邪】4号 名字 — 小恶魔（中毒、占卜师的干扰项）
const GRIM_LINE = /^【(善|邪)】(\d+)号 (.+) — ([^（]+)(?:（(.+)）)?$/;
const TEAM_COLOR = { townsfolk: 'var(--int)', outsider: 'var(--psy)', minion: 'var(--phy)', demon: 'var(--phy)' };

/** 多行信息：一行一段；魔典的行排成一张表（座位、角色小图、名字、角色、提示标记），一人一行对齐。 */
function MultiLine({ text }) {
  const lines = text.split('\n');
  const out = [];
  let rows = [];
  const flush = () => {
    if (!rows.length) return;
    out.push(
      <ol className="grim" key={`g${out.length}`}>
        {rows.map(([, side, seat, name, roleName, tags]) => {
          const id = ROLE_BY_NAME[roleName.trim()];
          return (
            <li key={seat} className={side === '邪' ? 'evil' : 'good'}>
              <span className="grim-seat">{seat}</span>
              <span className="grim-icon">{id && ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" /> : null}</span>
              <span className="grim-who">
                <b style={{ color: TEAM_COLOR[ROLES[id]?.team] ?? 'inherit' }}>{roleName.trim()}</b>
                <small>{name}{side === '邪' ? ' · 邪恶' : ''}</small>
              </span>
              {tags && <span className="grim-tags">{tags.split(/[、，]/).map((t) => <i key={t}>{t}</i>)}</span>}
            </li>
          );
        })}
      </ol>,
    );
    rows = [];
  };
  for (const l of lines) {
    const m = l.match(GRIM_LINE);
    if (m) { rows.push(m); continue; }
    flush();
    if (l.trim()) out.push(<span className="ml-line" key={`l${out.length}`}><Md text={l} /></span>);
  }
  flush();
  return out;
}

export function Line({ who, color = 'var(--cream)', chip, chipColor, text, flavor, children }) {
  return (
    <p className="line">
      {who && <span className="who" style={{ color }}>{who}</span>}
      {chip && <span className="chk" style={{ background: chipColor ?? color }}>{chip}</span>}
      {who && ' — '}
      {flavor && <span className="flavor">{flavor}</span>}
      {flavor && text && ' '}
      {text && <span className="said">{text.includes('\n') ? <MultiLine text={text} /> : <Md text={text} />}</span>}
      {children}
    </p>
  );
}
