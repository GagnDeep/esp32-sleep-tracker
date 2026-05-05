// Theme controller. Three modes:
//   'auto' — follow `prefers-color-scheme`
//   'light' — always light
//   'dark' — always dark (default to match the bedside palette)
// Persists in localStorage and writes `data-theme` on <html>.

import { signal, effect } from '@preact/signals';

const STORAGE_KEY = 'display.theme';
export type Theme = 'light' | 'dark' | 'auto';

function readInitial(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* ignore */ }
  return 'auto';
}

export const theme = signal<Theme>(readInitial());

function resolved(t: Theme): 'light' | 'dark' {
  if (t === 'auto') {
    if (typeof matchMedia === 'undefined') return 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function apply(t: Theme): void {
  if (typeof document === 'undefined') return;
  const eff = resolved(t);
  document.documentElement.setAttribute('data-theme', eff);
}

// Persist + apply on every change.
effect(() => {
  try { localStorage.setItem(STORAGE_KEY, theme.value); } catch { /* ignore */ }
  apply(theme.value);
});

// Re-apply when system prefers-color-scheme flips and we're in auto.
if (typeof matchMedia !== 'undefined') {
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') apply('auto');
    });
  } catch { /* Safari < 14 */ }
}

export function cycleTheme(): void {
  const order: Theme[] = ['auto', 'light', 'dark'];
  const idx = order.indexOf(theme.value);
  theme.value = order[(idx + 1) % order.length];
}

export function themeIcon(t: Theme): string {
  switch (t) {
    case 'auto': return '◐';
    case 'light': return '☀';
    case 'dark': return '☾';
  }
}

export function themeLabel(t: Theme): string {
  return t === 'auto' ? 'Auto theme' : t === 'light' ? 'Light theme' : 'Dark theme';
}
