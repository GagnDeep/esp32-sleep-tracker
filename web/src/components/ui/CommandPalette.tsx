import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

// Public types

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
  category?: 'navigation' | 'session' | 'setting' | 'action';
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: ReadonlyArray<CommandItem>;
}

// Component

export function CommandPalette(props: CommandPaletteProps): VNode | null {
  const { open, onClose, commands } = props;

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Capture previous focus before open
  useLayoutEffect(() => {
    if (open) previousFocusRef.current = document.activeElement;
  }, [open]);

  // Focus input on open; restore focus on close; reset query/highlight on open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Substring filter (case-insensitive) against label and hint
  const q = query.toLowerCase();
  const filtered = q
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          (cmd.hint !== undefined && cmd.hint.toLowerCase().includes(q)),
      )
    : commands.slice();

  const clampedHighlight = filtered.length === 0 ? 0 : Math.min(highlighted, filtered.length - 1);

  function handleKeyDown(e: KeyboardEvent) {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[clampedHighlight];
      if (cmd) { cmd.run(); onClose(); }
    }
  }

  function activateItem(cmd: CommandItem) { cmd.run(); onClose(); }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        class="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        class="relative w-full max-w-[400px] mx-4 bg-surface-2 rounded-xl shadow-soft flex flex-col max-h-[60vh] overflow-hidden"
      >
        {/* Search input */}
        <div class="px-3 py-2 border-b border-surface-3 shrink-0">
          <input
            ref={inputRef}
            type="text"
            aria-label="Command search"
            placeholder="Search..."
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setHighlighted(0);
            }}
            onKeyDown={handleKeyDown}
            class="w-full bg-transparent text-sm text-ink placeholder-ink-muted outline-none"
          />
        </div>

        {/* Command list */}
        <ul
          role="listbox"
          aria-label="Commands"
          class="flex-1 overflow-y-auto py-1"
        >
          {filtered.length === 0 && (
            <li class="px-3 py-2 text-sm text-ink-muted">No commands found.</li>
          )}
          {filtered.map((cmd, i) => {
            const isSelected = i === clampedHighlight;
            return (
              <li
                key={cmd.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => activateItem(cmd)}
                class={[
                  'flex items-center justify-between px-3 py-2 cursor-pointer text-sm',
                  isSelected
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink hover:bg-surface-3',
                ].join(' ')}
              >
                <span class="truncate">{cmd.label}</span>
                {cmd.hint && (
                  <span class="ml-4 shrink-0 text-xs text-ink-muted font-mono">{cmd.hint}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
