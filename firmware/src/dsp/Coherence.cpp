#include "Coherence.h"
#include "config.h"
#include "../util/Log.h"
#include <Arduino.h>

namespace coherence {

namespace {
constexpr const char* TAG = "coherence";

Snapshot   latest_{};
uint32_t   lastUpdateMs_ = 0;
uint32_t   pipelineStartMs_ = 0;
}  // namespace

void begin() {
  latest_ = Snapshot{};
  lastUpdateMs_     = 0;
  pipelineStartMs_  = millis();
  LOG_INFO(TAG, "begin (window=%us, fs=%uHz, N=%u)",
           (unsigned)cfg::COHERENCE_WINDOW_S,
           (unsigned)cfg::COHERENCE_FS_HZ,
           (unsigned)cfg::COHERENCE_FFT_N);
}

void pushIbi(uint32_t /*t_ms*/, uint16_t /*rrMs*/) {
  // Stage 1 scaffold: filled in by Stage 2's IbiQualityFilter wiring.
}

void tickIfDue() {
  const uint32_t now = millis();
  if (now - lastUpdateMs_ < (uint32_t)cfg::COHERENCE_UPDATE_S * 1000u) return;
  lastUpdateMs_ = now;

  // Stage 1 scaffold: no metrics yet. Later stages compute ratio/score
  // and update `latest_` here. We still bump sessionSec so callers can
  // observe the pipeline is alive.
  latest_.sessionSec = (now - pipelineStartMs_) / 1000u;
  latest_.updatedMs  = now;
}

const Snapshot& latest() { return latest_; }

}  // namespace coherence
