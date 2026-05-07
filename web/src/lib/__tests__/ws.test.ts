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

  it('subsequent event updates the signal and computes per-interval throughput', () => {
    // Event 1 at bytes=1000 (t=0s).
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 25,
      bytes: 1000,
      bytes_total: 4000,
    });

    // Back-date sampledAt to simulate 1 second elapsed before event 2.
    const t1 = Date.now() - 1000;
    otaProgress.value = { ...otaProgress.value!, sampledAt: t1 };

    // Event 2 at bytes=2000 (~1 second later).
    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 50,
      bytes: 2000,
      bytes_total: 4000,
    });

    const after2 = otaProgress.value!;
    expect(after2.pct).toBe(50);
    expect(after2.bytes).toBe(2000);
    // Per-interval rate: 1000 bytes over ~1 second ≈ 1000 B/s.
    expect(after2.bytesPerSec).toBeTypeOf('number');
    expect(after2.bytesPerSec!).toBeGreaterThan(0);

    // Event 3 at bytes=2100 (~10 seconds after event 2).
    // Without the fix: rate would be (2100 - 1000) / 11 ≈ 100 B/s (session avg).
    // With fix: rate should be (2100 - 2000) / 10 = 10 B/s (per-interval).
    const t2 = Date.now() - 10_000;
    otaProgress.value = { ...otaProgress.value!, sampledAt: t2 };

    handleWsMessage({
      type: 'ota_progress',
      phase: 'downloading',
      pct: 52,
      bytes: 2100,
      bytes_total: 4000,
    });

    const after3 = otaProgress.value!;
    expect(after3.bytes).toBe(2100);
    // Per-interval rate: 100 bytes over ~10 seconds ≈ 10 B/s.
    // A session-average (startedAt-based) would yield ~190 B/s instead.
    expect(after3.bytesPerSec).toBeTypeOf('number');
    expect(after3.bytesPerSec!).toBeGreaterThan(0);
    expect(after3.bytesPerSec!).toBeLessThan(50); // well below session-average ≈ 190
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
