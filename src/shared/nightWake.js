// 夜里谁睁眼：角色列表的标签和夜晚顺序表都读这里（2026-11-16 用户：造谣者在夜晚顺序里，大家分不清他醒不醒）。
// 引擎里的 firstNight / otherNight 只表示「这一步夜里要结算」，造谣者、修补匠、心上人这种是说书人自己判定，本人不醒。
// 口径照官方英文总表每一步的提示文字：写了「叫醒他」「他选择」的是睁眼，只写「他死亡」「说书人……」的是判定。
//
// 每个角色 { first, other, note }：
//   'wake' 睁眼（这一夜他会被叫醒行动或得知信息）
//   'if'   条件睁眼（note 写什么时候才醒；也包括「醒的不是他本人」的情况，note 里说清楚是谁醒）
//   'st'   说书人判定（他本人不睁眼，说书人结算他的能力）
//   null   这一夜和他无关
import { ROLES } from '../engine/roles.js';

const W = 'wake'; const IF = 'if'; const ST = 'st';

const OVERRIDES = {
  // 旅行者（2026-11-16）
  apprentice: { first: W, other: W, note: '他加入后的首个夜晚睁眼，得知获得的能力' },
  barista: { first: IF, other: IF, note: '咖啡师本人不醒；说书人选中的那名玩家醒来，得知是哪种效果' },
  harlot: { other: IF, note: '流莺睁眼选人；被选的人也会被叫醒，问他同不同意' },
  bonecollector: { other: IF, note: '每局一次：用过以后不再醒' },
  // 暗流涌动
  undertaker: { other: IF, note: '今天有人被处决才醒' },
  ravenkeeper: { other: IF, note: '当晚死了才醒' },
  scarletwoman: { other: IF, note: '当天成为恶魔，夜里被叫醒告知' },
  // 黯月初升
  grandmother: { first: W, other: ST, note: '首夜睁眼看孙子；之后孙子被恶魔杀死时，说书人判她一起死' },
  gossip: { other: ST, note: '本人不醒：白天的声明为真，说书人夜里让一人死亡' },
  tinker: { other: ST, note: '本人不醒：说书人决定他今晚死不死' },
  moonchild: { other: ST, note: '本人不醒：他死时选的人是善良的，说书人夜里让那人死亡' },
  godfather: { first: W, other: IF, note: '首夜得知外来者；今天有外来者死了，夜里才醒来杀人' },
  zombuul: { other: IF, note: '今天白天没有人死才醒' },
  courtier: { note: '用掉能力之前每晚醒' },
  professor: { note: '用掉能力之前每晚醒' },
  assassin: { note: '用掉能力之前每晚醒' },
  // 梦殒春宵
  juggler: { other: IF, note: '第一个白天公开猜过之后，当晚醒来得知猜对几个' },
  sage: { other: IF, note: '被恶魔杀死的那晚才醒' },
  sweetheart: { other: ST, note: '本人不醒：他死了，说书人让一人醉酒' },
  barber: { other: IF, note: '他今天或今晚死了：叫醒的是恶魔，可以选两人交换角色' },
  seamstress: { note: '用掉能力之前每晚醒' },
  philosopher: { note: '用掉能力之前每晚醒' },
  // 小剧本、社区剧本
  leviathan: { first: ST, other: ST, note: '本人不醒：说书人宣布利维坦在场、现在第几天' },
  alchemist: { first: W, other: null, note: '首夜醒来得知拿到哪个爪牙的能力；之后在那个爪牙醒来的时候醒' },
  heretic: { first: null, other: null, note: '不醒：终局时说书人对调胜负' },
  lilmonsta: { first: W, other: W, note: '醒的是爪牙：一起决定谁照看小怪宝；首夜以外说书人替恶魔杀一人' },
  amnesiac: { first: IF, other: IF, note: '看说书人给他的能力：那个能力夜里要醒，他才醒' },
  cannibal: { other: IF, note: '吃到的能力夜里要醒，他才醒' },
  farmer: { other: IF, note: '他夜里死了：叫醒的是一名活着的善良玩家，他变成农夫' },
  magician: { first: ST, note: '本人不醒：说书人把他混进爪牙和恶魔的信息里' },
  marionette: { first: ST, note: '本人不醒：说书人告诉恶魔谁是提线木偶' },
  damsel: { first: ST, other: IF, note: '首夜不醒（说书人告诉爪牙她在场）；被巡山人选中时被叫醒告知新角色' },
  boffin: { first: W, note: '首夜和恶魔一起醒，得知恶魔拿到的能力' },
  poppygrower: { first: ST, other: ST, note: '本人不醒：他活着时说书人跳过爪牙和恶魔互认；他死了，当晚叫醒邪恶互认' },
  riot: { other: ST, note: '本人不醒：说书人记第几天' },
  huntsman: { note: '用掉能力之前每晚醒' },
  engineer: { note: '用掉能力之前每晚醒' },
  legion: { other: ST, note: '军团夜里不醒：说书人决定今晚死不死人、死谁' },
  yaggababble: { first: W, other: ST, note: '首夜睁眼得知暗号；之后本人不醒：他白天公开说了几次暗号，说书人夜里就可能让几个人死' },
  mezepheles: { first: W, other: IF, note: '首夜得知关键词；之后有善良玩家说出关键词，叫醒的是那个人' },
};

/** 某个角色在首夜 / 其他夜晚睁不睁眼。 */
export function wakeOf(id) {
  const r = ROLES[id];
  if (!r) return { first: null, other: null, note: null };
  const o = OVERRIDES[id] ?? {};
  return {
    first: 'first' in o ? o.first : r.firstNight > 0 ? W : null,
    other: 'other' in o ? o.other : r.otherNight > 0 ? W : null,
    note: o.note ?? null,
  };
}

/** 角色列表的小标签：「每晚睁眼」「只有首夜睁眼」「条件睁眼」「说书人判定」……（没有夜里动作的返回空）。 */
export function wakeTags(id) {
  const { first, other } = wakeOf(id);
  const tags = [];
  if (first === W && other === W) tags.push('每晚睁眼');
  else {
    if (first === W) tags.push('首夜睁眼');
    if (other === W) tags.push('除首夜外每晚睁眼');
  }
  if (first === IF || other === IF) tags.push('条件睁眼');
  if ((first === ST || other === ST) && first !== W && other !== W && first !== IF && other !== IF) tags.push('不睁眼 · 说书人判定');
  else if (first === ST || other === ST) tags.push('有时说书人判定');
  return tags;
}

/** 夜晚顺序表里这一步：睁眼 / 条件 / 判定。first：是不是首夜那一列。 */
export function stepWake(id, first) {
  if (id === 'minioninfo' || id === 'demoninfo') return W;
  if (!ROLES[id]) return null;
  const w = wakeOf(id);
  return (first ? w.first : w.other) ?? W; // 表里列出来了却没标：当作睁眼
}

export const WAKE_LABEL = { wake: '睁眼', if: '条件', st: '判定' };
