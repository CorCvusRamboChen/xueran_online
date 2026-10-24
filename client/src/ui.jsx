// 极乐迪斯科风格的基础界面零件：白底黑字标签、深色面板（四角准星）、红色主按钮、
// 白色数字框、检定标签、底部 HUD 栏的方形图标按钮。
import { Portrait } from './util.jsx';

/** 白底黑字的斜切标签，像游戏里的「INVENTORY」「CHARACTER SHEET」。 */
export const Tag = ({ children, tone = 'light', className = '' }) => (
  <span className={`tag tag-${tone} ${className}`}>{children}</span>
);

/** 深色面板，四角有准星。 */
export function Panel({ title, tone, extra, children, className = '' }) {
  return (
    <section className={`pnl ${className}`}>
      <i className="cross tl" /><i className="cross tr" /><i className="cross bl" /><i className="cross br" />
      {(title || extra) && (
        <header className="pnl-head">
          {title && <Tag tone={tone}>{title}</Tag>}
          {extra && <span className="pnl-extra">{extra}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/** primary：红底白字（ACCEPT / LEVEL UP）；secondary：细线框；ghost：只有字。 */
export const Btn = ({ kind = 'secondary', children, className = '', ...rest }) => (
  <button type="button" className={`btn btn-${kind} ${className}`} {...rest}>{children}</button>
);

/** 白色方块里的大号数字，下面一条属性色。 */
export const Stat = ({ value, label, color = 'var(--cream)' }) => (
  <div className="stat">
    <span className="stat-num">{value}</span>
    <span className="stat-label" style={{ borderColor: color }}>{label}</span>
  </div>
);

/** 检定标签：成功绿、失败红，或属性色。 */
export const Check = ({ children, color }) => (
  <span className="check" style={color ? { background: color } : undefined}>{children}</span>
);

/** 一排小肖像（谁在屋里、谁提名了谁）。 */
export const Faces = ({ people, size = 30 }) => (
  <div className="faces">
    {people.map((p) => (
      <div key={p.id} className="face">
        <Portrait p={p} size={size} frame="#f4f4f0" />
        <span>{p.label ?? p.name}</span>
      </div>
    ))}
  </div>
);

/** 线条图标（跟着文字颜色走）。 */
export function Icon({ name }) {
  const paths = {
    role: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></>,
    journal: <><rect x="5" y="3" width="14" height="18" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    talk: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
    grim: <><path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" /><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z" /></>,
    menu: <><path d="M12 3l9 9-9 9-9-9z" /><circle cx="12" cy="12" r="2.5" /></>,
    roster: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 19c.6-3 2.6-5 5-5s4.4 2 5 5M11 19c.6-3 2.6-5 5-5s4.4 2 5 5" /></>,
  }[name];
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{paths}</svg>;
}

/** 底部 HUD 栏：方形图标按钮 + 右边的倒计时。
 *  timer：{ label, secs } 当前阶段还剩多久（自由活动结束、提名结束、天亮……）；没有倒计时时只显示第几日。 */
export function HudBar({ items, active, onPick, label, extra, timer }) {
  return (
    <nav className="hudbar">
      <div className="hud-btns">
        {items.map((it) => (
          <button key={it.id} type="button" className={`hud-btn hud-btn-${it.id} ${active === it.id ? 'on' : ''}`} onClick={() => onPick(it.id)} aria-label={it.label}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
            {it.dot ? <i className="dot">{typeof it.dot === 'number' ? it.dot : ''}</i> : null}
          </button>
        ))}
      </div>
      {timer && timer.secs != null ? (
        <div className={`hud-timer ${timer.urgent ? 'urgent' : ''}`}>
          {extra}
          <small>{timer.label}</small>
          <b>{Math.floor(timer.secs / 60)}:{String(timer.secs % 60).padStart(2, '0')}</b>
        </div>
      ) : (
        <div className="hud-time">
          {extra}
          <small>{label}</small>
        </div>
      )}
    </nav>
  );
}
