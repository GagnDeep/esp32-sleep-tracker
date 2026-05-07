/**
 * Global keyboard shortcut bus.
 *
 * Supports:
 *  - Single-key shortcuts: '?', 'Escape', 'mod+k', 'shift+/', 'alt+t'
 *  - 2-key sequence shortcuts: ['g','h'], ['g','t'], ['g','l']
 *  - Input filtering (ignores events from input/textarea/select/contenteditable)
 *  - Reactive registration/unregistration (component lifecycle friendly)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Combo =
  | string                       // single key: '?', 'Escape', 'mod+k', 'shift+/', 'alt+t'
  | readonly [string, string];   // sequence:   ['g', 'h']

export interface ShortcutHandle {
  unregister(): void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ParsedKey {
  key: string;
  mod: boolean;   // Cmd on Mac, Ctrl elsewhere
  shift: boolean;
  alt: boolean;
}

interface Registration {
  parsed: ParsedKey | readonly [ParsedKey, ParsedKey]; // single or sequence
  handler: (e: KeyboardEvent) => void;
  allowInInput: boolean;
  id: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let registrations: Registration[] = [];
let nextId = 0;

// Sequence state: if non-null we are waiting for the second key
interface PendingSequence {
  first: ParsedKey;
  timerId: ReturnType<typeof setTimeout>;
  fromInput: boolean; // whether the first key came from an input element
}
let pendingSequence: PendingSequence | null = null;

// Installation tracking (idempotency)
let installedTarget: EventTarget | null = null;
let boundListener: ((e: Event) => void) | null = null;

const SEQUENCE_TIMEOUT_MS = 750;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a combo string like 'mod+k', 'shift+/', 'alt+t', '?', 'Escape'.
 * Modifier prefixes are case-insensitive and order-insensitive.
 */
function parseKey(combo: string): ParsedKey {
  const parts = combo.toLowerCase().split('+');

  // The actual key is the last non-modifier segment, but we need to
  // preserve the original case of the key for matching against event.key.
  // Re-split the original string to get the correctly-cased key.
  const originalParts = combo.split('+');

  let mod = false;
  let shift = false;
  let alt = false;

  const keyParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i];
    if (lower === 'mod' || lower === 'ctrl' || lower === 'meta') {
      mod = true;
    } else if (lower === 'shift') {
      shift = true;
    } else if (lower === 'alt') {
      alt = true;
    } else {
      keyParts.push(originalParts[i]);
    }
  }

  const key = keyParts.join('+');

  if (keyParts.length === 0 || key === '') {
    throw new TypeError(`Invalid shortcut combo: '${combo}' has no key`);
  }

  return { key, mod, shift, alt };
}

