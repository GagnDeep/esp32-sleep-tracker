#pragma once
#include <stdint.h>
#include <stddef.h>

// Reject IBI samples that fall more than IBI_REJECT_PCT% from a small
// running median of recent accepted samples. This is the standard HRV
// "20% rule" used by Kubios, NeuroKit, and HeartMath software — it
// catches the dominant artifact patterns (missed beat -> 2x interval,
// double-trigger -> 0.5x interval, motion -> wild outlier) without
// distorting genuine HRV which rarely exceeds ±20% beat-to-beat.
//
// Style mirrors HeartRateEstimator: trailing-underscore members,
// anonymous-namespace constants in the .cpp.

class IbiQualityFilter {
 public:
  void  reset();

  // Returns true if `rrMs` is plausible vs the running median and was
  // therefore accepted (and added to the median window). The first
  // MIN_PRIME samples bypass the check while the median primes.
  bool  accept(uint16_t rrMs);

  // Diagnostics.
  uint16_t medianMs()        const { return median_; }
  uint16_t lastRejectedMs()  const { return lastRejected_; }
  uint32_t totalAccepted()   const { return totalAccepted_; }
  uint32_t totalRejected()   const { return totalRejected_; }

 private:
  // 7 samples is enough to absorb a single artifact without losing the
  // trend, and a 7-element insertion-sort median is essentially free.
  static constexpr size_t WINDOW    = 7;
  static constexpr size_t MIN_PRIME = 3;

  uint16_t window_[WINDOW]{};
  size_t   count_ = 0;       // number of valid entries (capped at WINDOW)
  size_t   head_  = 0;       // next write index
  uint16_t median_ = 0;
  uint16_t lastRejected_ = 0;
  uint32_t totalAccepted_ = 0;
  uint32_t totalRejected_ = 0;

  void recomputeMedian_();
};
