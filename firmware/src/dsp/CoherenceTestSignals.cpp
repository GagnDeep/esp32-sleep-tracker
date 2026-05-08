#include "CoherenceTestSignals.h"

#if COHERENCE_TEST_MODE

#include "Coherence.h"
#include <math.h>

namespace coherence {
// Provided by Coherence.cpp under COHERENCE_TEST_MODE. Pushes an IBI
// straight into the pipeline ring, bypassing the IbiQualityFilter so
// test-B's white-noise series isn't half-rejected as "artifact".
void injectTestIbi(uint32_t t_ms, uint16_t rrMs);
}  // namespace coherence

namespace coherence_test {

namespace {

constexpr float MEAN_IBI_S = 0.85f;        // ~70 BPM baseline.
constexpr float TWO_PI     = 6.283185307179586f;

uint8_t  signal_     = SIG_REAL;
uint32_t startMs_    = 0;
uint32_t nextBeatMs_ = 0;
uint32_t prng_       = 0xDEADBEEFu;

uint32_t lcg32() {
  prng_ = prng_ * 1664525u + 1013904223u;
  return prng_;
}

uint16_t generateIbiMs(float t_s) {
  switch (signal_) {
    case SIG_A: {
      // ±100 ms around 850 ms at 0.10 Hz — strong RSA, should saturate
      // the score and produce ratio >> 5.
      const float ibi = MEAN_IBI_S + 0.10f * sinf(TWO_PI * 0.10f * t_s);
      return (uint16_t)(ibi * 1000.0f);
    }
    case SIG_B: {
      // White noise: uniform ±50 ms around 850 ms. Inside the 20%
      // filter envelope so all samples survive injection (we bypass
      // the filter anyway).
      const float u = ((float)(lcg32() & 0xFFFF) / 65535.0f - 0.5f) * 0.10f;
      return (uint16_t)((MEAN_IBI_S + u) * 1000.0f);
    }
    case SIG_C: {
      // 0.25 Hz "fast breathing" — still inside the 0.04–0.26 Hz band,
      // so the FFT will still register a clean peak; the dominantHz
      // value is what tells you the breathing rate is too fast.
      const float ibi = MEAN_IBI_S + 0.10f * sinf(TWO_PI * 0.25f * t_s);
      return (uint16_t)(ibi * 1000.0f);
    }
    default:
      return (uint16_t)(MEAN_IBI_S * 1000.0f);
  }
}

}  // namespace

void setSignal(uint8_t s) {
  if (s > SIG_C) s = SIG_REAL;
  if (s == signal_) return;
  signal_     = s;
  startMs_    = 0;
  nextBeatMs_ = 0;
  prng_       = 0xDEADBEEFu;
}

uint8_t signal() { return signal_; }

void tick(uint32_t now_ms) {
  if (signal_ == SIG_REAL) return;
  if (startMs_ == 0) {
    startMs_    = now_ms;
    nextBeatMs_ = now_ms;
  }
  // Catch up to wall-clock in case we were idle. `(int32_t)` cast handles
  // the (rare) wrap of 32-bit millis at ~49 days.
  while ((int32_t)(now_ms - nextBeatMs_) >= 0) {
    const float t_s = (float)(nextBeatMs_ - startMs_) * 0.001f;
    const uint16_t rr = generateIbiMs(t_s);
    coherence::injectTestIbi(nextBeatMs_, rr);
    nextBeatMs_ += rr;
  }
}

}  // namespace coherence_test

#endif  // COHERENCE_TEST_MODE
