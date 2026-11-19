// 英文词典按"块"分文件（src/shared/i18n/en/<块>.json），一个中文键只放在一个块里：它第一次出现的那个文件属于哪块就放哪块。
// node scripts/i18n/areas.mjs --sync   把新抽出来、还没有的键按块加进去（值留空，等翻译）；不再用到的键挪进 unused.json
export const AREAS = [
  ['lobby', [/^client\/src\/Lobby\.jsx$/]],
  ['tutorial', [/^client\/src\/Tutorial/, /^src\/server\/tutorial\.js$/]],
  ['roles-ui', [/^client\/src\/(AbilityCard|RoleIndex|Travellers)\.jsx$/, /^client\/src\/(roleShort|flavor)\.js$/]],
  ['modes-ui', [/^client\/src\/(Avalon|Werewolf|Mark|marks)\.jsx$/]],
  ['ui', [/^client\/src\//]],
  ['narration', [/^src\/server\/narration\.js$/]],
  ['modes', [/^src\/server\/(avalon|mark|werewolfRoom)\.js$/, /^src\/engine\/(avalon|mark|werewolf|werewolf-roles)\.js$/]],
  ['server', [/^src\/server\//]],
  ['engine-snv', [/^src\/engine\/(snv|bmr)\.js$/]],
  ['engine', [/^src\/engine\//]],
  ['rules', [/^src\/shared\/(nightOrder|nightWake|setups|characters)\.js$/]],
  ['maps', [/^src\/shared\//]],
];
export function areaOf(files) {
  for (const [name, res] of AREAS) if ([...files].some((f) => res.some((re) => re.test(f)))) return name;
  return 'ui';
}

// --sync：代码改了以后跑一下。新出现的中文按块加进词典（值留空，test/i18n.test.js 会提醒去翻），
// 代码里已经没有的键从块文件里删掉（00-official.json、zz-overrides.json 不动）。
if (process.argv.includes('--sync')) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { extractKeys } = await import('./extract.mjs');
  const { fileURLToPath } = await import('node:url');
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/shared/i18n/en');
  const keys = extractKeys();
  const files = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
  const fixed = (f) => f.startsWith('00-') || f.startsWith('zz-');
  const have = new Set(Object.values(files).flatMap((d) => Object.keys(d)));
  let added = 0; let removed = 0;
  for (const [f, d] of Object.entries(files)) if (!fixed(f)) for (const k of Object.keys(d)) if (!keys.has(k)) { delete d[k]; removed++; }
  for (const [k, s] of keys) if (!have.has(k)) { const f = `${areaOf(s)}.json`; (files[f] ??= {})[k] = ''; added++; }
  for (const [f, d] of Object.entries(files)) if (!fixed(f)) fs.writeFileSync(path.join(dir, f), `${JSON.stringify(d, null, 1)}\n`);
  console.log(`新加 ${added} 条（待翻），删掉 ${removed} 条不再用的`);
}
