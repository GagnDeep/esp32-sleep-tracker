#include "AlarmController.h"
#include "SessionManager.h"
#include "Settings.h"
#include "../storage/Sample.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "pins.h"
#include "config.h"
#include <Arduino.h>
#include <time.h>

namespace {
constexpr const char* TAG = "alarm";
constexpr uint8_t  LEDC_CHAN = 0;
constexpr uint8_t  LEDC_RES  = 8;
constexpr uint32_t MIN_REFIRE_S = 60;  // don't re-fire within 60s
}

void AlarmController::begin(SessionManager* sm) {
  sm_ = sm;
  ledcSetup(LEDC_CHAN, 2000, LEDC_RES);
  ledcAttachPin(pins::BUZZER, LEDC_CHAN);
  ledcWrite(LEDC_CHAN, 0);
}

void AlarmController::startTone(uint16_t freq, uint16_t durationMs) {
  ledcWriteTone(LEDC_CHAN, freq);
  ledcWrite(LEDC_CHAN, 1 << (LEDC_RES - 1));  // 50% duty
  firing_ = true;
  firingUntilMs_ = millis() + durationMs;
  if (sm_) sm_->setAlarmFiredFlag();
}

void AlarmController::silence() {
  ledcWrite(LEDC_CHAN, 0);
  firing_ = false;
}

void AlarmController::test(uint16_t durationMs) {
  startTone(2400, durationMs);
}

bool AlarmController::isWeekday(uint32_t epoch, uint8_t mask) const {
  if (mask == 0) return true;  // any-day
  time_t t = (time_t)epoch;
  struct tm tm;
  localtime_r(&t, &tm);
  // bit0=Sun..bit6=Sat
  return (mask & (1 << tm.tm_wday)) != 0;
}

bool AlarmController::inSmartWindow(uint32_t epoch) const {
  if (!settings.alarmEnabled || epoch == 0) return false;
  if (!isWeekday(epoch, settings.alarmDays)) return false;
  time_t t = (time_t)epoch;
  struct tm tm;
  localtime_r(&t, &tm);
  const uint16_t mod = tm.tm_hour * 60 + tm.tm_min;
  return mod >= settings.alarmStartMin && mod < settings.alarmEndMin;
}

void AlarmController::tick() {
  // Auto-stop tone when its duration elapses.
  if (firing_ && (int32_t)(millis() - firingUntilMs_) >= 0) silence();
  if (!sm_) return;

  // Smart alarm: when active session + inside window + light/awake.
  if (sm_->active()) {
    const uint32_t epoch = timeservice::epoch();
    if (inSmartWindow(epoch) && (epoch - lastFireEpoch_) > MIN_REFIRE_S) {
      const uint8_t stage = sm_->stage();
      if (stage == SampleStage::LIGHT || stage == SampleStage::AWAKE) {
        LOG_INFO(TAG, "smart alarm firing in stage %u", stage);
        startTone(2400, 4000);
        lastFireEpoch_ = epoch;
      }
    }
  }

  // Low-SpO2 alert with motion-artifact gate.
  const uint16_t spo2 = sm_->spo2X10();
  const uint8_t  flags = sm_->flags();
  const bool motion = (flags & SampleFlag::MOTION_ARTIFACT) != 0;
  const bool fingerOff = (flags & SampleFlag::FINGER_OFF) != 0;
  if (spo2 != 0xFFFF && spo2 < settings.spo2LowX10 && !motion && !fingerOff) {
    if (lowSpo2BeganMs_ == 0) lowSpo2BeganMs_ = millis();
    const uint32_t breachMs = millis() - lowSpo2BeganMs_;
    const uint32_t epoch = timeservice::epoch();
    if (breachMs >= (uint32_t)settings.spo2SustainS * 1000 &&
        (epoch - lastFireEpoch_) > MIN_REFIRE_S) {
      LOG_WARN(TAG, "low SpO2 (%u.%u%%) sustained — firing",
               spo2 / 10, spo2 % 10);
      startTone(1800, 3000);
      lastFireEpoch_ = epoch;
    }
  } else {
    lowSpo2BeganMs_ = 0;
  }
}
