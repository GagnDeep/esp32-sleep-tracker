#pragma once
#include "ISensor.h"
#include <MAX30105.h>
#include <stdint.h>

// Wrapper around SparkFun's MAX3010x driver. We expose raw IR/Red counts
// plus a "finger-present" flag derived from IR amplitude; downstream DSP
// owns peak detection and SpO2 ratio math.

class Max30102Sensor : public ISensor {
 public:
  struct Reading {
    uint32_t t_ms;
    uint32_t ir;
    uint32_t red;
    bool     finger;
  };

  bool        begin() override;
  void        poll()  override;
  const char* name() const override { return "max30102"; }
  bool        ok()   const override { return ok_; }

  // Latest reading; returns false if no new sample since last get().
  bool get(Reading& out);

  // Peek at the most recent reading without consuming hasFresh_. Returns
  // zero-initialised values until the first poll() success. Used by
  // diagnostic API endpoints.
  Reading peek() const { return last_; }
  uint16_t fingerThreshold() const { return fingerThresh_; }

  void setLedBrightness(uint8_t b);
  void setFingerThreshold(uint16_t t) { fingerThresh_ = t; }

 private:
  MAX30105 dev_;
  Reading  last_{};
  bool     hasFresh_ = false;
  bool     ok_ = false;
  uint16_t fingerThresh_ = 50'000;
  // Decimation counter for the cfg::MAX30102_SAMPLE_HZ -> 100 Hz path.
  // Counts raw FIFO samples; emits a Reading on every Nth one.
  uint8_t  decimCount_ = 0;
};
