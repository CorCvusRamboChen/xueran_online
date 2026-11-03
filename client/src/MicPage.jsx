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

export default function MicPage({ token }) {
  const [state, setState] = useState('checking');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const segmenter = new Segmenter((samples) => {
        queue.current.push(encodeWav(samples));
        if (queue.current.length > BACKLOG) queue.current.shift();
        pump();
      });
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
    fetch(`/api/mic/${encodeURIComponent(token)}`).then((r) => setState(r.ok ? 'ready' : 'expired')).catch(() => setState('expired'));
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
      {state !== 'expired' && (
        <ul className="mic-rules">
          <li>只收这台设备的麦克风，请戴耳机，不然会录到别人的声音。</li>
          <li>音频不保存，转成文字后发给 AI 说书人判断，当天黄昏清掉。</li>
          <li>不开也能继续玩，但说书人听不到你，只点「公开声明」不够，很可能判你不够疯狂。</li>
          <li>说书人一直在听：说漏嘴会先警告一次，再说漏就可能当场被处决。</li>
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
