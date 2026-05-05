#pragma once
#include <ESPAsyncWebServer.h>
#include <stdint.h>
#include "../storage/Sample.h"

namespace ws_broadcaster {

void attach(AsyncWebSocket* ws);

// Hot-path: called every 1Hz from the pipeline. Cheap if no clients.
void broadcastSample(const Sample& s);

// Manual broadcasts (called when state changes happen out of band).
void broadcastStage(uint8_t stage);
void broadcastAlarm(const char* kind);
void broadcastStatus(const char* status);

// Broadcast an arbitrary, already-serialised JSON message (e.g. OTA
// progress events). Caller is responsible for the JSON.
void broadcastRaw(const char* json);

// Cumulative count of messages dropped due to per-client back-pressure
// (slow / disconnected clients with full TX queue). Surfaced in /api/status.
uint32_t dropCount();

}  // namespace ws_broadcaster
