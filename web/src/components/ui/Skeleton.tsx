interface Props { class?: string; }

export function Skeleton({ class: cls }: Props) {
  return <div class={['animate-pulse rounded-xl bg-surface', cls ?? 'h-4 w-full'].join(' ')} aria-hidden="true" />;
}
