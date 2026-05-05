interface Props {
  score?: number;
  size?: number;
  label?: string;
}

export function ScoreRing({ score, size = 120, label }: Props) {
  const v = Math.max(0, Math.min(100, score ?? 0));
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - v / 100);
  const tone =
    score == null ? 'oklch(50% 0 0)'
    : v >= 80     ? 'oklch(78% 0.16 145)'
    : v >= 60     ? 'oklch(82% 0.16 90)'
    :               'oklch(70% 0.18 25)';

  return (
    <div class="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} class="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r}
                fill="none" stroke="oklch(var(--surface-2))" stroke-width="10" />
        <circle cx={size/2} cy={size/2} r={r}
                fill="none" stroke={tone} stroke-width="10"
                stroke-linecap="round"
                stroke-dasharray={c} stroke-dashoffset={dash} />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="text-3xl font-mono tabular-nums leading-none" style={{ color: tone }}>
          {score == null ? '—' : Math.round(v)}
        </span>
        {label && <span class="mt-1 text-xs uppercase tracking-wider text-ink-muted">{label}</span>}
      </div>
    </div>
  );
}
