import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { api, type SettingsBody } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { deviceStatus } from '../lib/store';
import { notify } from '../lib/toast';
import { displayTimezone } from '../lib/format';
import { setPin as authSetPin, clearPin as authClearPin } from '../lib/auth';
import { subscribe } from '../lib/ws';

const TZ_PRESETS: { value: string; label: string }[] = [
  { value: 'auto',                          label: 'Auto (browser)' },
  { value: 'UTC0',                          label: 'UTC' },
  { value: 'EST5EDT,M3.2.0,M11.1.0',        label: 'US Eastern (EST/EDT)' },
  { value: 'CST6CDT,M3.2.0,M11.1.0',        label: 'US Central (CST/CDT)' },
  { value: 'MST7MDT,M3.2.0,M11.1.0',        label: 'US Mountain (MST/MDT)' },
  { value: 'PST8PDT,M3.2.0,M11.1.0',        label: 'US Pacific (PST/PDT)' },
  { value: 'CET-1CEST,M3.5.0,M10.5.0/3',    label: 'Central Europe (CET/CEST)' },
  { value: 'JST-9',                          label: 'Japan (JST)' },
  { value: 'IST-5:30',                       label: 'India (IST)' },
  { value: '__custom__',                     label: 'Custom POSIX…' },
];

