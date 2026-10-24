// 地块（tile）约定：地图生成脚本、前端渲染、以后 Codex 画的 tiles.png 都按这一份来。
// 每格 = 20 个逻辑单位，小镇 1800×1400 就是 90×70 格；
// 地图文件和地块图里每格 64 像素，所以 Tiled 里看到的坐标 = 逻辑坐标 × 3.2。
import { MAP_W, MAP_H } from './map.js';

export const TILE = 20;
export const TILE_PX = 64;
export const GRID_W = MAP_W / TILE;
export const GRID_H = MAP_H / TILE;
export const PX_PER_UNIT = TILE_PX / TILE;

// tiles.png：8 列 × 3 行。
// 0–15 是"角落拼接"（Wang corner）地块：四个角各自是雪地还是石板，
//   编号 = 左上×1 + 右上×2 + 左下×4 + 右下×8（1 表示石板）。0 = 全雪，15 = 全石板。
// 16–23 是整格变体：同样是全雪/全石板，只是多一点细节，让地面不那么重复。
export const TILESET_COLS = 8;
export const TILE_COUNT = 24;
export const SNOW = [0, 16, 17, 18, 22, 23];
export const COBBLE = [15, 19, 20, 21];

const CORNER = ['NW', 'NE', 'SW', 'SE'];
const NAMES = { 0: 'Snow', 15: 'Cobble', 16: 'Snow_Twigs', 17: 'Snow_Drift', 18: 'Snow_Speckle', 19: 'Cobble_Crack', 20: 'Cobble_SnowPatch', 21: 'Cobble_Worn', 22: 'Snow_Footprints', 23: 'Snow_Ice' };

/** 一个地块四个角的地形（0 雪 / 1 石板）：[左上, 右上, 左下, 右下]。 */
export const cornersOf = (id) => (id < 16 ? [id & 1, (id >> 1) & 1, (id >> 2) & 1, (id >> 3) & 1] : SNOW.includes(id) ? [0, 0, 0, 0] : [1, 1, 1, 1]);

export function tileName(id) {
  if (NAMES[id]) return NAMES[id];
  const c = cornersOf(id);
  return `Cobble_${CORNER.filter((_, i) => c[i]).join('_')}`;
}
