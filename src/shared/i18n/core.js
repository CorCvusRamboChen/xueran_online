// 中英双语的核心（服务器和客户端共用）。2026-11-20 用户要英文版。
//
// 中文写在代码里，既是原文也是词典的键；英文在 src/shared/i18n/en/*.json（键 = 中文，值 = 英文）。
// 代码里的中文不用改写：
// - 客户端：打包时（scripts/i18n/babel-plugin.cjs）把带中文的字符串、模板字符串、JSX 文字自动换成 __t / __tt / __tj，
//   运行时按玩家自己的语言查词典（client/src/i18n.js）。
// - 服务器：照旧生成中文；发给英文玩家之前（index.js 的 broadcast / reply），用 localize() 把整份状态里的中文
//   查词典换成英文。模板字符串的键是把 ${…} 换成 {0} {1}…，这里把它编成正则反查，参数再递归翻译（角色名、「活着」这类）。
// 所以同一个房间里可以有人看中文、有人看英文；中文玩家看到的和以前一字不差。
//
// 英文词条的写法：{0} {1} 是参数；{0|vote|votes} 按参数 0 的数字选单复数。
// 词典没有的句子：先按句号、逗号这些拆开分段翻，还不行就保持中文（开发时 missing() 能列出来）。

export const CJK = /[一-鿿]/;

let DICT = Object.create(null); // 中文 → 英文
let PATTERNS = null;             // 带参数的键编成的正则（第一次用到时才编）

/** 装上英文词典（可以多次调用，后装的覆盖先装的同名键）。 */
export function loadDict(...dicts) {
  for (const d of dicts) for (const [k, v] of Object.entries(d ?? {})) if (typeof v === 'string' && v !== '') DICT[k] = v;
  // 复盘里的信息去掉了加粗（text.replace(/\*\*/g, '')）：去掉加粗的句子也认得
  for (const [k, v] of Object.entries(DICT)) if (k.includes('**')) { const k2 = k.replace(/\*\*/g, ''); if (!(k2 in DICT)) DICT[k2] = v.replace(/\*\*/g, ''); }
  PATTERNS = null;
  memo.clear();
}
export const dictSize = () => Object.keys(DICT).length;
export const hasKey = (k) => k in DICT;
export const rawEntry = (k) => DICT[k];

