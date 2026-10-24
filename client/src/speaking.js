// 谁正在语音里说话（Discord Embedded SDK 的 SPEAKING_START / SPEAKING_STOP）。
// 头像组件用 useSpeaking(id) 订阅自己那个人，说话时套绿框。
import { useEffect, useState } from 'react';

const on = new Set();
const subs = new Set(); // { id, fn }
const emit = (id) => { for (const s of subs) if (s.id === id || id == null) s.fn(); };

export function setSpeaking(id, v) {
  if (!id || on.has(id) === v) return;
  if (v) on.add(id); else on.delete(id);
  emit(id);
}
export function clearSpeaking() { on.clear(); emit(null); }

export function useSpeaking(id) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id) return undefined;
    const s = { id, fn: () => tick((x) => x + 1) };
    subs.add(s);
    return () => subs.delete(s);
  }, [id]);
  return !!id && on.has(id);
}
