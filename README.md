# ESP32 Sleep Tracker

A self-contained overnight heart rate, SpO2, and movement tracker built on an ESP32. The device records biometric data while you sleep and serves a polished single-page dashboard directly from itself over your local WiFi — no cloud, no account, no app. Open `http://sleep-tracker.local` from any phone or laptop on the same network and you get a modern responsive SPA with live waveforms, multi-night history, sleep-stage timeline, smart-alarm scheduling, and CSV export.

> **Not a medical device.** Heuristic sleep staging is for personal exploration only. Do not use this to diagnose or treat any condition.

## ⚡ One-click installer

**[https://gagndeep.github.io/esp32-sleep-tracker/installer/](https://gagndeep.github.io/esp32-sleep-tracker/installer/)**

Plug your ESP32-C3 into a desktop running Chrome / Edge / Opera, click the button, and you're flashed and on WiFi in under a minute. Uses [ESP Web Tools](https://esphome.github.io/esp-web-tools/) + [Improv-Serial](https://www.improv-wifi.com/serial/) — no IDE, no terminal.

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

## Features

- [x] Live HR / SpO₂ / activity stream over WebSockets (1 Hz)
- [x] Heuristic sleep staging (awake / light / deep)
- [x] Smart-alarm window with day-mask + volume ramp + breathing exercise (4-7-8)
- [x] Multi-night history with sortable / searchable list
- [x] 28-day Trends view with 7-day rolling average
- [x] Compare two sessions side-by-side
- [x] Session tags (sick / workout / alcohol / travel / caffeine / medication) + free-form notes
- [x] CSV + raw-binary export per session
- [x] Dark / light theme switcher (persists in `localStorage`)
- [x] Timezone-aware rendering (preset list + custom IANA id)
- [x] Optional 4-digit PIN auth for mutating endpoints
- [x] OTA firmware update with MD5 verification + 30 s pending-verify rollback
- [x] Manual `POST /api/ota/rollback` to revert to the previous partition
- [x] Crash-recovery via `<id>.start` anchor file (correct UTC start after power loss)
- [x] Sidecar schema v2 (`tags`, `notes`, `started_at_unix`, `tz_offset_min`, `hrv_rmssd`, ...)
- [x] WiFi scan with signal bars during setup
- [x] Task watchdog (10 s) on sensor + pipeline tasks
- [x] WebSocket back-pressure with per-client drop counter (`ws_drops` in `/api/status`)
- [x] Atomic `settings.json` save with CRC32 + `.bak` fallback

## Screenshots

> _Dark / light mode screenshots:_
> ![Dark mode](docs/screenshots/dark.png)
> ![Light mode](docs/screenshots/light.png)
>
> _(Drop the renders into `docs/screenshots/` once you have a built
> unit; the placeholders are intentionally not committed.)_

## Documentation

- [`docs/wiring.md`](docs/wiring.md) — pin map, ASCII diagram, watchdog + PIN notes.
- [`docs/flashing.md`](docs/flashing.md) — first flash, OTA + rollback, PIN auth.
- [`docs/data-format.md`](docs/data-format.md) — `Sample` layout, schema v2 sidecar JSON, anchor file, settings CRC.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — `ws_drops`, watchdog, anchor recovery, SD eject behaviour, factory reset.
- [`tools/analyze.py`](tools/analyze.py) — plot a CSV export with matplotlib (renders tags in the title).

## License

Personal-use project. No warranty, no medical claims. Add a `LICENSE`
of your choice (MIT is a good default for hobbyist hardware projects).
