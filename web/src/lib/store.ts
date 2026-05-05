// Tiny app-wide state via @preact/signals. Each route reads what it
// needs; the WS layer publishes into liveStats/connectionStatus.

import { signal } from '@preact/signals';
import type { DeviceStatus } from './api';

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
