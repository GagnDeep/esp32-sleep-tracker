#include "WifiProvisioner.h"
#include "../util/Log.h"
#include "config.h"
#include <WiFi.h>
#include <WiFiManager.h>

namespace {
constexpr const char* TAG = "wifi";
WiFiManager wm;

// Scan cache (shared, mutex-protected).
std::vector<wifi::ScanEntry> s_scanCache;
uint32_t s_scanCacheAtMs = 0;
SemaphoreHandle_t s_scanMutex = nullptr;

String apSsid(const String& deviceName) {
  uint64_t mac = ESP.getEfuseMac();
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%04X", (uint16_t)(mac & 0xFFFF));
  return String(cfg::AP_SSID_PREFIX) + suffix;
}

const char* encToStr(wifi_auth_mode_t e) {
  switch (e) {
    case WIFI_AUTH_OPEN:            return "open";
    case WIFI_AUTH_WEP:             return "wep";
    case WIFI_AUTH_WPA_PSK:         return "wpa";
    case WIFI_AUTH_WPA2_PSK:        return "wpa2";
    case WIFI_AUTH_WPA_WPA2_PSK:    return "wpa_wpa2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "wpa2";
#ifdef WIFI_AUTH_WPA3_PSK
    case WIFI_AUTH_WPA3_PSK:        return "wpa3";
#endif
#ifdef WIFI_AUTH_WPA2_WPA3_PSK
    case WIFI_AUTH_WPA2_WPA3_PSK:   return "wpa3";
#endif
    default:                        return "unknown";
  }
}
}  // namespace

namespace wifi {

bool begin(const String& deviceName) {
  WiFi.setHostname(cfg::MDNS_HOSTNAME);
  wm.setConfigPortalTimeout(0);  // captive portal stays up until success
  wm.setConnectTimeout(20);
  wm.setBreakAfterConfig(true);
  wm.setHostname(cfg::MDNS_HOSTNAME);

#if defined(WIFI_PRESET_SSID) && defined(WIFI_PRESET_PASS)
  // Build-time credential override (set via PLATFORMIO_BUILD_FLAGS). Useful
  // for dev flashing without going through the captive portal. Persists to
  // NVS via the default WiFi.persistent(true), so subsequent boots reconnect
  // through wm.autoConnect()'s saved-credentials path and skip this block.
  if (WiFi.status() != WL_CONNECTED) {
    LOG_INFO(TAG, "preset creds present — direct connect to ssid=%s", WIFI_PRESET_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_PRESET_SSID, WIFI_PRESET_PASS);
    const uint32_t deadline = millis() + 15000;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
      delay(200);
    }
    if (WiFi.status() == WL_CONNECTED) {
      LOG_INFO(TAG, "connected via preset: ssid=%s ip=%s rssi=%d",
               WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
      return true;
    }
    LOG_WARN(TAG, "preset connect timed out — falling back to portal");
  }
#endif

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

void stopPortal() {
  LOG_INFO(TAG, "stopping captive portal (provisioned out-of-band)");
  wm.stopConfigPortal();
}

std::vector<ScanEntry> scan(uint32_t maxAgeMs) {
  if (!s_scanMutex) s_scanMutex = xSemaphoreCreateMutex();
  if (s_scanMutex) xSemaphoreTake(s_scanMutex, portMAX_DELAY);

  const uint32_t now = millis();
  const bool cacheFresh = s_scanCacheAtMs != 0 &&
                          (now - s_scanCacheAtMs) < maxAgeMs;
  if (cacheFresh) {
    auto out = s_scanCache;
    if (s_scanMutex) xSemaphoreGive(s_scanMutex);
    return out;
  }

  // Synchronous scan; show_hidden=true.
  // WiFi.scanNetworks(async=false, show_hidden=true)
  const int n = WiFi.scanNetworks(false, true);
  std::vector<ScanEntry> out;
  if (n < 0) {
    LOG_WARN(TAG, "scan failed: %d", n);
  } else {
    out.reserve(n);
    for (int i = 0; i < n; ++i) {
      ScanEntry e;
      e.ssid = WiFi.SSID(i);
      e.rssi = (int8_t)WiFi.RSSI(i);
      e.enc  = encToStr(WiFi.encryptionType(i));
      out.push_back(std::move(e));
    }
    WiFi.scanDelete();
  }
  s_scanCache = out;
  s_scanCacheAtMs = millis();
  if (s_scanMutex) xSemaphoreGive(s_scanMutex);
  return out;
}

}  // namespace wifi
