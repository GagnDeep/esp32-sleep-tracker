// 28-day sparklines for HR/SpO2/score/duration with a 7-day rolling
// average overlay. Tag chips along the top filter the included
// sessions (any-of). Hand-rolled SVG so we don't pull uPlot for these
// tiny charts — pixels are coarser than uPlot's box anyway.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { rollingAvg } from '../lib/analytics';
import { mockSessions, shouldUseMock, TAG_WHITELIST } from '../lib/__fixtures__/sessions';

const DAYS = 28;

interface Props {
  // History passes us the freshly-loaded list so we don't double-fetch
  // when the user toggles into the Trends tab. Standalone mounts (the
  // /trends route) load their own.
  sessions?: { id: string; summary?: SessionSummary }[];
}

export function Trends({ sessions: provided }: Props) {
  const [sessions, setSessions] = useState<{ id: string; summary?: SessionSummary }[] | null>(
    provided ?? null,
  );
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (provided) { setSessions(provided); return; }
    let alive = true;
    if (shouldUseMock()) {
      setSessions(mockSessions());
      return () => { alive = false; };
    }
    api.listSessions().then((d) => { if (alive) setSessions(d); }).catch(() => {
      if (alive) setSessions([]);
    });
    return () => { alive = false; };
  }, [provided]);

  // Bucket sessions into the last DAYS day-buckets (local-day key).
  const buckets = useMemo(() => bucketByDay(sessions ?? [], DAYS, activeTags), [sessions, activeTags]);

  if (!sessions) {
    return (
      <div class="space-y-3">
        <Skeleton class="h-8 w-full" />
        <Skeleton class="h-32 w-full" />
        <Skeleton class="h-32 w-full" />
      </div>
    );
  }
  if (sessions.length === 0) {
    return <EmptyState title="No data yet" msg="Trends appear after your first night." />;
  }

  const hrAvg    = buckets.map((b) => avgOf(b, (s) => s.hr_avg));
  const hrMin    = buckets.map((b) => minOf(b, (s) => s.hr_min));
  const spo2Avg  = buckets.map((b) => avgOf(b, (s) => s.spo2_avg_x10 != null ? s.spo2_avg_x10 / 10 : undefined));
  const spo2Min  = buckets.map((b) => minOf(b, (s) => s.spo2_min_x10 != null ? s.spo2_min_x10 / 10 : undefined));
  const scores   = buckets.map((b) => avgOf(b, (s) => s.sleep_score));
  const duration = buckets.map((b) => sumOf(b, (s) => s.duration_s) / 3600 || null);

  return (
    <div class="space-y-4">
      <Card title="Tag filter" hint={activeTags.size === 0 ? 'showing all' : `${activeTags.size} active`}>
        <div class="flex flex-wrap gap-2">
          {TAG_WHITELIST.map((tag) => {
            const on = activeTags.has(tag);
            return (
              <button type="button"
                      key={tag}
                      onClick={() => {
                        const next = new Set(activeTags);
                        if (on) next.delete(tag); else next.add(tag);
                        setActiveTags(next);
                      }}
                      aria-pressed={on}
                      class={[
                        'h-8 px-3 rounded-full text-xs',
                        on ? 'bg-accent text-surface' : 'bg-surface text-ink-muted hover:text-ink',
                      ].join(' ')}>
                {tag}
              </button>
            );
          })}
        </div>
      </Card>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SparkCard title="HR avg"    unit="bpm" series={hrAvg}    />
        <SparkCard title="HR min"    unit="bpm" series={hrMin}    />
        <SparkCard title="SpO₂ avg"  unit="%"   series={spo2Avg}  digits={1} />
        <SparkCard title="SpO₂ min"  unit="%"   series={spo2Min}  digits={1} />
        <SparkCard title="Sleep score"          series={scores}   />
        <SparkCard title="Duration"  unit="h"   series={duration} digits={1} />
      </div>
    </div>
  );
}

