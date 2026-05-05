#pragma once
#include "LittleFsArchive.h"
#include "SdArchive.h"
#include "Sample.h"
#include <Arduino.h>
#include <vector>

// Façade over LittleFsArchive (primary) + SdArchive (mirror).
// Reads always come from LittleFS; writes go to LittleFS first and
// then opportunistically to SD. SD failure is non-fatal.

class SessionStore {
 public:
  bool begin();

  // Lifecycle.
  bool startSession(const String& id);
  int  appendSamples(const Sample* s, size_t count);  // bytes written to LittleFS
  bool finalize(const String& id, const String& sidecarJson);
  bool isActive() const { return !activeId_.isEmpty(); }
  const String& activeId() const { return activeId_; }

  // Reads (LittleFS only).
  std::vector<String> listSessions();
  bool readSidecar(const String& id, String& outJson);
  bool openRead(const String& id);
  int  readBlock(uint8_t* buf, size_t n);
  void closeRead();
  size_t fileSize(const String& id);
  bool   deleteSession(const String& id);

  // Status surface for /api/status.
  bool sdMounted() { return sd_.mounted(); }
  bool sdHealthy(){ return sdHealthy_; }
  uint32_t lfsFreeBytes() const { return lfs_.freeBytes(); }

  // On boot: any session file with no sidecar = power-loss orphan;
  // synthesize a minimal "crashed" sidecar so it shows up in History.
  void finalizeOrphans();

 private:
  LittleFsArchive lfs_;
  SdArchive       sd_;
  String          activeId_;
  bool            sdHealthy_ = true;
};
