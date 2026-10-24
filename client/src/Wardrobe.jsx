// 大厅「衣柜」：给自己的 3D 小人换衣服。左边一个转着的 3D 预览，右边每个槽换款式、挑颜色。
// 搭配存在这台设备上（下次进任何房间都带着），并发给服务器让大家在地图上看到。
import { useEffect, useRef, useState } from 'react';
import { Panel, Btn } from './ui.jsx';
import { SLOTS, PALETTE, defaultOutfit, cleanOutfit } from '../../src/shared/outfit.js';

const KEY = 'botc-outfit';
export function savedOutfit() {
  try { const o = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return o && typeof o === 'object' ? o : null; } catch { return null; }
}
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* 隐私模式 */ } }

export function Wardrobe({ s, act }) {
  const [o, setO] = useState(() => cleanOutfit(s.myOutfit ?? savedOutfit(), s.me));
  const canvas = useRef(null);
  const live = useRef(o);
  live.current = o;
  const timer = useRef(null);

  // 3D 预览（three.js 按需加载，不拖慢大厅首屏）
  useEffect(() => {
    let stop = () => {};
    let alive = true;
    import('./world/avatar3d.js').then((m) => { if (alive && canvas.current) stop = m.previewLoop(canvas.current, () => live.current); });
    return () => { alive = false; stop(); };
  }, []);

  const update = (patch) => {
    const next = { ...live.current, ...patch };
    setO(next);
    save(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => act('outfit', { outfit: next }), 350);
  };
  const shift = (slot, d) => {
    const opts = slot.options;
    const i = opts.findIndex((x) => x.id === o[slot.id]);
    update({ [slot.id]: opts[(i + d + opts.length) % opts.length].id });
  };
  const random = () => update(defaultOutfit(`${s.me}-${Date.now()}`));

  return (
    <Panel title="衣柜" className="glass wardrobe" extra={<span className="muted">大家在地图上看到的你</span>}>
      <div className="wd-body">
        <canvas ref={canvas} className="wd-preview" aria-label="3D 预览" />
        <div className="wd-slots">
          {SLOTS.map((slot) => {
            const opt = slot.options.find((x) => x.id === o[slot.id]);
            const showColor = slot.id === 'hair' ? o.hair !== 'bald' : o[slot.id] !== 'none';
            return (
              <div key={slot.id} className="wd-slot">
                <span className="wd-label">{slot.label}</span>
                <div className="wd-pick">
                  <button type="button" onClick={() => shift(slot, -1)} aria-label="上一个">‹</button>
                  <b>{opt?.label}</b>
                  <button type="button" onClick={() => shift(slot, 1)} aria-label="下一个">›</button>
                </div>
                {showColor ? (
                  <div className="wd-colors">
                    {PALETTE[slot.palette].map((c) => (
                      <button key={c} type="button" className={o[`${slot.id}Color`] === c ? 'on' : ''} style={{ background: c }}
                        onClick={() => update({ [`${slot.id}Color`]: c })} aria-label={c} />
                    ))}
                  </div>
                ) : <div className="wd-colors" />}
              </div>
            );
          })}
          <div className="wd-slot">
            <span className="wd-label">肤色</span>
            <div className="wd-colors">
              {PALETTE.skin.map((c) => (
                <button key={c} type="button" className={o.skin === c ? 'on' : ''} style={{ background: c }} onClick={() => update({ skin: c })} aria-label={c} />
              ))}
            </div>
          </div>
          <div className="btn-row"><Btn onClick={random}>随机一套</Btn></div>
        </div>
      </div>
    </Panel>
  );
}
