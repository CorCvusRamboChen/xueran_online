// 角色名、能力、剧本名用官方英文（2026-11-20 用户：不要自己翻）。
// 官方数据：The Pandemonium Institute 的 botc-release 仓库 resources/data/roles.json（下载下来，路径作参数传进来）：
//   curl -sSL -o roles.json https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json
//   node scripts/i18n/gen-roles.mjs roles.json
// 生成 src/shared/i18n/en/00-official.json：中文角色名 → 官方英文名、中文能力 → 官方英文能力、中文剧本名 → 官方剧本名。
// 中文能力后面我们自己加的操作提示（「（在行动面板里点「开枪」）」这类）在 HINTS 里配英文，接在官方能力后面。
// 文件名带 00- 排在最前：别的词典有同一个键时以别的为准（极少数要改的写在 zz-overrides.json）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, FABLED, SCRIPTS, TEAM_NAME } from '../../src/engine/roles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const official = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const byId = new Map(official.map((r) => [r.id.replace(/_/g, ''), r]));

// 我们的 id 和官方 id 不一样的
const ALIAS = { lilmonsta: 'lilmonsta', alhadikhia: 'alhadikhia' };
// 我们在中文能力后面加的操作提示 → 英文：按钮名查别的词典（和界面上的按钮一致）
const DIR = path.join(ROOT, 'src/shared/i18n/en');
const EN = {};
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('00-'))) Object.assign(EN, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const HINTS = new Proxy({}, {
  get(_, hint) {
    const btn = /「([^」]+)」/.exec(hint)?.[1];
    const b = EN[btn];
    if (!b) return undefined;
    if (hint.startsWith('（在行动面板里点')) return ` (Tap "${b}" in the action panel.)`;
    if (hint.startsWith('（被提名时点')) return ` (When nominated, tap "${b}".)`;
    return undefined;
  },
});
const HINT_RE = /（[^（）]*(点|按钮|面板|界面|行动)[^（）]*）$/;

const out = {};
const missing = [];
const put = (zh, en) => { if (zh && en && /[一-鿿]/.test(zh)) out[zh] = en; };

for (const [id, r] of Object.entries({ ...ROLES, ...FABLED })) {
  if (r.virtual) continue; // 狼人杀、阿瓦隆、提示用的假角色：不是血染角色，走普通翻译
  const o = byId.get(ALIAS[id] ?? id);
  if (!o) { missing.push(`${id} ${r.name}`); continue; }
  put(r.name, o.name);
  if (r.ability) {
    const hint = HINT_RE.exec(r.ability)?.[0];
    if (hint) {
      if (!HINTS[hint]) missing.push(`提示没配英文：${id} ${hint}`);
      put(r.ability, o.ability + (HINTS[hint] ?? ''));
      put(r.ability.slice(0, -hint.length), o.ability);
    } else put(r.ability, o.ability);
  }
}
for (const s of Object.values(SCRIPTS)) put(s.name, s.en);
const TEAM_EN = { townsfolk: 'Townsfolk', outsider: 'Outsider', minion: 'Minion', demon: 'Demon', traveller: 'Traveller' };
for (const [k, v] of Object.entries(TEAM_NAME)) put(v, TEAM_EN[k]);

const file = path.join(ROOT, 'src/shared/i18n/en/00-official.json');
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`写了 ${Object.keys(out).length} 条到 ${path.relative(ROOT, file)}`);
if (missing.length) console.log('对不上的：\n' + missing.join('\n'));
