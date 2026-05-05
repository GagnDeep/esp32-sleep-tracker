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

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const SESSIONS = `sessions-${VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

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
  const url = new URL(req.url);

  if (url.pathname.startsWith('/ws')) return;
  if (url.pathname === '/api/status') return;
  if (url.pathname.startsWith('/api/sessions') && url.pathname.endsWith('/raw')) return;

  if (url.pathname.startsWith('/api/sessions/') && !url.pathname.endsWith('.csv')) {
    event.respondWith(swr(req, SESSIONS));
    return;
  }

  if (req.mode === 'navigate' || SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, SHELL));
  }
});

async function cacheFirst(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function swr(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => hit ?? new Response(null, { status: 504 }));
  return hit ?? fetchPromise;
}
