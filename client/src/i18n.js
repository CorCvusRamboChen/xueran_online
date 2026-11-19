// 客户端的界面语言（中文 / English）。打包时 scripts/i18n/babel-plugin.cjs 把代码里的中文换成 __t / __tt / __tj，
// 它们都从这里来（vite 的别名 @i18n）。原理见 src/shared/i18n/core.js。
//
// 语言存在本机（localStorage「botc-lang」）；网址带 ?lang=en / ?lang=zh 以它为准并记住（给英文玩家的链接）。
// 都没有就用中文（现有玩家很多是英文系统的中文用户，按系统语言猜会把他们突然换成英文）。
// 换语言时重新加载页面：模块里的常量（角色表、剧本说明）在加载时就按语言生成好了。
// 英文词典只在英文下才下载（main.jsx 等它装好才加载界面），中文玩家不多下载一个字节。
import { createElement, Fragment } from 'react';
import { loadDict, translate, formatEn, fillZh, cnNumber, rawEntry } from '../../src/shared/i18n/core.js';

const KEY = 'botc-lang';
function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') { try { localStorage.setItem(KEY, q); } catch { /* 隐私模式 */ } return q; }
  } catch { /* 没有 location（测试） */ }
  try { const v = localStorage.getItem(KEY); if (v === 'zh' || v === 'en') return v; } catch { /* 隐私模式 */ }
  return 'zh';
}

export const LANG = typeof window === 'undefined' ? 'zh' : detect();
export const isEn = LANG === 'en';
/** 本机有没有自己选过语言（没选过、系统又不是中文时，大厅会提示一下有英文版）。 */
export const langChosen = (() => { try { return !!localStorage.getItem(KEY); } catch { return true; } })();

const DICTS = import.meta.glob('../../src/shared/i18n/en/*.json', { import: 'default' });
/** 英文词典装好以后 resolve（中文直接 resolve）。 */
export const i18nReady = isEn
  ? Promise.all(Object.values(DICTS).map((load) => load())).then((ds) => loadDict(...ds)).catch((e) => console.warn('[i18n] 英文词典没加载上', e))
  : Promise.resolve();

if (typeof document !== 'undefined') {
  document.documentElement.lang = isEn ? 'en' : 'zh-CN';
  if (isEn) { document.title = 'Blood on the Clocktower'; document.documentElement.classList.add('lang-en'); }
}

// 语言按钮上的字：每种语言用它自己的写法（这个文件不经过翻译插件，所以「中文」不会被换掉）
export const LANGS = [['zh', '中文'], ['en', 'English']];
export const LANG_LABEL = '语言 · Language';

export function switchLang(l) {
  if (l !== 'zh' && l !== 'en') return;
  try { localStorage.setItem(KEY, l); } catch { /* 隐私模式 */ }
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); location.replace(u.toString()); return; }
  location.reload();
}

const split = (s) => /^(\s*)([\s\S]*?)(\s*)$/.exec(s);

/** 代码里的一段中文 → 当前语言。 */
export function __t(s) {
  if (!isEn || typeof s !== 'string') return s;
  return translate(s);
}

/** 不是写死在代码里的中文（变量）要翻时用：中文下原样。 */
export const tr = (s) => __t(s);

/** 模板字符串：中文模板（${…} 换成 {0} {1}…）+ 参数 → 当前语言的字符串。 */
export function __tt(key, args) {
  if (!isEn) return fillZh(key, args);
  const m = split(key);
  return m[1] + formatEn(m[2], args) + m[3];
}

/** JSX 里的一句话（文字和 {…}、<b>…</b> 混在一起）：返回 React 节点。 */
export function __tj(key, args) {
  const tmpl = isEn ? englishTemplate(key, args) : key;
  const parts = [];
  const re = /\{(\d+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(tmpl))) {
    if (m.index > last) parts.push(tmpl.slice(last, m.index));
    const v = args[Number(m[1])];
    if (m[2] !== undefined) parts.push(Number(v) === 1 ? m[2] : m[3]);
    else parts.push(isEn && typeof v === 'string' ? String(cnNumber(v) ?? translate(v)) : v);
    last = re.lastIndex;
  }
  if (last < tmpl.length) parts.push(tmpl.slice(last));
  return createElement(Fragment, null, ...parts);
}

function englishTemplate(key) {
  const en = rawEntry(key);
  if (en != null) return en;
  // 词典里没有：把中文的文字部分各自翻一下（占位留着），总比整句中文好
  return key.split(/(\{\d+\})/).map((p) => (/^\{\d+\}$/.test(p) ? p : translate(p))).join('');
}
