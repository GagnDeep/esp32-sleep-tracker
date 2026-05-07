// We don't open a real WebSocket here — we just exercise the
// pub/sub bookkeeping. The goal is to guarantee that unsubscribing
// the last listener for an event type cleans up the Map slot
// (otherwise long-lived pages would leak empty Sets indefinitely)
// AND that a callback unsubscribed before dispatch is never called.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribe, handleWsMessage, __test } from '../ws';
import { otaProgress } from '../store';

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

describe('ota_progress WS event wiring', () => {
  beforeEach(() => {
    // Reset signal before each test so tests are independent.
    otaProgress.value = null;
  });

  it('initial OTA event sets the signal with correct fields', () => {
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 25,
      bytes: 1000,
      bytes_total: 4000,
    });

    const val = otaProgress.value;
    expect(val).not.toBeNull();
    expect(val!.phase).toBe('downloading');
    expect(val!.pct).toBe(25);
    expect(val!.bytes).toBe(1000);
    expect(val!.bytesTotal).toBe(4000);
    expect(val!.startedAt).toBeTypeOf('number');
    // No throughput on first sample (no prev to compare against).
    expect(val!.bytesPerSec).toBeUndefined();
  });

  it('subsequent event updates the signal and computes throughput', () => {
    // First event — establishes a baseline.
    const t0 = Date.now() - 2000; // Simulate 2 seconds ago.
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 25,
      bytes: 1000,
      bytes_total: 4000,
    });

    // Manually back-date startedAt so dtSec > 0.5 on the next call.
    otaProgress.value = { ...otaProgress.value!, startedAt: t0 };

    // Second event with more bytes downloaded.
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 50,
      bytes: 2000,
      bytes_total: 4000,
    });

    const val = otaProgress.value;
    expect(val).not.toBeNull();
    expect(val!.pct).toBe(50);
    expect(val!.bytes).toBe(2000);
    // bytesPerSec should be positive (1000 bytes over ~2 seconds ≈ 500 B/s).
    expect(val!.bytesPerSec).toBeTypeOf('number');
    expect(val!.bytesPerSec!).toBeGreaterThan(0);
  });

  it('failed phase populates errorMessage', () => {
    handleWsMessage({
      type: 'ota_progress',
      phase: 'failed',
      pct: 0,
      bytes: 500,
      bytes_total: 4000,
      error_message: 'checksum mismatch',
    });

    const val = otaProgress.value;
    expect(val).not.toBeNull();
    expect(val!.phase).toBe('failed');
    expect(val!.errorMessage).toBe('checksum mismatch');
  });

  it('missing optional fields fall back to safe defaults', () => {
    // Send a minimal payload with no phase, pct, bytes, or bytes_total.
    handleWsMessage({ type: 'ota_progress' });

    const val = otaProgress.value;
    expect(val).not.toBeNull();
    expect(val!.phase).toBe('downloading');
    expect(val!.pct).toBe(0);
    expect(val!.bytes).toBe(0);
    expect(val!.bytesTotal).toBe(0);
    expect(val!.errorMessage).toBeUndefined();
  });

  it('signal stays null until the first ota_progress event arrives', () => {
    // Already reset in beforeEach, just confirm invariant.
    expect(otaProgress.value).toBeNull();
  });

  it('startedAt is preserved across consecutive events', () => {
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 10,
      bytes: 400,
      bytes_total: 4000,
    });
    const first = otaProgress.value!;

    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 20,
      bytes: 800,
      bytes_total: 4000,
    });
    const second = otaProgress.value!;

    // startedAt must be identical — it should NOT be reset on each event.
    expect(second.startedAt).toBe(first.startedAt);
  });
});
