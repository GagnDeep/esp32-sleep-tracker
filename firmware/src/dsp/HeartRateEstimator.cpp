#include "HeartRateEstimator.h"
#include "config.h"
#include <heartRate.h>

namespace {
// Plausible HR window: derived from cfg::HR_MIN/HR_MAX.
constexpr uint16_t MAX_RR_MS = 60000 / cfg::HR_MIN;   // e.g. 25 BPM → 2400 ms
}  // namespace

void HeartRateEstimator::reset() {
  // The SparkFun lib's checkForBeat() carries global state (cbuf,
  // averageDCEstimator accumulator, IR_AC_Max/Min). We can't reset it
  // directly — but the DC estimator self-adapts within ~20 samples and
  // the AC tracking re-locks on the next zero crossing, so a missed
  // first beat or two is the worst-case cost of swapping rigs without
  // a reboot.
  lastBeatMs_  = 0;
  lastRR_      = 0;
  freshRR_     = false;
  smoothedBpm_ = 0;
}

uint16_t HeartRateEstimator::push(uint32_t t_ms, int32_t ir) {
  if (!checkForBeat(ir)) return smoothedBpm_;

  // Beat detected. Compute interval against the previous beat.
  if (lastBeatMs_ != 0) {
    uint32_t dt = t_ms - lastBeatMs_;
    if (dt < cfg::MIN_HR_DT_MS) dt = cfg::MIN_HR_DT_MS;
    if (dt <= MAX_RR_MS) {
      lastRR_  = (uint16_t)dt;
      freshRR_ = true;
      uint32_t inst = 60000u / dt;
      if (inst < cfg::HR_MIN) inst = cfg::HR_MIN;
      if (inst > cfg::HR_MAX) inst = cfg::HR_MAX;
      const uint32_t smoothed = smoothedBpm_ == 0
                                   ? inst
                                   : (smoothedBpm_ * 7u + inst) / 8u;
      smoothedBpm_ = (uint16_t)smoothed;
    }
  }
  lastBeatMs_ = t_ms;
  return smoothedBpm_;
}

bool HeartRateEstimator::popBeatIntervalMs(uint16_t& outRR) {
  if (!freshRR_) return false;
  outRR    = lastRR_;
  freshRR_ = false;
  return true;
}
