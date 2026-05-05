#pragma once
#include <stdint.h>

// Compile-time defaults. Many of these are overridable at runtime via the
// settings JSON; the values here are factory defaults and bounds.

namespace cfg {

// ---- Sampling ----------------------------------------------------------
constexpr uint16_t SENSOR_HZ          = 100;   // raw sensor task rate
constexpr uint16_t SAMPLE_HZ          = 1;     // 1Hz aggregated sample rate
constexpr uint16_t SAMPLE_RING_SIZE   = 256;   // RAM ring before flush

// ---- Storage -----------------------------------------------------------
constexpr uint32_t FLUSH_INTERVAL_MS  = 60'000;
constexpr uint32_t LITTLEFS_RESERVE_BYTES = 256 * 1024;
#define SD_ENABLED 1

// ---- Network -----------------------------------------------------------
constexpr const char* MDNS_HOSTNAME   = "sleep-tracker";
constexpr const char* AP_SSID_PREFIX  = "SleepTracker-";
constexpr const char* NTP_SERVER      = "pool.ntp.org";
constexpr const char* DEFAULT_TZ      = "UTC0";  // user picks in setup

// ---- Sleep staging -----------------------------------------------------
constexpr uint16_t STAGER_TICK_S          = 30;
constexpr uint16_t STAGER_WINDOW_S        = 300;
constexpr uint16_t THRESH_MOTION          = 200;  // activity index 0..1000
constexpr uint16_t THRESH_STILL           = 60;
constexpr uint8_t  CALIBRATION_NIGHTS     = 3;
constexpr float    HRV_DEEP_FACTOR        = 1.2f;

// ---- Alarm / SpO2 alert -----------------------------------------------
constexpr uint16_t SPO2_LOW_X10_DEFAULT   = 880;  // 88.0%
constexpr uint16_t SPO2_LOW_SUSTAIN_S     = 30;
constexpr uint16_t SMART_ALARM_LOOKAHEAD_S = 1800;  // try wake in last 30 min

// ---- Sensors -----------------------------------------------------------
#define MPU_USE_INT 0   // default to polled when SD shares pins
constexpr uint8_t  MAX30102_LED_BRIGHTNESS = 0x1F;  // 0..0xFF
constexpr uint16_t MAX30102_FINGER_THRESH  = 50'000;

}  // namespace cfg
