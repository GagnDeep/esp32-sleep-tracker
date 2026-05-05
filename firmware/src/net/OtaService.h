#pragma once
#include <ESPAsyncWebServer.h>

namespace ota {

// Register HTTP routes for OTA upload + rollback. Call after WS attach
// so progress events can be broadcast.
void registerRoutes(AsyncWebServer& s);

}  // namespace ota

namespace otaservice {

// Boot-time hook: if a "/ota/pending_verify" marker exists from a
// previous OTA, start a 30-second one-shot timer; if `markBootGood()`
// is not called before it expires, mark the running partition invalid
// and reboot into the previous slot.
void begin();

// Called from the auth-middleware (or any first valid GET) once the
// new firmware has demonstrated it can serve a request. Removes the
// pending-verify marker so the rollback timer is cancelled.
void markBootGood();

}  // namespace otaservice
