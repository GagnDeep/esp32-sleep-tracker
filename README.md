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
- [x] HRV coherence (HeartMath-style) with live score / level / breathing rate

## HRV Coherence

The firmware ships a HeartMath-style **HRV coherence** pipeline that
runs alongside the existing HR / SpO₂ / staging path. It measures how
sinusoidal the IBI (inter-beat-interval) series is in the 0.04–0.26 Hz
band — the band where slow-paced breathing entrains heart rate — and
exposes:

- a **coherence ratio** = peak-band-power / (broadband-power − peak-band-power)
- a **0–16 score** (saturating at ratio = 4)
- a **Low / Med / High** classification (HeartMath thresholds: Low <0.5, Med 0.5–2.5, High >2.5)
- a cumulative **achievement** counter that advances only while in Med or High
- the **dominant frequency** (Hz) inside the band — multiply by 60 for breaths/min

The Live tab renders a card with the score, level, breathing rate, and
a 60 s ratio sparkline. Frames are pushed every 5 s.

### Wire format

WebSocket frame, 192-byte buffer:

```json
{"type":"coherence","ratio":1.42,"score":11,"level":2,"ach":47,"f0":0.10,"sec":1834}
```

`/api/status` includes a matching `coherence` block (plus an `enabled`
flag); `/api/debug/coherence` mirrors the shape of `/api/debug/hr` and
adds `peak_power`, `total_power`, IBI filter counters, and the most
recent 8 IBIs feeding the spline.

### Configuration

All knobs live in `firmware/include/config.h` under the
`Coherence DSP` block — window size, FFT size, peak / broadband
bands, classification thresholds, IBI rejection percentage. The
`COHERENCE_ENABLED` constant gates the FreeRTOS task.

### Test mode (developers)

Build with `-DCOHERENCE_TEST_MODE=1` to compile in three synthetic IBI
generators. Select via `settings.coherence_test_signal` (persisted
to NVS, applied at boot):

| Setting | Signal | Expected outcome |
|---|---|---|
| `0` | Real sensor input | normal |
| `1` | 0.10 Hz sinusoid (±100 ms) | ratio > 5, score = 16, level = High |
| `2` | White noise (±50 ms) | ratio < 0.3, score = 0, level = Low |
| `3` | 0.25 Hz sinusoid (±100 ms) | clean peak at 0.25 Hz, dominantHz is the diagnostic |

Synthetic mode bypasses `IbiQualityFilter` so test B's white noise
isn't half-rejected, and short-circuits real beats from the sensor so
the test signal owns the pipeline.

### Documented deviations from the published HeartMath spec

- **IBI source:** the spec describes a fresh PPG → 0.5–8 Hz BPF →
  slope-sum peak detector. We reuse the existing
  `HeartRateEstimator::popBeatIntervalMs` IBI stream because it's
  already millisecond-precise and well tuned. The 400 Hz raw FIFO drain
  (stage 9) is wired but inert — foundation for a future slope-sum
  detector if HR detection is ever swapped.
- **Transport:** the published spec prefers BLE GATT / MQTT / Serial-JSON.
  We reuse the existing WebSocket + REST stack. No new BLE service.
- **Sensor rate:** `MAX30102_SAMPLE_HZ` is 400 Hz with `SENSOR_DECIMATION=4`,
  so HR/SpO₂ still see an effective 100 Hz Reading stream.

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
