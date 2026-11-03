// 黯月初升的环境声：远处偶尔一声狼嚎、偶尔一群鸟被惊飞（官方剧本的氛围：岩缝里饿狼嚎叫、鸟群四散）。
// 梦殒春宵按分区响：花园和花街有鸟叫，马戏营地飘来走调的风琴，遗迹郊野地下传来低低的吟唱。
// 小概率触发：每隔十几秒掷一次骰子，大部分时候什么都不发生。音效开关关了就不响。
import { useEffect, useRef } from 'react';
import { wolfHowl, birdsFlush, birdSong, calliope, lowChant } from './footsteps.js';

const CHECK_MS = 14000;
const SNV_MS = 8000;

let zoneNow = null;
export const setZoneNow = (id) => { zoneNow = id; };

/** where：'roam'（白天在镇上）| 'night'（夜里在小屋）| null（别的时候不响）。 */
export function useAmbience(script, where) {
  const ref = useRef(where);
  ref.current = where;
  useEffect(() => {
    if (script !== 'snv') return undefined;
    const id = setInterval(() => {
      if (ref.current !== 'roam') return;
      const pan = (Math.random() - 0.5) * 1.4;
      const r = Math.random();
      if ((zoneNow === 'garden' || zoneNow === 'street') && r < 0.6) birdSong(zoneNow === 'garden' ? 0.14 : 0.1, pan);
      else if (zoneNow === 'camp' && r < 0.3) calliope(0.1, pan);
      else if (zoneNow === 'ruin' && r < 0.3) lowChant(0.2, pan);
    }, SNV_MS);
    return () => clearInterval(id);
  }, [script]);
  useEffect(() => {
    if (script !== 'bmr') return undefined;
    const id = setInterval(() => {
      const w = ref.current;
      if (!w) return;
      const pan = (Math.random() - 0.5) * 1.4;
      const r = Math.random();
      if (w === 'night') { if (r < 0.09) wolfHowl(0.16, pan); return; } // 夜里：只有狼
      if (r < 0.04) wolfHowl(0.13, pan);                                  // 白天：狼少一点
      else if (r < 0.09) birdsFlush(0.2, pan);                            // 鸟群惊飞
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [script]);
}
