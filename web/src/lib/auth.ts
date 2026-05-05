// Optional 4-digit PIN auth. When set, the client adds `X-Pin: <pin>`
// to every mutating API call. The signal mirrors localStorage so reloads
// stay logged in. `pinRequired` is flipped by api.ts on a 401 so the
// app shell can redirect to /unlock.

import { signal, effect } from '@preact/signals';

const STORAGE_KEY = 'auth.pin';

function readInitial(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export const pin = signal<string>(readInitial());
export const pinRequired = signal<boolean>(false);

// Persist pin changes back to localStorage.
effect(() => {
  try {
    if (pin.value) localStorage.setItem(STORAGE_KEY, pin.value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures (private mode, quota)
  }
});

export function setPin(p: string): void {
  pin.value = p;
}

export function clearPin(): void {
  pin.value = '';
}

export function headers(): Record<string, string> {
  return pin.value ? { 'X-Pin': pin.value } : {};
}
