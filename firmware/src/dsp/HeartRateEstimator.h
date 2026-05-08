#pragma once
#include <stdint.h>

// HR estimator wrapping SparkFun's PBA (Penpheral Beat Amplitude)
// `checkForBeat()` — a Maxim reference implementation that's robust
// against startup transients and finger-placement DC drift. Cheap
// (~us per sample), suitable for the 100Hz sensor task. We layer
// monotonic-clock tracking, plausibility clamping and HRV interval
// emission on top of it.

class HeartRateEstimator {
 public:
  void  reset();

  // Push one IR sample taken at `t_ms` (monotonic). Returns the latest
  // smoothed BPM, or 0 while still warming up.
  uint16_t push(uint32_t t_ms, int32_t ir);

  // Returns the most recent beat-to-beat interval (ms) and clears the
  // "fresh" flag, so HrvWindow can poll it once per beat.
  bool popBeatIntervalMs(uint16_t& outRR);

  uint16_t bpm() const { return smoothedBpm_; }

  // Diagnostic peek for /api/debug/hr. Several fields are kept for
  // backwards compatibility with the previous estimator's debug view —
  // they're populated as best they can from the new algorithm.
  struct DebugSnapshot {
    float    yLast;
    float    envelope;
    float    threshold;
    bool     above;
    uint32_t lastBeatMs;
    uint16_t lastRR;
    uint16_t smoothedBpm;
  };
  DebugSnapshot debug() const {
    return { 0.0f, 0.0f, 0.0f, false, lastBeatMs_, lastRR_, smoothedBpm_ };
  }

 private:
  uint32_t lastBeatMs_ = 0;
  uint16_t lastRR_     = 0;
  bool     freshRR_    = false;
  uint16_t smoothedBpm_ = 0;
};
