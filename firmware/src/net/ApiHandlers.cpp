#include "ApiHandlers.h"
#include "WifiProvisioner.h"
#include "WsBroadcaster.h"
#include "../app/SessionManager.h"
#include "../app/Settings.h"
#include "../app/AlarmController.h"
#include "../storage/SessionStore.h"
#include "../storage/Sample.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "version.h"
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <math.h>

extern SessionStore sessionStore;
extern AlarmController alarmController;

namespace {
constexpr const char* TAG = "api";

void sendJson(AsyncWebServerRequest* req, int code, const String& body) {
  auto* res = req->beginResponse(code, "application/json", body);
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

String idFromUrl(const String& url, const char* prefix, const char* suffix = nullptr) {
  int p = url.indexOf(prefix);
  if (p < 0) return String();
  String id = url.substring(p + strlen(prefix));
  if (suffix) {
    int s = id.indexOf(suffix);
    if (s >= 0) id = id.substring(0, s);
  }
  // Trim trailing slashes / params.
  int q = id.indexOf('?'); if (q >= 0) id = id.substring(0, q);
  while (id.endsWith("/")) id.remove(id.length() - 1);
  return id;
}

void csvForSession(AsyncWebServerRequest* req, const String& id) {
  if (!sessionStore.openRead(id)) {
    sendJson(req, 404, "{\"error\":\"not_found\"}");
    return;
  }
  AsyncWebServerResponse* res = req->beginChunkedResponse(
    "text/csv",
    [](uint8_t* buf, size_t maxLen, size_t /*idx*/) -> size_t {
      static bool headerSent = false;
      if (!headerSent) {
        const char* h = "t_ms,hr_bpm,spo2_pct,activity,stage,flags\n";
        size_t hl = strlen(h);
        if (hl > maxLen) return 0;
        memcpy(buf, h, hl);
        headerSent = true;
        return hl;
      }
      Sample s;
      const int n = sessionStore.readBlock(reinterpret_cast<uint8_t*>(&s), sizeof(s));
      if (n <= 0) {
        sessionStore.closeRead();
        headerSent = false;
        return 0;
      }
      char line[96];
      const float spo2 = (s.spo2_pct == 0xFFFF) ? -1.0f : s.spo2_pct / 10.0f;
      const int hr = (s.hr_bpm == 0xFFFF) ? -1 : s.hr_bpm;
      const int len = snprintf(line, sizeof(line), "%u,%d,%.1f,%u,%u,%u\n",
                               (unsigned)s.t_ms, hr, spo2, s.activity,
                               s.stage, s.flags);
      if ((size_t)len > maxLen) return 0;
      memcpy(buf, line, len);
      return (size_t)len;
    });
  res->addHeader("Cache-Control", "no-store");
  res->addHeader("Content-Disposition",
                 String("attachment; filename=\"") + id + ".csv\"");
  req->send(res);
}

void rawForSession(AsyncWebServerRequest* req, const String& id) {
  if (!sessionStore.openRead(id)) {
    sendJson(req, 404, "{\"error\":\"not_found\"}");
    return;
  }
  AsyncWebServerResponse* res = req->beginChunkedResponse(
    "application/octet-stream",
    [](uint8_t* buf, size_t maxLen, size_t /*idx*/) -> size_t {
      const int n = sessionStore.readBlock(buf, maxLen);
      if (n <= 0) {
        sessionStore.closeRead();
        return 0;
      }
      return (size_t)n;
    });
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

}  // namespace

namespace api {

void registerRoutes(AsyncWebServer& s) {
  // ---- /api/status -----------------------------------------------------
  s.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["device_name"]      = settings.deviceName;
    d["firmware_version"] = FIRMWARE_VERSION;
    d["wifi_ssid"]        = wifi::ssid();
    d["wifi_rssi"]        = wifi::rssi();
    d["ip"]               = wifi::ip();
    d["free_heap"]        = (uint32_t)ESP.getFreeHeap();
    d["uptime_s"]         = (uint32_t)(millis() / 1000);
    d["time_synced"]      = timeservice::synced();
    d["epoch"]            = timeservice::epoch();
    d["sd_mounted"]       = sessionStore.sdMounted();
    d["sd_healthy"]       = sessionStore.sdHealthy();
    d["lfs_free_bytes"]   = sessionStore.lfsFreeBytes();
    d["session_active"]   = sessionManager.active();
    d["session_id"]       = sessionManager.sessionId();
    d["live"]["hr"]       = sessionManager.hr();
    d["live"]["spo2_x10"] = sessionManager.spo2X10();
    d["live"]["activity"] = sessionManager.activity();
    d["live"]["stage"]    = sessionManager.stage();
    d["live"]["flags"]    = sessionManager.flags();
    d["calibration_nights_done"] = settings.baselineNights;
    d["ws_drops"]         = ws_broadcaster::dropCount();
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // ---- /api/sessions ---------------------------------------------------
  s.on("/api/sessions", HTTP_GET, [](AsyncWebServerRequest* req) {
    auto ids = sessionStore.listSessions();
    std::sort(ids.begin(), ids.end(), std::greater<String>());
    JsonDocument d;
    JsonArray arr = d.to<JsonArray>();
    for (const auto& id : ids) {
      JsonObject o = arr.add<JsonObject>();
      o["id"] = id;
      String sc;
      if (sessionStore.readSidecar(id, sc) && sc.length()) {
        JsonDocument tmp;
        if (deserializeJson(tmp, sc) == DeserializationError::Ok) {
          o["summary"] = tmp;
        }
      }
    }
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // GET /api/sessions/:id, /api/sessions/:id/raw, /api/sessions/:id.csv
  s.on("^/api/sessions/(.+)$", HTTP_GET, [](AsyncWebServerRequest* req) {
    String url = req->url();
    if (url.endsWith(".csv")) {
      String id = idFromUrl(url, "/api/sessions/", ".csv");
      csvForSession(req, id);
      return;
    }
    if (url.endsWith("/raw")) {
      String id = idFromUrl(url, "/api/sessions/", "/raw");
      rawForSession(req, id);
      return;
    }
    String id = idFromUrl(url, "/api/sessions/");
    String json;
    if (!sessionStore.readSidecar(id, json)) {
      sendJson(req, 404, "{\"error\":\"not_found\"}");
      return;
    }
    sendJson(req, 200, json);
  });

  s.on("^/api/sessions/(.+)$", HTTP_DELETE, [](AsyncWebServerRequest* req) {
    String id = idFromUrl(req->url(), "/api/sessions/");
    const bool ok = sessionStore.deleteSession(id);
    sendJson(req, ok ? 200 : 404, ok ? "{\"ok\":true}" : "{\"error\":\"not_found\"}");
  });

  // ---- /api/sessions/start | /stop ------------------------------------
  s.on("/api/sessions/start", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (sessionManager.startSession()) sendJson(req, 200, "{\"ok\":true}");
    else                               sendJson(req, 409, "{\"error\":\"already_active\"}");
  });
  s.on("/api/sessions/stop", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (sessionManager.stopSession()) sendJson(req, 200, "{\"ok\":true}");
    else                              sendJson(req, 409, "{\"error\":\"not_active\"}");
  });

  // ---- /api/settings ---------------------------------------------------
  s.on("/api/settings", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["device_name"]      = settings.deviceName;
    d["timezone"]         = settings.timezone;
    d["alarm_enabled"]    = settings.alarmEnabled;
    d["alarm_start_min"]  = settings.alarmStartMin;
    d["alarm_end_min"]    = settings.alarmEndMin;
    d["alarm_days"]       = settings.alarmDays;
    d["spo2_low_x10"]     = settings.spo2LowX10;
    d["spo2_sustain_s"]   = settings.spo2SustainS;
    d["led_brightness"]   = settings.ledBrightness;
    d["spo2_cal_a"]       = settings.spo2CalA;
    d["spo2_cal_b"]       = settings.spo2CalB;
    d["thresh_motion"]    = settings.threshMotion;
    d["thresh_still"]     = settings.threshStill;
    d["baseline_nights"]  = settings.baselineNights;
    d["user_baseline_rmssd"] = settings.userBaselineRmssd;
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // PUT /api/settings (body = full or partial JSON)
  auto putSettings = new AsyncCallbackJsonWebHandler(
    "/api/settings", [](AsyncWebServerRequest* req, JsonVariant& v) {
      JsonObject o = v.as<JsonObject>();

      // Validate every field that is present, then commit atomically.
      // Reject the entire request on the first invalid field — partial
      // application would leave the device in an unpredictable state.
      auto reject = [&](const char* field) {
        String body = String("{\"error\":\"invalid_field\",\"field\":\"") + field + "\"}";
        sendJson(req, 400, body);
      };

      // Integer ranges.
      if (o["alarm_start_min"].is<JsonVariant>()) {
        int x = o["alarm_start_min"].as<int>();
        if (x < 0 || x > 1439) return reject("alarm_start_min");
      }
      if (o["alarm_end_min"].is<JsonVariant>()) {
        int x = o["alarm_end_min"].as<int>();
        if (x < 0 || x > 1439) return reject("alarm_end_min");
      }
      if (o["spo2_sustain_s"].is<JsonVariant>()) {
        int x = o["spo2_sustain_s"].as<int>();
        if (x < 5 || x > 600) return reject("spo2_sustain_s");
      }
      if (o["led_brightness"].is<JsonVariant>()) {
        int x = o["led_brightness"].as<int>();
        if (x < 0 || x > 255) return reject("led_brightness");
      }
      if (o["spo2_low_x10"].is<JsonVariant>()) {
        int x = o["spo2_low_x10"].as<int>();
        if (x < 700 || x > 1000) return reject("spo2_low_x10");
      }
      if (o["alarm_days"].is<JsonVariant>()) {
        int x = o["alarm_days"].as<int>();
        if (x < 0 || x > 0x7F) return reject("alarm_days");
      }
      if (o["thresh_motion"].is<JsonVariant>()) {
        int x = o["thresh_motion"].as<int>();
        if (x < 0 || x > 1000) return reject("thresh_motion");
      }
      if (o["thresh_still"].is<JsonVariant>()) {
        int x = o["thresh_still"].as<int>();
        if (x < 0 || x > 1000) return reject("thresh_still");
      }
      if (o["spo2_cal_a"].is<JsonVariant>()) {
        float x = o["spo2_cal_a"].as<float>();
        if (!isfinite(x)) return reject("spo2_cal_a");
      }
      if (o["spo2_cal_b"].is<JsonVariant>()) {
        float x = o["spo2_cal_b"].as<float>();
        if (!isfinite(x)) return reject("spo2_cal_b");
      }
      if (o["pin"].is<const char*>()) {
        String p = String((const char*)o["pin"]);
        if (p.length() != 0 && p.length() != 4) return reject("pin");
        for (size_t i = 0; i < p.length(); ++i) {
          if (p[i] < '0' || p[i] > '9') return reject("pin");
        }
      }

      // All present fields validated — commit.
      if (o["device_name"].is<const char*>())   settings.deviceName     = String((const char*)o["device_name"]);
      if (o["timezone"].is<const char*>())      { settings.timezone = String((const char*)o["timezone"]); timeservice::setTimezone(settings.timezone.c_str()); }
      if (o["alarm_enabled"].is<bool>())        settings.alarmEnabled   = o["alarm_enabled"];
      if (o["alarm_start_min"].is<JsonVariant>()) settings.alarmStartMin = (uint16_t)o["alarm_start_min"].as<int>();
      if (o["alarm_end_min"].is<JsonVariant>())   settings.alarmEndMin   = (uint16_t)o["alarm_end_min"].as<int>();
      if (o["alarm_days"].is<JsonVariant>())      settings.alarmDays     = (uint8_t)o["alarm_days"].as<int>();
      if (o["spo2_low_x10"].is<JsonVariant>())    settings.spo2LowX10    = (uint16_t)o["spo2_low_x10"].as<int>();
      if (o["spo2_sustain_s"].is<JsonVariant>())  settings.spo2SustainS  = (uint16_t)o["spo2_sustain_s"].as<int>();
      if (o["led_brightness"].is<JsonVariant>())  settings.ledBrightness = (uint8_t)o["led_brightness"].as<int>();
      if (o["spo2_cal_a"].is<JsonVariant>())      settings.spo2CalA      = o["spo2_cal_a"].as<float>();
      if (o["spo2_cal_b"].is<JsonVariant>())      settings.spo2CalB      = o["spo2_cal_b"].as<float>();
      if (o["thresh_motion"].is<JsonVariant>())   settings.threshMotion  = (uint16_t)o["thresh_motion"].as<int>();
      if (o["thresh_still"].is<JsonVariant>())    settings.threshStill   = (uint16_t)o["thresh_still"].as<int>();
      if (o["pin"].is<const char*>())             settings.pin           = String((const char*)o["pin"]);
      settings.requestSave();
      sendJson(req, 200, "{\"ok\":true}");
    });
  s.addHandler(putSettings).setMethod(HTTP_PUT);

  // ---- /api/alarm ------------------------------------------------------
  s.on("/api/alarm", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["enabled"]    = settings.alarmEnabled;
    d["start_min"]  = settings.alarmStartMin;
    d["end_min"]    = settings.alarmEndMin;
    d["days"]       = settings.alarmDays;
    d["spo2_low_x10"]   = settings.spo2LowX10;
    d["spo2_sustain_s"] = settings.spo2SustainS;
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  s.on("/api/alarm/test", HTTP_POST, [](AsyncWebServerRequest* req) {
    alarmController.test();
    sendJson(req, 200, "{\"ok\":true}");
  });
  s.on("/api/alarm/silence", HTTP_POST, [](AsyncWebServerRequest* req) {
    alarmController.silence();
    sendJson(req, 200, "{\"ok\":true}");
  });

  // ---- /api/wifi/reset ------------------------------------------------
  s.on("/api/wifi/reset", HTTP_POST, [](AsyncWebServerRequest* req) {
    sendJson(req, 200, "{\"ok\":true,\"rebooting\":true}");
    delay(200);
    wifi::resetAndReboot();
  });

  LOG_INFO(TAG, "routes registered");
}

}  // namespace api
