/// <reference lib="webworker" />
// Tiny offline shell. Caches the SPA + past-session JSON so users can
// browse history without a connection. /api/status and /ws are never
// cached — those have to come from the device live.
export {};

// Cast `self` to the SW global. Without this, TS resolves `self` as
// Window because the project uses the DOM lib for everything else;
// rather than splinter into a second tsconfig just for one file, we
// trust the runtime here.
const sw = self as unknown as ServiceWorkerGlobalScope;

const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const SESSIONS = `sessions-${VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

// Match the build's hashed asset paths (`/assets/index-abcd1234.js`).
// We deliberately do NOT cache other GET origins — ranged media,
// Range-headed audio fetches, or partial responses must reach the
// network so the browser sees the proper 206/Content-Range chain.
const ASSETS_RE = /^\/assets\/.+/;
const ALLOWLIST_RE = /^(\/|\/index\.html|\/manifest\.webmanifest|\/assets\/.+)$/;

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Range requests should never be served from cache — partials
  // confuse the media element and we'd happily store one and replay it.
  if (req.headers.has('range')) return;

  const url = new URL(req.url);

  if (url.pathname.startsWith('/ws')) return;
  if (url.pathname === '/api/status') return;
  if (url.pathname.startsWith('/api/sessions') && url.pathname.endsWith('/raw')) return;

  // Per-session JSON: stale-while-revalidate so History stays usable
  // offline once a session has been viewed online.
  if (url.pathname.startsWith('/api/sessions/') && !url.pathname.endsWith('.csv')) {
    event.respondWith(swr(req, SESSIONS));
    return;
  }

  // Navigation requests: try network, fall back to cached `/index.html`
  // when offline. This keeps the SPA shell available without a
  // connection while letting hot reloads / new builds win when online.
  if (req.mode === 'navigate') {
    event.respondWith(navigationFallback(req));
    return;
  }

  if (ALLOWLIST_RE.test(url.pathname) || ASSETS_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL));
  }
});

async function cacheFirst(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

async function swr(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? new Response(null, { status: 504 }));
  return hit ?? fetchPromise;
}

async function navigationFallback(req: Request): Promise<Response> {
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) {
      const cache = await caches.open(SHELL);
      cache.put('/index.html', res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL);
    const hit = await cache.match('/index.html');
    if (hit) return hit;
    return new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}
