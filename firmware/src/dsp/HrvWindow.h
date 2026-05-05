#pragma once
#include <stdint.h>
#include <stddef.h>

// Rolling RR-interval buffer (~5 min). Computes RMSSD and SDNN; the
// SleepStager uses RMSSD vs the calibrated user baseline to identify
// deep sleep.

class HrvWindow {
 public:
  void  reset();
  void  pushBeat(uint32_t t_ms, uint16_t rrMs);

  // Drop intervals older than `windowMs` from the head. Cheap; safe to
  // call every tick.
  void  prune(uint32_t now_ms, uint32_t windowMs = 5 * 60 * 1000);

  uint16_t rmssdMs() const;
  uint16_t sdnnMs()  const;
  size_t   beatCount() const { return count_; }

 private:
  static constexpr size_t CAP = 512;  // ~8 min @ 60 BPM
  uint32_t t_[CAP]{};
  uint16_t rr_[CAP]{};
  size_t   head_ = 0;   // next write
  size_t   tail_ = 0;   // oldest valid
  size_t   count_ = 0;
};
