#pragma once
#include "../sensors/SensorRegistry.h"
#include "../dsp/HeartRateEstimator.h"
#include "../dsp/Spo2Estimator.h"
#include "../dsp/HrvWindow.h"
#include "../storage/SessionStore.h"
#include "../storage/Sample.h"
#include "../util/RingBuffer.h"
#include "config.h"
#include <Arduino.h>

class SleepStager;

// Owns the recording lifecycle. Wires sensors → DSP → 1Hz Sample
// records → 60s flush. Holds the current "live" stats so the WS
// broadcaster and HTTP /api/status can read them without locking.

class SessionManager {
 public:
  void begin(SensorRegistry* sensors, SessionStore* store);

  // Tasks call these from their respective cores.
  void sensorTick();      // 100 Hz, sensor task
  void pipelineTick();    // 1 Hz aggregation + flush, pipeline task

  // REST handlers.
  bool startSession();
  bool stopSession();

  // Live state (reader-safe atomics-ish; values are 16-bit so torn
  // reads are inert here).
  uint16_t hr()       const { return liveHr_; }
  uint16_t spo2X10()  const { return liveSpo2_; }
  uint16_t activity() const { return liveAct_; }
  uint8_t  stage()    const { return liveStage_; }
  uint8_t  flags()    const { return liveFlags_; }
  bool     active()   const { return active_; }
  uint32_t sessionStartedAt() const { return sessionStartedEpoch_; }
  const String& sessionId() const { return sessionId_; }

  // Set by SleepStager; reflected into the next Sample.
  void   setStage(uint8_t s) { liveStage_ = s; }
  void   setAlarmFiredFlag() { alarmFiredPending_ = true; }
  void   setMotionArtifact(bool b) { motionArtifact_ = b; }

  // Hooks to other layers.
  void setStager(SleepStager* s) { stager_ = s; }

  HrvWindow& hrv() { return hrv_; }

 private:
  SensorRegistry* sensors_ = nullptr;
  SessionStore*   store_   = nullptr;
  SleepStager*    stager_  = nullptr;

  HeartRateEstimator hr_;
  Spo2Estimator      spo2_;
  HrvWindow          hrv_;

  // 1Hz aggregation accumulators.
  uint32_t lastSampleMs_  = 0;
  uint32_t actSum_        = 0;
  uint32_t actCount_      = 0;

  // Live state.
  volatile uint16_t liveHr_   = 0;
  volatile uint16_t liveSpo2_ = 0xFFFF;
  volatile uint16_t liveAct_  = 0;
  volatile uint8_t  liveStage_= 0;
  volatile uint8_t  liveFlags_ = 0;
  volatile bool     active_   = false;
  bool     alarmFiredPending_ = false;
  bool     motionArtifact_    = false;

  // Recording state.
  String   sessionId_;
  uint32_t sessionStartMonoMs_ = 0;
  uint32_t sessionStartedEpoch_ = 0;
  uint32_t lastFlushMs_         = 0;

  RingBuffer<Sample, cfg::SAMPLE_RING_SIZE> ring_;

  // Aggregated session stats (for sidecar).
  uint16_t hrMin_ = 0xFFFF, hrMax_ = 0, hrAvgN_ = 0;
  uint32_t hrAvgSum_ = 0;
  uint16_t spo2Min_ = 0xFFFF, spo2AvgN_ = 0;
  uint32_t spo2AvgSum_ = 0;
  uint32_t timeInStage_[4] = {0,0,0,0};

  void emitSample();
  void flushIfDue();
  String buildSidecar(uint32_t endedEpoch, uint32_t durationS) const;
};

extern SessionManager sessionManager;
