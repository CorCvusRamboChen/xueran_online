// 规则关键词：能力说明里的"醉酒""中毒""处决"……标出来（虚线下划线），鼠标放上去（手机上点一下）弹出详细解释。
// 每段文字里同一个词只标第一次出现的地方，免得满屏都是下划线。
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const GLOSSARY = {
  醉酒: '能力失效，但本人不知道：说书人会假装他的能力还在，给的信息可能是假的，能力也不会真的生效。醉酒由水手、侍臣、旅店老板、莽夫等造成；酒鬼一整局都是醉的。',
  中毒: '和醉酒一样：能力失效、本人不知道，拿到的信息可能是假的。由投毒者（暗流涌动）或普卡（黯月初升）造成，持续到能力写的时间为止。',
  死亡: '死了就失去能力（能力写明死后也有用的除外，比如守鸦人）。死人还能说话，整局还剩一票（"幽灵票"，投出去就没了），但不能再提名。',
  处决: '白天投票的结果：得票最多、而且不少于存活人数一半的人被处决，平票就谁都不处决，每天最多一次。被处决和夜里被杀是两回事，有的能力只管其中一种。',
  存活: '还活着的玩家。很多能力只能选存活的人；处决需要的票数也按存活人数算。',
  唤醒: '夜里说书人叫你睁眼行动。"因自己的能力被唤醒"不算被叫醒告知信息（比如首夜爪牙互认）。',
  首夜: '游戏开始后的第一个夜晚。写"每个夜晚*"（带星号）的能力首夜不用。',
  '夜晚*': '带星号：除了首夜以外的每个夜晚。',
  镇民: '善良阵营里能力对好人有帮助的角色。',
  外来者: '善良阵营里能力会给好人添麻烦的角色（比如圣徒被处决好人就输）。',
  爪牙: '邪恶阵营的帮手。7 人及以上时首夜和恶魔互认。恶魔死了，红唇女郎这样的爪牙可能接任。',
  恶魔: '邪恶阵营的核心，通常每晚杀人。恶魔死了（且没人接任）善良获胜；只剩两人存活时恶魔还活着，邪恶获胜。',
  邪恶: '恶魔和爪牙的阵营。目标是让恶魔一直活着，直到只剩两名存活玩家。',
  善良: '镇民和外来者的阵营。目标是找出并处决恶魔。',
  阵营: '善良或邪恶。少数角色会改变阵营（比如莽夫），赢了输了按当时的阵营算。',
  起死回生: '死去的人重新活过来，能力也恢复。',
  提名: '白天，存活的玩家可以提名一个人上投票，每人每天只能提名一次，每人每天也只能被提名一次。',
  公开: '当着所有人的面说出来或者做出来，大家都知道。',
  魔典: '说书人手里记着所有人真实角色和状态的那本册子。间谍能偷看。',
  红鲱鱼: '占卜师的"假目标"：一名善良玩家，占卜师查到他也会得到"有恶魔"。',
  反刍: '沙巴洛斯的能力：把上一晚被他杀过、现在死着的人之一"吐回来"——那人复活，能力也回来（包括用过的每局一次的能力）。反刍是说书人决定的，沙巴洛斯醉酒中毒时不会发生。',
  复活: '死去的人重新活过来，能力也恢复（包括用过的每局一次的能力）。如果他的角色在今晚的顺序里还没轮到，当晚就照常醒来行动。黎明只公布谁复活了，不说原因。',
  被当作死亡: '僵怖第一次死后其实还活着，但在所有人看来（包括很多能力）都算死人：不能提名、只剩一张票、算不上谁的存活邻座。再死一次才真的死。',
  被当作: '"登记成"别的样子：陌客可能被当作邪恶、爪牙或恶魔，间谍可能被当作善良、镇民或外来者——各种查验能力看到的是被当作的样子，由说书人决定。',
  黄昏: '白天结束、入夜之前的那一刻。"醉酒直到下个黄昏"就是醉到这一天结束。',
  每局游戏限一次: '整局只能用一次，用了就没了（醉酒中毒时用也算用掉）。被复活的人可以再用一次。',
  每局一次: '整局只能用一次，用了就没了（醉酒中毒时用也算用掉）。',
  旅行者: '中途加入、不属于剧本固定阵营的特殊角色。本游戏暂时没有旅行者，看到这个词可以忽略。',
  声明: '造谣者白天公开说的一句话。只有真造谣者的声明、而且内容为真时，当晚才会有人死亡；谁都可以假装造谣者发表声明。',
};

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const RE = new RegExp(TERMS.map((t) => t.replace(/[*]/g, '\\$&')).join('|'), 'g');

/** 一段文字，把关键词标出来。 */
export function Glossed({ text }) {
  if (!text) return null;
  const out = []; const seen = new Set(); let last = 0;
  for (const m of String(text).matchAll(RE)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Term key={m.index} k={m[0]}>{m[0]}</Term>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/** 一个关键词：悬停 / 点一下弹出解释（弹层挂在 body 上，不会被卡牌的边框裁掉）。 */
export function Term({ k, children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.top < 140;
    setPos({ left, width: w, top: below ? r.bottom + 8 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 8 });
  }, [open]);
  const text = GLOSSARY[k];
  if (!text) return children;
  return (
    <>
      <span ref={ref} className="term" tabIndex={0} role="button" aria-label={`${k}：${text}`}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((x) => !x); }}>{children}</span>
      {open && pos && createPortal(
        <span className="term-tip" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}><b>{k.replace('*', '')}</b>{text}</span>,
        document.body,
      )}
    </>
  );
}
