// 手机上轮到自己操作（夜里选人、投票、发言……）时，操作面板从底部弹出来盖在画面上，不用往下滑；
// 可以收起成一条去看地图，有新的操作要做时自动展开。电脑上没有变化（样式见 styles.css 的 .dock-hot）。
import { useEffect, useRef, useState } from 'react';

/** 返回 [收起了没有, 切换, 面板的 ref]。hot 从无到有（新的操作）时展开、滚回顶上，手机上震一下。 */
export function useDockSheet(hot) {
  const [min, setMin] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!hot) return;
    setMin(false);
    ref.current?.scrollTo?.({ top: 0 });
    if (matchMedia('(max-width: 859px)').matches) navigator.vibrate?.(60);
  }, [hot]);
  return [min, () => setMin((x) => !x), ref];
}

/** 面板顶上的把手：只在手机上、轮到自己操作时显示。 */
export function DockHandle({ min, onToggle }) {
  return (
    <button type="button" className="dock-handle" onClick={onToggle} aria-expanded={!min}>
      <span className="dock-grip" />
      <span>{min ? '轮到你了 · 点开操作' : '收起，看看地图'}</span>
    </button>
  );
}
