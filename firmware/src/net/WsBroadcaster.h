#pragma once
#include <ESPAsyncWebServer.h>
#include "../storage/Sample.h"

namespace ws_broadcaster {

void attach(AsyncWebSocket* ws);

// Hot-path: called every 1Hz from the pipeline. Cheap if no clients.
void broadcastSample(const Sample& s);

// Manual broadcasts (called when state changes happen out of band).
void broadcastStage(uint8_t stage);
void broadcastAlarm(const char* kind);
void broadcastStatus(const char* status);

}  // namespace ws_broadcaster
