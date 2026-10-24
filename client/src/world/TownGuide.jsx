// 小镇底稿（地址加 ?preview=town）：把程序画的斜视角小镇导出，交给 Codex 照着重绘成手绘图。
// · 整张小镇底稿（能进的房子只画地基）
// · 每间能进的房子两张底稿：外观（closed）和剖开的室内（open），叠在手绘大图上，范围见 houseCrop()
// 已经有手绘大图时，下面多一个对齐检查：底稿叠在手绘图上，拖滑块看建筑有没有画歪。
import { useEffect, useRef, useState } from 'react';
import { housesFor } from '../../../src/shared/map.js';
import town6 from '../assets/maps/town-6.json';

const BASE = Object.values(import.meta.glob('../assets/world/town-base.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' }))[0];
const toBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'));

/** 开发模式下把底稿存进 design/guides/。 */
async function save(name, blob) {
  const r = await fetch(`/api/dev/guide/${name}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob }).catch(() => null);
  return r?.ok ? (await r.json()).path : null;
}

export function TownGuide() {
  const ref = useRef(null);
  const hidden = useRef(null);
  const world = useRef(null);
  const [url, setUrl] = useState(null);
  const [size, setSize] = useState(null);
  const [mix, setMix] = useState(0.5);
  const [houses, setHouses] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    import('./World.js').then(async ({ World, GUIDE }) => {
      const w = await World.create(ref.current, town6, housesFor(10), { guide: true });
      if (dead) { w.destroy(); return; }
      world.current = w;
      setSize(GUIDE);
      w.exportGuide().toBlob((b) => setUrl(URL.createObjectURL(b)), 'image/png');
    });
    return () => { dead = true; world.current?.destroy(); };
  }, []);

  const exportHouses = async () => {
    setBusy(true);
    const { World, houseCrop } = await import('./World.js');
    const list = housesFor(10);
    const out = [];
    for (const mode of ['closed', 'open']) {
      const w = await World.create(hidden.current, town6, list, { guide: mode });
      for (const hs of list) {
        if (hs.id === 'graveyard' && mode === 'closed') continue; // 墓园没有屋顶，只要一张
        const rect = houseCrop(hs);
        const blob = await toBlob(w.exportGuide(rect));
        const name = `house-${hs.id}-${mode}`;
        out.push({ name, rect, url: URL.createObjectURL(blob), saved: await save(name, blob) });
        setHouses([...out]);
      }
      w.destroy();
    }
    if (url) await save('town-guide', await fetch(url).then((r) => r.blob()));
    setBusy(false);
  };

  return (
    <div className="gallery">
      <h1 className="title" style={{ fontSize: 28 }}>小镇底稿 town-guide.png</h1>
      <p className="muted">
        {size ? `${size.w}×${size.h} 像素，1 像素 = 斜视角世界里 1 个单位。` : '正在画……'}
        能进的 6 间房子只画了地基，房子之后单独画。
      </p>
      <div className="guide-view" ref={ref} />
      {url && <p><a className="btn btn-secondary" href={url} download="town-guide.png">保存底稿</a></p>}

      <h2 className="title" style={{ fontSize: 22, marginTop: 24 }}>能进的房子 · 底稿</h2>
      <p className="muted">每间两张：外观（closed）和剖开的室内（open），画在手绘大图上，尺寸就是 houseCrop() 的范围。开发模式下会直接存进 design/guides/。</p>
      <p><button type="button" className="btn btn-primary" disabled={busy || !url} onClick={exportHouses}>{busy ? '正在导出……' : '导出房子底稿'}</button></p>
      <div className="guide-houses">
        {houses.map((h) => (
          <figure key={h.name}>
            <img src={h.url} alt={h.name} />
            <figcaption>{h.name} · {h.rect.w}×{h.rect.h} · 位置 ({h.rect.x}, {h.rect.y}){h.saved ? ` · 已存到 ${h.saved}` : ''}</figcaption>
          </figure>
        ))}
      </div>
      <div ref={hidden} style={{ position: 'fixed', left: -9999, top: 0, width: 800, height: 500 }} />

      {BASE && url && (
        <>
          <h2 className="title" style={{ fontSize: 22, marginTop: 24 }}>对齐检查</h2>
          <p className="muted">手绘大图在下，底稿叠在上面。拖滑块：左边只看手绘，右边只看底稿。</p>
          <input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(Number(e.target.value))} style={{ width: 320 }} />
          <div className="guide-check">
            <img src={BASE} alt="手绘大图" />
            <img src={url} alt="底稿" style={{ opacity: mix }} />
          </div>
        </>
      )}
    </div>
  );
}