// ── 参数填进英文模板 ──
const PH = /\{(\d+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;
/** 英文模板 + 参数（已经是英文）→ 句子。{0|one|many} 按数字选单复数。 */
export function fill(tmpl, args) {
  return tmpl.replace(PH, (m, i, one, many) => {
    const v = args[Number(i)];
    if (one !== undefined) return Number(String(v).replace(/[^\d.-]/g, '')) === 1 ? one : many;
    return v == null ? '' : String(v);
  });
}
/** 中文模板 + 参数 → 中文句子（客户端在中文下用）。 */
export function fillZh(key, args) {
  return key.replace(/\{(\d+)\}/g, (m, i) => { const v = args[Number(i)]; return v == null ? '' : String(v); });
}

// ── 中文标点 → 英文标点（没翻到的残句、名单、括号） ──
const PUNCT = [
  [/、/g, ', '], [/，/g, ', '], [/。/g, '. '], [/；/g, '; '], [/：/g, ': '], [/！/g, '! '], [/？/g, '? '],
  [/（/g, ' ('], [/）/g, ') '], [/「|」|“|”/g, '"'], [/《|》/g, ''], [/……/g, '…'], [/——/g, ' — '], [/～/g, '~'],
];
const PUNCT_TEST = /[、，。；：！？（）「」“”《》…—～]/;
export function punct(s, edges = false) {
  if (!PUNCT_TEST.test(s)) return s;
  let out = s;
  for (const [re, to] of PUNCT) out = out.replace(re, to);
  // 收拾多出来的空格：标点前不要空格、括号里头不要空格、连续空格并一个；原文开头结尾没有空白就不加
  out = out.replace(/ +([,.;:!?)])/g, '$1').replace(/\( +/g, '(').replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n');
  if (edges) return out;
  if (!/\s$/.test(s)) out = out.replace(/ +$/, '');
  if (!/^\s/.test(s)) out = out.replace(/^ +/, '');
  return out;
}

/** 拼完以后收拾空格：标点前不要空格、连续空格并一个；原文开头结尾没有空白就去掉。 */
function tidy(out, src) {
  out = names(out);
  out = out.replace(/ +([,.;:!?)])/g, '$1').replace(/\( +/g, '(').replace(/(\S) {2,}/g, '$1 ').replace(/ +\n/g, '\n');
  if (!/\s$/.test(src)) out = out.replace(/\s+$/, '');
  if (!/^\s/.test(src)) out = out.replace(/^\s+/, '');
  return out;
}

// 中文数字（「第三天」「十二」）→ 阿拉伯数字；不是数字返回 null
const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function cnNumber(s) {
  if (!/^[零〇一二两三四五六七八九十百]+$/.test(s)) return null;
  let total = 0; let cur = 0;
  for (const c of s) {
    if (c === '百') { total += (cur || 1) * 100; cur = 0; }
    else if (c === '十') { total += (cur || 1) * 10; cur = 0; }
    else cur = CN_DIGIT[c];
  }
  return total + cur;
}

// 服务器起的名字（机器人）和座位号：句子里剩下的这几种直接换
function names(s) {
  if (!CJK.test(s)) return s;
  return s.replace(/机器人(\d+)/g, 'Bot $1').replace(/(\d+) ?号(?=[\s*,.;:!?)(]|$)/g, '#$1');
}
/** 玩家名字：只换服务器起的（机器人、教程里的人物），真人的名字原样。 */
export function translateName(s) {
  if (typeof s !== 'string' || !CJK.test(s)) return s;
  if (s in DICT) return DICT[s];
  if (s.includes('7号空座')) s = s.replace('7号空座', DICT['7号空座'] ?? 'Empty seat 7');
  return names(s); // 机器人、座位号（「6号 机器人4」）；真人的名字原样
}

// 有固定格式、要整行换的（客户端会按格式拆开排版）
const cjkCount = (x) => (x.match(/[一-鿿]/g) ?? []).length;
const RULES = [
  // 「狼人 2」：词典里有的词 + 数量
  [/^([^\d\s]+) (\d+)$/, (m, depth) => (m[1] in DICT ? `${DICT[m[1]]} ${m[2]}` : `${tr(m[1], depth + 1)} ${m[2]}`)],
  // 说书人记录里插在名字后面的「【能力失效】」：前后分开翻
  [/^([\s\S]+?)【能力失效】([\s\S]*)$/, (m, depth) => `${tr(m[1], depth + 1)} ${(DICT['【能力失效】'] ?? '[malfunctioning]').trim()}${m[2] ? tr(m[2], depth + 1) : ''}`],
  // 魔典的一行（engine/game.js grimoire()）：【邪】4号 名字 — 小恶魔（中毒、占卜师的干扰项）→ [Evil] #4 名字 — Imp (poisoned, …)
  [/^【(善|邪)】(\d+)号 (.+?) — ([^（\n]+)(?:（(.+)）)?$/, (m, depth) => `[${m[1] === '邪' ? 'Evil' : 'Good'}] #${m[2]} ${translateName(m[3])} — ${tr(m[4], depth + 1)}${m[5] ? ` (${m[5].split('、').map((x) => tr(x, depth + 1)).join(', ')})` : ''}`],
];

// ── 带参数的键 → 正则 ──
function compile() {
  PATTERNS = [];
  for (const k of Object.keys(DICT)) {
    if (!k.includes('{0}')) continue;
    const parts = k.split(/\{(\d+)\}/); // 文字、序号、文字、序号……
    const lits = parts.filter((_, i) => i % 2 === 0);
    const litLen = lits.join('').length;
    const cjk = (lits.join('').match(/[一-鿿]/g) ?? []).length;
    if (cjk < 1) continue; // 名字字段不走反查（translateName），所以一个字的模板（「用{0}」「{0}号 {1}」）也可以用
    let re = '^';
    const order = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) re += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      else {
        // 后面紧跟量词（「{0}号」「{0} 票」）或前面是「第」的，只能是数字
        // （隔一个空格的「{0} 夜里」「{0} 天亮」多半是名字，只认票、人这些）
        const num = /^(号|人|票|名|天|夜|个|次|分钟|秒|枚|局|张|轮|位|对|只|岁|倍)/.test(parts[i + 1] ?? '') || /^ (票|人|名|个|次|分钟|秒|枚|局|张|轮|分)/.test(parts[i + 1] ?? '') || /第 ?$/.test(parts[i - 1] ?? '');
        // 普通参数：括号要成对（「5号 Bot（男爵）」整个是一个参数，不会从括号中间切开；最多套两层）
        re += num ? '([\\d零一二两三四五六七八九十百]+)' : '((?:[^（）]|（(?:[^（）]|（[^（）]*）)*）)*?)';
        order.push(Number(parts[i]));
      }
    }
    re += '$';
    const anchor = lits.reduce((a, b) => (b.length > a.length ? b : a), '');
    // 紧挨着的两个参数（「{3}{4}」）：正则分不清界线，匹配后再试着重新切（见 matchPattern）
    const adj = [];
    for (let j = 1; j < order.length; j++) if (/^ ?$/.test(parts[2 * j])) adj.push({ j: j - 1, sep: parts[2 * j] }); // 只隔一个空格的也算（名字里有空格）
    PATTERNS.push({ k, re: new RegExp(re), order, litLen, anchor, adj });
  }
  PATTERNS.sort((a, b) => b.litLen - a.litLen); // 文字多的先试（更具体）
}

