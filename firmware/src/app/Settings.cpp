#include "Settings.h"
#include "../util/Log.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

namespace {
constexpr const char* TAG  = "settings";
constexpr const char* PATH      = "/settings.json";
constexpr const char* PATH_TMP  = "/settings.json.tmp";
constexpr const char* PATH_BAK  = "/settings.json.bak";
constexpr uint32_t   DEBOUNCE_MS = 1500;

// Lightweight CRC32 (poly 0xEDB88320, reflected). Avoids pulling in zlib.
uint32_t crc32(const uint8_t* data, size_t len, uint32_t seed = 0xFFFFFFFFu) {
  uint32_t c = seed;
  for (size_t i = 0; i < len; ++i) {
    c ^= data[i];
    for (int b = 0; b < 8; ++b) {
      c = (c >> 1) ^ (0xEDB88320u & -(int32_t)(c & 1));
    }
  }
  return c ^ 0xFFFFFFFFu;
}

class Lock {
 public:
  explicit Lock(SemaphoreHandle_t h) : h_(h) {
    if (h_) xSemaphoreTake(h_, portMAX_DELAY);
  }
  ~Lock() { if (h_) xSemaphoreGive(h_); }
 private:
  SemaphoreHandle_t h_;
};
}  // namespace

Settings settings;

String Settings::toJsonNoCrc() const {
  JsonDocument d;
  d["schema"]            = SCHEMA_VERSION;
  d["device_name"]       = deviceName;
  d["timezone"]          = timezone;
  d["alarm_enabled"]     = alarmEnabled;
  d["alarm_start_min"]   = alarmStartMin;
  d["alarm_end_min"]     = alarmEndMin;
  d["alarm_days"]        = alarmDays;
  d["spo2_low_x10"]      = spo2LowX10;
  d["spo2_sustain_s"]    = spo2SustainS;
  d["led_brightness"]    = ledBrightness;
  d["spo2_cal_a"]        = spo2CalA;
  d["spo2_cal_b"]        = spo2CalB;
  d["thresh_motion"]     = threshMotion;
  d["thresh_still"]      = threshStill;
  d["baseline_nights"]   = baselineNights;
  d["user_baseline_rmssd"] = userBaselineRmssd;
  d["pin"]               = pin;
  String out; serializeJson(d, out);
  return out;
}

String Settings::toJson(uint32_t crc) const {
  // Re-build with crc field appended so it serialises into the document.
  JsonDocument d;
  d["schema"]            = SCHEMA_VERSION;
  d["device_name"]       = deviceName;
  d["timezone"]          = timezone;
  d["alarm_enabled"]     = alarmEnabled;
  d["alarm_start_min"]   = alarmStartMin;
  d["alarm_end_min"]     = alarmEndMin;
  d["alarm_days"]        = alarmDays;
  d["spo2_low_x10"]      = spo2LowX10;
  d["spo2_sustain_s"]    = spo2SustainS;
  d["led_brightness"]    = ledBrightness;
  d["spo2_cal_a"]        = spo2CalA;
  d["spo2_cal_b"]        = spo2CalB;
  d["thresh_motion"]     = threshMotion;
  d["thresh_still"]      = threshStill;
  d["baseline_nights"]   = baselineNights;
  d["user_baseline_rmssd"] = userBaselineRmssd;
  d["pin"]               = pin;
  d["crc"]               = crc;
  String out; serializeJson(d, out);
  return out;
}

