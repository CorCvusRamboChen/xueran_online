// 录音存档（2026-11-16 用户：各种录音要保存，方便之后的行动）。
// 收音页传上来的每一句（WAV）和语音机器人在广场旁听到的每一句（Ogg/Opus）都存下来，连同转写：
//   data/recordings/<服务器>/<对局 id>/<玩家 id>/<时间>-<来源>.<wav|ogg>
//   data/recordings/<服务器>/<对局 id>/transcript.jsonl   一行一句：{ at, day, phase, id, name, source, text, file }
// 只存白天在收的时候（晚上收音页暂停，不收也不存）。写盘失败不影响游戏。data/ 不进仓库、部署不会动它。
import fs from 'node:fs';
import path from 'node:path';

let ROOT = process.env.NODE_TEST_CONTEXT ? null : path.resolve('data/recordings'); // 跑测试时默认不写盘
const safe = (x) => String(x).replace(/[^\w.-]/g, '_');

/** 测试用：换目录（null = 不写盘）。 */
export function useRecordingsDir(dir) { ROOT = dir; }

/** 这一局的录音目录（相对 data/ 的路径写进往期对局文件，方便以后对上）。 */
export const recordingsDir = (guildId, gameId) => (ROOT ? path.join(ROOT, safe(guildId), safe(gameId)) : null);

/**
 * 存一句。audio：Buffer；ext：'wav' | 'ogg'；source：'mic'（收音页）| 'square'（机器人在广场旁听）。
 * 返回写进清单的那一行（测试用），没写盘返回 null。
 */
export async function saveRecording({ guildId, gameId, id, name, day, phase, source, audio, ext, text }) {
  const dir = recordingsDir(guildId, gameId);
  if (!dir || !gameId) return null;
  try {
    const at = Date.now();
    const file = audio?.length ? path.join(safe(id), `${at}-${source}.${ext}`) : null;
    if (file) {
      await fs.promises.mkdir(path.join(dir, safe(id)), { recursive: true });
      await fs.promises.writeFile(path.join(dir, file), audio);
    } else await fs.promises.mkdir(dir, { recursive: true });
    const row = { at, day, phase, id, name, source, text: text ?? '', file: file?.replace(/\\/g, '/') ?? null };
    await fs.promises.appendFile(path.join(dir, 'transcript.jsonl'), `${JSON.stringify(row)}\n`);
    return row;
  } catch (e) {
    console.warn('[botc] 录音存档失败：', e.message);
    return null;
  }
}
