// 官网「AI 说书人是怎么判的」页（site/ai/index.html）是 scripts/site-ai.mjs 从 judge.js 的提示词和 docs/ai-storyteller.md 生成的：
// 改了提示词或说明没重新生成，这里会提醒（跑 node scripts/site-ai.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { render, OUT } from '../scripts/site-ai.mjs';
import { PROMPT_CATALOG } from '../src/server/judge.js';

test('官网的 AI 说书人页和现在的提示词对得上（不对就跑 node scripts/site-ai.mjs）', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'), render().replace(/\r\n/g, '\n'));
});

test('每个提示词都列在页上，都要 JSON 输出', () => {
  const html = render();
  for (const p of PROMPT_CATALOG) {
    assert.ok(html.includes(`id="p-${p.id}"`), p.id);
    assert.ok(p.system.length > 100 && /JSON/.test(p.system), `${p.id} 的系统提示词`);
  }
});
