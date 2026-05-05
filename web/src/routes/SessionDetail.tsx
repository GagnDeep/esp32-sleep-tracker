import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { api } from '../lib/api';
import type { Sample, SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { HrSpo2Chart } from '../components/charts/HrSpo2Chart';
import { HypnogramChart } from '../components/charts/HypnogramChart';
import { MovementChart } from '../components/charts/MovementChart';
import { formatDuration, formatBpm, formatPct } from '../lib/format';

export function SessionDetail() {
  const { params } = useRoute();
  const id = params.id;
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.getSession(id), api.rawSession(id)])
      .then(([s, raw]) => { if (alive) { setSummary(s); setSamples(raw); } })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return <div class="max-w-3xl mx-auto py-6 text-bad">Couldn't load session: {error}</div>;
  }
  if (!summary || !samples) {
    return (
      <div class="space-y-3 max-w-3xl mx-auto py-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-48 w-full" />
        <Skeleton class="h-32 w-full" />
      </div>
    );
  }

  const ts = samples.map((s) => s.t_ms / 1000);
  const hr = samples.map((s) => (s.hr_bpm   === 0xFFFF ? null : s.hr_bpm));
  const sx = samples.map((s) => (s.spo2_x10 === 0xFFFF ? null : s.spo2_x10 / 10));
  const act = samples.map((s) => s.activity);
  const stages = samples.map((s) => ({ t: s.t_ms / 1000, stage: s.stage }));

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <header class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 class="text-lg font-semibold tracking-tight">{summary.started_at ?? id}</h1>
          <div class="text-sm text-ink-muted">
            {formatDuration(summary.duration_s ?? 0)}
            {summary.firmware_version && <> · fw {summary.firmware_version}</>}
            {summary.crashed && <> · <Pill tone="warn">crash recovered</Pill></>}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a href={api.csvUrl(id)} download>
            <Button variant="ghost" size="sm">Download CSV</Button>
          </a>
        </div>
      </header>

      <Card title="Stages" hint="hypnogram">
        <HypnogramChart data={stages} />
      </Card>

      <Card title="Heart rate + SpO₂">
        <HrSpo2Chart data={[ts, hr, sx]} />
      </Card>

      <Card title="Movement">
        <MovementChart data={[ts, act]} />
      </Card>

      <Card title="Summary">
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="HR avg"  value={formatBpm(summary.hr_avg ?? 0)} unit="bpm" />
          <Stat label="HR min"  value={formatBpm(summary.hr_min ?? 0)} unit="bpm" />
          <Stat label="HR max"  value={formatBpm(summary.hr_max ?? 0)} unit="bpm" />
          <Stat label="SpO₂ avg" value={formatPct((summary.spo2_avg_x10 ?? 0) / 10)} unit="%" />
          <Stat label="Awake"   value={formatDuration(summary.time_in_stage?.[1] ?? 0)} />
          <Stat label="Light"   value={formatDuration(summary.time_in_stage?.[2] ?? 0)} />
          <Stat label="Deep"    value={formatDuration(summary.time_in_stage?.[3] ?? 0)} />
          <Stat label="Score"   value={summary.sleep_score?.toString() ?? '—'} />
        </dl>
      </Card>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <dt class="text-xs uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd class="font-mono tabular-nums">
        {value}{unit && <span class="text-ink-muted ml-1 text-xs">{unit}</span>}
      </dd>
    </div>
  );
}
