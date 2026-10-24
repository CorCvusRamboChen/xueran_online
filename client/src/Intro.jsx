// 开屏：漆黑里浮出"血染钟楼"四个字的轮廓，鲜血从字顶往下灌满、顺着笔画往下滴，
// 然后血色褪成平时的白字，副标题浮出，整屏淡出进入大厅。每次打开只放一次，点一下可以跳过。
import { useEffect, useState } from 'react';

const KEY = 'botc.intro';
const DRIPS = [ // 每滴血：横向位置（%）、开始时间、长度
  [9, 1.05, 70], [21, 1.35, 46], [33, 1.15, 92], [47, 1.5, 58], [58, 1.2, 80], [71, 1.45, 40], [83, 1.1, 66], [92, 1.6, 52],
];

export function Intro() {
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem(KEY); } catch { return true; }
  });
  useEffect(() => {
    if (!show) return undefined;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* 隐私模式 */ }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setShow(false), reduce ? 900 : 4300);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div className="intro" onClick={() => setShow(false)} role="presentation">
      <div className="intro-glow" />
      <div className="intro-word">
        <h1 className="intro-title">
          <span className="it-ghost">血染钟楼</span>
          <span className="it-blood" aria-hidden="true">血染钟楼</span>
          <span className="it-paper" aria-hidden="true">血染钟楼</span>
        </h1>
        <div className="intro-drips" aria-hidden="true">
          {DRIPS.map(([x, delay, len]) => (
            <i key={x} style={{ left: `${x}%`, '--d': `${delay}s`, '--len': `${len}px` }} />
          ))}
        </div>
        <p className="intro-sub">暗流涌动 · TROUBLE BREWING</p>
      </div>
      <span className="intro-skip">点击跳过</span>
    </div>
  );
}
