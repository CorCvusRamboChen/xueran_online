// 设置面板：总音量和音乐 / 环境声 / 音效 / 播报四路，各一根滑条（存在本机，见 mixer.js），松手时放一声试听；
// 下面是显示：字号（文字多的界面整体放大缩小，见 display.js）。Discord 活动里最后还有「在浏览器打开」（见 connect.js）。
import { useEffect, useRef, useState } from 'react';
import { CHANNELS, rawLevel, setLevel, onMix } from './mixer.js';
import { knock, wolfHowl } from './world/footsteps.js';
import { speak } from './voice.js';
import { SCALES, AVATAR_MODES, AVATAR_3D_ON, getDisplay, setDisplay, onDisplay, avatarMode } from './display.js';
import { inDiscord, openInBrowser } from './connect.js';

const PREVIEW = {
  master: () => knock(0.8),
  sfx: () => knock(0.8),
  ambient: () => wolfHowl(0.2),
  voice: () => speak('这是播报的音量。'),
};

export function VolumePanel({ onClose }) {
  const [, bump] = useState(0);
  useEffect(() => onMix(() => bump((x) => x + 1)), []);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.vol-btn')) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div className="vol-panel" ref={ref} role="dialog" aria-label="设置">
      <div className="vol-title">音量</div>
      {CHANNELS.map(([id, name, hint]) => {
        const v = Math.round(rawLevel(id) * 100);
        return (
          <label key={id} className={`vol-row ${id === 'master' ? 'master' : ''}`} title={hint}>
            <span className="vol-name">{name}<small>{hint}</small></span>
            <input type="range" min="0" max="100" step="5" value={v} style={{ '--v': `${v}%` }}
              onChange={(e) => setLevel(id, Number(e.target.value) / 100)}
              onPointerUp={() => PREVIEW[id]?.()} onKeyUp={() => PREVIEW[id]?.()} aria-label={`${name}音量`} />
            <b className="vol-num">{v === 0 ? '静音' : v}</b>
          </label>
        );
      })}
      <DisplaySettings />
      {inDiscord && <BrowserLink />}
    </div>
  );
}

/** 手机上 Discord 活动的窗口小、容易卡：拿一条自己的链接去系统浏览器里玩，语音还在 Discord 里。 */
function BrowserLink() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="disp">
      <div className="vol-title">在浏览器里玩</div>
      <p className="vol-note">手机上画面太小或卡顿时用：在系统浏览器里打开，还是你、还是这一局。语音继续在 Discord 里聊，别退出语音频道。链接只属于你，别发给别人。</p>
      <button type="button" className="btn btn-secondary vol-browser" disabled={busy}
        onClick={async () => { setBusy(true); setMsg(await openInBrowser()); setBusy(false); }}>在浏览器打开</button>
      {msg && <p className="vol-note">{msg}</p>}
    </div>
  );
}

function DisplaySettings() {
  const [d, setD] = useState(getDisplay());
  useEffect(() => onDisplay(setD), []);
  return (
    <div className="disp">
      <div className="vol-title">显示</div>
      <div className="disp-row">
        <span className="vol-name">字号</span>
        <div className="disp-seg">
          {SCALES.map((k) => (
            <button key={k} type="button" className={d.scale === k ? 'on' : ''} onClick={() => setDisplay({ scale: k })} title={`${Math.round(k * 100)}%`}>{Math.round(k * 100)}</button>
          ))}
        </div>
      </div>
      {AVATAR_3D_ON && <div className="disp-row">
        <span className="vol-name">模型<small>地图上的小人。3D 实时：动作顺滑、转身连续，比较费显卡；3D 预渲染：每个动作几帧图，省一点；2D：原来的线稿小人，最省</small></span>
        <div className="disp-seg">
          {AVATAR_MODES.map(([k, label]) => (
            <button key={k} type="button" className={avatarMode() === k ? 'on' : ''} onClick={() => setDisplay({ avatars: k })}>{label}</button>
          ))}
        </div>
      </div>}
    </div>
  );
}


/** 一个「音量」按钮，点开上面的面板。 */
export function VolumeButton({ className = '', label = '设置' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="vol-wrap">
      <button type="button" className={`vol-btn ${className} ${open ? 'on' : ''}`} onClick={() => setOpen((x) => !x)} title="音量和字号">{label}</button>
      {open && <VolumePanel onClose={() => setOpen(false)} />}
    </span>
  );
}
