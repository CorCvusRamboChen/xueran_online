// 夜里谁睁眼（2026-11-16 用户：造谣者在夜晚顺序里，大家分不清他醒不醒）：src/shared/nightWake.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_ORDER } from '../src/shared/nightOrder.js';
import { wakeOf, wakeTags, stepWake } from '../src/shared/nightWake.js';
import { ROLES } from '../src/engine/roles.js';

test('每个剧本夜晚顺序里的每一步都标了睁眼 / 条件 / 判定', () => {
  for (const [script, o] of Object.entries(NIGHT_ORDER)) {
    for (const [first, list] of [[true, o.first], [false, o.other]]) {
      for (const [id] of list) {
        if (!ROLES[id] && !['minioninfo', 'demoninfo'].includes(id)) continue;
        assert.ok(['wake', 'if', 'st'].includes(stepWake(id, first)), `${script} ${first ? '首夜' : '其他夜晚'} ${id}`);
      }
    }
  }
});

test('说书人判定的角色本人不睁眼；条件睁眼的写了什么时候醒', () => {
  for (const id of ['gossip', 'tinker', 'moonchild', 'sweetheart', 'leviathan', 'poppygrower', 'riot']) {
    const w = wakeOf(id);
    assert.ok(w.first !== 'wake' && w.other !== 'wake', id);
    assert.ok(wakeTags(id).includes('不睁眼 · 说书人判定'), `${id}：${wakeTags(id)}`);
  }
  assert.equal(stepWake('gossip', false), 'st');
  for (const id of ['undertaker', 'ravenkeeper', 'sage', 'zombuul', 'barber', 'farmer', 'juggler']) {
    assert.equal(wakeOf(id).other, 'if', id);
    assert.ok(wakeOf(id).note, id);
  }
  assert.deepEqual(wakeTags('empath'), ['每晚睁眼']);
  assert.deepEqual(wakeTags('washerwoman'), ['首夜睁眼']);
  assert.deepEqual(wakeTags('imp'), ['除首夜外每晚睁眼']);
  assert.deepEqual(wakeTags('grandmother'), ['首夜睁眼', '有时说书人判定']);
  assert.deepEqual(wakeTags('soldier'), []);
});
