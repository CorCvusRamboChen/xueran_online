// 意见箱（2026-11-20 用户：首页「设置」下面加「反馈」，照 Cromma 的意见箱做）：
// 四栏看板——已提议 / 已接管 / 已解决 / 已搁置，每一条都看得到；谁都能「提议」（分 Bug、新功能请求、已有功能意见，可以贴截图）。
// 管理员（服务器的 BOTC_ADMINS）在卡片上接管、解决、搁置，写一句回复和版本号。数据走房间的 feedback 操作（服务器 feedback.js）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const KINDS = [['bug', 'Bug'], ['feature', '新功能请求'], ['opinion', '已有功能意见']];
const KIND = Object.fromEntries(KINDS);
const COLS = [
  ['open', '已提议', '◌'],
  ['taken', '已接管', '⚡'],
  ['done', '已解决', '✓'],
  ['shelved', '已搁置', '⊘'],
];

/** 「3 分钟前」「7 小时前」「2 天前」。 */
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/** 截图压一压：最长边 1280，转成 JPEG（太大就再降质量），返回 data URL。 */
async function shrink(file) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  for (const q of [0.85, 0.7, 0.55, 0.4]) { const u = c.toDataURL('image/jpeg', q); if (u.length * 0.75 < 650_000) return u; }
  return c.toDataURL('image/jpeg', 0.3);
}

const Avatar = ({ by }) => (by?.avatar ? <img className="fb-av" src={by.avatar} alt="" /> : <span className="fb-av fb-av-none">{[...(by?.name ?? '?')][0]}</span>);

/** 一张卡片：编号、类型、多久以前、内容、截图、谁提的；处理过的带回复、版本号和状态。管理员多一排按钮。 */
function Card({ it, admin, onSet, onZoom }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(it.note ?? '');
  const [ver, setVer] = useState(it.version ?? '');
  const go = (status) => { onSet({ id: it.id, status, note, version: ver }); setEdit(false); };
  return (
    <article className={`fb-card fb-${it.status}`}>
      <header><span className="fb-no">#{it.id}</span><span className={`fb-kind k-${it.kind}`}>{KIND[it.kind]}</span><span className="fb-ago">{ago(it.at)}</span></header>
      <p className="fb-text">{it.text}</p>
      {it.images?.length > 0 && <div className="fb-imgs">{it.images.map((n) => <button key={n} type="button" onClick={() => onZoom(`/api/feedback/img/${n}`)}><img src={`/api/feedback/img/${n}`} alt="截图" loading="lazy" /></button>)}</div>}
      {it.status === 'taken' && it.handler && <p className="fb-take">{it.handler.name} 接管</p>}
      {it.note && <p className="fb-note">{it.version && it.status === 'done' ? `${it.version} ` : ''}{it.note}</p>}
      <footer>
        <span className="fb-by"><Avatar by={it.by} />{it.by?.name}</span>
        {it.status === 'done' && <span className="fb-ver">✓ {it.version || '已解决'}</span>}
        {it.status === 'shelved' && <span className="fb-shelf">⊘ 已搁置</span>}
        {it.status === 'taken' && <span className="fb-taken">⚡</span>}
      </footer>
      {admin && (edit ? (
        <div className="fb-admin">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="回复（会显示在卡片上）" rows={2} maxLength={300} />
          <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder="版本号（解决时显示，比如 v1.2）" maxLength={20} />
          <div className="fb-admin-btns">
            {[['taken', '接管'], ['done', '解决'], ['shelved', '搁置'], ['open', '退回']].filter(([k]) => k !== it.status).map(([k, label]) => <button key={k} type="button" onClick={() => go(k)}>{label}</button>)}
            <button type="button" onClick={() => onSet({ id: it.id, note, version: ver })}>只改回复</button>
            <button type="button" onClick={() => setEdit(false)}>取消</button>
          </div>
        </div>
      ) : <button type="button" className="fb-admin-open" onClick={() => setEdit(true)}>处理</button>)}
    </article>
  );
}

