// 把 TownArt 里的 SVG 组件栅格化成 canvas，给 Pixi 当贴图。
// 以后 Codex 画了位图，放进 assets/world/<key>.png（key 见下面，冒号换成下划线）就会优先用位图。
import { renderToStaticMarkup } from 'react-dom/server';
import { PaintDefs } from '../Town.jsx';
import { Lamp, Tree, Bench, Crate, Barrel, Cart, Well, Stall, Fence, Notice, Interior, INK } from '../art/TownArt.jsx';

const PAINTED = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/world/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop().replace(/\.png$/, '').replace(/_/g, ':'), url]),
);

export const RASTER_SCALE = 3; // 每个逻辑单位栅格化成几个像素

/**
 * 摆设（立在地上的"纸片"，斜视角里正对镜头）：box = 以摆放点为原点的裁切框 [x, y, 宽, 高]；
 * foot = 脚底在组件里的 y；scale = 在斜视角世界里放大多少倍。组件都按"摆放点在 (0,0)"来画。
 */
export const PROPS = {
  lamp: { el: <Lamp x={0} y={0} />, box: [-6, -34, 12, 36], foot: 0, scale: 1.7 },
  tree: { el: <Tree x={0} y={0} />, box: [-16, -20, 32, 38], foot: 13, scale: 2.2 },
  bench: { el: <Bench x={0} y={0} />, box: [-2, -8, 30, 19], foot: 9, scale: 1.4 },
  crate: { el: <Crate x={0} y={0} />, box: [-1, -1, 14, 12], foot: 10, scale: 1.4 },
  barrel: { el: <Barrel x={0} y={0} />, box: [-7, -4, 14, 16], foot: 10, scale: 1.4 },
  cart: { el: <Cart x={0} y={0} />, box: [-2, -2, 48, 25], foot: 21, scale: 1.4 },
  well: { el: <Well x={0} y={0} />, box: [-15, -21, 30, 35], foot: 12, scale: 1.4 },
  stall: { el: <Stall x={0} y={0} />, box: [-4, -12, 42, 32], foot: 18, scale: 1.4 },
  'stall:flip': { el: <Stall x={0} y={0} flip />, box: [-4, -12, 42, 32], foot: 18, scale: 1.4 },
  fence: { el: <Fence x={0} y={0} />, box: [-2, -2, 50, 10], foot: 6, scale: 1.4 },
  notice: { el: <Notice x={0} y={0} />, box: [-2, -2, 26, 28], foot: 24, scale: 1.4 },
};

/** 房子的地板（俯视画，放进斜视角的地面层会被压扁成菱形）：木地板 + 室内陈设。 */
export const houseFloor = (h) => ({
  el: !h.height // 露天的墓园：一片砂石地
    ? <g><rect x={h.x} y={h.y} width={h.w} height={h.h} fill={h.yard ?? '#d6d4cb'} /><rect x={h.x} y={h.y} width={h.w} height={h.h} fill="url(#grain)" /></g>
    : <g><rect x={h.x} y={h.y} width={h.w} height={h.h} fill="url(#planks)" stroke={INK} strokeWidth="1.2" /><Interior h={h} /></g>,
  box: [h.x, h.y, h.w, h.h],
});

const cache = new Map();

function loadImage(src) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = src;
  });
}

/** 一张贴图（canvas）。同一个 key 只画一次。 */
export function raster(key, el, box) {
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const [x, y, w, h] = box;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * RASTER_SCALE);
      canvas.height = Math.ceil(h * RASTER_SCALE);
      let img;
      if (PAINTED[key]) img = await loadImage(PAINTED[key]).catch(() => null);
      if (!img) {
        const svg = renderToStaticMarkup(
          <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${w} ${h}`} width={canvas.width} height={canvas.height}
            fontFamily="'Noto Sans SC', 'Microsoft YaHei', sans-serif">
            <PaintDefs />
            {el}
          </svg>,
        );
        img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      }
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    })());
  }
  return cache.get(key);
}
