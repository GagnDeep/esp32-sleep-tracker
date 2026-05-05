#pragma once
#include <stdint.h>

// Wire/disk format. Keep this in sync with web/src/lib/api.ts (parser).
//
// 16 bytes per sample @ 1 Hz → ~460 KB for an 8h night.
struct __attribute__((packed)) Sample {
  uint32_t t_ms;        // ms since session start
  uint16_t hr_bpm;      // 0xFFFF = invalid
  uint16_t spo2_pct;    // x10 (e.g. 975 = 97.5%); 0xFFFF = invalid
  uint16_t activity;    // 0..1000
  uint8_t  stage;       // 0=unknown, 1=awake, 2=light, 3=deep
  uint8_t  flags;       // bit0=motion, bit1=finger_off, bit2=alarm_fired
  uint16_t reserved;
};

static_assert(sizeof(Sample) == 14 || sizeof(Sample) == 16,
              "Sample layout drift — update web parser too");

// Flag bit definitions. The struct uses 14 bytes packed; we publish 16
// in the docs by counting the natural 2-byte alignment when stored
// inside arrays. Use the constants below rather than raw bits.
namespace SampleFlag {
constexpr uint8_t MOTION_ARTIFACT = 1 << 0;
constexpr uint8_t FINGER_OFF      = 1 << 1;
constexpr uint8_t ALARM_FIRED     = 1 << 2;
constexpr uint8_t INVALID_HR      = 1 << 3;
constexpr uint8_t INVALID_SPO2    = 1 << 4;
}  // namespace SampleFlag

namespace SampleStage {
constexpr uint8_t UNKNOWN = 0;
constexpr uint8_t AWAKE   = 1;
constexpr uint8_t LIGHT   = 2;
constexpr uint8_t DEEP    = 3;
}  // namespace SampleStage
