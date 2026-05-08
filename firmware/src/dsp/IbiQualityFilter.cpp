#include "IbiQualityFilter.h"
#include "config.h"

namespace {

// Tiny insertion sort over a 7-element window. ~50 cycles on ESP32; much
// cheaper than qsort's setup overhead at this size.
void insertionSort(uint16_t* a, size_t n) {
  for (size_t i = 1; i < n; ++i) {
    const uint16_t key = a[i];
    size_t j = i;
    while (j > 0 && a[j - 1] > key) {
      a[j] = a[j - 1];
      --j;
    }
    a[j] = key;
  }
}

}  // namespace

void IbiQualityFilter::reset() {
  count_ = 0;
  head_  = 0;
  median_ = 0;
  lastRejected_  = 0;
  totalAccepted_ = 0;
  totalRejected_ = 0;
}

void IbiQualityFilter::recomputeMedian_() {
  uint16_t sorted[WINDOW];
  for (size_t i = 0; i < count_; ++i) sorted[i] = window_[i];
  insertionSort(sorted, count_);
  median_ = sorted[count_ / 2];
}

bool IbiQualityFilter::accept(uint16_t rrMs) {
  // Prime the median: accept the first MIN_PRIME samples unconditionally
  // so we have something to compare against. A persistently bad sensor
  // start would let a couple of bogus values pollute the seed, but that
  // self-corrects within ~7 beats as the window rolls them out.
  if (count_ < MIN_PRIME) {
    window_[head_] = rrMs;
    head_ = (head_ + 1) % WINDOW;
    if (count_ < WINDOW) ++count_;
    recomputeMedian_();
    ++totalAccepted_;
    return true;
  }

  // |rrMs - median| / median * 100 vs threshold. All-integer math; no
  // float needed and no risk of overflow given uint16 ranges.
  const int32_t diff = (int32_t)rrMs - (int32_t)median_;
  const int32_t absDiff = diff < 0 ? -diff : diff;
  const int32_t pct100 = absDiff * 100;
  if (pct100 > (int32_t)cfg::IBI_REJECT_PCT * (int32_t)median_) {
    lastRejected_ = rrMs;
    ++totalRejected_;
    return false;
  }

  window_[head_] = rrMs;
  head_ = (head_ + 1) % WINDOW;
  if (count_ < WINDOW) ++count_;
  recomputeMedian_();
  ++totalAccepted_;
  return true;
}
