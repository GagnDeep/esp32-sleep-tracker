// Auto-reconnect WebSocket with jittered exponential backoff. Pub/sub
// by event type. UI components subscribe via the `connected`, `sample`,
// `stage`, `alarm`, `status`, and `drops` channels.

import {
  connectionStatus,
  liveCoherence,
  liveStats,
  otaProgress,
  type OtaProgress,
  wsDrops,
  wsRetryAt,
  wsState,
} from './store';

type Listener<T> = (msg: T) => void;

export interface SampleEvent {
  type: 'sample';
  t: number; hr: number; spo2: number; act: number; stage: number; flags: number;
}
export interface StageEvent  { type: 'stage';  value: number; }
export interface AlarmEvent  { type: 'alarm';  kind: string; }
export interface StatusEvent { type: 'status'; value: string; }
export interface DropsEvent  { type: 'drops';  count: number; }
export interface OtaProgressEvent {
  type: 'ota_progress';
  phase?: string;
  pct?: number;
  bytes?: number;
  bytes_total?: number;
  error_message?: string;
}
export interface CoherenceEvent {
  type: 'coherence';
  ratio: number;
  score: number;
  level: 0 | 1 | 2;
  ach: number;
  f0: number;
  sec: number;
}
export type WsEvent =
  | SampleEvent | StageEvent | AlarmEvent
  | StatusEvent | DropsEvent | OtaProgressEvent
  | CoherenceEvent;

const listeners = new Map<WsEvent['type'], Set<Listener<WsEvent>>>();

export function subscribe<K extends WsEvent['type']>(
  type: K, fn: Listener<Extract<WsEvent, { type: K }>>,
): () => void {
  let set = listeners.get(type);
  if (!set) { set = new Set(); listeners.set(type, set); }
  const generic = fn as Listener<WsEvent>;
  set.add(generic);
  return () => {
    const s = listeners.get(type);
    if (!s) return;
    s.delete(generic);
    // Reclaim the Map slot once the last listener is gone so long-lived
    // pages don't leak empty Sets indefinitely.
    if (s.size === 0) listeners.delete(type);
  };
}

// Test-only inspection helpers. Not part of the public surface; we
// keep them out of the runtime path so they cost nothing in
// production but let unit tests assert that unsubscribe really frees
// the Map slot rather than leaking an empty Set.
export const __test = {
  listenerTypeCount(): number {
    return listeners.size;
  },
  hasType(type: WsEvent['type']): boolean {
    return listeners.has(type);
  },
  dispatch(e: WsEvent): void {
    handleWsMessage(e);
  },
};

let socket: WebSocket | null = null;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let closed = false;

function nextBackoffMs(n: number): number {
  // Exponential: 500ms, 1s, 2s, 4s, 8s, 15s (cap), with ±30% jitter.
  const base = Math.min(15_000, 500 * Math.pow(2, n));
  const jitter = (Math.random() * 0.6 - 0.3) * base; // ±30%
  return Math.max(0, Math.round(base + jitter));
}

/** Exported so unit tests can drive the dispatcher without a real socket. */
export function handleWsMessage(e: WsEvent): void {
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
    case 'coherence':
      liveCoherence.value = {
        ratio:       e.ratio,
        score:       e.score,
        level:       e.level,
        achievement: e.ach,
        dominantHz:  e.f0,
        sessionSec:  e.sec,
        receivedAt:  Date.now(),
      };
      break;
    case 'drops':
      wsDrops.value = e.count;
      break;
    case 'ota_progress': {
      const prev = otaProgress.value;
      const next: OtaProgress = {
        phase: (e.phase as OtaProgress['phase']) ?? 'downloading',
        pct: typeof e.pct === 'number' ? e.pct : 0,
        bytes: typeof e.bytes === 'number' ? e.bytes : 0,
        bytesTotal: typeof e.bytes_total === 'number' ? e.bytes_total : 0,
        errorMessage: e.error_message,
        startedAt: prev?.startedAt ?? Date.now(),
        sampledAt: Date.now(),
      };
      // Compute throughput from prev sample using per-interval dt, never negative.
      if (prev && next.bytes > prev.bytes && prev.sampledAt) {
        const dtSec = (Date.now() - prev.sampledAt) / 1000;
        if (dtSec > 0.5) {
          next.bytesPerSec = (next.bytes - prev.bytes) / dtSec;
        } else {
          next.bytesPerSec = prev.bytesPerSec;
        }
      }
      otaProgress.value = next;
      break;
    }
  }
  listeners.get(e.type)?.forEach(fn => fn(e));
}

export function connectWs() {
  closed = false;
  function open() {
    if (closed) return;
    wsState.value = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.addEventListener('open', () => {
      attempt = 0;
      wsState.value = 'connected';
      wsRetryAt.value = null;
      connectionStatus.value = 'connected';
    });
    socket.addEventListener('message', (ev) => {
      try {
        handleWsMessage(JSON.parse(ev.data));
      } catch {
        // ignore malformed frames; keep the channel alive
      }
    });
    socket.addEventListener('close', () => {
      wsState.value = 'disconnected';
      connectionStatus.value = 'disconnected';
      if (closed) return;
      const delay = nextBackoffMs(attempt++);
      wsRetryAt.value = Date.now() + delay;
      retryTimer = setTimeout(open, delay);
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
      wsRetryAt.value = null;
    },
  };
}
