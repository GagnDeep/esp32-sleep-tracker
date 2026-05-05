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

## OTA workflow (firmware ≥ 0.2.0)

The over-the-air path is hardened against bricks and bad uploads:

### MD5 header

Every OTA upload must include an `X-MD5: <hex>` header carrying the
MD5 of the binary. The firmware calls `Update.setMD5(expected)` and
rejects the write if the running hash diverges. The SPA computes this
in-browser before posting; if you script the upload by hand, do the
same:

```bash
MD5=$(md5sum .pio/build/esp32dev/firmware.bin | awk '{print $1}')
curl -X POST http://sleep-tracker.local/api/ota \
  -H "X-MD5: $MD5" \
  -H "X-Pin: 1234" \
  --data-binary @.pio/build/esp32dev/firmware.bin
```

### 30-second pending-verify rollback

After a successful flash the new partition boots in **pending verify**
state. The firmware starts a 30-second timer; if no `/api/auth/check`
or `/api/status` request lands inside that window it calls
`esp_ota_mark_app_invalid_rollback_and_reboot()` and reverts to the
previous partition. The SPA's OTA progress dialog hits
`/api/auth/check` automatically on completion, so a successful upload
through the UI confirms the partition implicitly.

If you script OTA, hit `/api/auth/check` (or any GET) within 30 s
after the device reboots, otherwise the rollback fires.

### Manual rollback

Settings → Firmware update → "Roll back to previous" calls
`POST /api/ota/rollback`. This invokes
`esp_ota_mark_app_invalid_rollback_and_reboot()` on demand — useful
when a partition is verified-good but the user wants to revert
anyway.

```bash
curl -X POST http://sleep-tracker.local/api/ota/rollback -H "X-Pin: 1234"
```

## PIN auth

When a 4-digit PIN is set in Settings, every mutating endpoint
(`POST` / `PUT` / `PATCH` / `DELETE` / OTA) requires header
`X-Pin: <pin>`. The compare is constant-time. `GET /api/status` and
the read-only session endpoints stay open so first-time UX still
works on a fresh-flashed device. Setting the PIN to an empty string
disables auth entirely.

The SPA stores the PIN in `localStorage` under `auth.pin` and injects
the header from `web/src/lib/auth.ts`. To clear a forgotten PIN, hold
the BOOT button for 10 s on power-up to factory-reset, or delete
`/settings.json` over USB (LittleFS upload).
