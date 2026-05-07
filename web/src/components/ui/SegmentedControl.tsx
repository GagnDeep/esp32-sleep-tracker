// Arrow keys move focus + selection (Apple-style). Disabled options are skipped.
import { useRef } from 'preact/hooks';
import type { VNode } from 'preact';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional shorter label for narrow viewports (mobile). */
  shortLabel?: string;
  /** Disabled state for individual options. */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Visual size. Default 'md'. */
  size?: 'sm' | 'md';
  /** Optional aria-label for the group. */
  ariaLabel?: string;
  class?: string;
}

const sizeClasses = {
  sm: { container: 'p-0.5 gap-0.5', button: 'px-2.5 py-0.5 text-xs' },
  md: { container: 'p-1 gap-1',     button: 'px-3 py-1 text-sm'     },
};

export function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
): VNode {
  const { options, value, onChange, size = 'md', ariaLabel, class: cls } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const sc = sizeClasses[size];

  const enabledOptions = options.filter((o) => !o.disabled);

  function selectOption(opt: SegmentedOption<T>) {
    if (opt.disabled || opt.value === value) return;
    onChange(opt.value);
    const el = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-value="${opt.value}"]`,
    );
    el?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();

    const currentIdx = enabledOptions.findIndex((o) => o.value === value);

    let next: SegmentedOption<T> | undefined;
    if (e.key === 'Home') {
      next = enabledOptions[0];
    } else if (e.key === 'End') {
      next = enabledOptions[enabledOptions.length - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = enabledOptions[(currentIdx + 1) % enabledOptions.length];
    } else {
      next = enabledOptions[(currentIdx - 1 + enabledOptions.length) % enabledOptions.length];
    }

    if (next) selectOption(next);
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      class={['inline-flex rounded-full bg-surface-2', sc.container, cls ?? ''].filter(Boolean).join(' ')}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            data-value={opt.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => selectOption(opt)}
            class={[
              'rounded-full font-medium transition-colors focus-visible:outline focus-visible:outline-2',
              sc.button,
              selected
                ? 'bg-surface-3 text-ink shadow-soft'
                : 'text-ink-muted hover:text-ink',
              opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {opt.shortLabel && (
              <span class="sm:hidden">{opt.shortLabel}</span>
            )}
            <span class={opt.shortLabel ? 'hidden sm:inline' : undefined}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
