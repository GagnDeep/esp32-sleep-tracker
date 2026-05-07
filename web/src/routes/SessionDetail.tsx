import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { api } from '../lib/api';
import type { Sample, SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { HypnogramChart } from '../components/charts/HypnogramChart';
import { MovementChart } from '../components/charts/MovementChart';
import { formatBpm, formatDuration, formatPct, formatTime, stageLabels } from '../lib/format';
import { notify } from '../lib/toast';
import { debounce } from '../lib/debounce';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

const TAGS = [
  'sick', 'workout', 'alcohol', 'travel',
  'caffeine', 'medication', 'nap', 'napless',
] as const;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SessionDetail() {
  const { params } = useRoute();
  const { route } = useLocation();
  const id = params.id;
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [tagSave, setTagSave] = useState<SaveState>('idle');
  const [noteSave, setNoteSave] = useState<SaveState>('idle');

  const [picker, setPicker] = useState(false);
  const [recent, setRecent] = useState<{ id: string; summary?: SessionSummary }[] | null>(null);

  const [tagMenu, setTagMenu] = useState(false);

  // Track latest pending tag list for debounced PATCH (state may not be
  // up to date inside the debounced closure).
  const tagsRef = useRef<string[]>([]);
  const notesRef = useRef('');

  useEffect(() => {
    let alive = true;
    Promise.all([api.getSession(id), api.rawSession(id)])
      .then(([s, raw]) => {
        if (!alive) return;
        setSummary(s);
        setSamples(raw);
        setTags(s.tags ?? []);
        tagsRef.current = s.tags ?? [];
        setNotes(s.notes ?? '');
        notesRef.current = s.notes ?? '';
      })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [id]);

  // Build debounced PATCH callbacks. Recreate when id changes so we
  // don't accidentally PATCH the previous session.
  const patchTags = useMemo(() => debounce(async (next: string[]) => {
    setTagSave('saving');
    try {
      await api.patchSession(id, { tags: next });
      setTagSave('saved');
      setTimeout(() => setTagSave((s) => (s === 'saved' ? 'idle' : s)), 1200);
    } catch (e) {
      setTagSave('error');
      notify('error', `Couldn't save tags: ${(e as Error).message}`);
    }
  }, 800), [id]);

  const patchNotes = useMemo(() => debounce(async (next: string) => {
    setNoteSave('saving');
    try {
      await api.patchSession(id, { notes: next });
      setNoteSave('saved');
      setTimeout(() => setNoteSave((s) => (s === 'saved' ? 'idle' : s)), 1200);
    } catch (e) {
      setNoteSave('error');
      notify('error', `Couldn't save notes: ${(e as Error).message}`);
    }
  }, 800), [id]);

  // On unmount, flush any pending debounced PATCH immediately so edits
  // are not lost when the user navigates away during the debounce window.
  useEffect(() => () => { patchTags.flush(); patchNotes.flush(); }, [patchTags, patchNotes]);

  const updateTags = (next: string[]) => {
    setTags(next);
    tagsRef.current = next;
    patchTags(next);
  };

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
  const startedAtMs = summary.started_at ? Date.parse(summary.started_at) : 0;

  const openCompare = async () => {
    setPicker(true);
    if (recent == null) {
      try {
        const list = await api.listSessions();
        setRecent(list.filter((it) => it.id !== id).slice(0, 20));
      } catch {
        setRecent([]);
      }
    }
  };

  const copyShare = async () => {
    const url = `${window.location.origin}/sessions/${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('success', 'Share link copied.');
    } catch {
      notify('error', "Couldn't copy. Long-press to select instead.");
    }
  };

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
          <Button variant="ghost" size="sm" onClick={copyShare}>Copy link</Button>
          <Button variant="ghost" size="sm" onClick={openCompare}>Compare to…</Button>
        </div>
      </header>

      <Card title="Stages" hint="hypnogram">
        <HypnogramChart data={stages} />
      </Card>

      <Card title="Heart rate + SpO₂"
            hint={<ExportPng />}>
        <DetailHrChart ts={ts} hr={hr} sx={sx} stages={stages} startedAtMs={startedAtMs} />
      </Card>

      <Card title="Movement">
        <MovementChart data={[ts, act]} />
      </Card>

      <Card title="Tags">
        <div class="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} class="inline-flex items-center gap-1 h-7 pl-3 pr-1 rounded-full bg-accent-soft/30 text-accent text-xs">
              {t}
              <button type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => updateTags(tags.filter((x) => x !== t))}
                      class="h-5 w-5 rounded-full hover:bg-surface-2 flex items-center justify-center">×</button>
            </span>
          ))}
          <div class="relative">
            <button type="button"
                    onClick={() => setTagMenu((v) => !v)}
                    class="h-7 px-3 rounded-full bg-surface text-ink-muted hover:text-ink text-xs">
              + Add tag
            </button>
            {tagMenu && (
              <div role="menu"
                   class="absolute z-10 mt-1 left-0 rounded-xl bg-surface-2 shadow-soft p-1 min-w-[8rem]">
                {TAGS.filter((t) => !tags.includes(t)).map((t) => (
                  <button type="button"
                          key={t}
                          role="menuitem"
                          onClick={() => { updateTags([...tags, t]); setTagMenu(false); }}
                          class="block w-full text-left px-3 h-8 rounded-lg text-xs hover:bg-surface">
                    {t}
                  </button>
                ))}
                {TAGS.every((t) => tags.includes(t)) && (
                  <div class="px-3 py-1.5 text-xs text-ink-muted">All tags applied.</div>
                )}
              </div>
            )}
          </div>
          <SaveBadge state={tagSave} />
        </div>
      </Card>

      <Card title="Notes">
        <textarea
          value={notes}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLTextAreaElement).value;
            setNotes(v);
            notesRef.current = v;
            patchNotes(v);
          }}
          rows={4}
          placeholder="How'd you feel? Anything unusual?"
          class="w-full rounded-xl bg-surface text-ink p-3 text-sm" />
        <div class="mt-1 flex justify-end"><SaveBadge state={noteSave} /></div>
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

      <Dialog open={picker} title="Compare to…" onClose={() => setPicker(false)}>
        {recent == null ? (
          <Skeleton class="h-32 w-full" />
        ) : recent.length === 0 ? (
          <p class="text-sm text-ink-muted">No other sessions yet.</p>
        ) : (
          <ul class="space-y-1 max-h-[50vh] overflow-auto">
            {recent.map((it) => (
              <li>
                <button type="button"
                        onClick={() => {
                          setPicker(false);
                          route(`/compare?a=${encodeURIComponent(id)}&b=${encodeURIComponent(it.id)}`);
                        }}
                        class="w-full text-left px-3 h-10 rounded-xl hover:bg-surface flex items-center justify-between gap-2">
                  <span class="text-sm truncate">{it.summary?.started_at ?? it.id}</span>
                  {it.summary?.sleep_score != null && (
                    <Pill tone={it.summary.sleep_score >= 70 ? 'good' : 'warn'}>
                      {it.summary.sleep_score}
                    </Pill>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const tone = state === 'error' ? 'bad' : state === 'saved' ? 'good' : 'neutral';
  const label = state === 'error' ? 'Couldn’t save' : state === 'saved' ? 'Saved' : 'Saving…';
  return <Pill tone={tone}>{label}</Pill>;
}

function ExportPng() {
  const onClick = () => {
    // Grab the closest .uplot canvas relative to the click target's
    // container. We walk up until we find one rather than scanning the
    // whole document — there may be more than one chart on the page.
    const card = (document.activeElement as HTMLElement | null)?.closest('section') ?? null;
    const canvas = (card?.querySelector('.uplot canvas')
                 ?? document.querySelector('.uplot canvas')) as HTMLCanvasElement | null;
    if (!canvas) { notify('warn', 'No chart canvas found.'); return; }
    canvas.toBlob((blob) => {
      if (!blob) { notify('error', 'PNG export failed.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'session-hr-spo2.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };
  return (
    <button type="button"
            onClick={onClick}
            class="text-xs text-ink-muted hover:text-ink underline-offset-2 hover:underline">
      Export PNG
    </button>
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

// Custom HR/SpO2 chart with cursor tooltip + zoom/reset. Keeps the
// shared HrSpo2Chart simple for the live route while handing this one
// the extra interactivity the detail view needs.
function DetailHrChart({
  ts, hr, sx, stages, startedAtMs,
}: {
  ts: number[]; hr: (number | null)[]; sx: (number | null)[];
  stages: { t: number; stage: number }[]; startedAtMs: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{
    left: number; top: number;
    t: number; hr: number | null; sp: number | null; stage: number;
  } | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const data: uPlot.AlignedData = [ts, hr, sx];

    // Build a quick stage lookup: nearest-prior segment.
    const stageAt = (t: number): number => {
      // binary search would be nicer but stages.length is small
      let last = 0;
      for (const s of stages) {
        if (s.t > t) break;
        last = s.stage;
      }
      return last;
    };

    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height: 240,
      pxAlign: false,
      legend: { show: false },
      cursor: {
        drag: { x: true, y: false, dist: 10 },
        points: { size: 6 },
      },
      scales: {
        x: { time: false },
        y: { range: [40, 200] },
        spo2: { range: [80, 100] },
      },
      axes: [
        { stroke: 'oklch(72% 0 0)' },
        { stroke: 'oklch(78% 0.18 200)', scale: 'y',    grid: { stroke: 'oklch(35% 0 0 / 0.4)' } },
        { stroke: 'oklch(78% 0.16 145)', scale: 'spo2', side: 1, grid: { show: false } },
      ],
      series: [
        {},
        { label: 'HR',   stroke: 'oklch(78% 0.18 200)', width: 2, scale: 'y' },
        { label: 'SpO₂', stroke: 'oklch(78% 0.16 145)', width: 2, scale: 'spo2' },
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx == null || idx < 0) { setHover(null); return; }
            const t = ts[idx];
            const left = u.valToPos(t, 'x');
            // top = above the HR point if available, otherwise center
            const yv = hr[idx];
            const top = yv != null ? u.valToPos(yv, 'y') : u.bbox.height / 2 / devicePixelRatio;
            setHover({
              left,
              top,
              t,
              hr: hr[idx],
              sp: sx[idx],
              stage: stageAt(t),
            });
          },
        ],
      },
    };
    const plot = new uPlot(opts, data, host);

    const dbl = () => plot.setData(data, true);
    host.addEventListener('dblclick', dbl);

    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height: 240 }));
    ro.observe(host);
    return () => {
      host.removeEventListener('dblclick', dbl);
      ro.disconnect();
      plot.destroy();
    };
  }, [ts, hr, sx, stages]);

  return (
    <div class="relative" ref={hostRef}>
      {hover && (
        <div role="status"
             style={{
               left: `${Math.max(8, Math.min((hostRef.current?.clientWidth ?? 300) - 180, hover.left + 8))}px`,
               top:  `${Math.max(0, hover.top - 56)}px`,
             }}
             class="pointer-events-none absolute z-10 rounded-lg bg-surface-2 border border-surface px-2 py-1.5 text-xs shadow-soft min-w-[160px]">
          <div class="text-ink-muted">
            {startedAtMs
              ? formatTime(startedAtMs + hover.t * 1000, 'short')
              : `${(hover.t / 60).toFixed(1)} min`}
          </div>
          <div class="font-mono tabular-nums">
            HR <span class="text-accent">{hover.hr != null ? `${hover.hr}` : '—'}</span>
            {' · '}
            SpO₂ <span class="text-good">{hover.sp != null ? hover.sp.toFixed(1) : '—'}</span>
          </div>
          <div class="text-ink-muted">{stageLabels[hover.stage]}</div>
        </div>
      )}
    </div>
  );
}
