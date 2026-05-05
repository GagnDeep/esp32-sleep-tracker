import { useLocation } from 'preact-iso';

const tabs = [
  { href: '/',         label: 'Live',     icon: '◐' },
  { href: '/history',  label: 'History',  icon: '☷' },
  { href: '/alarm',    label: 'Alarm',    icon: '⏰' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function BottomTabs() {
  const { path } = useLocation();
  return (
    <nav aria-label="Primary"
         class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-2/90 backdrop-blur
                border-t border-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <ul class="flex items-stretch justify-around gap-1">
        {tabs.map(t => {
          const active = path === t.href || (t.href !== '/' && path.startsWith(t.href));
          return (
            <li class="flex-1">
              <a href={t.href}
                 class={[
                   'flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl text-xs',
                   active ? 'text-accent' : 'text-ink-muted',
                 ].join(' ')}>
                <span aria-hidden="true" class="text-lg leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
