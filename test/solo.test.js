// 网页单机试玩（/play，server/solo.js）：一人一张私桌、机器人坐满、整局打完不存档不发金币；全服排行榜（store.js statsAll）。
// 最后一条把真的服务器（src/server/index.js）在临时目录里跑起来，用 WebSocket 走一遍进入流程。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-solo-')));
const { Room } = await import('../src/server/room.js');
const { statsAll, statsFor } = await import('../src/server/store.js');
const { soloIdentity, setupSoloRoom, seatSolo, soloEvictions, SOLO_BOTS } = await import('../src/server/solo.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(5); };
const FAST = { chooseSeconds: 0.05, voteSeconds: 0.002, voteCountdown: 0.005, pauseMs: 5, killSceneMs: 0, accuseSeconds: 0.005, defendSeconds: 0.005 };
const KEY = 'abcdefghijklmnop1234';

function game(guild, endedAt, winner, players) {
  const dir = path.join('data/games', guild);
  fs.mkdirSync(dir, { recursive: true });
  const id = `${endedAt}_c`;
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id, endedAt, winner, days: 1,
    players: players.map(([pid, role], i) => ({ id: pid, seat: i + 1, name: pid, role, alive: true })),
  }));
}

function soloRoom(key = KEY, name = '小明') {
  const { user, guildId, channelId } = soloIdentity({ key, name });
  const room = setupSoloRoom(new Room({ key: `${guildId}:${channelId}`, guildId, hostId: user.id, voice: null, settings: { ...FAST, mode: 'auto', shuffle: false } }), { stats: statsAll });
  room.moonchildWaitMs = 5;
  room.judgeReady = () => false; // 不连大模型
  room.users.set(user.id, user);
  room.online.add(user.id);
  seatSolo(room, user.id);
  return { room, user };
}

test('单机身份：钥匙决定 id（哈希，不是钥匙本身），名字清洗；钥匙不对报错', () => {
  const a = soloIdentity({ key: KEY, name: ' <b>小明</b> ' });
  assert.match(a.user.id, /^solo-[0-9a-f]{16}$/);
  assert.ok(!a.user.id.includes(KEY), 'id 里看不出钥匙');
  assert.equal(a.user.name, 'b小明/b');
  assert.equal(a.guildId, 'solo');
  assert.equal(a.channelId, a.user.id, '一人一张桌子');
  assert.equal(soloIdentity({ key: KEY }).user.id, a.user.id, '同一把钥匙还是同一个人');
  assert.notEqual(soloIdentity({ key: `${KEY}x` }).user.id, a.user.id);
  assert.equal(soloIdentity({ key: KEY, name: '' }).user.name, '旅人');
  for (const key of ['', 'short', 'a'.repeat(65), `${KEY}!`, null]) assert.throws(() => soloIdentity({ key }), /钥匙不对/);
});

test('单机私桌：一进来你加 6 个机器人坐好；没有语音、钱包、存档回调；只能 AI 说书', async () => {
  const { room, user } = soloRoom();
  assert.equal(room.lobby.length, 1 + SOLO_BOTS);
  assert.equal(room.lobby[0].id, user.id);
  assert.equal(room.lobby.filter((p) => p.fake).length, SOLO_BOTS);
  seatSolo(room, user.id);
  assert.equal(room.lobby.length, 1 + SOLO_BOTS, '再进来不会重复加机器人');
  const v = room.viewFor(user.id);
  assert.equal(v.solo, true);
  assert.equal(v.coins, null, '没有金币');
  assert.equal(v.hearAvailable, false);
  assert.equal(room.voice, null);
  assert.equal(room.micFor, undefined, '没有收音页');
  await assert.rejects(room.act(user.id, 'settings', { mode: 'human' }), /只有 AI 说书人/);
  await assert.rejects(room.act(user.id, 'pelt', { target: 'bot-1', item: 'tomato' }), /金币|游戏/);
  assert.deepEqual((await room.act(user.id, 'history')).games, [], '没有往期对局');
  await room.teardown();
});

test('全服排行榜：所有服务器合计；本服排行榜照旧只有本服的人', async () => {
  game('A', 1000, 'good', [['me', 'chef'], ['alice', 'imp'], ['bot-1', 'empath']]);
  game('B', 2000, 'evil', [['me', 'imp'], ['bob', 'chef']]);
  game('kook-K', 3000, 'good', [['kook-1', 'chef'], ['carol', 'imp']]);
  const all = statsAll();
  assert.equal(all.games, 3);
  assert.equal(all.goodWins, 2);
  assert.equal(all.guilds, 3);
  assert.deepEqual(all.players.map((p) => p.id).sort(), ['alice', 'bob', 'carol', 'kook-1', 'me'], '所有服务器的真人，机器人不算');
  assert.equal(all.players.find((p) => p.id === 'me').games, 2);
  assert.deepEqual(statsFor('A').players.map((p) => p.id).sort(), ['alice', 'me'], '本服的榜不变');

  const { room, user } = soloRoom();
  const r = await room.act(user.id, 'stats', { scope: 'all' });
  assert.equal(r.stats.games, 3);
  assert.equal((await room.act(user.id, 'stats')).stats.games, 3, '单机私桌没有「本服」，默认也是全服');
  await room.teardown();

  const plain = new Room({ key: 'g:c', guildId: 'A', hostId: 'u', voice: null });
  plain.history = { stats: statsFor, statsAll };
  assert.equal((await plain.act('u', 'stats', { scope: 'all' })).stats.games, 3, '普通房间也能看全服');
  assert.equal((await plain.act('u', 'stats')).stats.games, 1, '默认还是本服');
  await plain.teardown();
});

