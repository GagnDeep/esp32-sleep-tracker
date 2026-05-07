import type { ComponentChildren, VNode } from 'preact';
import { Sparkline } from './Sparkline';

export type StatTone = 'default' | 'accent' | 'warn' | 'bad' | 'good';
export type TrendDirection = 'up' | 'down' | 'flat';

export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: StatTone;
  /**
   * Trend display. Provide `delta` (signed number, e.g. +3 or -1.5) to render
   * a chevron and the absolute delta. Provide `direction` to override the
   * automatic chevron direction inferred from delta.
   */
  trend?: {
    delta: number;
    direction?: TrendDirection;
    deltaUnit?: string;
    /** 'positive' chevron color when delta is up, etc. Default 'natural'. */
    semantics?: 'natural' | 'inverted';
  };
  /** Inline sparkline footer values; rendered with the existing Sparkline component. */
  spark?: ReadonlyArray<number>;
  /** Override aria-label; otherwise composed from props. */
  ariaLabel?: string;
  /** Click handler — when present, the card becomes a <button> with focus ring. */
  onClick?: () => void;
  class?: string;
  children?: ComponentChildren;
}

const tones: Record<StatTone, string> = {
  default: 'text-ink',
  accent:  'text-accent',
  warn:    'text-warn',
  bad:     'text-bad',
  good:    'text-good',
};

function inferDirection(delta: number): TrendDirection {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/** SVG chevron glyph. `dir` up = ↑, down = ↓, flat = →. */
function Chevron({ dir }: { dir: TrendDirection }): VNode {
  const path =
    dir === 'up'   ? 'M12 19V5m0 0l-5 5m5-5l5 5' :
    dir === 'down' ? 'M12 5v14m0 0l-5-5m5 5l5-5' :
                     'M5 12h14m0 0l-5-5m5 5l-5 5';
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Private sub-component that renders the trend chevron + delta text.
 * Color is computed internally from `dir` + `semantics` so the parent
 * does not need to pass a pre-computed color string.
 * The parent still computes `dir` once for the aria-label addendum; this
 * component recomputes it independently to keep its own concerns local.
 */
function TrendRow({ trend }: { trend: NonNullable<StatCardProps['trend']> }): VNode {
  const dir = trend.direction ?? inferDirection(trend.delta);
  const inverted = trend.semantics === 'inverted';
  const color =
    dir === 'flat' ? 'text-ink-muted' :
    dir === 'up'   ? (inverted ? 'text-bad'  : 'text-good') :
                     (inverted ? 'text-good' : 'text-bad');
  const sign = trend.delta >= 0 ? '+' : '−';
  const abs = Math.abs(trend.delta);
  return (
    <div class={['flex items-baseline gap-1 text-xs', color].join(' ')}>
      <Chevron dir={dir} />
      <span class="tabular-nums">{`${sign}${abs}${trend.deltaUnit ? ' ' + trend.deltaUnit : ''}`}</span>
    </div>
  );
}

export function StatCard(props: StatCardProps): VNode {
  const {
    label,
    value,
    unit,
    hint,
    tone = 'default',
    trend,
    spark,
    ariaLabel,
    onClick,
    class: cls,
    children,
  } = props;

  // Compute direction once for the aria-label addendum.
  // TrendRow recomputes independently — avoids threading an extra prop
  // through a private component for a single-consumer value.
  const dir = trend ? (trend.direction ?? inferDirection(trend.delta)) : null;

  // Compose aria-label.
  let computedAriaLabel = `${label}: ${value}${unit ? ' ' + unit : ''}`;
  if (trend && dir) {
    computedAriaLabel += `, trend ${dir} ${Math.abs(trend.delta)}`;
  }
  const finalAriaLabel = ariaLabel ?? computedAriaLabel;

  const baseClass = [
    'rounded-2xl bg-surface-2 p-4 shadow-soft flex flex-col gap-1 min-w-0',
    onClick ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent' : '',
    cls ?? '',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {/* Label row */}
      <span class="text-xs uppercase tracking-wider text-ink-muted">{label}</span>

      {/* Value row */}
      <div class="flex items-baseline gap-1.5">
        <span class={['font-mono text-3xl tabular-nums leading-none', tones[tone]].join(' ')}>
          {value}
        </span>
        {unit && <span class="text-sm text-ink-muted">{unit}</span>}
      </div>

      {/* Hint */}
      {hint && <span class="text-xs text-ink-muted truncate">{hint}</span>}

      {/* Trend row */}
      {trend && <TrendRow trend={trend} />}

      {/* Children slot (chip, breakdown bar, etc.) */}
      {children}

      {/* Sparkline footer */}
      {spark && (
        <div class="mt-1">
          <Sparkline
            values={spark}
            width={200}
            height={24}
            class="w-full opacity-70"
          />
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        class={baseClass}
        aria-label={finalAriaLabel}
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  return (
    <div role="region" class={baseClass} aria-label={finalAriaLabel}>
      {inner}
    </div>
  );
}
