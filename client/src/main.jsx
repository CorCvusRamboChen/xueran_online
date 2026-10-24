import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// 开屏动画（Intro.jsx）先关掉，以后要用再加回 <Intro />
import { CardGallery } from './AbilityCard.jsx';
import { PaintFilters } from './Town.jsx';
import { TilesPreview } from './world/TilesPreview.jsx';
import { TownGuide } from './world/TownGuide.jsx';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/900.css';
import '@fontsource/noto-sans-sc/900.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';

// ?preview=cards：能力牌预览页（看 Codex 的插画用）；?preview=tiles：地块图预览；?preview=town：小镇底稿
const preview = new URLSearchParams(location.search).get('preview');
const page = preview === 'cards' ? <><PaintFilters /><CardGallery /></> : preview === 'tiles' ? <TilesPreview /> : preview === 'town' ? <><PaintFilters /><TownGuide /></> : <App />;
createRoot(document.getElementById('root')).render(page);
