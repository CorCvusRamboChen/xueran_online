// 复盘 / 票型：游戏结束时、右栏「票型」、大厅「往期对局」共用。
import { useState } from 'react';
import { Portrait, cnNum } from './util.jsx';

// 终局复盘：按"开局 / 第一夜 / 第一天……"分段，列出每晚的选择、每个人拿到的信息（能力失效的标出来）、
// 死亡、提名投票、说书人的每个判定。可以按类别筛选。
const REPLAY_KINDS = {
  setup: '开局', choice: '选择', info: '信息', death: '死亡', nominate: '提名', vote: '投票', slay: '开枪', st: '说书人', end: '终局',
};
const REPLAY_FILTERS = [
  ['all', '全部', null],
  ['info', '夜里的信息', ['choice', 'info']],
  ['day', '提名投票', ['nominate', 'vote', 'slay', 'death']],
  ['st', '说书人判定', ['st']],
];

export function Replay({ timeline }) {
  const [filter, setFilter] = useState('all');
  const kinds = REPLAY_FILTERS.find((f) => f[0] === filter)?.[2];
  const shown = timeline.filter((e) => !kinds || kinds.includes(e.kind) || e.kind === 'end');
  const groups = [];
  for (const e of shown) {
    if (groups.at(-1)?.when !== e.when) groups.push({ when: e.when, items: [] });
    groups.at(-1).items.push(e);
  }
  return (
    <details className="replay" open>
      <summary>终局复盘 · 所有私密信息和说书人判定</summary>
      <div className="replay-filters">
        {REPLAY_FILTERS.map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {groups.map((gr, i) => (
        <section key={`${gr.when}-${i}`} className="replay-group">
          <h4>{gr.when}</h4>
          <ul>
            {gr.items.map((e, k) => (
              <li key={k} className={`rk-${e.kind}${/【能力失效】/.test(e.text) ? ' broken' : ''}`}>
                <span className="replay-kind">{REPLAY_KINDS[e.kind] ?? e.kind}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

const VOTE_OUTCOME = { block: '送上处决台', tie: '平票（台上清空）', lower: '票数不如台上的人', fail: '票数不够' };

/**
 * 关键信息：按天倒着列——那天早上的刀口（昨晚谁死了 / 平安夜 / 谁复活了）、当天每一次投票的票型、黄昏的处决结果。
 * knives / execs / votes 都是公开信息（天亮、投票时大家都看到了），这里只是整理在一起方便盘。
 */
export function KeyInfo({ votes = [], knives = [], execs = [], g, name }) {
  const days = [...new Set([...knives.map((k) => k.day), ...votes.map((v) => v.day), ...execs.map((e) => e.day)])].sort((a, b) => b - a);
  if (!days.length) return <p className="muted">还没有关键信息。每晚的刀口、每次投票的票型、每天的处决都会整理在这里。</p>;
  const who = (id) => (g(id) ? `${g(id).seat}号 ${name(id).replace(/^\d+号 /, '')}` : '?');
  return (
    <div className="vote-history key-info">
      {days.map((day) => {
        const k = knives.find((x) => x.day === day);
        const ex = execs.find((x) => x.day === day);
        const list = votes.filter((v) => v.day === day);
        return (
          <section key={day} className="vh-day">
            <h4>第 {cnNum(day)} 天</h4>
            {k && (
              <div className={`ki-row ki-knife ${k.deaths.length ? '' : 'peace'}`}>
                <span className="ki-tag">刀口 · 第{cnNum(k.night)}夜</span>
                <span>{k.deaths.length ? k.deaths.map(who).join('、') + ' 死亡' : '平安夜'}{k.revived?.length ? `；${k.revived.map(who).join('、')} 复活` : ''}</span>
              </div>
            )}
            {list.map((v, i) => <VoteCard key={i} v={v} g={g} name={name} />)}
            {ex && (
              <div className={`ki-row ki-exec ${ex.id ? '' : 'none'}`}>
                <span className="ki-tag">处决</span>
                <span>{ex.id ? `${who(ex.id)}${ex.saved ? ' 被处决，但没有死' : ' 被处决'}` : '今天没有人被处决'}</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** 一次投票：谁提名谁、几票、结果、谁举了手。 */
function VoteCard({ v, g, name }) {
  return (
    <div className={`vh-card vh-${v.outcome}`}>
      <div className="vh-head">
        <b>{g(v.nominator)?.seat}号 → {g(v.nominee)?.seat}号</b>
        <span className="vh-count"><b>{v.count}</b> / {v.threshold} 票</span>
      </div>
      <p className="vh-line">{name(v.nominator)} 提名 {name(v.nominee)} · <b>{VOTE_OUTCOME[v.outcome]}</b></p>
      <div className="vh-voters">
        {v.voters.length ? v.voters.map((id) => (
          <span key={id} className="vh-voter">
            {g(id) && <Portrait p={g(id)} size={22} prefer="avatar" />}{g(id)?.seat}号
          </span>
        )) : <span className="muted">没有人举手</span>}
      </div>
    </div>
  );
}
/** 票型：每天每次投票谁提名谁、谁举了手。 */
export function VoteHistory({ votes = [], g, name }) {
  if (!votes.length) return <p className="muted">还没有投过票。每次投票结束后，谁举了手都会记在这里。</p>;
  const days = [];
  for (const v of votes) {
    if (days.at(-1)?.day !== v.day) days.push({ day: v.day, list: [] });
    days.at(-1).list.push(v);
  }
  return (
    <div className="vote-history">
      {[...days].reverse().map((d) => (
        <section key={d.day} className="vh-day">
          <h4>第 {cnNum(d.day)} 天</h4>
          {d.list.map((v, i) => (
            <div key={i} className={`vh-card vh-${v.outcome}`}>
              <div className="vh-head">
                <b>{g(v.nominator)?.seat}号 → {g(v.nominee)?.seat}号</b>
                <span className="vh-count"><b>{v.count}</b> / {v.threshold} 票</span>
              </div>
              <p className="vh-line">{name(v.nominator)} 提名 {name(v.nominee)} · <b>{VOTE_OUTCOME[v.outcome]}</b></p>
              <div className="vh-voters">
                {v.voters.length ? v.voters.map((id) => (
                  <span key={id} className="vh-voter">
                    {g(id) && <Portrait p={g(id)} size={22} prefer="avatar" />}{g(id)?.seat}号
                  </span>
                )) : <span className="muted">没有人举手</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
