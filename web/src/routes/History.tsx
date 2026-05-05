import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import type { SessionSummary } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Pill } from '../components/ui/Pill';
import { formatDuration, formatRelative } from '../lib/format';
import { calendarHeatLevel } from '../lib/analytics';

export function History() {
  const [items, setItems] = useState<{ id: string; summary?: SessionSummary }[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.listSessions().then((d) => { if (alive) setItems(d); }).catch(() => {
      if (alive) setItems([]);
    });
    return () => { alive = false; };
  }, []);

  if (!items) {
    return (
      <div class="space-y-3 max-w-3xl mx-auto py-4">
        <Skeleton class="h-32 w-full" />
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="max-w-3xl mx-auto py-12 text-center text-ink-muted">
        No sessions yet. Tap <span class="text-ink">Start session</span> on Live.
      </div>
    );
  }

  // Calendar heat-strip across the last ~28 entries.
  const recent = items.slice(0, 28).reverse();

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
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

      <ul class="space-y-2">
        {items.map((it) => (
          <li>
            <a href={`/sessions/${encodeURIComponent(it.id)}`}
               class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-2 hover:bg-surface-2/70">
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">
                  {it.summary?.started_at ?? it.id}
                </div>
                <div class="text-xs text-ink-muted">
                  {formatRelative(it.summary?.started_at)}
                  {' · '}
                  {formatDuration(it.summary?.duration_s ?? 0)}
                </div>
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
        ))}
      </ul>
    </div>
  );
}
