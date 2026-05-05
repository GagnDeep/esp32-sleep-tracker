# Wiring

All assignments live in [`firmware/include/pins.h`](../firmware/include/pins.h).
Edit there if your board differs — every other layer reads the same constants.

## Pin map (defaults)

| Module | Pin | Notes |
|---|---|---|
| MAX30102 SDA | GPIO 21 | shared I²C bus |
| MAX30102 SCL | GPIO 22 | shared I²C bus |
| MAX30102 INT | GPIO 19 | shares with SD MISO; safe because we poll the FIFO |
| MPU6050 SDA  | GPIO 21 | same I²C bus as MAX |
| MPU6050 SCL  | GPIO 22 | same I²C bus as MAX |
| MPU6050 INT  | GPIO 18 | shares with SD SCK; we poll instead — see `MPU_USE_INT` |
| SD CS        | GPIO 5  |  |
| SD MOSI      | GPIO 23 |  |
| SD MISO      | GPIO 19 |  |
| SD SCK       | GPIO 18 |  |
| Buzzer       | GPIO 25 | LEDC PWM channel 0 |
| Status LED   | GPIO 2  | onboard LED on most ESP32 dev boards |
| Button       | GPIO 0  | optional, BOOT pin, active LOW |

## Diagram (ascii)

```
                         ┌─────────────┐
                         │  ESP32      │
        ┌──────┐ SDA ────┤21           │
        │ MAX30102 SCL ──┤22           │
        │      │ INT ────┤19           │
        └──────┘         │             │
        ┌──────┐ SDA ────┤21 (shared)  │
        │ MPU  │ SCL ────┤22 (shared)  │
        │ 6050 │ INT ────┤18 (polled)  │
        └──────┘         │             │
        ┌──────┐ CS  ────┤5            │
        │ µSD  │ MOSI ───┤23           │
        │      │ MISO ───┤19           │
        │      │ SCK ────┤18           │
        └──────┘         │             │
        🔊  Buzzer ───── 25            │
        💡  Status ───── 2 (onboard)   │
                         └─────────────┘
```

## Power

3.3V from the dev board's regulator powers all sensors. Provide a 5V
USB supply with at least 500 mA headroom — the MAX30102 can spike to
~50 mA during LED bursts.

## Photos placeholder

> _Add wiring photos here once you have a built unit. Diagrams + photos
> beat any text description._