const memo = new Map();
const MEMO_MAX = 50_000;
const missingSet = new Set();
export const missing = () => [...missingSet];
export const clearMissing = () => missingSet.clear();

/** 一个中文字符串 → 英文。 */
export function translate(s) {
  if (typeof s !== 'string' || s === '') return s;
  if (!CJK.test(s)) return punct(s);
  if (/机器人\d|7号空座/.test(s)) s = s.replace(/机器人(\d+)/g, 'Bot $1').replace(/7号空座/g, DICT['7号空座'] ?? 'Empty seat 7'); // 服务器起的名字先换掉，免得卡住整句
  if (!CJK.test(s)) return punct(s);
  if (s in DICT) return DICT[s]; // 整句在词典里：原样用（片段前后的空格、逗号是译者特意留的）
  const hit = memo.get(s);
  if (hit !== undefined) return hit;
  let out = tidy(tr(s, 0), s);
  if (CJK.test(out)) missingSet.add(s);
  if (memo.size > MEMO_MAX) memo.clear();
  memo.set(s, out);
  return out;
}

function tr(s, depth) {
  if (!CJK.test(s)) return punct(s, true); // 片段：前后的空格留着，最后 tidy 统一收拾
  if (s in DICT) return DICT[s];
  // 前后的空白、换行原样保留；前后的标点（括号、句号、顿号……）剥掉再查
  if (depth > 6) return s;
  // 先剥掉前后的空白；再试着剥掉前后的标点（句号、顿号、引号、不成对的括号……）——三种剥法依次查词典、套模板
  for (const [pre, core, post] of affixes(s)) {
    if (!core || !CJK.test(core)) continue;
    if (core in DICT) return punct(pre, true) + DICT[core] + punct(post, true);
  }
  for (const [pre, core, post] of affixes(s)) {
    if (!core || !CJK.test(core)) continue;
    for (const [re, fn] of RULES) { const r = re.exec(core); if (r) return punct(pre, true) + fn(r, depth) + punct(post, true); }
    const p = matchPattern(core, depth);
    if (p != null) {
      // 模板套上了但还剩中文（开头的 {0} 吞了太多）：和分段翻比一比，用剩中文少的
      if (CJK.test(p)) { const seg = segments(core, depth); if (cjkCount(seg) < cjkCount(p)) return punct(pre, true) + seg + punct(post, true); }
      return punct(pre, true) + p + punct(post, true);
    }
  }
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  return m[1] + segments(m[2], depth) + m[3];
}

