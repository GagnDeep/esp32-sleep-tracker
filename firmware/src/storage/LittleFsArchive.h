#pragma once
#include "Sample.h"
#include <Arduino.h>
#include <FS.h>
#include <vector>
#include <stdint.h>

// LittleFS-backed session archive. Always available, even with no SD
// card. Acts as the primary store; SdArchive is mirrored in parallel.

class LittleFsArchive {
 public:
  bool begin();

  // Opens (or creates) a session file for append. `id` is the ISO-8601
  // start time (filesystem-safe form already applied).
  bool openAppend(const String& id);
  void close();
  bool isOpen() const { return file_; }

  // Append raw samples; returns bytes written or -1.
  int  appendSamples(const Sample* s, size_t count);
  size_t appendedBytes() const { return appended_; }

  // Sidecar JSON (summary).
  bool writeSidecar(const String& id, const String& json);
  bool readSidecar (const String& id, String& outJson);

  // Read raw binary samples back, used by /api/sessions/:id/raw.
  bool openRead(const String& id);
  int  readBlock(uint8_t* buf, size_t n);
  void closeRead();
  size_t fileSize(const String& id);

  // Listing & maintenance.
  std::vector<String> listSessions() const;
  bool deleteSession(const String& id);

  uint32_t freeBytes() const;
  bool     rotateOldestIfBelow(uint32_t reserveBytes,
                               bool requireSdCopy,
                               class SdArchive* sd);

 private:
  String pathFor(const String& id) const;
  String sidecarFor(const String& id) const;

  fs::File file_;
  fs::File reader_;
  size_t   appended_ = 0;
  bool     mounted_  = false;
};
