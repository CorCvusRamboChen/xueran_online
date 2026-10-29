// 登录 + WebSocket。在 Discord 里走 Embedded App SDK 授权；从 KOOK 机器人发的进入链接（?kt=门票）打开的走门票；
// 普通浏览器里走 DEV_LOGIN 测试模式。
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { setSpeaking, clearSpeaking } from './speaking.js';

let sdkRef = null;
let speakingIn = null;
const onSpeakStart = (e) => setSpeaking(e?.user_id, true);
const onSpeakStop = (e) => setSpeaking(e?.user_id, false);
/** 订阅某个语音频道的"谁在说话"。频道变了就换；失败（没授权 / 不是语音频道）就算了。 */
export async function listenSpeaking(channelId) {
  if (!sdkRef || !channelId || speakingIn === channelId) return;
  const prev = speakingIn;
  speakingIn = channelId;
  if (prev) {
    await sdkRef.unsubscribe('SPEAKING_START', onSpeakStart, { channel_id: prev }).catch(() => {});
    await sdkRef.unsubscribe('SPEAKING_STOP', onSpeakStop, { channel_id: prev }).catch(() => {});
    clearSpeaking();
  }
  try {
    await sdkRef.subscribe('SPEAKING_START', onSpeakStart, { channel_id: channelId });
    await sdkRef.subscribe('SPEAKING_STOP', onSpeakStop, { channel_id: channelId });
  } catch (e) {
    if (speakingIn === channelId) speakingIn = null;
    console.warn('[botc] 说话检测订阅失败', e?.message ?? e);
    report('说话检测订阅', e?.message ?? e);
  }
}

export const inDiscord = new URLSearchParams(location.search).has('frame_id');

/**
 * KOOK 进入链接里的门票（?kt=…）：存进这个标签页（刷新还在），再从地址栏去掉（截图、分享地址时不会带出去）。
 * 返回门票；不是从 KOOK 进来的返回 null。
 */
function kookTicket() {
  const KEY = 'botc-kook-ticket';
  try {
    const url = new URL(location.href);
    const kt = url.searchParams.get('kt');
    if (kt) {
      sessionStorage.setItem(KEY, kt);
      url.searchParams.delete('kt');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      return kt;
    }
    return sessionStorage.getItem(KEY);
  } catch { return null; }
}
export const fromKook = !inDiscord && !!kookTicket();

/** 把进入时卡住/出错的情况报给服务器日志（方便排查"卡在进入界面"）。 */
export function report(stage, error) {
  try {
    const body = JSON.stringify({ stage, error: String(error ?? '').slice(0, 300), ua: navigator.userAgent.slice(0, 160), t: Math.round(performance.now()) });
    if (!navigator.sendBeacon?.('/api/clientlog', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/clientlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* 报不出去就算了 */ }
}

const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}超时`)), ms))]);

/** 拿 JSON；网络错误或服务器 5xx（比如刚好在重启）自动重试几次。 */
async function getJson(url, opts, what) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await timeout(fetch(url, opts), 10_000, what);
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`${what}失败（服务器返回 ${r.status}）`); }
      if (r.status >= 500 && i < 3) throw new Error(data.error ?? `${what}失败（${r.status}）`);
      return data;
    } catch (e) {
      last = e;
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
  }
  throw last;
}

/** onStep(文字)：告诉界面现在走到哪一步了。 */
export async function login(onStep = () => {}) {
  let stage = '读取配置';
  let cfg;
  try {
    onStep('正在连上服务器……');
    cfg = await getJson('/api/config', undefined, '读取配置');
    if (inDiscord) {
      if (!cfg.clientId) throw new Error('服务器没配置 DISCORD_CLIENT_ID');
      stage = '连接 Discord';
      onStep('正在连接 Discord……');
      const sdk = new DiscordSDK(cfg.clientId);
      await timeout(sdk.ready(), 20_000, '连接 Discord ');
      stage = '授权';
      onStep('等待 Discord 授权……（如果弹出授权窗口，请点「授权」）');
      const auth = (scope) => timeout(sdk.commands.authorize({
        client_id: cfg.clientId, response_type: 'code', state: '', prompt: 'none', scope,
      }), 60_000, 'Discord 授权');
      const base = ['identify', 'guilds.members.read'];
      let code;
      // 多要一个"读取语音状态"（显示谁在说话）；Discord 不给就退回基本授权
      try { ({ code } = await auth([...base, 'rpc.voice.read'])); } catch (e) {
        report('授权（含说话检测）', e?.message ?? e);
        ({ code } = await auth(base));
      }
      stage = '换取登录凭证';
      onStep('正在登录……');
      const res = await getJson('/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      }, '登录');
      if (!res.access_token) throw new Error(res.error ?? '登录失败');
      stage = '确认身份';
      await timeout(sdk.commands.authenticate({ access_token: res.access_token }), 20_000, 'Discord 身份确认');
      onStep('正在走进这座小镇……');
      sdkRef = sdk;
      listenSpeaking(sdk.channelId);
      return { accessToken: res.access_token, guildId: sdk.guildId, channelId: sdk.channelId };
    }
  } catch (e) {
    report(stage, e?.message ?? e);
    throw e;
  }

  const kt = !inDiscord && kookTicket();
  if (kt) { onStep('正在走进这座小镇……'); return { kook: kt }; }
  if (!cfg.devLogin) throw new Error('请在 Discord 里打开这个活动；在 KOOK 里玩的话，在文字频道发「/血染」领取进入链接');
  // 测试模式：每个浏览器标签页是一个玩家（?name=小明&table=1）
  const q = new URLSearchParams(location.search);
  let id = q.get('id') || sessionStorage.getItem('botc-dev-id'); // ?id=xxx：截图/测试时指定身份
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('botc-dev-id', id); }
  // ?devRole=poisoner：开局时把这个角色换给自己（只在本地测试模式下生效）
  return { dev: { id, name: q.get('name') || `玩家${id.slice(0, 3)}`, table: q.get('table') || 'table', role: q.get('devRole') || null } };
}

export function openSocket(hello, { onState, onPos, onStatus, onUpdate }) {
  let build = null;
  let ws;
  let seq = 0;
  const pending = new Map();
  let queue = [];

  const send = (msg) => new Promise((resolve) => {
    const reqId = ++seq;
    pending.set(reqId, resolve);
    const raw = JSON.stringify({ ...msg, reqId });
    if (ws?.readyState === WebSocket.OPEN) ws.send(raw); else queue.push(raw);
  });

  const connect = () => {
    onStatus('connecting');
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
    ws.onopen = async () => {
      const r = await new Promise((resolve) => {
        const reqId = ++seq;
        pending.set(reqId, resolve);
        ws.send(JSON.stringify({ type: 'hello', ...hello, reqId }));
      });
      if (!r.ok) { report('进入房间', r.error); onStatus('error', r.error); return; }
      if (r.build) { if (build && r.build !== build && r.build !== 'dev') onUpdate?.(); build ??= r.build; }
      onStatus('online');
      for (const raw of queue) ws.send(raw);
      queue = [];
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') onState(m.state);
      else if (m.type === 'pos') onPos?.(m);
      else if (m.type === 'ack') { pending.get(m.reqId)?.(m); pending.delete(m.reqId); }
    };
    ws.onclose = () => {
      for (const resolve of pending.values()) resolve({ ok: false, error: '连接断开了' });
      pending.clear();
      onStatus('connecting');
      setTimeout(connect, 1500);
    };
  };
  connect();
  return {
    act: (action, payload) => send({ type: 'act', action, payload }),
    tutorial: (on) => send({ type: 'tutorial', on }),
  };
}
