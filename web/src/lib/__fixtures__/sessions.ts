// Deterministic mock session generator for local dev/QA. Only used
// when the dev server is up *and* the URL contains `?mock`. We never
// pull this into a production bundle path — guard with the
// `import.meta.env.DEV` check below before calling `mockSessions()`.

import type { SessionSummary } from '../api';

export const TAG_WHITELIST = [
  'sick',
  'workout',
  'alcohol',
  'travel',
  'caffeine',
  'medication',
  'nap',
  'napless',
] as const;

// Cheap deterministic PRNG (mulberry32). Same seed → same sessions.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 14 days of mock data with a couple of "missing" days mixed in so
// the Trends route can show its empty-day handling.
export function mockSessions(seed = 42): { id: string; summary: SessionSummary }[] {
  const rnd = mulberry32(seed);
  const out: { id: string; summary: SessionSummary }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    // Skip a couple of days to simulate gaps.
    if (i === 3 || i === 9) continue;
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    start.setHours(23, Math.floor(rnd() * 30), 0, 0);
    start.setDate(start.getDate() - 1); // night-of: previous evening

    const durationS = 3600 * (5 + rnd() * 4); // 5–9 h
    const end = new Date(start.getTime() + durationS * 1000);

    const hrAvg = Math.round(56 + rnd() * 12);
    const hrMin = Math.round(hrAvg - 5 - rnd() * 8);
    const hrMax = Math.round(hrAvg + 18 + rnd() * 14);
    const spAvg = Math.round((96 + rnd() * 2.5) * 10);
    const spMin = Math.round(spAvg - 30 - rnd() * 30);

    // Stage breakdown roughly proportional to the duration.
    const total = Math.round(durationS);
    const awake = Math.round(total * (0.04 + rnd() * 0.06));
    const deep  = Math.round(total * (0.18 + rnd() * 0.10));
    const light = Math.max(0, total - awake - deep);

    // 20% of sessions get a tag.
    const tags: string[] = [];
    if (rnd() < 0.20) tags.push(TAG_WHITELIST[Math.floor(rnd() * TAG_WHITELIST.length)]);

    const score = Math.max(20, Math.min(98, Math.round(72 + (rnd() - 0.5) * 30 - (tags.includes('alcohol') ? 12 : 0))));
    const id = `mock-${start.toISOString().slice(0, 10)}`;
    const summary: SessionSummary = {
      id,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_s: total,
      hr_min: hrMin,
      hr_avg: hrAvg,
      hr_max: hrMax,
      spo2_min_x10: spMin,
      spo2_avg_x10: spAvg,
      time_in_stage: [0, awake, light, deep],
      sleep_score: score,
      schema_version: 2,
      started_at_unix: Math.floor(start.getTime() / 1000),
      ended_at_unix: Math.floor(end.getTime() / 1000),
      tz_offset_min: -start.getTimezoneOffset(),
      tags,
      notes: '',
      sample_format_version: 1,
    };
    out.push({ id, summary });
  }
  // Most-recent first to match `/api/sessions`.
  return out;
}

export function shouldUseMock(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('mock');
  } catch {
    return false;
  }
}
