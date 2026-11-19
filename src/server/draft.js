// 真人说书的开局排版（2026-11-20 用户：房主自己当说书人时，系统性的事不用他来，要人脑抉择的地方由他决定，初始排版的 UI 也要做）。
//
// 房主点「开始游戏」→ AI 先按房间设置排好一版（推荐预设 / AI 配平 / 随机、新手照顾、恶魔开关……）→ 说书人在排版台上看座位和角色，
// 可以改某个座位的角色、两个座位对调、整版重抽，定酒鬼以为自己是谁、占卜师的红鲱鱼、恶魔的三个伪装 → 点「发身份」才真正开局。
// 排版期间玩家只看到「说书人正在排版」，看不到任何角色；座位上的人有变动（有人进出、改设置）排版作废，要重新开始。
import { Game } from '../engine/game.js';
import { ROLES, DISTRIBUTION, rolesOf, inScript, isEvilRole } from '../engine/roles.js';
import { UserError } from './room.js';

const team = (r) => ROLES[r]?.team;
const good = (r) => team(r) === 'townsfolk' || team(r) === 'outsider';
// 酒鬼以为自己是失忆者 / 食人族：永远不醒，等于露馅（和梦殒春宵引擎开局的挑法一样）
const NOT_DRUNK_AS = new Set(['amnesiac', 'cannibal']);

/** 用这套角色试建一局（不发出去）：缺的角色由引擎补，提线木偶挪到恶魔旁边，顺便挑好酒鬼以为的、红鲱鱼、伪装。 */
function trial(d, roles) {
  const { plan } = d;
  return new Game(plan.seats.map(({ id, name }) => ({ id, name })), {
    roles, drunkAs: d.drunkAs, script: plan.script, noBaron: plan.noBaron, newbies: plan.newbies, demonSwap: plan.demonSwap, evilInfo: true,
  });
}

/** 角色改动后：重新排一遍，还合规的选择（酒鬼以为的、伪装、红鲱鱼）保留，不合规的换成引擎挑的。 */
function settle(d, roles) {
  const g = trial(d, roles);
  const script = d.plan.script;
  d.roles = g.players.map((p) => p.role);
  d.moved = !!roles && roles.some((r, i) => r !== d.roles[i]); // 引擎挪过座位（提线木偶要挨着恶魔）
  const inPlay = new Set(d.roles);
  const drunk = g.players.find((p) => p.role === 'drunk');
  const drunkOk = (r) => !!r && team(r) === 'townsfolk' && inScript(r, script) && !inPlay.has(r) && !NOT_DRUNK_AS.has(r);
  d.drunkAs = drunk ? (drunkOk(d.drunkAs) ? d.drunkAs : drunk.shownRole) : null;
  const bluffOk = (r) => !!r && good(r) && inScript(r, script) && !inPlay.has(r) && r !== d.drunkAs && r !== 'drunk';
  if (!g.bluffs?.length) d.bluffs = [];
  else {
    const keep = [...new Set((d.bluffs ?? []).filter(bluffOk))];
    for (const r of g.bluffs) if (keep.length < 3 && bluffOk(r) && !keep.includes(r)) keep.push(r);
    for (const r of rolesOf(script).filter(good)) if (keep.length < 3 && bluffOk(r) && !keep.includes(r)) keep.push(r);
    d.bluffs = keep.slice(0, 3);
  }
  const ft = d.roles.includes('fortuneteller') || d.drunkAs === 'fortuneteller';
  const herringOk = (id) => { const i = d.plan.seats.findIndex((p) => p.id === id); return i >= 0 && !isEvilRole(d.roles[i]); };
  d.redHerring = !ft ? null : herringOk(d.redHerring) ? d.redHerring : g.redHerring ?? null;
}

/** 开一张排版台。plan：Room.planSetup 的结果（座位已经排好）。 */
export function openDraft(room, plan) {
  room.draft = { plan, roles: null, drunkAs: plan.drunkAs ?? null, bluffs: null, redHerring: null, moved: false, rerolls: 0 };
  settle(room.draft, plan.roles);
}

/** 关掉排版台（有人进出、改了设置）。 */
export function dropDraft(room, why) {
  if (!room.draft) return;
  room.draft = null;
  room.announce(`${why}，说书人要重新排版`);
}

