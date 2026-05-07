// Insights module — types and skeleton for the Phase D rules engine.
// generateInsights returns an empty array until Phase D fills in the rules.

export type InsightSeverity = 'info' | 'positive' | 'concern';

export interface Insight {
  id: string;            // stable kebab-case id, e.g. 'late-bedtime-variance'
  severity: InsightSeverity;
  title: string;         // short, glanceable
  detail: string;        // sentence or two
  value?: number;        // optional numeric (e.g., a delta in min, %, score points)
  unit?: string;         // optional unit display ('min', '%', 'pts')
  /** Optional pointer to relevant session range so the UI can deep-link. */
  range?: { fromIso: string; toIso: string };
}

/**
 * Minimal shape the rules engine will read. Mirrors fields the
 * Phase D engine will pull from `SessionSummary` in `api.ts`.
 */
export interface InsightInput {
  // Each entry is one night's summary. Newest first OR oldest first —
  // generateInsights normalizes by sorting internally.
  sessions: ReadonlyArray<{
    id: string;
    startIso: string;       // ISO timestamp of session start
    endIso: string;
    durationMin: number;
    score: number;          // 0..100
    deepMin?: number;
    lightMin?: number;
    remMin?: number;        // currently always 0 in firmware (REM not detected)
    awakeMin?: number;
    hrAvg?: number;
    spo2Avg?: number;
    hrvRmssd?: number;
    tags?: ReadonlyArray<string>;
  }>;
  /** Goals (Phase A2 wires these up). May be undefined in skeleton. */
  goals?: { targetSleepMin?: number; targetScore?: number };
  /** ms timestamp; defaults to Date.now() */
  now?: number;
}

/**
 * Generate insights from the last 28 days of session summaries.
 * Phase D: real rules. Phase A skeleton: returns empty array.
 */
export function generateInsights(_input: InsightInput): Insight[] {
  // TODO(phase-D): implement consistency / debt / HRV / awakenings rules.
  return [];
}

/**
 * Trim sessions to the trailing N days from `now`. Used by the rules
 * engine to scope its analysis. Sessions are returned newest first.
 *
 * A session is included if:  now - Date.parse(session.startIso) <= days * 86_400_000
 */
export function trimToTrailingDays(
  sessions: InsightInput['sessions'],
  days: number,
  now: number = Date.now(),
): InsightInput['sessions'] {
  const cutoff = days * 86_400_000;
  return sessions
    .filter((s) => now - Date.parse(s.startIso) <= cutoff)
    .sort((a, b) => Date.parse(b.startIso) - Date.parse(a.startIso));
}
