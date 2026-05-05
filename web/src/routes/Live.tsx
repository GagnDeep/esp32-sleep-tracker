import { useEffect, useRef, useState } from 'preact/hooks';
import { liveStats, deviceStatus } from '../lib/store';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NumberTile } from '../components/ui/NumberTile';
import { Pill } from '../components/ui/Pill';
import { HrSpo2Chart } from '../components/charts/HrSpo2Chart';
import { formatBpm, formatPct, formatDuration, stageLabels } from '../lib/format';

const ROLLING_S = 60;

export function Live() {
  const [busy, setBusy] = useState(false);
  const tsRef = useRef<number[]>([]);
  const hrRef = useRef<(number | null)[]>([]);
  const sxRef = useRef<(number | null)[]>([]);
  const [, force] = useState(0);

  // Pull /api/status periodically for the things WS doesn't push (uptime, free heap…).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.status();
        if (alive) deviceStatus.value = s;
      } catch { /* swallow; the badge will show offline */ }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Append every live signal frame into the rolling chart buffer.
  useEffect(() => {
    return liveStats.subscribe((s) => {
      const t = (s.t || 0) / 1000;
      tsRef.current.push(t);
      hrRef.current.push(s.hr || null);
      sxRef.current.push(s.spo2 || null);
      while (tsRef.current.length > ROLLING_S * 2) {
        tsRef.current.shift();
        hrRef.current.shift();
        sxRef.current.shift();
      }
      force((n) => (n + 1) & 0xFF);
    });
  }, []);

  const stats = liveStats.value;
  const status = deviceStatus.value;
  const recording = status?.session_active;

  const start = async () => {
    setBusy(true);
    try { await api.startSession(); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.stopSession(); }
    finally { setBusy(false); }
  };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberTile
          label="Heart rate"
          value={formatBpm(stats.hr)}
          unit="bpm"
          tone="accent"
        />
        <NumberTile
          label="SpO₂"
          value={formatPct(stats.spo2)}
          unit="%"
          tone={stats.spo2 && stats.spo2 < 90 ? 'bad' : 'default'}
        />
        <NumberTile
          label="Movement"
          value={String(stats.activity)}
          unit="/1000"
          hint={stageLabels[stats.stage]}
        />
      </div>

      <Card title="Live waveform" hint={`last ${ROLLING_S}s`}>
        <HrSpo2Chart
          live
          data={[tsRef.current.slice(), hrRef.current.slice(), sxRef.current.slice()]}
        />
      </Card>

      <Card title="Recording">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="text-sm text-ink-muted">
              {recording ? 'In progress' : 'Ready when you are.'}
            </div>
            {recording && status && (
              <Pill tone="accent">
                {formatDuration(status.uptime_s ?? 0)}
                {' · '}
                {status.session_id}
              </Pill>
            )}
          </div>
          {recording
            ? <Button variant="danger" onClick={stop}    disabled={busy}>Stop</Button>
            : <Button                onClick={start}   disabled={busy}>Start session</Button>}
        </div>
      </Card>
    </div>
  );
}
