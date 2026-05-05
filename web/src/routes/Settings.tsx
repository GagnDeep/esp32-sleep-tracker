import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { api, type SettingsBody } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { deviceStatus } from '../lib/store';
import { notify } from '../lib/toast';

export function Settings() {
  const [s, setS] = useState<SettingsBody | null>(null);
  const [otaBusy, setOtaBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSettings().then((d) => { if (alive) setS(d); });
    return () => { alive = false; };
  }, []);

  if (!s) return <div class="max-w-3xl mx-auto py-6">Loading…</div>;

  const patch = (p: Partial<SettingsBody>) => { setS({ ...s, ...p }); api.putSettings(p); };

  const onOta = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setOtaBusy(true);
    try {
      const form = new FormData();
      form.append('firmware', file, file.name);
      const res = await fetch('/api/ota', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`OTA failed: ${res.status}`);
      notify('success', 'Firmware accepted. Device is rebooting.');
    } catch (err) {
      notify('error', `OTA failed: ${(err as Error).message}`);
    } finally {
      setOtaBusy(false);
      input.value = '';
    }
  };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <Card title="Device">
        <Field label="Name">
          <input type="text" value={s.device_name}
                 onChange={(e) => patch({ device_name: (e.currentTarget as HTMLInputElement).value })}
                 class="h-10 px-3 rounded-xl bg-surface text-ink w-full" />
        </Field>
        <Field label="Time zone (POSIX)">
          <input type="text" value={s.timezone}
                 onChange={(e) => patch({ timezone: (e.currentTarget as HTMLInputElement).value })}
                 placeholder="UTC0 / EST5EDT,M3.2.0,M11.1.0"
                 class="h-10 px-3 rounded-xl bg-surface text-ink w-full font-mono text-sm" />
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

      <Card title="Firmware update">
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm">Upload firmware.bin</span>
          <input type="file" accept=".bin" onChange={onOta} disabled={otaBusy}
                 class="text-sm" />
        </label>
      </Card>

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
