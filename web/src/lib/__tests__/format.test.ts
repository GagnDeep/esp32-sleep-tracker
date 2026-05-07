// Format helpers are pure with one wrinkle: formatDateTime/formatTime
// read the displayTimezone signal. We pin it manually here so the
// assertions are stable across CI machines (whose default tz varies).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatBpm,
  formatPct,
  formatDuration,
  formatHourMin,
  formatDateTime,
  displayTimezone,
  scoreBand,
  scoreBandLabel,
  scoreBandTone,
} from '../format';

describe('formatBpm', () => {
  it('renders an em-dash for zero / sentinel', () => {
    expect(formatBpm(0)).toBe('—');
    expect(formatBpm(0xffff)).toBe('—');
  });
  it('renders a plain integer string for valid bpm', () => {
    expect(formatBpm(58)).toBe('58');
    expect(formatBpm(120)).toBe('120');
  });
});

describe('formatPct', () => {
  it('renders an em-dash for zero / sentinel-large values', () => {
    expect(formatPct(0)).toBe('—');
    expect(formatPct(250)).toBe('—');
  });
  it('renders one decimal place by default', () => {
    expect(formatPct(97.4)).toBe('97.4');
  });
  it('honours a custom decimal count', () => {
    expect(formatPct(97.4, 0)).toBe('97');
    expect(formatPct(97.456, 2)).toBe('97.46');
  });
});

describe('formatDuration', () => {
  it('renders an em-dash for zero / negative', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
  it('renders sub-hour as minutes only', () => {
    expect(formatDuration(125)).toBe('2m');
    expect(formatDuration(59 * 60)).toBe('59m');
  });
  it('renders hours and zero-padded minutes', () => {
    expect(formatDuration(3600)).toBe('1h 00m');
    expect(formatDuration(3600 + 5 * 60)).toBe('1h 05m');
    expect(formatDuration(8 * 3600 + 12 * 60)).toBe('8h 12m');
  });
});

describe('formatHourMin', () => {
  it('zero-pads both fields', () => {
    expect(formatHourMin(0)).toBe('00:00');
    expect(formatHourMin(7 * 60 + 5)).toBe('07:05');
    expect(formatHourMin(23 * 60 + 59)).toBe('23:59');
  });
  it('wraps past 24 h and rejects non-finite input', () => {
    expect(formatHourMin(25 * 60)).toBe('01:00');
    expect(formatHourMin(NaN)).toBe('—');
    expect(formatHourMin(-1)).toBe('—');
  });
});

describe('formatDateTime tz behaviour', () => {
  // 2026-05-06T12:00:00Z is a fixed UTC moment we anchor against. With
  // America/New_York that's 08:00 EDT; with Asia/Tokyo it's 21:00 JST.
  const fixedUtc = Date.UTC(2026, 4, 6, 12, 0, 0); // ms

  beforeEach(() => {
    displayTimezone.value = 'auto';
  });

  it('formats UTC explicitly when timezone pinned', () => {
    displayTimezone.value = 'UTC';
    const out = formatDateTime(fixedUtc, { date: 'short', time: 'short' });
    expect(out).toMatch(/12:00/);
  });

  it('shifts to America/New_York', () => {
    displayTimezone.value = 'America/New_York';
    const out = formatDateTime(fixedUtc, { date: 'short', time: 'short' });
    // EDT in May → UTC-4 → 08:00.
    expect(out).toMatch(/08:00|8:00/);
  });

  it('shifts to Asia/Tokyo', () => {
    displayTimezone.value = 'Asia/Tokyo';
    const out = formatDateTime(fixedUtc, { date: 'short', time: 'short' });
    expect(out).toMatch(/21:00|9:00/); // 24h → 21:00, 12h → 9:00 PM
  });

  it('falls back gracefully on a bad tz id', () => {
    displayTimezone.value = 'Not/A_Zone';
    const out = formatDateTime(fixedUtc, { date: 'short', time: 'short' });
    expect(out).not.toBe('—');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns em-dash for unparseable input', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});

describe('scoreBand', () => {
  it('returns poor for 0 and 49', () => {
    expect(scoreBand(0)).toBe('poor');
    expect(scoreBand(49)).toBe('poor');
  });
  it('returns fair for 50 and 69', () => {
    expect(scoreBand(50)).toBe('fair');
    expect(scoreBand(69)).toBe('fair');
  });
  it('returns good for 70 and 84', () => {
    expect(scoreBand(70)).toBe('good');
    expect(scoreBand(84)).toBe('good');
  });
  it('returns excellent for 85 and 100', () => {
    expect(scoreBand(85)).toBe('excellent');
    expect(scoreBand(100)).toBe('excellent');
  });
  it('returns poor for sentinel values', () => {
    expect(scoreBand(NaN)).toBe('poor');
    expect(scoreBand(undefined as unknown as number)).toBe('poor');
    expect(scoreBand(-5)).toBe('poor');
  });
});

describe('scoreBandLabel', () => {
  it('returns capitalised label for each band', () => {
    expect(scoreBandLabel('excellent')).toBe('Excellent');
    expect(scoreBandLabel('good')).toBe('Good');
    expect(scoreBandLabel('fair')).toBe('Fair');
    expect(scoreBandLabel('poor')).toBe('Poor');
  });
});

describe('scoreBandTone', () => {
  it('maps bands to StatCard tones', () => {
    expect(scoreBandTone('excellent')).toBe('good');
    expect(scoreBandTone('good')).toBe('accent');
    expect(scoreBandTone('fair')).toBe('warn');
    expect(scoreBandTone('poor')).toBe('bad');
  });
});
