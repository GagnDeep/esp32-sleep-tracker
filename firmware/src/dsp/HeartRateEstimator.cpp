#include "HeartRateEstimator.h"
#include <math.h>

namespace {
// Plausible HR window: 30..220 BPM → RR 273..2000 ms.
constexpr uint16_t MIN_RR_MS = 273;
constexpr uint16_t MAX_RR_MS = 2000;

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
      const uint32_t dt = t_ms - lastBeatMs_;
      if (dt >= MIN_RR_MS && dt <= MAX_RR_MS) {
        lastRR_  = (uint16_t)dt;
        freshRR_ = true;
        const uint16_t inst = (uint16_t)(60000.0f / (float)dt);
        smoothedBpm_ = smoothedBpm_ == 0
                         ? inst
                         : (uint16_t)((smoothedBpm_ * 7 + inst) / 8);
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
