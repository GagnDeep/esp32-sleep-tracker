interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      class={[
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-surface',
      ].join(' ')}
    >
      <span
        class={[
          'absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}
