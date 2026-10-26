// 房主指定角色：指定了的座位用指定的角色，其余座位按官方人数表随机补齐。
// 男爵（+2 外来者）、教父（±1 外来者）按最终的爪牙重新算人数；房主指定得比人数表多时，以房主为准，少补镇民。
import { ROLES, DISTRIBUTION, rolesOf } from './roles.js';
import { SMALL_GAME_AVOID } from './bmr.js';

const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * @param {string[]} seatIds 按座位顺序
 * @param {Record<string,string>} assigned 玩家 id → 角色 id（只认这个剧本的角色，重复的只保留第一个）
 * @returns {string[]} 按座位顺序的角色
 */
export function buildRoles(seatIds, assigned, script, rng = Math.random, { noBaron = false } = {}) {
  const want = {};
  const fixed = new Set();
  for (const id of seatIds) {
    const r = assigned?.[id];
    if (r && ROLES[r]?.script === script && !fixed.has(r)) { want[id] = r; fixed.add(r); }
  }
  const teamOf = (r) => ROLES[r].team;
  const have = (team) => [...fixed].filter((r) => teamOf(r) === team);
  // 黯月初升 5–6 人：随机补的角色里不出沙巴洛斯、莽夫（官方说明点名它们在小局里不公平；房主指定的照给）
  const avoid = script === 'bmr' && seatIds.length <= 6 ? SMALL_GAME_AVOID : new Set();
  const pool = (team) => shuffle(rolesOf(script, team).filter((r) => !fixed.has(r) && !avoid.has(r)), rng);
  let [t, o, m, d] = DISTRIBUTION[seatIds.length];

  // 小局不要男爵：随机补的爪牙里不出男爵（房主自己指定了男爵就照给）
  const minions = have('minion'); const mp = pool('minion').filter((r) => !(noBaron && r === 'baron'));
  while (minions.length < m && mp.length) minions.push(mp.shift());
  const demons = have('demon'); const dp = pool('demon');
  while (demons.length < d && dp.length) demons.push(dp.shift());
  if (script === 'tb' && minions.includes('baron')) { t -= 2; o += 2; }
  if (script === 'bmr' && minions.includes('godfather')) {
    if (o === 0 || rng() < 0.5) { t -= 1; o += 1; } else { t += 1; o -= 1; }
  }

  // 要补的角色：先邪恶，再外来者，最后镇民（房主指定多了，就从最后的镇民开始去掉）
  const fill = [...minions, ...demons].filter((r) => !fixed.has(r));
  const op = pool('outsider'); const tp = pool('townsfolk');
  for (let k = have('outsider').length; k < o && op.length; k++) fill.push(op.shift());
  for (let k = have('townsfolk').length; k < t && tp.length; k++) fill.push(tp.shift());
  const free = seatIds.filter((id) => !want[id]);
  while (fill.length > free.length) fill.pop();
  while (fill.length < free.length) fill.push(tp.shift() ?? op.shift());
  const rest = shuffle(fill, rng);
  return seatIds.map((id) => want[id] ?? rest.shift());
}

/**
 * 角色难度：1 简单、2 中等、3 难（给新手发身份用）。大体上外来者简单；每晚拿信息、要自己推理的"大能力"镇民和要算计的邪恶角色难。
 * 暗流涌动：占卜师（红鲱鱼、要连续推理）、镇长（要懂替死和终局）、酒鬼（拿错信息还不知道）、间谍（看魔典还要装好人）、小恶魔（要会传位、编身份）难。
 * 黯月初升：赌徒（猜错就死）、侍臣、造谣者（时机和措辞很讲究）、莽夫（阵营会变）、疯子（以为自己是恶魔）、主谋、僵怖、珀难。
 */
export const ROLE_DIFFICULTY = {
  tb: {
    washerwoman: 1, librarian: 1, investigator: 1, chef: 1, undertaker: 1, soldier: 1,
    empath: 2, monk: 2, ravenkeeper: 2, virgin: 2, slayer: 2,
    fortuneteller: 3, mayor: 3,
    saint: 1, butler: 2, recluse: 2, drunk: 3,
    baron: 1, scarletwoman: 2, poisoner: 2, spy: 3,
    imp: 3,
  },
  bmr: {
    grandmother: 1, minstrel: 1, tealady: 1, pacifist: 1, fool: 1,
    sailor: 2, chambermaid: 2, exorcist: 2, innkeeper: 2, professor: 2,
    gambler: 3, gossip: 3, courtier: 3,
    tinker: 1, moonchild: 2, goon: 3, lunatic: 3,
    assassin: 1, godfather: 2, devilsadvocate: 2, mastermind: 3,
    pukka: 2, shabaloth: 2, zombuul: 3, po: 3,
  },
};
const difficulty = (script, r) => ROLE_DIFFICULTY[script]?.[r] ?? 2;
/** 难角色（难度 3），兼容旧代码。 */
export const HARD_ROLES = Object.fromEntries(Object.entries(ROLE_DIFFICULTY).map(([sc, m]) => [sc, new Set(Object.keys(m).filter((r) => m[r] >= 3))]));

const isEvil = (r) => ['minion', 'demon'].includes(ROLES[r].team);

/**
 * 新手照顾（新手标记只有房主看得到，所以可以动阵营）：
 * 1. 新手拿到邪恶角色（恶魔或爪牙），大概率（evilEase）和一个老玩家的善良角色对调——新手当恶魔、当爪牙的概率都降下来，但不是零；
 * 2. 新手拿到难角色，大概率和同阵营老玩家手里更简单的角色对调（善良这边镇民、外来者可以互换；邪恶这边恶魔、爪牙可以互换），
 *    难度 3 的换走概率 ease，难度 2 的一半；挑老玩家手里最简单的那个换。
 * 只是两个人对调，整局的角色和人数不变。fixed：房主指定过的座位，不动。返回新的角色数组（按座位顺序）。
 */
export function easeNewbies(seatIds, roles, newbies, script, { fixed = new Set(), rng = Math.random, ease = 0.85, evilEase = 0.6 } = {}) {
  const out = [...roles];
  const diff = (r) => difficulty(script, r);
  const movable = (i) => !fixed.has(seatIds[i]);
  const vet = (j) => movable(j) && !newbies.has(seatIds[j]);
  const swap = (i, js) => { const j = js[Math.floor(rng() * js.length)]; [out[i], out[j]] = [out[j], out[i]]; };
  const order = shuffle(out.map((_, i) => i).filter((i) => newbies.has(seatIds[i]) && movable(i)), rng);
  for (const i of order) {
    if (isEvil(out[i]) && rng() < evilEase) {
      const js = out.map((_, j) => j).filter((j) => vet(j) && !isEvil(out[j]));
      if (js.length) swap(i, js);
    }
    const d = diff(out[i]);
    if (d >= 2 && rng() < (d >= 3 ? ease : ease / 2)) {
      const side = isEvil(out[i]);
      const js = out.map((_, j) => j).filter((j) => vet(j) && isEvil(out[j]) === side && diff(out[j]) < d);
      if (js.length) {
        const easiest = Math.min(...js.map((j) => diff(out[j])));
        swap(i, js.filter((j) => diff(out[j]) === easiest));
      }
    }
  }
  return out;
}
