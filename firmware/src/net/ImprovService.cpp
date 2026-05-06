#include "ImprovService.h"
#include "../util/Log.h"
#include "config.h"
#include <Arduino.h>
#include <WiFi.h>

// Improv-Serial protocol implementation. Spec:
//   https://www.improv-wifi.com/serial/
//
// Frame:  "IMPROV" + ver(1) + type(1) + len(1) + payload(len) + chk(1)
//   ver  = 1
//   type = 0x01 CURRENT_STATE, 0x02 ERROR_STATE, 0x03 RPC, 0x04 RPC_RESULT
//   chk  = (sum of all preceding bytes) & 0xFF
//
// State values: READY=0x02, PROVISIONING=0x03, PROVISIONED=0x04
// RPC cmds:     WIFI_SETTINGS=0x01, IDENTIFY=0x02, GET_DEVICE_INFO=0x03,
//               SCAN_WIFI=0x04

namespace {
constexpr const char* TAG = "improv";

constexpr uint8_t TYPE_CURRENT_STATE = 0x01;
constexpr uint8_t TYPE_ERROR_STATE   = 0x02;
constexpr uint8_t TYPE_RPC           = 0x03;
constexpr uint8_t TYPE_RPC_RESULT    = 0x04;

constexpr uint8_t STATE_READY        = 0x02;
constexpr uint8_t STATE_PROVISIONING = 0x03;
constexpr uint8_t STATE_PROVISIONED  = 0x04;

constexpr uint8_t ERR_NONE                  = 0x00;
constexpr uint8_t ERR_INVALID_RPC           = 0x01;
constexpr uint8_t ERR_UNKNOWN_RPC           = 0x02;
constexpr uint8_t ERR_UNABLE_TO_CONNECT     = 0x03;
constexpr uint8_t ERR_NOT_AUTHORIZED        = 0x04;
constexpr uint8_t ERR_UNKNOWN               = 0xFF;

constexpr uint8_t RPC_WIFI_SETTINGS    = 0x01;
constexpr uint8_t RPC_IDENTIFY         = 0x02;
constexpr uint8_t RPC_GET_DEVICE_INFO  = 0x03;
constexpr uint8_t RPC_SCAN_WIFI        = 0x04;

constexpr const char* MAGIC = "IMPROV";
constexpr size_t MAGIC_LEN  = 6;
constexpr size_t MAX_PAYLOAD = 192;

const char* s_deviceName = "Sleep Tracker";
const char* s_fwVersion  = "0.2.0-dev";
bool s_provisioned = false;

uint8_t s_rxBuf[MAGIC_LEN + 4 + MAX_PAYLOAD];
size_t  s_rxLen = 0;

void sendFrame(uint8_t type, const uint8_t* payload, uint8_t len) {
  uint8_t buf[MAGIC_LEN + 4 + 256];
  size_t i = 0;
  memcpy(buf + i, MAGIC, MAGIC_LEN); i += MAGIC_LEN;
  buf[i++] = 1;     // version
  buf[i++] = type;
  buf[i++] = len;
  if (len && payload) { memcpy(buf + i, payload, len); i += len; }
  uint8_t chk = 0;
  for (size_t j = 0; j < i; ++j) chk += buf[j];
  buf[i++] = chk;
  Serial.write(buf, i);
  Serial.flush();
}

void sendCurrentState(uint8_t state) {
  sendFrame(TYPE_CURRENT_STATE, &state, 1);
}

void sendErrorState(uint8_t err) {
  sendFrame(TYPE_ERROR_STATE, &err, 1);
}

// Encode a list of length-prefixed strings as the RPC_RESULT body.
void sendRpcResult(uint8_t command, const char* const* strs, size_t n) {
  uint8_t body[MAX_PAYLOAD];
  size_t i = 0;
  body[i++] = command;
  size_t lenSlot = i++;  // payload length placeholder
  for (size_t k = 0; k < n; ++k) {
    const size_t sl = strlen(strs[k]);
    if (i + 1 + sl > sizeof(body)) return;  // truncate silently
    body[i++] = (uint8_t)sl;
    memcpy(body + i, strs[k], sl); i += sl;
  }
  body[lenSlot] = (uint8_t)(i - lenSlot - 1);
  sendFrame(TYPE_RPC_RESULT, body, (uint8_t)i);
}

bool tryConnect(const char* ssid, const char* pass, uint32_t timeoutMs) {
  LOG_INFO(TAG, "attempting connect ssid=%s", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  const uint32_t deadline = millis() + timeoutMs;
  while (millis() < deadline) {
    if (WiFi.status() == WL_CONNECTED) return true;
    delay(100);
  }
  return false;
}

void handleRpc(const uint8_t* p, uint8_t len) {
  if (len < 2) { sendErrorState(ERR_INVALID_RPC); return; }
  const uint8_t cmd     = p[0];
  const uint8_t bodyLen = p[1];
  if ((size_t)2 + bodyLen > (size_t)len) {
    sendErrorState(ERR_INVALID_RPC);
    return;
  }
  const uint8_t* body = p + 2;

  switch (cmd) {
    case RPC_GET_DEVICE_INFO: {
      const char* strs[] = {
        s_deviceName,         // firmware name
        s_fwVersion,          // firmware version
        "ESP32-C3",           // hardware chip family
        s_deviceName,         // device name
      };
      sendRpcResult(cmd, strs, 4);
      sendCurrentState(s_provisioned ? STATE_PROVISIONED : STATE_READY);
      break;
    }
    case RPC_IDENTIFY: {
      // Blink onboard LED twice (~600 ms total).
      pinMode(8, OUTPUT);
      for (int i = 0; i < 2; ++i) {
        digitalWrite(8, HIGH); delay(120);
        digitalWrite(8, LOW);  delay(180);
      }
      sendRpcResult(cmd, nullptr, 0);
      break;
    }
    case RPC_WIFI_SETTINGS: {
      // body = ssidLen(1) + ssid + passLen(1) + pass
      if (bodyLen < 2) { sendErrorState(ERR_INVALID_RPC); return; }
      uint8_t off = 0;
      const uint8_t ssidLen = body[off++];
      if ((size_t)off + ssidLen + 1 > bodyLen) {
        sendErrorState(ERR_INVALID_RPC); return;
      }
      char ssid[33] = {0};
      const uint8_t cps = ssidLen < 32 ? ssidLen : 32;
      memcpy(ssid, body + off, cps); off += ssidLen;
      const uint8_t passLen = body[off++];
      if ((size_t)off + passLen > bodyLen) {
        sendErrorState(ERR_INVALID_RPC); return;
      }
      char pass[65] = {0};
      const uint8_t cpp = passLen < 64 ? passLen : 64;
      memcpy(pass, body + off, cpp);

      sendCurrentState(STATE_PROVISIONING);
      if (tryConnect(ssid, pass, 30000)) {
        s_provisioned = true;
        sendCurrentState(STATE_PROVISIONED);
        // RPC result body: list of redirect URLs the installer page
        // can navigate to.
        String url = String("http://") + WiFi.localIP().toString() + "/";
        const char* urls[] = { url.c_str() };
        sendRpcResult(cmd, urls, 1);
        LOG_INFO(TAG, "provisioned at %s — rebooting into normal boot",
                 url.c_str());
        // Creds are now saved in NVS by the WiFi driver. Reboot so the
        // normal boot path picks them up cleanly (avoids fighting the
        // WiFiManager portal loop that may also be running).
        delay(500);
        ESP.restart();
      } else {
        sendErrorState(ERR_UNABLE_TO_CONNECT);
        sendCurrentState(STATE_READY);
      }
      break;
    }
    case RPC_SCAN_WIFI: {
      const int n = WiFi.scanNetworks(false, true);
      for (int i = 0; i < n; ++i) {
        char rssiStr[8]; snprintf(rssiStr, sizeof(rssiStr), "%d", WiFi.RSSI(i));
        const bool secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        const char* strs[] = {
          WiFi.SSID(i).c_str(),
          rssiStr,
          secure ? "YES" : "NO",
        };
        sendRpcResult(cmd, strs, 3);
      }
      // Empty result terminates the scan (RPC body length 0).
      sendRpcResult(cmd, nullptr, 0);
      WiFi.scanDelete();
      break;
    }
    default:
      sendErrorState(ERR_UNKNOWN_RPC);
      break;
  }
}

void parseFrame() {
  // Expect at minimum MAGIC+ver+type+len+chk = 10 bytes.
  if (s_rxLen < MAGIC_LEN + 4) return;
  if (memcmp(s_rxBuf, MAGIC, MAGIC_LEN) != 0) {
    // Drop one byte and let parser try again on next sync.
    memmove(s_rxBuf, s_rxBuf + 1, --s_rxLen);
    return;
  }
  const uint8_t ver  = s_rxBuf[MAGIC_LEN + 0];
  const uint8_t type = s_rxBuf[MAGIC_LEN + 1];
  const uint8_t len  = s_rxBuf[MAGIC_LEN + 2];
  if (ver != 1 || len > MAX_PAYLOAD) {
    s_rxLen = 0;
    return;
  }
  const size_t total = MAGIC_LEN + 3 + len + 1;
  if (s_rxLen < total) return;  // need more bytes
  uint8_t chk = 0;
  for (size_t j = 0; j < total - 1; ++j) chk += s_rxBuf[j];
  if (chk != s_rxBuf[total - 1]) {
    s_rxLen = 0;
    sendErrorState(ERR_UNKNOWN);
    return;
  }
  if (type == TYPE_RPC) {
    handleRpc(s_rxBuf + MAGIC_LEN + 3, len);
  }
  // Shift any trailing bytes (shouldn't happen but be safe).
  if (s_rxLen > total) {
    memmove(s_rxBuf, s_rxBuf + total, s_rxLen - total);
    s_rxLen -= total;
  } else {
    s_rxLen = 0;
  }
}
}  // namespace

namespace improv {

void begin(const char* deviceName, const char* firmwareVersion) {
  s_deviceName = deviceName;
  s_fwVersion  = firmwareVersion;
  // Announce initial state so a connected installer page can render.
  sendCurrentState(STATE_READY);
  LOG_INFO(TAG, "ready");
}

void tick() {
  if (s_provisioned) return;
  while (Serial.available() > 0 && s_rxLen < sizeof(s_rxBuf)) {
    s_rxBuf[s_rxLen++] = (uint8_t)Serial.read();
  }
  if (s_rxLen >= MAGIC_LEN + 4) parseFrame();
}

bool isProvisioned() {
  return s_provisioned;
}

}  // namespace improv
