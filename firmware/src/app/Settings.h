#pragma once
#include <Arduino.h>
#include <stdint.h>

// JSON-backed user settings (LittleFS /settings.json). All UI-facing
// configuration goes here so it survives reboots without re-flashing.

class Settings {
 public:
  // ---- Schema (v1) -----------------------------------------------------
  static constexpr uint16_t SCHEMA_VERSION = 1;

  String   deviceName     = "sleep-tracker";
  String   timezone       = "UTC0";

  // Smart alarm.
  bool     alarmEnabled   = false;
  uint16_t alarmStartMin  = 6 * 60 + 30;   // minutes-of-day
  uint16_t alarmEndMin    = 7 * 60 + 0;
  uint8_t  alarmDays      = 0b01111100;    // Mon..Fri default

  // Low-SpO2 audible alert.
  uint16_t spo2LowX10     = 880;           // 88.0%
  uint16_t spo2SustainS   = 30;

  // Sensor calibration.
  uint8_t  ledBrightness  = 0x1F;
  float    spo2CalA       = 110.0f;
  float    spo2CalB       =  25.0f;

  // Staging thresholds (override config.h defaults at runtime).
  uint16_t threshMotion   = 200;
  uint16_t threshStill    = 60;

  // Calibration state.
  uint8_t  baselineNights = 0;
  uint16_t userBaselineRmssd = 0;          // ms

  // ---- IO --------------------------------------------------------------
  bool load();
  bool save();           // immediate
  void requestSave();    // debounced; call from settings PUT handler
  void tick();           // call from loop/task to flush debounced save

 private:
  String  toJson() const;
  bool    fromJson(const String& json);
  uint32_t pendingSaveAt_ = 0;
};

extern Settings settings;
