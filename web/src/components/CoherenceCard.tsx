import { useEffect, useRef, useState } from 'preact/hooks';
import { liveCoherence } from '../lib/store';
import { Card } from './ui/Card';
import { NumberTile } from './ui/NumberTile';
import { Pill } from './ui/Pill';
import { Sparkline } from './ui/Sparkline';
import {
  coherenceLevelTone,
  formatCoherenceLevel,
} from '../lib/format';

interface Props {
  /** Rolling window in seconds for the ratio sparkline. */
  windowS?: number;
}

/**
 * HeartMath-style HRV coherence at a glance.
 *
 * Shows the live 0–16 score, the Low/Med/High classification, the
 * coherence ratio + dominant breathing frequency, the cumulative
 * achievement counter, and a sparkline of recent ratios.
 *
 * Frames arrive every ~5 s from the firmware coherence pipeline. The
 * sparkline keeps a 60 s rolling view by default; long-running sessions
 * silently drop the oldest samples.
 */
export function CoherenceCard({ windowS = 60 }: Props) {
  const c = liveCoherence.value;

  // Rolling ratio buffer. Same ref+throttle pattern as Live.tsx — but
  // coherence frames land every 5 s, so a single state ping per frame
  // is plenty (no rAF gymnastics needed).
  const ratiosRef = useRef<number[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    return liveCoherence.subscribe((s) => {
      if (!s) return;
      ratiosRef.current.push(s.ratio);
      // Keep ~12 points per minute (5 s cadence) -> windowS / 5 entries.
      const cap = Math.max(8, Math.ceil(windowS / 5));
      while (ratiosRef.current.length > cap) ratiosRef.current.shift();
      force((n) => (n + 1) & 0xFF);
    });
  }, [windowS]);

  if (!c) {
    return (
      <Card title="Coherence" hint="HRV breathing rhythm">
        <div class="text-sm text-ink-muted">
          Warming up… need ~60 s of beats to compute.
        </div>
      </Card>
    );
  }

  const levelLabel = formatCoherenceLevel(c.level);
  const tone = coherenceLevelTone(c.level);
  const tileTone =
    tone === 'good' ? 'accent' : tone === 'warn' ? 'warn' : 'bad';

  // Stale-frame indicator — coherence frames arrive every ~5 s; if more
  // than 12 s have passed since the last one, the pipeline likely
  // reset (e.g. finger off, board rebooted) and the displayed values
  // are no longer current.
  const ageMs = Date.now() - c.receivedAt;
  const stale = ageMs > 12_000;

  return (
    <Card
      title="Coherence"
      hint={`HRV breathing rhythm · ${windowS}s`}
    >
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 items-stretch">
        <NumberTile
          label="Score"
          value={String(c.score)}
          unit="/16"
          tone={tileTone}
          hint={`achievement ${c.achievement}`}
        />
        <div class="rounded-2xl bg-surface-2 p-4 shadow-soft flex flex-col gap-1 min-w-0">
          <span class="text-xs uppercase tracking-wider text-ink-muted">
            Level
          </span>
          <div>
            <Pill tone={tone}>{levelLabel}</Pill>
          </div>
          <span class="text-xs text-ink-muted truncate">
            ratio {c.ratio.toFixed(2)}
          </span>
        </div>
        <div class="rounded-2xl bg-surface-2 p-4 shadow-soft flex flex-col gap-1 min-w-0 col-span-2 sm:col-span-1">
          <span class="text-xs uppercase tracking-wider text-ink-muted">
            Breathing
          </span>
          <div class="flex items-baseline gap-1.5">
            <span class="font-mono text-2xl tabular-nums leading-none">
              {c.dominantHz > 0 ? c.dominantHz.toFixed(2) : '—'}
            </span>
            <span class="text-sm text-ink-muted">Hz</span>
          </div>
          <span class="text-xs text-ink-muted truncate">
            {c.dominantHz > 0
              ? `${(c.dominantHz * 60).toFixed(1)} breaths/min`
              : 'no peak yet'}
          </span>
        </div>
      </div>

      <div class="mt-3 flex items-center gap-3">
        <Sparkline
          values={ratiosRef.current}
          width={180}
          height={28}
          baseline={0.5}
          ariaLabel={`Coherence ratio over the last ${windowS} s`}
          class="text-accent"
        />
        {stale && (
          <Pill tone="neutral">stale ({Math.round(ageMs / 1000)}s)</Pill>
        )}
      </div>
    </Card>
  );
}
