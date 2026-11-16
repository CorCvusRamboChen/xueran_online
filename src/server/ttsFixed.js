// 固定的配音台词：不带玩家名字的旁白（血染 AI 房主、狼人杀法官、阿瓦隆、暗印）。
// scripts/tts-bake.mjs 用 Azure 把它们一次性合成成 mp3，放进 assets/tts/（随代码提交、随部署上传），
// 服务器（tts.js）先找这里，找到就不用再调 Azure。带玩家名字、票型这种每局不同的句子照旧现合成（存在 data/tts/）。
// 只带少数几个取值的数字也算固定：自由活动 / 提名的分钟数（设置里的选项）、平票和不够票的票数（1–15）。
// 开局那句带人数（5–15 人 × 每个剧本两三句，两百多条）没收进来：一局只念一次，不值得占十几 MB。
import fs from 'node:fs';
import { narration } from './narration.js';
import { SCRIPTS } from '../engine/roles.js';

const ROAM_MINUTES = [0, 2, 3, 5, 8, 10];   // 设置里「自由活动」的选项（0 = 不限时）
const NOM_MINUTES = [2, 3, 5, 8, 10];       // 设置里「提名环节」的选项（新手教程也是 10）
const COUNTS = Array.from({ length: 15 }, (_, i) => i + 1);

/** 一个场合的所有说法：narration.js 每句是从几句里随机挑一句，这里把每一句都挑一遍。 */
function every(event, vars) {
  const out = new Set();
  const real = Math.random;
  try {
    for (let i = 0; i < 12; i++) { // 每个场合最多十来句候选
      Math.random = () => (i + 0.5) / 12;
      const n = narration(event, vars);
      if (n?.text) out.add(n.text);
    }
  } finally { Math.random = real; }
  return [...out];
}

/** 血染 AI 房主（narration.js）里不带名字的台词。 */
function bloodLines() {
  const scripts = Object.keys(SCRIPTS);
  const out = [];
  for (const script of scripts) {
    out.push(...every('night', { script, night: 1 }));
    out.push(...every('dawn', { script, day: 1, deaths: [] }));
    out.push(...every('roamSoon', { script }), ...every('gather', { script }), ...every('nomRemind', { script }));
    out.push(...every('noExecution', { script, already: false }), ...every('noExecution', { script, already: true }));
    for (const minutes of ROAM_MINUTES) out.push(...every('roam', { script, minutes }));
    for (const minutes of NOM_MINUTES) out.push(...every('nomOpen', { script, minutes }));
    for (const count of COUNTS) for (const outcome of ['tie', 'lower']) out.push(...every('vote', { script, count, need: count + 1, outcome, b: '' }));
  }
  // 「举手。指针会一个一个经过你们。」这种候选里有的不带名字：用一个占位名字挑一遍，只留没出现占位名字的
  const MARK = '\u0001占位\u0001';
  for (const event of ['voteStart', 'slay']) for (const t of every(event, { a: MARK, b: MARK, hit: false })) if (!t.includes(MARK)) out.push(t);
  return out;
}

/**
 * 狼人杀、阿瓦隆、暗印的台词直接写在调用的地方（wwSay / story），这里从源码里把不带插值的字符串挑出来：
 * 调用括号里的、法官叫人的 CALL 表里的、开局随机挑的 pick([...]) 里的。标题（「刺杀」「第一夜」这种）没有句末标点，不算。
 */
function scanned() {
  const files = ['werewolfRoom.js', 'avalon.js', 'mark.js'].map((f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'));
  const out = [];
  const literal = /'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g; // 模板字符串整段匹配，带 ${} 的下面扔掉
  const spoken = (s) => !s.includes('${') && /[一-鿿]/.test(s) && /[。？！…」]$/.test(s);
  for (const src of files) {
    const regions = [];
    for (const m of src.matchAll(/(?:wwSay|story)\(/g)) regions.push(balanced(src, m.index + m[0].length - 1));
    const call = /const CALL = \{[\s\S]*?\n\};/.exec(src);
    if (call) regions.push(call[0]);
    for (const r of regions) for (const m of r.matchAll(literal)) { const s = m[1] ?? m[2]; if (spoken(s)) out.push(s); }
  }
  return out;
}

/** 从 open（一个左括号的位置）到和它配对的右括号（跳过字符串里的括号）。 */
function balanced(src, open) {
  let depth = 0; let q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

/** 所有要预先合成的台词（去重、排好序）。 */
export function fixedLines() {
  return [...new Set([...bloodLines(), ...scanned()])].sort();
}
