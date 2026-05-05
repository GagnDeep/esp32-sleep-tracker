#pragma once
#include "ISensor.h"
#include <MPU6050.h>
#include <stdint.h>

// MPU6050 is used purely as an activity index source for sleep staging
// + alarm motion-artifact gating. We don't track orientation; per-poll
// |Δa| is summed/decayed into a 0..1000 activity index that the
// SleepStager consumes over a 5-min window.

class Mpu6050Sensor : public ISensor {
 public:
  struct Reading {
    uint32_t t_ms;
    int16_t  ax, ay, az;
    int16_t  gx, gy, gz;
    uint16_t activity;  // 0..1000, decayed running magnitude
  };

  bool        begin() override;
  void        poll()  override;
  const char* name() const override { return "mpu6050"; }
  bool        ok()   const override { return ok_; }

  bool get(Reading& out);

  // Returns the current decayed activity index (also embedded in Reading).
  uint16_t activityIndex() const { return last_.activity; }

 private:
  MPU6050 dev_{};
  Reading last_{};
  bool    hasFresh_ = false;
  bool    ok_ = false;
  int16_t prevAx_ = 0, prevAy_ = 0, prevAz_ = 0;
  float   activity_ = 0.0f;
};
