#include "WebServer.h"
#include "ApiHandlers.h"
#include "WsBroadcaster.h"
#include "OtaService.h"
#include "../util/Log.h"
#include <LittleFS.h>

namespace {
constexpr const char* TAG = "http";
AsyncWebServer s_server(80);
AsyncWebSocket s_ws("/ws");
}  // namespace

namespace web {

AsyncWebServer& server() { return s_server; }
AsyncWebSocket& ws()     { return s_ws; }

void begin() {
  ws_broadcaster::attach(&s_ws);
  s_server.addHandler(&s_ws);

  api::registerRoutes(s_server);
  ota::registerRoutes(s_server);

  // SPA static files. Vite + build.mjs emit pre-gzipped assets to
  // firmware/data/. ESPAsyncWebServer's static handler serves from
  // LittleFS and respects Accept-Encoding: gzip headers when the .gz
  // companion exists.
  s_server.serveStatic("/", LittleFS, "/")
          .setDefaultFile("index.html")
          .setCacheControl("public, max-age=86400");

  s_server.onNotFound([](AsyncWebServerRequest* req) {
    // SPA fallback for client-side routing.
    if (req->method() == HTTP_GET && !req->url().startsWith("/api/")) {
      req->send(LittleFS, "/index.html", "text/html");
      return;
    }
    req->send(404, "application/json", "{\"error\":\"not_found\"}");
  });

  s_server.begin();
  LOG_INFO(TAG, "listening on :80");
}

}  // namespace web