test('单机私桌：和机器人打完整一局；不存档、不进排行榜', async () => {
  const before = statsAll().games;
  const { room, user } = soloRoom(`${KEY}full`);
  await room.act(user.id, 'start');
  const g = room.game;
  assert.equal(g.players.length, 7);
  let days = 0;
  while (!g.winner && !room.ended && days < 20) {
    for (let k = 0; k < 400 && g.phase === 'night' && !room.ended; k++) {
      if (!room.resolving) {
        for (const pr of g.nightPrompts()) {
          if (room.isFake(pr.playerId) || g.choices[pr.playerId]) continue;
          await room.act(pr.playerId, 'choose', { night: g.night, targets: pr.optional ? [] : pr.options.slice(0, pr.count) }).catch(() => {});
        }
      }
      await sleep(3);
    }
    if (g.winner || room.ended) break;
    days++;
    await until(() => room.roam || room.ended, 300);
    if (room.ended) break;
    await room.act(user.id, 'gather').catch(() => {});
    if (g.phase === 'day' && !g.block && !g.executedToday) g.block = g.alive()[days % g.aliveCount()].id;
    if (g.phase === 'day' && !g.winner && !room.ended) await room.dusk().catch(() => {});
    await until(() => g.phase !== 'day' || g.winner || room.ended, 500);
  }
  assert.ok(g.winner, `分出了胜负（第 ${days} 天）`);
  await until(() => room.ended, 2000);
  assert.equal(room.viewFor(user.id).phase, 'ended');
  assert.ok(!fs.existsSync(path.join('data/games', 'solo')), '单机的局不存档');
  assert.equal(statsAll().games, before);
  assert.ok(!statsAll().players.some((p) => p.id === user.id), '不进排行榜');
  await room.act(user.id, 'end');
  assert.equal(room.viewFor(user.id).phase, 'lobby', '打完回大厅，还能再开');
  await room.teardown();
});

test('私桌满了：先清掉没人在的，都有人在就报错', () => {
  process.env.SOLO_MAX_TABLES = '2';
  try {
    const mk = (key, online) => ({ key, solo: true, online: new Set(online ? ['x'] : []) });
    const rooms = new Map([['solo:a', mk('solo:a', true)], ['solo:b', mk('solo:b', false)], ['g:c', { key: 'g:c', online: new Set() }]]);
    assert.deepEqual(soloEvictions(rooms, 'solo:a'), [], '自己的桌子已经在了');
    assert.deepEqual(soloEvictions(rooms, 'solo:new').map((r) => r.key), ['solo:b']);
    rooms.get('solo:b').online.add('y');
    assert.throws(() => soloEvictions(rooms, 'solo:new'), /满了/);
  } finally { delete process.env.SOLO_MAX_TABLES; }
});

// ───────────── 真的服务器 ─────────────
test('服务器：/play 的进入流程（不开 DEV_LOGIN 也能进），每把钥匙一张私桌；联机的测试入口照旧要 DEV_LOGIN', async (t) => {
  const port = 3900 + Math.floor(Math.random() * 90);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-solo-srv-')); // 空目录：不会读到 .env 里的机器人 token
  const env = { ...process.env, PORT: String(port), DEV_LOGIN: '', DISCORD_TOKEN: '', KOOK_TOKEN: '', PARTNER_BOT_URL: '', SQUADPOOL_BASE_URL: '' };
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server/index.js')], { cwd, env, stdio: 'ignore' });
  t.after(() => srv.kill());
  let cfg = null;
  for (let i = 0; i < 100 && !cfg; i++) { cfg = await fetch(`http://localhost:${port}/api/config`).then((r) => r.json()).catch(() => null); if (!cfg) await sleep(100); }
  assert.equal(cfg?.solo, true);
  assert.equal(cfg.devLogin, false);

  const hello = (body) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/api/ws`);
    let ack = null;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', reqId: 1, ...body })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'ack' && m.reqId === 1) { ack = m; if (!m.ok) { ws.close(); resolve({ ack }); } }
      if (m.type === 'state' && ack?.ok) { ws.close(); resolve({ ack, state: m.state }); }
    });
    ws.on('error', reject);
  });
  const a = await hello({ solo: { key: KEY, name: '小明' } });
  assert.equal(a.ack.ok, true, a.ack.error);
  assert.match(a.ack.user.id, /^solo-/);
  assert.equal(a.state.solo, true);
  assert.equal(a.state.isHost, true);
  assert.equal(a.state.lobby.length, 7, '你和 6 个机器人');
  assert.equal(a.state.coins, null);
  const b = await hello({ solo: { key: `${KEY}other`, name: '小红' } });
  assert.notEqual(b.state.key, a.state.key, '别人是另一张桌子');
  assert.equal(b.state.lobby.filter((p) => !p.fake).length, 1, '桌上只有自己');
  assert.match((await hello({ solo: { key: 'bad' } })).ack.error, /钥匙不对/);
  assert.match((await hello({ dev: { id: 'x', name: 'x' } })).ack.error, /DEV_LOGIN/, '联机测试入口不受影响');
});
