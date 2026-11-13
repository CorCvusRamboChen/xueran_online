// 手机浏览器里玩（KOOK 进入链接、Discord 的「在浏览器打开」）：地址栏和底栏会挡住画面上下，第一次点屏幕时自动进全屏。
// 网页不能一打开就全屏（浏览器要求用户先点一下）；退出全屏后不再自动进，齿轮里有「全屏」按钮。
// Discord 活动本来就占满屏幕，不用；iPhone 的 Safari 不支持网页全屏，按钮也不显示。
import { inDiscord } from './connect.js';

export const canFullscreen = () => !inDiscord && !!document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches;

export function enterFullscreen() {
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

/** 第一次点屏幕时进全屏（这一下点击照常生效）。 */
export function autoFullscreen() {
  if (!canFullscreen()) return;
  const go = () => {
    window.removeEventListener('click', go, true);
    if (!document.fullscreenElement) enterFullscreen();
  };
  window.addEventListener('click', go, true);
}
