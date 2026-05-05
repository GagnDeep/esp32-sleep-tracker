#include "SleepStager.h"
#include "SessionManager.h"
#include "Settings.h"
#include "../storage/Sample.h"
#include "../util/Log.h"
#include "config.h"
#include <Arduino.h>

namespace { constexpr const char* TAG = "stager"; }

void SleepStager::begin(SessionManager* sm) { sm_ = sm; }

uint8_t SleepStager::majority3(uint8_t a, uint8_t b, uint8_t c) const {
  if (a == b || a == c) return a;
  if (b == c)           return b;
  return c;  // all-different → newest
}

void SleepStager::tick() {
  if (!sm_ || !sm_->active()) return;
  const uint32_t now = millis();
  if (now - lastTickMs_ < (uint32_t)cfg::STAGER_TICK_S * 1000) return;
  lastTickMs_ = now;

  const uint16_t activity = sm_->activity();
  const uint16_t rmssd    = sm_->hrv().rmssdMs();

  uint8_t inst = SampleStage::UNKNOWN;
  if (activity > settings.threshMotion) {
    inst = SampleStage::AWAKE;
  } else if (activity < settings.threshStill &&
             settings.userBaselineRmssd > 0 &&
             rmssd > (uint16_t)(settings.userBaselineRmssd * cfg::HRV_DEEP_FACTOR)) {
    inst = SampleStage::DEEP;
  } else {
    inst = SampleStage::LIGHT;
  }

  history_[hidx_ % 3] = inst;
  ++hidx_;
  const uint8_t smoothed = (hidx_ < 3)
    ? inst
    : majority3(history_[0], history_[1], history_[2]);
  sm_->setStage(smoothed);
  LOG_DEBUG(TAG, "act=%u rmssd=%u → %u", activity, rmssd, smoothed);
}

void SleepStager::noteSessionEnd(uint16_t medianRmssd) {
  if (medianRmssd == 0) return;
  // Running median across nights, capped at CALIBRATION_NIGHTS.
  if (settings.baselineNights == 0) {
    settings.userBaselineRmssd = medianRmssd;
  } else {
    settings.userBaselineRmssd =
        (uint16_t)((settings.userBaselineRmssd * settings.baselineNights + medianRmssd)
                   / (settings.baselineNights + 1));
  }
  if (settings.baselineNights < 255) ++settings.baselineNights;
  settings.requestSave();
  LOG_INFO(TAG, "baseline RMSSD=%u after %u nights",
           settings.userBaselineRmssd, settings.baselineNights);
}
