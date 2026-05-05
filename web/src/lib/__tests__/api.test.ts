// Round-trip the 14-byte sample stride against the pure parser. We
// build the bytes by hand (little-endian) so any drift between the
// firmware struct and the JS reader trips this test.

import { describe, it, expect } from 'vitest';
import { parseSamples, SAMPLE_STRIDE } from '../api';

function packSample(
  t_ms: number,
  hr_bpm: number,
  spo2_x10: number,
  activity: number,
  stage: number,
  flags: number,
): Uint8Array {
  const buf = new Uint8Array(SAMPLE_STRIDE);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, t_ms, true);
  dv.setUint16(4, hr_bpm, true);
  dv.setUint16(6, spo2_x10, true);
  dv.setUint16(8, activity, true);
  dv.setUint8(10, stage);
  dv.setUint8(11, flags);
  // bytes 12-13 reserved → leave zero
  return buf;
}

describe('parseSamples', () => {
  it('parses two known samples back to the canned values', () => {
    const a = packSample(0, 58, 974, 18, 2, 0);
    const b = packSample(1000, 0xffff, 0xffff, 132, 1, 0b011);

    const all = new Uint8Array(SAMPLE_STRIDE * 2);
    all.set(a, 0);
    all.set(b, SAMPLE_STRIDE);

    const out = parseSamples(all);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      t_ms: 0,
      hr_bpm: 58,
      spo2_x10: 974,
      activity: 18,
      stage: 2,
      flags: 0,
    });
    expect(out[1]).toEqual({
      t_ms: 1000,
      hr_bpm: 0xffff,
      spo2_x10: 0xffff,
      activity: 132,
      stage: 1,
      flags: 0b011,
    });
  });

  it('returns an empty array on empty input', () => {
    expect(parseSamples(new Uint8Array(0))).toEqual([]);
  });

  it('drops a trailing partial frame instead of throwing', () => {
    const full = packSample(500, 60, 950, 5, 3, 0);
    const blob = new Uint8Array(SAMPLE_STRIDE + 5);
    blob.set(full, 0);
    // five stub bytes after — should be ignored, not parsed.
    const out = parseSamples(blob);
    expect(out).toHaveLength(1);
    expect(out[0].t_ms).toBe(500);
  });

  it('reads a non-zero byteOffset view correctly', () => {
    // Simulate a slice off a larger buffer — the parser must respect
    // the view's byteOffset rather than reading from index 0 of the
    // underlying ArrayBuffer.
    const backing = new Uint8Array(SAMPLE_STRIDE + 8);
    const sample = packSample(7777, 72, 980, 42, 2, 0);
    backing.set(sample, 8);
    const view = new Uint8Array(backing.buffer, 8, SAMPLE_STRIDE);
    const out = parseSamples(view);
    expect(out).toHaveLength(1);
    expect(out[0].t_ms).toBe(7777);
    expect(out[0].hr_bpm).toBe(72);
  });
});
