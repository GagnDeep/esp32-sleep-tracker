// Unity test pinning the on-disk Sample layout. If anyone reorders or
// resizes a field, both the static_assert and the runtime checks here
// flag it loudly — and so will the corresponding TS test on the web
// side, because the parser keys off the same byte offsets.

#include <unity.h>
#include <stdint.h>
#include <string.h>

#include "../src/storage/Sample.h"

// Compile-time guard. The web parser assumes 14-byte stride; bumping
// to 16 is also tolerated here (matches Sample.h's own assert) but the
// JS reader would need an update first.
static_assert(sizeof(Sample) == 14 || sizeof(Sample) == 16,
              "Sample stride changed — update web/src/lib/api.ts parseSamples too");

void test_sample_size(void) {
  TEST_ASSERT_EQUAL_size_t(14, sizeof(Sample));
}

void test_field_offsets(void) {
  // We rely on these offsets in the JS parser; verify they match.
  TEST_ASSERT_EQUAL_size_t(0,  offsetof(Sample, t_ms));
  TEST_ASSERT_EQUAL_size_t(4,  offsetof(Sample, hr_bpm));
  TEST_ASSERT_EQUAL_size_t(6,  offsetof(Sample, spo2_pct));
  TEST_ASSERT_EQUAL_size_t(8,  offsetof(Sample, activity));
  TEST_ASSERT_EQUAL_size_t(10, offsetof(Sample, stage));
  TEST_ASSERT_EQUAL_size_t(11, offsetof(Sample, flags));
  TEST_ASSERT_EQUAL_size_t(12, offsetof(Sample, reserved));
}

void test_sample_flag_bits(void) {
  // Exhaustive enumeration of the SampleFlag bit constants; if a new
  // flag is added without a test here, this list goes stale and the
  // omission is obvious in code review.
  TEST_ASSERT_EQUAL_UINT8(1 << 0, SampleFlag::MOTION_ARTIFACT);
  TEST_ASSERT_EQUAL_UINT8(1 << 1, SampleFlag::FINGER_OFF);
  TEST_ASSERT_EQUAL_UINT8(1 << 2, SampleFlag::ALARM_FIRED);
  TEST_ASSERT_EQUAL_UINT8(1 << 3, SampleFlag::INVALID_HR);
  TEST_ASSERT_EQUAL_UINT8(1 << 4, SampleFlag::INVALID_SPO2);

  // Bits must be unique — OR-ing them together must equal the simple
  // sum, which would not hold if two flags shared a bit.
  const uint8_t all =
      SampleFlag::MOTION_ARTIFACT | SampleFlag::FINGER_OFF |
      SampleFlag::ALARM_FIRED    | SampleFlag::INVALID_HR  |
      SampleFlag::INVALID_SPO2;
  const uint8_t sum =
      SampleFlag::MOTION_ARTIFACT + SampleFlag::FINGER_OFF +
      SampleFlag::ALARM_FIRED    + SampleFlag::INVALID_HR  +
      SampleFlag::INVALID_SPO2;
  TEST_ASSERT_EQUAL_UINT8(sum, all);
  TEST_ASSERT_EQUAL_UINT8(0x1F, all);
}

void test_sample_stage_values(void) {
  TEST_ASSERT_EQUAL_UINT8(0, SampleStage::UNKNOWN);
  TEST_ASSERT_EQUAL_UINT8(1, SampleStage::AWAKE);
  TEST_ASSERT_EQUAL_UINT8(2, SampleStage::LIGHT);
  TEST_ASSERT_EQUAL_UINT8(3, SampleStage::DEEP);
}

void test_round_trip_bytes(void) {
  // Build a Sample, memcpy to a 14-byte buffer, read offsets back.
  // Mirrors what the firmware writes to /sessions/<id>.bin.
  Sample s{};
  s.t_ms = 0x12345678u;
  s.hr_bpm = 0xBEEF;
  s.spo2_pct = 974;
  s.activity = 132;
  s.stage = SampleStage::LIGHT;
  s.flags = SampleFlag::MOTION_ARTIFACT | SampleFlag::ALARM_FIRED;
  s.reserved = 0;

  uint8_t buf[14];
  memcpy(buf, &s, sizeof(buf));

  // little-endian read of t_ms
  uint32_t t = (uint32_t)buf[0] | ((uint32_t)buf[1] << 8) |
               ((uint32_t)buf[2] << 16) | ((uint32_t)buf[3] << 24);
  TEST_ASSERT_EQUAL_UINT32(0x12345678u, t);
  uint16_t hr = (uint16_t)buf[4] | ((uint16_t)buf[5] << 8);
  TEST_ASSERT_EQUAL_UINT16(0xBEEF, hr);
  TEST_ASSERT_EQUAL_UINT8(SampleStage::LIGHT, buf[10]);
  TEST_ASSERT_EQUAL_UINT8(SampleFlag::MOTION_ARTIFACT | SampleFlag::ALARM_FIRED, buf[11]);
}

#ifdef ARDUINO
#include <Arduino.h>
void setup() {
  delay(2000);
  UNITY_BEGIN();
  RUN_TEST(test_sample_size);
  RUN_TEST(test_field_offsets);
  RUN_TEST(test_sample_flag_bits);
  RUN_TEST(test_sample_stage_values);
  RUN_TEST(test_round_trip_bytes);
  UNITY_END();
}
void loop() {}
#else
int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_sample_size);
  RUN_TEST(test_field_offsets);
  RUN_TEST(test_sample_flag_bits);
  RUN_TEST(test_sample_stage_values);
  RUN_TEST(test_round_trip_bytes);
  return UNITY_END();
}
#endif