/** 排版台上的操作。返回要开局的 plan（点了「发身份」），否则 null。 */
export function draftAct(room, p = {}) {
  const d = room.draft;
  if (!d) throw new UserError('现在没有在排版');
  const { plan } = d;
  const n = plan.seats.length;
  const seat = (i) => { if (!Number.isInteger(i) || i < 0 || i >= n) throw new UserError('没有这个座位'); return i; };
  const roles = [...d.roles];
  switch (p.op) {
    case 'role': { // 某个座位换一个角色；这个角色在别的座位上就两人对调（一局里同一个角色只有一个）
      const i = seat(p.i);
      if (!ROLES[p.role] || !inScript(p.role, plan.script)) throw new UserError('这个剧本没有这个角色');
      const j = roles.indexOf(p.role);
      if (j >= 0) [roles[i], roles[j]] = [roles[j], roles[i]]; else roles[i] = p.role;
      settle(d, roles);
      break;
    }
    case 'swap': { // 两个座位对调角色
      const i = seat(p.i); const j = seat(p.j);
      [roles[i], roles[j]] = [roles[j], roles[i]];
      settle(d, roles);
      break;
    }
    case 'reroll': { // 整版重抽（照房间的配置方式）
      const fresh = room.planSetup(plan.seats, plan.script);
      d.plan = fresh; d.drunkAs = fresh.drunkAs ?? null; d.bluffs = null; d.redHerring = null; d.rerolls++;
      settle(d, fresh.roles);
      break;
    }
    case 'drunkAs':
      if (!d.roles.includes('drunk')) throw new UserError('这局没有酒鬼');
      if (team(p.role) !== 'townsfolk' || !inScript(p.role, plan.script) || d.roles.includes(p.role) || NOT_DRUNK_AS.has(p.role)) throw new UserError('酒鬼要以为自己是一个不在场的镇民');
      d.drunkAs = p.role;
      settle(d, roles);
      break;
    case 'bluff': { // 第 k 个伪装换成某个不在场的善良角色
      const k = Number(p.k);
      if (!(k >= 0 && k < d.bluffs.length)) throw new UserError('没有这个伪装');
      if (!good(p.role) || !inScript(p.role, plan.script) || d.roles.includes(p.role) || p.role === d.drunkAs || p.role === 'drunk') throw new UserError('伪装要是不在场的善良角色');
      const other = d.bluffs.indexOf(p.role);
      if (other >= 0) [d.bluffs[k], d.bluffs[other]] = [d.bluffs[other], d.bluffs[k]]; else d.bluffs[k] = p.role;
      break;
    }
    case 'herring': {
      const i = plan.seats.findIndex((x) => x.id === p.id);
      if (i < 0 || isEvilRole(d.roles[i])) throw new UserError('红鲱鱼要是一名善良玩家');
      d.redHerring = p.id;
      break;
    }
    case 'cancel':
      room.draft = null;
      room.announce('说书人取消了这次开局');
      return null;
    case 'go': {
      const left = plan.seats.filter((x) => !x.fake && !room.lobby.some((q) => q.id === x.id));
      if (left.length) { dropDraft(room, `${left.map((x) => x.name).join('、')} 已经离开座位`); return null; }
      if (!d.roles.some((r) => team(r) === 'demon') && !plan.riot) throw new UserError('至少要有一个恶魔');
      room.draft = null;
      return { ...plan, roles: [...d.roles], drunkAs: d.drunkAs, pick: { drunkAs: d.drunkAs, bluffs: [...d.bluffs], redHerring: d.redHerring } };
    }
    default: throw new UserError('未知操作');
  }
  return null;
}

/** 开局时把排版台上定的套进真正的这一局（引擎自己挑的酒鬼角色、伪装、红鲱鱼换成说书人定的），复盘里的开局记录跟着重写。 */
export function applyDraft(g, { drunkAs, bluffs, redHerring }) {
  const drunk = g.players.find((p) => p.role === 'drunk');
  if (drunk && drunkAs && !g.players.some((q) => q.role === drunkAs)) drunk.shownRole = drunkAs;
  if (Array.isArray(bluffs) && g.bluffs?.length) g.bluffs = [...bluffs];
  const ft = g.players.some((p) => p.role === 'fortuneteller' || p.shownRole === 'fortuneteller');
  if (ft && redHerring && g.get(redHerring) && !isEvilRole(g.get(redHerring).role)) g.redHerring = redHerring;
  const rest = g.timeline.filter((e) => e.kind !== 'setup');
  g.timeline = [];
  g.record('setup', g.players.map((p) => `${p.seat}号 ${p.name}：${g.roleText(p)}`).join('；'));
  if (g.bluffs.length) g.record('setup', `恶魔拿到的伪装：${g.bluffs.map((r) => ROLES[r].name).join('、')}`);
  g.timeline.push(...rest);
}

/** 人数表加上在场角色的 [+2 外来者] 这类说明：说书人对着看人数对不对。 */
function counts(d) {
  const [t, o, m, dm] = DISTRIBUTION[d.roles.length] ?? DISTRIBUTION[15];
  const have = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
  for (const r of d.roles) have[team(r)] = (have[team(r)] ?? 0) + 1;
  const mods = d.roles.map((r) => ({ role: r, text: /\[([^\]]*)\]\s*$/.exec(ROLES[r]?.ability ?? '')?.[1] ?? null })).filter((x) => x.text && /外来者|镇民|爪牙|恶魔/.test(x.text));
  return { base: { townsfolk: t, outsider: o, minion: m, demon: dm }, have, mods: mods.map((x) => ({ role: x.role, name: ROLES[x.role].name, text: x.text })) };
}

/** 发给说书人的排版台。 */
export function draftView(room) {
  const d = room.draft;
  if (!d) return null;
  const { plan } = d;
  const script = plan.script;
  const roleInfo = (r) => ({ id: r, name: ROLES[r].name, team: team(r) });
  return {
    script,
    seats: plan.seats.map((p, i) => ({ id: p.id, name: p.name, avatar: room.users.get(p.id)?.avatar ?? p.avatar ?? null, fake: !!p.fake, newbie: plan.newbies.includes(p.id), role: d.roles[i] })),
    roles: rolesOf(script).filter((r) => ROLES[r] && !ROLES[r].virtual).map(roleInfo),
    drunkAs: d.drunkAs,
    bluffs: d.bluffs,
    redHerring: d.redHerring,
    moved: d.moved,
    how: plan.pick ? null : plan.preset ? `推荐配置「${plan.preset.name}」` : plan.custom ? `房主指定了 ${plan.assigned} 个座位，其余随机` : plan.pure ? '完全随机' : 'AI 配平',
    counts: counts(d),
  };
}