export function Settings() {
  const [s, setS] = useState<SettingsBody | null>(null);

  useEffect(() => {
    let alive = true;
    api.getSettings().then((d) => { if (alive) setS(d); });
    return () => { alive = false; };
  }, []);

  if (!s) return <div class="max-w-3xl mx-auto py-6">Loading…</div>;

  const patch = (p: Partial<SettingsBody>) => { setS({ ...s, ...p }); api.putSettings(p); };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <Card title="Device">
        <Field label="Name">
          <input type="text" value={s.device_name}
                 onChange={(e) => patch({ device_name: (e.currentTarget as HTMLInputElement).value })}
                 class="h-10 px-3 rounded-xl bg-surface text-ink w-full" />
        </Field>
        <TimezoneField value={s.timezone} onChange={(v) => patch({ timezone: v })} />
        <Field label="Display zone (web)">
          <select value={displayTimezone.value}
                  onChange={(e) => { displayTimezone.value = (e.currentTarget as HTMLSelectElement).value; }}
                  class="h-10 px-3 rounded-xl bg-surface text-ink w-full">
            <option value="auto">Auto (browser)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Denver">America/Denver</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
          </select>
        </Field>
      </Card>

      <Card title="Sensor calibration">
        <Field label="LED brightness (0–255)">
          <input type="number" min={0} max={255}
                 value={s.led_brightness}
                 onChange={(e) => patch({ led_brightness: parseInt((e.currentTarget as HTMLInputElement).value, 10) })}
                 class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        </Field>
        <Field label="SpO₂ cal A">
          <input type="number" step="0.1" value={s.spo2_cal_a}
                 onChange={(e) => patch({ spo2_cal_a: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                 class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        </Field>
        <Field label="SpO₂ cal B">
          <input type="number" step="0.1" value={s.spo2_cal_b}
                 onChange={(e) => patch({ spo2_cal_b: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                 class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        </Field>
        <CalibrationProgress done={deviceStatus.value?.calibration_nights_done ?? 0} />
      </Card>

      <Card title="Stage thresholds">
        <Field label="Motion threshold">
          <input type="number" min={0} max={1000}
                 value={s.thresh_motion}
                 onChange={(e) => patch({ thresh_motion: parseInt((e.currentTarget as HTMLInputElement).value, 10) })}
                 class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        </Field>
        <Field label="Stillness threshold">
          <input type="number" min={0} max={1000}
                 value={s.thresh_still}
                 onChange={(e) => patch({ thresh_still: parseInt((e.currentTarget as HTMLInputElement).value, 10) })}
                 class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        </Field>
        <p class="text-xs text-ink-muted mt-1">
          Calibration nights: {s.baseline_nights} / 3 · baseline RMSSD: {s.user_baseline_rmssd || '—'} ms
        </p>
      </Card>

      <Card title="Network">
        <Button variant="ghost" onClick={() => {
          if (confirm('Forget WiFi and reboot into setup mode?')) api.resetWifi();
        }}>Switch network…</Button>
      </Card>

      <PinCard pinSet={s.pin_set} onChange={(pinSet) => setS({ ...s, pin_set: pinSet })} />

      <OtaCard />

      <HeapRssiCard />

      <Card title="About">
        <dl class="text-sm space-y-1 font-mono">
          <Row label="firmware">{deviceStatus.value?.firmware_version ?? '—'}</Row>
          <Row label="ip">{deviceStatus.value?.ip ?? '—'}</Row>
          <Row label="rssi">{deviceStatus.value?.wifi_rssi ?? '—'} dBm</Row>
          <Row label="free heap">{deviceStatus.value?.free_heap ?? '—'} B</Row>
          <Row label="lfs free">{deviceStatus.value?.lfs_free_bytes ?? '—'} B</Row>
        </dl>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="block mb-3 last:mb-0">
      <span class="block text-xs text-ink-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex justify-between gap-3">
      <dt class="text-ink-muted">{label}</dt>
      <dd class="text-ink truncate">{children}</dd>
    </div>
  );
}

function TimezoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // If the saved value isn't in our preset list, drop the picker into
  // custom mode so the user can edit the literal POSIX string.
  const presetValues = TZ_PRESETS.map((p) => p.value);
  const isCustom = !presetValues.includes(value);
  const [custom, setCustom] = useState(isCustom);
  const select = isCustom ? '__custom__' : value;

  return (
    <Field label="Time zone (device)">
      <div class="space-y-2">
        <select value={select}
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  if (v === '__custom__') { setCustom(true); return; }
                  setCustom(false);
                  onChange(v);
                }}
                class="h-10 px-3 rounded-xl bg-surface text-ink w-full">
          {TZ_PRESETS.map((p) => <option value={p.value}>{p.label}</option>)}
        </select>
        {custom && (
          <textarea
            value={isCustom ? value : ''}
            placeholder="EST5EDT,M3.2.0,M11.1.0"
            rows={2}
            onChange={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value.trim())}
            class="w-full px-3 py-2 rounded-xl bg-surface text-ink font-mono text-sm" />
        )}
      </div>
    </Field>
  );
}

function CalibrationProgress({ done }: { done: number }) {
  const total = 3;
  const pct = Math.min(100, Math.max(0, (done / total) * 100));
  return (
    <div class="mt-3">
      <div class="flex justify-between text-xs text-ink-muted mb-1">
        <span>Calibration</span>
        <span>{Math.min(done, total)} / {total}</span>
      </div>
      <div class="h-2 rounded-full bg-surface overflow-hidden">
        <div class="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const HEX32_RE = /^[0-9a-f]{32}$/i;

function OtaCard() {
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [md5, setMd5] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Listen for server-pushed OTA progress; falls back to local upload
  // progress when the firmware doesn't broadcast.
  useEffect(() => {
    return subscribe('ota_progress', (e) => setPct(e.pct));
  }, []);

  const md5Valid = HEX32_RE.test(md5.trim());

  const upload = () => {
    if (!file) { notify('warn', 'Pick a .bin file first.'); return; }
    if (!md5Valid) { notify('warn', 'MD5 must be 32 hex characters.'); return; }
    setBusy(true);
    setPct(0);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        setPct(100);
        notify('success', 'Firmware accepted. Device is rebooting.');
      } else {
        notify('error', `OTA failed: ${xhr.status} ${xhr.statusText}`);
        setPct(null);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      xhrRef.current = null;
      notify('error', 'OTA failed: network error');
      setPct(null);
    };
    xhr.onabort = () => {
      setBusy(false);
      xhrRef.current = null;
      setPct(null);
      notify('warn', 'OTA upload aborted.');
    };
    xhr.open('POST', '/api/ota');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Firmware-MD5', md5.trim().toLowerCase());
    xhr.send(file);
  };

  const abort = () => { xhrRef.current?.abort(); };

  const rollback = async () => {
    if (!confirm('Roll back to the previous firmware partition? The device will reboot.')) return;
    try {
      await api.otaRollback();
      notify('success', 'Rollback requested.');
    } catch (e) {
      notify('error', `Rollback failed: ${(e as Error).message}`);
    }
  };

  return (
    <Card title="Firmware update">
      <Field label="firmware.bin">
        <input type="file" accept=".bin"
               onChange={(e) => setFile((e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
               disabled={busy}
               class="text-sm" />
      </Field>
      <Field label="MD5 (32 hex chars from md5sum firmware.bin)">
        <input type="text" value={md5}
               onInput={(e) => setMd5((e.currentTarget as HTMLInputElement).value)}
               disabled={busy}
               placeholder="9e107d9d372bb6826bd81d3542a419d6"
               class={[
                 'h-10 px-3 rounded-xl bg-surface w-full font-mono text-xs',
                 md5 && !md5Valid ? 'ring-1 ring-bad' : '',
               ].join(' ')} />
      </Field>

      {pct != null && (
        <div class="my-3">
          <div class="flex justify-between text-xs text-ink-muted mb-1">
            <span>Uploading…</span><span>{pct}%</span>
          </div>
          <div class="h-2 rounded-full bg-surface overflow-hidden">
            <div class="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div class="flex flex-wrap gap-2 mt-2">
        <Button onClick={upload} disabled={busy || !file || !md5Valid}>Upload</Button>
        {busy && <Button variant="ghost" onClick={abort}>Abort</Button>}
        <Button variant="ghost" onClick={rollback}>Roll back to previous</Button>
      </div>
    </Card>
  );
}

function PinCard({ pinSet, onChange }: { pinSet?: boolean; onChange: (pinSet: boolean) => void }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);

  const set = async () => {
    if (!/^\d{4,8}$/.test(val)) { notify('warn', 'PIN must be 4–8 digits.'); return; }
    setBusy(true);
    try {
      await api.putSettings({ pin: val });
      authSetPin(val);
      onChange(true);
      setVal('');
      notify('success', 'PIN set.');
    } catch (e) {
      notify('error', `Couldn't set PIN: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!confirm('Clear PIN? The device will be unlocked for anyone on the network.')) return;
    setBusy(true);
    try {
      await api.putSettings({ pin: '' });
      authClearPin();
      onChange(false);
      notify('success', 'PIN cleared.');
    } catch (e) {
      notify('error', `Couldn't clear PIN: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="PIN lock"
          hint={pinSet ? <Pill tone="good">enabled</Pill> : <Pill tone="neutral">off</Pill>}>
      <Field label="New PIN (4–8 digits)">
        <input type="password" inputMode="numeric" pattern="[0-9]*"
               value={val}
               onInput={(e) => setVal((e.currentTarget as HTMLInputElement).value)}
               disabled={busy}
               class="h-10 px-3 rounded-xl bg-surface w-full font-mono" />
      </Field>
      <div class="flex gap-2">
        <Button onClick={set} disabled={busy || !val}>Set PIN</Button>
        {pinSet && <Button variant="ghost" onClick={clear} disabled={busy}>Clear PIN</Button>}
      </div>
    </Card>
  );
}

const HEAP_BUF = 60;

function HeapRssiCard() {
  const heapRef = useRef<number[]>([]);
  const rssiRef = useRef<number[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const st = deviceStatus.value;
      if (!st) return;
      heapRef.current.push(st.free_heap || 0);
      rssiRef.current.push(st.wifi_rssi || 0);
      while (heapRef.current.length > HEAP_BUF) heapRef.current.shift();
      while (rssiRef.current.length > HEAP_BUF) rssiRef.current.shift();
      force((n) => (n + 1) & 0xFF);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card title="Device health" hint="last 60 s">
      <div class="grid grid-cols-2 gap-3">
        <SmallSpark label="Free heap" unit="kB"  series={heapRef.current} scale={1 / 1024} digits={0} />
        <SmallSpark label="WiFi RSSI" unit="dBm" series={rssiRef.current} digits={0} />
      </div>
    </Card>
  );
}

function SmallSpark({
  label, unit, series, scale = 1, digits = 0,
}: { label: string; unit: string; series: number[]; scale?: number; digits?: number }) {
  const W = 220, H = 40, PAD = 2;
  const last = series.length ? series[series.length - 1] * scale : null;
  const present = series.filter((v) => v !== 0);
  const min = present.length ? Math.min(...present) * scale : 0;
  const max = present.length ? Math.max(...present) * scale : 1;
  const span = Math.max(1e-6, max - min);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, HEAP_BUF - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = series.map((v, i) => {
    const sv = v * scale;
    return `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sv).toFixed(1)}`;
  }).join(' ');

  return (
    <div>
      <div class="flex justify-between text-xs text-ink-muted mb-1">
        <span>{label}</span>
        <span class="font-mono">
          {last == null ? '—' : last.toFixed(digits)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           role="img" aria-label={`${label} sparkline`}
           style={{ width: '100%', height: H }}>
        {series.length > 0 && (
          <path d={path} fill="none" stroke="oklch(78% 0.18 200)" stroke-width="1.5" />
        )}
      </svg>
    </div>
  );
}
