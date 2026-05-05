import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: ComponentChildren;
}

export function Sheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
         class="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-black/40">
      <div onClick={onClose} class="absolute inset-0" />
      <div class="relative w-full sm:max-w-md bg-surface-2 rounded-t-2xl sm:rounded-2xl
                  p-5 max-h-[85vh] overflow-auto shadow-soft">
        {title && <h3 class="text-base font-semibold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
