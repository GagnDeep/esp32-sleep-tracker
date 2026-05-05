#include "Spo2Estimator.h"
#include "config.h"
#include <math.h>

namespace {
constexpr float    DC_TAU     = 0.995f;     // ~2 s @ 100 Hz
constexpr uint32_t WINDOW_MS  = 1000;       // recompute every 1s
}

void Spo2Estimator::reset() {
  dcIr_ = dcRed_ = 0;
  acIrMin_ = acIrMax_ = 0;
  acRedMin_ = acRedMax_ = 0;
  windowStart_ = 0;
  primed_ = false;
  last_ = 0xFFFF;
}

uint16_t Spo2Estimator::push(uint32_t ir, uint32_t red) {
  const float fIr = (float)ir, fRed = (float)red;

  if (!primed_) {
    dcIr_ = fIr; dcRed_ = fRed;
    acIrMin_ = acIrMax_ = fIr;
    acRedMin_ = acRedMax_ = fRed;
    primed_ = true;
    return last_;
  }

  dcIr_  = dcIr_  * DC_TAU + fIr  * (1.0f - DC_TAU);
  dcRed_ = dcRed_ * DC_TAU + fRed * (1.0f - DC_TAU);

  // Skip frames where perfusion is too low to yield a usable ratio.
  if (dcIr_ < cfg::MIN_DC || dcRed_ < cfg::MIN_DC) {
    return last_ == 0xFFFF ? 0 : last_;
  }

  if (fIr  < acIrMin_)  acIrMin_  = fIr;
  if (fIr  > acIrMax_)  acIrMax_  = fIr;
  if (fRed < acRedMin_) acRedMin_ = fRed;
  if (fRed > acRedMax_) acRedMax_ = fRed;

  // Use millis indirectly via window-driven recompute.
  // We don't have a clock here; caller pushes at known rate so we
  // recompute every ~100 samples (~1 s @ 100 Hz).
  if (++windowStart_ >= 100) {
    windowStart_ = 0;
    const float acIr  = acIrMax_  - acIrMin_;
    const float acRed = acRedMax_ - acRedMin_;
    acIrMin_ = acIrMax_ = fIr;
    acRedMin_ = acRedMax_ = fRed;

    if (dcIr_ < cfg::MIN_DC || dcRed_ < cfg::MIN_DC ||
        acIr <= 0.0f || dcRed_ <= 0.0f) {
      return last_ == 0xFFFF ? 0 : last_;
    }
    const float r = (acRed / dcRed_) / (acIr / dcIr_);
    if (!isfinite(r)) {
      return last_ == 0xFFFF ? 0 : last_;
    }
    float spo2 = calA_ - calB_ * r;
    if (!isfinite(spo2)) {
      return last_ == 0xFFFF ? 0 : last_;
    }
    if (spo2 > 100.0f) spo2 = 100.0f;
    if (spo2 < 70.0f)  { return last_ == 0xFFFF ? 0 : last_; }
    last_ = (uint16_t)roundf(spo2 * 10.0f);
  }
  return last_;
}
