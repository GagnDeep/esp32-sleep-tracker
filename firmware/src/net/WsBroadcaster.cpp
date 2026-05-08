#include "WsBroadcaster.h"
#include "../app/SessionManager.h"
#include "../util/Log.h"
#include "config.h"
#include <ArduinoJson.h>
#include <atomic>

namespace {
constexpr const char* TAG = "ws";
AsyncWebSocket* s_ws = nullptr;
std::atomic<uint32_t> s_drops{0};

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

// Per-client back-pressure check. A slow or stalled client with a full
// TX queue would otherwise leak heap as new frames pile up.
void sendOrDrop(const char* body, size_t n) {
  if (!s_ws) return;
  // ESPAsyncWebServer's getClients() returns a list of clients by
  // value (std::list<AsyncWebSocketClient>), not pointers — iterate
  // by reference.
  for (auto& client : s_ws->getClients()) {
    if (client.status() != WS_CONNECTED) continue;
    if (!client.canSend() ||
        client.queueLen() >= cfg::WS_QUEUE_DROP_AT) {
      s_drops.fetch_add(1, std::memory_order_relaxed);
      continue;
    }
    client.text(body, n);
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
  if (n > 0) sendOrDrop(buf, (size_t)n);
}

void broadcastCoherence(const coherence::Snapshot& s) {
  if (!s_ws || s_ws->count() == 0) return;
  // 192-byte buffer per the plan. Real frames land at ~110 bytes.
  char buf[192];
  const int n = snprintf(buf, sizeof(buf),
    "{\"type\":\"coherence\",\"ratio\":%.3f,\"score\":%u,\"level\":%u,"
    "\"ach\":%u,\"f0\":%.3f,\"sec\":%u}",
    s.ratio, (unsigned)s.score, (unsigned)s.level,
    (unsigned)s.achievement, s.dominantHz, (unsigned)s.sessionSec);
  if (n > 0) sendOrDrop(buf, (size_t)n);
}

void broadcastStage(uint8_t stage) {
  if (!s_ws || s_ws->count() == 0) return;
  char buf[64];
  const int n = snprintf(buf, sizeof(buf),
    "{\"type\":\"stage\",\"value\":%u}", stage);
  if (n > 0) sendOrDrop(buf, (size_t)n);
}

void broadcastAlarm(const char* kind) {
  if (!s_ws || s_ws->count() == 0 || !kind) return;
  String body = String("{\"type\":\"alarm\",\"kind\":\"") + kind + "\"}";
  sendOrDrop(body.c_str(), body.length());
}

void broadcastStatus(const char* status) {
  if (!s_ws || s_ws->count() == 0 || !status) return;
  String body = String("{\"type\":\"status\",\"value\":\"") + status + "\"}";
  sendOrDrop(body.c_str(), body.length());
}

void broadcastRaw(const char* json) {
  if (!s_ws || !json) return;
  if (s_ws->count() == 0) return;
  sendOrDrop(json, strlen(json));
}

uint32_t dropCount() {
  return s_drops.load(std::memory_order_relaxed);
}

}  // namespace ws_broadcaster
