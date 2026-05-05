# Troubleshooting

When something doesn't behave the way you expect, this is the first
place to check. Symptoms here are the ones that surface most often
on real hardware.

## WS drop counter (`ws_drops`)

Surfaced subtly in the SPA's nav bar (a small dot next to the connection
indicator) and in `/api/status` as `ws_drops`. It increments whenever
`WsBroadcaster` decides the in-flight queue for a WebSocket client is
backlogged and drops the next sample frame to keep the rest of the
fleet flowing.

What triggers it:

- A laggy phone or a tab the OS has throttled (battery saver, locked
  screen, sleeping background tab).
- A flaky WiFi link with high retransmits — the TCP write queue fills
  up.
- More than ~6 simultaneous WS clients on a busy network.

How to read it:

- `0` is normal. The device drops nothing while clients keep up.
- A handful per minute, only on one client: that client is the
  bottleneck (close the tab, or switch from cellular to WiFi).
- Climbing fast across all clients: the radio environment is the
  problem — move the device closer to the AP, or check `wifi_rssi`
  in `/api/status`.

The counter is monotonic since boot. To reset, reboot the device.

## Task watchdog (10 s reset)

Firmware ≥ 0.2.0 enables the ESP32 Task WDT with a 10-second
timeout. Each long-running task (sensor poll, sample pipeline,
WS broadcaster) subscribes and kicks the dog from its inner loop.

If a task fails to kick within 10 s the chip resets and the boot log
will show:

```
E (XXXX) task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:
E (XXXX) task_wdt:  - SensorTask
```

Common causes:

- I²C bus jam — usually a missing or weak SDA/SCL pull-up, or a
  shared-pin conflict (see `docs/wiring.md`).
- A sensor driver call that internally `delay()`s longer than 10 s
  while the bus is contested.
- The `Update.write()` callback during OTA stalling on a slow
  client — the OTA path explicitly resets the WDT but a partial
  write that hangs on the network buffer can still trip it.

If you can reproduce it, attach the serial log starting 30 s before
the reset to any bug report.

## Session anchor file (`/sessions/<id>.start`) recovery

When a session opens, the firmware writes a small two-field anchor
file to `/sessions/<id>.start` (`<epoch_seconds> <monotonic_ms>`).
The anchor is what the recovery path uses to reconstruct the correct
UTC start time when a session crashes mid-recording — the
in-RAM session header isn't flushed until clean finalize.

What you'll see after a crash:

1. On reboot, `SessionStore::finalizeOrphans()` finds a `.bin` and
   `.start` file with no `.json` sibling.
2. It synthesises a sidecar with `crashed: true`, copies the anchor's
   epoch into `started_at_unix`, infers `ended_at_unix` from the last
   valid sample's `t_ms`, and writes `/sessions/<id>.json`.
3. The orphaned `.start` file is removed.

If your History page shows a session marked "crashed" with a
plausible start time, the anchor recovery worked. If the start time
is garbage (e.g. epoch 0), it means the device booted before NTP
synced last time — there's nothing to recover from. Delete the
session and move on.

To inspect manually:

```bash
# pull the anchor file off the device while it's recording
curl -H "X-Pin: 1234" http://sleep-tracker.local/api/fs/sessions/2026-05-06T03-12-44Z.start
```

## SD-eject behaviour (LittleFS-only fallback)

The device records simultaneously to the SD card (long-term archive)
and LittleFS (short-term, ~1 night cap). If the SD card is removed
or fails:

- `/api/status` reports `sd_mounted: false` and `sd_healthy: false`.
- The SPA shows a yellow banner: *"SD unavailable — recording to
  internal flash only"*.
- Recording **continues** to LittleFS; nothing is lost in the
  current session.
- The retention rotation (which normally only trims the SD copy)
  starts trimming the oldest LittleFS pair when free space drops
  below 64 KB.
- Reinserting the card on the same boot does **not** auto-remount —
  reboot the device to pick the SD back up.

If `sd_healthy` flips to `false` while the card is still inserted,
the controller saw a write error. Common causes: a worn-out card, a
loose CS line, or 5 V on the SPI lines (SD modules expect 3.3 V
logic). Replace the card and retry; if the same error recurs, audit
the wiring against `docs/wiring.md`.

## Resetting the device

A few escalating options when the unit is misbehaving:

1. **Soft reload** — pull power, wait 5 s, plug it back. Clears
   transient state; sessions and settings persist.
2. **Forget WiFi** — Settings → Network → "Forget WiFi" calls
   `POST /api/wifi/reset`. Device reboots into AP-mode setup.
3. **Clear PIN (locked out)** — Hold the BOOT button (GPIO 0) for
   10 s on power-up. The bootloader-side helper clears
   `settings.pin` and writes a fresh `settings.json`. Other settings
   are kept.
4. **Full factory reset over USB**:
   ```bash
   pio run -t erase     # wipe the entire flash
   pio run -t upload    # re-flash firmware
   pio run -t uploadfs  # re-flash SPA bundle
   ```
   This is the nuclear option — every session, setting, and the
   WiFi credential are lost.
5. **Manual settings wipe** — connect over USB, mount LittleFS with
   `pio run -t downloadfs`, delete `/settings.json` and
   `/settings.json.bak`, re-upload with `pio run -t uploadfs`. The
   firmware boots with stock defaults next time.

## "I forgot my PIN"

See option 3 above. There's no recovery path that preserves the
existing PIN — by design, since the PIN gates the API used for OTA
and session deletion.

## Sleep score never appears

The score requires `baseline_nights >= 3` of usable data so the
estimator has something to compare against. Check
`/api/status.calibration_nights_done`. The Settings page shows a
calibration progress bar.