/** 「提议」的表单：类型、内容、最多 3 张截图（可以粘贴）。 */
function Compose({ onSubmit, onClose }) {
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [imgs, setImgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const addFiles = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type)).slice(0, 3 - imgs.length);
    const urls = await Promise.all(list.map((f) => shrink(f).catch(() => null)));
    setImgs((cur) => [...cur, ...urls.filter(Boolean)].slice(0, 3));
  };
  const send = async () => { setBusy(true); const ok = await onSubmit({ kind, text, images: imgs }); setBusy(false); if (ok) onClose(); };
  return (
    <div className="fb-compose" onPaste={(e) => addFiles(e.clipboardData?.files ?? [])}>
      <h4>提一条意见</h4>
      <div className="fb-kinds">{KINDS.map(([k, label]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{label}</button>)}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={800} autoFocus
        placeholder={kind === 'bug' ? '哪里出错了？在哪个剧本、哪一步、看到了什么（可以直接粘贴截图）' : kind === 'feature' ? '想要什么新功能？为什么需要它' : '对现有的哪个功能有意见？希望怎么改'} />
      <div className="fb-shots">
        {imgs.map((u, i) => <span key={i} className="fb-shot"><img src={u} alt="" /><button type="button" onClick={() => setImgs(imgs.filter((_, k) => k !== i))} aria-label="删掉这张">×</button></span>)}
        {imgs.length < 3 && <button type="button" className="fb-addshot" onClick={() => file.current?.click()}>＋ 截图</button>}
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="fb-compose-btns">
        <span className="muted">{[...text].length}/800 · 截图可以直接粘贴</span>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" className="primary" disabled={busy || !text.trim()} onClick={send}>{busy ? '提交中……' : '提交'}</button>
      </div>
    </div>
  );
}

/** 整个意见箱（全屏弹层）。ask：房间操作，返回服务器的完整回复。 */
export function FeedbackBoard({ ask, toast, onClose }) {
  const [items, setItems] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [compose, setCompose] = useState(false);
  const [zoom, setZoom] = useState(null);
  const take = (r) => { if (r?.ok) { setItems(r.items ?? []); setAdmin(!!r.admin); if (r.notice) toast?.(r.notice); } else toast?.(r?.error ?? '没连上'); return !!r?.ok; };
  useEffect(() => { ask('feedback', { op: 'list' }).then(take); }, []);
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') (zoom ? setZoom(null) : compose ? setCompose(false) : onClose()); }; addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [zoom, compose]);
  const submit = async (p) => take(await ask('feedback', { op: 'add', ...p }));
  const set = async (p) => take(await ask('feedback', { op: 'set', ...p }));
  return createPortal(
    <div className="fb-modal" role="dialog" aria-label="意见箱">
      <div className="fb-box">
        <header className="fb-head">
          <div><h3>💡 意见箱</h3><p className="muted">每一条都会被看见。被接管、被解决，都会出现在这里。</p></div>
          <button type="button" className="fb-new" onClick={() => setCompose(true)}>✎ 提议</button>
          <button type="button" className="fb-close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        {items == null ? <p className="muted fb-loading">正在打开意见箱……</p> : (
          <div className="fb-cols">
            {COLS.map(([k, label, icon]) => {
              const list = items.filter((x) => x.status === k);
              return (
                <section key={k} className={`fb-col c-${k}`}>
                  <h4><span>{icon} {label}</span><span className="muted">{list.length}</span></h4>
                  <div className="fb-list">
                    {list.length ? list.map((it) => <Card key={it.id} it={it} admin={admin} onSet={set} onZoom={setZoom} />) : <p className="muted fb-empty">{k === 'open' ? '还没有人提，来当第一个吧。' : '暂时没有。'}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {compose && <div className="fb-compose-wrap" onClick={(e) => e.target === e.currentTarget && setCompose(false)}><Compose onSubmit={submit} onClose={() => setCompose(false)} /></div>}
        {zoom && <div className="fb-zoom" onClick={() => setZoom(null)}><img src={zoom} alt="截图" /></div>}
      </div>
    </div>,
    document.body,
  );
}
