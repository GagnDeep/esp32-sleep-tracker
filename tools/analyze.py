#!/usr/bin/env python3
"""Plot a Sleep Tracker CSV export with matplotlib.

Usage:
    python tools/analyze.py path/to/2026-05-06T03-12-44Z.csv
    python tools/analyze.py session.csv --save plot.png

Reads the CSV format documented in docs/data-format.md (which is what
the device returns from /api/sessions/<id>.csv). Invalid HR/SpO₂
samples are rendered as gaps so they don't drag the y-axis.
"""

from __future__ import annotations
import argparse
import csv
import sys
from typing import List


def load(path: str):
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


def to_nan(values: List[float], invalid_lt: float = 0):
    return [v if v >= invalid_lt else float('nan') for v in values]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('csv', help='path to session CSV')
    p.add_argument('--save', help='write plot here instead of showing')
    args = p.parse_args(argv)

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print('matplotlib is required: pip install matplotlib', file=sys.stderr)
        return 1

    t, hr, spo2, act, stage = load(args.csv)
    hr_clean    = to_nan(hr,   invalid_lt=10)
    spo2_clean  = to_nan(spo2, invalid_lt=50)

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

    fig.suptitle(args.csv)
    fig.tight_layout()

    if args.save:
        fig.savefig(args.save, dpi=120)
        print(f'wrote {args.save}')
    else:
        plt.show()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
