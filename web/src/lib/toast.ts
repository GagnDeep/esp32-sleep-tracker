// Tiny toast bus. UI mounts <ToastHost/> once near the root; everywhere
// else just calls `notify('error', 'Something broke')`. Auto-dismisses
// after 4 s; respects the user's reduced-motion preference by simply
// rendering without animation (handled in the component, not here).

import { signal } from '@preact/signals';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  msg: string;
  createdAt: number;
}

export const toasts = signal<Toast[]>([]);

const TTL_MS = 4_000;
let nextId = 1;

export function notify(kind: ToastKind, msg: string, title?: string): number {
  const id = nextId++;
  const t: Toast = { id, kind, msg, title, createdAt: Date.now() };
  toasts.value = [...toasts.value, t];
  // Schedule auto-dismiss; in environments without setTimeout (SSR) we
  // simply leave the toast — host re-renders on signal mutation anyway.
  if (typeof setTimeout !== 'undefined') {
    setTimeout(() => dismiss(id), TTL_MS);
  }
  return id;
}

export function dismiss(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
