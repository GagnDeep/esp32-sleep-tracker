#include "CoherenceFft.h"
#include "config.h"
#include <math.h>

namespace coherence_fft {

namespace {

constexpr size_t N = 256;
static_assert(cfg::COHERENCE_FFT_N == N,
              "CoherenceFft is hard-coded to N=256; update if cfg changes");
static_assert((N & (N - 1)) == 0, "N must be a power of two");

constexpr float TWO_PI = 6.283185307179586f;

// Precomputed Hann window. ~1 KB in .bss.
float hann_[N];
// Imaginary work buffer for the in-place complex FFT. ~1 KB in .bss.
float im_[N];

// In-place bit-reversal permutation for length-N arrays.
void bitReverseInPlace(float* a) {
  size_t j = 0;
  for (size_t i = 1; i < N; ++i) {
    size_t bit = N >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      const float tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
  }
}

// Standard decimation-in-time Cooley-Tukey radix-2 FFT.
//
// Recurrence twiddles: each stage uses W_s = exp(-i 2π / s); within a
// stage the running twiddle is multiplied by W_s per butterfly. This
// uses two cosf/sinf calls per stage (8 stages total for N=256) — far
// cheaper than a per-butterfly trig call, and accuracy is plenty good
// for our peak-vs-broadband ratio.
void fft(float* re, float* im) {
  bitReverseInPlace(re);
  bitReverseInPlace(im);
  for (size_t s = 2; s <= N; s <<= 1) {
    const size_t m = s >> 1;
    const float theta = -TWO_PI / (float)s;
    const float wr_d = cosf(theta);
    const float wi_d = sinf(theta);
    for (size_t k = 0; k < N; k += s) {
      float wr = 1.0f, wi = 0.0f;
      for (size_t j = 0; j < m; ++j) {
        const size_t a = k + j;
        const size_t b = a + m;
        const float tr = wr * re[b] - wi * im[b];
        const float ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const float nwr = wr * wr_d - wi * wi_d;
        const float nwi = wr * wi_d + wi * wr_d;
        wr = nwr;
        wi = nwi;
      }
    }
  }
}

}  // namespace

void begin() {
  const float scale = TWO_PI / (float)(N - 1);
  for (size_t k = 0; k < N; ++k) {
    hann_[k] = 0.5f * (1.0f - cosf(scale * (float)k));
  }
}

void compute(float* frame, float* power_out) {
  // Subtract the mean before windowing. Hann attenuates DC by ~6 dB
  // but doesn't remove it; with IBIs centered around 0.6–1.0 s, the
  // residual DC term would dominate bins 0–2 and contaminate any
  // 0.04 Hz peak.
  float sum = 0.0f;
  for (size_t k = 0; k < N; ++k) sum += frame[k];
  const float mean = sum / (float)N;

  for (size_t k = 0; k < N; ++k) {
    frame[k] = (frame[k] - mean) * hann_[k];
    im_[k]   = 0.0f;
  }

  fft(frame, im_);

  // One-sided power spectrum: |X[k]|^2 for k = 0..N/2.
  for (size_t k = 0; k <= N / 2; ++k) {
    power_out[k] = frame[k] * frame[k] + im_[k] * im_[k];
  }
}

float binWidthHz(float fsHz) {
  return fsHz / (float)N;
}

}  // namespace coherence_fft
