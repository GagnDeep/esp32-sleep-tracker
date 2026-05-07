// @vitest-environment node
// Smoke tests for CommandPalette using preact-render-to-string.

import { describe, it, expect, vi } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { CommandPalette } from '../CommandPalette';
import type { CommandPaletteProps, CommandItem } from '../CommandPalette';

const noop = () => {};

const sampleCommands: CommandItem[] = [
  { id: 'home', label: 'Go to Home', hint: 'g h', run: noop, category: 'navigation' },
  { id: 'settings', label: 'Open Settings', hint: 'g s', run: noop, category: 'navigation' },
  { id: 'logout', label: 'Logout', run: noop, category: 'action' },
];

function palette(props: Partial<CommandPaletteProps> & { open: boolean }) {
  return render(
    h(CommandPalette, { onClose: noop, commands: sampleCommands, ...props }),
  );
}

describe('CommandPalette', () => {
  it('returns null (empty string) when open=false', () => {
    expect(palette({ open: false })).toBe('');
  });

  it('renders search input when open=true', () => {
    const out = palette({ open: true });
    expect(out).toContain('aria-label="Command search"');
  });

  it('renders all commands when open with no query', () => {
    const out = palette({ open: true });
    expect(out).toContain('Go to Home');
    expect(out).toContain('Open Settings');
    expect(out).toContain('Logout');
  });

  it('renders hint text when provided', () => {
    const out = palette({ open: true });
    expect(out).toContain('g h');
    expect(out).toContain('g s');
  });

  it('has role="dialog" and aria-modal="true"', () => {
    const out = palette({ open: true });
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
  });

  it('has role="listbox" on the command list', () => {
    const out = palette({ open: true });
    expect(out).toContain('role="listbox"');
  });

  it('has role="option" on command items', () => {
    const out = palette({ open: true });
    const matches = out.match(/role="option"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(sampleCommands.length);
  });

  it('marks first item as aria-selected="true" by default', () => {
    const out = palette({ open: true });
    expect(out).toContain('aria-selected="true"');
  });

  it('shows no commands found when list is empty', () => {
    const out = palette({ open: true, commands: [] });
    expect(out).toContain('No commands found.');
  });

  it('backdrop has aria-hidden="true"', () => {
    const out = palette({ open: true });
    expect(out).toContain('aria-hidden="true"');
  });

  it('includes placeholder "Search..."', () => {
    const out = palette({ open: true });
    expect(out).toContain('placeholder="Search..."');
  });

  it('run callback is not called when item is simply rendered', () => {
    const run = vi.fn();
    const cmd: CommandItem = { id: 'x', label: 'Do Something', run };
    palette({ open: true, commands: [cmd] });
    expect(run).not.toHaveBeenCalled();
  });
});
