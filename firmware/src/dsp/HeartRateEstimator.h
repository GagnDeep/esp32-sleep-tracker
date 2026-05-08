#pragma once
#include <stdint.h>

// Arduino's binary.h defines B0/B1/... as numeric macros. Undef them
// before our IIR coefficient member names trip the preprocessor.
#ifdef B0
#undef B0
#endif
#ifdef B1
#undef B1
#endif
#ifdef B2
#undef B2
#endif

// Bandpass + peak-detect HR estimator for the MAX30102 IR channel.
// Designed to be cheap (~us per sample) so it can run inside the 100Hz
// sensor task. Beat intervals are emitted out-of-band so HrvWindow can
// compute RMSSD/SDNN over them.

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

  // Diagnostic peek for /api/debug/hr.
  struct DebugSnapshot {
    float    yLast;        // most recent bandpass output sample
    float    envelope;     // running peak envelope
    float    threshold;    // envelope * 0.5
    bool     above;        // currently above the rising threshold
    uint32_t lastBeatMs;
    uint16_t lastRR;
    uint16_t smoothedBpm;
  };
  DebugSnapshot debug() const {
    return { y1_, envelope_, envelope_ * 0.5f, above_, lastBeatMs_, lastRR_, smoothedBpm_ };
  }

 private:
  // Two-pole IIR bandpass coefficients (≈0.5–4 Hz @ 100 Hz fs).
  // y[n] = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2
  static constexpr float B0 =  0.1453f;
  static constexpr float B1 =  0.0f;
  static constexpr float B2 = -0.1453f;
  static constexpr float A1 = -1.6660f;
  static constexpr float A2 =  0.7094f;

  float x1_ = 0, x2_ = 0;
  float y1_ = 0, y2_ = 0;

  // Adaptive peak detection.
  float    envelope_   = 0.0f;
  bool     above_      = false;
  uint32_t lastBeatMs_ = 0;

  uint16_t lastRR_     = 0;
  bool     freshRR_    = false;

  uint16_t smoothedBpm_ = 0;
};
