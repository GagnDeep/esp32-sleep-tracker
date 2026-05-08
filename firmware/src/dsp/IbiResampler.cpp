#include "IbiResampler.h"

bool IbiResampler::resample(const float* x, const float* y, size_t n,
                            float xStart, float fs,
                            float* out, size_t outN) {
  if (n < 4 || n > MAX_PTS || outN == 0 || fs <= 0.0f) return false;

  const float invFs = 1.0f / fs;
  const float xEnd  = xStart + (float)(outN - 1) * invFs;
  // The grid must lie strictly inside the control-point span; the
  // spline isn't valid outside [x[0], x[n-1]].
  if (xStart < x[0] || xEnd > x[n - 1]) return false;

  // ---- Compute ypp_ via natural cubic spline (NR §3.3) -----------------
  // Boundary conditions: y''[0] = y''[n-1] = 0 ("natural" spline).
  ypp_[0] = 0.0f;
  u_[0]   = 0.0f;
  for (size_t i = 1; i < n - 1; ++i) {
    const float h0 = x[i]     - x[i - 1];
    const float h1 = x[i + 1] - x[i];
    const float hSum = x[i + 1] - x[i - 1];
    // Guard against duplicate timestamps; shouldn't happen in practice
    // because IBIs are emitted on distinct beats, but a numerical
    // coincidence shouldn't blow up the solve.
    if (h0 <= 0.0f || h1 <= 0.0f) return false;
    const float sig = h0 / hSum;
    const float p   = sig * ypp_[i - 1] + 2.0f;
    ypp_[i] = (sig - 1.0f) / p;
    float u = (y[i + 1] - y[i]) / h1 - (y[i] - y[i - 1]) / h0;
    u = (6.0f * u / hSum - sig * u_[i - 1]) / p;
    u_[i] = u;
  }
  ypp_[n - 1] = 0.0f;
  // Back-substitution.
  for (size_t k = n - 1; k > 0; --k) {
    const size_t kk = k - 1;
    ypp_[kk] = ypp_[kk] * ypp_[kk + 1] + u_[kk];
  }

  // ---- Evaluate at uniform grid ---------------------------------------
  // Grid is monotonically increasing, so we walk j forward through the
  // control points instead of binary-searching every output sample.
  size_t j = 0;
  for (size_t k = 0; k < outN; ++k) {
    const float xi = xStart + (float)k * invFs;
    while (j + 2 < n && x[j + 1] < xi) ++j;
    const float h = x[j + 1] - x[j];
    const float a = (x[j + 1] - xi) / h;
    const float b = (xi - x[j])     / h;
    out[k] = a * y[j] + b * y[j + 1]
           + ((a * a * a - a) * ypp_[j] + (b * b * b - b) * ypp_[j + 1])
             * (h * h) / 6.0f;
  }
  return true;
}
