// 新手教程的分步提示：跟着练习局的进度走，每一步告诉你现在该做什么，做完自动进入下一步。
// 有的步骤看状态就能判断做没做（走进房子、锁门、提名……），有的要界面发事件（翻身份牌、打开日志）。
// 练习局的剧本见 src/server/tutorial.js：你是共情者，2 号老格是恶魔，7 号汉娜是士兵。
import { useEffect, useState } from 'react';

/** 界面上发生了教程关心的事：tutEvent('flip') / tutEvent('journal')。 */
export const tutEvent = (name) => window.dispatchEvent(new CustomEvent('botc-tut', { detail: name }));

const STEPS = [
  {
    id: 'welcome', manual: true, title: '欢迎来到钟楼镇',
    text: '这是一局只有你和 6 个机器人的练习局。镇上藏着一个恶魔和他的爪牙（邪恶阵营），其余的人是好人（善良阵营）。好人要在白天投票处决恶魔；恶魔每晚杀一个人，杀到只剩两个人就赢了。',
  },
  {
    id: 'flip', title: '先看看你是谁', target: '.idcard',
    text: '每个人开局都会拿到一个秘密身份。点右边的身份牌把它翻开——别让旁边的人看见。',
    done: (f) => f.flip,
  },
  {
    id: 'journal', title: '夜里收到的信息', target: '.info-box, .hud-btn-role',
    text: '你是共情者：每天晚上会得知左右两边活着的邻座里，有几个是邪恶的。天黑以后说书人已经把信息告诉你了——就在「身份」页最上面的「你得到的信息」里。',
    ready: (s) => s.self?.inbox?.length > 0,
    done: (f) => f.journal,
  },
  {
    id: 'think', manual: true, title: '推理一下',
    text: '日志里说：你两侧有 1 个邪恶。你左边是 2 号老格，右边是 7 号汉娜。（练习局直接告诉你一条线索：汉娜是士兵，是好人。）那邪恶的就是……先记在心里，白天去验证。',
  },
  {
    id: 'move', title: '白天自由活动', target: '.map',
    text: '天亮了，大家可以在小镇里自由走动。点地图上的任意地方走过去，或者用 WASD / 方向键走。',
    ready: (s) => !!s.roam,
    done: (f) => f.moved,
  },
  {
    id: 'enter', title: '进房子私聊', target: '.map',
    text: '走进一栋亮着灯的房子（比如广场旁边的面包房）。进了房子，你就会被拉进这间房子的私聊语音，外面的人听不到。',
    ready: (s) => !!s.roam,
    done: (f) => f.entered,
  },
  {
    id: 'lock', title: '锁门', target: '.room-pnl .btn-primary',
    text: '在右上角点「锁门私聊」。锁上以后，别人走到门口只能敲门，你可以选择让他进来或者假装没人。',
    ready: (s) => !!s.roam?.myHouse,
    done: (f) => f.locked,
  },
  {
    id: 'leave', title: '出门', target: '.room-pnl .btn-secondary, .room-pnl .btn-ghost',
    text: '锁着门是出不去的。先点「开门」，再点「出去」回到街上。',
    ready: (s) => !!s.roam,
    done: (f) => f.left,
  },
  {
    id: 'gather', title: '回广场集合', target: '.end-roam',
    text: '聊够了，大家要回广场提名。点「我想提前集合」——所有人都同意就会立刻集合（练习局里只有你一个真人）。',
    ready: (s) => !!s.roam,
    done: (f) => f.gathered,
  },
  {
    id: 'nominate', title: '提名', target: '.sq-board, .btn-row .btn-primary',
    text: '回到广场后可以提名。每人每天只能提名一次。点「提名」，再点座位圈上 2 号老格的头像。',
    ready: (s) => !!s.noms,
    done: (f) => f.nominated,
  },
  {
    id: 'speak', title: '说出你的理由',
    text: '提名之后你有一段时间说理由——在语音里说就行。说完点「我说完了」，接着被提名的人会为自己辩护。',
    ready: (s) => !!s.pendingNom,
    done: (f) => f.spoke,
  },
  {
    id: 'vote', title: '投票', target: '.big',
    text: '投票开始了：时钟指针从被提名者的下一位开始顺时针转，转到谁，谁的票就锁定。在指针转到你之前点「举手」。超过半数的人举手，被提名者就会在黄昏被处决。',
    ready: (s) => !!s.vote,
    done: (f) => f.voted,
  },
  {
    id: 'dusk', title: '等待黄昏',
    text: '票数出来了。超过半数的人举了手，被提名者就会被送上处决台；黄昏时，台上的人会被处决。看看会发生什么……',
    ready: (s) => !!s.lastVote,
    done: () => false,
  },
  {
    id: 'end', manual: true, last: true, title: '善良获胜！',
    text: '恶魔被处决，好人赢了。右边的「终局复盘」能看到每个人的真实身份、每晚谁得知了什么、说书人做了哪些判定——真实对局结束后大家可以一起看。练习就到这里，祝你在钟楼镇好运。',
    ready: (s) => s.phase === 'ended',
  },
];

