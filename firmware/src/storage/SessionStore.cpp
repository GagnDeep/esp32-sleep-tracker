#include "SessionStore.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "config.h"
#include <ArduinoJson.h>

namespace {
constexpr const char* TAG = "store";
}

bool SessionStore::begin() {
  const bool lfsOk = lfs_.begin();
  if (!lfsOk) return false;
  sd_.begin();  // SD failure is non-fatal
  finalizeOrphans();
  return true;
}

bool SessionStore::startSession(const String& id) {
  if (isActive()) {
    LOG_WARN(TAG, "startSession while another active");
    return false;
  }
  // Ensure free space; rotate oldest if SD copy exists.
  lfs_.rotateOldestIfBelow(cfg::LITTLEFS_RESERVE_BYTES, /*requireSdCopy=*/true, &sd_);

  if (!lfs_.openAppend(id)) return false;
  sd_.openAppend(id);  // best-effort
  activeId_ = id;
  sdHealthy_ = sd_.mounted();
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
  // SD: if mounted, do best-effort cleanup.
  return a;
}

void SessionStore::finalizeOrphans() {
  for (const String& id : lfs_.listSessions()) {
    String existing;
    if (lfs_.readSidecar(id, existing) && existing.length() > 0) continue;
    LOG_WARN(TAG, "orphan session: %s — synthesising sidecar", id.c_str());
    JsonDocument doc;
    doc["id"]               = id;
    doc["started_at"]       = id;
    doc["ended_at"]         = id;
    doc["duration_s"]       = 0;
    doc["crashed"]          = true;
    doc["firmware_version"] = "unknown";
    String out; serializeJson(doc, out);
    lfs_.writeSidecar(id, out);
  }
}
