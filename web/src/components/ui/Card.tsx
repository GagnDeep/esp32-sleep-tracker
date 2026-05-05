import type { JSX, ComponentChildren } from 'preact';

interface Props extends JSX.HTMLAttributes<HTMLElement> {
  title?: string;
  hint?: ComponentChildren;
  children?: ComponentChildren;
}

export function Card({ title, hint, class: cls, children, ...rest }: Props) {
  return (
    <section
      class={['rounded-2xl bg-surface-2 p-4 shadow-soft', cls ?? ''].join(' ')}
      {...rest}
    >
      {(title || hint) && (
        <header class="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 class="text-sm font-semibold tracking-tight text-ink">{title}</h2>}
          {hint && <span class="text-xs text-ink-muted">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  );
}
