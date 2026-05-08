#pragma once
#include <stddef.h>

// Natural cubic-spline resampler.
//
// HRV analysis requires a uniformly-sampled IBI series so a fixed-bin
// FFT is meaningful, but raw IBIs land on irregular instants. The
// textbook treatment (Berntson et al., 1997) is to fit a natural cubic
// spline through the IBI series indexed by beat time, then evaluate at
// a fixed sample rate (commonly 4 Hz). Algorithm follows Numerical
// Recipes §3.3 — a tridiagonal Thomas-style solve for the second
// derivatives at each knot, then O(1) per output sample to evaluate.

class IbiResampler {
 public:
  // Resample n control points (x[i], y[i]) onto a uniform grid out[k] at
  // times xStart + k/fs for k=0..outN-1. x[] must be strictly increasing.
  // Returns false if there are too few control points, the input
  // exceeds MAX_PTS, or the requested grid is outside the x-range.
  bool resample(const float* x, const float* y, size_t n,
                float xStart, float fs,
                float* out, size_t outN);

  // Maximum number of input control points the resampler can handle.
  // Sized for the 64 s analysis window at heart rates up to ~120 BPM
  // (128 beats / 64 s = 2 Hz).
  static constexpr size_t MAX_PTS = 128;

 private:
  // Second-derivative at each knot. ~512 B in .bss.
  float ypp_[MAX_PTS];
  // Tridiagonal-solve scratch (the "u" vector in NR's formulation).
  float u_[MAX_PTS];
};
