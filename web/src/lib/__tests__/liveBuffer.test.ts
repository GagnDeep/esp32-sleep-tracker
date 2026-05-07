// Tests for liveBuffer ring buffer / decimation module.
// Pure node env — no DOM needed.

import { describe, it, expect, beforeEach } from 'vitest';
import { LiveBuffer } from '../liveBuffer';
import type { RawSample } from '../liveBuffer';

// Helper: build a sample with defaults so tests only set what they care about.
function sample(t: number, overrides: Partial<RawSample> = {}): RawSample {
  return {
    t,
    hr:       70,
    spo2:     98,
    activity: 100,
    stage:    2,
    flags:    0,
    ...overrides,
  };
}

// Push N evenly-spaced samples into [tStart, tStart + (n-1)*stepMs].
function pushRange(
  buf: LiveBuffer,
  n: number,
  tStart: number,
  stepMs: number,
  overrides: Partial<RawSample> = {},
): void {
  for (let i = 0; i < n; i++) {
    buf.push(sample(tStart + i * stepMs, overrides));
  }
}

// ── Empty buffer ─────────────────────────────────────────────────────────────

describe('empty buffer', () => {
  it('aggregated() returns an empty array', () => {
    const buf = new LiveBuffer();
    expect(buf.aggregated()).toEqual([]);
  });

  it('raw() returns an empty array', () => {
    const buf = new LiveBuffer();
    expect(buf.raw()).toEqual([]);
  });

  it('sampleAt(0) returns null', () => {
    const buf = new LiveBuffer();
    expect(buf.sampleAt(0)).toBeNull();
  });
});

// ── Single bucket ────────────────────────────────────────────────────────────

describe('50 samples within one bucket', () => {
  let buf: LiveBuffer;

  beforeEach(() => {
    buf = new LiveBuffer({ windowMs: 60_000, bucketMs: 1_000 });
    // 50 samples: t = 0, 20, 40, … 980ms → all within bucket [0, 1000)
    pushRange(buf, 50, 0, 20, { hr: 70, spo2: 98, activity: 200 });
  });

  it('produces exactly one aggregated point', () => {
    expect(buf.aggregated()).toHaveLength(1);
  });

  it('bucket has count = 50', () => {
    expect(buf.aggregated()[0].count).toBe(50);
  });

  it('bucket tStart = 0 and tEnd = 1000', () => {
    const pt = buf.aggregated()[0];
    expect(pt.tStart).toBe(0);
    expect(pt.tEnd).toBe(1_000);
  });

  it('hrAvg and hrMax are correct', () => {
    const pt = buf.aggregated()[0];
    expect(pt.hrAvg).toBe(70);
    expect(pt.hrMax).toBe(70);
  });

  it('spo2Avg and spo2Min are correct', () => {
    const pt = buf.aggregated()[0];
    expect(pt.spo2Avg).toBeCloseTo(98);
    expect(pt.spo2Min).toBe(98);
  });

  it('activityMax is correct', () => {
    expect(buf.aggregated()[0].activityMax).toBe(200);
  });

  it('raw() has 50 entries', () => {
    expect(buf.raw()).toHaveLength(50);
  });
});

// ── Two buckets ──────────────────────────────────────────────────────────────

describe('two buckets: 50 samples 0..980ms + 50 samples 1000..1980ms', () => {
  let buf: LiveBuffer;

  beforeEach(() => {
    buf = new LiveBuffer({ windowMs: 60_000, bucketMs: 1_000 });
    pushRange(buf, 50, 0,    20, { hr: 60, spo2: 96, activity: 100 });
    pushRange(buf, 50, 1000, 20, { hr: 80, spo2: 99, activity: 300 });
  });

  it('produces exactly 2 aggregated points', () => {
    expect(buf.aggregated()).toHaveLength(2);
  });

  it('oldest bucket covers [0, 1000)', () => {
    const pt = buf.aggregated()[0];
    expect(pt.tStart).toBe(0);
    expect(pt.tEnd).toBe(1_000);
    expect(pt.hrAvg).toBe(60);
    expect(pt.hrMax).toBe(60);
    expect(pt.count).toBe(50);
  });

  it('newest bucket covers [1000, 2000)', () => {
    const pt = buf.aggregated()[1];
    expect(pt.tStart).toBe(1_000);
    expect(pt.tEnd).toBe(2_000);
    expect(pt.hrAvg).toBe(80);
    expect(pt.hrMax).toBe(80);
    expect(pt.count).toBe(50);
  });

  it('no overlap: buckets are adjacent', () => {
    const [a, b] = buf.aggregated();
    expect(a.tEnd).toBe(b.tStart);
  });

  it('raw() has 100 entries total', () => {
    expect(buf.raw()).toHaveLength(100);
  });
});

// ── Sentinel handling ────────────────────────────────────────────────────────

