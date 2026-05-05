import type { ComponentChildren } from 'preact';

interface Props {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
  children?: ComponentChildren;
}

const tones = {
  neutral: 'bg-surface text-ink-muted',
  good:    'bg-good/15 text-good',
  warn:    'bg-warn/15 text-warn',
  bad:     'bg-bad/15  text-bad',
  accent:  'bg-accent-soft/30 text-accent',
};

export function Pill({ tone = 'neutral', children }: Props) {
  return (
    <span class={['inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-xs font-medium', tones[tone]].join(' ')}>
      {children}
    </span>
  );
}
