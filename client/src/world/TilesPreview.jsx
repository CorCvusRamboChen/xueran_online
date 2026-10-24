// 地块预览（地址加 ?preview=tiles）：看现在的地块图，把占位图存成 tiles.png 给 Tiled / Codex 当模板。
import { useEffect, useRef, useState } from 'react';
import { TILE_PX, TILESET_COLS, TILE_COUNT, tileName } from '../../../src/shared/tiles.js';
import { loadTileset } from './tileset.js';

export function TilesPreview() {
  const ref = useRef(null);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    loadTileset().then((img) => {
      const c = ref.current;
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      setUrl(c.toDataURL('image/png'));
    });
  }, []);
  const rows = Math.ceil(TILE_COUNT / TILESET_COLS);
  return (
    <div className="gallery">
      <h1 className="title" style={{ fontSize: 28 }}>地块图 tiles.png</h1>
      <p className="muted">8 列 × 3 行，每格 {TILE_PX}px。画好的图放到 client/src/assets/world/tiles.png，重新构建就会替换掉这张占位。</p>
      <div className="tiles-sheet" style={{ '--cols': TILESET_COLS, '--rows': rows }}>
        <canvas ref={ref} />
        <div className="tiles-grid">
          {[...Array(TILE_COUNT).keys()].map((id) => <span key={id}><b>{id}</b>{tileName(id)}</span>)}
        </div>
      </div>
      {url && <p><a className="btn btn-secondary" href={url} download="tiles.png">保存这张占位图</a></p>}
    </div>
  );
}
