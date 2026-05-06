#include "SessionStore.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "config.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <time.h>

namespace {
constexpr const char* TAG = "store";
constexpr const char* SESSIONS_DIR = "/sessions";

String startPathFor(const String& id) {
  return String(SESSIONS_DIR) + "/" + id + ".start";
}
String sidecarPathFor(const String& id) {
  return String(SESSIONS_DIR) + "/" + id + ".json";
}
}

bool SessionStore::begin() {
  if (!sidecarMutex_) sidecarMutex_ = xSemaphoreCreateMutex();
  const bool lfsOk = lfs_.begin();
  if (!lfsOk) return false;
  sd_.begin();  // SD failure is non-fatal
  finalizeOrphans();
  return true;
}

void SessionStore::sidecarLock() {
  if (!sidecarMutex_) sidecarMutex_ = xSemaphoreCreateMutex();
  if (sidecarMutex_) xSemaphoreTake(sidecarMutex_, portMAX_DELAY);
}

void SessionStore::sidecarUnlock() {
  if (sidecarMutex_) xSemaphoreGive(sidecarMutex_);
}

bool SessionStore::mutateSidecar(
    const String& id, const std::function<bool(JsonDocument&)>& mut) {
  sidecarLock();
  String existing;
  if (!lfs_.readSidecar(id, existing) || existing.length() == 0) {
    sidecarUnlock();
    return false;
  }
  JsonDocument d;
  if (deserializeJson(d, existing) != DeserializationError::Ok) {
    sidecarUnlock();
    return false;
  }
  if (!mut(d)) {
    sidecarUnlock();
    return false;
  }
  String out; serializeJson(d, out);
  const bool ok = lfs_.writeSidecar(id, out);
  if (ok) sd_.writeSidecar(id, out);
  sidecarUnlock();
  return ok;
}

void SessionStore::writeStartAnchor(const String& id) {
  JsonDocument d;
  d["epoch_ms"]     = (uint64_t)timeservice::epoch() * 1000ULL;
  d["monotonic_ms"] = (uint32_t)timeservice::monotonicMs();
  String out; serializeJson(d, out);
  fs::File f = LittleFS.open(startPathFor(id), "w");
  if (!f) {
    LOG_WARN(TAG, "anchor open failed: %s", id.c_str());
    return;
  }
  f.print(out);
  f.flush();
  f.close();
}

void SessionStore::deleteStartAnchor(const String& id) {
  const String p = startPathFor(id);
  if (LittleFS.exists(p)) LittleFS.remove(p);
}

bool SessionStore::startSession(const String& id) {
  if (isActive()) {
    LOG_WARN(TAG, "startSession while another active");
    return false;
  }
  // Ensure free space; rotate oldest. When SD is mounted require an SD copy
  // before dropping; without SD we have to permit deletion to avoid lockup.
  const bool requireSdCopy = sd_.mounted();
  lfs_.rotateOldestIfBelow(cfg::LITTLEFS_RESERVE_BYTES, requireSdCopy, &sd_);

  if (!lfs_.openAppend(id)) return false;
  sd_.openAppend(id);  // best-effort
  activeId_ = id;
  sdHealthy_ = sd_.mounted();
  writeStartAnchor(id);
  LOG_INFO(TAG, "session start: %s (sd=%s)", id.c_str(), sdHealthy_ ? "yes" : "no");
  return true;
}

int SessionStore::appendSamples(const Sample* s, size_t count) {
  if (!isActive()) return -1;
  const int n = lfs_.appendSamples(s, count);
  if (n <= 0) {
    LOG_ERROR(TAG, "lfs append failed — recording in danger");
    return n;
  }
  if (sd_.mounted()) {
    const int sn = sd_.appendSamples(s, count);
    sdHealthy_ = sn > 0;
  } else {
    sdHealthy_ = sd_.ensureMounted() ? sd_.appendSamples(s, count) > 0 : false;
  }
  return n;
}

bool SessionStore::finalize(const String& id, const String& sidecarJson) {
  lfs_.close();
  sd_.close();
  const bool a = lfs_.writeSidecar(id, sidecarJson);
  sd_.writeSidecar(id, sidecarJson);
  // Clean finalize — anchor file is no longer needed.
  deleteStartAnchor(id);
  activeId_ = String();
  return a;
}

std::vector<String> SessionStore::listSessions() {
  return lfs_.listSessions();
}

bool SessionStore::readSidecar(const String& id, String& outJson) {
  return lfs_.readSidecar(id, outJson);
}

bool SessionStore::openRead(const String& id) { return lfs_.openRead(id); }
int  SessionStore::readBlock(uint8_t* buf, size_t n) { return lfs_.readBlock(buf, n); }
void SessionStore::closeRead() { lfs_.closeRead(); }
size_t SessionStore::fileSize(const String& id) { return lfs_.fileSize(id); }

bool SessionStore::deleteSession(const String& id) {
  bool a = lfs_.deleteSession(id);
  deleteStartAnchor(id);
  // SD: if mounted, do best-effort cleanup.
  return a;
}

void SessionStore::finalizeOrphans() {
  for (const String& id : lfs_.listSessions()) {
    String existing;
    if (lfs_.readSidecar(id, existing) && existing.length() > 0) {
      // Has sidecar — clean any leftover anchor and continue.
      deleteStartAnchor(id);
      continue;
    }
    LOG_WARN(TAG, "orphan session: %s — synthesising sidecar", id.c_str());

    // Try to read the anchor for an accurate start time.
    uint64_t epochMs = 0;
    const String anchorPath = startPathFor(id);
    if (LittleFS.exists(anchorPath)) {
      fs::File f = LittleFS.open(anchorPath, "r");
      if (f) {
        String body = f.readString();
        f.close();
        JsonDocument ad;
        if (deserializeJson(ad, body) == DeserializationError::Ok) {
          epochMs = ad["epoch_ms"] | (uint64_t)0;
        }
      }
    }

    JsonDocument doc;
    doc["schema_version"]   = 2;
    doc["sample_format_version"] = 1;
    doc["id"]               = id;
    doc["started_at"]       = id;
    doc["started_at_unix"]  = (uint64_t)0;
    doc["ended_at_unix"]    = (uint64_t)0;
    if (epochMs > 0) {
      const uint32_t epochS = (uint32_t)(epochMs / 1000ULL);
      doc["started_at_unix"] = (uint64_t)epochS;
      doc["started_at"]      = timeservice::isoOf(epochS);
    }
    // tz_offset_min: best-effort snapshot at recovery time. ESP32
    // newlib lacks tm_gmtoff, so derive via mktime(gmtime()) — see
    // SessionManager::buildSidecar for the same pattern.
    {
      time_t now = time(nullptr);
      if (now > 0) {
        struct tm gmt;
        gmtime_r(&now, &gmt);
        gmt.tm_isdst = -1;
        const time_t fakeLocal = mktime(&gmt);
        doc["tz_offset_min"] = (int32_t)(-(int64_t)(fakeLocal - now) / 60);
      } else {
        doc["tz_offset_min"] = 0;
      }
    }
    doc["ended_at"]         = id;
    doc["duration_s"]       = 0;
    doc["crashed"]          = true;
    doc["hrv_rmssd"]        = (const char*)nullptr;  // null
    doc["tags"].to<JsonArray>();
    doc["notes"]            = "";
    doc["firmware_version"] = "unknown";
    String out; serializeJson(doc, out);
    lfs_.writeSidecar(id, out);
    deleteStartAnchor(id);
  }
}
