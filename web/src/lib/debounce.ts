// Trailing-edge debounce. Returns a callable that resets a timer on
// every invocation and only fires the underlying fn once the user has
// been quiet for `wait` ms. The exposed `.cancel()` clears any pending
// fire (e.g. on component unmount or explicit save).

export interface Debounced<T extends unknown[]> {
  (...args: T): void;
  cancel(): void;
  flush(): void;
}

export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  wait: number,
): Debounced<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: T | null = null;
  const wrapped = ((...args: T) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      const a = lastArgs!;
      lastArgs = null;
      fn(...a);
    }, wait);
  }) as Debounced<T>;
  wrapped.cancel = () => {
    if (t) { clearTimeout(t); t = null; }
    lastArgs = null;
  };
  wrapped.flush = () => {
    if (t && lastArgs) {
      clearTimeout(t);
      t = null;
      const a = lastArgs;
      lastArgs = null;
      fn(...a);
    }
  };
  return wrapped;
}
