// @vitest-environment jsdom

// Round-trip the 14-byte sample stride against the pure parser. We
// build the bytes by hand (little-endian) so any drift between the
// firmware struct and the JS reader trips this test.
//
// Also covers:
//   - 401 re-queue infrastructure (replayPendingRequest, bug #5)
//   - Tag endpoint stubs (getTags / putTags)
//   - Goal endpoint stubs (getGoals / putGoals)

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseSamples,
  SAMPLE_STRIDE,
  api,
  replayPendingRequest,
  getTags,
  putTags,
  getGoals,
  putGoals,
} from '../api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeResponse(status: number, body: string, ok?: boolean): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    status,
    statusText: status === 200 ? 'OK' : String(status),
    ok: isOk,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(body ? JSON.parse(body) : undefined),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// parseSamples
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 401 re-queue (bug #5)
// ---------------------------------------------------------------------------

describe('401 re-queue', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('replayPendingRequest is a no-op when nothing is pending', async () => {
    // Should resolve immediately without throwing.
    await expect(replayPendingRequest()).resolves.toBeUndefined();
  });

  it('parks a non-GET 401 and resolves the original promise after replay', async () => {
    // First call → 401; second call (replay) → 200 with JSON body.
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(makeResponse(401, '', false));
      }
      return Promise.resolve(makeResponse(200, JSON.stringify({ ok: true })));
    });

    // Fire a POST — it should park on 401 and not reject.
    const pending = api.startSession(); // POST /api/sessions/start

    // Wait for the 401 branch to execute and pendingReplay to be set.
    // The async chain (request → rawFetch → fetch mock) takes several
    // microtask turns; a macrotask boundary (setTimeout 0) is the most
    // reliable way to drain them without coupling to implementation depth.
    await new Promise<void>((r) => setTimeout(r, 0));

    // Simulate the auth flow completing — replay the parked request.
    await replayPendingRequest();

    // Now the original promise should resolve with the 200 body.
    const result = await pending;
    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tag endpoints
// ---------------------------------------------------------------------------

describe('getTags', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('returns the tags array on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeResponse(200, JSON.stringify({ tags: ['deep-sleep', 'nap'] })),
    );
    const tags = await getTags();
    expect(tags).toEqual(['deep-sleep', 'nap']);
  });

  it('returns [] on a non-ok response (e.g. 404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeResponse(404, 'Not Found', false),
    );
    const tags = await getTags();
    expect(tags).toEqual([]);
  });
});

describe('putTags', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('sends a PUT request with the tags JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(204, ''));
    globalThis.fetch = mockFetch;

    await putTags(['a', 'b']);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/tags');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['a', 'b'] });
  });
});

// ---------------------------------------------------------------------------
// Goal endpoints
// ---------------------------------------------------------------------------

describe('getGoals', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('returns parsed goal object on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeResponse(200, JSON.stringify({ targetSleepMin: 480, targetScore: 85 })),
    );
    const goals = await getGoals();
    expect(goals).toEqual({ targetSleepMin: 480, targetScore: 85 });
  });

  it('returns {} on a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeResponse(404, 'Not Found', false),
    );
    const goals = await getGoals();
    expect(goals).toEqual({});
  });
});

describe('putGoals', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('sends a PUT request with the goals JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(204, ''));
    globalThis.fetch = mockFetch;

    await putGoals({ targetSleepMin: 420, targetScore: 75 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/goals');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ targetSleepMin: 420, targetScore: 75 });
  });
});
