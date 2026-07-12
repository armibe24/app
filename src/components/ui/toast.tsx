/* Minimal toast bus — one message at a time, auto-dismiss. */

import { useEffect, useState } from 'react';

interface ToastMsg { text: string; error?: boolean; id: number }

let nextId = 1;
const listeners = new Set<(m: ToastMsg) => void>();

export function toast(text: string, error = false): void {
  const m = { text, error, id: nextId++ };
  for (const fn of listeners) fn(m);
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = (m: ToastMsg) => {
      setMsg(m);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 3400);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return <div className={`toast${msg.error ? ' error' : ''}`}>{msg.text}</div>;
}
