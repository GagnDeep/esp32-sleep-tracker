#include "SessionManager.h"
#include "Settings.h"
#include "SleepStager.h"
#include "../net/WsBroadcaster.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "version.h"
#include <ArduinoJson.h>
#include <time.h>

namespace {
constexpr const char* TAG = "session";
}

SessionManager sessionManager;

void SessionManager::begin(SensorRegistry* sensors, SessionStore* store) {
  sensors_ = sensors;
  store_   = store;
  hr_.reset();
  spo2_.reset();
  hrv_.reset();
}

void SessionManager::sensorTick() {
  if (!sensors_) return;
  Max30102Sensor::Reading r;
  if (sensors_->max().get(r)) {
    if (r.finger) {
      const uint16_t bpm = hr_.push(r.t_ms, (int32_t)r.ir);
      liveHr_ = bpm;
      uint16_t rr;
      if (hr_.popBeatIntervalMs(rr)) {
        hrv_.pushBeat(r.t_ms, rr);
        hrv_.prune(r.t_ms);
      }
      const uint16_t s = spo2_.push(r.ir, r.red);
      liveSpo2_ = s;
      liveFlags_ = (uint8_t)(liveFlags_ & ~SampleFlag::FINGER_OFF);
      lastFingerOnMs_ = r.t_ms;
    } else {
      // Brief finger-off events are common when the user shifts their
      // finger on the sensor — without this hysteresis the dashboard
      // would flash "—" every few seconds even with a steady reading.
      // Only zero the live values once the finger has been gone for
      // long enough to plausibly be a real removal.
      constexpr uint32_t FINGER_GRACE_MS = 3000;
      const bool reallyGone = lastFingerOnMs_ == 0 ||
                              (r.t_ms - lastFingerOnMs_) > FINGER_GRACE_MS;
      if (reallyGone) {
        liveHr_   = 0;
        liveSpo2_ = 0xFFFF;
      }
      liveFlags_ |= SampleFlag::FINGER_OFF;
    }
  }
  Mpu6050Sensor::Reading m;
  if (sensors_->mpu().get(m)) {
    liveAct_ = m.activity;
    if (m.activity > 600) {
      liveFlags_ |= SampleFlag::MOTION_ARTIFACT;
    } else if (m.activity < 200) {
      liveFlags_ = (uint8_t)(liveFlags_ & ~SampleFlag::MOTION_ARTIFACT);
    }
  }
}

void SessionManager::pipelineTick() {
  const uint32_t now = millis();
  if (now - lastSampleMs_ < 1000) return;
  lastSampleMs_ = now;
  emitSample();
  flushIfDue();
  settings.tick();
}

void SessionManager::emitSample() {
  // Build a Sample whether or not we're recording — WS clients always
  // see live data; only recording writes to flash.
  Sample s{};
  const uint32_t now = millis();
  s.t_ms     = active_ ? (now - sessionStartMonoMs_) : 0;
  s.hr_bpm   = liveHr_ == 0 ? 0xFFFF : liveHr_;
  s.spo2_pct = liveSpo2_;
  s.activity = liveAct_;
  s.stage    = liveStage_;
  s.flags    = liveFlags_;
  if (alarmFiredPending_) {
    s.flags |= SampleFlag::ALARM_FIRED;
    alarmFiredPending_ = false;
  }
  s.reserved = 0;

  ws_broadcaster::broadcastSample(s);

  if (!active_) return;

  ring_.push(s);

  // Aggregates.
  if (s.hr_bpm != 0xFFFF) {
    if (s.hr_bpm < hrMin_) hrMin_ = s.hr_bpm;
    if (s.hr_bpm > hrMax_) hrMax_ = s.hr_bpm;
    hrAvgSum_ += s.hr_bpm; ++hrAvgN_;
  }
  if (s.spo2_pct != 0xFFFF) {
    if (s.spo2_pct < spo2Min_) spo2Min_ = s.spo2_pct;
    spo2AvgSum_ += s.spo2_pct; ++spo2AvgN_;
  }
  if (s.stage < 4) timeInStage_[s.stage] += 1;
}

void SessionManager::flushIfDue() {
  if (!active_ || !store_) return;
  const uint32_t now = millis();
  if (now - lastFlushMs_ < cfg::FLUSH_INTERVAL_MS) return;
  lastFlushMs_ = now;

  Sample buf[64];
  size_t i = 0;
  while (ring_.pop(buf[i])) {
    if (++i == 64) {
      store_->appendSamples(buf, i);
      i = 0;
    }
  }
  if (i) store_->appendSamples(buf, i);
}

