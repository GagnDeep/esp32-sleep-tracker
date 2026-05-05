#pragma once
#include <stdint.h>

class SessionManager;

// Heuristic three-state staging (awake/light/deep). Runs every 30s
// over the rolling 5-min HRV window owned by SessionManager. Emits a
// 3-window majority-smoothed stage that's read back by SessionManager
// and recorded in each Sample.

class SleepStager {
 public:
  void begin(SessionManager* sm);
  void tick();   // call at >= 1 Hz; internally rate-gates to 30s

  // Calibration: increment baseline_nights and update userBaselineRmssd
  // at the end of a session. SessionManager calls this on stop().
  void noteSessionEnd(uint16_t medianRmssd);

 private:
  uint8_t majority3(uint8_t a, uint8_t b, uint8_t c) const;

  SessionManager* sm_ = nullptr;
  uint32_t lastTickMs_ = 0;
  uint8_t  history_[3] = {0,0,0};
  uint8_t  hidx_ = 0;
};
