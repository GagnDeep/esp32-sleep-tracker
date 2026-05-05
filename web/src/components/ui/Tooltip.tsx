import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

interface Props {
  text: string;
  children: ComponentChildren;
  side?: 'top' | 'bottom';
}

// Lightweight tooltip primitive. Wraps a single trigger; we render the
// floating label as an absolutely-positioned span next to it. Uses
// hover and focus events so keyboard users get the tooltip too.
export function Tooltip({ text, children, side = 'top' }: Props) {
  const [open, setOpen] = useState(false);
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const pos = side === 'top'
    ? 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2'
    : 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2';
  return (
    <span
      class="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          class={[
            'pointer-events-none absolute z-40 whitespace-nowrap',
            'rounded-md bg-surface-2 px-2 py-1 text-xs text-ink shadow-soft border border-surface',
            pos,
          ].join(' ')}
        >
          {text}
        </span>
      )}
    </span>
  );
}
