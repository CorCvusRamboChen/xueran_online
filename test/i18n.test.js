// 英文版（2026-11-20）：代码里每句给玩家看的中文都有英文；英文玩家从大厅到一局结束收到的东西里没有残留的中文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKeys, loadEnglish } from '../scripts/i18n/extract.mjs';
import { problems } from '../scripts/i18n/check.mjs';
import { forLang } from '../src/shared/i18n/server.js';
import { translate } from '../src/shared/i18n/core.js';
import { Room } from '../src/server/room.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0 };

test('代码里每句中文都有英文，英文词条格式对', () => {
  const keys = extractKeys();
  const en = loadEnglish();
  const miss = [...keys.keys()].filter((k) => !en[k]);
  assert.deepEqual(miss.slice(0, 20), [], `缺英文 ${miss.length} 条（node scripts/i18n/extract.mjs 看全部）`);
  const bad = problems(en);
  assert.deepEqual(bad.slice(0, 10), [], `词条有问题 ${bad.length} 条（node scripts/i18n/check.mjs）`);
});

test('翻译：模板反查、名单、座位号、魔典行、中文数字', () => {
  assert.equal(translate('第三天'), 'Day 3');
  assert.equal(translate('【邪】4号 Bob — 小恶魔（中毒）'), '[Evil] #4 Bob — Imp (Poisoned)');
  assert.match(translate('**机器人3** 提名了 **Ann**'), /^\*\*Bot 3\*\* .*\*\*Ann\*\*/);
  assert.equal(translate('洗衣妇、厨师'), 'Washerwoman, Chef');
  assert.equal(forLang('zh', { a: '中文' }).a, '中文', '中文玩家原样');
});

/** 一份数据里还带中文的字符串（路径 → 文字）。 */
function leftovers(v, path = '', out = []) {
  if (typeof v === 'string') { if (/[一-鿿]/.test(v)) out.push(`${path}: ${v}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => leftovers(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) leftovers(x, `${path}.${k}`, out);
  return out;
}

function mockVoice() {
  return {
    asleep: new Set(),
    async findSquare() { return 'square'; },
    async setAsleep() {}, async openRoom() { return 'room1'; }, async closeRoom() {}, async addToRoom() {},
    async removeFromRoom() {}, async moveAll() {}, async setMuted() {},
  };
}

async function untilDay(room) {
  for (let k = 0; k < 300 && room.game.phase === 'night'; k++) {
    const g = room.game;
    if (!room.resolving) {
      for (const id of g.missingChoices().filter((x) => !room.isFake(x))) {
        const pr = g.nightPrompts().find((x) => x.playerId === id);
        await room.act(id, 'choose', { night: g.night, targets: pr.options.slice(0, pr.count) }).catch(() => {});
      }
    }
    if (room.rkPending && !room.isFake(room.rkPending)) await room.act(room.rkPending, 'ravenkeeper', { target: g.players[0].id }).catch(() => {});
    await sleep(3);
  }
}

/** 暗流涌动整局（自动说书）：每一步都按英文生成两个真人的画面，收集残留的中文。 */
async function playEnglish(script, seed) {
  const room = new Room({ key: `en-${script}-${seed}`, guildId: 'g', hostId: 'u1', voice: mockVoice(), settings: { ...FAST, mode: 'auto', shuffle: false, script } });
  room.dawnPad = [0, 0];
  room.moonchildWaitMs = 5;
  for (const [id, name] of [['u1', 'Ann'], ['u2', 'Ben']]) room.users.set(id, { id, name, avatar: null });
  const found = new Set();
  const look = () => { for (const id of ['u1', 'u2']) for (const l of leftovers(forLang('en', room.viewFor(id)))) found.add(l.replace(/\[\d+\]/g, '[]')); };
  await room.act('u1', 'join');
  await room.act('u2', 'join');
  await room.act('u1', 'addBots', { count: 6 });
  look();
  await room.act('u1', 'start');
  look();
  for (let days = 0; !room.game.winner && days < 12; days++) {
    await untilDay(room);
    for (let k = 0; k < 100 && room.game.phase === 'night'; k++) await sleep(3);
    look();
    if (room.game.winner) break;
    for (let k = 0; k < 50 && !room.roam && !room.ended; k++) await sleep(2);
    if (room.ended) break;
    look();
    await room.act('u1', 'gather');
    const g = room.game;
    const nominator = g.alive().find((p) => !g.nominators.has(p.id));
    const nominee = g.alive().find((p) => p.id !== nominator.id && p.role !== 'virgin');
    await room.act(nominator.id, 'nominate', { target: nominee.id }).catch(() => {});
    look();
    if (room.pendingNom) {
      await room.act('u1', 'startVote').catch(() => {});
      for (const id of ['u1', 'u2']) if (g.canVote(id)) await room.act(id, 'hand', { up: true }).catch(() => {});
      for (let k = 0; k < 300 && room.vote; k++) await sleep(2);
    }
    look();
    if (g.winner) break;
    await room.act('u1', 'dusk').catch(() => {});
    for (let k = 0; k < 50 && g.phase === 'day'; k++) await sleep(2);
  }
  for (let k = 0; k < 40 && !room.ended; k++) await sleep(3);
  look();
  await room.teardown?.();
  return [...found];
}

test('英文玩家：暗流涌动从大厅到结束，收到的画面里没有中文', async () => {
  const all = new Set();
  for (const seed of [1, 2, 3]) for (const l of await playEnglish('tb', seed)) all.add(l);
  const list = [...all];
  assert.deepEqual(list.slice(0, 30), [], `还有 ${list.length} 处中文`);
});

// 其他剧本（第二批）：先只报告，不让测试失败（ENGLISH_STRICT=1 时才严格）
const MORE = process.env.I18N_SCRIPTS ? process.env.I18N_SCRIPTS.split(',') : ['bmr', 'snv', 'ngj', 'bs7', 'mo', 'oe'];
const SEEDS = Number(process.env.I18N_SEEDS ?? 2);
for (const script of MORE) {
  test(`英文玩家：${script} 整局（报告残留中文）`, async () => {
    const all = new Set();
    for (let seed = 1; seed <= SEEDS; seed++) for (const l of await playEnglish(script, seed).catch((e) => [`出错：${e.message}`])) all.add(l);
    const list = [...all];
    if (list.length) console.log(`[${script}] 残留中文 ${list.length} 处：\n  ${list.slice(0, 40).join('\n  ')}`);
    if (process.env.ENGLISH_STRICT) assert.deepEqual(list, []);
  });
}
