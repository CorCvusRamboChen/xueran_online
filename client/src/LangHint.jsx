// 语言是按浏览器自动选的（没手动选过）：大厅标题下面用另一种语言提示一句，点一下换过去；关掉就记住现在的语言。
// - 自动成了英文（浏览器里没有中文）：用中文提示「切换到中文」，给用英文系统的中文玩家
// - 自动成了中文、但浏览器第一语言不是中文：用英文提示有英文版
// 文字放在 i18n.js（不经过翻译插件），这里只有英文和变量，不会被翻掉。
import { useState } from 'react';
import { LANG, LANG_HINT, langChosen, browserZhFirst, switchLang } from './i18n.js';

export function LangHint() {
  const [open, setOpen] = useState(!langChosen && (LANG === 'en' || !browserZhFirst));
  if (!open) return null;
  const h = LANG_HINT[LANG];
  const stay = () => { try { localStorage.setItem('botc-lang', LANG); } catch { /* 隐私模式 */ } setOpen(false); };
  return (
    <div className="lang-hint" lang={h.lang}>
      <span>{h.text}</span>
      <button type="button" className="btn btn-secondary" onClick={() => switchLang(h.to)}>{h.btn}</button>
      <button type="button" className="lang-hint-x" onClick={stay} aria-label="×">×</button>
    </div>
  );
}
