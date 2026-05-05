#pragma once
#include "Max30102Sensor.h"
#include "Mpu6050Sensor.h"
#include <stdint.h>

// Single owner of all sensor instances. The sensor task drives
// SensorRegistry::tick() at the configured rate; the pipeline task
// reads via the typed accessors.

class SensorRegistry {
 public:
  bool begin();

  // Called from the sensor task (target ~100Hz).
  void tick();

  Max30102Sensor& max() { return max_; }
  Mpu6050Sensor&  mpu() { return mpu_; }

  bool maxOk() const { return max_.ok(); }
  bool mpuOk() const { return mpu_.ok(); }

 private:
  Max30102Sensor max_;
  Mpu6050Sensor  mpu_;
};
