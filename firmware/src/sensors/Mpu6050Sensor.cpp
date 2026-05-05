#include "Mpu6050Sensor.h"
#include "../util/Log.h"
#include "../util/TimeService.h"

namespace {
constexpr const char* TAG = "mpu6050";

// Decay applied each poll (~100Hz). After ~1s of stillness the activity
// index falls to ~14% of its peak, after ~2s to ~2%.
constexpr float DECAY = 0.98f;
// Scale chosen so a vigorous wrist motion saturates near 1000.
constexpr float SCALE = 0.0035f;
}  // namespace

bool Mpu6050Sensor::begin() {
  dev_.initialize();
  ok_ = dev_.testConnection();
  if (!ok_) {
    LOG_ERROR(TAG, "testConnection failed");
    return false;
  }
  // ±2g full-scale gives the best resolution for sleep-scale movement.
  dev_.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
  LOG_INFO(TAG, "online");
  return true;
}

void Mpu6050Sensor::poll() {
  if (!ok_) return;
  int16_t ax, ay, az, gx, gy, gz;
  dev_.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  const int32_t dx = ax - prevAx_;
  const int32_t dy = ay - prevAy_;
  const int32_t dz = az - prevAz_;
  prevAx_ = ax; prevAy_ = ay; prevAz_ = az;

  const float mag = (float)((dx < 0 ? -dx : dx) +
                            (dy < 0 ? -dy : dy) +
                            (dz < 0 ? -dz : dz));
  activity_ = activity_ * DECAY + mag * SCALE;
  if (activity_ > 1000.0f) activity_ = 1000.0f;

  last_.t_ms     = timeservice::monotonicMs();
  last_.ax = ax; last_.ay = ay; last_.az = az;
  last_.gx = gx; last_.gy = gy; last_.gz = gz;
  last_.activity = (uint16_t)activity_;
  hasFresh_ = true;
}

bool Mpu6050Sensor::get(Reading& out) {
  if (!hasFresh_) return false;
  out = last_;
  hasFresh_ = false;
  return true;
}
