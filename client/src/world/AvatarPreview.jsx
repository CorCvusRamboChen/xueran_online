// ?preview=avatar：看 3D 小人烘焙出来的图集（8 个朝向 × 各段动作），放大显示，旁边按原速播选中的动作。
// 加 &avatar3d=glb 看 AI 模型打样（Mixamo 动作：待机 / 走 / 跑 / 起步 / 停步），不加看程序搭的小人。
// 「连起来」：待机 → 起步 → 走几步 → 停步 → 待机，看衔接顺不顺。&char=<形象 id> 看某个人物的模型（页面上也能点）。
import { useEffect, useRef, useState } from 'react';
import { defaultOutfit } from '../../../src/shared/outfit.js';
import { bakeSheet, FRAME_W, FRAME_H, DIRS, MODEL_IDS, GLB_MODE, HATS } from './avatar3d.js';

const SCALE = 2;
/** 一段动作每帧多少秒（按动作原速）。 */
const frameTime = (a) => (a.stride ? a.stride / a.speed / a.n : (a.dur || 1) / a.n);

export default function AvatarPreview() {
  const atlasRef = useRef(null);
  const animRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [dir, setDir] = useState(1);
  const [anim, setAnim] = useState('walk');
  const [ms, setMs] = useState(null);
  const [char, setChar] = useState(() => new URLSearchParams(location.search).get('char') || 'townsman');
  const [hat, setHat] = useState(null); // 试配件：给 AI 模型挂一顶帽子

  useEffect(() => {
    const t0 = performance.now();
    setSheet(null);
    bakeSheet({ ...defaultOutfit('preview'), glbHat: hat }, char).then((s) => { setMs(Math.round(performance.now() - t0)); setSheet(s); });
  }, [char, hat]);

  useEffect(() => {
    if (!sheet) return;
    const a = atlasRef.current;
    a.width = sheet.canvas.width * SCALE; a.height = sheet.canvas.height * SCALE;
    const ctx = a.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.canvas, 0, 0, a.width, a.height);
  }, [sheet]);

  useEffect(() => {
    if (!sheet) return;
    const c = animRef.current; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const A = sheet.anims;
    // 「连起来」的播放顺序：[动作, 播几帧]
    const seq = anim === 'chain'
      ? [['idle', A.idle.n], ['start', A.start?.n ?? 0], ['walk', A.walk.n * 2], ['stop', A.stop?.n ?? 0], ['idle', A.idle.n]].filter(([k, n]) => A[k] && n)
      : [[anim, A[anim].n]];
    let k = 0; let i = 0; let timer = 0;
    const tick = () => {
      const [name, count] = seq[k];
      const a = A[name];
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage((sheet.canvases ?? [sheet.canvas])[a.band ?? 0], (a.col + (i % a.n)) * FRAME_W, dir * FRAME_H, FRAME_W, FRAME_H, 0, 0, c.width, c.height);
      ctx.fillStyle = '#1d1b19'; ctx.font = '14px sans-serif'; ctx.fillText(name, 6, 18);
      i++;
      if (i >= count) { i = 0; k = (k + 1) % seq.length; }
      timer = setTimeout(tick, frameTime(a) * 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [sheet, dir, anim]);

  return (
    <div style={{ background: '#8d8a84', minHeight: '100vh', padding: 16, color: '#1d1b19', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <canvas ref={animRef} width={FRAME_W * 3} height={FRAME_H * 3} style={{ background: '#a9a59c' }} />
          <div>
            朝向：{Array.from({ length: DIRS }, (_, d) => (
              <button key={d} onClick={() => setDir(d)} style={{ fontWeight: d === dir ? 700 : 400 }}>{d}</button>
            ))}
          </div>
          {sheet && (
            <div>
              动作：{[...Object.keys(sheet.anims), 'chain'].map((k) => (
                <button key={k} onClick={() => setAnim(k)} style={{ fontWeight: k === anim ? 700 : 400 }}>{k === 'chain' ? '连起来' : k}</button>
              ))}
            </div>
          )}
          {GLB_MODE && (
            <div>
              人物：{MODEL_IDS.map((k) => (
                <button key={k} onClick={() => setChar(k)} style={{ fontWeight: k === char ? 700 : 400 }}>{k}</button>
              ))}
              <br />帽子：{[null, ...HATS].map((k) => (
                <button key={k ?? 'none'} onClick={() => setHat(k)} style={{ fontWeight: k === hat ? 700 : 400 }}>{k ?? '不戴'}</button>
              ))}
            </div>
          )}
          {ms != null && sheet && <p>烘焙用了 {ms} ms，图集 {sheet.canvas.width}×{sheet.canvas.height}</p>}
        </div>
        <canvas ref={atlasRef} style={{ maxWidth: '100%' }} />
      </div>
      {!sheet && <p>烘焙中……</p>}
    </div>
  );
}
