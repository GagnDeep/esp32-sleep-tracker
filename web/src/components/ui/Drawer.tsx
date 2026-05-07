import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Drawer title — rendered in header. Also used as accessible name. */
  title?: string;
  /** Side: right (default), left. */
  side?: 'right' | 'left';
  /** Width Tailwind class. Default 'w-96'. */
  widthClass?: string;
  /** Optional footer slot (sticky bottom). */
  footer?: ComponentChildren;
  children?: ComponentChildren;
  /** Optional ID for the drawer's labelling element (defaults internally). */
  ariaLabelledBy?: string;
}

export function Drawer(props: DrawerProps): VNode | null {
  const {
    open,
    onClose,
    title,
    side = 'right',
    widthClass = 'w-96',
    footer,
    children,
    ariaLabelledBy,
  } = props;

  const internalId = useId();
  const labelId = ariaLabelledBy ?? `drawer-title-${internalId}`;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Slide-in: start off-screen, flip to translate-x-0 on next animation frame
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => { cancelAnimationFrame(id); setMounted(false); };
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus management: save previous focus, move to close button, restore on close
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const positionClass = side === 'left' ? 'left-0' : 'right-0';
  const translate = mounted ? 'translate-x-0' : (side === 'left' ? '-translate-x-full' : 'translate-x-full');

  return (
    <div class="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        class="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        class={[
          'absolute top-0 bottom-0',
          positionClass,
          widthClass,
          'bg-surface-2 shadow-soft flex flex-col',
          'motion-safe:transition-transform motion-safe:duration-200',
          translate,
        ].join(' ')}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-surface-3 shrink-0">
          {title
            ? <h2 id={labelId} class="text-base font-semibold truncate">{title}</h2>
            : <span id={labelId} aria-hidden="true" />
          }
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            class="ml-2 rounded-md p-1 text-ink-muted hover:text-ink hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 shrink-0"
          >
            {/* × icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div class="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div class="shrink-0 px-4 py-3 border-t border-surface-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
