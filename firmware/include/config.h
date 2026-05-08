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

// ---- DSP numeric guards ------------------------------------------------
constexpr uint16_t MIN_HR_DT_MS = 250;   // ignore beat intervals shorter than this
constexpr uint16_t HR_MIN       = 25;    // BPM clamp lower bound
constexpr uint16_t HR_MAX       = 220;   // BPM clamp upper bound
constexpr float    MIN_DC       = 10000.0f;  // SpO2 perfusion floor

// ---- Watchdog / WS backpressure ---------------------------------------
constexpr uint8_t  WDT_TIMEOUT_S     = 10;
constexpr uint8_t  WS_QUEUE_DROP_AT  = 8;

// ---- Coherence DSP -----------------------------------------------------
// HeartMath-style HRV coherence: rhythmic IBI modulation in the 0.04–0.26
// Hz band yields a peak-to-broadband power ratio. The defaults below
// match the published HeartMath thresholds (Low <0.5, Med 0.5–2.5, High
// >2.5) and target a 64 s analysis window resampled to 4 Hz (256-pt
// real FFT, ~0.0156 Hz bin width — narrow enough to resolve a 0.1 Hz
// breathing peak without smearing into adjacent bins).
constexpr bool     COHERENCE_ENABLED         = true;
constexpr uint16_t COHERENCE_WINDOW_S        = 64;
constexpr uint16_t COHERENCE_FS_HZ           = 4;
constexpr uint16_t COHERENCE_FFT_N           = 256;
constexpr uint16_t COHERENCE_UPDATE_S        = 5;
constexpr float    COHERENCE_BAND_LO_HZ      = 0.04f;
constexpr float    COHERENCE_BAND_HI_HZ      = 0.26f;
constexpr float    COHERENCE_PEAK_HALFWIDTH_HZ = 0.015f;
constexpr float    COHERENCE_TOTAL_LO_HZ     = 0.0033f;
constexpr float    COHERENCE_TOTAL_HI_HZ     = 0.4f;
constexpr float    COHERENCE_LOW_THRESH      = 0.5f;
constexpr float    COHERENCE_HIGH_THRESH     = 2.5f;
constexpr uint8_t  IBI_REJECT_PCT            = 20;

}  // namespace cfg
