// Ring buffer that aggregates 50 Hz live samples into 1 Hz buckets for
// the rolling Live view. Pure module — no DOM, no signals. The caller
// wires the instance to a signal and calls push() from the WS handler.
//
// Design notes:
//   - rawBuf is a pre-allocated circular array; rawHead is the next
//     write slot; rawTail tracks the oldest live slot explicitly so
//     eviction is O(1).
//   - aggBuf stores sealed AggregatedPoints. The open bucket lives in
//     `acc` and is included by aggregated() without sealing (so callers
//     always see the freshest data).
//   - Aggregated eviction is time-based: any sealed bucket whose tEnd
//     is <= (latestT - windowMs) is dropped by advancing aggTail.

export interface RawSample {
  t: number;        // ms since session start, monotonic
  hr: number;
  spo2: number;
  activity: number;
  stage: number;
  flags: number;
}

export interface AggregatedPoint {
  tStart: number;   // bucket start (ms, inclusive)
  tEnd: number;     // bucket end (ms, exclusive)
  hrAvg: number;
  hrMax: number;
  spo2Avg: number;
  spo2Min: number;  // dips matter more than peaks
  activityMax: number;
  count: number;
}

export interface LiveBufferOptions {
  windowMs?: number;   // default 60_000
  bucketMs?: number;   // default 1_000
  maxRaw?: number;     // default ceil(windowMs / 20) → ~3000
}

// In-place mutable accumulator for the currently open bucket.
interface Accumulator {
  tStart: number;
  tEnd: number;
  hrSum: number;
  hrMax: number;
  hrValidCount: number;
  spo2Sum: number;
  spo2Min: number;
  spo2ValidCount: number;
  activityMax: number;
  count: number;
}

// hr=0 and hr=0xffff are sentinels — match formatBpm convention.
// NaN is also rejected: !!NaN === false, mirroring the !bpm guard in formatBpm.
function isValidHr(hr: number): boolean {
  return !!hr && hr !== 0xffff;
}

// spo2=0 and spo2>=200 are sentinels — match formatPct convention.
// NaN is also rejected: !!NaN === false, mirroring the !pct guard in formatPct.
function isValidSpo2(spo2: number): boolean {
  return !!spo2 && spo2 < 200;
}

function sealAccumulator(acc: Accumulator): AggregatedPoint {
  return {
    tStart:      acc.tStart,
    tEnd:        acc.tEnd,
    hrAvg:       acc.hrValidCount > 0 ? acc.hrSum / acc.hrValidCount : 0,
    hrMax:       acc.hrValidCount > 0 ? acc.hrMax : 0,
    spo2Avg:     acc.spo2ValidCount > 0 ? acc.spo2Sum / acc.spo2ValidCount : 0,
    spo2Min:     acc.spo2ValidCount > 0 ? acc.spo2Min : 0,
    activityMax: acc.activityMax,
    count:       acc.count,
  };
}

function makeAccumulator(tStart: number, bucketMs: number): Accumulator {
  return {
    tStart,
    tEnd:           tStart + bucketMs,
    hrSum:          0,
    hrMax:          0,
    hrValidCount:   0,
    spo2Sum:        0,
    spo2Min:        Infinity,
    spo2ValidCount: 0,
    activityMax:    0,
    count:          0,
  };
}

export class LiveBuffer {
  private readonly windowMs: number;
  private readonly bucketMs: number;
  private readonly maxRaw: number;
  private readonly maxAgg: number;

  // Raw circular buffer: rawBuf[rawHead] is the next write slot.
  // Live entries span [rawTail .. rawHead) (mod maxRaw).
  private rawBuf: RawSample[];
  private rawHead: number;  // next write position
  private rawTail: number;  // oldest live position
  private rawCount: number; // == (rawHead - rawTail + maxRaw) % maxRaw

  // Sealed aggregated buckets. Same circular layout.
  private aggBuf: AggregatedPoint[];
  private aggHead: number;
  private aggTail: number;
  private aggCount: number;

  // Currently open (unsealable) bucket accumulator.
  private acc: Accumulator | null;

  // Monotonicity guard — drop any sample with t < lastT.
  private lastT: number;

  constructor(opts: LiveBufferOptions = {}) {
    this.windowMs = opts.windowMs ?? 60_000;
    this.bucketMs = opts.bucketMs ?? 1_000;
    this.maxAgg   = Math.ceil(this.windowMs / this.bucketMs) + 1; // +1 for open acc overflow
    this.maxRaw   = opts.maxRaw ?? Math.ceil(this.windowMs / 20);

    this.rawBuf   = new Array<RawSample>(this.maxRaw);
    this.rawHead  = 0;
    this.rawTail  = 0;
    this.rawCount = 0;

    this.aggBuf   = new Array<AggregatedPoint>(this.maxAgg);
    this.aggHead  = 0;
    this.aggTail  = 0;
    this.aggCount = 0;

    this.acc   = null;
    this.lastT = -1;
  }

