// @vitest-environment jsdom
// Tests for the Scrubber state model, SSR rendering, and interactive behavior.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { render as domRender } from 'preact';
import { act } from 'preact/test-utils';
import {
  createScrubberState,
  onCursorChange,
  cursorFraction,
  Scrubber,
} from '../Scrubber';

// ---------------------------------------------------------------------------
// State model tests
// ---------------------------------------------------------------------------

describe('createScrubberState', () => {
  it('initialises cursor to null', () => {
    const state = createScrubberState(60_000);
    expect(state.cursor.value).toBeNull();
  });

  it('initialises durationMs correctly', () => {
    const state = createScrubberState(60_000);
    expect(state.durationMs.value).toBe(60_000);
  });
});

describe('onCursorChange', () => {
  it('fires callback when cursor signal updates', () => {
    const state = createScrubberState(60_000);
    const fn = vi.fn();
    const unsub = onCursorChange(state, fn);

    state.cursor.value = 30_000;
    expect(fn).toHaveBeenCalledWith(30_000);

    unsub();
  });

  it('does not fire after unsubscribe', () => {
    const state = createScrubberState(60_000);
    const fn = vi.fn();
    const unsub = onCursorChange(state, fn);

    // Fire once to verify it works.
    state.cursor.value = 1_000;
    const callsBefore = fn.mock.calls.length;

    unsub();
    state.cursor.value = 2_000;

    // No additional calls after unsub.
    expect(fn.mock.calls.length).toBe(callsBefore);
  });
});

describe('cursorFraction', () => {
  it('returns null when cursor is null', () => {
    const state = createScrubberState(60_000);
    expect(cursorFraction(state)).toBeNull();
  });

  it('returns 0 at the start', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 0;
    expect(cursorFraction(state)).toBe(0);
  });

  it('returns 1 at full duration', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 60_000;
    expect(cursorFraction(state)).toBe(1);
  });

  it('returns 0.5 at half duration', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 30_000;
    expect(cursorFraction(state)).toBe(0.5);
  });

  it('clamps over-range values to [0, 1]', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 120_000; // beyond end
    expect(cursorFraction(state)).toBe(1);

    state.cursor.value = -1_000; // before start
    expect(cursorFraction(state)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Component rendering tests (SSR)
// ---------------------------------------------------------------------------

describe('Scrubber component', () => {
  it('renders a slider role element', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('role="slider"');
  });

  it('has correct aria attributes with null cursor', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('aria-valuemin="0"');
    expect(out).toContain('aria-valuemax="60000"');
    expect(out).toContain('aria-valuenow="0"');
  });

  it('reflects aria-valuenow from cursor signal', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 30_000;
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('aria-valuenow="30000"');
  });

  it('applies custom ariaLabel', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state, ariaLabel: 'Sleep timeline' }));
    expect(out).toContain('aria-label="Sleep timeline"');
  });

  it('shows time bubble when cursor is active', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 3_661_000; // 1h 1m 1s
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('01:01:01');
  });

  it('uses custom formatLabel when provided', () => {
    const state = createScrubberState(60_000);
    state.cursor.value = 5_000;
    const out = render(h(Scrubber, { state, formatLabel: (t) => `${t}ms` }));
    expect(out).toContain('5000ms');
  });

  it('does not show handle when cursor is null', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state }));
    expect(out).not.toContain('font-mono');
  });

  it('has tabIndex 0 for keyboard focus', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('tabindex="0"');
  });
});

// ---------------------------------------------------------------------------
// Behavioral tests (jsdom — pointer + keyboard)
//
// jsdom note: jsdom does not expose PointerEvent, so `'pointerdown' in el`
// is false. Preact therefore registers listeners under the PascalCase event
// name (e.g. "PointerDown") rather than "pointerdown". We dispatch plain
// Events using matching PascalCase type strings and patch the required
// pointer-event properties (clientX, buttons, pointerId) with
// Object.defineProperty. setPointerCapture / releasePointerCapture are also
// absent in jsdom and must be stubbed before dispatching.
// ---------------------------------------------------------------------------

