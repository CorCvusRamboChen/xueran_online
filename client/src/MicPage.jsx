// 收音页：被洗脑的玩家在普通浏览器里打开（Discord 活动里拿不到麦克风）。?mic=令牌
// 只收这台设备的麦克风，一句话说完才上传；令牌当天黄昏失效。
import { useEffect, useRef, useState } from 'react';
import { Segmenter, downsample, encodeWav } from './micAudio.js';

const BACKLOG = 4; // 转写跟不上时最多排这么多句，再多就丢最早的
const SHOWN = 12;

// AudioWorklet 要从地址加载，写成 Blob 不用多一个静态文件
const WORKLET = `registerProcessor('mic-tap', class extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0]?.[0]; if (c) this.port.postMessage(c.slice(0)); return true; }
});`;

const COPY = {
  ready: ['准备好了', '点下面的按钮，浏览器会问你要不要用麦克风。'],
  starting: ['正在打开麦克风', '如果浏览器弹出提示，请点「允许」。'],
  on: ['正在收音', '开口说话就行。切到别的应用前，先确认这一页不会被系统暂停。'],
  lost: ['麦克风断开了', '通常是切到后台时被系统暂停了。回到这一页，点下面的按钮接着收。'],
  denied: ['没有麦克风权限', '在浏览器地址栏旁边允许使用麦克风，再点一次。'],
  unsupported: ['这个浏览器收不了音', '请换电脑上的 Chrome 或 Edge 打开这个链接。'],
  stopped: ['已经停止', '想继续就再点一次。'],
  expired: ['这个链接已经失效', '收音只在当天白天有效，天黑以后就不再收了。'],
  checking: ['正在确认链接', ''],
};

/**
 * 疯狂的定义（2026-11-12 用户：要写清楚是「真心实意」，不能暗示、不能故意聊爆）。官方：尽最大努力让别人相信，暗示自己疯狂了就等于没有疯狂。
 * about：服务器说他是哪种疯狂。
 */
function MadnessRule({ about }) {
  if (about.kind === 'mutant') {
    return (
      <section className="mic-rule" aria-label="疯狂是什么">
        <h2>你的疯狂：不是外来者</h2>
        <p>你是畸形秀演员。你要<b>真心实意地让大家相信你不是外来者</b>。</p>
        <p>说自己是外来者（或者说自己是紫色、不是三原色）、暗示自己是外来者、故意说漏让别人猜到，都可能被当场处决。</p>
      </section>
    );
  }
  if (about.kind === 'listen') {
    return (
      <section className="mic-rule" aria-label="为什么收音">
        <h2>说书人在听</h2>
        <p>这个剧本里有<b>灵言师</b>：他知道一个关键词，第一个说出这个词的善良玩家当晚会变成邪恶。说书人要听大家说的话才知道是谁说了。</p>
        <p>正常聊天就好。音频只在这台服务器上转成文字，不保存，文字到黄昏就清掉。</p>
      </section>
    );
  }
  if (about.kind === 'pixie') {
    return (
      <section className="mic-rule" aria-label="小精灵">
        <h2>你是小精灵：可以疯狂地证明你是{about.role}</h2>
        <p>如果你<b>真心实意、尽最大努力</b>让大家相信你就是<b>{about.role}</b>，等真正的{about.role}死了，你会获得他的能力。不证明也不会被罚，只是拿不到能力。</p>
      </section>
    );
  }
  const who = about.kind === 'madness' ? <b>{about.role}</b> : '那个角色';
  return (
    <section className="mic-rule" aria-label="疯狂是什么">
      <h2>{about.kind === 'madness' ? <>你的疯狂：你是{about.role}</> : '疯狂是什么'}</h2>
      <p>你要<b>真心实意、尽最大努力</b>让大家相信你就是{who}：给理由、讲你拿到的信息和做过的事、回应别人的质疑、一直坚持这个说法。</p>
      <p>下面这些都算没有疯狂，可能被处决：只干巴巴说一句就转去聊别的；阴阳怪气、敷衍、故意演砸、笑场；暗示自己是被逼的（「懂的都懂」「我只能说我是……」「你们自己理解」）；故意聊爆、说出自己真正的角色。</p>
    </section>
  );
}

