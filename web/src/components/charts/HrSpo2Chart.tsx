import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface Props {
  /** [seconds, hr_bpm, spo2_pct] arrays. */
  data: [number[], (number | null)[], (number | null)[]];
  height?: number;
  live?: boolean;
  /** Horizontal reference line on the SpO2 scale (% e.g. 90). */
  spo2Threshold?: number;
}

const accent = 'oklch(78% 0.18 200)';
const good   = 'oklch(78% 0.16 145)';
const warn   = 'oklch(72% 0.18 50)';

export function HrSpo2Chart({ data, height = 220, live, spo2Threshold }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Stash the latest threshold in a ref so the draw hook re-reads it
  // without forcing a chart rebuild on prop changes.
  const thresholdRef = useRef<number | undefined>(spo2Threshold);
  thresholdRef.current = spo2Threshold;

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height,
      pxAlign: false,
      legend: { show: false },
      cursor: { drag: { x: true, y: false }, points: { size: 6 } },
      scales: {
        x: { time: false },
        y: { range: [40, 200] },
        spo2: { range: [80, 100] },
      },
      axes: [
        { stroke: 'oklch(72% 0 0)' },
        { stroke: accent, scale: 'y',    grid: { stroke: 'oklch(35% 0 0 / 0.4)' } },
        { stroke: good,   scale: 'spo2', side: 1, grid: { show: false } },
      ],
      series: [
        {},
        { label: 'HR',   stroke: accent, width: 2, scale: 'y' },
        { label: 'SpO₂', stroke: good,   width: 2, scale: 'spo2' },
      ],
      hooks: {
        draw: [
          (u) => {
            const t = thresholdRef.current;
            if (t == null || !isFinite(t)) return;
            const ctx = u.ctx;
            const y = u.valToPos(t, 'spo2', true);
            const x0 = u.bbox.left;
            const x1 = u.bbox.left + u.bbox.width;
            ctx.save();
            ctx.strokeStyle = warn;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };
    const plot = new uPlot(opts, data, host);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height }));
    ro.observe(host);
    return () => { ro.disconnect(); plot.destroy(); plotRef.current = null; };
  }, []);

  useEffect(() => {
    if (plotRef.current) plotRef.current.setData(data, !live);
  }, [data, live]);

  // When threshold changes, redraw to update the reference line.
  useEffect(() => {
    if (plotRef.current) plotRef.current.redraw(false, true);
  }, [spo2Threshold]);

  return <div ref={hostRef} class="w-full" />;
}
