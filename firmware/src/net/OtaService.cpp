#include "OtaService.h"
#include "WsBroadcaster.h"
#include "../app/SessionManager.h"
#include "../util/Log.h"
#include <Arduino.h>
#include <LittleFS.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <ctype.h>

namespace {
constexpr const char* TAG = "ota";
constexpr const char* PENDING_PATH = "/ota/pending_verify";
constexpr uint32_t VERIFY_WINDOW_MS = 30000;

// Boot-time verify state.
bool     s_pendingPresent  = false;
uint32_t s_pendingDeadline = 0;
bool     s_bootGood        = false;
bool     s_rollbackArmed   = false;

bool isHexHash(const String& s) {
  if (s.length() != 32) return false;
  for (size_t i = 0; i < s.length(); ++i) {
    const char c = s[i];
    if (!((c >= '0' && c <= '9') ||
          (c >= 'a' && c <= 'f') ||
          (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}

void writePendingVerify() {
  if (!LittleFS.exists("/ota")) LittleFS.mkdir("/ota");
  fs::File f = LittleFS.open(PENDING_PATH, "w");
  if (!f) return;
  const esp_partition_t* p = esp_ota_get_running_partition();
  String body = String("{\"label\":\"") + (p ? p->label : "unknown") +
                "\",\"millis\":" + String((uint32_t)millis()) + "}";
  f.print(body);
  f.close();
}

void removePendingVerify() {
  if (LittleFS.exists(PENDING_PATH)) LittleFS.remove(PENDING_PATH);
}

// Throttled progress broadcast.
uint32_t s_lastProgressMs = 0;
void emitProgress(size_t bytes, size_t total) {
  const uint32_t now = millis();
  if (now - s_lastProgressMs < 250) return;
  s_lastProgressMs = now;
  int pct = -1;
  if (total > 0) {
    pct = (int)((bytes * 100ULL) / total);
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
  }
  char buf[96];
  if (pct >= 0) {
    snprintf(buf, sizeof(buf),
             "{\"type\":\"ota_progress\",\"pct\":%d,\"bytes\":%u}",
             pct, (unsigned)bytes);
  } else {
    snprintf(buf, sizeof(buf),
             "{\"type\":\"ota_progress\",\"pct\":null,\"bytes\":%u}",
             (unsigned)bytes);
  }
  ws_broadcaster::broadcastRaw(buf);
}

// Per-upload state. We need to remember the expected total size + the
// MD5 we received in the request header so the upload-data handler can
// pass them through to the Update library.
struct UploadCtx {
  size_t totalBytes = 0;
  String md5;
  bool   begun      = false;
  bool   rejected   = false;
};
UploadCtx s_upload;

}  // namespace

namespace ota {

void registerRoutes(AsyncWebServer& s) {
  s.on(
    "/api/ota", HTTP_POST,
    // Upload-finished handler.
    [](AsyncWebServerRequest* req) {
      if (s_upload.rejected) {
        // Response already sent in the upload handler; just bail.
        s_upload = UploadCtx();
        return;
      }
      const bool ok = !Update.hasError();
      AsyncWebServerResponse* res = req->beginResponse(
        ok ? 200 : 500, "application/json",
        ok ? "{\"ok\":true,\"rebooting\":true}"
           : "{\"ok\":false,\"error\":\"update_failed\"}");
      res->addHeader("Connection", "close");
      req->send(res);
      if (ok) {
        // Mark the new partition as pending-verify so the next boot
        // can roll it back if the firmware doesn't come up healthy.
        writePendingVerify();
        delay(200);
        ESP.restart();
      }
      s_upload = UploadCtx();
    },
    // Multipart upload handler.
    [](AsyncWebServerRequest* req, String /*filename*/, size_t index,
       uint8_t* data, size_t len, bool finalChunk) {
      if (index == 0) {
        s_upload = UploadCtx();
        if (sessionManager.active()) {
          LOG_WARN(TAG, "OTA refused — session active");
          s_upload.rejected = true;
          req->send(409, "application/json",
                    "{\"error\":\"session_active\"}");
          return;
        }
        // Require an MD5 header so we can verify the binary integrity.
        String md5;
        if (req->hasHeader("X-Firmware-MD5")) md5 = req->header("X-Firmware-MD5");
        else if (req->hasHeader("X-MD5"))     md5 = req->header("X-MD5");
        md5.toLowerCase();
        if (!isHexHash(md5)) {
          LOG_WARN(TAG, "OTA refused — missing/invalid MD5 header");
          s_upload.rejected = true;
          req->send(400, "application/json",
                    "{\"error\":\"missing_md5\"}");
          return;
        }
        s_upload.md5 = md5;
        // Total size: prefer Content-Length, fall back to UNKNOWN.
        s_upload.totalBytes = req->contentLength();
        LOG_INFO(TAG, "OTA begin (size=%u, md5=%s)",
                 (unsigned)s_upload.totalBytes, md5.c_str());
        const size_t want = s_upload.totalBytes > 0
                                ? s_upload.totalBytes
                                : (size_t)UPDATE_SIZE_UNKNOWN;
        if (!Update.begin(want)) {
          Update.printError(Serial);
          s_upload.rejected = true;
          req->send(500, "application/json",
                    "{\"error\":\"update_begin_failed\"}");
          return;
        }
        if (!Update.setMD5(s_upload.md5.c_str())) {
          LOG_WARN(TAG, "Update.setMD5 rejected hash");
          Update.abort();
          s_upload.rejected = true;
          req->send(400, "application/json",
                    "{\"error\":\"md5_set_failed\"}");
          return;
        }
        s_upload.begun = true;
      }
      if (s_upload.rejected || !s_upload.begun) return;
      if (len) {
        if (Update.write(data, len) != len) {
          Update.printError(Serial);
        } else {
          emitProgress(index + len, s_upload.totalBytes);
        }
      }
      if (finalChunk) {
        if (Update.end(true)) {
          LOG_INFO(TAG, "OTA success (%u bytes)", (unsigned)(index + len));
          // Final 100% emit (force).
          s_lastProgressMs = 0;
          emitProgress(index + len,
                       s_upload.totalBytes ? s_upload.totalBytes : (index + len));
        } else {
          Update.printError(Serial);
        }
      }
    });

  s.on("/api/ota/rollback", HTTP_POST, [](AsyncWebServerRequest* req) {
    LOG_WARN(TAG, "rollback requested via API");
    AsyncWebServerResponse* res = req->beginResponse(
      200, "application/json", "{\"ok\":true,\"rebooting\":true}");
    res->addHeader("Connection", "close");
    req->send(res);
    delay(200);
    // Mark the running app invalid and reboot into the previous slot.
    esp_ota_mark_app_invalid_rollback_and_reboot();
    // Should never return.
    ESP.restart();
  });

  LOG_INFO(TAG, "registered");
}

}  // namespace ota

namespace otaservice {

void begin() {
  s_pendingPresent = LittleFS.exists(PENDING_PATH);
  if (!s_pendingPresent) return;
  s_pendingDeadline = millis() + VERIFY_WINDOW_MS;
  s_rollbackArmed = true;
  LOG_WARN(TAG, "boot pending-verify; rollback in %u ms unless API hit",
           (unsigned)VERIFY_WINDOW_MS);

  // Start a one-shot task that triggers rollback if not cancelled.
  xTaskCreate(
    [](void*) {
      while (s_rollbackArmed && !s_bootGood) {
        if ((int32_t)(millis() - s_pendingDeadline) >= 0) {
          LOG_ERROR(TAG, "verify window expired — rolling back");
          esp_ota_mark_app_invalid_rollback_and_reboot();
          ESP.restart();  // belt-and-braces
          break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
      }
      vTaskDelete(nullptr);
    },
    "ota_verify", 3072, nullptr, 1, nullptr);
}

void markBootGood() {
  if (s_bootGood) return;
  s_bootGood = true;
  if (s_pendingPresent) {
    removePendingVerify();
    s_pendingPresent = false;
    LOG_INFO(TAG, "boot verified — pending-verify cleared");
  }
  s_rollbackArmed = false;
  // Optionally mark valid: this lets esp_ota know we're committed.
  esp_ota_mark_app_valid_cancel_rollback();
}

}  // namespace otaservice
