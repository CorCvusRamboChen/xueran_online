// 抽出代码里所有要翻译的中文（和打包时的插件同一套规则，键一模一样），对照英文词典。
//   node scripts/i18n/extract.mjs            列出缺英文的句子（按文件）
//   node scripts/i18n/extract.mjs --json f   把缺的写成 {中文: ""} 的 JSON（给翻译用）
//   node scripts/i18n/extract.mjs --all f    把全部键和出处写成 JSON
// 不用翻的文件（开发工具页、给 AI 的提示词、KOOK 机器人、服务器日志）在 SKIP_FILES 里。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const plugin = require('./babel-plugin.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 不给玩家看的：开发用的预览/编辑页、给大模型的提示词、语音转写、KOOK 机器人（KOOK 是中文平台）、Discord 频道名
export const SKIP_FILES = [
  'client/src/world/LayoutEditor.jsx', 'client/src/world/DoorEditor.jsx', 'client/src/world/TilesPreview.jsx',
  'client/src/world/AvatarPreview.jsx', 'client/src/world/TownGuide.jsx',
  'src/server/judge.js', 'src/server/stt.js', 'src/server/stt-worker.js', 'src/server/recorder.js', 'src/server/kook.js', 'src/server/tacit.js', // tacit.js 只有正则和中文数字（认人说的话），不给玩家看
  'src/engine/worlds-table.json',
  'client/src/i18n.js',
];
const SKIP_DIRS = ['src/shared/i18n/'];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!/^(dist|node_modules|assets)$/.test(f)) walk(p, out); }
    else if (/\.(jsx?|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

export function sourceFiles() {
  return [...walk(path.join(ROOT, 'client/src')), ...walk(path.join(ROOT, 'src'))]
    .map((p) => path.relative(ROOT, p).replace(/\\/g, '/'))
    .filter((f) => !SKIP_FILES.includes(f) && !SKIP_DIRS.some((d) => f.startsWith(d)));
}

/** 键 → 出现的文件（Set）。 */
export function extractKeys(files = sourceFiles()) {
  const keys = new Map();
  const collect = (k, file) => {
    if (!k || !/[一-鿿]/.test(k)) return;
    // 只有占位、没有中文文字的（{0}{1}）不算
    if (!/[一-鿿]/.test(k.replace(/\{\d+\}/g, ''))) return;
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(path.relative(ROOT, file || '').replace(/\\/g, '/'));
  };
  for (const f of files) {
    const abs = path.join(ROOT, f);
    const code = fs.readFileSync(abs, 'utf8');
    babel.transformSync(code, {
      filename: abs, babelrc: false, configFile: false, code: false,
      parserOpts: { sourceType: 'module', plugins: ['jsx'] },
      plugins: [[plugin, { collect }]],
    });
  }
  return keys;
}

export function loadEnglish() {
  const dir = path.join(ROOT, 'src/shared/i18n/en');
  const all = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return all;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = extractKeys();
  const en = loadEnglish();
  const miss = [...keys].filter(([k]) => !(k in en) || !en[k]);
  const arg = process.argv[2];
  if (arg === '--json') {
    fs.writeFileSync(process.argv[3], JSON.stringify(Object.fromEntries(miss.map(([k, fs_]) => [k, ''])), null, 1));
    console.log(`缺 ${miss.length} / ${keys.size} 条，写到 ${process.argv[3]}`);
  } else if (arg === '--all') {
    fs.writeFileSync(process.argv[3], JSON.stringify(Object.fromEntries([...keys].map(([k, s]) => [k, [...s]])), null, 1));
    console.log(`共 ${keys.size} 条`);
  } else {
    const byFile = new Map();
    for (const [k, s] of miss) for (const f of s) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(k); }
    for (const [f, ks] of [...byFile].sort((a, b) => b[1].length - a[1].length)) console.log(`${ks.length}\t${f}`);
    console.log(`缺英文 ${miss.length} / ${keys.size} 条`);
  }
}
