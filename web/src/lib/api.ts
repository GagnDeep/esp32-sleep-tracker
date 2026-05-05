// Typed wrappers for every REST endpoint. Types mirror the firmware
// schemas; if you change the wire format on either side, change both.

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
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Accept': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  status:        () => request<DeviceStatus>('/api/status'),
  listSessions:  () => request<{ id: string; summary?: SessionSummary }[]>('/api/sessions'),
  getSession:    (id: string) => request<SessionSummary>(`/api/sessions/${encodeURIComponent(id)}`),
  deleteSession: (id: string) => request<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  startSession:  () => request<{ ok: boolean }>('/api/sessions/start', { method: 'POST' }),
  stopSession:   () => request<{ ok: boolean }>('/api/sessions/stop',  { method: 'POST' }),
  getSettings:   () => request<SettingsBody>('/api/settings'),
  putSettings:   (patch: Partial<SettingsBody>) => fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(checkOk),
  testAlarm:     () => fetch('/api/alarm/test',    { method: 'POST' }).then(checkOk),
  silenceAlarm:  () => fetch('/api/alarm/silence', { method: 'POST' }).then(checkOk),
  resetWifi:     () => fetch('/api/wifi/reset',    { method: 'POST' }).then(checkOk),

  // Binary samples — parsed via DataView. Sample size is 14 packed
  // bytes on-device; we read them with explicit offsets.
  rawSession: async (id: string): Promise<Sample[]> => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/raw`);
    if (!res.ok) throw new ApiError(res.status, `raw ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const out: Sample[] = [];
    const STRIDE = 14;
    for (let i = 0; i + STRIDE <= buf.length; i += STRIDE) {
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
  },

  csvUrl:  (id: string) => `/api/sessions/${encodeURIComponent(id)}.csv`,
};

async function checkOk(res: Response) {
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.json().catch(() => ({}));
}

export { ApiError };
