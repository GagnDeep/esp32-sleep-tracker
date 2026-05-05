import { theme, cycleTheme, themeIcon, themeLabel } from '../../lib/theme';

interface Props {
  class?: string;
  /** Render a compact icon-only variant (default) or icon + label */
  showLabel?: boolean;
}

// Cycles auto -> light -> dark -> auto on click. The icon updates from
// the current theme value so the user sees state at a glance.
export function ThemeToggle({ class: cls, showLabel = false }: Props) {
  const t = theme.value;
  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={themeLabel(t)}
      aria-label={themeLabel(t)}
      class={[
        'inline-flex items-center justify-center gap-2 h-9 px-2 rounded-xl',
        'text-ink-muted hover:text-ink hover:bg-surface-2/60',
        'transition-colors',
        cls ?? '',
      ].join(' ')}
    >
      <span aria-hidden="true" class="text-base leading-none">{themeIcon(t)}</span>
      {showLabel && <span class="text-sm">{labelFor(t)}</span>}
    </button>
  );
}

function labelFor(t: typeof theme.value): string {
  return t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark';
}