bool SessionManager::startSession() {
  if (active_) return false;
  const uint32_t epoch = timeservice::epoch();
  String id = epoch ? timeservice::isoOf(epoch) : String("boot-") + String((uint32_t)millis());
  // ":" is fine on LittleFS but we keep it sanitized for SD too.
  id.replace(':', '-');
  if (!store_->startSession(id)) return false;
  sessionId_           = id;
  sessionStartMonoMs_  = millis();
  sessionStartedEpoch_ = epoch;
  lastFlushMs_         = millis();
  hrMin_ = 0xFFFF; hrMax_ = 0; hrAvgSum_ = 0; hrAvgN_ = 0;
  spo2Min_ = 0xFFFF; spo2AvgSum_ = 0; spo2AvgN_ = 0;
  for (auto& v : timeInStage_) v = 0;
  hr_.reset(); spo2_.reset(); hrv_.reset();
  active_ = true;
  LOG_INFO(TAG, "session started: %s", id.c_str());
  return true;
}

bool SessionManager::stopSession() {
  if (!active_) return false;
  active_ = false;
  // Drain ring before sidecar.
  Sample buf[64];
  size_t i = 0;
  while (ring_.pop(buf[i])) {
    if (++i == 64) { store_->appendSamples(buf, i); i = 0; }
  }
  if (i) store_->appendSamples(buf, i);

  const uint32_t endedEpoch = timeservice::epoch();
  const uint32_t durationS  = (millis() - sessionStartMonoMs_) / 1000;
  const String sidecar = buildSidecar(endedEpoch, durationS);
  store_->finalize(sessionId_, sidecar);
  LOG_INFO(TAG, "session stopped: %s (%us)", sessionId_.c_str(), durationS);
  sessionId_ = String();
  return true;
}

String SessionManager::buildSidecar(uint32_t endedEpoch, uint32_t durationS) const {
  JsonDocument d;
  d["schema_version"]  = 2;
  d["sample_format_version"] = 1;
  d["id"]              = sessionId_;
  d["started_at"]      = sessionStartedEpoch_ ? timeservice::isoOf(sessionStartedEpoch_) : sessionId_;
  d["started_at_unix"] = (uint64_t)sessionStartedEpoch_;
  d["ended_at"]        = endedEpoch ? timeservice::isoOf(endedEpoch) : String();
  d["ended_at_unix"]   = (uint64_t)endedEpoch;
  // tz_offset_min: snapshot at finalize time. ESP32 newlib does not
  // expose tm_gmtoff, so compute via the mktime(gmtime()) trick:
  // mktime interprets its tm as local, so feeding it the UTC breakdown
  // yields the local-time-as-utc-seconds value, whose delta from `now`
  // is the negative of the UTC offset.
  {
    time_t now = endedEpoch ? (time_t)endedEpoch : time(nullptr);
    if (now > 0) {
      struct tm gmt;
      gmtime_r(&now, &gmt);
      gmt.tm_isdst = -1;
      const time_t fakeLocal = mktime(&gmt);
      d["tz_offset_min"] = (int32_t)(-(int64_t)(fakeLocal - now) / 60);
    } else {
      d["tz_offset_min"] = 0;
    }
  }
  d["duration_s"]      = durationS;
  d["hr_min"]          = hrMin_ == 0xFFFF ? 0 : hrMin_;
  d["hr_max"]          = hrMax_;
  d["hr_avg"]          = hrAvgN_ ? (uint16_t)(hrAvgSum_ / hrAvgN_) : 0;
  d["spo2_min_x10"]    = spo2Min_ == 0xFFFF ? 0 : spo2Min_;
  d["spo2_avg_x10"]    = spo2AvgN_ ? (uint16_t)(spo2AvgSum_ / spo2AvgN_) : 0;
  d["hrv_rmssd"]       = (const char*)nullptr;  // null placeholder
  d["tags"].to<JsonArray>();
  d["notes"]           = "";
  JsonArray tis = d["time_in_stage"].to<JsonArray>();
  for (auto v : timeInStage_) tis.add(v);
  // Sleep score: only valid once baseline is calibrated.
  if (settings.baselineNights >= cfg::CALIBRATION_NIGHTS) {
    const uint32_t deepS  = timeInStage_[3];
    const uint32_t lightS = timeInStage_[2];
    const uint32_t awakeS = timeInStage_[1];
    const uint32_t totalS = deepS + lightS + awakeS;
    if (totalS > 0) {
      const float deepFrac  = (float)deepS  / totalS;
      const float awakeFrac = (float)awakeS / totalS;
      float score = 60.0f + 50.0f * deepFrac - 40.0f * awakeFrac;
      if (score < 0)   score = 0;
      if (score > 100) score = 100;
      d["sleep_score"] = (uint8_t)score;
    }
  }
  d["firmware_version"] = FIRMWARE_VERSION;
  String out; serializeJson(d, out);
  return out;
}
