#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Single global mutex serialising every Wire.* / I2C-driver call. The
// SparkFun MAX3010x and Electronic Cats MPU6050 libs both call into the
// shared `Wire` instance internally, so any sensor poll/check from
// another task can otherwise interleave bytes on the bus.

namespace i2cbus {

// Initialise the mutex. Call once from setup() before any sensor begin().
void init();

SemaphoreHandle_t handle();

}  // namespace i2cbus

// RAII guard. Take `tickWait` ticks; default = portMAX_DELAY (block).
class I2cGuard {
 public:
  explicit I2cGuard(TickType_t tickWait = portMAX_DELAY) {
    auto h = i2cbus::handle();
    if (h) held_ = (xSemaphoreTake(h, tickWait) == pdTRUE);
  }
  ~I2cGuard() {
    if (held_) xSemaphoreGive(i2cbus::handle());
  }
  bool held() const { return held_; }

  I2cGuard(const I2cGuard&) = delete;
  I2cGuard& operator=(const I2cGuard&) = delete;

 private:
  bool held_ = false;
};
