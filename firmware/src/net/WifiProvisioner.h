#pragma once
#include <Arduino.h>

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

}  // namespace wifi
