# Data format

Each session is two files on LittleFS (mirrored to SD when present):

```
/sessions/<id>.bin     binary samples, 14 bytes each (1 Hz)
/sessions/<id>.json    sidecar summary + metadata
/sessions/<id>.start   anchor file (only present mid-session — see below)
```

`<id>` is an ISO-8601 UTC timestamp like `2026-05-06T03-12-44Z`
(colons replaced with hyphens for filesystem safety).

## Sample record

Defined in [`firmware/src/storage/Sample.h`](../firmware/src/storage/Sample.h).
Stored little-endian.

| Offset | Size | Field      | Meaning |
|--------|------|------------|---------|
| 0      | 4 B  | `t_ms`     | ms since session start |
| 4      | 2 B  | `hr_bpm`   | beats/minute, `0xFFFF` = invalid |
| 6      | 2 B  | `spo2_x10` | SpO₂ * 10, `0xFFFF` = invalid |
| 8      | 2 B  | `activity` | accelerometer activity index 0..1000 |
| 10     | 1 B  | `stage`    | 0=unknown, 1=awake, 2=light, 3=deep |
| 11     | 1 B  | `flags`    | see flag bits below |
| 12     | 2 B  | `reserved` | future use; treat as 0 |

`flags` bit map:

| Bit | Constant            | Meaning |
|-----|---------------------|---------|
| 0   | `MOTION_ARTIFACT`   | motion blanked the sensor frame |
| 1   | `FINGER_OFF`        | finger lifted from the optical window |
| 2   | `ALARM_FIRED`       | alarm fired during this sample |
| 3   | `INVALID_HR`        | HR sample is unreliable |
| 4   | `INVALID_SPO2`      | SpO₂ sample is unreliable |

## Sidecar JSON (schema v2)

```json
{
  "id": "2026-05-06T03-12-44Z",
  "schema_version": 2,
  "started_at": "2026-05-06T03:12:44Z",
  "ended_at":   "2026-05-06T11:18:02Z",
  "started_at_unix": 1778050364,
  "ended_at_unix":   1778079482,
  "tz_offset_min":   -240,
  "duration_s": 29118,
  "hr_min":  44, "hr_avg": 56, "hr_max": 89,
  "spo2_min_x10": 925, "spo2_avg_x10": 962,
  "hrv_rmssd": 41.2,
  "time_in_stage": [120, 6080, 18800, 4118],
  "sleep_score": 78,
  "crashed": false,
  "firmware_version": "0.2.0-dev",
  "sample_format_version": 1,
  "tags": ["sick", "fever"],
  "notes": "felt warm at midnight"
}
```

`time_in_stage` is `[unknown, awake, light, deep]` in seconds.

`sleep_score` only appears once the user baseline has been calibrated
(after `baseline_nights >= 3`); before that the field is omitted to
avoid implying confidence the device hasn't earned.

### Schema v2 fields

| Field                   | Type             | Notes |
|-------------------------|------------------|-------|
| `schema_version`        | integer          | always `2` from firmware ≥ 0.2.0; readers must default to `1` when absent. |
| `started_at_unix`       | integer (s)      | UTC seconds at session start. Sourced from the `<id>.start` anchor when recovering a crashed session. |
| `ended_at_unix`         | integer (s)      | UTC seconds at clean finalize. Absent on crashed sessions. |
| `tz_offset_min`         | integer          | Snapshot of the device timezone offset in minutes east of UTC at finalize. `-240` = EDT. |
| `hrv_rmssd`             | number (ms)      | Root-mean-square of successive RR-interval differences over the session, in milliseconds. May be absent if too few clean beats. |
| `tags`                  | string array     | Whitelisted: `sick`, `workout`, `alcohol`, `travel`, `caffeine`, `medication`. PATCHable from the SPA. |
| `notes`                 | string           | Free-form, ≤ 1024 chars. PATCHable. |
| `sample_format_version` | integer          | `1` for the 14-byte stride above. Bumped if the binary layout changes. |

Readers should treat all schema-v2 fields as optional so v1 sidecars
written by older firmware still parse cleanly.

### Anchor file `<id>.start`

When a session opens, the firmware writes a small anchor file before
streaming any samples. Its sole purpose is to recover the correct UTC
start timestamp if the device crashes mid-session, since the in-RAM
session header isn't flushed until clean finalize.

Format (single line, ASCII):

```
<epoch_seconds> <monotonic_ms_at_start>
1778050364 12345
```

On clean finalize the file is deleted. On boot, `finalizeOrphans()`
scans `/sessions/` for any `.start` files without a sibling `.json`,
synthesises a sidecar with `crashed: true`, copies the anchor's epoch
into `started_at_unix` / `started_at`, and infers `ended_at_unix` from
the last sample's `t_ms` plus the anchor.

## `settings.json` integrity

The Settings file gains a CRC32 entry to detect torn writes:

```json
{
  "device_name": "sleep-tracker",
  "...": "...",
  "crc32": "0x9af1c2e0"
}
```

On `save()` the firmware writes `settings.json.tmp`, fsyncs, renames
to `settings.json`, and keeps `settings.json.bak` as the prior known-
good copy. On load it parses `settings.json`, recomputes CRC32 over
all keys except `crc32`, and falls back to `.bak` if the value
mismatches.

## CSV export

`/api/sessions/<id>.csv` returns the same data as the binary, with
invalid HR/SpO₂ rendered as `-1`:

```
t_ms,hr_bpm,spo2_pct,activity,stage,flags
0,58,97.4,18,2,0
1000,57,97.4,22,2,0
2000,57,-1.0,135,1,1
...
```

## Reading raw binary in code

JavaScript: see `web/src/lib/api.ts` `parseSamples` for a `DataView`
parser. It's pure (no fetch dependency) so unit tests round-trip
canned bytes against it.

Python: see `tools/analyze.py` for a `numpy.dtype` parser path.
