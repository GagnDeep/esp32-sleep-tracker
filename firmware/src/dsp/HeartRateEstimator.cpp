#include "HeartRateEstimator.h"
#include "config.h"
#include <math.h>

namespace {
// Plausible HR window: derived from cfg::HR_MIN/HR_MAX.
constexpr uint16_t MAX_RR_MS = 60000 / cfg::HR_MIN;   // e.g. 25 BPM → 2400 ms

// Envelope decay: 5 s time constant @ 100 Hz fs.
constexpr float ENV_DECAY = 0.995f;
}  // namespace

void HeartRateEstimator::reset() {
  x1_ = x2_ = y1_ = y2_ = 0;
  envelope_   = 0;
  above_      = false;
  lastBeatMs_ = 0;
  lastRR_     = 0;
  freshRR_    = false;
  smoothedBpm_ = 0;
}

uint16_t HeartRateEstimator::push(uint32_t t_ms, int32_t ir) {
  const float x = (float)ir;
  const float y = B0 * x + B1 * x1_ + B2 * x2_ - A1 * y1_ - A2 * y2_;
  x2_ = x1_; x1_ = x;
  y2_ = y1_; y1_ = y;

  const float ay = fabsf(y);
  if (ay > envelope_) envelope_ = ay;
  envelope_ *= ENV_DECAY;

  // Adaptive threshold: half the running envelope.
  const float thresh = envelope_ * 0.5f;

  if (!above_ && y > thresh) {
    above_ = true;
    if (lastBeatMs_ != 0) {
      uint32_t dt = t_ms - lastBeatMs_;
      // Clamp implausibly tight peaks (double-trigger / noise) to MIN_HR_DT_MS.
      if (dt < cfg::MIN_HR_DT_MS) dt = cfg::MIN_HR_DT_MS;
      if (dt <= MAX_RR_MS) {
        lastRR_  = (uint16_t)dt;
        freshRR_ = true;
        uint32_t inst = 60000u / dt;
        if (inst < cfg::HR_MIN) inst = cfg::HR_MIN;
        if (inst > cfg::HR_MAX) inst = cfg::HR_MAX;
        uint32_t smoothed = smoothedBpm_ == 0
                              ? inst
                              : (smoothedBpm_ * 7u + inst) / 8u;
        if (smoothed < cfg::HR_MIN) smoothed = cfg::HR_MIN;
        if (smoothed > cfg::HR_MAX) smoothed = cfg::HR_MAX;
        smoothedBpm_ = (uint16_t)smoothed;
      }
    }
    lastBeatMs_ = t_ms;
  } else if (above_ && y < thresh * 0.4f) {
    above_ = false;
  }

  return smoothedBpm_;
}

bool HeartRateEstimator::popBeatIntervalMs(uint16_t& outRR) {
  if (!freshRR_) return false;
  outRR    = lastRR_;
  freshRR_ = false;
  return true;
}
