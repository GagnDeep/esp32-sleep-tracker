#include "LittleFsArchive.h"
#include "SdArchive.h"
#include "../util/Log.h"
#include <LittleFS.h>

namespace {
constexpr const char* TAG = "lfs";
constexpr const char* SESSIONS_DIR = "/sessions";
}

bool LittleFsArchive::begin() {
  if (!LittleFS.begin(true)) {
    LOG_ERROR(TAG, "mount failed");
    return false;
  }
  if (!LittleFS.exists(SESSIONS_DIR)) {
    LittleFS.mkdir(SESSIONS_DIR);
  }
  mounted_ = true;
  LOG_INFO(TAG, "mounted (free=%u)", (unsigned)freeBytes());
  return true;
}

String LittleFsArchive::pathFor(const String& id) const {
  return String(SESSIONS_DIR) + "/" + id + ".bin";
}
String LittleFsArchive::sidecarFor(const String& id) const {
  return String(SESSIONS_DIR) + "/" + id + ".json";
}

bool LittleFsArchive::openAppend(const String& id) {
  close();
  file_ = LittleFS.open(pathFor(id), "a");
  if (!file_) {
    LOG_ERROR(TAG, "openAppend failed: %s", id.c_str());
    return false;
  }
  appended_ = file_.size();
  return true;
}

void LittleFsArchive::close() {
  if (file_) file_.close();
  appended_ = 0;
}

int LittleFsArchive::appendSamples(const Sample* s, size_t count) {
  if (!file_) return -1;
  const size_t n = file_.write(reinterpret_cast<const uint8_t*>(s), count * sizeof(Sample));
  if (n == 0) return -1;
  file_.flush();
  appended_ += n;
  return (int)n;
}

bool LittleFsArchive::writeSidecar(const String& id, const String& json) {
  fs::File f = LittleFS.open(sidecarFor(id), "w");
  if (!f) return false;
  f.print(json);
  f.close();
  return true;
}

bool LittleFsArchive::readSidecar(const String& id, String& outJson) {
  fs::File f = LittleFS.open(sidecarFor(id), "r");
  if (!f) return false;
  outJson = f.readString();
  f.close();
  return true;
}

bool LittleFsArchive::openRead(const String& id) {
  closeRead();
  reader_ = LittleFS.open(pathFor(id), "r");
  return (bool)reader_;
}

int LittleFsArchive::readBlock(uint8_t* buf, size_t n) {
  if (!reader_) return -1;
  return (int)reader_.read(buf, n);
}

void LittleFsArchive::closeRead() {
  if (reader_) reader_.close();
}

size_t LittleFsArchive::fileSize(const String& id) {
  fs::File f = LittleFS.open(pathFor(id), "r");
  if (!f) return 0;
  const size_t n = f.size();
  f.close();
  return n;
}

std::vector<String> LittleFsArchive::listSessions() const {
  std::vector<String> ids;
  fs::File dir = LittleFS.open(SESSIONS_DIR);
  if (!dir || !dir.isDirectory()) return ids;
  fs::File f = dir.openNextFile();
  while (f) {
    String name(f.name());
    // Files appear with full path on some cores; trim.
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    if (name.endsWith(".bin")) {
      ids.push_back(name.substring(0, name.length() - 4));
    }
    f = dir.openNextFile();
  }
  return ids;
}

bool LittleFsArchive::deleteSession(const String& id) {
  bool a = LittleFS.remove(pathFor(id));
  bool b = LittleFS.remove(sidecarFor(id));
  return a || b;
}

uint32_t LittleFsArchive::freeBytes() const {
  return (uint32_t)(LittleFS.totalBytes() - LittleFS.usedBytes());
}

bool LittleFsArchive::rotateOldestIfBelow(uint32_t reserveBytes,
                                          bool requireSdCopy,
                                          SdArchive* sd) {
  if (freeBytes() >= reserveBytes) return false;
  auto ids = listSessions();
  if (ids.empty()) return false;
  // Names are ISO-8601 → lexical sort == chronological sort.
  std::sort(ids.begin(), ids.end());
  for (const auto& id : ids) {
    if (requireSdCopy && (!sd || !sd->hasSession(id))) continue;
    LOG_WARN(TAG, "rotate oldest: %s", id.c_str());
    deleteSession(id);
    return true;
  }
  LOG_ERROR(TAG, "low space, but no SD-mirrored session to drop");
  return false;
}
