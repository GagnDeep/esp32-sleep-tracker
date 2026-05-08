#pragma once
#include <Arduino.h>

// Improv-WiFi Serial provisioning.
// https://www.improv-wifi.com/serial/
//
// Listens on USB-CDC for the Improv-Serial protocol so a browser-based
// installer (esp-web-tools) can hand the device its WiFi creds without
// the user touching the SoftAP captive portal.
//
// Runs alongside WiFiManager: improv stores creds via WiFi.begin() and
// the device reboots into the saved-creds path, so subsequent boots
// don't need either improv or the captive portal.

namespace improv {

// Initialise the Improv listener. Call once early in setup(), before
// WiFi.begin() is attempted.
void begin(const char* deviceName, const char* firmwareVersion);

// Re-name the device after begin(). main.cpp calls begin() with a
// hardcoded default before settings.load() resolves so the SDK can
// detect us as fast as possible, then updates the name once settings
// are loaded. Safe to call from any task.
void setDeviceName(const char* deviceName);

// Drive the protocol parser. Call frequently (every 1–10 ms) until
// WiFi is provisioned. Idle when no bytes are pending.
void tick();

// True once the user has handed creds and we have an IP. After this
// the parent setup() can stop calling tick().
bool isProvisioned();

}  // namespace improv
