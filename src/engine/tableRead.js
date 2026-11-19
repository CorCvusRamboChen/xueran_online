// 读场（2026-11-19 用户：夜半狂欢的全员收音可以让 AI 听到所有人的发言，用来让说书人更懂场面；
// 目标是无神论者局里 AI 说书人的控场能力胜过真人说书人）。
//
// 每天黄昏，房间把今天（和之前）大家在语音里说的话交给大模型，让它只按「公开知道的事」和发言整理出场面：
// 谁报了什么身份、谁被怀疑、谁被信任、谁在指控谁、大家有多怀疑这局根本没有邪恶。
// 这里把模型的回答整理成说书人能用的样子（不信任模型给的座位号、角色名，都要在本局里对得上），
// 再算出局势和挑人时的特征。没有模型、没有发言时，用提名投票这些机械信号兜底（mechanicalTable）。
import { ROLES, rolesOf } from './roles.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 角色名（中文名或英文名）→ 本剧本的角色 id；对不上就 null。转写常有错字，只认完整的名字。 */
function roleIdOf(name, script) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  return rolesOf(script).find((r) => ROLES[r].name === s || ROLES[r].en?.toLowerCase() === lower) ?? null;
}

/**
 * 模型回答 → 说书人用的读场结果。座位号不在本局的、角色不在剧本里的都丢掉。
 * 返回 { gameId, day, claims: {id: {role, info}}, suspects: {id: {score, as}}, trusted: {id: score},
 *        accusations: [[from, to]], atheist, stVoices: [id], summary, by }。
 */
export function parseTable(o, g, day = g.day) {
  const bySeat = new Map(g.players.map((p) => [p.seat, p.id]));
  const idOf = (seat) => bySeat.get(Number(seat)) ?? null;
  const list = (v) => (Array.isArray(v) ? v : []);
  const t = { gameId: g.id ?? null, day, claims: {}, suspects: {}, trusted: {}, accusations: [], atheist: clamp01(o?.atheist), stVoices: [], summary: String(o?.summary ?? '').slice(0, 200), by: o?.by ?? null };
  for (const c of list(o?.claims)) {
    const id = idOf(c?.seat); const role = roleIdOf(c?.role, g.script);
    if (id && role) t.claims[id] = { role, info: String(c?.info ?? '').slice(0, 80) };
  }
  for (const s of list(o?.suspects)) {
    const id = idOf(s?.seat);
    if (id) t.suspects[id] = { score: clamp01(s?.score), as: ['demon', 'minion', 'evil'].includes(s?.as) ? s.as : 'evil' };
  }
  for (const s of list(o?.trusted)) { const id = idOf(s?.seat); if (id) t.trusted[id] = clamp01(s?.score); }
  for (const a of list(o?.accusations).slice(0, 20)) {
    const from = idOf(a?.from); const to = Number(a?.to) === 0 || a?.to === 'storyteller' ? 'storyteller' : idOf(a?.to);
    if (from && to && from !== to) t.accusations.push([from, to]);
  }
  t.stVoices = [...new Set(list(o?.stVoices).map(idOf).filter(Boolean))];
  return t;
}

/**
 * 没有大模型或没人说话时：只看提名和投票。被提名得多 = 被怀疑；提名过说书人 = 在推「没有邪恶」；
 * 提名过谁 = 指控谁。信任看不出来，给 0。
 */
export function mechanicalTable(g) {
  const heat = g.suspicion ?? {};
  const max = Math.max(1, ...Object.values(heat));
  const t = { gameId: g.id ?? null, day: g.day, claims: {}, suspects: {}, trusted: {}, accusations: [], atheist: 0, stVoices: [], summary: '', by: 'rules', mechanical: true };
  for (const [id, h] of Object.entries(heat)) if (h > 0 && g.get(id)) t.suspects[id] = { score: h / max, as: 'evil' };
  for (const [from, to] of g.nomHistory ?? []) {
    if (to === 'storyteller') { if (!t.stVoices.includes(from)) t.stVoices.push(from); continue; }
    t.accusations.push([from, to]);
  }
  if (t.stVoices.length) t.atheist = Math.min(1, t.stVoices.length / Math.max(3, g.aliveCount() / 2));
  return t;
}

