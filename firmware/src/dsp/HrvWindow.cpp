#include "HrvWindow.h"
#include <math.h>

void HrvWindow::reset() {
  head_ = tail_ = count_ = 0;
}

void HrvWindow::pushBeat(uint32_t t_ms, uint16_t rrMs) {
  t_[head_]  = t_ms;
  rr_[head_] = rrMs;
  head_ = (head_ + 1) % CAP;
  if (count_ < CAP) {
    ++count_;
  } else {
    tail_ = (tail_ + 1) % CAP;  // overwrote the oldest
  }
}

void HrvWindow::prune(uint32_t now_ms, uint32_t windowMs) {
  while (count_ > 0) {
    if ((now_ms - t_[tail_]) <= windowMs) break;
    tail_ = (tail_ + 1) % CAP;
    --count_;
  }
}

uint16_t HrvWindow::rmssdMs() const {
  if (count_ < 2) return 0;
  double sumSq = 0.0;
  size_t pairs = 0;
  size_t idx = tail_;
  uint16_t prev = rr_[idx];
  idx = (idx + 1) % CAP;
  for (size_t i = 1; i < count_; ++i) {
    const int32_t d = (int32_t)rr_[idx] - (int32_t)prev;
    sumSq += (double)d * d;
    prev = rr_[idx];
    idx = (idx + 1) % CAP;
    ++pairs;
  }
  if (pairs == 0) return 0;
  return (uint16_t)sqrt(sumSq / pairs);
}

uint16_t HrvWindow::sdnnMs() const {
  if (count_ < 2) return 0;
  double sum = 0.0, sumSq = 0.0;
  size_t idx = tail_;
  for (size_t i = 0; i < count_; ++i) {
    sum   += rr_[idx];
    sumSq += (double)rr_[idx] * rr_[idx];
    idx = (idx + 1) % CAP;
  }
  const double mean = sum / count_;
  const double var  = sumSq / count_ - mean * mean;
  if (var <= 0.0) return 0;
  return (uint16_t)sqrt(var);
}
