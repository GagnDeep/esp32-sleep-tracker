#include <Arduino.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>

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
#include "dsp/Coherence.h"

#include "net/WifiProvisioner.h"
#include "net/WebServer.h"
#include "net/WsBroadcaster.h"
#include "net/OtaService.h"
#include "net/ImprovService.h"

namespace { constexpr const char* TAG = "main"; }

// Global lifetimes — these are referenced by ApiHandlers via extern.
SensorRegistry  sensors;
SessionStore    sessionStore;
SleepStager     sleepStager;
AlarmController alarmController;

// Tasks.
static void sensorTask(void* /*arg*/) {
  esp_task_wdt_add(nullptr);
  const TickType_t period = pdMS_TO_TICKS(1000 / cfg::SENSOR_HZ);
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    sensors.tick();
    sessionManager.sensorTick();
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, period);
  }
}

static void pipelineTask(void* /*arg*/) {
  esp_task_wdt_add(nullptr);
  const TickType_t period = pdMS_TO_TICKS(50);  // 20Hz; emitSample gates to 1Hz
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    sessionManager.pipelineTick();
    esp_task_wdt_reset();
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

static void coherenceTask(void* /*arg*/) {
  esp_task_wdt_add(nullptr);
  // The expensive 256-pt FFT only runs once every cfg::COHERENCE_UPDATE_S
  // seconds; this loop just wakes often enough to keep the gate
  // responsive and to feed the WDT. 500 ms is well under the 10 s WDT.
  for (;;) {
    coherence::tickIfDue();
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

void setup() {
  logging::begin(115200);
  // Silence all Serial output until WiFi is up. Improv-Serial uses
  // the same USB-CDC link for binary frames, and any interleaved log
  // line would corrupt its handshake. Once provisioned, logs resume.
  logging::setSilent(true);
  delay(50);
  LOG_INFO(TAG, "boot — fw=%s built=%s", FIRMWARE_VERSION, FIRMWARE_BUILD_DATE);

  pinMode(pins::STATUS_LED, OUTPUT);
  digitalWrite(pins::STATUS_LED, HIGH);

  // Enable Task WDT before any long-running task subscribes. Pass true
  // for `panic` so a hung task triggers a clean reboot rather than a
  // half-alive system.
  esp_task_wdt_init(cfg::WDT_TIMEOUT_S, true);

  // Improv-Serial: listen on UART/USB-CDC for browser-installer
  // provisioning. Started BEFORE LittleFS / settings / sensors so the
  // SDK probe (which can arrive within ~200 ms of the post-flash reset)
  // wins the race. We pass a placeholder device name and update it via
  // setDeviceName() once settings.load() resolves below; until then the
  // SDK reports the device as "Sleep Tracker" in GET_DEVICE_INFO.
  improv::begin("Sleep Tracker", FIRMWARE_VERSION);
  xTaskCreate([](void*) {
    while (true) {
      improv::tick();
      vTaskDelay(pdMS_TO_TICKS(5));
    }
  }, "improv", 4096, nullptr, 2, nullptr);

  if (!LittleFS.begin(true)) {
    LOG_ERROR(TAG, "LittleFS mount failed — halting");
    while (true) delay(1000);
  }

  settings.load();
  improv::setDeviceName(settings.deviceName.c_str());
  timeservice::setTimezone(settings.timezone.c_str());

  i2cbus::init();
  sensors.begin();
  sessionStore.begin();          // also finalises orphan sessions
  sessionManager.begin(&sensors, &sessionStore);
  sleepStager.begin(&sessionManager);
  alarmController.begin(&sessionManager);
  sessionManager.setStager(&sleepStager);
  coherence::begin();

  if (!wifi::begin(settings.deviceName)) {
    // begin() reboots on failure; we won't get here.
    return;
  }

  // WiFi is up. If we got here via Improv, the SDK has already
  // received its RPC_RESULT and disconnected — the channel is free
  // and the improv tick() will re-mute on any future host activity.
  // For users who came in via the captive portal, this also restores
  // visibility for `pio device monitor`.
  logging::setSilent(false);
  LOG_INFO(TAG, "wifi up: ssid=%s ip=%s",
           wifi::ssid().c_str(), wifi::ip().c_str());

  if (!MDNS.begin(cfg::MDNS_HOSTNAME)) {
    LOG_WARN(TAG, "mDNS start failed");
  } else {
    MDNS.addService("http", "tcp", 80);
    LOG_INFO(TAG, "mDNS: http://%s.local/", cfg::MDNS_HOSTNAME);
  }

  timeservice::begin(settings.timezone.c_str(), cfg::NTP_SERVER);

  web::begin();
  // Arm the OTA pending-verify watchdog (no-op if no pending marker).
  otaservice::begin();

  // Pin sensor task to the high-perf core (1) on dual-core ESP32; on
  // single-core ESP32-C3 we fall back to core 0 (the only one).
#if defined(CONFIG_FREERTOS_UNICORE) || defined(CONFIG_IDF_TARGET_ESP32C3)
  constexpr BaseType_t kSensorCore = 0;
#else
  constexpr BaseType_t kSensorCore = 1;
#endif
  xTaskCreatePinnedToCore(sensorTask,   "sensor",   8192, nullptr, 3, nullptr, kSensorCore);
  xTaskCreatePinnedToCore(pipelineTask, "pipeline", 8192, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(stagerTask,   "stager",   4096, nullptr, 1, nullptr, 0);
  xTaskCreatePinnedToCore(alarmTask,    "alarm",    4096, nullptr, 1, nullptr, 0);
  if (cfg::COHERENCE_ENABLED) {
    xTaskCreatePinnedToCore(coherenceTask, "coherence", 4096, nullptr, 2, nullptr, 0);
  }

  digitalWrite(pins::STATUS_LED, LOW);
  LOG_INFO(TAG, "ready");
}

void loop() {
  // Tasks do the work. Keep loop empty so the Arduino loopTask can yield.
  delay(1000);
}
