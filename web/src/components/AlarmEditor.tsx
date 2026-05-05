import { useState } from 'preact/hooks';
import { Toggle } from './ui/Toggle';
import { Card } from './ui/Card';

interface Props {
  enabled: boolean;
  startMin: number;
  endMin: number;
  days: number;          // bit0=Sun..bit6=Sat
  onChange: (patch: Partial<Props>) => void;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function fmt(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
function parse(s: string): number {
  const [h, m] = s.split(':').map(n => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function AlarmEditor(p: Props) {
  const [start, setStart] = useState(fmt(p.startMin));
  const [end,   setEnd]   = useState(fmt(p.endMin));

  return (
    <Card title="Smart wake window" hint="Wake during light/awake stages inside this range.">
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm">Enabled</span>
        <Toggle checked={p.enabled} onChange={(v) => p.onChange({ enabled: v })} />
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="block">
          <span class="text-xs text-ink-muted">From</span>
          <input type="time" value={start}
                 onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setStart(v); p.onChange({ startMin: parse(v) }); }}
                 class="mt-1 w-full h-10 px-3 rounded-xl bg-surface text-ink" />
        </label>
        <label class="block">
          <span class="text-xs text-ink-muted">To</span>
          <input type="time" value={end}
                 onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setEnd(v); p.onChange({ endMin: parse(v) }); }}
                 class="mt-1 w-full h-10 px-3 rounded-xl bg-surface text-ink" />
        </label>
      </div>
      <div class="flex items-center justify-between">
        {DAY_LABELS.map((d, i) => {
          const on = (p.days & (1 << i)) !== 0;
          return (
            <button type="button" key={i}
                    aria-pressed={on}
                    onClick={() => p.onChange({ days: (p.days ^ (1 << i)) & 0x7F })}
                    class={[
                      'h-9 w-9 rounded-full text-sm font-medium',
                      on ? 'bg-accent text-surface' : 'bg-surface text-ink-muted',
                    ].join(' ')}>
              {d}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
