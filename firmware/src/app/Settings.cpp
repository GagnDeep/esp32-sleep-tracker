#include "Settings.h"
#include "../util/Log.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

namespace {
constexpr const char* TAG = "settings";
constexpr const char* PATH = "/settings.json";
constexpr uint32_t   DEBOUNCE_MS = 1500;
}

Settings settings;

String Settings::toJson() const {
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
  String out; serializeJson(d, out);
  return out;
}

bool Settings::fromJson(const String& json) {
  JsonDocument d;
  if (deserializeJson(d, json)) return false;
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
  return true;
}

bool Settings::load() {
  if (!LittleFS.exists(PATH)) {
    LOG_INFO(TAG, "no settings.json — using defaults");
    return save();
  }
  fs::File f = LittleFS.open(PATH, "r");
  if (!f) return false;
  String s = f.readString();
  f.close();
  if (!fromJson(s)) {
    LOG_ERROR(TAG, "parse failed — keeping defaults");
    return false;
  }
  LOG_INFO(TAG, "loaded");
  return true;
}

bool Settings::save() {
  fs::File f = LittleFS.open(PATH, "w");
  if (!f) return false;
  f.print(toJson());
  f.close();
  pendingSaveAt_ = 0;
  LOG_DEBUG(TAG, "saved");
  return true;
}

void Settings::requestSave() {
  pendingSaveAt_ = millis() + DEBOUNCE_MS;
}

void Settings::tick() {
  if (pendingSaveAt_ != 0 && (int32_t)(millis() - pendingSaveAt_) >= 0) {
    save();
  }
}
