#include "OtaService.h"
#include "../app/SessionManager.h"
#include "../util/Log.h"
#include <Update.h>

namespace {
constexpr const char* TAG = "ota";
}

namespace ota {

void registerRoutes(AsyncWebServer& s) {
  s.on(
    "/api/ota", HTTP_POST,
    // Upload-finished handler.
    [](AsyncWebServerRequest* req) {
      const bool ok = !Update.hasError();
      AsyncWebServerResponse* res = req->beginResponse(
        ok ? 200 : 500, "application/json",
        ok ? "{\"ok\":true,\"rebooting\":true}"
           : "{\"ok\":false,\"error\":\"update_failed\"}");
      res->addHeader("Connection", "close");
      req->send(res);
      if (ok) {
        delay(200);
        ESP.restart();
      }
    },
    // Multipart upload handler.
    [](AsyncWebServerRequest* req, String /*filename*/, size_t index,
       uint8_t* data, size_t len, bool finalChunk) {
      if (index == 0) {
        if (sessionManager.active()) {
          LOG_WARN(TAG, "OTA refused — session active");
          req->send(409, "application/json",
                    "{\"error\":\"session_active\"}");
          return;
        }
        LOG_INFO(TAG, "OTA begin");
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
          Update.printError(Serial);
        }
      }
      if (Update.write(data, len) != len) {
        Update.printError(Serial);
      }
      if (finalChunk) {
        if (Update.end(true)) {
          LOG_INFO(TAG, "OTA success (%u bytes)", (unsigned)(index + len));
        } else {
          Update.printError(Serial);
        }
      }
    });
  LOG_INFO(TAG, "registered");
}

}  // namespace ota
