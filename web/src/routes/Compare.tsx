// Overlay two sessions on a shared time axis (minutes since each
// session's own start). Useful for comparing "last Wed" vs "this Wed"
// or sober vs after-alcohol nights.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { api, type Sample, type SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { formatBpm, formatDuration } from '../lib/format';

interface Loaded {
  id: string;
  summary: SessionSummary;
  samples: Sample[];
}

export function Compare() {
  const { url, route } = useLocation();
  const params = useMemo(() => new URLSearchParams(url.split('?')[1] ?? ''), [url]);
  const a = params.get('a') ?? '';
  const b = params.get('b') ?? '';

  const [aData, setA] = useState<Loaded | null>(null);
  const [bData, setB] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    Promise.all([
      Promise.all([api.getSession(a), api.rawSession(a)]),
      Promise.all([api.getSession(b), api.rawSession(b)]),
    ]).then(([[sa, ra], [sb, rb]]) => {
      if (!alive) return;
      setA({ id: a, summary: sa, samples: ra });
      setB({ id: b, summary: sb, samples: rb });
    }).catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [a, b]);

  if (!a || !b) {
    return (
      <div class="max-w-3xl mx-auto py-6 space-y-3">
        <p class="text-sm text-ink-muted">
          Compare needs two session ids: <code>?a=…&amp;b=…</code>.
        </p>
        <Button variant="ghost" onClick={() => route('/history')}>Back to history</Button>
      </div>
    );
  }
  if (error) {
    return <div class="max-w-3xl mx-auto py-6 text-bad">Couldn't load: {error}</div>;
  }
  if (!aData || !bData) {
    return (
      <div class="space-y-3 max-w-3xl mx-auto py-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-64 w-full" />
      </div>
    );
  }

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <header class="flex items-center justify-between gap-3">
        <h1 class="text-lg font-semibold tracking-tight">Compare</h1>
        <Button variant="ghost" size="sm" onClick={() => route('/history')}>Done</Button>
      </header>

      <Card title="Heart rate" hint="minutes since each session's start">
        <CompareHrChart a={aData} b={bData} />
      </Card>

      <Card title="Summary">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <SummaryColumn label="A" data={aData} colorClass="text-accent" />
          <SummaryColumn label="B" data={bData} colorClass="text-good" />
        </div>
      </Card>
    </div>
  );
}

function SummaryColumn({ label, data, colorClass }: { label: string; data: Loaded; colorClass: string }) {
  const s = data.summary;
  return (
    <div>
      <div class={[colorClass, 'text-xs font-semibold uppercase tracking-wider'].join(' ')}>
        {label} · {data.id}
      </div>
      <dl class="mt-1 space-y-0.5 font-mono">
        <Row k="HR avg"   v={`${formatBpm(s.hr_avg ?? 0)} bpm`} />
        <Row k="HR min"   v={`${formatBpm(s.hr_min ?? 0)} bpm`} />
        <Row k="Score"    v={s.sleep_score?.toString() ?? '—'} />
        <Row k="Duration" v={formatDuration(s.duration_s ?? 0)} />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div class="flex justify-between">
      <dt class="text-ink-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function CompareHrChart({ a, b }: { a: Loaded; b: Loaded }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;

    // Time axis: minutes since each session start. We need a shared
    // x-grid, so we union both sessions' minute-stamps and look up HR
    // for each.
    const aMin = a.samples.map((s) => s.t_ms / 60000);
    const bMin = b.samples.map((s) => s.t_ms / 60000);
    const xs = Array.from(new Set([...aMin, ...bMin])).sort((x, y) => x - y);
    const aHr: (number | null)[] = new Array(xs.length).fill(null);
    const bHr: (number | null)[] = new Array(xs.length).fill(null);
    const aIdx = new Map<number, number>();
    const bIdx = new Map<number, number>();
    aMin.forEach((m, i) => aIdx.set(m, i));
    bMin.forEach((m, i) => bIdx.set(m, i));
    for (let i = 0; i < xs.length; i++) {
      const ai = aIdx.get(xs[i]);
      const bi = bIdx.get(xs[i]);
      if (ai != null) {
        const v = a.samples[ai].hr_bpm;
        aHr[i] = v === 0xFFFF ? null : v;
      }
      if (bi != null) {
        const v = b.samples[bi].hr_bpm;
        bHr[i] = v === 0xFFFF ? null : v;
      }
    }

    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height: 280,
      pxAlign: false,
      legend: { show: true },
      cursor: { drag: { x: true, y: false }, points: { size: 6 } },
      scales: { x: { time: false }, y: { range: [40, 200] } },
      axes: [
        { stroke: 'oklch(72% 0 0)', label: 'minutes' },
        { stroke: 'oklch(72% 0 0)', grid: { stroke: 'oklch(35% 0 0 / 0.4)' } },
      ],
      series: [
        {},
        { label: `A · ${a.id}`, stroke: 'oklch(78% 0.18 200)', width: 1.5, scale: 'y' },
        { label: `B · ${b.id}`, stroke: 'oklch(78% 0.16 145)', width: 1.5, scale: 'y' },
      ],
    };
    const plot = new uPlot(opts, [xs, aHr, bHr], host);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height: 280 }));
    ro.observe(host);
    return () => { ro.disconnect(); plot.destroy(); plotRef.current = null; };
  }, [a, b]);

  return <div ref={hostRef} class="w-full" />;
}
