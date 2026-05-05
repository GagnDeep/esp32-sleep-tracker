#pragma once
#include <stddef.h>
#include <stdint.h>
#include <atomic>

// Single-producer / single-consumer lock-free ring buffer. The pipeline
// task drains samples produced by the sensor task; both run on different
// cores, so we use atomics to avoid a mutex on the hot path.

template <typename T, size_t N>
class RingBuffer {
  static_assert((N & (N - 1)) == 0, "RingBuffer capacity must be a power of two");

 public:
  RingBuffer() : head_(0), tail_(0) {}

  bool push(const T& v) {
    const size_t h = head_.load(std::memory_order_relaxed);
    const size_t t = tail_.load(std::memory_order_acquire);
    if (h - t >= N) return false;  // full
    buf_[h & (N - 1)] = v;
    head_.store(h + 1, std::memory_order_release);
    return true;
  }

  bool pop(T& out) {
    const size_t t = tail_.load(std::memory_order_relaxed);
    const size_t h = head_.load(std::memory_order_acquire);
    if (t == h) return false;  // empty
    out = buf_[t & (N - 1)];
    tail_.store(t + 1, std::memory_order_release);
    return true;
  }

  size_t size() const {
    return head_.load(std::memory_order_acquire) -
           tail_.load(std::memory_order_acquire);
  }
  bool   empty() const { return size() == 0; }
  size_t capacity() const { return N; }

 private:
  T buf_[N];
  std::atomic<size_t> head_;
  std::atomic<size_t> tail_;
};
