// Display helpers. Keep these pure so they can be reused in tests
// without DOM access.

import { signal, effect } from '@preact/signals';

const TZ_KEY = 'display.timezone';

function readInitialTz(): string {
  try {
    const v = localStorage.getItem(TZ_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return 'auto';
}

// 'auto' means use the browser's resolved zone; otherwise an IANA tz id
// like 'America/New_York'. We persist the literal string the user picked
// (including 'auto') so the UI control round-trips faithfully.
export const displayTimezone = signal<string>(readInitialTz());

effect(() => {
  try { localStorage.setItem(TZ_KEY, displayTimezone.value); } catch { /* ignore */ }
});

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

// ---------- tz-aware date/time ----------

type DateFmt = 'short' | 'medium' | 'long';
type TimeFmt = 'short' | 'long' | 'none';

function toDate(input: string | number | Date): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    // Treat unix-seconds as well as unix-millis: anything below ~10^12
    // is almost certainly seconds.
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(input);
  if (isNaN(t)) return null;
  return new Date(t);
}

function tzOption(): string | undefined {
  const v = displayTimezone.value;
  return !v || v === 'auto' ? undefined : v;
}

const dateStyleMap: Record<DateFmt, 'short' | 'medium' | 'long'> = {
  short:  'short',
  medium: 'medium',
  long:   'long',
};
const timeStyleMap: Record<Exclude<TimeFmt, 'none'>, 'short' | 'long'> = {
  short: 'short',
  long:  'long',
};

export function formatDateTime(
  input: string | number | Date,
  opts: { date?: DateFmt; time?: TimeFmt } = {},
): string {
  const d = toDate(input);
  if (!d) return '—';
  const dateOpt: DateFmt = opts.date ?? 'medium';
  const timeOpt: TimeFmt = opts.time ?? 'short';
  const fmtOpts: Intl.DateTimeFormatOptions = { dateStyle: dateStyleMap[dateOpt] };
  if (timeOpt !== 'none') fmtOpts.timeStyle = timeStyleMap[timeOpt];
  const tz = tzOption();
  if (tz) fmtOpts.timeZone = tz;
  try {
    return new Intl.DateTimeFormat(undefined, fmtOpts).format(d);
  } catch {
    // bad tz id — retry without it rather than crashing the UI.
    delete fmtOpts.timeZone;
    return new Intl.DateTimeFormat(undefined, fmtOpts).format(d);
  }
}

export function formatDate(input: string | number | Date, fmt: DateFmt = 'medium'): string {
  return formatDateTime(input, { date: fmt, time: 'none' });
}

export function formatTime(input: string | number | Date, fmt: 'short' | 'long' = 'short'): string {
  const d = toDate(input);
  if (!d) return '—';
  const fmtOpts: Intl.DateTimeFormatOptions = { timeStyle: fmt };
  const tz = tzOption();
  if (tz) fmtOpts.timeZone = tz;
  try {
    return new Intl.DateTimeFormat(undefined, fmtOpts).format(d);
  } catch {
    delete fmtOpts.timeZone;
    return new Intl.DateTimeFormat(undefined, fmtOpts).format(d);
  }
}

// ---------- sleep score bands ----------

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Map a sleep score (0-100) to a band label.
 * Bands: 0-49 poor, 50-69 fair, 70-84 good, 85-100 excellent.
 * Sentinel values (NaN, undefined, negative): 'poor'.
 */
export function scoreBand(score: number): ScoreBand {
  if (!isFinite(score) || score < 0) return 'poor';
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

/** Human-readable label for a band, e.g., 'Excellent'. */
export function scoreBandLabel(band: ScoreBand): string {
  const labels: Record<ScoreBand, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };
  return labels[band];
}

export function scoreBandTone(band: ScoreBand): 'good' | 'accent' | 'warn' | 'bad' {
  const tones: Record<ScoreBand, 'good' | 'accent' | 'warn' | 'bad'> = {
    excellent: 'good',
    good: 'accent',
    fair: 'warn',
    poor: 'bad',
  };
  return tones[band];
}

// "Hour:minute" string from minutes-of-day, used for alarm rendering.
// Doesn't take displayTimezone — minutes-of-day are already local to
// the device's wall clock.
export function formatHourMin(minutesOfDay: number): string {
  if (!isFinite(minutesOfDay) || minutesOfDay < 0) return '—';
  const m = Math.floor(minutesOfDay) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
