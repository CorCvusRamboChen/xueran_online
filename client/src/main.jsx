import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// 开屏动画（Intro.jsx）先关掉，以后要用再加回 <Intro />
import { CardGallery } from './AbilityCard.jsx';
import { PaintFilters } from './Town.jsx';
import { TilesPreview } from './world/TilesPreview.jsx';
import { TownGuide } from './world/TownGuide.jsx';
import { DoorKick, DemonKill } from './KillScenes.jsx';
import { LayoutEditor } from './world/LayoutEditor.jsx';
import { TutorialIntro } from './TutorialIntro.jsx';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/900.css';
import '@fontsource/noto-sans-sc/900.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';
import './display.js'; // 字号和深色 / 浅色主题：一打开就套上本机存的设置

// 滚动条平时隐形：哪块区域正在滚，就给它加 .scrolling 让滚动条淡出来，停下一会儿再藏起来（样式见 styles.css）
const scrollTimers = new WeakMap();
document.addEventListener('scroll', (e) => {
  const el = e.target === document ? document.documentElement : e.target;
  if (!el?.classList) return;
  el.classList.add('scrolling');
  clearTimeout(scrollTimers.get(el));
  scrollTimers.set(el, setTimeout(() => el.classList.remove('scrolling'), 900));
}, { capture: true, passive: true });

// ?preview=cards：能力牌预览页（看 Codex 的插画用）；?preview=tiles：地块图预览；?preview=town：小镇底稿；
// ?preview=intro&beat=4&t=3&acted=1：新手教程开场停在某一段的某一秒（beat 从 0 数）；不带 t 就正常播放
// ?preview=doorkick：受害者被破门的过场（调 QTE 手感用，点一下页面才有声音）；?preview=demonkill：恶魔进屋杀人那段；?preview=layout：黯月初升房子摆放编辑器
const preview = new URLSearchParams(location.search).get('preview');
const page = preview === 'cards' ? <><PaintFilters /><CardGallery /></> : preview === 'tiles' ? <TilesPreview /> : preview === 'town' ? <><PaintFilters /><TownGuide /></>
  : preview === 'doorkick' ? <div className="scene" style={{ position: 'relative', height: '100vh' }}><DoorKick key={Date.now()} /></div>
  : preview === 'layout' ? <LayoutEditor />
  : preview === 'intro' ? <IntroPreview />
  : preview === 'demonkill' ? <div className="scene" style={{ position: 'relative', height: '100vh' }}><DemonKill victim={{ id: 'v', name: '受害者' }} roleId="imp" onDone={() => location.reload()} /></div> : <App />;
function IntroPreview() {
  const q = new URLSearchParams(location.search);
  const freeze = q.has('t') ? { beat: Number(q.get('beat') ?? 0), t: Number(q.get('t')), acted: q.get('acted') === '1' } : null;
  return <TutorialIntro freeze={freeze} onStart={() => location.reload()} onClose={() => location.reload()} />;
}
createRoot(document.getElementById('root')).render(page);
