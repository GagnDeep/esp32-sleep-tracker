// We don't open a real WebSocket here — we just exercise the
// pub/sub bookkeeping. The goal is to guarantee that unsubscribing
// the last listener for an event type cleans up the Map slot
// (otherwise long-lived pages would leak empty Sets indefinitely)
// AND that a callback unsubscribed before dispatch is never called.

import { describe, it, expect, vi } from 'vitest';
import { subscribe, __test } from '../ws';

describe('ws subscribe / unsubscribe', () => {
  it('removes the Map entry once the last listener is gone', () => {
    const before = __test.listenerTypeCount();
    const off = subscribe('alarm', () => {});
    expect(__test.hasType('alarm')).toBe(true);
    off();
    expect(__test.hasType('alarm')).toBe(false);
    expect(__test.listenerTypeCount()).toBe(before);
  });

  it('keeps the slot while other listeners for the same type remain', () => {
    const off1 = subscribe('alarm', () => {});
    const off2 = subscribe('alarm', () => {});
    off1();
    expect(__test.hasType('alarm')).toBe(true);
    off2();
    expect(__test.hasType('alarm')).toBe(false);
  });

  it('does not invoke an unsubscribed listener on dispatch', () => {
    const fn = vi.fn();
    const off = subscribe('alarm', fn);
    off();
    __test.dispatch({ type: 'alarm', kind: 'fire' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes still-subscribed listeners exactly once per dispatch', () => {
    const fn = vi.fn();
    const off = subscribe('alarm', fn);
    __test.dispatch({ type: 'alarm', kind: 'fire' });
    __test.dispatch({ type: 'alarm', kind: 'silence' });
    expect(fn).toHaveBeenCalledTimes(2);
    off();
  });
});
