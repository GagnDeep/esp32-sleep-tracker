#include "WifiProvisioner.h"
#include "../util/Log.h"
#include "config.h"
#include <WiFi.h>
#include <WiFiManager.h>

namespace {
constexpr const char* TAG = "wifi";
WiFiManager wm;

String apSsid(const String& deviceName) {
  uint64_t mac = ESP.getEfuseMac();
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%04X", (uint16_t)(mac & 0xFFFF));
  return String(cfg::AP_SSID_PREFIX) + suffix;
}
}  // namespace

namespace wifi {

bool begin(const String& deviceName) {
  WiFi.setHostname(cfg::MDNS_HOSTNAME);
  wm.setConfigPortalTimeout(0);  // captive portal stays up until success
  wm.setConnectTimeout(20);
  wm.setBreakAfterConfig(true);
  wm.setHostname(cfg::MDNS_HOSTNAME);

  const String ap = apSsid(deviceName);
  LOG_INFO(TAG, "starting (AP fallback=%s)", ap.c_str());
  if (!wm.autoConnect(ap.c_str())) {
    LOG_WARN(TAG, "autoConnect timed out — restarting");
    delay(500);
    ESP.restart();
    return false;
  }
  LOG_INFO(TAG, "connected: ssid=%s ip=%s rssi=%d",
           WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

bool isConnected()  { return WiFi.status() == WL_CONNECTED; }
String ssid()       { return WiFi.SSID(); }
int    rssi()       { return WiFi.RSSI(); }
String ip()         { return WiFi.localIP().toString(); }
String mac()        { return WiFi.macAddress(); }

void resetAndReboot() {
  LOG_WARN(TAG, "resetting WiFi credentials → reboot into AP");
  wm.resetSettings();
  delay(200);
  ESP.restart();
}

}  // namespace wifi