describe('sentinel handling', () => {
  it('hr=0 is excluded from hrAvg/hrMax; count still increments', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,   { hr: 0,  spo2: 98 }));
    buf.push(sample(20,  { hr: 80, spo2: 98 }));

    const pt = buf.aggregated()[0];
    expect(pt.count).toBe(2);
    expect(pt.hrAvg).toBe(80);
    expect(pt.hrMax).toBe(80);
  });

  it('hr=0xffff is excluded from hrAvg/hrMax; count still increments', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { hr: 0xffff, spo2: 98 }));
    buf.push(sample(20, { hr: 60,     spo2: 98 }));

    const pt = buf.aggregated()[0];
    expect(pt.count).toBe(2);
    expect(pt.hrAvg).toBe(60);
    expect(pt.hrMax).toBe(60);
  });

  it('bucket with all-invalid HR yields hrAvg=0, hrMax=0', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { hr: 0 }));
    buf.push(sample(20, { hr: 0xffff }));

    const pt = buf.aggregated()[0];
    expect(pt.hrAvg).toBe(0);
    expect(pt.hrMax).toBe(0);
    expect(pt.count).toBe(2);
  });

  it('spo2=0 excluded from spo2Avg/spo2Min', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { spo2: 0,  hr: 70 }));
    buf.push(sample(20, { spo2: 95, hr: 70 }));

    const pt = buf.aggregated()[0];
    expect(pt.spo2Avg).toBeCloseTo(95);
    expect(pt.spo2Min).toBe(95);
  });

  it('spo2>=200 excluded from spo2Avg/spo2Min', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { spo2: 255, hr: 70 }));
    buf.push(sample(20, { spo2: 97,  hr: 70 }));

    const pt = buf.aggregated()[0];
    expect(pt.spo2Avg).toBeCloseTo(97);
    expect(pt.spo2Min).toBe(97);
  });

  it('bucket with all-invalid spo2 yields spo2Avg=0, spo2Min=0', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { spo2: 0 }));
    buf.push(sample(20, { spo2: 200 }));

    const pt = buf.aggregated()[0];
    expect(pt.spo2Avg).toBe(0);
    expect(pt.spo2Min).toBe(0);
  });

  it('hr=NaN is excluded from hrAvg/hrMax (NaN sentinel)', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { hr: NaN, spo2: 98 }));
    buf.push(sample(20, { hr: 75,  spo2: 98 }));

    const pt = buf.aggregated()[0];
    expect(pt.count).toBe(2);
    expect(Number.isFinite(pt.hrAvg)).toBe(true);
    expect(pt.hrAvg).toBe(75);
    expect(pt.hrMax).toBe(75);
  });

  it('bucket with only hr=NaN yields hrAvg=0, hrMax=0', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0, { hr: NaN, spo2: 98 }));

    const pt = buf.aggregated()[0];
    expect(pt.hrAvg).toBe(0);
    expect(pt.hrMax).toBe(0);
    expect(pt.count).toBe(1);
  });

  it('spo2=NaN is excluded from spo2Avg/spo2Min (NaN sentinel)', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0,  { spo2: NaN, hr: 70 }));
    buf.push(sample(20, { spo2: 97,  hr: 70 }));

    const pt = buf.aggregated()[0];
    expect(pt.count).toBe(2);
    expect(Number.isFinite(pt.spo2Avg)).toBe(true);
    expect(pt.spo2Avg).toBeCloseTo(97);
    expect(pt.spo2Min).toBe(97);
  });
});

// ── Window eviction ───────────────────────────────────────────────────────────

describe('window eviction', () => {
  it('after > windowMs of data only trailing buckets remain', () => {
    // 3-second window, 1s buckets → max 3 sealed + 1 open acc = 4 visible.
    const buf = new LiveBuffer({ windowMs: 3_000, bucketMs: 1_000 });
    // Push 5 buckets worth of data (one sample per bucket suffices).
    // t=0..4000 in steps of 1000.
    for (let b = 0; b < 5; b++) {
      buf.push(sample(b * 1_000));
    }
    // Latest t=4000; cutoff = 4000-3000 = 1000.
    // Bucket [0,1000) tEnd=1000 <= 1000 → evicted. Keeps [1000..4000) sealed + open [4000,5000).
    const agg = buf.aggregated();
    // Window is 3s, bucket is 1s → at most ceil(3000/1000)+1=4 buckets visible
    // (3 sealed within window + 1 open accumulator).
    expect(agg.length).toBeLessThanOrEqual(4);
    // Oldest remaining bucket started at or after cutoff (t=1000).
    expect(agg[0].tStart).toBeGreaterThanOrEqual(1_000);
    // And the very first bucket [0,1000) must be gone.
    expect(agg[0].tStart).not.toBe(0);
  });

  it('raw samples outside the window are evicted', () => {
    const buf = new LiveBuffer({ windowMs: 2_000, bucketMs: 1_000, maxRaw: 6000 });
    // Fill 5 seconds at 1 sample/100ms: t=0,100,...,4900 (50 samples).
    for (let i = 0; i < 50; i++) {
      buf.push(sample(i * 100));
    }
    const raws = buf.raw();
    // latestT=4900; cutoff=4900-2000=2900.
    // Samples at t=0..2900 (30 samples) evicted; t=3000..4900 (20 samples) remain.
    expect(raws).toHaveLength(20);
    // All returned raw timestamps must be >= (latestT - windowMs).
    const latestT = raws[raws.length - 1].t;
    for (const s of raws) {
      expect(s.t).toBeGreaterThanOrEqual(latestT - 2_000);
    }
  });
});

