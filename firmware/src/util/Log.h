#pragma once
#include <Arduino.h>

// Thin level + tagged macros over Serial.printf. Levels mirror the
// Arduino-ESP32 CORE_DEBUG_LEVEL convention so they can be tuned via
// build flags without touching call sites.

namespace logging {

enum Level : uint8_t {
  LEVEL_NONE  = 0,
  LEVEL_ERROR = 1,
  LEVEL_WARN  = 2,
  LEVEL_INFO  = 3,
  LEVEL_DEBUG = 4,
  LEVEL_TRACE = 5,
};

void begin(uint32_t baud = 115200);
void setLevel(Level lvl);
Level level();
void writeLine(Level lvl, const char* tag, const char* fmt, ...);

// Mute all Serial writes from this logger AND from the ESP-IDF system
// log. Used during Improv-Serial provisioning so log spam does not
// interleave with the binary protocol bytes on the same USB-CDC link.
void setSilent(bool silent);
bool silent();

}  // namespace logging

#define LOG_ERROR(tag, fmt, ...) ::logging::writeLine(::logging::LEVEL_ERROR, tag, fmt, ##__VA_ARGS__)
#define LOG_WARN(tag,  fmt, ...) ::logging::writeLine(::logging::LEVEL_WARN,  tag, fmt, ##__VA_ARGS__)
#define LOG_INFO(tag,  fmt, ...) ::logging::writeLine(::logging::LEVEL_INFO,  tag, fmt, ##__VA_ARGS__)
#define LOG_DEBUG(tag, fmt, ...) ::logging::writeLine(::logging::LEVEL_DEBUG, tag, fmt, ##__VA_ARGS__)
#define LOG_TRACE(tag, fmt, ...) ::logging::writeLine(::logging::LEVEL_TRACE, tag, fmt, ##__VA_ARGS__)
