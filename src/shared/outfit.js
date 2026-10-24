// 小人的衣柜：6 个槽（发型、帽子、上衣、下装、鞋、配饰）+ 肤色。每个槽一种款式 + 一个颜色。
// 服务器用它校验玩家发来的搭配，客户端用它搭 3D 模型、画衣柜界面。

// 极乐迪斯科那种偏灰、偏旧的颜色
export const PALETTE = {
  cloth: ['#3b4a5a', '#2f3b36', '#5a3a32', '#7a5a2e', '#6b6f3a', '#8a7b5c', '#4a3f52', '#7d2f2b', '#b08a3e', '#2b2b2e', '#5f6a6e', '#c9bfa6', '#365c63', '#8c4a2f'],
  hair: ['#2a211c', '#4a3324', '#7a5434', '#b08a5a', '#d9c49a', '#8a8a86', '#d8d6cf', '#6e2e1f'],
  skin: ['#f0d2b4', '#e2b893', '#c99a72', '#a87452', '#7d5237', '#5a3a28'],
};

export const SLOTS = [
  { id: 'hair', label: '发型', palette: 'hair', options: [
    { id: 'short', label: '短发' }, { id: 'slick', label: '背头' }, { id: 'long', label: '长发' },
    { id: 'bun', label: '盘发' }, { id: 'bald', label: '光头' },
  ] },
  { id: 'hat', label: '帽子', palette: 'cloth', options: [
    { id: 'none', label: '不戴' }, { id: 'cap', label: '鸭舌帽' }, { id: 'fedora', label: '软呢帽' },
    { id: 'tophat', label: '高礼帽' }, { id: 'beanie', label: '毛线帽' },
  ] },
  { id: 'top', label: '上衣', palette: 'cloth', options: [
    { id: 'coat', label: '长风衣' }, { id: 'jacket', label: '短夹克' }, { id: 'sweater', label: '毛衣' },
    { id: 'vest', label: '衬衫马甲' },
  ] },
  { id: 'bottom', label: '下装', palette: 'cloth', options: [
    { id: 'trousers', label: '西裤' }, { id: 'work', label: '工装阔腿裤' }, { id: 'skirt', label: '长裙' },
  ] },
  { id: 'shoes', label: '鞋', palette: 'cloth', options: [
    { id: 'boots', label: '皮靴' }, { id: 'shoes', label: '皮鞋' }, { id: 'work', label: '工靴' },
  ] },
  { id: 'acc', label: '配饰', palette: 'cloth', options: [
    { id: 'none', label: '无' }, { id: 'scarf', label: '围巾' }, { id: 'tie', label: '领带' },
    { id: 'glasses', label: '眼镜' }, { id: 'satchel', label: '挎包' },
  ] },
];

const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

/** 按 id 算一个固定的随机搭配（没自己挑过的人也各不一样）。 */
export function defaultOutfit(seed = '') {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const o = { skin: pick(PALETTE.skin) };
  for (const s of SLOTS) {
    // 帽子、配饰多数人不戴；长裙配长发多一点
    let opt = pick(s.options).id;
    if ((s.id === 'hat' || s.id === 'acc') && next() < 0.45) opt = 'none';
    o[s.id] = opt;
    o[`${s.id}Color`] = pick(PALETTE[s.palette]);
  }
  return o;
}

/** 校验玩家发来的搭配：不认识的款式/颜色用默认值补上。 */
export function cleanOutfit(input, seed = '') {
  const base = defaultOutfit(seed);
  if (!input || typeof input !== 'object') return base;
  const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const out = { skin: hex(input.skin) ? input.skin : base.skin };
  for (const s of SLOTS) {
    out[s.id] = s.options.some((o) => o.id === input[s.id]) ? input[s.id] : base[s.id];
    out[`${s.id}Color`] = hex(input[`${s.id}Color`]) ? input[`${s.id}Color`] : base[`${s.id}Color`];
  }
  return out;
}

export const slotOf = (id) => SLOT_BY_ID[id];
export const outfitKey = (o) => SLOTS.map((s) => `${o[s.id]}${o[`${s.id}Color`]}`).join('|') + o.skin;