const RETRY = {
  id: 'retry', title: '这次没投出恶魔',
  text: '没关系，真实对局里也常常这样。夜晚又来了，恶魔会杀一个人；明天白天你可以继续提名、投票。想从头再来，就点「退出教程」再重新开始。',
};

export function Tutorial({ s, onExit }) {
  const [flags, setFlags] = useState({});
  const [passed, setPassed] = useState({}); // 手动"继续"或"跳过"的步骤
  const set = (patch) => setFlags((f) => (Object.keys(patch).some((k) => !f[k]) ? { ...f, ...patch } : f));

  useEffect(() => {
    const f = (e) => set({ [e.detail]: true });
    window.addEventListener('botc-tut', f);
    return () => window.removeEventListener('botc-tut', f);
  }, []);

  // 走路时位置是直接改的（不触发重新渲染），所以每半秒自己看一眼进度
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);

  // 能从状态看出来的进度
  const r = s.roam;
  const me = s.players?.find((p) => p.id === s.me);
  useEffect(() => {
    const patch = {};
    if (r) patch.roamSeen = true;
    if (r?.pos?.[s.me]?.dur > 0) patch.moved = true;
    if (r?.myHouse) patch.entered = true;
    if (r?.houses.find((h) => h.id === r.myHouse)?.locked) patch.locked = true;
    if (flags.locked && r && !r.myHouse) patch.left = true;
    if (flags.roamSeen && !r && s.phase === 'day') patch.gathered = true;
    if (me?.nominator) patch.nominated = true;
    if (s.vote || (s.pendingNom && s.pendingNom.stage === 'defend')) patch.spoke = true;
    if (s.vote?.yes?.includes(s.me)) patch.raised = true;
    if (s.lastVote && !s.vote) patch.voted = true;
    if (Object.keys(patch).length) set(patch);
  });

  const ended = s.phase === 'ended';
  // 没投出恶魔（提名错了人、票不够）：游戏照常继续，提示一下可以再试或者重开
  const retry = !ended && s.night >= 2;
  const idx = ended ? STEPS.length - 1 : STEPS.findIndex((st) => !passed[st.id] && !(st.done && st.done(flags)));
  const step = retry ? RETRY : STEPS[idx];

  // 高亮要点的地方
  useEffect(() => {
    document.querySelectorAll('.tut-target').forEach((el) => el.classList.remove('tut-target'));
    if (!step?.target) return undefined;
    const t = setInterval(() => {
      document.querySelectorAll('.tut-target').forEach((el) => el.classList.remove('tut-target'));
      const el = document.querySelector(step.target);
      if (el) el.classList.add('tut-target');
    }, 400);
    return () => { clearInterval(t); document.querySelectorAll('.tut-target').forEach((el) => el.classList.remove('tut-target')); };
  }, [step?.id]);

  if (!step) return null;
  const waiting = step.ready && !step.ready(s);
  return (
    <aside className="tut" role="dialog" aria-label="新手教程">
      <div className="tut-head">
        <span className="tut-step">{retry ? '教程' : `教程 ${idx + 1} / ${STEPS.length}`}</span>
        <button type="button" className="tut-exit" onClick={onExit}>退出教程</button>
      </div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      {waiting && <p className="tut-wait">（稍等，游戏正在进行到这一步……）</p>}
      <div className="tut-actions">
        {retry ? null : step.last
          ? <button type="button" className="tut-next" onClick={onExit}>结束教程</button>
          : step.manual
            ? <button type="button" className="tut-next" onClick={() => setPassed((p) => ({ ...p, [step.id]: true }))}>继续</button>
            : <button type="button" className="tut-skip" onClick={() => setPassed((p) => ({ ...p, [step.id]: true }))}>跳过这步</button>}
      </div>
    </aside>
  );
}
