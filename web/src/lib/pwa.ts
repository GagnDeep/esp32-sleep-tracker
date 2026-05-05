// Service-worker registration. Kept tiny so it lands before any
// network request the SW could intercept.

export function registerSW(path = '/sw.js') {
  if (!('serviceWorker' in navigator)) return;
  // Defer until after first paint so the SPA isn't blocked behind it.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(path).catch(() => {
      // SW registration failures aren't fatal — caching is best-effort.
    });
  });
}
