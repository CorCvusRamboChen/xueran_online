// 第一次打开、系统语言又不是中文：大厅标题下面提示一句「有英文版」（2026-11-20 英文版）。
// 选过语言（点了切换或关掉）就不再出现。这里的字故意只写英文：看到它的人多半不读中文。
import { useState } from 'react';
import { LANG, langChosen, switchLang } from './i18n.js';

const foreign = typeof navigator !== 'undefined' && !/^zh/i.test(navigator.language || '');

export function LangHint() {
  const [open, setOpen] = useState(LANG === 'zh' && !langChosen && foreign);
  if (!open) return null;
  const stay = () => { try { localStorage.setItem('botc-lang', 'zh'); } catch { /* 隐私模式 */ } setOpen(false); };
  return (
    <div className="lang-hint" lang="en">
      <span>This game is also available in English.</span>
      <button type="button" className="btn btn-secondary" onClick={() => switchLang('en')}>Switch to English</button>
      <button type="button" className="lang-hint-x" onClick={stay} aria-label="Dismiss">×</button>
    </div>
  );
}
