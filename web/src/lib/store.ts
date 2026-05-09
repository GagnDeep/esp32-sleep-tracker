// Tiny app-wide state via @preact/signals. Each route reads what it
// needs; the WS layer publishes into liveStats/connectionStatus.

import { signal, effect } from '@preact/signals';
import type { DeviceStatus, SessionSummary } from './api';

export interface LiveStats {
  hr: number;       // BPM (0 = invalid)
  spo2: number;     // % (0 = invalid)
  activity: number; // 0..1000
  stage: number;    // 0..3
  flags: number;
  t: number;        // ms since session start
}

export const liveStats = signal<LiveStats>({
  hr: 0, spo2: 0, activity: 0, stage: 0, flags: 0, t: 0,
});

export const connectionStatus = signal<string>('connecting');

export const deviceStatus = signal<DeviceStatus | null>(null);

// Coarse pulse animation tick — every detected beat the WS layer can
// flip this; the Live view binds to it for the heart-pulse effect.
export const heartTick = signal<number>(0);

// Counter incremented whenever the firmware reports it dropped a WS
// frame because a slow client backed up the queue. Surfaced subtly in
// the nav so the user knows when their network is the bottleneck.
export const wsDrops = signal<number>(0);

// 'connected' while the socket is open; 'connecting' during the very
// first dial; 'disconnected' between dials. The Live route renders a
// reconnect banner against this.
export type WsState = 'connected' | 'connecting' | 'disconnected';
export const wsState = signal<WsState>('connecting');

// Wall-clock time at which the next reconnect attempt is scheduled, or
// null when connected. The Live banner counts down against this.
export const wsRetryAt = signal<number | null>(null);

/** Current OTA progress (when an update is in flight). */
export interface OtaProgress {
  phase: 'idle' | 'downloading' | 'verifying' | 'applying' | 'rebooting' | 'failed';
  pct: number;             // 0-100
  bytes: number;           // bytes received so far
  bytesTotal: number;      // total bytes to receive (0 if unknown)
  bytesPerSec?: number;    // optional throughput
  errorMessage?: string;   // populated on phase === 'failed'
  /** Wall-clock ms when this update started, for ETA calc. */
  startedAt?: number;
  /** Wall-clock ms of the previous sample, for per-interval throughput calc. */
  sampledAt?: number;
}

export const otaProgress = signal<OtaProgress | null>(null);

/** Persistent goals (target_sleep_min, target_score). Phase A skeleton: defaults. */
export interface Goals {
  targetSleepMin: number;  // e.g. 480 (8h)
  targetScore: number;     // e.g. 80
}

const GOALS_KEY = 'goals.v1';
function readGoals(): Goals {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { targetSleepMin: 480, targetScore: 80 };
}
export const goals = signal<Goals>(readGoals());
effect(() => {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals.value)); } catch { /* ignore */ }
});

/** Last night's session summary (or null if none recorded). Used by Today screen. */
export const lastNightSummary = signal<SessionSummary | null>(null);

/**
 * Live HRV-coherence snapshot. Mirrors the firmware Snapshot shape from
 * dsp/Coherence.h. Updated every ~5 s by the WS dispatcher; null until
 * the first frame arrives.
 */
export interface LiveCoherence {
  ratio: number;
  score: number;       // 0..16
  level: 0 | 1 | 2;    // 0=Low, 1=Med, 2=High
  achievement: number; // cumulative
  dominantHz: number;
  sessionSec: number;
  /** Wall-clock ms when this update arrived from the device. */
  receivedAt: number;
}

export const liveCoherence = signal<LiveCoherence | null>(null);
