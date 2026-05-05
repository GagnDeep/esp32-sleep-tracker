#pragma once
#include <stdint.h>

// Minimal interface so the SensorRegistry can iterate sensors without
// caring what they read. v1 has only MAX30102 and MPU6050; the
// abstraction is here so adding (e.g.) DHT22 or BME280 later is a
// contained change.

class ISensor {
 public:
  virtual ~ISensor() = default;
  virtual bool        begin()  = 0;
  virtual void        poll()   = 0;
  virtual const char* name() const = 0;
  virtual bool        ok() const   = 0;
};
