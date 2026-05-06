#pragma once
#include "Sample.h"
#include <Arduino.h>
#include <FS.h>
#include <stdint.h>

// SPI microSD mirror. Hot-pluggable: we attempt remount on demand so
// the user can yank/insert mid-session without bringing recording down.
//
// SessionStore writes here *after* a successful LittleFS append; SD
// failure never blocks recording, only logs + raises a UI banner.

class SdArchive {
 public:
  bool begin();          // initial mount attempt
  bool ensureMounted();  // call before each write — attempts remount
  bool mounted() const { return mounted_; }

  bool openAppend(const String& id);
  void close();
  int  appendSamples(const Sample* s, size_t count);
  bool writeSidecar(const String& id, const String& json);

  bool hasSession(const String& id) const;

 private:
  String pathFor(const String& id) const;
  String sidecarFor(const String& id) const;

  fs::File file_;
  bool     mounted_ = false;
  uint32_t lastMountAttempt_ = 0;
};
