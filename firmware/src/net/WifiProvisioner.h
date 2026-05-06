#pragma once
#include <Arduino.h>
#include <vector>
#include <stdint.h>

// Captive-portal first-boot provisioning via WiFiManager. We expose
// only the operations the rest of the firmware needs (begin, status,
// reset for "switch network" flow) so swapping the provider later is
// contained.

namespace wifi {

bool begin(const String& deviceName);
bool isConnected();
String ssid();
int    rssi();
String ip();
String mac();

// Drops creds and reboots into AP captive portal. Used by the
// Settings → "switch network" UI flow.
void resetAndReboot();

// Aborts an in-progress autoConnect/captive-portal loop (called when
// Improv-Serial has finished provisioning out-of-band so the portal
// task exits cleanly and the main boot can proceed with the new STA
// link).
void stopPortal();

// Scan results (cached). `enc` is one of: "open","wep","wpa","wpa2",
// "wpa_wpa2","wpa3","unknown".
struct ScanEntry {
  String ssid;
  int8_t rssi;
  String enc;
};

// Returns the cached scan if it is younger than `maxAgeMs`, otherwise
// kicks off a synchronous scan (including hidden networks) and caches
// the result. Cache is shared across callers.
std::vector<ScanEntry> scan(uint32_t maxAgeMs = 30000);

}  // namespace wifi
