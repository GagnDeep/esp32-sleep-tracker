#include "Coherence.h"
#include "CoherenceFft.h"
#include "IbiQualityFilter.h"
#include "IbiResampler.h"
#include "config.h"
#include "../util/Log.h"
#include <Arduino.h>
#include <atomic>
#include <math.h>

namespace coherence {

// Internal IBI ring shared between sensor task (writer) and coherence
// task (reader). Stage 2 only writes; stage 3's resampler is the first
// reader. Sized to cover the full 64 s analysis window plus headroom
// (256 IBIs ≈ 4 min @ 60 BPM).
struct IbiSample { uint32_t t_ms; float ibi_s; };
constexpr size_t IBI_RING_CAP = 256;

namespace {
constexpr const char* TAG = "coherence";

Snapshot          latest_{};
float             latestPeakPow_  = 0.0f;
float             latestTotalPow_ = 0.0f;
uint32_t          lastUpdateMs_    = 0;
uint32_t          pipelineStartMs_ = 0;
uint32_t          lastDebugLogMs_  = 0;
PublishFn         publisher_       = nullptr;

IbiQualityFilter  filter_;

// Sliding-window IBI store. Single-producer (sensor task) /
// single-consumer (coherence task). The writer increments writeSeq_ as
// the last operation; the reader takes a snapshot under acquire load.
IbiSample         ibiBuf_[IBI_RING_CAP];
std::atomic<uint32_t> writeSeq_{0};
uint32_t          totalSeen_ = 0;

// Resampler scratch. Sized to MAX_PTS (128) — comfortably above the ~80
// IBIs typical in a 64 s window at 60–90 BPM. Two parallel arrays
// (time-of-beat in seconds, IBI value in seconds) feed the spline.
constexpr size_t  CTRL_MAX = IbiResampler::MAX_PTS;
float             ctrlT_[CTRL_MAX];
float             ctrlY_[CTRL_MAX];
// 4 Hz × 256-sample resampled frame — input to the FFT.
float             frame_[256];
// One-sided power spectrum |X[k]|^2 for k=0..128.
float             power_[129];
IbiResampler      resampler_;

size_t snapshotIbis_(float* outT, float* outY, size_t maxN) {
  // The writer publishes by incrementing writeSeq_ last (release). We
  // load it acquire and copy the most-recent min(seq, capacity) entries
  // oldest-first. A racing writer could overwrite the oldest slot mid-
  // copy, but at ~1 IBI/s vs sub-100us copy time the probability is
  // negligible — and even if it happens, the resampler simply sees a
  // slightly newer-than-expected first sample, which doesn't break the
  // analysis.
  const uint32_t seq = writeSeq_.load(std::memory_order_acquire);
  const size_t total = seq < (uint32_t)IBI_RING_CAP ? (size_t)seq
                                                   : (size_t)IBI_RING_CAP;
  if (total == 0) return 0;
  const size_t take = total < maxN ? total : maxN;
  const uint32_t first = seq - (uint32_t)take;
  for (size_t k = 0; k < take; ++k) {
    const size_t idx = (size_t)((first + (uint32_t)k) % (uint32_t)IBI_RING_CAP);
    outT[k] = (float)ibiBuf_[idx].t_ms * 0.001f;
    outY[k] = ibiBuf_[idx].ibi_s;
  }
  return take;
}
}  // namespace

void begin() {
  latest_ = Snapshot{};
  latestPeakPow_   = 0.0f;
  latestTotalPow_  = 0.0f;
  lastUpdateMs_    = 0;
  lastDebugLogMs_  = 0;
  pipelineStartMs_ = millis();
  filter_.reset();
  writeSeq_.store(0, std::memory_order_release);
  totalSeen_ = 0;
  coherence_fft::begin();
  LOG_INFO(TAG, "begin (window=%us, fs=%uHz, N=%u, bin=%.4fHz)",
           (unsigned)cfg::COHERENCE_WINDOW_S,
           (unsigned)cfg::COHERENCE_FS_HZ,
           (unsigned)cfg::COHERENCE_FFT_N,
           coherence_fft::binWidthHz((float)cfg::COHERENCE_FS_HZ));
}

void pushIbi(uint32_t t_ms, uint16_t rrMs) {
  ++totalSeen_;
  if (!filter_.accept(rrMs)) return;
  const uint32_t seq = writeSeq_.load(std::memory_order_relaxed);
  IbiSample& slot = ibiBuf_[seq % IBI_RING_CAP];
  slot.t_ms  = t_ms;
  slot.ibi_s = (float)rrMs * 0.001f;
  // Release: the resampler reads writeSeq_ first, then reads slots up
  // to that count — making this store the synchronisation point.
  writeSeq_.store(seq + 1, std::memory_order_release);
}

void tickIfDue() {
  const uint32_t now = millis();
  if (now - lastUpdateMs_ < (uint32_t)cfg::COHERENCE_UPDATE_S * 1000u) return;
  lastUpdateMs_ = now;

  // Snapshot the most recent IBIs out of the SPSC ring.
  const size_t n = snapshotIbis_(ctrlT_, ctrlY_, CTRL_MAX);

  // Resample the last cfg::COHERENCE_WINDOW_S seconds onto a uniform
  // cfg::COHERENCE_FS_HZ × cfg::COHERENCE_FFT_N grid. Skip until we
  // have the full window of history (~64 s of IBIs).
  const float fs       = (float)cfg::COHERENCE_FS_HZ;
  const size_t N       = (size_t)cfg::COHERENCE_FFT_N;
  const float windowS  = (float)cfg::COHERENCE_WINDOW_S;
  bool        resampleOk = false;
  float       availSpanS = 0.0f;
  if (n >= 4) {
    const float tLast  = ctrlT_[n - 1];
    const float tFirst = ctrlT_[0];
    availSpanS = tLast - tFirst;
    const float tStart = tLast - (float)(N - 1) / fs;
    if (tStart >= tFirst) {
      resampleOk = resampler_.resample(ctrlT_, ctrlY_, n, tStart, fs,
                                       frame_, N);
    }
  }

  if (resampleOk) {
    coherence_fft::compute(frame_, power_);

    // ---- Peak / broadband bin layout ---------------------------------
    // binWidth = fs / N = 0.015625 Hz at 4 Hz / 256.
    const float  binHz       = coherence_fft::binWidthHz(fs);
    const size_t binLoBand   = (size_t)((float)cfg::COHERENCE_BAND_LO_HZ  / binHz);
    const size_t binHiBand_  = (size_t)((float)cfg::COHERENCE_BAND_HI_HZ  / binHz);
    const size_t binLoTotal  = (size_t)((float)cfg::COHERENCE_TOTAL_LO_HZ / binHz);
    const size_t binHiTotal_ = (size_t)((float)cfg::COHERENCE_TOTAL_HI_HZ / binHz);
    const size_t halfBins    = (size_t)((float)cfg::COHERENCE_PEAK_HALFWIDTH_HZ / binHz);
    const size_t binHiBand   = binHiBand_  < (N / 2) ? binHiBand_  : (N / 2);
    const size_t binHiTotal  = binHiTotal_ < (N / 2) ? binHiTotal_ : (N / 2);

    // ---- Find dominant peak in HRV band ------------------------------
    size_t peakBin = binLoBand;
    float  peakPow = power_[binLoBand];
    for (size_t k = binLoBand + 1; k <= binHiBand; ++k) {
      if (power_[k] > peakPow) { peakPow = power_[k]; peakBin = k; }
    }

    // ---- Peak vs broadband sums --------------------------------------
    // peakSum: power in peakBin ± COHERENCE_PEAK_HALFWIDTH_HZ — narrow
    // window so a true sinusoidal modulation concentrates most of its
    // energy here.
    const size_t peakLo = peakBin > halfBins ? peakBin - halfBins : 0;
    const size_t peakHi = (peakBin + halfBins) < (N / 2)
                            ? (peakBin + halfBins) : (N / 2);
    float peakSum = 0.0f;
    for (size_t k = peakLo; k <= peakHi; ++k) peakSum += power_[k];

    float totalSum = 0.0f;
    for (size_t k = binLoTotal; k <= binHiTotal; ++k) totalSum += power_[k];

    // ---- Coherence ratio = peak / (total - peak) ---------------------
    // Guard the denominator: at startup (constant signal) total-peak is
    // numerically zero. Treating it as ratio=0 (Low) is the right
    // physical interpretation.
    const float denom = totalSum - peakSum;
    const float ratio = denom > 1e-12f ? peakSum / denom : 0.0f;

    // ---- Score (0..16) ----------------------------------------------
    // ratio * 4 saturates at score=16 for ratio >= 4. Captures the
    // HeartMath bands: Low (<0.5) -> 0..2, Med (0.5..2.5) -> 2..10,
    // High (>2.5) -> 10..16.
    float scoreRaw = ratio * 4.0f;
    if (scoreRaw < 0.0f)  scoreRaw = 0.0f;
    if (scoreRaw > 16.0f) scoreRaw = 16.0f;
    const uint8_t score = (uint8_t)(scoreRaw + 0.5f);

    // ---- Level (0=Low,1=Med,2=High) ---------------------------------
    uint8_t level = 0;
    if (ratio >= (float)cfg::COHERENCE_HIGH_THRESH)      level = 2;
    else if (ratio >= (float)cfg::COHERENCE_LOW_THRESH)  level = 1;

    // ---- Achievement -------------------------------------------------
    // Accumulate score-per-tick only while in Med or High coherence.
    // Low ticks don't penalize; they just don't add — matches the way
    // HeartMath apps treat noise/artifact periods.
    uint32_t ach = (uint32_t)latest_.achievement;
    if (level >= 1) ach += score;
    if (ach > 0xFFFFu) ach = 0xFFFFu;

    const float peakHz = (float)peakBin * binHz;
    LOG_DEBUG(TAG,
              "ratio=%.2f score=%u level=%u peakHz=%.3f peakP=%.4g "
              "totP=%.4g ach=%u",
              ratio, (unsigned)score, (unsigned)level, peakHz,
              peakSum, totalSum, (unsigned)ach);

    latest_.ratio       = ratio;
    latest_.score       = score;
    latest_.level       = level;
    latest_.dominantHz  = peakHz;
    latest_.achievement = (uint16_t)ach;
    latestPeakPow_      = peakSum;
    latestTotalPow_     = totalSum;
  } else {
    LOG_DEBUG(TAG,
              "ibi acc=%lu rej=%lu | resample skip n=%u span=%.1f/%.0fs",
              (unsigned long)filter_.totalAccepted(),
              (unsigned long)filter_.totalRejected(),
              (unsigned)n, availSpanS, windowS);
  }

  latest_.sessionSec = (now - pipelineStartMs_) / 1000u;
  latest_.updatedMs  = now;
  (void)lastDebugLogMs_;

  // Fire the optional publisher (wired to ws_broadcaster from main.cpp).
  // Called even when resampling skipped — clients still get a heartbeat
  // showing the pipeline is alive and which sessionSec we're at.
  if (publisher_) publisher_(latest_);
}

const Snapshot& latest() { return latest_; }

DebugSnapshot debug() {
  DebugSnapshot d{};
  d.snap          = latest_;
  d.peakPower     = latestPeakPow_;
  d.totalPower    = latestTotalPow_;
  d.totalSeen     = totalSeen_;
  d.totalAccepted = filter_.totalAccepted();
  d.totalRejected = filter_.totalRejected();
  d.medianMs      = filter_.medianMs();

  // Last 8 IBIs from the SPSC ring, oldest first. See snapshotIbis_ in
  // the anonymous namespace for the writer/reader race semantics.
  const uint32_t seq = writeSeq_.load(std::memory_order_acquire);
  const size_t total = seq < (uint32_t)IBI_RING_CAP ? (size_t)seq
                                                   : (size_t)IBI_RING_CAP;
  const size_t take = total < 8 ? total : 8;
  d.lastIbisN = (uint8_t)take;
  for (size_t k = 0; k < take; ++k) {
    const size_t idx = (size_t)((seq - (uint32_t)take + (uint32_t)k)
                                % (uint32_t)IBI_RING_CAP);
    d.lastIbisMs[k] = (uint16_t)(ibiBuf_[idx].ibi_s * 1000.0f);
  }
  return d;
}

void setPublisher(PublishFn fn) { publisher_ = fn; }

}  // namespace coherence
