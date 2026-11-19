// 检查英文词典：空的、英文里还有中文的、占位符对不上的。
//   node scripts/i18n/check.mjs                 查全部词典
//   node scripts/i18n/check.mjs lobby rules     只查这几块
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/shared/i18n/en');
const ALLOWED_CJK = ['/血染']; // KOOK 里要打的命令，原样

export function problems(dict) {
  const bad = [];
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string' || !v.trim()) { bad.push([k, v, '空的']); continue; }
    let vv = v;
    for (const a of ALLOWED_CJK) vv = vv.split(a).join('');
    if (/[一-鿿]/.test(vv)) { bad.push([k, v, '英文里有中文']); continue; }
    const want = new Set(k.match(/\{\d+\}/g) ?? []);
    const got = new Set((v.match(/\{\d+(?:\|[^{}|]*\|[^{}|]*)?\}/g) ?? []).map((x) => x.replace(/\|.*\}$/, '}')));
    const extra = [...got].filter((x) => !want.has(x));
    const lost = [...want].filter((x) => !got.has(x));
    if (extra.length) bad.push([k, v, `多了占位 ${extra.join(' ')}`]);
    else if (lost.length) bad.push([k, v, `少了占位 ${lost.join(' ')}`]);
  }
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const only = process.argv.slice(2);
  let total = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (only.length && !only.includes(name)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { console.log(`${f}: JSON 坏了 ${e.message}`); total++; continue; }
    const bad = problems(d);
    total += bad.length;
    console.log(`${f}: ${Object.keys(d).length} 条，${bad.length} 条有问题`);
    for (const [k, v, why] of bad.slice(0, 15)) console.log(`  [${why}] ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
  }
  process.exitCode = total ? 1 : 0;
}
