#pragma once
#include <stdint.h>

// All GPIO assignments live here. Edit if your board differs.
//
// Pin-collision note: the MPU6050 INT (default 18) shares a pin with SD SCK,
// so when SD is enabled (config.h SD_ENABLED=1) the MPU is polled instead of
// using its INT line. See config.h MPU_USE_INT.

namespace pins {

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

}  // namespace pins
