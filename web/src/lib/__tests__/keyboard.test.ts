/** @vitest-environment jsdom */

// Tests for the global keyboard shortcut bus.
// Uses fake timers to control sequence-timeout deterministically.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerShortcut,
  installKeyboardBus,
  shortcutCount,
  __resetForTests,
} from '../keyboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a synthetic keydown on the given target (defaults to document). */
function fireKey(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; target?: EventTarget } = {},
): KeyboardEvent {
  const { target = document, ...init } = opts;
  const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(evt);
  return evt;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let uninstall: (() => void) | null = null;

beforeEach(() => {
  __resetForTests();
  uninstall = installKeyboardBus(document);
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// installKeyboardBus — idempotency
// ---------------------------------------------------------------------------

describe('installKeyboardBus', () => {
  it('is idempotent — calling twice does not double-fire handlers', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);

    // Install a second time on the same target
    const uninstall2 = installKeyboardBus(document);

    fireKey('?');
    expect(handler).toHaveBeenCalledTimes(1);

    uninstall2(); // should be a no-op since we deduped
  });
});

// ---------------------------------------------------------------------------
// shortcutCount
// ---------------------------------------------------------------------------

describe('shortcutCount', () => {
  it('reflects the number of currently registered shortcuts', () => {
    expect(shortcutCount()).toBe(0);
    const h1 = registerShortcut('?', vi.fn());
    expect(shortcutCount()).toBe(1);
    const h2 = registerShortcut('Escape', vi.fn());
    expect(shortcutCount()).toBe(2);
    h1.unregister();
    expect(shortcutCount()).toBe(1);
    h2.unregister();
    expect(shortcutCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Single-key shortcuts
// ---------------------------------------------------------------------------

describe('single-key shortcuts', () => {
  it('calls handler exactly once when the matching key is pressed', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);
    fireKey('?');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a different key', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);
    fireKey('/');
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler with the KeyboardEvent', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);
    fireKey('?');
    expect(handler.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);
  });

  it('calls preventDefault on the matched event', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);
    const evt = fireKey('?');
    expect(evt.defaultPrevented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mod combos
// ---------------------------------------------------------------------------

describe('mod combos', () => {
  it('fires mod+k when metaKey is held', () => {
    const handler = vi.fn();
    registerShortcut('mod+k', handler);
    fireKey('k', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires mod+k when ctrlKey is held', () => {
    const handler = vi.fn();
    registerShortcut('mod+k', handler);
    fireKey('k', { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire mod+k for bare k', () => {
    const handler = vi.fn();
    registerShortcut('mod+k', handler);
    fireKey('k');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire mod+k for shift+k', () => {
    const handler = vi.fn();
    registerShortcut('mod+k', handler);
    fireKey('k', { shiftKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires shift+/ when shift is held', () => {
    const handler = vi.fn();
    registerShortcut('shift+/', handler);
    fireKey('/', { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire shift+/ for bare /', () => {
    const handler = vi.fn();
    registerShortcut('shift+/', handler);
    fireKey('/');
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires alt+t when alt is held', () => {
    const handler = vi.fn();
    registerShortcut('alt+t', handler);
    fireKey('t', { altKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Sequence shortcuts
// ---------------------------------------------------------------------------

describe('sequence shortcuts', () => {
  it('fires when both keys are pressed within the timeout', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    registerShortcut(['g', 'h'], handler);

    fireKey('g');
    vi.advanceTimersByTime(400); // within 750ms window
    fireKey('h');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the second key is pressed after the timeout', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    registerShortcut(['g', 'h'], handler);

    fireKey('g');
    vi.advanceTimersByTime(800); // past 750ms window
    fireKey('h');

    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT fire when the second key is wrong', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    registerShortcut(['g', 'h'], handler);

    fireKey('g');
    vi.advanceTimersByTime(200);
    fireKey('t'); // wrong second key

    expect(handler).not.toHaveBeenCalled();
  });

  it('cancels pending sequence on a non-matching second key', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    registerShortcut(['g', 'h'], handler);

    fireKey('g');
    vi.advanceTimersByTime(200);
    fireKey('t'); // cancels pending
    vi.advanceTimersByTime(200);
    fireKey('h'); // too late — sequence was cancelled

    expect(handler).not.toHaveBeenCalled();
  });

  it('fires the correct handler for different second keys (g h vs g t)', () => {
    vi.useFakeTimers();
    const handlerH = vi.fn();
    const handlerT = vi.fn();
    registerShortcut(['g', 'h'], handlerH);
    registerShortcut(['g', 't'], handlerT);

    fireKey('g');
    vi.advanceTimersByTime(200);
    fireKey('t');

    expect(handlerH).not.toHaveBeenCalled();
    expect(handlerT).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Input filtering
// ---------------------------------------------------------------------------

describe('input filtering', () => {
  it('ignores keydown events from an <input> element', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireKey('?', { target: input });

    document.body.removeChild(input);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keydown events from a <textarea> element', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    fireKey('?', { target: textarea });

    document.body.removeChild(textarea);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keydown events from a <select> element', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);

    const select = document.createElement('select');
    document.body.appendChild(select);
    fireKey('?', { target: select });

    document.body.removeChild(select);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keydown events from a contenteditable element', () => {
    const handler = vi.fn();
    registerShortcut('?', handler);

    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    fireKey('?', { target: div });

    document.body.removeChild(div);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires when allowInInput is true and target is an input', () => {
    const handler = vi.fn();
    registerShortcut('?', handler, { allowInInput: true });

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey('?', { target: input });

    document.body.removeChild(input);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Unregister
// ---------------------------------------------------------------------------

describe('unregister', () => {
  it('stops firing after unregister()', () => {
    const handler = vi.fn();
    const handle = registerShortcut('?', handler);

    fireKey('?');
    expect(handler).toHaveBeenCalledTimes(1);

    handle.unregister();
    fireKey('?');
    expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('only unregisters the specific handle, leaving others intact', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const handle1 = registerShortcut('?', h1);
    registerShortcut('?', h2);

    handle1.unregister();
    fireKey('?');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Multiple handlers on same combo
// ---------------------------------------------------------------------------

describe('multiple handlers on same combo', () => {
  it('invokes both handlers in registration order', () => {
    const order: number[] = [];
    registerShortcut('?', () => order.push(1));
    registerShortcut('?', () => order.push(2));

    fireKey('?');
    expect(order).toEqual([1, 2]);
  });
});
