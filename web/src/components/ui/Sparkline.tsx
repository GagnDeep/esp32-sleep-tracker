import type { VNode } from 'preact';

interface Props {
  values: ReadonlyArray<number>;
  width?: number;
  height?: number;
  /** Stroke color (CSS / OKLCH). Default 'currentColor'. */
  stroke?: string;
  /** Stroke width in px. Default 1.5. */
  strokeWidth?: number;
  /** Optional baseline drawn as a 1px hairline behind the line. */
  baseline?: number;
  /** Aria label for screen readers. */
  ariaLabel?: string;
  /** Optional class on the SVG root for layout. */
  class?: string;
}

export function Sparkline(props: Props): VNode {
  const {
    values,
    width = 64,
    height = 20,
    stroke = 'currentColor',
    strokeWidth = 1.5,
    baseline,
    class: cls,
  } = props;

  // Filter out NaN but keep indices for x-positioning.
  const valid = values.map((v, i) => ({ v, i })).filter(p => isFinite(p.v));

  // Need at least 2 valid points to draw anything meaningful.
  if (valid.length < 2) {
    return <svg width={width} height={height} class={cls} aria-hidden="true" />;
  }

  const n = values.length;
  const inset = strokeWidth / 2;
  const xRange = width - strokeWidth;
  const yRange = height - strokeWidth;

  // Compute data range; handle flat lines.
  let lo = Infinity, hi = -Infinity;
  for (const { v } of valid) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const dataRange = hi - lo || 1; // avoid division by zero

  const toX = (i: number) => inset + (i / (n - 1)) * xRange;
  const toY = (v: number) => inset + (1 - (v - lo) / dataRange) * yRange;

  // Build path — pen-up across NaN spans using multiple M commands.
  let d = '';
  let penDown = false;
  for (const { v, i } of valid) {
    const x = toX(i).toFixed(2);
    const y = toY(v).toFixed(2);
    if (!penDown) {
      d += `M${x},${y}`;
      penDown = true;
    } else {
      d += `L${x},${y}`;
    }
    // If the next position is not the next valid entry, lift pen.
    const nextValid = valid.find(p => p.i > i);
    if (nextValid && nextValid.i !== i + 1) penDown = false;
  }

  // Baseline hairline (clamp to box).
  let baselinePath: VNode | null = null;
  if (baseline !== undefined) {
    const by = Math.max(inset, Math.min(height - inset, toY(baseline)));
    baselinePath = (
      <line
        x1={0} y1={by.toFixed(2)} x2={width} y2={by.toFixed(2)}
        stroke="currentColor"
        stroke-opacity="0.3"
        stroke-width="1"
      />
    );
  }

  const first = valid[0].v;
  const last = valid[valid.length - 1].v;
  const label = props.ariaLabel ?? `Trend: ${valid.length} points, ${first} to ${last}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={label}
      role="img"
      class={cls}
    >
      <title>{label}</title>
      {baselinePath}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        stroke-width={strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
