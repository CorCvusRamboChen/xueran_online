import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FABLED, fabledOf } from '../src/engine/roles.js';

// 传奇角色只按剧本标记出现（集石百科：说书人会告诉大家加了哪些）
test('传奇角色：夜半狂欢是哨兵和圣洁之魂，裁缝与暴乱是骗人精，暗流涌动没有', () => {
  assert.deepEqual(fabledOf('mo'), ['sentinel', 'spiritofivory']);
  assert.deepEqual(fabledOf('sar'), ['fibbin']);
  assert.deepEqual(fabledOf('tb'), []);
  assert.deepEqual(fabledOf('nope'), []);
  for (const f of Object.values(FABLED)) assert.ok(f.name && f.ability && f.detail);
});
