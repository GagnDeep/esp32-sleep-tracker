import { dismiss, toasts } from '../../lib/toast';
import { Toast } from './Toast';

// Mounted once near the root of the app. Reads the toasts signal and
// renders a top-right stack. Auto-dismiss is handled by `notify()` in
// lib/toast.ts; this component only provides the visual + the explicit
// close affordance.
export function ToastHost() {
  const items = toasts.value;
  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      class="pointer-events-none fixed top-3 right-3 z-50 flex flex-col gap-2 items-end max-w-[calc(100vw-1.5rem)]"
    >
      {items.map((t) => (
        <Toast
          key={t.id}
          kind={t.kind}
          title={t.title}
          msg={t.msg}
          onClose={() => dismiss(t.id)}
        />
      ))}
    </div>
  );
}
