#pragma once
#include <stddef.h>

// In-tree radix-2 Cooley-Tukey FFT for the coherence pipeline.
//
// We hand-rolled this instead of pulling in ESP-DSP because (a) ESP-DSP
// isn't packaged in the PlatformIO library registry and (b) at our 5 s
// cadence and N=256 the optimized assembly buys nothing measurable.
// The implementation runs in well under 1 ms on a 240 MHz ESP32.
//
// Hard-coded to N = cfg::COHERENCE_FFT_N (= 256). A static_assert in
// the .cpp guards against the constant drifting out of sync.

namespace coherence_fft {

// Precompute the Hann window. Must be called once at startup before
// the first compute() call.
void begin();

// In-place transform on a length-N real signal:
//   1. Subtract the mean (DC removal — Hann alone doesn't kill bin-0
//      leakage from a non-zero offset).
//   2. Apply the Hann window.
//   3. Forward FFT into complex domain.
//   4. Emit the one-sided power spectrum |X[k]|^2 for k in [0, N/2].
//
// `frame` must point to N floats and is destroyed by the call.
// `power_out` must point to (N/2 + 1) floats.
void compute(float* frame, float* power_out);

// The Hz width of one frequency bin: fs / N. Caller-side helper.
float binWidthHz(float fsHz);

}  // namespace coherence_fft