function SparkCard({
  title, unit, series, digits = 0,
}: { title: string; unit?: string; series: (number | null)[]; digits?: number }) {
  const present = series.filter((v): v is number => v != null);
  const last = [...series].reverse().find((v) => v != null) ?? null;
  return (
    <div class="rounded-2xl bg-surface-2 p-4 shadow-soft">
      <div class="flex items-baseline justify-between mb-2">
        <span class="text-xs uppercase tracking-wider text-ink-muted">{title}</span>
        <span class="font-mono text-sm tabular-nums">
          {last == null ? '—' : last.toFixed(digits)}
          {unit && <span class="text-ink-muted ml-1 text-xs">{unit}</span>}
        </span>
      </div>
      {present.length === 0 ? (
        <div class="h-12 flex items-center justify-center text-xs text-ink-muted">no data</div>
      ) : (
        <Sparkline series={series} />
      )}
    </div>
  );
}

function Sparkline({ series }: { series: (number | null)[] }) {
  const W = 280, H = 48, PAD = 2;
  const present = series.filter((v): v is number => v != null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = Math.max(1e-6, max - min);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, series.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // Build the main polyline path with gaps for empty days.
  const segments: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v == null) {
      if (cur.length) { segments.push(cur.join(' ')); cur = []; }
      continue;
    }
    cur.push(`${cur.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  }
  if (cur.length) segments.push(cur.join(' '));

  // 7-day rolling average over the same series (skips nulls inside).
  const roll = rollingAvg(series.map((v) => v ?? undefined), 7);
  const rollSegs: string[] = [];
  let rcur: string[] = [];
  for (let i = 0; i < roll.length; i++) {
    const v = roll[i];
    if (v == null) {
      if (rcur.length) { rollSegs.push(rcur.join(' ')); rcur = []; }
      continue;
    }
    rcur.push(`${rcur.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  }
  if (rcur.length) rollSegs.push(rcur.join(' '));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
         style={{ width: '100%', height: H }}
         role="img" aria-label="28-day sparkline">
      {/* faded backdrop blocks for empty days */}
      {series.map((v, i) => v == null && (
        <rect key={`g${i}`}
              x={x(i) - 1}
              y={0}
              width={2}
              height={H}
              fill="oklch(50% 0 0 / 0.10)" />
      ))}
      {segments.map((d, i) => (
        <path key={`p${i}`} d={d} fill="none" stroke="oklch(78% 0.18 200)" stroke-width="1.5" />
      ))}
      {rollSegs.map((d, i) => (
        <path key={`r${i}`} d={d} fill="none" stroke="oklch(78% 0.16 145)" stroke-width="1.25"
              stroke-dasharray="3 3" opacity="0.85" />
      ))}
    </svg>
  );
}

// ---- bucketing & reductions ----

function dayKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function bucketByDay(
  items: { id: string; summary?: SessionSummary }[],
  days: number,
  activeTags: Set<string>,
): SessionSummary[][] {
  const out: SessionSummary[][] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keyForOffset = (i: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  };
  // index by day for fast bucketing
  const byDay = new Map<string, SessionSummary[]>();
  for (const it of items) {
    const s = it.summary;
    if (!s) continue;
    if (activeTags.size > 0) {
      const tags = s.tags ?? [];
      let any = false;
      for (const t of tags) if (activeTags.has(t)) { any = true; break; }
      if (!any) continue;
    }
    const k = dayKey(s.started_at);
    if (!k) continue;
    const arr = byDay.get(k) ?? [];
    arr.push(s);
    byDay.set(k, arr);
  }
  for (let i = 0; i < days; i++) out.push(byDay.get(keyForOffset(i)) ?? []);
  return out;
}

function avgOf(arr: SessionSummary[], pick: (s: SessionSummary) => number | undefined): number | null {
  let sum = 0, n = 0;
  for (const s of arr) {
    const v = pick(s);
    if (v != null && isFinite(v)) { sum += v; n++; }
  }
  return n ? sum / n : null;
}
function minOf(arr: SessionSummary[], pick: (s: SessionSummary) => number | undefined): number | null {
  let m: number | null = null;
  for (const s of arr) {
    const v = pick(s);
    if (v == null || !isFinite(v)) continue;
    if (m == null || v < m) m = v;
  }
  return m;
}
function sumOf(arr: SessionSummary[], pick: (s: SessionSummary) => number | undefined): number {
  let sum = 0;
  for (const s of arr) {
    const v = pick(s);
    if (v != null && isFinite(v)) sum += v;
  }
  return sum;
}
