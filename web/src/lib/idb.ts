/**
 * Minimal promise-based IndexedDB wrapper.
 *
 * Object-store-per-namespace model: callers pick a store name and get
 * typed get/put/delete/keys/clear over it. Single shared DB named
 * "esp32-sleep-tracker"; version bumped automatically when a new store
 * is first requested.
 *
 * Nothing runs until the first call (fully lazy). When indexedDB is
 * absent (SSR / stripped browser) every call returns a no-op stub so
 * callers need no special handling.
 *
 * No external dependencies.
 */

const DB_NAME = 'esp32-sleep-tracker';

// ── Public types ─────────────────────────────────────────────────────────────

export interface IdbStore<V> {
  get(key: string): Promise<V | undefined>;
  put(key: string, value: V): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

// ── Module-level state ───────────────────────────────────────────────────────

// Set of store names we have verified exist in the DB at the current version.
// Persists across calls so we don't re-negotiate the schema unnecessarily.
let knownStores = new Set<string>();

// Cached open DB connection.
let dbPromise: Promise<IDBDatabase> | null = null;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Wrap an IDBRequest in a Promise, surfacing errors as rejected with `cause`. */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error('IDBRequest failed', { cause: req.error }));
  });
}

/**
 * Wrap an IDBTransaction completion in a Promise.
 * MUST be called synchronously after creating the transaction so the handler
 * is registered before the microtask queue drains.
 */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error('IDBTransaction failed', { cause: tx.error }));
    tx.onabort = () =>
      reject(new Error('IDBTransaction aborted', { cause: tx.error }));
  });
}

/**
 * Open (or reopen with a version bump) the shared DB.
 *
 * If `neededStore` is not yet in `knownStores`, we bump the version so
 * `onupgradeneeded` can create it.
 */
async function openDb(neededStore: string): Promise<IDBDatabase> {
  const idb: IDBFactory = globalThis.indexedDB;

  if (knownStores.has(neededStore) && dbPromise !== null) {
    return dbPromise;
  }

  // Close the old connection before re-opening at a higher version.
  // Without this, the pending open request at the new version will be blocked
  // by the still-live connection and `onblocked` fires → the promise rejects.
  if (dbPromise !== null) {
    const oldDb = await dbPromise.catch(() => null);
    oldDb?.close();
  }

  // Need a fresh open (new store or first call).
  knownStores.add(neededStore);

  // Version = number of distinct stores we know about.
  // Monotonically growing integer across the app's lifetime.
  const version = knownStores.size;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const openReq = idb.open(DB_NAME, version);

    openReq.onupgradeneeded = (evt) => {
      const db = openReq.result;
      // Create any store that doesn't already exist yet.
      for (const name of knownStores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
      void evt; // version info not needed here
    };

    openReq.onsuccess = () => {
      const db = openReq.result;
      // If another tab (or this tab) triggers a version upgrade, cleanly drop
      // the connection so the new open isn't blocked.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    openReq.onerror = () =>
      reject(new Error('IDB open failed', { cause: openReq.error }));
    openReq.onblocked = () =>
      reject(new Error('IDB open blocked by existing connection'));
  });

  return dbPromise;
}

// ── No-op stub (when indexedDB is unavailable) ───────────────────────────────

function noopStore<V>(): IdbStore<V> {
  return {
    get: (_key: string) => Promise.resolve(undefined),
    put: (_key: string, _value: V) => Promise.resolve(),
    delete: (_key: string) => Promise.resolve(),
    keys: () => Promise.resolve([]),
    clear: () => Promise.resolve(),
  };
}

// ── Write helper ─────────────────────────────────────────────────────────────

/**
 * Run a single write request inside a readwrite transaction and wait for both
 * the request to complete AND the transaction to commit.
 *
 * txDone() registers its handler synchronously before any await, ensuring it
 * sees the oncomplete event even if the fake/real IDB fires it via
 * queueMicrotask immediately after the request resolves.
 */
async function writeOp(
  storeName: string,
  buildRequest: (store: IDBObjectStore) => IDBRequest<unknown>,
): Promise<void> {
  const db = await openDb(storeName);
  const tx = db.transaction(storeName, 'readwrite');
  // Register txDone BEFORE any await so the handler is set synchronously.
  const done = txDone(tx);
  const store = tx.objectStore(storeName);
  await request(buildRequest(store));
  await done;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Open or create a typed object store. Calling this with a previously
 * unseen storeName triggers a version bump + onupgradeneeded.
 * Repeated calls with the same storeName return equivalent handles.
 *
 * Returns a no-op stub immediately when indexedDB is unavailable.
 */
export function openStore<V = unknown>(storeName: string): IdbStore<V> {
  // Check availability eagerly — if absent return stub without touching DB.
  if (typeof globalThis.indexedDB === 'undefined') {
    return noopStore<V>();
  }

  return {
    async get(key: string): Promise<V | undefined> {
      const db = await openDb(storeName);
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return request<V | undefined>(store.get(key) as IDBRequest<V | undefined>);
    },

    put(key: string, value: V): Promise<void> {
      return writeOp(storeName, (store) => store.put(value, key));
    },

    delete(key: string): Promise<void> {
      return writeOp(storeName, (store) => store.delete(key));
    },

    async keys(): Promise<string[]> {
      const db = await openDb(storeName);
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return request<string[]>(store.getAllKeys() as IDBRequest<string[]>);
    },

    clear(): Promise<void> {
      return writeOp(storeName, (store) => store.clear());
    },
  };
}

/**
 * Close any open DB connection and reset internal state.
 * Primarily intended for tests that need a clean slate between runs.
 */
export async function closeAll(): Promise<void> {
  if (dbPromise !== null) {
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  }
  knownStores = new Set<string>();
}