// ── Non-monotonic t ───────────────────────────────────────────────────────────

describe('non-monotonic t', () => {
  it('sample with t < lastT is silently dropped', () => {
    const buf = new LiveBuffer();
    buf.push(sample(1000));
    buf.push(sample(500));  // out of order → drop

    expect(buf.raw()).toHaveLength(1);
    expect(buf.raw()[0].t).toBe(1000);
  });

  it('equal t is accepted (same timestamp is monotonic)', () => {
    const buf = new LiveBuffer();
    buf.push(sample(1000));
    buf.push(sample(1000)); // equal — not strictly less, keep it

    expect(buf.raw()).toHaveLength(2);
  });

  it('counts are not affected by dropped samples', () => {
    const buf = new LiveBuffer();
    buf.push(sample(1000, { hr: 70 }));
    buf.push(sample(500,  { hr: 80 })); // dropped

    const pt = buf.aggregated()[0];
    expect(pt.count).toBe(1);
    expect(pt.hrAvg).toBe(70);
  });
});

// ── sampleAt ─────────────────────────────────────────────────────────────────

describe('sampleAt', () => {
  it('returns null on empty buffer', () => {
    expect(new LiveBuffer().sampleAt(0)).toBeNull();
  });

  it('returns the single sample regardless of t', () => {
    const buf = new LiveBuffer();
    buf.push(sample(500));
    expect(buf.sampleAt(0)?.t).toBe(500);
    expect(buf.sampleAt(1000)?.t).toBe(500);
  });

  it('returns closest sample by t (binary search)', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0));
    buf.push(sample(100));
    buf.push(sample(200));
    buf.push(sample(300));

    expect(buf.sampleAt(50)?.t).toBe(0);   // tie (equidistant from 0 and 100) → prefer earlier per tie-break rule
    expect(buf.sampleAt(160)?.t).toBe(200); // 160 closer to 200 than 100
    expect(buf.sampleAt(280)?.t).toBe(300); // 280 closer to 300 than 200
    expect(buf.sampleAt(-10)?.t).toBe(0);   // clamp to first
    expect(buf.sampleAt(999)?.t).toBe(300); // clamp to last
  });

  it('exact match returns that sample', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0));
    buf.push(sample(100));
    buf.push(sample(200));

    expect(buf.sampleAt(100)?.t).toBe(100);
  });
});

// ── clear() ──────────────────────────────────────────────────────────────────

describe('clear()', () => {
  it('resets aggregated, raw, and sampleAt', () => {
    const buf = new LiveBuffer();
    pushRange(buf, 50, 0, 20);
    buf.clear();

    expect(buf.aggregated()).toEqual([]);
    expect(buf.raw()).toEqual([]);
    expect(buf.sampleAt(0)).toBeNull();
  });

  it('buffer is usable again after clear', () => {
    const buf = new LiveBuffer();
    pushRange(buf, 50, 0, 20);
    buf.clear();
    buf.push(sample(0));

    expect(buf.raw()).toHaveLength(1);
    expect(buf.aggregated()).toHaveLength(1);
  });
});

// ── Ownership / aliasing ──────────────────────────────────────────────────────

describe('raw() ownership', () => {
  it('mutating a returned sample does not corrupt internal state', () => {
    const buf = new LiveBuffer();
    buf.push(sample(0, { hr: 70 }));

    const samples = buf.raw();
    // Force-mutate the returned object (cast needed because RawSample is readonly).
    (samples[0] as { hr: number }).hr = 999;

    // Internal state must be unchanged.
    const again = buf.raw();
    expect(again[0].hr).toBe(70);
  });
});

// ── Gap handling ──────────────────────────────────────────────────────────────

describe('gap handling', () => {
  it('gap of multiple buckets produces no synthetic empty buckets', () => {
    const buf = new LiveBuffer({ windowMs: 10_000, bucketMs: 1_000 });
    buf.push(sample(0,     { hr: 60 }));
    buf.push(sample(5_000, { hr: 80 }));
    const agg = buf.aggregated();
    expect(agg).toHaveLength(2);
    expect(agg[0].tStart).toBe(0);
    expect(agg[1].tStart).toBe(5_000);
  });
});
