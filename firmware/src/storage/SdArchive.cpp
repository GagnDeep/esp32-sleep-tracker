#include "SdArchive.h"
#include "../util/Log.h"
#include "pins.h"
#include "config.h"
#include <SD.h>
#include <SPI.h>

namespace {
constexpr const char* TAG = "sd";
constexpr const char* SESSIONS_DIR = "/sessions";
constexpr uint32_t REMOUNT_BACKOFF_MS = 5'000;
}

bool SdArchive::begin() {
#if SD_ENABLED
  SPI.begin(pins::SD_SCK, pins::SD_MISO, pins::SD_MOSI, pins::SD_CS);
  mounted_ = SD.begin(pins::SD_CS, SPI);
  if (!mounted_) {
    LOG_WARN(TAG, "no SD card detected at boot");
    return false;
  }
  if (!SD.exists(SESSIONS_DIR)) SD.mkdir(SESSIONS_DIR);
  LOG_INFO(TAG, "mounted");
  return true;
#else
  LOG_INFO(TAG, "SD disabled at compile time");
  mounted_ = false;
  return false;
#endif
}

bool SdArchive::ensureMounted() {
#if SD_ENABLED
  if (mounted_) return true;
  const uint32_t now = millis();
  if (now - lastMountAttempt_ < REMOUNT_BACKOFF_MS) return false;
  lastMountAttempt_ = now;
  mounted_ = SD.begin(pins::SD_CS, SPI);
  if (mounted_ && !SD.exists(SESSIONS_DIR)) SD.mkdir(SESSIONS_DIR);
  if (mounted_) LOG_INFO(TAG, "remounted");
  return mounted_;
#else
  return false;
#endif
}

String SdArchive::pathFor(const String& id) const {
  return String(SESSIONS_DIR) + "/" + id + ".bin";
}
String SdArchive::sidecarFor(const String& id) const {
  return String(SESSIONS_DIR) + "/" + id + ".json";
}

bool SdArchive::openAppend(const String& id) {
#if SD_ENABLED
  if (!ensureMounted()) return false;
  close();
  file_ = SD.open(pathFor(id), FILE_APPEND);
  return (bool)file_;
#else
  (void)id; return false;
#endif
}

void SdArchive::close() {
  if (file_) file_.close();
}

int SdArchive::appendSamples(const Sample* s, size_t count) {
#if SD_ENABLED
  if (!file_) return -1;
  const size_t n = file_.write(reinterpret_cast<const uint8_t*>(s), count * sizeof(Sample));
  if (n == 0) {
    LOG_WARN(TAG, "append failed — possibly card removed");
    mounted_ = false;
    return -1;
  }
  file_.flush();
  return (int)n;
#else
  (void)s; (void)count; return -1;
#endif
}

bool SdArchive::writeSidecar(const String& id, const String& json) {
#if SD_ENABLED
  if (!ensureMounted()) return false;
  fs::File f = SD.open(sidecarFor(id), FILE_WRITE);
  if (!f) return false;
  f.print(json);
  f.close();
  return true;
#else
  (void)id; (void)json; return false;
#endif
}

bool SdArchive::hasSession(const String& id) const {
#if SD_ENABLED
  if (!mounted_) return false;
  return SD.exists(pathFor(id));
#else
  (void)id; return false;
#endif
}
