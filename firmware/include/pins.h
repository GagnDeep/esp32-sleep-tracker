#pragma once
#include <stdint.h>

// All GPIO assignments live here. Edit if your board differs.
//
// Two pin maps are provided: classic ESP32 (esp32dev) and ESP32-C3
// (esp32-c3-devkitm-1). The ESP32-C3 has only ~10 usable GPIOs since
// 11–17 are wired to internal flash and 18–19 carry the USB-JTAG
// signals. Pin-collision note (classic ESP32): the MPU6050 INT shares
// a pin with SD SCK, so when SD is enabled (config.h SD_ENABLED=1) the
// MPU is polled instead of using its INT line. See config.h MPU_USE_INT.

namespace pins {

#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(ARDUINO_ESP32C3_DEV) || defined(ARDUINO_ESP32_C3_DEV_KIT_M1)
// ---- ESP32-C3 -----------------------------------------------------
// I2C bus — MAX30102 + MPU6050 share this. GPIO 4/5 are adjacent on
// the DevKitM-1 header and free of strapping/USB conflicts.
constexpr uint8_t I2C_SDA = 4;
constexpr uint8_t I2C_SCL = 5;

// Sensor interrupt lines. We poll on C3 (only 10 GPIOs total), so
// these are placeholders pointing to free pins; safe to leave wired
// or unwired.
constexpr uint8_t MAX30102_INT = 6;
constexpr uint8_t MPU6050_INT  = 7;

// SPI bus for microSD (optional — code handles missing card).
constexpr uint8_t SD_CS   = 10;
constexpr uint8_t SD_MOSI = 0;
constexpr uint8_t SD_MISO = 1;
constexpr uint8_t SD_SCK  = 3;

// Buzzer (LEDC PWM channel set in AlarmController).
constexpr uint8_t BUZZER = 2;

// Onboard LED (GPIO 8 on most C3 dev kits — may be a WS2812 NeoPixel
// rather than a plain LED on some clones, in which case it just stays
// dark; harmless).
constexpr uint8_t STATUS_LED = 8;

// BOOT button on the DevKitM-1 (active LOW with internal pull-up).
constexpr uint8_t BUTTON = 9;

#else
// ---- Classic ESP32 (Xtensa LX6 dev kit) ---------------------------
// I2C bus — MAX30102 + MPU6050 share this.
constexpr uint8_t I2C_SDA = 21;
constexpr uint8_t I2C_SCL = 22;

// Sensor interrupt lines.
constexpr uint8_t MAX30102_INT = 19;  // shares with SD MISO if SD enabled
constexpr uint8_t MPU6050_INT  = 18;  // shares with SD SCK  if SD enabled

// SPI bus for microSD.
constexpr uint8_t SD_CS   = 5;
constexpr uint8_t SD_MOSI = 23;
constexpr uint8_t SD_MISO = 19;
constexpr uint8_t SD_SCK  = 18;

// Buzzer (LEDC PWM channel set in AlarmController).
constexpr uint8_t BUZZER = 25;

// Onboard status LED.
constexpr uint8_t STATUS_LED = 2;

// Optional momentary push button (BOOT pin, active LOW).
constexpr uint8_t BUTTON = 0;

#endif

}  // namespace pins
