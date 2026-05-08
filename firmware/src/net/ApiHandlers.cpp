#include "ApiHandlers.h"
#include "OtaService.h"
#include "WifiProvisioner.h"
#include "WsBroadcaster.h"
#include "../app/SessionManager.h"
#include "../app/Settings.h"
#include "../app/AlarmController.h"
#include "../sensors/SensorRegistry.h"
#include "../storage/SessionStore.h"
#include "../storage/Sample.h"
#include "../util/Log.h"
#include "../util/TimeService.h"
#include "../util/I2cBus.h"
#include "pins.h"
#include "version.h"
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <Wire.h>
#include <math.h>
#include <memory>
#include <time.h>
#include <set>

extern SessionStore sessionStore;
extern AlarmController alarmController;
extern SensorRegistry sensors;

namespace {
constexpr const char* TAG = "api";

// ---------- helpers --------------------------------------------------------

void sendJson(AsyncWebServerRequest* req, int code, const String& body) {
  auto* res = req->beginResponse(code, "application/json", body);
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

// Constant-time string compare. Always walks max(len(a),len(b)) so a
// timing attacker can't learn the configured-pin length.
bool ctEquals(const String& a, const String& b) {
  const size_t la = a.length();
  const size_t lb = b.length();
  const size_t n  = la > lb ? la : lb;
  uint8_t diff = (uint8_t)(la ^ lb);
  for (size_t i = 0; i < n; ++i) {
    const uint8_t ca = i < la ? (uint8_t)a[i] : 0;
    const uint8_t cb = i < lb ? (uint8_t)b[i] : 0;
    diff |= (uint8_t)(ca ^ cb);
  }
  return diff == 0;
}

// True if request is allowed: either no PIN configured, or X-Pin matches.
// On failure sends 401 and returns false (caller should `return`).
bool authOk(AsyncWebServerRequest* req) {
  // Empty PIN = system is open.
  if (settings.pin.length() == 0) {
    otaservice::markBootGood();
    return true;
  }
  String got;
  if (req->hasHeader("X-Pin")) got = req->header("X-Pin");
  if (ctEquals(got, settings.pin)) {
    otaservice::markBootGood();
    return true;
  }
  sendJson(req, 401, "{\"error\":\"unauthorized\"}");
  return false;
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

// Per-request CSV streaming state. Allocated on the heap, captured by
// the chunked-callback closure (and the on-disconnect cleanup), freed
// on completion. Replaces the previous `static bool headerSent` which
// was racy under concurrent CSV downloads.
struct CsvState {
  String id;
  bool   headerSent = false;
  bool   readerOpen = false;
};

void csvForSession(AsyncWebServerRequest* req, const String& id) {
  if (!sessionStore.openRead(id)) {
    sendJson(req, 404, "{\"error\":\"not_found\"}");
    return;
  }
  auto* st = new CsvState();
  st->id = id;
  st->readerOpen = true;

  AsyncWebServerResponse* res = req->beginChunkedResponse(
    "text/csv",
    [st](uint8_t* buf, size_t maxLen, size_t /*idx*/) -> size_t {
      if (!st->headerSent) {
        const char* h = "t_ms,hr_bpm,spo2_pct,activity,stage,flags\n";
        size_t hl = strlen(h);
        if (hl > maxLen) return 0;
        memcpy(buf, h, hl);
        st->headerSent = true;
        return hl;
      }
      Sample s;
      const int n = sessionStore.readBlock(reinterpret_cast<uint8_t*>(&s), sizeof(s));
      if (n <= 0) {
        if (st->readerOpen) {
          sessionStore.closeRead();
          st->readerOpen = false;
        }
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
  // Free per-request state when the response goes away.
  req->onDisconnect([st]() {
    if (st->readerOpen) sessionStore.closeRead();
    delete st;
  });
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

// Whitelisted tags. Anything else is rejected by PATCH /api/sessions/:id.
bool isAllowedTag(const String& t) {
  static const char* kAllowed[] = {
    "sick", "workout", "alcohol", "travel",
    "caffeine", "medication", "nap", "napless",
  };
  for (const char* a : kAllowed) if (t == a) return true;
  return false;
}

// ---- Alarm preview ---------------------------------------------------------
//
// Returns the next epoch second at which the smart-alarm window opens
// (matching the same logic AlarmController uses), and a human-readable
// reason string. Looks up to 8 days ahead so even a Mon-only alarm has
// a result. Returns -1/null if alarm is disabled.

struct AlarmPreview {
  int64_t  nextFireUnix  = -1;     // -1 = none
  int64_t  wouldFireInS  = -1;     // seconds from now
  String   reason;
};

AlarmPreview computeAlarmPreview() {
  AlarmPreview p;
  if (!settings.alarmEnabled) { p.reason = "alarm_disabled"; return p; }
  const time_t now = time(nullptr);
  if (now <= 0) { p.reason = "clock_not_synced"; return p; }

  // Walk forward minute-by-minute up to 8 days. The window is small
  // (hundreds of minutes/day) so an O(8*24*60) walk is fine and keeps
  // the logic identical to AlarmController::inSmartWindow().
  const uint16_t startMin = settings.alarmStartMin;
  const uint16_t endMin   = settings.alarmEndMin;
  const uint8_t  daysMask = settings.alarmDays;
  for (int dayOffset = 0; dayOffset < 8; ++dayOffset) {
    struct tm lt;
    time_t day = now + (time_t)dayOffset * 86400;
    localtime_r(&day, &lt);
    // Reset to midnight of that day.
    lt.tm_hour = 0; lt.tm_min = 0; lt.tm_sec = 0;
    const time_t midnight = mktime(&lt);
    // Day-of-week mask check: AlarmController treats mask==0 as any-day.
    const bool dayOk = (daysMask == 0) ||
                       ((daysMask & (1 << lt.tm_wday)) != 0);
    if (!dayOk) continue;
    const time_t windowStart = midnight + (time_t)startMin * 60;
    const time_t windowEnd   = midnight + (time_t)endMin   * 60;
    // Skip windows entirely in the past.
    if (windowEnd <= now) continue;
    const time_t fireAt = (windowStart > now) ? windowStart : now;
    p.nextFireUnix = (int64_t)fireAt;
    p.wouldFireInS = (int64_t)fireAt - (int64_t)now;
    if (fireAt <= now) {
      p.reason = "would_fire_now";
    } else {
      const int64_t s = p.wouldFireInS;
      const int h = (int)(s / 3600);
      const int m = (int)((s % 3600) / 60);
      char buf[64];
      snprintf(buf, sizeof(buf), "next_window_in_%dh_%dm", h, m);
      p.reason = buf;
    }
    return p;
  }
  p.reason = "no_window_in_next_8d";
  return p;
}

}  // namespace

namespace api {

void registerRoutes(AsyncWebServer& s) {
  // ---- /api/status -----------------------------------------------------
  s.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* req) {
    // GET endpoints stay open; still mark boot-good so OTA verify is
    // satisfied as soon as the new firmware serves any meaningful API.
    otaservice::markBootGood();
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
    d["sensors"]["max30102"] = sensors.maxOk();
    d["sensors"]["mpu6050"]  = sensors.mpuOk();
    d["calibration_nights_done"] = settings.baselineNights;
    d["ws_drops"]         = ws_broadcaster::dropCount();
    d["pin_required"]     = settings.pin.length() > 0;
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
    if (!authOk(req)) return;
    String id = idFromUrl(req->url(), "/api/sessions/");
    const bool ok = sessionStore.deleteSession(id);
    sendJson(req, ok ? 200 : 404, ok ? "{\"ok\":true}" : "{\"error\":\"not_found\"}");
  });

  // PATCH /api/sessions/:id  body={tags?: string[], notes?: string}
  //
  // We can't reuse AsyncCallbackJsonWebHandler because that handler
  // matches a fixed URL — we need a path parameter. Instead, register
  // a regex route with a body-accumulating closure: the body callback
  // gathers chunks into a heap String stashed in `_tempObject`; the
  // request callback (which fires after the full body has been
  // received) parses and acts on it.
  s.on("^/api/sessions/(.+)$", HTTP_PATCH,
    /*onRequest*/ [](AsyncWebServerRequest* req) {
      if (!authOk(req)) {
        // authOk sent 401; clean up any accumulated body.
        if (req->_tempObject) {
          delete (String*)req->_tempObject;
          req->_tempObject = nullptr;
        }
        return;
      }
      std::unique_ptr<String> body((String*)req->_tempObject);
      req->_tempObject = nullptr;
      if (!body || body->length() == 0) {
        sendJson(req, 400, "{\"error\":\"empty_body\"}");
        return;
      }

      const String id = idFromUrl(req->url(), "/api/sessions/");
      if (id.length() == 0) {
        sendJson(req, 404, "{\"error\":\"not_found\"}");
        return;
      }
      JsonDocument doc;
      if (deserializeJson(doc, *body) != DeserializationError::Ok ||
          !doc.is<JsonObject>()) {
        sendJson(req, 400, "{\"error\":\"invalid_json\"}");
        return;
      }
      JsonObject o = doc.as<JsonObject>();

      // Reject unknown fields.
      for (JsonPair kv : o) {
        const String k = String(kv.key().c_str());
        if (k != "tags" && k != "notes") {
          String b = String("{\"error\":\"unknown_field\",\"field\":\"") + k + "\"}";
          sendJson(req, 400, b);
          return;
        }
      }

      // Validate tags.
      std::vector<String> tags;
      bool tagsPresent = false;
      if (o["tags"].is<JsonArray>()) {
        tagsPresent = true;
        std::set<String> seen;
        for (JsonVariant t : o["tags"].as<JsonArray>()) {
          if (!t.is<const char*>()) {
            sendJson(req, 400, "{\"error\":\"invalid_tag_type\"}");
            return;
          }
          String tag = String((const char*)t);
          if (!isAllowedTag(tag)) {
            String b = String("{\"error\":\"invalid_tag\",\"tag\":\"") + tag + "\"}";
            sendJson(req, 400, b);
            return;
          }
          if (seen.insert(tag).second) tags.push_back(tag);
        }
      } else if (!o["tags"].isNull()) {
        // Present but not an array (and not null).
        sendJson(req, 400, "{\"error\":\"invalid_tags\"}");
        return;
      }

      // Validate notes.
      String notes;
      bool notesPresent = false;
      if (o["notes"].is<const char*>()) {
        notesPresent = true;
        notes = String((const char*)o["notes"]);
        if (notes.length() > 2048) {
          sendJson(req, 400, "{\"error\":\"notes_too_long\"}");
          return;
        }
      } else if (!o["notes"].isNull()) {
        sendJson(req, 400, "{\"error\":\"invalid_notes\"}");
        return;
      }

      // Read-modify-write the sidecar under the global file lock.
      String updated;
      const bool ok = sessionStore.mutateSidecar(
        id, [&](JsonDocument& d) -> bool {
          if (tagsPresent) {
            d.remove("tags");
            JsonArray arr = d["tags"].to<JsonArray>();
            for (const auto& t : tags) arr.add(t);
          }
          if (notesPresent) {
            d["notes"] = notes;
          }
          serializeJson(d, updated);
          return true;
        });
      if (!ok) {
        sendJson(req, 404, "{\"error\":\"not_found\"}");
        return;
      }
      sendJson(req, 200, updated);
    },
    /*onUpload*/ nullptr,
    /*onBody*/ [](AsyncWebServerRequest* req, uint8_t* data, size_t len,
                   size_t index, size_t total) {
      // Cap total body size; the onRequest callback will see an empty
      // _tempObject and respond with 413.
      if (total > 4096) {
        if (req->_tempObject) {
          delete (String*)req->_tempObject;
          req->_tempObject = nullptr;
        }
        return;
      }
      String* body = (String*)req->_tempObject;
      if (!body) {
        body = new String();
        body->reserve(total);
        req->_tempObject = body;
      }
      body->concat((const char*)data, len);
    });

  // ---- /api/sessions/start | /stop ------------------------------------
  s.on("/api/sessions/start", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
    if (sessionManager.startSession()) sendJson(req, 200, "{\"ok\":true}");
    else                               sendJson(req, 409, "{\"error\":\"already_active\"}");
  });
  s.on("/api/sessions/stop", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
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
    // Don't echo the PIN itself; only whether one is set.
    d["pin_set"]          = settings.pin.length() > 0;
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // PUT /api/settings (body = full or partial JSON)
  auto* putSettings = new AsyncCallbackJsonWebHandler(
    "/api/settings", [](AsyncWebServerRequest* req, JsonVariant& v) {
      if (!authOk(req)) return;
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
  putSettings->setMethod(HTTP_PUT);
  s.addHandler(putSettings);

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

  // GET /api/alarm/preview
  s.on("/api/alarm/preview", HTTP_GET, [](AsyncWebServerRequest* req) {
    AlarmPreview p = computeAlarmPreview();
    JsonDocument d;
    if (p.nextFireUnix < 0) {
      d["next_fire_unix"]  = (const char*)nullptr;
      d["would_fire_in_s"] = (const char*)nullptr;
    } else {
      d["next_fire_unix"]  = (uint64_t)p.nextFireUnix;
      d["would_fire_in_s"] = (int64_t)p.wouldFireInS;
    }
    d["reason"] = p.reason;
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  s.on("/api/alarm/test", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
    alarmController.test();
    sendJson(req, 200, "{\"ok\":true}");
  });
  s.on("/api/alarm/silence", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
    alarmController.silence();
    sendJson(req, 200, "{\"ok\":true}");
  });

  // ---- /api/wifi -------------------------------------------------------
  s.on("/api/wifi/reset", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
    sendJson(req, 200, "{\"ok\":true,\"rebooting\":true}");
    delay(200);
    wifi::resetAndReboot();
  });

  // ---- /api/debug/hr --------------------------------------------------
  // HR estimator internal state — used to figure out whether the
  // bandpass filter is producing modulation, whether the peak detector
  // is firing, and how recent the last detected beat was.
  s.on("/api/debug/hr", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    auto snap = sessionManager.hrEstimator().debug();
    d["y_last"]       = snap.yLast;
    d["envelope"]     = snap.envelope;
    d["threshold"]    = snap.threshold;
    d["above"]        = snap.above;
    d["last_beat_ms"] = snap.lastBeatMs;
    d["last_rr"]      = snap.lastRR;
    d["smoothed_bpm"] = snap.smoothedBpm;
    d["age_ms"]       = snap.lastBeatMs ? (uint32_t)(millis() - snap.lastBeatMs) : 0;
    d["live_hr"]      = sessionManager.hr();
    d["live_flags"]   = sessionManager.flags();
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // ---- /api/debug/sensor-raw ------------------------------------------
  // Latest raw IR / Red counts from the MAX30102 plus the finger-detect
  // threshold. Lets a user verify the LEDs are firing and reflecting off
  // their finger before trusting the HR/SpO2 derived numbers.
  s.on("/api/debug/sensor-raw", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["max30102_online"] = sensors.maxOk();
    if (sensors.maxOk()) {
      auto r = sensors.max().peek();
      d["ir"]              = r.ir;
      d["red"]             = r.red;
      d["finger"]          = r.finger;
      d["finger_threshold"] = sensors.max().fingerThreshold();
      d["sample_age_ms"]   = (uint32_t)(millis() - r.t_ms);
    }
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // ---- /api/debug/rescan -----------------------------------------------
  // Force a sensor re-init now without waiting for the periodic 5s retry.
  // Useful right after wiring up a sensor on a running device.
  s.on("/api/debug/rescan", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (!authOk(req)) return;
    const bool recovered = sensors.rescan();
    JsonDocument d;
    d["recovered"] = recovered;
    d["max30102"]  = sensors.maxOk();
    d["mpu6050"]   = sensors.mpuOk();
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // ---- /api/debug/i2c-scan --------------------------------------------
  // Diagnostic: probe every 7-bit I2C address and report which devices
  // ACK'd, plus identifying registers for known sensors. Useful when
  // /api/status reports max30102=false to distinguish wiring/power from
  // wrong-address from chip-locked-up. Open endpoint (read-only).
  s.on("/api/debug/i2c-scan", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["sda_pin"] = pins::I2C_SDA;
    d["scl_pin"] = pins::I2C_SCL;
    JsonArray devs = d["devices"].to<JsonArray>();
    bool max_found = false, mpu_found = false;
    {
      I2cGuard g;
      for (uint8_t addr = 0x08; addr <= 0x77; ++addr) {
        Wire.beginTransmission(addr);
        const uint8_t err = Wire.endTransmission();
        if (err == 0) {
          JsonObject o = devs.add<JsonObject>();
          char hx[5]; snprintf(hx, sizeof(hx), "0x%02X", addr);
          o["addr"] = hx;
          if (addr == 0x57) max_found = true;
          if (addr == 0x68 || addr == 0x69) mpu_found = true;
        }
      }
      // MAX30102 fingerprint: PART_ID @ 0xFF should read 0x15, REV_ID @ 0xFE.
      if (max_found) {
        Wire.beginTransmission(0x57);
        Wire.write(0xFF);
        if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)0x57, (uint8_t)1) == 1) {
          d["max30102"]["part_id"] = (int)Wire.read();
        }
        Wire.beginTransmission(0x57);
        Wire.write(0xFE);
        if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)0x57, (uint8_t)1) == 1) {
          d["max30102"]["rev_id"] = (int)Wire.read();
        }
      }
      // MPU6050 fingerprint: WHO_AM_I @ 0x75 should read 0x68.
      if (mpu_found) {
        const uint8_t mpuAddr = devs.size() > 0 ? 0x68 : 0x69;
        Wire.beginTransmission(mpuAddr);
        Wire.write(0x75);
        if (Wire.endTransmission(false) == 0 && Wire.requestFrom(mpuAddr, (uint8_t)1) == 1) {
          d["mpu6050"]["who_am_i"] = (int)Wire.read();
        }
      }
    }
    d["max30102_online"] = sensors.maxOk();
    d["mpu6050_online"]  = sensors.mpuOk();
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // GET /api/wifi/scan — cached scan list.
  s.on("/api/wifi/scan", HTTP_GET, [](AsyncWebServerRequest* req) {
    auto entries = wifi::scan(30000);
    JsonDocument d;
    JsonArray arr = d["networks"].to<JsonArray>();
    for (const auto& e : entries) {
      JsonObject o = arr.add<JsonObject>();
      o["ssid"] = e.ssid;
      o["rssi"] = (int)e.rssi;
      o["enc"]  = e.enc;
    }
    String out; serializeJson(d, out);
    sendJson(req, 200, out);
  });

  // ---- /api/auth/check -------------------------------------------------
  s.on("/api/auth/check", HTTP_POST, [](AsyncWebServerRequest* req) {
    // Empty PIN counts as a match (system is open).
    if (settings.pin.length() == 0) {
      otaservice::markBootGood();
      req->send(204);
      return;
    }
    String got;
    if (req->hasHeader("X-Pin")) got = req->header("X-Pin");
    if (ctEquals(got, settings.pin)) {
      otaservice::markBootGood();
      req->send(204);
      return;
    }
    sendJson(req, 401, "{\"error\":\"unauthorized\"}");
  });

  LOG_INFO(TAG, "routes registered");
}

}  // namespace api
