import { describe, it, expect } from 'vitest';
import {
  generateInsights,
  trimToTrailingDays,
  type Insight,
  type InsightInput,
  type InsightSeverity,
} from '../insights';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<InsightInput['sessions'][number]> & { startIso: string; endIso: string },
): InsightInput['sessions'][number] {
  return {
    id: 'test-id',
    durationMin: 420,
    score: 75,
    ...overrides,
  };
}

const BASE_NOW = Date.UTC(2026, 4, 7, 12, 0, 0); // 2026-05-07T12:00:00Z

// ---------------------------------------------------------------------------
// generateInsights — skeleton always returns []
// ---------------------------------------------------------------------------

describe('generateInsights', () => {
  it('returns [] for empty sessions', () => {
    const result = generateInsights({ sessions: [] });
    expect(result).toEqual([]);
  });

  it('returns [] for a single session (skeleton always empty)', () => {
    const result = generateInsights({
      sessions: [
        makeSession({
          id: 'night-1',
          startIso: '2026-05-06T22:00:00Z',
          endIso: '2026-05-07T06:00:00Z',
          durationMin: 480,
          score: 80,
        }),
      ],
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// trimToTrailingDays
// ---------------------------------------------------------------------------

describe('trimToTrailingDays', () => {
  it('returns only sessions within `days` of now', () => {
    const sessions: InsightInput['sessions'] = [
      // 1 day ago — within 7
      makeSession({ id: 's1', startIso: new Date(BASE_NOW - 1 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 1 * 86_400_000 + 480 * 60_000).toISOString() }),
      // 7 days ago exactly — boundary, should be included (now - start === days * 86400000)
      makeSession({ id: 's2', startIso: new Date(BASE_NOW - 7 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 7 * 86_400_000 + 480 * 60_000).toISOString() }),
      // 8 days ago — outside window
      makeSession({ id: 's3', startIso: new Date(BASE_NOW - 8 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 8 * 86_400_000 + 480 * 60_000).toISOString() }),
      // 30 days ago — well outside
      makeSession({ id: 's4', startIso: new Date(BASE_NOW - 30 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 30 * 86_400_000 + 480 * 60_000).toISOString() }),
    ];

    const result = trimToTrailingDays(sessions, 7, BASE_NOW);

    expect(result.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('returns sessions sorted newest first', () => {
    // Provide sessions in oldest-first order and verify they come back newest-first.
    const sessions: InsightInput['sessions'] = [
      makeSession({ id: 'old', startIso: new Date(BASE_NOW - 5 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 5 * 86_400_000 + 480 * 60_000).toISOString() }),
      makeSession({ id: 'mid', startIso: new Date(BASE_NOW - 3 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 3 * 86_400_000 + 480 * 60_000).toISOString() }),
      makeSession({ id: 'new', startIso: new Date(BASE_NOW - 1 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 1 * 86_400_000 + 480 * 60_000).toISOString() }),
    ];

    const result = trimToTrailingDays(sessions, 7, BASE_NOW);
    expect(result.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });

  it('returns [] when days = 0', () => {
    const sessions: InsightInput['sessions'] = [
      makeSession({ id: 's1', startIso: new Date(BASE_NOW - 1 * 86_400_000).toISOString(), endIso: new Date(BASE_NOW - 1 * 86_400_000 + 480 * 60_000).toISOString() }),
    ];
    const result = trimToTrailingDays(sessions, 0, BASE_NOW);
    expect(result).toEqual([]);
  });

  it('includes session on exact boundary (now - startIso === days * 86_400_000)', () => {
    const exactBoundaryStart = BASE_NOW - 28 * 86_400_000;
    const sessions: InsightInput['sessions'] = [
      makeSession({
        id: 'boundary',
        startIso: new Date(exactBoundaryStart).toISOString(),
        endIso: new Date(exactBoundaryStart + 480 * 60_000).toISOString(),
      }),
    ];
    const result = trimToTrailingDays(sessions, 28, BASE_NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('boundary');
  });

  it('excludes session one millisecond past the boundary', () => {
    const justOutside = BASE_NOW - 28 * 86_400_000 - 1;
    const sessions: InsightInput['sessions'] = [
      makeSession({
        id: 'just-outside',
        startIso: new Date(justOutside).toISOString(),
        endIso: new Date(justOutside + 480 * 60_000).toISOString(),
      }),
    ];
    const result = trimToTrailingDays(sessions, 28, BASE_NOW);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Type-check sanity (compile-time only — these will fail to compile if the
// interface shapes drift from the spec).
// ---------------------------------------------------------------------------

type _SeverityCheck = InsightSeverity extends 'info' | 'positive' | 'concern' ? true : never;
type _InsightHasRequiredFields = keyof Insight extends
  | 'id'
  | 'severity'
  | 'title'
  | 'detail'
  | 'value'
  | 'unit'
  | 'range'
  ? true
  : never;
type _InsightInputHasSessions = InsightInput extends { sessions: ReadonlyArray<unknown> }
  ? true
  : never;
