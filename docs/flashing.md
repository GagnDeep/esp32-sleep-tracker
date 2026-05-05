# Flashing & OTA

## One-time setup

1. Install [PlatformIO](https://platformio.org/install/cli) (`pip install -U platformio`).
2. Install Node.js 20+ (for the web bundle).
3. Plug the ESP32 dev board into USB. On macOS the port shows up as
   `/dev/cu.SLAB_USBtoUART` or `/dev/cu.usbserial-XXXX`.

## First flash

```bash
# Build the web bundle (writes gzipped assets to firmware/data/)
cd web && npm install && npm run build && cd ..

# Flash firmware
pio run -t upload

# Upload the SPA bundle to LittleFS
pio run -t uploadfs

# Watch the serial console
pio device monitor
```

You should see `[I][main] ready` after about two seconds.

## First-boot WiFi setup

1. The device starts an open AP `SleepTracker-XXXX` (the suffix is the
   last four hex digits of the MAC).
2. Connect a phone or laptop. The captive portal opens automatically;
   if not, browse to `http://192.168.4.1`.
3. Pick your home network, enter the password, and submit.
4. The device reboots, joins your WiFi, and advertises itself as
   `sleep-tracker.local` over mDNS.
5. Open `http://sleep-tracker.local` and you're in.

## Subsequent updates

### USB

```bash
pio run -t upload      # firmware
pio run -t uploadfs    # SPA assets (only when the bundle changed)
```

### Over the air

Settings → Firmware update → choose `firmware.bin` from
`.pio/build/esp32dev/`. The endpoint refuses while a session is
recording (HTTP 409); stop the session first.

You can also script OTA from the host:

```bash
pio run -t ota --upload-port sleep-tracker.local
```

## Troubleshooting

- **Browser hangs on the captive portal.** Some Android devices
  insist the captive portal terminates with an HTTP 204; just open
  `http://192.168.4.1` manually.
- **`mDNS not found`**: hard-bypass with the IP shown in the serial
  log (`pio device monitor`) until your router refreshes its mDNS
  cache.
- **Free heap drifts down over hours**: file an issue with the
  `/api/status` JSON before and after — useful for repro.
- **`ELF section header not found` during OTA**: re-upload, the
  multipart stream got truncated.
