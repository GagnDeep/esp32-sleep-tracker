// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';

// Reset localStorage and re-import fresh module state before each test.
// Because signals are module-level singletons we isolate by clearing
// localStorage and relying on the module already being loaded with defaults.

describe('otaProgress', () => {
  it('defaults to null', async () => {
    const { otaProgress } = await import('../store');
    expect(otaProgress.value).toBeNull();
  });
});

describe('goals', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 480 min sleep and score 80 when localStorage is unset', async () => {
    const { goals } = await import('../store');
    expect(goals.value.targetSleepMin).toBe(480);
    expect(goals.value.targetScore).toBe(80);
  });

  it('persists to localStorage when value is set', async () => {
    const { goals } = await import('../store');
    goals.value = { targetSleepMin: 420, targetScore: 75 };
    const stored = JSON.parse(localStorage.getItem('goals.v1') ?? 'null');
    expect(stored).toEqual({ targetSleepMin: 420, targetScore: 75 });
  });

  it('round-trips: reading goals.value after a write reflects the new value', async () => {
    const { goals } = await import('../store');
    goals.value = { targetSleepMin: 360, targetScore: 90 };
    expect(goals.value).toEqual({ targetSleepMin: 360, targetScore: 90 });
  });
});

describe('lastNightSummary', () => {
  it('defaults to null', async () => {
    const { lastNightSummary } = await import('../store');
    expect(lastNightSummary.value).toBeNull();
  });
});