export default function MicPage({ token }) {
  const [state, setState] = useState('checking');
  const [about, setAbout] = useState({});
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [far, setFar] = useState(0); // 比他自己说话小很多、当成远处扬声器的声音没上传的句数
  const live = useRef(null);
  const queue = useRef([]);
  const sending = useRef(false);

  const shut = () => {
    const l = live.current;
    live.current = null;
    if (!l) return;
    l.segmenter.flush();
    l.stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    l.ctx.close().catch(() => {});
    l.lock?.release().catch(() => {});
  };

  const pump = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (queue.current.length) {
        const body = queue.current.shift();
        const r = await fetch(`/api/mic/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body }).catch(() => null);
        if (r?.status === 410) { queue.current = []; shut(); setState('expired'); return; }
        if (!r?.ok) { setError('这一句没有传上去，继续说就行。'); continue; }
        setError('');
        const { text } = await r.json();
        if (text) setLines((x) => [...x, text].slice(-SHOWN));
      }
    } finally {
      sending.current = false;
    }
  };

  const start = async () => {
    if (live.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) { setState('unsupported'); return; }
    setState('starting');
    try {
      // 不开自动增益：要靠音量分出「他自己凑近麦克风说的」和「扬声器里放出来的别人的声音」，增益会把远处的也拉响（2026-11-12：没戴耳机会录到全场）
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      const ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const segmenter = new Segmenter((samples) => {
        queue.current.push(encodeWav(samples));
        if (queue.current.length > BACKLOG) queue.current.shift();
        pump();
      }, { onFar: () => setFar((n) => n + 1) });
      const tap = new AudioWorkletNode(ctx, 'mic-tap');
      tap.port.onmessage = (e) => segmenter.push(downsample(e.data, ctx.sampleRate));
      ctx.createMediaStreamSource(stream).connect(tap);
      await ctx.resume();
      const lock = await navigator.wakeLock?.request('screen').catch(() => null);
      live.current = { stream, ctx, segmenter, lock };
      stream.getAudioTracks()[0].onended = () => { shut(); setState('lost'); };
      setState('on');
    } catch (e) {
      shut();
      setState(e?.name === 'NotAllowedError' ? 'denied' : 'lost');
    }
  };

  useEffect(() => {
    fetch(`/api/mic/${encodeURIComponent(token)}`)
      .then(async (r) => { setState(r.ok ? 'ready' : 'expired'); if (r.status === 200) setAbout(await r.json().catch(() => ({}))); })
      .catch(() => setState('expired'));
    return shut;
  }, [token]);

  const [title, text] = COPY[state];
  const canStart = ['ready', 'lost', 'denied', 'stopped'].includes(state);
  return (
    <main className="mic-page">
      <p className="mic-eyebrow">疯狂 · 收音</p>
      <h1 className={state === 'on' ? 'mic-on' : ''}>{title}</h1>
      {text && <p className="mic-lead">{text}</p>}
      {canStart && <button type="button" className="mic-btn" onClick={start}>{state === 'ready' ? '开始收音' : '重新开始'}</button>}
      {state === 'on' && <button type="button" className="mic-btn mic-btn-off" onClick={() => { shut(); setState('stopped'); }}>停止收音</button>}
      {error && <p className="mic-error" role="alert">{error}</p>}
      {state === 'on' && far > 0 && <p className="mic-lead">有 {far} 句声音比你说话小很多，当成别人的声音没有上传。没戴耳机的话，最好戴上。</p>}
      {state !== 'expired' && state !== 'checking' && <MadnessRule about={about} />}
      {state !== 'expired' && (
        <ul className="mic-rules">
          <li>只收这台设备的麦克风，请戴耳机，不然会录到别人的声音。</li>
          <li>音频不保存，转成文字后发给 AI 说书人判断，当天黄昏清掉。</li>
          {about.kind !== 'mutant' && <li>不开也能继续玩，但说书人听不到你，很可能判你不够疯狂。</li>}
          <li>说书人一直在听：说漏嘴（被洗脑的）、说服别人自己是外来者（畸形秀演员），都可能当场被处决。</li>
        </ul>
      )}
      {lines.length > 0 && (
        <section className="mic-heard" aria-label="说书人听到的话">
          <h2>说书人听到的话</h2>
          {lines.map((x, i) => <p key={i}>{x}</p>)}
        </section>
      )}
    </main>
  );
}
