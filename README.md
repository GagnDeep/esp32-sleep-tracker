# ESP32 Sleep Tracker

A self-contained overnight heart rate, SpO2, and movement tracker built on an ESP32. The device records biometric data while you sleep and serves a polished single-page dashboard directly from itself over your local WiFi — no cloud, no account, no app. Open `http://sleep-tracker.local` from any phone or laptop on the same network and you get a modern responsive SPA with live waveforms, multi-night history, sleep-stage timeline, smart-alarm scheduling, and CSV export.

> **Not a medical device.** Heuristic sleep staging is for personal exploration only. Do not use this to diagnose or treat any condition.

## Hardware

| Component | Role |
|---|---|
| ESP32-WROOM-32 dev board | MCU + WiFi |
| MAX30102 breakout | Heart rate + SpO2 (I2C) |
| MPU6050 breakout | Movement / accelerometer (I2C) |
| MicroSD SPI module | Long-term archive |
| Active piezo buzzer | Smart alarm + low-SpO2 alert |
| Status LED + optional button | UX |

Wiring details and pin assignments live in [`docs/wiring.md`](docs/wiring.md) and [`firmware/include/pins.h`](firmware/include/pins.h).

## Quickstart

```bash
# 1. Build the web bundle (Node 20+)
cd web && npm install && npm run build

# 2. Build & flash firmware (PlatformIO)
cd ..
pio run -t upload          # firmware
pio run -t uploadfs        # SPA assets to LittleFS

# 3. First boot: phone connects to AP "SleepTracker-XXXX",
#    captive portal opens the Setup wizard, pick your home WiFi.
# 4. Open http://sleep-tracker.local on any device on the LAN.
```

Full flashing & OTA upgrade steps: [`docs/flashing.md`](docs/flashing.md).
Data format for DIY analysis: [`docs/data-format.md`](docs/data-format.md).

## Repo layout

- `firmware/` — PlatformIO project (Arduino-ESP32 framework).
- `web/` — Preact + Tailwind + uPlot SPA. Build emits gzipped assets into `firmware/data/`.
- `docs/` — wiring diagrams, flashing notes, data format reference.
- `tools/analyze.py` — optional offline analysis of CSV exports.

## License

Personal-use project. No warranty. See `LICENSE` if/when added.
