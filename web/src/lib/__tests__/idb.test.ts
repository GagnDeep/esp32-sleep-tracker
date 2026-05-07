/**
 * Tests for the IndexedDB wrapper (idb.ts).
 *
 * Strategy: we cannot rely on jsdom exposing a working indexedDB (it only
 * does so when fake-indexeddb is installed, which is not a dep here).
 * Instead we define a compact in-memory shim (~90 lines) and install it on
 * globalThis before importing the module.  The shim covers exactly the IDB
 * surface that idb.ts touches: open, onupgradeneeded, transaction,
 * objectStore, get, put, delete, getAllKeys, clear.
 *
 * No-op-stub path (indexedDB absent) is tested by temporarily deleting the
 * global, calling closeAll() to reset module state, and then calling
 * openStore() — which returns the stub synchronously before touching the DB.
 * We restore the global afterwards so subsequent tests still work.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Inline in-memory IDB shim ────────────────────────────────────────────────
// Supports: IDBFactory.open, IDBRequest (onsuccess/onerror), IDBTransaction
// (oncomplete/onerror/onabort), IDBObjectStore (get/put/delete/getAllKeys/clear).
// All callbacks fire asynchronously via queueMicrotask to match real IDB behaviour.

type StoreData = Map<string, unknown>;
type DbData = Map<string, StoreData>; // storeName → data

interface FakeRequest<T> {
  result: T | undefined;
  error: DOMException | null;
  onsuccess: ((e: { target: { result: T | undefined } }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

function fakeRequest<T>(fn: () => T): FakeRequest<T> {
  const req: FakeRequest<T> = { result: undefined, error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      req.result = fn();
      req.onsuccess?.({ target: { result: req.result } });
    } catch (err) {
      req.error = err as DOMException;
      req.onerror?.(err);
    }
  });
  return req;
}

function makeObjectStore(data: StoreData) {
  return {
    get(key: string) {
      return fakeRequest(() => data.get(key));
    },
    put(value: unknown, key: string) {
      return fakeRequest(() => { data.set(key, value); return key; });
    },
    delete(key: string) {
      return fakeRequest(() => { data.delete(key); return undefined; });
    },
    getAllKeys() {
      return fakeRequest(() => Array.from(data.keys()));
    },
    clear() {
      return fakeRequest(() => { data.clear(); return undefined; });
    },
  };
}

function makeFakeTx(db: DbData, storeNames: string[], _mode: string) {
  const tx = {
    oncomplete: null as (() => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    onabort: null as ((e: unknown) => void) | null,
    error: null as DOMException | null,
    objectStore(name: string) {
      if (!db.has(name)) throw new Error(`Store "${name}" not found`);
      return makeObjectStore(db.get(name)!);
    },
    _complete() { queueMicrotask(() => tx.oncomplete?.()); },
  };
  // Auto-complete the transaction one microtask after creation — mirrors
  // real IDB where tx completes after all pending requests settle.
  queueMicrotask(() => tx._complete());
  void storeNames; // used implicitly through objectStore
  return tx;
}

// Extended IDBFactory shim that also exposes the most-recently opened db object
// so tests can trigger internal callbacks (e.g. versionchange).
interface FakeIdbFactory extends IDBFactory {
  lastDb: FakeDb | null;
}

interface FakeDb {
  objectStoreNames: { contains(n: string): boolean };
  createObjectStore(n: string): void;
  transaction(storeNames: string | string[], mode: string): ReturnType<typeof makeFakeTx>;
  close(): void;
  onversionchange: (() => void) | null;
  _fireVersionChange(): void;
}

// In-memory database registry (survives across open calls but resets per suite
// via buildFakeIdb()).
function buildFakeIdb(): FakeIdbFactory {
  const databases = new Map<string, { version: number; stores: DbData }>();
  let lastDb: FakeDb | null = null;

  const idbFactory = {
    get lastDb() { return lastDb; },
    open(name: string, version: number) {
      const req: {
        result: unknown;
        error: DOMException | null;
        onsuccess: ((e: unknown) => void) | null;
        onerror: ((e: unknown) => void) | null;
        onblocked: ((e: unknown) => void) | null;
        onupgradeneeded: ((e: { oldVersion: number; newVersion: number }) => void) | null;
      } = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        const existing = databases.get(name);
        const oldVersion = existing?.version ?? 0;
        const stores: DbData = existing?.stores ?? new Map();

        if (!existing) {
          databases.set(name, { version, stores });
        }

        let closed = false;
        const db = {
          objectStoreNames: {
            contains(n: string) { return stores.has(n); },
          },
          createObjectStore(n: string) {
            if (!stores.has(n)) stores.set(n, new Map());
          },
          transaction(storeNames: string | string[], mode: string) {
            if (closed) throw new Error('IDBDatabase: connection is closed');
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            return makeFakeTx(stores, names, mode);
          },
          close() { closed = true; },
          onversionchange: null as (() => void) | null,
          // Expose a test helper to fire the versionchange event.
          _fireVersionChange() { db.onversionchange?.(); },
        };

        // Track the most recently opened db so tests can access it.
        lastDb = db;

        // Set result before firing any callbacks — mirrors real IDB behaviour
        // where IDBOpenDBRequest.result is available inside onupgradeneeded.
        req.result = db;

        if (version > oldVersion) {
          databases.set(name, { version, stores });
          req.onupgradeneeded?.({ oldVersion, newVersion: version });
        }

        databases.set(name, { version, stores });
        req.onsuccess?.({});
      });

      return req;
    },

    deleteDatabase(_name: string) {
      return fakeRequest(() => { databases.delete(_name); return undefined; });
    },
  };

  return idbFactory as unknown as FakeIdbFactory;
}

// ── Module import ────────────────────────────────────────────────────────────
// We import after installing the shim so the module sees indexedDB defined.

// Install a fresh shim before anything is imported.
let fakeIdb = buildFakeIdb();
(globalThis as unknown as Record<string, unknown>)['indexedDB'] = fakeIdb;

import { openStore, closeAll } from '../idb';

// ── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Fresh shim + fresh module state before every test.
  fakeIdb = buildFakeIdb();
  (globalThis as unknown as Record<string, unknown>)['indexedDB'] = fakeIdb;
  await closeAll();
});

afterEach(async () => {
  await closeAll();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('basic put / get', () => {
  it('put then get returns the same value', async () => {
    const store = openStore<string>('test-a');
    await store.put('k1', 'hello');
    const val = await store.get('k1');
    expect(val).toBe('hello');
  });

  it('get on missing key returns undefined', async () => {
    const store = openStore<string>('test-a');
    const val = await store.get('missing');
    expect(val).toBeUndefined();
  });

  it('put overwrites existing key', async () => {
    const store = openStore<number>('test-a');
    await store.put('k', 1);
    await store.put('k', 2);
    expect(await store.get('k')).toBe(2);
  });
});

describe('delete', () => {
  it('delete then get returns undefined', async () => {
    const store = openStore<string>('test-a');
    await store.put('k', 'v');
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('delete on non-existent key resolves without error', async () => {
    const store = openStore<string>('test-a');
    await expect(store.delete('ghost')).resolves.toBeUndefined();
  });
});

describe('keys()', () => {
  it('returns keys that were put', async () => {
    const store = openStore<number>('test-a');
    await store.put('x', 1);
    await store.put('y', 2);
    const ks = await store.keys();
    expect(ks.sort()).toEqual(['x', 'y']);
  });

  it('returns empty array on empty store', async () => {
    const store = openStore<number>('test-a');
    expect(await store.keys()).toEqual([]);
  });

  it('does not include deleted keys', async () => {
    const store = openStore<number>('test-a');
    await store.put('a', 1);
    await store.put('b', 2);
    await store.delete('a');
    expect(await store.keys()).toEqual(['b']);
  });
});

describe('clear()', () => {
  it('empties the store', async () => {
    const store = openStore<string>('test-a');
    await store.put('k1', 'v1');
    await store.put('k2', 'v2');
    await store.clear();
    expect(await store.keys()).toEqual([]);
    expect(await store.get('k1')).toBeUndefined();
  });

  it('store is usable again after clear', async () => {
    const store = openStore<string>('test-a');
    await store.put('k', 'old');
    await store.clear();
    await store.put('k', 'new');
    expect(await store.get('k')).toBe('new');
  });
});

describe('multiple stores are independent', () => {
  it('data written to store-a is not visible from store-b', async () => {
    const a = openStore<string>('store-a');
    const b = openStore<string>('store-b');
    await a.put('shared-key', 'from-a');
    expect(await b.get('shared-key')).toBeUndefined();
  });

  it('clear on store-a does not affect store-b', async () => {
    const a = openStore<string>('store-a');
    const b = openStore<string>('store-b');
    await a.put('k', 'va');
    await b.put('k', 'vb');
    await a.clear();
    expect(await b.get('k')).toBe('vb');
  });
});

describe('repeated openStore calls', () => {
  it('multiple handles to the same store share data', async () => {
    const h1 = openStore<string>('shared');
    const h2 = openStore<string>('shared');
    await h1.put('k', 'from-h1');
    expect(await h2.get('k')).toBe('from-h1');
  });
});

describe('version-upgrade: close old connection before re-opening', () => {
  it('opening a second distinct store works after the first store is used', async () => {
    // Open store 'alpha' and write a value — this holds a v1 connection.
    const alpha = openStore<string>('alpha');
    await alpha.put('k', 'from-alpha');

    // Now open 'beta' (new store → version bump). The fix must close the v1
    // connection so the v2 open is not blocked.
    const beta = openStore<string>('beta');
    await beta.put('k', 'from-beta');

    // Both stores must be readable with their original data intact.
    expect(await alpha.get('k')).toBe('from-alpha');
    expect(await beta.get('k')).toBe('from-beta');
  });
});

describe('versionchange listener', () => {
  it('fires onversionchange closes the connection; subsequent transaction rejects', async () => {
    // Open a store to get a live connection.
    const store = openStore<string>('vc-store');
    await store.put('x', 'y'); // ensure connection is open

    // Grab the underlying fake db and fire versionchange (simulates another tab
    // opening the DB at a higher version).
    const db = fakeIdb.lastDb!;
    expect(db).not.toBeNull();
    db._fireVersionChange();

    // After versionchange, the db must be marked closed. Any further
    // transaction attempt should reject.
    expect(() => db.transaction('vc-store', 'readonly')).toThrow('closed');
  });
});

describe('no-op stub when indexedDB is unavailable', () => {
  // We temporarily remove indexedDB, reset module state, and call openStore.
  // openStore checks typeof globalThis.indexedDB at call time and returns the
  // stub synchronously — so the stub path is real code, not mocking the module.

  it('get resolves undefined', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    delete (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    await closeAll();
    try {
      const store = openStore<string>('any');
      expect(await store.get('k')).toBeUndefined();
    } finally {
      (globalThis as unknown as Record<string, unknown>)['indexedDB'] = saved;
    }
  });

  it('put resolves without error', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    delete (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    await closeAll();
    try {
      const store = openStore<string>('any');
      await expect(store.put('k', 'v')).resolves.toBeUndefined();
    } finally {
      (globalThis as unknown as Record<string, unknown>)['indexedDB'] = saved;
    }
  });

  it('delete resolves without error', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    delete (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    await closeAll();
    try {
      const store = openStore<string>('any');
      await expect(store.delete('k')).resolves.toBeUndefined();
    } finally {
      (globalThis as unknown as Record<string, unknown>)['indexedDB'] = saved;
    }
  });

  it('keys() resolves []', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    delete (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    await closeAll();
    try {
      const store = openStore<string>('any');
      expect(await store.keys()).toEqual([]);
    } finally {
      (globalThis as unknown as Record<string, unknown>)['indexedDB'] = saved;
    }
  });

  it('clear() resolves without error', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    delete (globalThis as unknown as Record<string, unknown>)['indexedDB'];
    await closeAll();
    try {
      const store = openStore<string>('any');
      await expect(store.clear()).resolves.toBeUndefined();
    } finally {
      (globalThis as unknown as Record<string, unknown>)['indexedDB'] = saved;
    }
  });
});