describe('Scrubber pointer behavior', () => {
  const DUR = 100_000;
  let root: HTMLDivElement;

  function setup(durationMs = DUR) {
    const state = createScrubberState(durationMs);
    root = document.createElement('div');
    document.body.appendChild(root);
    act(() => { domRender(h(Scrubber, { state }), root); });
    const track = root.querySelector('[role="slider"]') as HTMLElement;
    // Stub pointer-capture methods absent in jsdom.
    track.setPointerCapture    = () => {};
    track.releasePointerCapture = () => {};
    // Return a known 100 px-wide box starting at x=0.
    track.getBoundingClientRect = () => ({
      left: 0, right: 100, width: 100,
      top: 0, bottom: 28, height: 28,
      x: 0, y: 0,
      toJSON: () => ({}),
    });
    return { state, track };
  }

  afterEach(() => {
    if (root) {
      domRender(null as unknown as ReturnType<typeof h>, root);
      root.remove();
    }
  });

  /**
   * Dispatch a synthetic pointer event.
   * jsdom lacks PointerEvent; preact falls back to registering listeners with
   * PascalCase names ("PointerDown" instead of "pointerdown"). We match that.
   */
  function firePointer(
    el: HTMLElement,
    name: 'PointerDown' | 'PointerMove' | 'PointerUp' | 'PointerLeave',
    clientX: number,
    buttons: number,
    pointerId = 1,
  ) {
    const evt = new Event(name, { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'clientX',   { value: clientX,   configurable: true });
    Object.defineProperty(evt, 'buttons',   { value: buttons,   configurable: true });
    Object.defineProperty(evt, 'pointerId', { value: pointerId, configurable: true });
    el.dispatchEvent(evt);
  }

  it('pointer drag updates cursor to expected fraction × duration', () => {
    const { state, track } = setup();

    // pointerdown at x=50 → 50% of 100_000 = 50_000 ms
    act(() => { firePointer(track, 'PointerDown', 50, 1); });
    expect(state.cursor.value).toBe(50_000);

    // pointermove at x=75 → 75% of 100_000 = 75_000 ms
    act(() => { firePointer(track, 'PointerMove', 75, 1); });
    expect(state.cursor.value).toBe(75_000);

    // pointerup — cursor stays at last position
    act(() => { firePointer(track, 'PointerUp', 75, 0); });
    expect(state.cursor.value).toBe(75_000);
  });

  it('pointermove without button pressed does not update cursor', () => {
    const { state, track } = setup();

    // hover (buttons: 0) — should be ignored
    act(() => { firePointer(track, 'PointerMove', 50, 0); });
    expect(state.cursor.value).toBeNull();
  });
});

describe('Scrubber keyboard behavior', () => {
  const DUR = 100_000;
  let root: HTMLDivElement;

  function setup() {
    const state = createScrubberState(DUR);
    root = document.createElement('div');
    document.body.appendChild(root);
    act(() => { domRender(h(Scrubber, { state }), root); });
    const slider = root.querySelector('[role="slider"]') as HTMLElement;
    return { state, slider };
  }

  afterEach(() => {
    if (root) {
      domRender(null as unknown as ReturnType<typeof h>, root);
      root.remove();
    }
  });

  function key(el: HTMLElement, k: string): KeyboardEvent {
    const evt = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    act(() => { el.dispatchEvent(evt); });
    return evt;
  }

  it('ArrowRight steps cursor by 1% of duration', () => {
    const { state, slider } = setup();
    key(slider, 'ArrowRight');
    expect(state.cursor.value).toBe(DUR * 0.01);
  });

  it('ArrowLeft steps cursor down by 1% of duration', () => {
    const { state, slider } = setup();
    // Set cursor to midpoint first.
    act(() => { state.cursor.value = DUR / 2; });
    key(slider, 'ArrowLeft');
    expect(state.cursor.value).toBeCloseTo(DUR * 0.49);
  });

  it('Home sets cursor to 0', () => {
    const { state, slider } = setup();
    act(() => { state.cursor.value = 50_000; });
    key(slider, 'Home');
    expect(state.cursor.value).toBe(0);
  });

  it('End sets cursor to full duration', () => {
    const { state, slider } = setup();
    key(slider, 'End');
    expect(state.cursor.value).toBe(DUR);
  });

  it('Arrow keys call preventDefault', () => {
    const { slider } = setup();
    const evt = key(slider, 'ArrowRight');
    expect(evt.defaultPrevented).toBe(true);
  });

  it('unhandled keys do not call preventDefault', () => {
    const { slider } = setup();
    const evt = key(slider, 'Tab');
    expect(evt.defaultPrevented).toBe(false);
  });
});
