#pragma once
#include <stdint.h>

// HeartMath-style HRV coherence pipeline.
//
// Pipeline shape (filled in across stages):
//   IBI source (HeartRateEstimator::popBeatIntervalMs)
//     -> IbiQualityFilter        (20%-of-running-median rejection)
//     -> IbiResampler            (cubic spline -> 4 Hz x 256 samples)
//     -> CoherenceFft            (Hann window + ESP-DSP real FFT)
//     -> CoherenceMetrics        (peak-power / (total-power - peak-power))
//     -> CoherenceScorer         (ratio -> 0..16 score, classification)
//
// Stage 1 ships the public surface and a no-op tick. Subsequent stages
// fill in the modules behind this header without changing the call sites
// in main.cpp / SessionManager.

namespace coherence {

struct Snapshot {
  // Most recent ratio = peakPower / (totalPower - peakPower) inside the
  // 0.04–0.26 Hz band. 0 means "no estimate yet".
  float    ratio        = 0.0f;
  // 0..16 mapped from ratio per HeartMath thresholds.
  uint8_t  score        = 0;
  // Classification: 0=Low, 1=Med, 2=High.
  uint8_t  level        = 0;
  // Cumulative achievement (sum of score-deltas weighted by time-in-zone).
  uint16_t achievement  = 0;
  // Dominant in-band frequency (Hz).
  float    dominantHz   = 0.0f;
  // Wall-clock seconds since session/coherence pipeline started — surfaced
  // to clients so the dashboard can show a stable elapsed counter even
  // when WS frames arrive at irregular cadence.
  uint32_t sessionSec   = 0;
  // Monotonic ms when this snapshot was produced.
  uint32_t updatedMs    = 0;
};

// Initialise pipeline state. Idempotent; safe to call from setup().
void begin();

// Push one beat-to-beat interval (ms) measured at monotonic timestamp
// `t_ms`. Cheap (constant-time append into the IBI ring). Designed to be
// called from the sensor task on every detected beat.
void pushIbi(uint32_t t_ms, uint16_t rrMs);

// Run a coherence update if `cfg::COHERENCE_UPDATE_S` has elapsed since
// the last one. Designed to be called from the dedicated coherenceTask
// (core 0) every ~500 ms; the gate inside this function decides whether
// the heavy DSP runs.
void tickIfDue();

// Latest snapshot. Cheap; safe to read without locking from any core
// (writes are produced atomically inside tickIfDue and the struct is
// small enough that a torn read is bounded to the current vs previous
// frame — both are valid).
const Snapshot& latest();

}  // namespace coherence
