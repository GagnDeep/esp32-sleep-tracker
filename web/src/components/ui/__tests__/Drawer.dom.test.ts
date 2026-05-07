// @vitest-environment jsdom
// Runtime (DOM) tests for Drawer — Escape, backdrop click, close button, focus restore.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { h } from 'preact';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Drawer } from '../Drawer';
import type { DrawerProps } from '../Drawer';

let container: HTMLDivElement;

function setup(props: Partial<DrawerProps> & { open: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    render(h(Drawer, { onClose: () => {}, ...props }), container);
  });
}

function teardown() {
  if (container) {
    act(() => {
      render(null as unknown as ReturnType<typeof h>, container);
    });
    container.remove();
  }
}

afterEach(teardown);

describe('Drawer DOM — Escape key', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    setup({ open: true, title: 'Test', onClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when a different key is pressed', () => {
    const onClose = vi.fn();
    setup({ open: true, title: 'Test', onClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Drawer DOM — backdrop click', () => {
  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    setup({ open: true, title: 'Test', onClose });
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    act(() => { backdrop.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Drawer DOM — close button click', () => {
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    setup({ open: true, title: 'Test', onClose });
    const btn = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => { btn.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Drawer DOM — focus restoration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores focus to previously-focused element when drawer closes', () => {
    // Mount an external button and focus it as "previous" focus
    const externalBtn = document.createElement('button');
    externalBtn.textContent = 'Outside';
    document.body.appendChild(externalBtn);
    act(() => { externalBtn.focus(); });
    expect(document.activeElement).toBe(externalBtn);

    // Open the drawer — it will steal focus (after rAF fires)
    const onClose = vi.fn();
    setup({ open: true, title: 'Focus Test', onClose });
    act(() => { vi.runAllTimers(); });

    // Close the drawer by re-rendering with open=false
    act(() => {
      render(h(Drawer, { open: false, onClose, title: 'Focus Test' }), container);
    });
    act(() => { vi.runAllTimers(); });

    // Focus should have been restored to the external button
    expect(document.activeElement).toBe(externalBtn);

    externalBtn.remove();
  });
});
