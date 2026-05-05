import { useEffect, useState } from 'preact/hooks';
import { api, type SettingsBody } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlarmEditor } from '../components/AlarmEditor';

export function Alarm() {
  const [s, setS] = useState<SettingsBody | null>(null);

  useEffect(() => {
    let alive = true;
    api.getSettings().then((d) => { if (alive) setS(d); });
    return () => { alive = false; };
  }, []);

  if (!s) return <div class="max-w-3xl mx-auto py-6">Loading…</div>;

  const patch = (p: Partial<SettingsBody>) => {
    setS({ ...s, ...p });
    api.putSettings(p);
  };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <AlarmEditor
        enabled={s.alarm_enabled}
        startMin={s.alarm_start_min}
        endMin={s.alarm_end_min}
        days={s.alarm_days}
        onChange={(p) => patch({
          alarm_enabled:   p.enabled  ?? s.alarm_enabled,
          alarm_start_min: p.startMin ?? s.alarm_start_min,
          alarm_end_min:   p.endMin   ?? s.alarm_end_min,
          alarm_days:      p.days     ?? s.alarm_days,
        } as Partial<SettingsBody>)}
      />

      <Card title="Low SpO₂ alert" hint="audible buzzer">
        <label class="flex items-center justify-between gap-3 mb-3">
          <span class="text-sm">Threshold (%)</span>
          <input type="number" min={70} max={100} step={0.1}
                 value={(s.spo2_low_x10 / 10).toFixed(1)}
                 onChange={(e) => patch({ spo2_low_x10: Math.round(parseFloat((e.currentTarget as HTMLInputElement).value) * 10) })}
                 class="w-24 h-9 px-3 rounded-xl bg-surface text-ink text-right font-mono" />
        </label>
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm">Sustain (s)</span>
          <input type="number" min={5} max={120} step={5}
                 value={s.spo2_sustain_s}
                 onChange={(e) => patch({ spo2_sustain_s: parseInt((e.currentTarget as HTMLInputElement).value, 10) })}
                 class="w-24 h-9 px-3 rounded-xl bg-surface text-ink text-right font-mono" />
        </label>
      </Card>

      <Card title="Test buzzer">
        <div class="flex gap-2">
          <Button variant="ghost" onClick={() => api.testAlarm()}>Test</Button>
          <Button variant="ghost" onClick={() => api.silenceAlarm()}>Silence</Button>
        </div>
      </Card>
    </div>
  );
}
