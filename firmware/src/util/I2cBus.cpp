#include "I2cBus.h"

namespace i2cbus {

namespace {
SemaphoreHandle_t s_mutex = nullptr;
}  // namespace

void init() {
  if (s_mutex) return;
  s_mutex = xSemaphoreCreateMutex();
}

SemaphoreHandle_t handle() {
  return s_mutex;
}

}  // namespace i2cbus
