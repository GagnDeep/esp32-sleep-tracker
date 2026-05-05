#include "TimeService.h"
#include "Log.h"
#include <time.h>
#include <sys/time.h>

namespace timeservice {

namespace {
constexpr const char* TAG = "time";
volatile bool s_synced = false;

bool checkSync() {
  time_t now = time(nullptr);
  // Anything after 2020-01-01 means SNTP populated the RTC.
  if (now > 1577836800) {
    s_synced = true;
    return true;
  }
  return false;
}
}  // namespace

void begin(const char* tz, const char* ntpServer) {
  configTzTime(tz ? tz : "UTC0", ntpServer ? ntpServer : "pool.ntp.org");
  // Don't block boot; checkSync() lazily upgrades the flag.
  LOG_INFO(TAG, "NTP configured (server=%s tz=%s)", ntpServer ? ntpServer : "default", tz ? tz : "UTC0");
}

bool synced() {
  if (s_synced) return true;
  return checkSync();
}

bool waitForSync(uint32_t timeoutMs) {
  const uint32_t start = millis();
  while ((millis() - start) < timeoutMs) {
    if (synced()) return true;
    delay(100);
  }
  return false;
}

uint32_t epoch() {
  if (!synced()) return 0;
  return (uint32_t)time(nullptr);
}

uint32_t monotonicMs() {
  return millis();
}

String isoOf(uint32_t epochSec) {
  if (epochSec == 0) return String();
  time_t t = (time_t)epochSec;
  struct tm tm;
  gmtime_r(&t, &tm);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return String(buf);
}

String isoNow() {
  return isoOf(epoch());
}

void setTimezone(const char* tz) {
  if (!tz) return;
  setenv("TZ", tz, 1);
  tzset();
  LOG_INFO(TAG, "tz set to %s", tz);
}

}  // namespace timeservice
