import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type AlarmPreview, type SettingsBody } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { AlarmEditor } from '../components/AlarmEditor';
import { BreathingExercise } from '../components/BreathingExercise';
import { notify } from '../lib/toast';

export function Alarm() {
  const [s, setS] = useState<SettingsBody | null>(null);
  const [preview, setPreview] = useState<AlarmPreview | null>(null);
  const [breathing, setBreathing] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSettings().then((d) => { if (alive) setS(d); });
    return () => { alive = false; };
  }, []);

  // Poll alarm preview on mount + every 60 s. The pill stays in sync as
  // the user edits the alarm window since `patch()` triggers a refetch.
  useEffect(() => {
    let alive = true;
    const fetchPreview = () => {
      api.alarmPreview().then((p) => { if (alive) setPreview(p); }).catch(() => {});
    };
    fetchPreview();
    const id = setInterval(fetchPreview, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!s) return <div class="max-w-3xl mx-auto py-6">Loading…</div>;

  const patch = async (p: Partial<SettingsBody>) => {
    setS({ ...s, ...p });
    try {
      await api.putSettings(p);
      // Refresh the preview so the pill reflects the change.
      api.alarmPreview().then(setPreview).catch(() => {});
    } catch (e) {
      notify('error', `Couldn't save: ${(e as Error).message}`);
    }
  };

  const onTest = async () => {
    try {
      await api.testAlarm();
      notify('success', 'Buzzer test sent.');
      setBreathing(true);
    } catch (e) {
      notify('error', `Test failed: ${(e as Error).message}`);
    }
  };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <NextFirePill preview={preview} enabled={s.alarm_enabled} />

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

      <Card title="Volume ramp" hint="seconds from quiet to full">
        <div class="flex items-center gap-3">
          <input type="range" min={0} max={60} step={1}
                 value={s.volume_ramp_s ?? 0}
                 onChange={(e) => patch({ volume_ramp_s: parseInt((e.currentTarget as HTMLInputElement).value, 10) })}
                 class="flex-1" />
          <span class="font-mono text-sm tabular-nums w-10 text-right">{s.volume_ramp_s ?? 0}s</span>
        </div>
      </Card>

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
        <div class="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onTest}>Test alarm</Button>
          <Button variant="ghost" onClick={() => api.silenceAlarm()}>Silence</Button>
          <PreviewSoundButton />
        </div>
      </Card>

      <BreathingExercise open={breathing} onClose={() => setBreathing(false)} />
    </div>
  );
}

function NextFirePill({ preview, enabled }: { preview: AlarmPreview | null; enabled: boolean }) {
  if (!enabled) return <Pill tone="neutral">Alarm off</Pill>;
  if (!preview) return <Pill tone="neutral">Loading next fire…</Pill>;
  if (preview.would_fire_in_s == null || preview.would_fire_in_s < 0) {
    return <Pill tone="neutral">{preview.reason || 'No upcoming fire'}</Pill>;
  }
  return <Pill tone="accent">Next firing in {humaniseSeconds(preview.would_fire_in_s)}</Pill>;
}

function humaniseSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} m`;
}

// Web-Audio preview: 1 kHz pulse 0.4 s, 250 ms gap, 4 reps. Lives only
// in the browser — never touches the firmware buzzer. We tear down the
// AudioContext on unmount to avoid leaving it in a "interrupted" state.
function PreviewSoundButton() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { ctxRef.current?.close().catch(() => {}); }, []);

  const onPreview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      type AudioContextCtor = new () => AudioContext;
      const winAny = window as unknown as {
        AudioContext?: AudioContextCtor;
        webkitAudioContext?: AudioContextCtor;
      };
      const Ctor: AudioContextCtor | undefined = winAny.AudioContext ?? winAny.webkitAudioContext;
      if (!Ctor) { notify('warn', 'Audio not supported here.'); return; }
      const ctx = ctxRef.current ?? new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      let t = ctx.currentTime + 0.05;
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        // Cheap envelope to avoid clicks at edges.
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        gain.gain.setValueAtTime(0.4, t + 0.38);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
        t += 0.4 + 0.25;
      }
      // Total ~ 4 * 0.65 s. Re-enable button when done.
      setTimeout(() => setBusy(false), Math.ceil(4 * 650) + 100);
    } catch (e) {
      notify('error', `Preview failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Button variant="ghost" onClick={onPreview} disabled={busy}>
      {busy ? 'Playing…' : 'Preview sound'}
    </Button>
  );
}