/** 一句话的几种剥法：[前缀, 正文, 后缀]。括号只在不成对时才剥。 */
function affixes(s) {
  const out = [];
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  out.push([m[1], m[2], m[3]]);
  const bold = /^(\s*\*\*)([^*]+)(\*\*\s*)$/.exec(s); // 整段加粗：里面单独查
  if (bold) out.push([bold[1], bold[2], bold[3]]);
  const b = /^([\s「“《【—]*)([\s\S]*?)([。！？；：，、」”》】…\s]*)$/.exec(s);
  if (b[2] !== m[2]) out.push([b[1], b[2], b[3]]);
  const c = /^([\s（「“《【—]*)([\s\S]*?)([。！？；：，、）」”》】…\s]*)$/.exec(s);
  const balanced = (x) => (x.match(/（/g) ?? []).length === (x.match(/）/g) ?? []).length;
  if (c[2] !== b[2] && balanced(c[2])) out.push([c[1], c[2], c[3]]);
  return out;
}

function matchPattern(s, depth) {
  if (!PATTERNS) compile();
  // 几个模板都对得上时：挑翻完剩下中文最少的；一样少就挑参数最短的（模板的字吃掉的原文最多、最贴切）
  let best = null;
  for (const p of PATTERNS) {
    if (!s.includes(p.anchor)) continue;
    const r = p.re.exec(s);
    if (!r) continue;
    const caps = r.slice(1);
    // 打分：翻完剩的中文越少越好；参数里跨了句读（「：」「。」「，」）多半是切错了；再比参数总长（模板吃掉的原文越多越贴切）
    const capLen = caps.reduce((n, c) => n + c.length, 0);
    const span = caps.reduce((n, c) => n + (c.replace(/[。！？]$/, '').match(/[：。！？；，]/g) ?? []).length, 0);
    const unbalanced = caps.filter((c) => (c.match(/（/g) ?? []).length !== (c.match(/）/g) ?? []).length).length; // 括号切开了一半，多半是切错了
    const pre = (span + unbalanced * 2) * 100 + (p.k.startsWith('{') ? 60 : 0) + capLen / 1000; // 开头就是文字的模板更具体
    if (best && best.cjk === 0 && pre >= best.pre) continue;
    const args = [];
    p.order.forEach((idx, j) => { args[idx] = translateArg(caps[j], depth + 1); });
    for (const { j, sep } of p.adj) {
      if (!CJK.test(args[p.order[j]]) && !CJK.test(args[p.order[j + 1]])) continue;
      const both = caps[j] + sep + caps[j + 1];
      let bestSplit = null;
      for (let cut = 0; cut + sep.length <= both.length; cut++) {
        if (sep ? both.slice(cut, cut + sep.length) !== sep : (cut > 0 && cut < both.length && !/[、，（「 ：；]/.test(both[cut]))) continue; // 只在像是新一段开头的地方切
        const a1 = translateArg(both.slice(0, cut), depth + 1);
        const a2 = translateArg(both.slice(cut + sep.length), depth + 1);
        const c = cjkCount(a1) + cjkCount(a2);
        if (!bestSplit || c < bestSplit.c) bestSplit = { c, a1, a2 };
        if (c === 0) break;
      }
      args[p.order[j]] = bestSplit.a1;
      args[p.order[j + 1]] = bestSplit.a2;
    }
    const out = fill(DICT[p.k], args);
    const score = cjkCount(out) * 10000 + pre;
    if (!best || score < best.score) best = { out, cjk: cjkCount(out), pre, score };
  }
  return best?.out ?? null;
}

function translateArg(v, depth) {
  if (v === '' || !CJK.test(v)) return punct(v);
  if (/^\d+$/.test(v)) return v;
  const n = cnNumber(v);
  if (n != null) return String(n);
  return tr(v, depth);
}

