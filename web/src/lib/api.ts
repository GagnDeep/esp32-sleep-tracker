// Typed wrappers for every REST endpoint. Types mirror the firmware
// schemas; if you change the wire format on either side, change both.

import { headers as authHeaders, pinRequired } from './auth';

export interface DeviceStatus {
  device_name: string;
  firmware_version: string;
  wifi_ssid: string;
  wifi_rssi: number;
  ip: string;
  free_heap: number;
  uptime_s: number;
  time_synced: boolean;
  epoch: number;
  sd_mounted: boolean;
  sd_healthy: boolean;
  lfs_free_bytes: number;
  session_active: boolean;
  session_id: string;
  live: { hr: number; spo2_x10: number; activity: number; stage: number; flags: number };
  calibration_nights_done: number;
}

export interface SessionSummary {
  id: string;
  started_at?: string;
  ended_at?: string;
  duration_s?: number;
  hr_min?: number; hr_avg?: number; hr_max?: number;
  spo2_min_x10?: number; spo2_avg_x10?: number;
  time_in_stage?: [number, number, number, number];
  sleep_score?: number;
  crashed?: boolean;
  firmware_version?: string;
  // Schema v2 additions — all optional so v1 sidecars still parse.
  schema_version?: number;
  started_at_unix?: number;
  ended_at_unix?: number;
  tz_offset_min?: number;
  hrv_rmssd?: number;
  tags?: string[];
  notes?: string;
  sample_format_version?: number;
}

export interface Sample {
  t_ms: number;
  hr_bpm: number;       // 0xFFFF = invalid
  spo2_x10: number;     // 0xFFFF = invalid
  activity: number;
  stage: number;        // 0=unknown,1=awake,2=light,3=deep
  flags: number;
}

export interface SettingsBody {
  device_name: string;
  timezone: string;
  alarm_enabled: boolean;
  alarm_start_min: number;
  alarm_end_min: number;
  alarm_days: number;
  spo2_low_x10: number;
  spo2_sustain_s: number;
  led_brightness: number;
  spo2_cal_a: number;
  spo2_cal_b: number;
  thresh_motion: number;
  thresh_still: number;
  baseline_nights: number;
  user_baseline_rmssd: number;
  // Seconds over which the alarm volume ramps from quiet to full —
  // 0 = abrupt, up to ~60 s for a gentler wake. Optional so older
  // firmware that doesn't report it still parses cleanly.
  volume_ramp_s?: number;
  // PIN write-only; firmware never returns the plaintext but reports
  // whether one is set via `pin_set` on the extended endpoint.
  pin?: string;
  pin_set?: boolean;
}

export interface WifiNetwork {
  ssid: string;
  rssi: number;
  enc: string;
}

export interface AlarmPreview {
  next_fire_unix: number | null;
  would_fire_in_s: number | null;
  reason: string;
}

export interface SessionPatch {
  tags?: string[];
  notes?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---------------------------------------------------------------------------
// 401 re-queue (bug #5)
// When a non-GET request receives a 401 the caller's promise is parked here
// instead of being dropped. The auth flow must call replayPendingRequest()
// after a successful PIN unlock so the original promise resolves with the
// replayed response.
//
// TODO(A2-followup): call replayPendingRequest() from auth.ts after a
// successful PIN unlock (e.g. after pin.value is set and pinRequired is
// cleared). Import it as:
//   import { replayPendingRequest } from './api';
// and invoke it right after `pinRequired.value = false`.
// ---------------------------------------------------------------------------
interface PendingReplay {
  resolve: (r: Response) => void;
  reject: (e: Error) => void;
  redo: () => Promise<Response>;
}
let pendingReplay: PendingReplay | null = null;

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

function buildSignal(extra?: AbortSignal): AbortSignal {
  // Compose a 10s timeout with any caller-supplied signal. AbortSignal
  // .any/.timeout are supported in evergreen browsers; if missing, fall
  // back to a manual setTimeout abort.
  type AnyFn = (signals: AbortSignal[]) => AbortSignal;
  const anySig = (AbortSignal as unknown as { any?: AnyFn }).any;
  const timeoutSig = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof timeoutSig === 'function' && typeof anySig === 'function') {
    const t = timeoutSig(TIMEOUT_MS);
    return extra ? anySig([t, extra]) : t;
  }
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  if (extra) extra.addEventListener('abort', () => ctl.abort(), { once: true });
  // Best-effort cleanup; the controller goes out of scope after the
  // fetch resolves either way.
  ctl.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
  return ctl.signal;
}

