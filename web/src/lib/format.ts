// Display helpers. Keep these pure so they can be reused in tests
// without DOM access.

export function formatBpm(bpm: number): string {
  if (!bpm || bpm === 0xFFFF) return '—';
  return `${bpm}`;
}

export function formatPct(pct: number, digits = 1): string {
  if (!pct || pct >= 200) return '—';
  return pct.toFixed(digits);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatRelative(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (isNaN(t)) return iso;
  const diff = (t - now) / 1000;
  const a = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (a < 60)        return fmt.format(Math.round(diff), 'second');
  if (a < 3600)      return fmt.format(Math.round(diff / 60), 'minute');
  if (a < 86400)     return fmt.format(Math.round(diff / 3600), 'hour');
  if (a < 30 * 86400) return fmt.format(Math.round(diff / 86400), 'day');
  return fmt.format(Math.round(diff / (30 * 86400)), 'month');
}

export const stageLabels: Record<number, string> = {
  0: 'Unknown',
  1: 'Awake',
  2: 'Light',
  3: 'Deep',
};

export const stageColors: Record<number, string> = {
  0: 'oklch(50% 0 0)',
  1: 'oklch(78% 0.16 60)',
  2: 'oklch(75% 0.12 200)',
  3: 'oklch(62% 0.14 270)',
};
