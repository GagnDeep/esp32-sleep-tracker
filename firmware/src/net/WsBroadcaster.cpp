#include "WsBroadcaster.h"
#include "../app/SessionManager.h"
#include "../util/Log.h"
#include <ArduinoJson.h>

namespace {
constexpr const char* TAG = "ws";
AsyncWebSocket* s_ws = nullptr;

void onEvent(AsyncWebSocket* /*ws*/, AsyncWebSocketClient* client,
             AwsEventType type, void* /*arg*/, uint8_t* /*data*/, size_t /*len*/) {
  switch (type) {
    case WS_EVT_CONNECT:
      LOG_INFO(TAG, "client #%u connected", client->id());
      break;
    case WS_EVT_DISCONNECT:
      LOG_INFO(TAG, "client #%u disconnected", client->id());
      break;
    default: break;
  }
}
}  // namespace

namespace ws_broadcaster {

void attach(AsyncWebSocket* ws) {
  s_ws = ws;
  ws->onEvent(onEvent);
}

void broadcastSample(const Sample& s) {
  if (!s_ws || s_ws->count() == 0) return;
  s_ws->cleanupClients();
  // Compact JSON keeps the per-client buffer ≤ ~120 bytes.
  char buf[160];
  const int n = snprintf(buf, sizeof(buf),
    "{\"type\":\"sample\",\"t\":%u,\"hr\":%u,\"spo2\":%u,\"act\":%u,\"stage\":%u,\"flags\":%u}",
    (unsigned)s.t_ms, s.hr_bpm, s.spo2_pct, s.activity, s.stage, s.flags);
  if (n > 0) s_ws->textAll(buf, (size_t)n);
}

void broadcastStage(uint8_t stage) {
  if (!s_ws || s_ws->count() == 0) return;
  char buf[64];
  const int n = snprintf(buf, sizeof(buf),
    "{\"type\":\"stage\",\"value\":%u}", stage);
  if (n > 0) s_ws->textAll(buf, (size_t)n);
}

void broadcastAlarm(const char* kind) {
  if (!s_ws || s_ws->count() == 0 || !kind) return;
  String body = String("{\"type\":\"alarm\",\"kind\":\"") + kind + "\"}";
  s_ws->textAll(body);
}

void broadcastStatus(const char* status) {
  if (!s_ws || s_ws->count() == 0 || !status) return;
  String body = String("{\"type\":\"status\",\"value\":\"") + status + "\"}";
  s_ws->textAll(body);
}

}  // namespace ws_broadcaster
