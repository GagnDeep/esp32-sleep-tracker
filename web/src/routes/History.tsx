import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../lib/api';
import type { SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDuration, formatRelative } from '../lib/format';
import { calendarHeatLevel, nightStats } from '../lib/analytics';
import { Trends } from './Trends';
import { mockSessions, shouldUseMock } from '../lib/__fixtures__/sessions';

type SortKey = 'date' | 'score' | 'duration';
type SortDir = 'asc' | 'desc';

interface Item { id: string; summary?: SessionSummary }

export function History() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<'list' | 'trends'>('list');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let alive = true;
    if (shouldUseMock()) {
      setItems(mockSessions());
      return () => { alive = false; };
    }
    api.listSessions().then((d) => { if (alive) setItems(d); }).catch(() => {
      if (alive) setItems([]);
    });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((it) => {
          const s = it.summary;
          const haystack = [
            it.id,
            s?.started_at ?? '',
            ...(s?.tags ?? []),
            s?.notes ?? '',
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        })
      : items.slice();
    list.sort((a, b) => cmp(a, b, sortKey, sortDir));
    return list;
  }, [items, query, sortKey, sortDir]);

  if (!items) {
    return (
      <div class="space-y-3 max-w-3xl mx-auto py-4">
        <Skeleton class="h-32 w-full" />
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
      </div>
    );
  }

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      <SegmentControl value={tab} onChange={setTab} />

      {tab === 'trends' ? (
        <Trends sessions={items} />
      ) : (
        <ListView
          all={items}
          filtered={filtered}
          query={query}
          onQuery={setQuery}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) => {
            if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            else { setSortKey(k); setSortDir(k === 'date' ? 'desc' : 'desc'); }
          }}
        />
      )}
    </div>
  );
}

function ListView({
  all, filtered, query, onQuery, sortKey, sortDir, onSort,
}: {
  all: Item[];
  filtered: Item[];
  query: string;
  onQuery: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  if (all.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        msg="Tap Start session on Live to record your first night."
      />
    );
  }

  // Calendar heat-strip across the last ~28 entries.
  const recent = all.slice(0, 28).reverse();

  return (
    <>
      <Card title="Last 28 nights" hint="colour = sleep score">
        <div class="grid grid-cols-7 gap-1">
          {recent.map((it) => {
            const lvl = calendarHeatLevel(it.summary?.sleep_score);
            const cls = ['', 'bg-bad/40', 'bg-warn/40', 'bg-accent-soft/60', 'bg-good/60'][lvl];
            const score = it.summary?.sleep_score;
            return (
              <a href={`/sessions/${encodeURIComponent(it.id)}`}
                 title={`${it.id}${score != null ? ` · score ${score}` : ''}`}
                 class={['block aspect-square rounded-md',
                         lvl === 0 ? 'bg-surface' : cls].join(' ')} />
            );
          })}
        </div>
      </Card>

      <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          placeholder="Search by date or tag…"
          onInput={(e) => onQuery((e.currentTarget as HTMLInputElement).value)}
          class="h-10 px-3 rounded-xl bg-surface text-ink w-full sm:max-w-xs"
        />
        <div class="flex items-center gap-1 text-xs text-ink-muted">
          <span>Sort:</span>
          <SortButton k="date"     label="Date"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortButton k="score"    label="Score"    sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortButton k="duration" label="Duration" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" msg="Try a different date or tag." />
      ) : (
        <ul class="space-y-2">
          {filtered.map((it) => <SessionRow key={it.id} it={it} />)}
        </ul>
      )}
    </>
  );
}

function SortButton({
  k, label, sortKey, sortDir, onSort,
}: { k: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
  return (
    <button type="button"
            onClick={() => onSort(k)}
            aria-pressed={active}
            class={[
              'h-7 px-2 rounded-lg text-xs',
              active ? 'bg-surface-2 text-accent' : 'bg-surface text-ink-muted hover:text-ink',
            ].join(' ')}>
      {label}{arrow ? ` ${arrow}` : ''}
    </button>
  );
}

function SessionRow({ it }: { it: Item }) {
  const ns = it.summary ? nightStats(it.summary) : null;
  return (
    <li>
      <a href={`/sessions/${encodeURIComponent(it.id)}`}
         class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-2 hover:bg-surface-2/70">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">
            {it.summary?.started_at ?? it.id}
          </div>
          <div class="text-xs text-ink-muted">
            {formatRelative(it.summary?.started_at)}
            {' · '}
            {formatDuration(it.summary?.duration_s ?? 0)}
            {it.summary?.tags && it.summary.tags.length > 0 && (
              <> · {it.summary.tags.join(', ')}</>
            )}
          </div>
          {ns && (ns.deepFrac + ns.lightFrac + ns.awakeFrac) > 0 && (
            <StageMixBar deep={ns.deepFrac} light={ns.lightFrac} awake={ns.awakeFrac} />
          )}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {it.summary?.crashed && <Pill tone="warn">crashed</Pill>}
          {it.summary?.sleep_score != null && (
            <Pill tone={it.summary.sleep_score >= 70 ? 'good' : 'warn'}>
              {it.summary.sleep_score}
            </Pill>
          )}
        </div>
      </a>
    </li>
  );
}

function StageMixBar({ deep, light, awake }: { deep: number; light: number; awake: number }) {
  const total = deep + light + awake || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  // Colours match `stageColors` from lib/format so the bar reads
  // consistently against the hypnogram.
  return (
    <div class="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-surface flex"
         aria-label="stage mix">
      <span title="Deep"
            class="block h-full"
            style={{ width: pct(deep), background: 'oklch(62% 0.14 270)' }} />
      <span title="Light"
            class="block h-full"
            style={{ width: pct(light), background: 'oklch(75% 0.12 200)' }} />
      <span title="Awake"
            class="block h-full"
            style={{ width: pct(awake), background: 'oklch(78% 0.16 60)' }} />
    </div>
  );
}

function SegmentControl({ value, onChange }: { value: 'list' | 'trends'; onChange: (v: 'list' | 'trends') => void }) {
  const opt = (v: 'list' | 'trends', label: string) => (
    <button type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            class={[
              'h-9 px-4 rounded-xl text-sm flex-1',
              value === v ? 'bg-surface-2 text-accent' : 'text-ink-muted hover:text-ink',
            ].join(' ')}>
      {label}
    </button>
  );
  return (
    <div class="inline-flex bg-surface rounded-xl p-1 w-full sm:w-auto">
      {opt('list',   'List')}
      {opt('trends', 'Trends')}
    </div>
  );
}

function cmp(a: Item, b: Item, key: SortKey, dir: SortDir): number {
  let av = 0, bv = 0;
  switch (key) {
    case 'date': {
      av = Date.parse(a.summary?.started_at ?? '') || 0;
      bv = Date.parse(b.summary?.started_at ?? '') || 0;
      break;
    }
    case 'score': {
      av = a.summary?.sleep_score ?? -1;
      bv = b.summary?.sleep_score ?? -1;
      break;
    }
    case 'duration': {
      av = a.summary?.duration_s ?? 0;
      bv = b.summary?.duration_s ?? 0;
      break;
    }
  }
  return dir === 'asc' ? av - bv : bv - av;
}