/**
 * 说书人挑人时这个人的情况（dice.js 的 DRAW 用）：
 * trusted 大家多信任他、suspected 大家多怀疑他、stVoice 他在推「处决说书人」、
 * accuser 他在指控假世界里的恶魔、info 他报了能拿信息的身份并说出了信息。
 */
export function tableFeatures(t, id, { demon = null } = {}) {
  if (!t) return {};
  const claim = t.claims?.[id];
  return {
    trusted: t.trusted?.[id] ?? 0,
    suspected: t.suspects?.[id]?.score ?? 0,
    stVoice: t.stVoices?.includes(id) ? 1 : 0,
    accuser: demon && t.accusations?.some(([from, to]) => from === id && to === demon) ? 1 : 0,
    info: claim && claim.info && ROLES[claim.role]?.team === 'townsfolk' ? 1 : 0,
  };
}

/**
 * 局势（-1 邪恶大优 到 +1 善良大优）：大家怀疑的是真邪恶（恶魔算两倍）还是好人，按表态多少打折。
 * 无神论者局没有邪恶：善良「领先」就是大家已经在怀疑这局没有邪恶、想处决说书人。
 */
export function tableLead(t, g) {
  if (!t) return null;
  if (g.atheist) return Math.max(-1, Math.min(1, 2 * t.atheist - 0.6));
  const live = g.players.filter((p) => p.alive);
  const sus = (p) => t.suspects?.[p.id]?.score ?? 0;
  const avg = (ps, w = () => 1) => { const ws = ps.reduce((a, p) => a + w(p), 0); return ws ? ps.reduce((a, p) => a + w(p) * sus(p), 0) / ws : 0; };
  const evil = live.filter((p) => g.evilOf(p));
  const good = live.filter((p) => !g.evilOf(p));
  const mass = Object.values(t.suspects ?? {}).reduce((a, v) => a + v.score, 0);
  if (!mass) return null;
  const sure = Math.min(1, mass / 1.5); // 大家的怀疑加起来有多重：一个人被几乎全场认定，也算看得清
  return Math.max(-1, Math.min(1, 2 * (avg(evil, (p) => (ROLES[p.role]?.team === 'demon' ? 2 : 1)) - avg(good)))) * sure;
}

/** 一句话描述读场结果（说书人手记、真人说书人的说书台用）。 */
export function describeTable(t, g, { summary = true } = {}) {
  if (!t) return '';
  const nm = (id) => g.name(id);
  const top = (obj, f) => Object.entries(obj ?? {}).map(([id, v]) => [id, f(v)]).filter(([, v]) => v >= 0.4).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const parts = [];
  const sus = top(t.suspects, (v) => v.score);
  if (sus.length) parts.push(`最被怀疑：${sus.map(([id, v]) => `${nm(id)}（${Math.round(v * 100)}%）`).join('、')}`);
  const tr = top(t.trusted, (v) => v);
  if (tr.length) parts.push(`最被信任：${tr.map(([id]) => nm(id)).join('、')}`);
  const claims = Object.entries(t.claims ?? {});
  if (claims.length) parts.push(`报身份 ${claims.length} 人（${claims.slice(0, 5).map(([id, c]) => `${nm(id)}=${ROLES[c.role].name}`).join('、')}${claims.length > 5 ? '…' : ''}）`);
  if (t.atheist >= 0.2 || t.stVoices?.length) parts.push(`怀疑没有邪恶 ${Math.round(t.atheist * 100)}%${t.stVoices?.length ? `（${t.stVoices.map(nm).join('、')} 在推处决说书人）` : ''}`);
  if (summary && t.summary) parts.push(t.summary); // 模型的概括可能复述了发言：不写进会存档的说书人手记
  return parts.join('；') || '看不出明显的倾向';
}
