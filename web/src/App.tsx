// Top-level App shell. The router, routes, and live data wiring land in
// later commits; commit 9 ships a minimal "loading" surface so the
// build pipeline (Vite → gzip → manifest) can be verified end-to-end.
export function App() {
  return (
    <main class="min-h-full flex items-center justify-center p-6">
      <div class="max-w-sm w-full space-y-4 text-center">
        <div class="mx-auto h-12 w-12 rounded-full bg-accent-soft animate-pulse" />
        <h1 class="text-xl font-semibold tracking-tight">Sleep Tracker</h1>
        <p class="text-sm text-ink-muted">
          Booting up. If this screen sticks, your device probably isn't
          flashed yet — see <code class="text-ink">docs/flashing.md</code>.
        </p>
      </div>
    </main>
  );
}
