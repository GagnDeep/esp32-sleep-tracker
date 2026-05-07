import type { VNode } from 'preact';

export type EventPinKind =
  | 'alarm-fire'
  | 'alarm-snooze'
  | 'motion-spike'
  | 'note'
  | 'wake'
  | 'custom';

export interface EventPinProps {
  /** Time of the event in ms relative to session start (or any monotonic axis). */
  t: number;
  /** Total duration in ms — used to compute fractional position [0,1]. */
  durationMs: number;
  kind: EventPinKind;
  /** Optional title (tooltip text + accessible label). */
  title?: string;
  /** Optional click handler (e.g., open the note in a drawer). */
  onClick?: () => void;
  /** Optional override icon path data (24×24 viewBox). */
  iconPath?: string;
  class?: string;
}

/**
 * Default SVG path data (24×24 viewBox) for each event kind.
 * Exported for tests. Not part of the public API for callers.
 */
export const PIN_ICONS: Record<EventPinKind, string> = {
  'alarm-fire':   'M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zm-1 15h2v1h-2v-1zm-5.5-9.5A1.5 1.5 0 0 1 4 9H2a1.5 1.5 0 0 1 1.5-1.5zM22 9h-2a1.5 1.5 0 0 1-1.5-1.5A1.5 1.5 0 0 1 20 9z',
  'alarm-snooze': 'M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zm-1 15h2v1h-2v-1zM9 10h4l-4 4h4',
  'motion-spike': 'M2 12h3l3-8 4 16 3-10 2 4 2-2h3',
  'note':         'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  'wake':         'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'custom':       'M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z',
};

const KIND_COLOR: Record<EventPinKind, string> = {
  'alarm-fire':   'text-warn',
  'alarm-snooze': 'text-ink-muted',
  'motion-spike': 'text-bad',
  'note':         'text-accent',
  'wake':         'text-good',
  'custom':       '',
};

export function EventPin(props: EventPinProps): VNode {
  const { t, durationMs, kind, title, onClick, iconPath, class: cls } = props;

  const pct = Math.min(100, Math.max(0, durationMs > 0 ? (t / durationMs) * 100 : 0));
  const label = title ?? kind;
  const d = iconPath ?? PIN_ICONS[kind];
  const color = KIND_COLOR[kind];

  const containerClass = [
    'absolute top-0 flex flex-col items-center -translate-x-1/2 pointer-events-auto',
    color,
    onClick ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent' : '',
    cls ?? '',
  ].filter(Boolean).join(' ');

  // aria-hidden="true" is kept so screen readers use aria-label on the parent
  // element as the single source of truth. The <title> still renders a browser
  // tooltip on hover even when the SVG is hidden from the accessibility tree.
  const icon = (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="currentColor" aria-hidden="true"
      class="block shrink-0"
    >
      <title>{label}</title>
      <path d={d} />
    </svg>
  );

  const hairline = (
    <span class="w-px flex-1 bg-current opacity-40" aria-hidden="true" />
  );

  if (onClick) {
    return (
      <button
        type="button"
        class={containerClass}
        style={{ left: `${pct}%`, height: '100%' }}
        aria-label={label}
        tabIndex={0}
        onClick={onClick}
      >
        {icon}
        {hairline}
      </button>
    );
  }

  return (
    <span
      class={containerClass}
      style={{ left: `${pct}%`, height: '100%' }}
      aria-label={label}
      role="img"
    >
      {icon}
      {hairline}
    </span>
  );
}
