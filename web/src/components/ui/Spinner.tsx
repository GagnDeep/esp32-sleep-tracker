interface Props {
  size?: number;
  class?: string;
  label?: string;
}

// Small accessible spinner. CSS-only, no external assets. The label is
// hidden visually but surfaces in the accessibility tree so screen
// readers announce loading states.
export function Spinner({ size = 16, class: cls, label = 'Loading' }: Props) {
  const px = `${size}px`;
  return (
    <span
      role="status"
      aria-label={label}
      class={['inline-flex items-center justify-center', cls ?? ''].join(' ')}
      style={{ width: px, height: px }}
    >
      <span
        class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
        style={{ width: px, height: px }}
        aria-hidden="true"
      />
      <span class="sr-only">{label}</span>
    </span>
  );
}
