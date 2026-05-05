# Data format

Each session is two files on LittleFS (mirrored to SD when present):

```
/sessions/<id>.bin    binary samples, 14 bytes each (1 Hz)
/sessions/<id>.json   sidecar summary + metadata
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
| 11     | 1 B  | `flags`    | bit0=motion, bit1=finger_off, bit2=alarm_fired |
| 12     | 2 B  | `reserved` | future use; treat as 0 |

## Sidecar JSON

```json
{
  "id": "2026-05-06T03-12-44Z",
  "started_at": "2026-05-06T03:12:44Z",
  "ended_at":   "2026-05-06T11:18:02Z",
  "duration_s": 29118,
  "hr_min":  44, "hr_avg": 56, "hr_max": 89,
  "spo2_min_x10": 925, "spo2_avg_x10": 962,
  "time_in_stage": [120, 6080, 18800, 4118],
  "sleep_score": 78,
  "crashed": false,
  "firmware_version": "0.1.0-dev"
}
```

`time_in_stage` is `[unknown, awake, light, deep]` in seconds.

`sleep_score` only appears once the user baseline has been calibrated
(after `baseline_nights >= 3`); before that the field is omitted to
avoid implying confidence the device hasn't earned.

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

JavaScript: see `web/src/lib/api.ts` `rawSession` for a `DataView`
parser.

Python: see `tools/analyze.py` for a `numpy.dtype` parser.
