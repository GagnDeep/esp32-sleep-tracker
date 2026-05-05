// Auto-reconnect WebSocket with exponential backoff. Pub/sub by event
// type. UI components subscribe via the `connected`, `sample`, `stage`,
// `alarm`, and `status` channels.

import { connectionStatus, liveStats } from './store';

type Listener<T> = (msg: T) => void;

export interface SampleEvent {
  type: 'sample';
  t: number; hr: number; spo2: number; act: number; stage: number; flags: number;
}
export interface StageEvent  { type: 'stage';  value: number; }
export interface AlarmEvent  { type: 'alarm';  kind: string; }
export interface StatusEvent { type: 'status'; value: string; }
export type WsEvent = SampleEvent | StageEvent | AlarmEvent | StatusEvent;

const listeners = new Map<WsEvent['type'], Set<Listener<WsEvent>>>();

export function subscribe<K extends WsEvent['type']>(
  type: K, fn: Listener<Extract<WsEvent, { type: K }>>,
): () => void {
  let set = listeners.get(type);
  if (!set) { set = new Set(); listeners.set(type, set); }
  const generic = fn as Listener<WsEvent>;
  set.add(generic);
  return () => set!.delete(generic);
}

let socket: WebSocket | null = null;
let backoff = 500;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let closed = false;

function dispatch(e: WsEvent) {
  switch (e.type) {
    case 'sample':
      liveStats.value = {
        hr: e.hr === 0xFFFF ? 0 : e.hr,
        spo2: e.spo2 === 0xFFFF ? 0 : e.spo2 / 10,
        activity: e.act,
        stage: e.stage,
        flags: e.flags,
        t: e.t,
      };
      break;
    case 'status':
      connectionStatus.value = e.value;
      break;
  }
  listeners.get(e.type)?.forEach(fn => fn(e));
}

export function connectWs() {
  closed = false;
  function open() {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.addEventListener('open', () => {
      backoff = 500;
      connectionStatus.value = 'connected';
    });
    socket.addEventListener('message', (ev) => {
      try {
        dispatch(JSON.parse(ev.data));
      } catch {
        // ignore malformed frames; keep the channel alive
      }
    });
    socket.addEventListener('close', () => {
      connectionStatus.value = 'disconnected';
      if (closed) return;
      retryTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 15_000);
    });
    socket.addEventListener('error', () => {
      // close handler will run reconnection
    });
  }
  open();
  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
