#include "Coherence.h"
#include "IbiQualityFilter.h"
#include "config.h"
#include "../util/Log.h"
#include <Arduino.h>
#include <atomic>

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
uint32_t          lastUpdateMs_    = 0;
uint32_t          pipelineStartMs_ = 0;
uint32_t          lastDebugLogMs_  = 0;

IbiQualityFilter  filter_;

// Sliding-window IBI store. Single-producer (sensor task) /
// single-consumer (coherence task). The writer increments writeSeq_ as
// the last operation; the reader can detect mid-update reads by
// re-checking writeSeq_ after the snapshot — see snapshotIbis() in
// later stages.
IbiSample         ibiBuf_[IBI_RING_CAP];
std::atomic<uint32_t> writeSeq_{0};
uint32_t          totalSeen_ = 0;
}  // namespace

void begin() {
  latest_ = Snapshot{};
  lastUpdateMs_     = 0;
  lastDebugLogMs_   = 0;
  pipelineStartMs_  = millis();
  filter_.reset();
  writeSeq_.store(0, std::memory_order_release);
  totalSeen_ = 0;
  LOG_INFO(TAG, "begin (window=%us, fs=%uHz, N=%u)",
           (unsigned)cfg::COHERENCE_WINDOW_S,
           (unsigned)cfg::COHERENCE_FS_HZ,
           (unsigned)cfg::COHERENCE_FFT_N);
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

  // Stage 2 scaffold: no metrics yet, but surface filter health every
  // tick so on-device runs make it obvious whether IBIs are arriving
  // and whether the 20%-rule is busy rejecting artifacts.
  LOG_DEBUG(TAG, "ibi seen=%lu acc=%lu rej=%lu med=%ums lastRej=%ums",
            (unsigned long)totalSeen_,
            (unsigned long)filter_.totalAccepted(),
            (unsigned long)filter_.totalRejected(),
            (unsigned)filter_.medianMs(),
            (unsigned)filter_.lastRejectedMs());

  latest_.sessionSec = (now - pipelineStartMs_) / 1000u;
  latest_.updatedMs  = now;
}

const Snapshot& latest() { return latest_; }

}  // namespace coherence