bool Settings::fromJson(const String& json) {
  JsonDocument d;
  if (deserializeJson(d, json)) return false;

  // Verify CRC32 if present. Older files without "crc" are accepted to
  // avoid bricking on first upgrade; new writes always include it.
  if (d["crc"].is<uint32_t>()) {
    const uint32_t want = d["crc"].as<uint32_t>();
    d.remove("crc");
    String body; serializeJson(d, body);
    const uint32_t got = crc32(reinterpret_cast<const uint8_t*>(body.c_str()),
                               body.length());
    if (got != want) {
      LOG_WARN(TAG, "crc mismatch: got=%08x want=%08x", got, want);
      return false;
    }
  }

  deviceName     = d["device_name"]   | deviceName;
  timezone       = d["timezone"]      | timezone;
  alarmEnabled   = d["alarm_enabled"] | alarmEnabled;
  alarmStartMin  = d["alarm_start_min"] | alarmStartMin;
  alarmEndMin    = d["alarm_end_min"]   | alarmEndMin;
  alarmDays      = d["alarm_days"]      | alarmDays;
  spo2LowX10     = d["spo2_low_x10"]    | spo2LowX10;
  spo2SustainS   = d["spo2_sustain_s"]  | spo2SustainS;
  ledBrightness  = d["led_brightness"]  | ledBrightness;
  spo2CalA       = d["spo2_cal_a"]      | spo2CalA;
  spo2CalB       = d["spo2_cal_b"]      | spo2CalB;
  threshMotion   = d["thresh_motion"]   | threshMotion;
  threshStill    = d["thresh_still"]    | threshStill;
  baselineNights = d["baseline_nights"] | baselineNights;
  userBaselineRmssd = d["user_baseline_rmssd"] | userBaselineRmssd;
  pin            = d["pin"]             | pin;
  return true;
}

bool Settings::loadFromPath(const char* path) {
  if (!LittleFS.exists(path)) return false;
  fs::File f = LittleFS.open(path, "r");
  if (!f) return false;
  String s = f.readString();
  f.close();
  return fromJson(s);
}

bool Settings::load() {
  if (!mutex_) mutex_ = xSemaphoreCreateMutex();
  bool loaded = false;
  bool fromBackup = false;
  {
    Lock lk(mutex_);
    if (loadFromPath(PATH)) {
      loaded = true;
    } else if (loadFromPath(PATH_BAK)) {
      loaded = true;
      fromBackup = true;
    }
  }
  if (loaded) {
    LOG_INFO(TAG, fromBackup ? "loaded from backup" : "loaded");
    return true;
  }
  LOG_INFO(TAG, "no valid settings — writing defaults");
  // save() takes the mutex itself — call after releasing the load lock.
  return save();
}

bool Settings::save() {
  if (!mutex_) mutex_ = xSemaphoreCreateMutex();
  Lock lk(mutex_);

  // Compute CRC over the document body without the "crc" field.
  const String body = toJsonNoCrc();
  const uint32_t crc = crc32(reinterpret_cast<const uint8_t*>(body.c_str()),
                             body.length());
  const String full = toJson(crc);

  // 1) Write the new contents to a temp file.
  {
    fs::File f = LittleFS.open(PATH_TMP, "w");
    if (!f) {
      LOG_ERROR(TAG, "open tmp failed");
      return false;
    }
    const size_t n = f.print(full);
    f.flush();
    f.close();
    if (n != full.length()) {
      LOG_ERROR(TAG, "short write to tmp (%u/%u)", (unsigned)n, (unsigned)full.length());
      LittleFS.remove(PATH_TMP);
      return false;
    }
  }

  // 2) Promote the previous good copy to .bak so we always have a fallback.
  if (LittleFS.exists(PATH)) {
    LittleFS.remove(PATH_BAK);
    LittleFS.rename(PATH, PATH_BAK);
  }

  // 3) Atomically swap in the temp file.
  if (!LittleFS.rename(PATH_TMP, PATH)) {
    LOG_ERROR(TAG, "rename tmp -> json failed");
    return false;
  }
  pendingSaveAt_ = 0;
  LOG_DEBUG(TAG, "saved");
  return true;
}

void Settings::requestSave() {
  if (!mutex_) mutex_ = xSemaphoreCreateMutex();
  Lock lk(mutex_);
  pendingSaveAt_ = millis() + DEBOUNCE_MS;
}

void Settings::tick() {
  uint32_t due = 0;
  {
    if (!mutex_) mutex_ = xSemaphoreCreateMutex();
    Lock lk(mutex_);
    due = pendingSaveAt_;
  }
  if (due != 0 && (int32_t)(millis() - due) >= 0) {
    save();
  }
}