  push(s: RawSample): void {
    // Enforce monotonic time — sensors can stutter; silently drop.
    if (s.t < this.lastT) return;
    this.lastT = s.t;

    // If the sample belongs to a newer bucket, seal the old one and
    // open the next. Repeat in case of a large gap (multiple empty
    // buckets between pushes — we do NOT emit synthetic empty buckets
    // for gaps; we just open the right one).
    if (this.acc !== null && s.t >= this.acc.tEnd) {
      this._sealAndAdvance(s.t);
    }

    // Open a fresh accumulator if needed.
    if (this.acc === null) {
      const bucketStart = Math.floor(s.t / this.bucketMs) * this.bucketMs;
      this.acc = makeAccumulator(bucketStart, this.bucketMs);
    }

    // Accumulate into the open bucket (O(1)).
    this.acc.count++;
    if (isValidHr(s.hr)) {
      this.acc.hrSum += s.hr;
      this.acc.hrValidCount++;
      if (s.hr > this.acc.hrMax) this.acc.hrMax = s.hr;
    }
    if (isValidSpo2(s.spo2)) {
      this.acc.spo2Sum += s.spo2;
      this.acc.spo2ValidCount++;
      if (s.spo2 < this.acc.spo2Min) this.acc.spo2Min = s.spo2;
    }
    if (s.activity > this.acc.activityMax) this.acc.activityMax = s.activity;

    // Append raw sample to ring, evicting the oldest if full.
    this.rawBuf[this.rawHead] = s;
    this.rawHead = (this.rawHead + 1) % this.maxRaw;
    if (this.rawCount < this.maxRaw) {
      this.rawCount++;
    } else {
      // Ring full: oldest slot just got overwritten; advance tail.
      this.rawTail = (this.rawTail + 1) % this.maxRaw;
    }

    // Evict raw samples outside the trailing window.
    const cutoff = s.t - this.windowMs;
    while (this.rawCount > 0 && this.rawBuf[this.rawTail].t <= cutoff) {
      this.rawTail = (this.rawTail + 1) % this.maxRaw;
      this.rawCount--;
    }

    // Evict sealed aggregated buckets outside the trailing window.
    // A bucket is outside the window when its tEnd <= cutoff (i.e. it
    // ended before the window starts). We keep the current open acc
    // regardless of age — it will be sealed or evicted on next push.
    while (this.aggCount > 0 && this.aggBuf[this.aggTail].tEnd <= cutoff) {
      this.aggTail = (this.aggTail + 1) % this.maxAgg;
      this.aggCount--;
    }
  }

  // Seal the current accumulator into aggBuf and open the next one.
  // If there's a large time gap we just open the bucket for the
  // given timestamp directly (no synthetic empty buckets).
  private _sealAndAdvance(nextT: number): void {
    if (this.acc === null) return;
    const pt = sealAccumulator(this.acc);
    this.aggBuf[this.aggHead] = pt;
    this.aggHead = (this.aggHead + 1) % this.maxAgg;
    if (this.aggCount < this.maxAgg) {
      this.aggCount++;
    } else {
      // Agg ring full — overwrite oldest.
      this.aggTail = (this.aggTail + 1) % this.maxAgg;
    }
    this.acc = null;
    // If there's a gap of more than one bucket, skip directly to the
    // right one rather than emitting empty intermediate buckets.
    void nextT; // consumed by push() which opens the correct bucket
  }

  // Return sealed buckets plus the open accumulator (if any) as
  // AggregatedPoints, oldest first.
  // O(aggCount) — reading the ring is a slice, not a recompute.
  aggregated(): AggregatedPoint[] {
    const sealed = this.aggCount;
    const hasOpen = this.acc !== null && this.acc.count > 0;
    const total = sealed + (hasOpen ? 1 : 0);
    if (total === 0) return [];

    const result: AggregatedPoint[] = new Array(total);
    for (let i = 0; i < sealed; i++) {
      result[i] = this.aggBuf[(this.aggTail + i) % this.maxAgg];
    }
    if (hasOpen) {
      result[sealed] = sealAccumulator(this.acc!);
    }
    return result;
  }

  // Return live raw samples oldest-first.
  raw(): RawSample[] {
    if (this.rawCount === 0) return [];
    const result: RawSample[] = new Array(this.rawCount);
    for (let i = 0; i < this.rawCount; i++) {
      result[i] = this.rawBuf[(this.rawTail + i) % this.maxRaw];
    }
    return result;
  }

  // Binary search for the raw sample whose t is closest to query.
  // The ring is sorted by t (monotonicity enforced on push), so we
  // binary-search over logical indices [0, rawCount).
  // O(log n).
  sampleAt(t: number): RawSample | null {
    if (this.rawCount === 0) return null;

    // Binary search: find the leftmost index where rawBuf[idx].t >= t.
    let lo = 0;
    let hi = this.rawCount; // exclusive upper bound

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.rawBuf[(this.rawTail + mid) % this.maxRaw].t < t) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // `lo` is now the first index with .t >= t (or rawCount if all < t).
    // Compare candidates at lo-1 and lo; pick the closer one.
    // On a tie, prefer lo-1 (older, i.e. lower t) — matches "closest".
    if (lo === 0) {
      return this.rawBuf[this.rawTail];
    }
    if (lo === this.rawCount) {
      return this.rawBuf[(this.rawTail + this.rawCount - 1) % this.maxRaw];
    }
    const prev = this.rawBuf[(this.rawTail + lo - 1) % this.maxRaw];
    const curr = this.rawBuf[(this.rawTail + lo) % this.maxRaw];
    // On exact tie prefer the earlier sample (prev).
    return (curr.t - t) < (t - prev.t) ? curr : prev;
  }

  clear(): void {
    this.rawHead  = 0;
    this.rawTail  = 0;
    this.rawCount = 0;
    this.aggHead  = 0;
    this.aggTail  = 0;
    this.aggCount = 0;
    this.acc      = null;
    this.lastT    = -1;
  }
}
