import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface Props {
  /** [seconds, activity 0..1000]. */
  data: [number[], (number | null)[]];
  height?: number;
}

const accent = 'oklch(75% 0.12 200)';

export function MovementChart({ data, height = 120 }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height,
      pxAlign: false,
      legend: { show: false },
      cursor: { drag: { x: true, y: false }, points: { size: 4 } },
      scales: {
        x: { time: false },
        y: { range: [0, 1000] },
      },
      axes: [
        { stroke: 'oklch(72% 0 0)' },
        { stroke: accent, grid: { stroke: 'oklch(35% 0 0 / 0.3)' } },
      ],
      series: [
        {},
        {
          label: 'Activity',
          stroke: accent,
          width: 1.5,
          fill: 'oklch(75% 0.12 200 / 0.18)',
        },
      ],
    };
    const plot = new uPlot(opts, data, host);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height }));
    ro.observe(host);
    return () => { ro.disconnect(); plot.destroy(); plotRef.current = null; };
  }, []);

  useEffect(() => {
    if (plotRef.current) plotRef.current.setData(data);
  }, [data]);

  return <div ref={hostRef} class="w-full" />;
}
