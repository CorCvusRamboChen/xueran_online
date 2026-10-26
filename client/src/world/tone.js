// 地图 / 建筑的色调：亮度、对比度、饱和度、暖色、色相，按 CSS filter 的写法。
// 编辑器（?preview=layout 的「色调」）里直接给图片套同一串 filter 预览；游戏里在载入时把图画进 canvas 时套上（只算一次，不拖帧率）。
// 数值存在 src/shared/maps/<地图>-tone.js：{ map: {...}, houses: {...} }，没写的项就是不调。

/** [键, 名字, 最小, 最大, 默认, 步长] */
export const TONE_KEYS = [
  ['brightness', '亮度', 0.5, 1.5, 1, 0.01],
  ['contrast', '对比度', 0.5, 1.6, 1, 0.01],
  ['saturate', '饱和度', 0, 2, 1, 0.01],
  ['sepia', '暖色（泛黄）', 0, 0.8, 0, 0.01],
  ['hue', '色相（度）', -40, 40, 0, 1],
];

/** 一组色调 → CSS filter 字符串；全是默认值就是 'none'。 */
export function toneFilter(t) {
  if (!t) return 'none';
  const parts = [];
  for (const [k, , , , def] of TONE_KEYS) {
    const v = t[k];
    if (v == null || v === def) continue;
    parts.push(k === 'hue' ? `hue-rotate(${v}deg)` : `${k}(${v})`);
  }
  return parts.length ? parts.join(' ') : 'none';
}

/** 把一张图按色调重画进 canvas（浏览器不支持 canvas filter 时原样返回）。 */
export function tonedCanvas(img, t) {
  const f = toneFilter(t);
  if (f === 'none' || !img) return img;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  if (!('filter' in ctx)) return img;
  ctx.filter = f;
  ctx.drawImage(img, 0, 0);
  return c;
}
