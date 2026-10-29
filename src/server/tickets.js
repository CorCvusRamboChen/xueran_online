// KOOK 的进入链接：机器人在频道里只给点按钮的那个人发一条带签名的链接（KOOK 临时消息，别人看不到），
// 网页拿着它连上来，服务器验签就知道是 KOOK 上的谁、在哪个服务器哪个频道。
// 不走 KOOK 的 OAuth（那个要找官方开资质）：身份由机器人担保——按钮点击事件里的 user_id 是 KOOK 给的。
// 链接谁拿到谁就能以这个身份进（相当于一张门票），所以有效期不长，也只发给本人。
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');
export const TICKET_HOURS = 12;

/** 签一张门票。payload：{ g 服务器, c 频道, u 用户, n 名字, a 头像 }。 */
export function signTicket(secret, payload, now = Date.now()) {
  const body = b64(JSON.stringify({ ...payload, e: now + TICKET_HOURS * 3600_000 }));
  const sig = b64(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/** 验票：签名不对或过期了抛错，好的返回 payload。 */
export function verifyTicket(secret, ticket, now = Date.now()) {
  const [body, sig] = String(ticket ?? '').split('.');
  if (!body || !sig) throw new Error('进入链接不完整：回到 KOOK 频道再点一次「领取我的进入链接」');
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error('进入链接不对：回到 KOOK 频道再点一次「领取我的进入链接」');
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new Error('进入链接坏了：回到 KOOK 频道再点一次「领取我的进入链接」'); }
  if (!(p.e > now)) throw new Error('进入链接过期了：回到 KOOK 频道再点一次「领取我的进入链接」');
  if (!p.g || !p.c || !p.u) throw new Error('进入链接缺东西：回到 KOOK 频道再点一次「领取我的进入链接」');
  return p;
}
