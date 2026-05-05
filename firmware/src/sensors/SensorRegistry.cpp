#include "SensorRegistry.h"
#include "../util/Log.h"
#include <Wire.h>
#include "pins.h"

namespace {
constexpr const char* TAG = "sensors";
}

bool SensorRegistry::begin() {
  Wire.begin(pins::I2C_SDA, pins::I2C_SCL);
  Wire.setClock(400'000);

  const bool maxOk = max_.begin();
  const bool mpuOk = mpu_.begin();
  if (!maxOk) LOG_WARN(TAG, "MAX30102 missing — HR/SpO2 disabled");
  if (!mpuOk) LOG_WARN(TAG, "MPU6050 missing — staging disabled");
  return maxOk || mpuOk;  // we still boot if at least one is alive
}

void SensorRegistry::tick() {
  max_.poll();
  mpu_.poll();
}
