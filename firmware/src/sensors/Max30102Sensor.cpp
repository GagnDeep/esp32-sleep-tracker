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
    // 400 Hz raw rate (SparkFun driver supports 50/100/200/400/800/1000
    // /1600/3200), 411 us pulse width = 18-bit ADC depth, no chip-side
    // averaging — we decimate in software so the coherence pipeline
    // gets the full 400 Hz timing precision while HR/SpO2 still see an
    // effective 100 Hz stream. FIFO rollover on so a stalled drain
    // doesn't block the I2C bus.
    dev_.setup(/*ledBrightness=*/cfg::MAX30102_LED_BRIGHTNESS,
               /*sampleAverage=*/cfg::MAX30102_SAMPLE_AVG,
               /*ledMode=*/2,        // Red + IR
               /*sampleRate=*/cfg::MAX30102_SAMPLE_HZ,
               /*pulseWidth=*/cfg::MAX30102_PULSE_WIDTH_US,
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
  // Drain everything the chip has buffered. At MAX30102_SAMPLE_HZ=400
  // and SENSOR_HZ=400, we typically pull 0–1 sample per call; under
  // scheduler jitter we can pull a few. dev_.check() pulls the FIFO
  // contents into the driver's internal ring; dev_.available() then
  // reports how many entries we can consume.
  dev_.check();
  while (dev_.available() > 0) {
    const uint32_t red = dev_.getFIFORed();
    const uint32_t ir  = dev_.getFIFOIR();
    dev_.nextSample();

    // Software decimation: only every Nth raw sample becomes a Reading
    // for HR/SpO2 consumers. Without this they'd see the full 400 Hz
    // stream and the HeartRateEstimator's fixed-tap state would be
    // wrong by a 4× factor.
    if (++decimCount_ < cfg::SENSOR_DECIMATION) continue;
    decimCount_ = 0;
    last_.t_ms   = timeservice::monotonicMs();
    last_.red    = red;
    last_.ir     = ir;
    last_.finger = ir > fingerThresh_;
    hasFresh_    = true;
  }
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
