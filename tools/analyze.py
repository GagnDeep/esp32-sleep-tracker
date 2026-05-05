#!/usr/bin/env python3
"""Plot a Sleep Tracker session with matplotlib.

Usage:
    python tools/analyze.py path/to/2026-05-06T03-12-44Z.csv
    python tools/analyze.py path/to/2026-05-06T03-12-44Z.bin
    python tools/analyze.py session.csv --save plot.png

Reads either:

  * the CSV format documented in docs/data-format.md (which is what the
    device returns from /api/sessions/<id>.csv), or
  * the raw .bin file directly via numpy.dtype, matching the firmware
    Sample struct (14-byte stride, little-endian).

When a `<id>.json` sidecar lives next to the input file, we surface
its v2 fields in the chart title:

    Session 2026-05-06 [sick, fever]

Invalid HR / SpO₂ samples are rendered as gaps so they don't drag the
y-axis.
"""

from __future__ import annotations
import argparse
import csv
import json
import os
import sys
from typing import List, Tuple


# Binary stride description for numpy. Matches firmware/src/storage/Sample.h
# exactly — keep these names in sync with the C struct field order.
SAMPLE_DTYPE_FIELDS = [
    ('t_ms',     '<u4'),
    ('hr_bpm',   '<u2'),
    ('spo2_x10', '<u2'),
    ('activity', '<u2'),
    ('stage',    '<u1'),
    ('flags',    '<u1'),
    ('reserved', '<u2'),
]


def load_csv(path: str) -> Tuple[List[float], List[int], List[float], List[int], List[int]]:
    t, hr, spo2, act, stage = [], [], [], [], []
    with open(path, newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            t.append(int(row['t_ms']) / 1000.0)
            hr.append(int(row['hr_bpm']))
            spo2.append(float(row['spo2_pct']))
            act.append(int(row['activity']))
            stage.append(int(row['stage']))
    return t, hr, spo2, act, stage


def load_bin(path: str) -> Tuple[List[float], List[int], List[float], List[int], List[int]]:
    """Read a /sessions/<id>.bin via numpy.dtype.

    Returns the same five lists as `load_csv` so the rest of the
    pipeline doesn't care which format we came from. SpO₂ comes off
    the wire as `*10` (e.g. 974 → 97.4); we divide here. Sentinel
    `0xFFFF` becomes `-1` to match the CSV convention.
    """
    try:
        import numpy as np
    except ImportError:
        print('numpy is required for .bin input: pip install numpy', file=sys.stderr)
        raise

    dt = np.dtype(SAMPLE_DTYPE_FIELDS)
    arr = np.fromfile(path, dtype=dt)

    t = (arr['t_ms'].astype('f8') / 1000.0).tolist()
    hr_raw = arr['hr_bpm'].astype('i4')
    spo2_raw = arr['spo2_x10'].astype('i4')

    hr = [(-1 if v == 0xFFFF else int(v)) for v in hr_raw]
    spo2 = [(-1.0 if v == 0xFFFF else float(v) / 10.0) for v in spo2_raw]
    act = arr['activity'].astype('i4').tolist()
    stage = arr['stage'].astype('i4').tolist()
    return t, hr, spo2, act, stage


def load_sidecar(input_path: str) -> dict:
    """Find a `<id>.json` next to the input and return its contents.

    Returns an empty dict if the sidecar is missing or unreadable;
    the caller falls back to the raw filename.
    """
    base, _ = os.path.splitext(input_path)
    sidecar = base + '.json'
    if not os.path.exists(sidecar):
        return {}
    try:
        with open(sidecar) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def title_from(input_path: str, sidecar: dict) -> str:
    """Render the chart title.

    Format: "Session <date>" or, when v2 fields are present,
    "Session <date> [tag, tag]". Falls back to the input filename
    when no sidecar is available.
    """
    started = sidecar.get('started_at') or sidecar.get('id')
    if started:
        # Truncate the time portion: ISO timestamps are noisy in a chart title.
        head = started.split('T', 1)[0]
        title = f'Session {head}'
    else:
        title = os.path.basename(input_path)

    tags = sidecar.get('tags') or []
    if tags:
        title = f'{title} [{", ".join(tags)}]'

    notes = sidecar.get('notes')
    if notes:
        # One-line preview only; long notes are stored in the sidecar.
        snippet = notes.strip().splitlines()[0]
        if len(snippet) > 60:
            snippet = snippet[:57] + '...'
        title = f'{title}\n{snippet}'
    return title


def to_nan(values, invalid_lt: float = 0):
    return [v if v >= invalid_lt else float('nan') for v in values]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', help='path to session CSV or .bin')
    p.add_argument('--save', help='write plot here instead of showing')
    args = p.parse_args(argv)

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print('matplotlib is required: pip install matplotlib', file=sys.stderr)
        return 1

    ext = os.path.splitext(args.input)[1].lower()
    if ext == '.bin':
        t, hr, spo2, act, stage = load_bin(args.input)
    else:
        t, hr, spo2, act, stage = load_csv(args.input)

    sidecar = load_sidecar(args.input)
    hr_clean   = to_nan(hr,   invalid_lt=10)
    spo2_clean = to_nan(spo2, invalid_lt=50)

    fig, axes = plt.subplots(3, 1, figsize=(11, 7), sharex=True)
    ax_hr, ax_act, ax_stage = axes

    ax_hr.plot(t, hr_clean, color='tab:red', label='HR (bpm)')
    ax_hr.set_ylabel('HR (bpm)', color='tab:red')
    ax_hr2 = ax_hr.twinx()
    ax_hr2.plot(t, spo2_clean, color='tab:blue', label='SpO₂ (%)')
    ax_hr2.set_ylabel('SpO₂ (%)', color='tab:blue')

    ax_act.plot(t, act, color='tab:purple')
    ax_act.set_ylabel('Activity (0..1000)')

    stage_colors = ['#888', '#f4a261', '#5fa8d3', '#7d6cba']
    for i in range(len(t) - 1):
        s = stage[i]
        if 0 <= s < len(stage_colors):
            ax_stage.axvspan(t[i], t[i + 1], color=stage_colors[s], alpha=0.6, lw=0)
    ax_stage.set_ylim(0, 1)
    ax_stage.set_yticks([])
    ax_stage.set_ylabel('Stage')
    ax_stage.set_xlabel('seconds since session start')

    fig.suptitle(title_from(args.input, sidecar))
    fig.tight_layout()

    if args.save:
        fig.savefig(args.save, dpi=120)
        print(f'wrote {args.save}')
    else:
        plt.show()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
