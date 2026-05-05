import { useLocation } from 'preact-iso';
import { StatusBadge } from '../StatusBadge';
import { ThemeToggle } from './ThemeToggle';

const items = [
  { href: '/',         label: 'Live' },
  { href: '/history',  label: 'History' },
  { href: '/trends',   label: 'Trends' },
  { href: '/alarm',    label: 'Alarm' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar() {
  const { path } = useLocation();
  return (
    <aside class="hidden md:flex md:flex-col md:gap-6 w-56 shrink-0 p-4 sticky top-0 h-dvh">
      <div class="px-2 flex items-start justify-between gap-2">
        <div>
          <span class="block text-base font-semibold tracking-tight">Sleep Tracker</span>
          <StatusBadge />
        </div>
        <ThemeToggle />
      </div>
      <nav aria-label="Primary">
        <ul class="flex flex-col gap-1">
          {items.map(it => {
            const active = path === it.href || (it.href !== '/' && path.startsWith(it.href));
            return (
              <li>
                <a href={it.href}
                   class={[
                     'block px-3 h-10 rounded-xl flex items-center text-sm',
                     active ? 'bg-surface-2 text-accent' : 'text-ink-muted hover:bg-surface-2/60',
                   ].join(' ')}>
                  {it.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
