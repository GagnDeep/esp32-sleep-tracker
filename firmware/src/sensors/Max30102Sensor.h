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

  void setLedBrightness(uint8_t b);
  void setFingerThreshold(uint16_t t) { fingerThresh_ = t; }

 private:
  MAX30105 dev_;
  Reading  last_{};
  bool     hasFresh_ = false;
  bool     ok_ = false;
  uint16_t fingerThresh_ = 50'000;
};
