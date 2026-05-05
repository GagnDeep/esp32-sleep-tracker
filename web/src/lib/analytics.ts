// Client-side trend math. Cheap enough to do in the browser since
// summaries are small (1 sidecar per night).

import type { SessionSummary } from './api';

export interface NightStats {
  id: string;
  startedAt?: string;
  durationS: number;
  score?: number;
  deepFrac: number;
  lightFrac: number;
  awakeFrac: number;
}

export function nightStats(s: SessionSummary): NightStats {
  const tis = s.time_in_stage ?? [0, 0, 0, 0];
  const total = tis[1] + tis[2] + tis[3];
  return {
    id: s.id,
    startedAt: s.started_at,
    durationS: s.duration_s ?? 0,
    score: s.sleep_score,
    deepFrac:  total ? tis[3] / total : 0,
    lightFrac: total ? tis[2] / total : 0,
    awakeFrac: total ? tis[1] / total : 0,
  };
}

export function rollingAvg(scores: (number | undefined)[], window = 7): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < scores.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = scores[j];
      if (typeof v === 'number') { sum += v; ++n; }
    }
    out.push(n ? sum / n : null);
  }
  return out;
}

export function calendarHeatLevel(score: number | undefined): number {
  if (score == null) return 0;
  if (score < 50)  return 1;
  if (score < 65)  return 2;
  if (score < 80)  return 3;
  return 4;
}
