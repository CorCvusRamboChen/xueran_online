// Discord 活动绑在启动它的频道上：从语音频道打开时，机器人一拉人换频道，被拉的人就掉出活动。
// 所以新房间只许从文字频道开；已经在打的局不拦（不然重连就被踢出去）。
const CHECK_MS = 3000; // 查频道类型最多等这么久，别让进房卡住

/** 这次进房要不要拦下来：只有确实查到是语音频道才拦，查不到（机器人没就绪、对方接口不通）就放行。 */
export async function voiceLaunchBlocked({ room, voice, channelId, timeoutMs = CHECK_MS }) {
  if (room?.game && !room.ended) return false;
  if (!voice?.isVoiceChannel) return false;
  let timer;
  const late = new Promise((ok) => { timer = setTimeout(() => ok(false), timeoutMs); });
  try {
    return (await Promise.race([voice.isVoiceChannel(channelId).catch(() => false), late])) === true;
  } finally { clearTimeout(timer); }
}
