import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: ComponentChildren;
}

// Controlled modal: ESC closes, overlay click closes, focus is trapped
// to elements inside the dialog. Distinct from <Sheet/> which slides in
// from the bottom on mobile — this one is a centered card on every
// breakpoint, suited to confirmations and small forms.
export function Dialog({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement;
    // Focus the first focusable element inside the dialog.
    const first = ref.current?.querySelector<HTMLElement>(focusableSelector());
    (first ?? ref.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && ref.current) {
        const els = Array.from(
          ref.current.querySelectorAll<HTMLElement>(focusableSelector()),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (els.length === 0) { e.preventDefault(); return; }
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to wherever it was before the dialog opened.
      if (lastFocused.current instanceof HTMLElement) {
        lastFocused.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div onClick={onClose} class="absolute inset-0" aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        class="relative w-full max-w-md bg-surface-2 rounded-2xl p-5 shadow-soft max-h-[85vh] overflow-auto outline-none"
      >
        {title && <h3 class="text-base font-semibold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

function focusableSelector(): string {
  return [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
}
