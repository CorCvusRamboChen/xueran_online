// 「你被洗脑了 · 须知」小牌子（2026-11-20 用户：放在左下角「存活」那一条的上面）。
// 存活条里放一个；画面上没有存活条时，App 的 MadnessBrief 在左上角放一个（.loose）。点了发事件，MadnessBrief 打开须知卡。
export const MAD_OPEN = 'botc-mad-brief-open';

export function MadChip({ me, loose = false }) {
  if (!me?.madness) return null;
  return (
    <button type="button" className={`mad-chip${loose ? ' loose' : ''}${me.mic && !me.micOn ? ' warn' : ''}`} onClick={() => window.dispatchEvent(new Event(MAD_OPEN))} title="被洗脑的注意事项">
      <span className="mad-chip-dot" aria-hidden="true" />你被洗脑了：你是<b>{me.madness.role}</b><span className="mad-chip-more">须知</span>
    </button>
  );
}
