#pragma once
#include <Arduino.h>
#include <stdint.h>

// NTP + monotonic clock. Sessions started before NTP sync use millis()
// offsets; once NTP completes, the absolute start time is back-filled
// for the active session and any persisted "syncing" sessions.

namespace timeservice {

void begin(const char* tz, const char* ntpServer);

// Returns true if the system clock has been synchronised at least once.
bool synced();

// Best-effort wait for sync (returns true if synced within timeout).
bool waitForSync(uint32_t timeoutMs);

// Wall-clock seconds since epoch. Returns 0 if !synced().
uint32_t epoch();

// Monotonic milliseconds since boot (wraps at ~49 days; safe for sessions).
uint32_t monotonicMs();

// ISO-8601 UTC string of "now". Returns an empty string when !synced().
String isoNow();
String isoOf(uint32_t epochSec);

// Apply timezone (POSIX TZ string). Re-callable when settings change.
void setTimezone(const char* tz);

}  // namespace timeservice
