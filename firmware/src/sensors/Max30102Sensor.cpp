#include "Max30102Sensor.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "../util/I2cBus.h"
#include "config.h"

namespace {
constexpr const char* TAG = "max30102";
}

bool Max30102Sensor::begin() {
  // The MAX30102 sometimes isn't ready to ACK on I2C until ~50-100 ms after
  // power-up. If the ESP32 boots faster than the sensor (common after EN
  // reset while the sensor stays powered), the SparkFun lib's first
  // readPartID() can return -1 and begin() returns false. Retry a few times
  // with small delays before giving up.
  for (int attempt = 0; attempt < 4; ++attempt) {
    if (attempt > 0) delay(80);
    bool started;
    {
      I2cGuard g;
      started = dev_.begin(Wire, I2C_SPEED_FAST);
    }
    if (started) break;
    if (attempt == 3) {
      LOG_ERROR(TAG, "begin failed after %d attempts", attempt + 1);
      ok_ = false;
      return false;
    }
  }

  {
    I2cGuard g;
    // Recommended config for HR + SpO2: 100 Hz, 411 us pulse width,
    // sample averaging x4, FIFO rollover on so we never block the bus.
    dev_.setup(/*ledBrightness=*/cfg::MAX30102_LED_BRIGHTNESS,
               /*sampleAverage=*/4,
               /*ledMode=*/2,        // Red + IR
               /*sampleRate=*/100,
               /*pulseWidth=*/411,
               /*adcRange=*/4096);
  }

  fingerThresh_ = cfg::MAX30102_FINGER_THRESH;
  ok_ = true;
  LOG_INFO(TAG, "online");
  return true;
}

void Max30102Sensor::poll() {
  if (!ok_) return;
  I2cGuard g;
  while (dev_.available() == 0) {
    dev_.check();
    if (dev_.available() == 0) return;  // nothing this cycle
  }
  last_.t_ms   = timeservice::monotonicMs();
  last_.red    = dev_.getFIFORed();
  last_.ir     = dev_.getFIFOIR();
  last_.finger = last_.ir > fingerThresh_;
  hasFresh_    = true;
  dev_.nextSample();
}

bool Max30102Sensor::get(Reading& out) {
  if (!hasFresh_) return false;
  out = last_;
  hasFresh_ = false;
  return true;
}

void Max30102Sensor::setLedBrightness(uint8_t b) {
  I2cGuard g;
  dev_.setPulseAmplitudeRed(b);
  dev_.setPulseAmplitudeIR(b);
}
