#pragma once
#include <stdint.h>

// Synthetic IBI generators for the coherence pipeline. Compiled out
// unless `-DCOHERENCE_TEST_MODE=1`. The generators feed the same
// pipeline path as real beats (filter -> ring -> resampler -> FFT)
// so what gets logged / broadcast under a test signal is exactly what
// the device will produce on real input that matches the synthetic
// shape.
//
// Acceptance targets (per the plan):
//   A  0.10 Hz sinusoidal IBI modulation -> ratio>5, f0≈0.10 Hz, score=16
//   B  white-noise IBIs                  -> ratio<0.3, level=Low, score=0
//   C  0.25 Hz fast-breathing modulation -> peak at f0≈0.25 Hz (still
//                                          in-band; score reflects ratio
//                                          but dominantHz is the tell)
//
// Selected at runtime via Settings::coherenceTestSignal (0=real,
// 1=A, 2=B, 3=C). When non-zero the real sensor's beats are dropped
// at coherence::pushIbi() — synthetic mode owns the pipeline.

#if COHERENCE_TEST_MODE

namespace coherence_test {

enum Signal : uint8_t {
  SIG_REAL = 0,
  SIG_A    = 1,
  SIG_B    = 2,
  SIG_C    = 3,
};

// Switch to a different synthetic source. Resets the internal phase /
// PRNG / next-beat clock so the ramp-up behaves like a fresh session.
void   setSignal(uint8_t s);
uint8_t signal();

// Drive synthetic beats forward to `now_ms`. Should be called every
// few hundred ms from the coherence task. Internally schedules each
// next beat at `previous + ibi`, so an idle gap (e.g. WiFi setup) is
// caught up in a single burst on the next call.
void   tick(uint32_t now_ms);

}  // namespace coherence_test

#endif  // COHERENCE_TEST_MODE
