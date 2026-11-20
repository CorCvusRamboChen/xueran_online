// 《全员失忆》（2026-11-20 用户：娱乐本有个全员失忆，网上查不到就按逻辑做）。
// 中文社区的玩法（苏通染 / SUI染钟楼 2022 年的录像、yanice 上的《全员追忆》测试版、英文的 All Amnesiacs）：
//   · 角色照常从剧本里发（这里用三个官方剧本的角色），能力照常生效，但每个人只知道自己是镇民 / 外来者 / 爪牙 / 恶魔，不知道是哪个角色；
//   · 每个白天，每个人（死了也行）可以问说书人一次关于自己能力或角色的问题，得到「完美 / 接近 / 有关 / 无关」；
//   · 答到「完美」就知道了自己是谁；黄昏时说书人公布现在有几个人「完美」；第 4 天所有人都知道自己的角色。
//   · 杂耍艺人、畸形秀演员这种必须先知道自己是谁才玩得了的角色不放进来（社区做法：要么告诉他，要么不放）。
// 这些是混到 Game 上的方法；房间那边（room.js）负责问答、黄昏公布、第 4 天揭晓。
import { ROLES, SCRIPTS, TEAM_NAME } from './roles.js';

/** 第几天全员揭晓。 */
export const REVEAL_DAY = 4;

export const ALL_AMNESIAC_METHODS = {
  /** 这局是全员失忆吗。 */
  allAmnMode() { return !!SCRIPTS[this.script]?.allAmnesiac; },

  /** 这个人现在还不知道自己是谁吗（全员失忆、还没答到完美、还没到第 4 天）。旅行者知道自己是谁。 */
  allAmn(p) { return !!p && this.allAmnMode() && !p.traveller && !this.allKnown && !this.amnesiacKnown?.[p.id]; },

  /** 给本人看的「失忆的 X」角色 id（amn_townsfolk / amn_outsider / amn_minion / amn_demon）。按他以为的角色类型（疯子以为自己是恶魔）。 */
  amnRoleOf(p) { return `amn_${ROLES[p.shownRole ?? p.role]?.team ?? 'townsfolk'}`; },

  /** 现在有几个人知道自己是谁（黄昏公布）。 */
  amnKnownCount() { return this.players.filter((p) => !p.traveller && (this.allKnown || this.amnesiacKnown?.[p.id])).length; },

  /** 一个人问说书人自己是谁：每天一次，死了也能问。返回 { text, ability, lie }（ability：他以为的角色，酒鬼按他以为的那个答）。 */
  allGuess(uid, raw) {
    if (this.phase !== 'day') throw new Error('只能在白天问');
    const p = this.get(uid);
    if (!p || p.traveller) throw new Error('你不是这局的玩家');
    if (!this.allAmn(p)) throw new Error('你已经知道自己是谁了');
    if (this.amnesiacDay[uid] === this.day) throw new Error('你今天已经问过了');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('问题不能是空的');
    if ([...text].length > 120) throw new Error('太长了（最多 120 字）');
    this.amnesiacDay[uid] = this.day;
    this.record('st', `全员失忆：${this.tag(uid)} 问自己是谁：${text}`);
    return { text, ability: p.shownRole ?? p.role, lie: null }; // 问的是「自己是谁」：照他以为的角色答（酒鬼答他以为的镇民），醉酒中毒也照实答
  },

  /** 第 4 天：所有人都知道了自己的角色。返回要私下告诉每个人的话。 */
  amnRevealAll() {
    if (!this.allAmnMode() || this.allKnown) return [];
    const out = this.players.filter((p) => !p.traveller && !this.amnesiacKnown?.[p.id]).map((p) => {
      const r = ROLES[p.shownRole ?? p.role];
      return { playerId: p.id, text: `**第 ${this.day} 天：失忆结束了。**你是 **${r.name}**（${TEAM_NAME[r.team]}）：${r.ability}` };
    });
    this.allKnown = true;
    this.record('st', `全员失忆：第 ${this.day} 天，所有人都知道了自己的角色`);
    return out;
  },
};
