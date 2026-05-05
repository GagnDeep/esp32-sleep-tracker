interface Props {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'warn' | 'bad';
}

const tones = {
  default: 'text-ink',
  accent:  'text-accent',
  warn:    'text-warn',
  bad:     'text-bad',
};

export function NumberTile({ label, value, unit, hint, tone = 'default' }: Props) {
  return (
    <div class="rounded-2xl bg-surface-2 p-4 shadow-soft flex flex-col gap-1 min-w-0">
      <span class="text-xs uppercase tracking-wider text-ink-muted">{label}</span>
      <div class="flex items-baseline gap-1.5">
        <span class={['font-mono text-3xl tabular-nums leading-none', tones[tone]].join(' ')}>{value}</span>
        {unit && <span class="text-sm text-ink-muted">{unit}</span>}
      </div>
      {hint && <span class="text-xs text-ink-muted truncate">{hint}</span>}
    </div>
  );
}
