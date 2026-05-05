// Stage band rendered as horizontal coloured strips. We don't need
// uPlot for this; SVG keeps it crisp at any width and easy to a11y.
import { stageColors, stageLabels } from '../../lib/format';

interface Props {
  /** [t_seconds, stage]. We assume contiguous samples sorted by t. */
  data: { t: number; stage: number }[];
  height?: number;
}

export function HypnogramChart({ data, height = 56 }: Props) {
  if (data.length < 2) {
    return <div class="rounded-xl bg-surface p-4 text-sm text-ink-muted">Not enough data yet.</div>;
  }
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const span = Math.max(1, t1 - t0);

  const segs: { x: number; w: number; stage: number }[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    segs.push({
      x: ((data[i].t   - t0) / span) * 100,
      w: ((data[i+1].t - data[i].t) / span) * 100,
      stage: data[i].stage,
    });
  }

  return (
    <div class="space-y-2">
      <svg viewBox="0 0 100 1" preserveAspectRatio="none"
           role="img" aria-label="Sleep stage timeline"
           style={{ width: '100%', height }}>
        {segs.map((s, i) => (
          <rect key={i} x={s.x} y={0} width={s.w + 0.05} height={1} fill={stageColors[s.stage]} />
        ))}
      </svg>
      <ul class="flex flex-wrap gap-3 text-xs text-ink-muted">
        {[1, 2, 3].map((st) => (
          <li class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-sm" style={{ background: stageColors[st] }} />
            {stageLabels[st]}
          </li>
        ))}
      </ul>
    </div>
  );
}