// 整句查不到：按换行、句末标点拆开，一段一段翻；再不行按逗号、顿号拆。
function segments(s, depth) {
  // 几种拆法都试一遍，挑翻完剩中文最少的（先列的优先）
  let best = s;
  for (const fn of SPLITS) {
    const out = fn(s, depth);
    if (out == null) continue;
    if (cjkCount(out) < cjkCount(best)) best = out;
    if (!CJK.test(best)) break;
  }
  return best;
}
const SPLITS = [
  // 「狼人 2 · 预言家 · 女巫」这种用「 · 」隔开的名单
  (s, depth) => {
    if (!s.includes(' · ')) return null;
    return s.split(' · ').map((p) => (CJK.test(p) ? tr(p, depth + 1) : p)).join(' · ');
  },
  // 「A 与 B」「A 和 B」这种拼起来的名单
  (s, depth) => {
    if (!/ (与|和) /.test(s)) return null;
    return s.split(/ (?:与|和) /).map((p) => (CJK.test(p) ? tr(p, depth + 1) : p)).join(' and ');
  },
  // 「**名字** 后面的话」：加粗里外分开查
  (s, depth) => {
    if (!s.includes('**')) return null;
    const parts = s.split(/(\*\*[^*]+\*\*)/).filter((x) => x !== '');
    if (parts.length < 2) return null;
    return punct(parts.map((p) => {
      if (!CJK.test(p)) return p;
      const b = /^\*\*([^*]+)\*\*$/.exec(p);
      return b ? `**${tr(b[1], depth + 1)}**` : tr(p, depth + 1);
    }).join(''));
  },
  // 按换行、句末标点、逗号顿号拆
  ...[/(\n+)/, /(?<=[。！？；])/, /(?<=[，、：])/].map((re) => (s, depth) => {
    const parts = s.split(re).filter((x) => x !== '');
    if (parts.length < 2) return null;
    return punct(parts.map((p) => (CJK.test(p) ? tr(p, depth + 1) : p)).join(''));
  }),
  // 「名字（角色） 后面的话」：括号后面有空格的地方断开
  (s, depth) => {
    if (!/）(?= )/.test(s)) return null;
    return s.split(/(?<=）)(?= )/).map((p) => tr(p, depth + 1)).join('');
  },
  // 「名字（角色）」：括号里外分开查
  (s, depth) => {
    if (!/（[^（）]+）/.test(s)) return null;
    const parts = s.split(/(（[^（）]+）)/).filter((x) => x !== '');
    if (parts.length < 2) return null;
    return parts.map((p) => {
      const b = /^（([^（）]+)）$/.exec(p);
      if (b) return ` (${b[1].split('·').map((x) => (CJK.test(x) ? tr(x, depth + 1) : x)).join(' · ')})`;
      return CJK.test(p) ? tr(p, depth + 1) : p;
    }).join('');
  },
];

/** 客户端的模板：中文模板键 + 参数 → 当前语言。参数里的中文（比如服务器没翻到的、客户端自己拼的）也翻。 */
export function formatEn(key, args) {
  const en = DICT[key];
  if (en == null) return translate(fillZh(key, args));
  return fill(en, args.map((a) => (typeof a === 'string' ? String(cnNumber(a) ?? translate(a)) : a)));
}

/**
 * 服务器发给英文玩家之前：整份数据里带中文的字符串都翻成英文（返回新对象，不改原来的）。
 * skip 里的字段原样（玩家名字、头像、聊天原话这些）。
 */
export function localize(v, skip = SKIP) {
  if (typeof v === 'string') return translate(v);
  if (Array.isArray(v)) return v.map((x) => localize(x, skip));
  if (v && typeof v === 'object') {
    if (v instanceof String) return translate(String(v));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Map、Date 之类：JSON 里本来就不是文字
    const out = {};
    for (const k of Object.keys(v)) {
      if (NAME_KEYS.has(k)) out[k] = typeof v[k] === 'string' ? translateName(v[k]) : localize(v[k], skip);
      else out[k] = skip.has(k) ? v[k] : localize(v[k], skip);
    }
    return out;
  }
  return v;
}
// 名字：真人的原样，机器人、地点、角色名这种词典里有的换成英文
const NAME_KEYS = new Set(['name', 'nick', 'by', 'who']);
// 原样不动：标识、地址、玩家自己说的原话
export const SKIP = new Set(['avatar', 'id', 'uid', 'key', 'url', 'audio', 'src', 'img', 'image', 'token', 'raw', 'quote', 'words', 'transcript', 'speech', 'said']);
