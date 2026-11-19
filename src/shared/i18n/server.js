// 服务器这边：启动时把英文词典都装上；发给英文玩家的东西用 forLang() 翻好。原理见 core.js。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDict, localize, translate } from './core.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'en');
export function loadEnglish() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  loadDict(...files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))));
}
loadEnglish();

export const normLang = (l) => (l === 'en' ? 'en' : 'zh');

/**
 * 一份要发给玩家的数据 → 这个玩家的语言。中文原样返回（同一个对象，零开销）。
 * fix(obj) 可以在翻好以后再改（比如把旁白的配音换成英文的）。
 */
export function forLang(lang, data, fix) {
  if (lang !== 'en') return data;
  const out = localize(data);
  if (fix) fix(out, data);
  return out;
}
export { translate };
