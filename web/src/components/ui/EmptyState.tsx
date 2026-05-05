import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  msg?: string;
  cta?: ComponentChildren;
  icon?: ComponentChildren;
}

// Used by list routes when there's nothing to show. Keeps its shape
// the same as a Card so layouts don't pop when data finally arrives.
export function EmptyState({ title, msg, cta, icon }: Props) {
  return (
    <div class="rounded-2xl bg-surface-2 p-8 text-center shadow-soft">
      {icon && <div class="mb-3 flex justify-center text-ink-muted">{icon}</div>}
      <h3 class="text-sm font-semibold tracking-tight text-ink">{title}</h3>
      {msg && <p class="mt-1 text-sm text-ink-muted">{msg}</p>}
      {cta && <div class="mt-4 flex justify-center">{cta}</div>}
    </div>
  );
}
