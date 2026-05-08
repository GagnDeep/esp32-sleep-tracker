#include "SensorRegistry.h"
#include "../util/Log.h"
#include "../util/I2cBus.h"
#include <Arduino.h>
#include <Wire.h>
#include "pins.h"

namespace {
constexpr const char* TAG = "sensors";
constexpr uint32_t RESCAN_INTERVAL_MS = 5000;
}

bool SensorRegistry::begin() {
  {
    I2cGuard g;
    Wire.begin(pins::I2C_SDA, pins::I2C_SCL);
    Wire.setClock(400'000);
  }
  // Give breakouts a moment to power up before the first I2C transaction —
  // matters when the ESP32 is reset while the sensor stays powered, since
  // the ESP boots in <100 ms but the sensor may need longer.
  delay(50);

  const bool maxOk = max_.begin();
  const bool mpuOk = mpu_.begin();
  if (!maxOk) LOG_WARN(TAG, "MAX30102 missing — HR/SpO2 disabled (auto-retry every 5s)");
  if (!mpuOk) LOG_WARN(TAG, "MPU6050 missing — staging disabled (auto-retry every 5s)");
  return maxOk || mpuOk;  // we still boot if at least one is alive
}

bool SensorRegistry::rescan() {
  bool anyRecovered = false;
  if (!max_.ok() && max_.begin()) { LOG_INFO(TAG, "MAX30102 recovered"); anyRecovered = true; }
  if (!mpu_.ok() && mpu_.begin()) { LOG_INFO(TAG, "MPU6050 recovered");  anyRecovered = true; }
  return anyRecovered;
}

void SensorRegistry::tick() {
  // If a sensor is offline (e.g. plugged in after boot), retry begin every
  // RESCAN_INTERVAL_MS so the user doesn't have to reboot the device.
  if (!max_.ok() || !mpu_.ok()) {
    const uint32_t now = millis();
    if (now - lastRescanMs_ >= RESCAN_INTERVAL_MS) {
      lastRescanMs_ = now;
      rescan();
    }
  }
  max_.poll();
  mpu_.poll();
}
