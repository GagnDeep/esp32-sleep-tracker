import type { ToastKind } from '../../lib/toast';

interface Props {
  kind?: ToastKind;
  title?: string;
  msg: string;
  onClose?: () => void;
}

const tones: Record<ToastKind, string> = {
  info:    'bg-accent-soft/30 text-ink border-accent/40',
  success: 'bg-good/15 text-good border-good/40',
  warn:    'bg-warn/15 text-warn border-warn/40',
  error:   'bg-bad/15  text-bad  border-bad/40',
};

export function Toast({ kind = 'info', title, msg, onClose }: Props) {
  return (
    <div
      role="status"
      class={[
        'pointer-events-auto min-w-[220px] max-w-sm rounded-xl border px-3 py-2 shadow-soft backdrop-blur',
        tones[kind],
      ].join(' ')}
    >
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0">
          {title && <div class="text-xs font-semibold tracking-tight">{title}</div>}
          <div class="text-sm leading-snug break-words">{msg}</div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            class="text-xs opacity-70 hover:opacity-100 -mt-0.5 px-1"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
