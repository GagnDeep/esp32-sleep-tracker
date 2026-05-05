#pragma once
#include <stdint.h>

// SpO2 via the classic ratio-of-ratios:
//   R = (AC_red / DC_red) / (AC_ir / DC_ir)
//   SpO2 ≈ A - B*R   (calibration constants)
//
// We track DC as a slow exponential moving average and AC as the
// peak-to-peak swing of a recent window. Validity is gated on
// perfusion: if either DC is too low, we report invalid.

class Spo2Estimator {
 public:
  void reset();

  // Push paired Red/IR samples at the sensor rate (~100 Hz). Returns
  // the latest SpO2 *10 (e.g. 975 → 97.5%) or 0xFFFF when invalid.
  uint16_t push(uint32_t ir, uint32_t red);

  uint16_t value() const { return last_; }
  bool     valid() const { return last_ != 0xFFFF; }

  // Calibration constants (defaults from the SparkFun example).
  void setCalibration(float a, float b) { calA_ = a; calB_ = b; }

 private:
  float dcIr_  = 0, dcRed_ = 0;
  float acIrMin_  = 0, acIrMax_  = 0;
  float acRedMin_ = 0, acRedMax_ = 0;
  uint32_t windowStart_ = 0;
  bool     primed_  = false;
  uint16_t last_    = 0xFFFF;
  float    calA_    = 110.0f;
  float    calB_    = 25.0f;
};
