// 疯狂的「默许」（2026-11-20 用户转述朋友 Dylan：检测太弱，主要是默许那块）：
// 别人说你被洗脑了，或者别人也跳了你被洗脑要扮的角色（比如你被洗成占卜师，真占卜师出来说话），你必须站出来否认、和他争；
// 不吭声就等于默认告诉大家你被洗脑了——这就是破坏疯狂，会被处决。官方例子：被问到是不是疯了，理发师坚决说「不是」，才躲过处决。
//
// 这里只做文字层面的判断（转写出来的话）：谁提到了被洗脑的人、谁跳了那个角色；被洗脑的人之后有没有否认 / 争。
// 房间（room.js）负责：转写到一句话就调 scanLine；开窗口、提醒一次、到点没回应就按破坏疯狂处理。

/** 说书人等被洗脑的人回应多久。 */
export const RESPOND_MS = 90_000;

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

/** 这句话有没有提到这个人：名字，或者「3号」「三号」。 */
export function mentions(text, p) {
  if (!p) return false;
  if (p.name && p.name.length >= 2 && text.includes(p.name)) return true;
  const n = p.seat;
  return new RegExp(`(^|[^0-9])${n}\\s*号`).test(text) || (CN[n] && text.includes(`${CN[n]}号`));
}

const ACCUSE = /洗脑|洗了脑|疯了|疯狂|被逼|在演|演的|被控制|被操控/;

/** 说自己是某个角色：「我是占卜师」「我才是占卜师」「我就是占卜师」「真占卜师是我」。 */
export function claimsRole(text, roleName) {
  if (!roleName) return false;
  const r = roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`我(才|就|真的)?是\\s*(真的?)?\\s*${r}|真的?\\s*${r}\\s*是我|${r}\\s*是我`).test(text);
}

/** 被洗脑的人在否认 / 争：「我没有」「我不是被洗脑」「他是假的」「我才是占卜师」…… */
const DENY = /我(没有|没|不是|才不是|没被|绝对不是|根本没)|没(被)?洗脑|不是洗脑|没疯|胡说|乱说|瞎说|撒谎|骗人|假的|别听他|他在(骗|编|乱|瞎)|污蔑|冤枉/;
export function denies(text, roleName) { return DENY.test(text) || claimsRole(text, roleName); }

/**
 * 一句别人说的话会不会让某个被洗脑的人陷入「要回应」：返回 'accuse'（说他被洗脑了）/ 'counter'（跳了他的角色）/ null。
 * speaker：说话的人；p：被洗脑的人；roleName：他被洗脑要扮的角色。
 */
export function triggerOf(text, speaker, p, roleName) {
  if (!text || !p || speaker?.id === p.id) return null;
  if (ACCUSE.test(text) && mentions(text, p)) return 'accuse';
  if (claimsRole(text, roleName)) return 'counter';
  return null;
}
