#include <Arduino.h>
#include <ESPmDNS.h>
#include <LittleFS.h>

#include "pins.h"
#include "config.h"
#include "version.h"

#include "util/Log.h"
#include "util/TimeService.h"
#include "util/I2cBus.h"

#include "sensors/SensorRegistry.h"
#include "storage/SessionStore.h"
#include "app/Settings.h"
#include "app/SessionManager.h"
#include "app/SleepStager.h"
#include "app/AlarmController.h"

#include "net/WifiProvisioner.h"
#include "net/WebServer.h"
#include "net/WsBroadcaster.h"

namespace { constexpr const char* TAG = "main"; }

// Global lifetimes — these are referenced by ApiHandlers via extern.
SensorRegistry  sensors;
SessionStore    sessionStore;
SleepStager     sleepStager;
AlarmController alarmController;

// Tasks.
static void sensorTask(void* /*arg*/) {
  const TickType_t period = pdMS_TO_TICKS(1000 / cfg::SENSOR_HZ);
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    sensors.tick();
    sessionManager.sensorTick();
    vTaskDelayUntil(&last, period);
  }
}

static void pipelineTask(void* /*arg*/) {
  const TickType_t period = pdMS_TO_TICKS(50);  // 20Hz; emitSample gates to 1Hz
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    sessionManager.pipelineTick();
    vTaskDelayUntil(&last, period);
  }
}

static void stagerTask(void* /*arg*/) {
  for (;;) {
    sleepStager.tick();
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

static void alarmTask(void* /*arg*/) {
  for (;;) {
    alarmController.tick();
    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

void setup() {
  logging::begin(115200);
  delay(50);
  LOG_INFO(TAG, "boot — fw=%s built=%s", FIRMWARE_VERSION, FIRMWARE_BUILD_DATE);

  pinMode(pins::STATUS_LED, OUTPUT);
  digitalWrite(pins::STATUS_LED, HIGH);

  if (!LittleFS.begin(true)) {
    LOG_ERROR(TAG, "LittleFS mount failed — halting");
    while (true) delay(1000);
  }

  settings.load();
  timeservice::setTimezone(settings.timezone.c_str());

  i2cbus::init();
  sensors.begin();
  sessionStore.begin();          // also finalises orphan sessions
  sessionManager.begin(&sensors, &sessionStore);
  sleepStager.begin(&sessionManager);
  alarmController.begin(&sessionManager);
  sessionManager.setStager(&sleepStager);

  if (!wifi::begin(settings.deviceName)) {
    // begin() reboots on failure; we won't get here.
    return;
  }

  if (!MDNS.begin(cfg::MDNS_HOSTNAME)) {
    LOG_WARN(TAG, "mDNS start failed");
  } else {
    MDNS.addService("http", "tcp", 80);
    LOG_INFO(TAG, "mDNS: http://%s.local/", cfg::MDNS_HOSTNAME);
  }

  timeservice::begin(settings.timezone.c_str(), cfg::NTP_SERVER);

  web::begin();

  xTaskCreatePinnedToCore(sensorTask,   "sensor",   8192, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(pipelineTask, "pipeline", 8192, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(stagerTask,   "stager",   4096, nullptr, 1, nullptr, 0);
  xTaskCreatePinnedToCore(alarmTask,    "alarm",    4096, nullptr, 1, nullptr, 0);

  digitalWrite(pins::STATUS_LED, LOW);
  LOG_INFO(TAG, "ready");
}

void loop() {
  // Tasks do the work. Keep loop empty so the Arduino loopTask can yield.
  delay(1000);
}
