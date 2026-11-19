// 入口：先定好界面语言、英文下等英文词典装好，再加载整个界面（boot.jsx）。
// 模块里的常量（角色表、剧本说明）在加载时就按语言生成，所以词典必须在它们之前装好。
import { i18nReady } from './i18n.js';

i18nReady.then(() => import('./boot.jsx'));
