import type { ComponentChildren } from 'preact';
import { BottomTabs } from './BottomTabs';
import { Sidebar } from './Sidebar';
import { StatusBadge } from '../StatusBadge';

export function NavShell({ children }: { children?: ComponentChildren }) {
  return (
    <div class="min-h-full md:flex">
      <Sidebar />
      <div class="flex-1 min-w-0 flex flex-col">
        <header class="md:hidden flex items-center justify-between px-4 pt-3 pb-2">
          <span class="font-semibold tracking-tight">Sleep Tracker</span>
          <StatusBadge />
        </header>
        <main class="flex-1 min-w-0 px-4 pb-24 md:pb-6 md:px-6">
          {children}
        </main>
        <BottomTabs />
      </div>
    </div>
  );
}
