#include "Log.h"
#include <stdarg.h>
#include <esp_log.h>

namespace logging {

namespace {
Level s_level = LEVEL_INFO;
bool  s_silent = false;

const char* tagFor(Level lvl) {
  switch (lvl) {
    case LEVEL_ERROR: return "E";
    case LEVEL_WARN:  return "W";
    case LEVEL_INFO:  return "I";
    case LEVEL_DEBUG: return "D";
    case LEVEL_TRACE: return "T";
    default:          return "?";
  }
}
}  // namespace

void begin(uint32_t baud) {
  if (!Serial) {
    Serial.begin(baud);
  }
}

void setLevel(Level lvl) { s_level = lvl; }
Level level()             { return s_level; }

void writeLine(Level lvl, const char* tag, const char* fmt, ...) {
  if (lvl > s_level) return;
  if (s_silent) return;
  Serial.printf("[%lu][%s][%s] ", (unsigned long)millis(), tagFor(lvl), tag ? tag : "-");
  va_list args;
  va_start(args, fmt);
  char buf[256];
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.println(buf);
}

void setSilent(bool silent) {
  s_silent = silent;
  // Also gate the ESP-IDF system log so things like SD card + WiFi
  // driver chatter don't poison the Improv-Serial channel.
  esp_log_level_set("*", silent ? ESP_LOG_NONE : ESP_LOG_INFO);
}

bool silent() { return s_silent; }

}  // namespace logging
