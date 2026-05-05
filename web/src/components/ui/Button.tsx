import type { JSX, ComponentChildren } from 'preact';

interface Props extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: ComponentChildren;
}

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};
const variants = {
  primary: 'bg-accent text-surface hover:brightness-110 active:brightness-95',
  ghost:   'bg-surface-2 text-ink hover:bg-surface-2/80',
  danger:  'bg-bad text-surface hover:brightness-110',
};

export function Button({ variant = 'primary', size = 'md', class: cls, children, ...rest }: Props) {
  return (
    <button
      class={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-[filter,background-color,transform] active:scale-[0.98]',
        'disabled:opacity-50 disabled:pointer-events-none',
        sizes[size], variants[variant], cls ?? '',
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
