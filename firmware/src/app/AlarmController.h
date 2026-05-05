#pragma once
#include <stdint.h>

class SessionManager;

// LEDC PWM buzzer driver + smart-alarm window evaluator + low-SpO2
// sustained-breach detector with motion-artifact gate.

class AlarmController {
 public:
  void begin(SessionManager* sm);
  void tick();   // call at >= 1 Hz

  // Manual buzzer (UI "test" button).
  void test(uint16_t durationMs = 800);

  // Stop any currently sounding alarm.
  void silence();

  bool isFiring() const { return firing_; }

 private:
  void  startTone(uint16_t freq, uint16_t durationMs);
  bool  inSmartWindow(uint32_t epoch) const;
  bool  isWeekday(uint32_t epoch, uint8_t mask) const;

  SessionManager* sm_ = nullptr;

  bool     firing_       = false;
  uint32_t firingUntilMs_ = 0;
  uint32_t lastFireEpoch_ = 0;

  // Low-SpO2 sustain tracking.
  uint32_t lowSpo2BeganMs_ = 0;
};
