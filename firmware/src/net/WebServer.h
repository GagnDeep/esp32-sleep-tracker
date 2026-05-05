#pragma once
#include <ESPAsyncWebServer.h>

// Holds the AsyncWebServer + AsyncWebSocket. Calls into ApiHandlers
// for REST routes and WsBroadcaster for the live channel.

namespace web {

void begin();
AsyncWebServer&    server();
AsyncWebSocket&    ws();

}  // namespace web
