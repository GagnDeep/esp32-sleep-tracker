// @vitest-environment node
// Tests for the Scrubber state model and component rendering.

import { describe, it, expect, vi } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
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
// Component rendering tests
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
    // cursor is null — no time bubble should be rendered
    const out = render(h(Scrubber, { state }));
    expect(out).not.toContain('font-mono');
  });

  it('has tabIndex 0 for keyboard focus', () => {
    const state = createScrubberState(60_000);
    const out = render(h(Scrubber, { state }));
    expect(out).toContain('tabindex="0"');
  });
});