function parseCombo(combo: Combo): ParsedKey | readonly [ParsedKey, ParsedKey] {
  if (Array.isArray(combo)) {
    const [first, second] = combo as readonly [string, string];
    return [parseKey(first), parseKey(second)] as const;
  }
  return parseKey(combo as string);
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a mod key (Cmd or Ctrl) is being held, cross-platform.
 * We accept either metaKey OR ctrlKey as "mod" so that mod+k works on
 * both macOS (Cmd) and Windows/Linux (Ctrl).
 */
function modActive(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

function keyMatches(parsed: ParsedKey, e: KeyboardEvent): boolean {
  if (e.key !== parsed.key) return false;
  if (parsed.mod !== modActive(e)) return false;
  if (parsed.shift !== e.shiftKey) return false;
  if (parsed.alt !== e.altKey) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Input filtering
// ---------------------------------------------------------------------------

function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Use isContentEditable (standard DOM) which handles all valid forms of the
  // attribute ('true', '', bare, 'plaintext-only'). Fall back to attribute
  // inspection for environments (e.g. jsdom) that don't implement the property.
  const el = target as HTMLElement;
  if (typeof el.isContentEditable === 'boolean') {
    return el.isContentEditable;
  }
  const ce = target.getAttribute('contenteditable');
  if (ce === 'true' || ce === '' || ce === 'plaintext-only') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Core keydown handler
// ---------------------------------------------------------------------------

function handleKeydown(e: Event): void {
  if (!(e instanceof KeyboardEvent)) return;

  const fromInput = isInputElement(e.target);

  // ── Sequence: waiting for second key ─────────────────────────────────────
  if (pendingSequence !== null) {
    const pending = pendingSequence;
    clearTimeout(pending.timerId);
    pendingSequence = null;

    // Find registrations whose first key matched (already confirmed) and
    // whose second key matches now.
    for (const reg of registrations) {
      if (!Array.isArray(reg.parsed)) continue;
      const [first, second] = reg.parsed as readonly [ParsedKey, ParsedKey];
      // Check first matches the pending key and second matches current event
      if (
        pending.first.key === first.key &&
        pending.first.mod === first.mod &&
        pending.first.shift === first.shift &&
        pending.first.alt === first.alt &&
        keyMatches(second, e)
      ) {
        // Filter: skip if input-originated at either the first or second key,
        // unless allowInInput is true.
        if (!reg.allowInInput && (pending.fromInput || fromInput)) continue;
        // Only call preventDefault when not in an input (or allowInInput is false)
        if (!(reg.allowInInput && fromInput)) e.preventDefault();
        reg.handler(e);
      }
    }
    // Whether or not it fired, the pending sequence is consumed.
    // If nothing matched, we might still want to re-process this key as a
    // regular shortcut or first-of-sequence — but the spec says a non-matching
    // key cancels. We do NOT re-process here.
    return;
  }

  // ── Check sequence first-keys ─────────────────────────────────────────────
  let firstKeyOfSequence: ParsedKey | null = null;
  for (const reg of registrations) {
    if (!Array.isArray(reg.parsed)) continue;
    const [first] = reg.parsed as readonly [ParsedKey, ParsedKey];
    if (!keyMatches(first, e)) continue;
    // When the first key comes from an input, only consider registrations with
    // allowInInput so we don't enter pending state for sequences that shouldn't
    // fire from inputs.
    if (fromInput && !reg.allowInInput) continue;
    firstKeyOfSequence = first;
    break; // All sequences sharing the same first key use the same pending
  }

  if (firstKeyOfSequence !== null) {
    // Start pending window
    const captured = firstKeyOfSequence;
    const timerId = setTimeout(() => {
      pendingSequence = null;
    }, SEQUENCE_TIMEOUT_MS);
    pendingSequence = { first: captured, timerId, fromInput };
    // Don't preventDefault here — the first key alone isn't a shortcut yet.
    return;
  }

  // ── Single-key shortcuts ─────────────────────────────────────────────────
  for (const reg of registrations) {
    if (Array.isArray(reg.parsed)) continue;
    const parsed = reg.parsed as ParsedKey;
    if (!keyMatches(parsed, e)) continue;
    if (!reg.allowInInput && fromInput) continue;
    // Only call preventDefault when not in an input (or allowInInput is false)
    if (!(reg.allowInInput && fromInput)) e.preventDefault();
    reg.handler(e);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a global shortcut. Returns a handle with .unregister().
 * Handler fires only when no input/textarea/select/contenteditable has focus
 * (unless allowInInput is true).
 */
export function registerShortcut(
  combo: Combo,
  handler: (e: KeyboardEvent) => void,
  opts?: { allowInInput?: boolean },
): ShortcutHandle {
  const id = nextId++;
  const reg: Registration = {
    parsed: parseCombo(combo),
    handler,
    allowInInput: opts?.allowInInput ?? false,
    id,
  };
  registrations.push(reg);

  return {
    unregister() {
      registrations = registrations.filter((r) => r.id !== id);
    },
  };
}

/**
 * Install the global keydown listener on `target` (default: window).
 * Returns a function that removes the listener.
 *
 * **Idempotent on the same target** — a second call with the same target
 * returns a no-op uninstaller; the listener is not duplicated.
 *
 * **Target switching** — if called with a *different* target, the previous
 * listener is removed automatically and the new target is used. Any
 * uninstaller returned by the prior call becomes a no-op once this happens.
 *
 * **Lifecycle guidance** — callers should retain the FIRST install's
 * uninstaller and call it on teardown. Subsequent installs on the same
 * target are safe to ignore.
 */
export function installKeyboardBus(target: EventTarget = window): () => void {
  if (installedTarget === target && boundListener !== null) {
    // Already installed on this target — return a no-op uninstaller
    return () => {};
  }

  // If previously installed on a different target, remove old listener
  if (installedTarget !== null && boundListener !== null) {
    installedTarget.removeEventListener('keydown', boundListener);
  }

  boundListener = handleKeydown;
  installedTarget = target;
  target.addEventListener('keydown', boundListener);

  return () => {
    if (installedTarget === target && boundListener !== null) {
      target.removeEventListener('keydown', boundListener);
      installedTarget = null;
      boundListener = null;
    }
  };
}

/**
 * Returns the count of currently registered shortcuts.
 * Useful for diagnostics and tests.
 */
export function shortcutCount(): number {
  return registrations.length;
}

// ---------------------------------------------------------------------------
// Test-only reset hook
// ---------------------------------------------------------------------------

/**
 * __resetForTests — clears all module state so tests start clean.
 * Named with double-underscores to make it obvious this is test-only.
 */
export function __resetForTests(): void {
  if (pendingSequence !== null) {
    clearTimeout(pendingSequence.timerId);
    pendingSequence = null;
  }
  if (installedTarget !== null && boundListener !== null) {
    installedTarget.removeEventListener('keydown', boundListener);
  }
  registrations = [];
  nextId = 0;
  installedTarget = null;
  boundListener = null;
}