async function rawFetch(path: string, init: RequestInit | undefined): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    headers: {
      'Accept': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
    signal: buildSignal(init?.signal ?? undefined),
  };
  return fetch(path, merged);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, init);
  } catch (err) {
    // Network/timeout — retry once after a short delay.
    await sleep(RETRY_DELAY_MS);
    res = await rawFetch(path, init);
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} ${path}`);
    void err;
  }
  // Single retry on 5xx — server hiccups are common during firmware
  // boot or long save-to-flash; 4xx are the caller's problem.
  if (res.status >= 500 && res.status < 600) {
    await sleep(RETRY_DELAY_MS);
    res = await rawFetch(path, init);
  }
  if (res.status === 401) {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      // Park the request so replayPendingRequest() can resume it after unlock.
      // Only one pending replay is tracked at a time — overwrite if a second
      // 401 arrives (the user is unlocking once anyway).
      return new Promise<T>((resolve, reject) => {
        pendingReplay = {
          resolve: (r: Response) => {
            // Re-parse the replayed response the same way request<T> would.
            if (r.status === 204) { resolve(undefined as unknown as T); return; }
            r.text().then((text) => {
              if (!text) { resolve(undefined as unknown as T); return; }
              try { resolve(JSON.parse(text) as T); }
              catch { reject(new ApiError(r.status, `non-json response ${path}`)); }
            }).catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
          },
          reject: (e: Error) => reject(e),
          redo: () => rawFetch(path, init),
        };
        pinRequired.value = true;
      });
    }
    pinRequired.value = true;
    throw new ApiError(401, `unauthorized ${path}`);
  }
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} ${path}`);
  // 204 No Content / empty body — return undefined cast to T.
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Endpoints that return non-JSON shouldn't go through request<T>().
    throw new ApiError(res.status, `non-json response ${path}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Pure binary parser for the 14-byte sample stride. Exposed so unit
// tests can round-trip canned bytes without going through fetch.
// Trailing partial frames are dropped silently — the firmware writes
// in 14-byte units, so any stub byte means EOF mid-write.
export const SAMPLE_STRIDE = 14;

export function parseSamples(bytes: Uint8Array): Sample[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Sample[] = [];
  for (let i = 0; i + SAMPLE_STRIDE <= bytes.length; i += SAMPLE_STRIDE) {
    out.push({
      t_ms:     dv.getUint32(i,      true),
      hr_bpm:   dv.getUint16(i + 4,  true),
      spo2_x10: dv.getUint16(i + 6,  true),
      activity: dv.getUint16(i + 8,  true),
      stage:    dv.getUint8 (i + 10),
      flags:    dv.getUint8 (i + 11),
      // bytes 12-13 reserved
    });
  }
  return out;
}

export const api = {
  status:        () => request<DeviceStatus>('/api/status'),
  listSessions:  () => request<{ id: string; summary?: SessionSummary }[]>('/api/sessions'),
  getSession:    (id: string) => request<SessionSummary>(`/api/sessions/${encodeURIComponent(id)}`),
  deleteSession: (id: string) => request<{ ok: boolean }>(
    `/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  patchSession:  (id: string, patch: SessionPatch) => request<SessionSummary>(
    `/api/sessions/${encodeURIComponent(id)}`, jsonInit('PATCH', patch)),
  startSession:  () => request<{ ok: boolean }>('/api/sessions/start', { method: 'POST' }),
  stopSession:   () => request<{ ok: boolean }>('/api/sessions/stop',  { method: 'POST' }),
  getSettings:   () => request<SettingsBody>('/api/settings'),
  getSettingsExtended: () => request<SettingsBody>('/api/settings?extended=1'),
  putSettings:   (patch: Partial<SettingsBody>) => request<{ ok: boolean }>(
    '/api/settings', jsonInit('PUT', patch)),
  testAlarm:     () => request<{ ok: boolean }>('/api/alarm/test',    { method: 'POST' }),
  silenceAlarm:  () => request<{ ok: boolean }>('/api/alarm/silence', { method: 'POST' }),
  alarmPreview:  () => request<AlarmPreview>('/api/alarm/preview'),
  resetWifi:     () => request<{ ok: boolean }>('/api/wifi/reset', { method: 'POST' }),
  wifiScan:      () => request<WifiNetwork[]>('/api/wifi/scan'),
  authCheck:     () => request<void>('/api/auth/check', { method: 'POST' }),
  otaRollback:   () => request<{ ok: boolean }>('/api/ota/rollback', { method: 'POST' }),

  // Binary samples — fetches the raw stream, then defers parsing to the
  // pure helper below so unit tests can exercise the wire format
  // without standing up a fake fetch.
  rawSession: async (id: string): Promise<Sample[]> => {
    const res = await rawFetch(`/api/sessions/${encodeURIComponent(id)}/raw`, undefined);
    if (res.status === 401) {
      pinRequired.value = true;
      throw new ApiError(401, 'unauthorized raw');
    }
    if (!res.ok) throw new ApiError(res.status, `raw ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return parseSamples(buf);
  },

  csvUrl:  (id: string) => `/api/sessions/${encodeURIComponent(id)}.csv`,
};

// ---------------------------------------------------------------------------
// Replay a parked 401 request after successful PIN unlock.
// TODO(A2-followup): wire this in auth.ts — import { replayPendingRequest }
// from './api' and call it right after clearing pinRequired.
// ---------------------------------------------------------------------------
export async function replayPendingRequest(): Promise<void> {
  if (!pendingReplay) return;
  const p = pendingReplay;
  pendingReplay = null;
  try {
    const r = await p.redo();
    p.resolve(r);
  } catch (e) {
    p.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------------------------------------------------------------------------
// Tags — Phase-E firmware endpoints; stubs return safe defaults on failure.
// ---------------------------------------------------------------------------

export interface TagsResponse { tags: string[]; }

export async function getTags(): Promise<string[]> {
  const r = await rawFetch('/api/tags', undefined);
  if (!r.ok) return [];
  const j = (await r.json()) as TagsResponse;
  return j.tags ?? [];
}

export async function putTags(tags: string[]): Promise<void> {
  await rawFetch('/api/tags', jsonInit('PUT', { tags }));
}

// ---------------------------------------------------------------------------
// Goals — Phase-E firmware endpoints; stubs return safe defaults on failure.
// ---------------------------------------------------------------------------

export interface GoalsResponse { targetSleepMin?: number; targetScore?: number; }

export async function getGoals(): Promise<GoalsResponse> {
  const r = await rawFetch('/api/goals', undefined);
  if (!r.ok) return {};
  return (await r.json()) as GoalsResponse;
}

export async function putGoals(g: GoalsResponse): Promise<void> {
  await rawFetch('/api/goals', jsonInit('PUT', g));
}

export { ApiError };
