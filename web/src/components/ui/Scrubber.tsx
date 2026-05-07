import { signal, computed } from '@preact/signals';
import type { Signal, ReadonlySignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import type { VNode } from 'preact';

export interface ScrubberState {
  /** Current cursor time in ms relative to startMs, or null when not active. */
  cursor: Signal<number | null>;
  /** Total duration in ms (read-only). */
  durationMs: ReadonlySignal<number>;
}

export function createScrubberState(durationMs: number): ScrubberState {
  const _dur = signal(durationMs);
  return {
    cursor: signal<number | null>(null),
    durationMs: computed(() => _dur.value),
  };
}

/** Subscribe to cursor changes. Returns unsubscribe fn. */
export function onCursorChange(
  state: ScrubberState,
  fn: (t: number | null) => void,
): () => void {
  return state.cursor.subscribe(fn);
}

/** Map cursor time (ms) to fractional position [0, 1], or null. */
export function cursorFraction(state: ScrubberState): number | null {
  const t = state.cursor.value;
  const d = state.durationMs.value;
  if (t === null || d === 0) return null;
  return Math.max(0, Math.min(1, t / d));
}

function defaultFormatLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function fractionFromPointer(track: HTMLElement, clientX: number): number {
  const rect = track.getBoundingClientRect();
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export interface ScrubberProps {
  state: ScrubberState;
  /** Optional tick marks at fractions [0..1]. */
  ticks?: ReadonlyArray<number>;
  /** Format label for the time bubble. Default: HH:MM:SS from ms. */
  formatLabel?: (t: number) => string;
  class?: string;
  ariaLabel?: string;
}

export function Scrubber(props: ScrubberProps): VNode {
  const { state, ticks, formatLabel = defaultFormatLabel,
          class: cls, ariaLabel = 'Timeline scrubber' } = props;
  const trackRef = useRef<HTMLDivElement>(null);

  const cursor = state.cursor.value;
  const dur = state.durationMs.value;
  const frac = cursorFraction(state);
  const pct = frac !== null ? `${(frac * 100).toFixed(3)}%` : '0%';
  const isActive = cursor !== null;

  function applyFraction(f: number) {
    state.cursor.value = Math.round(f * dur);
  }

  function onPointerDown(e: PointerEvent) {
    if (!trackRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyFraction(fractionFromPointer(trackRef.current, e.clientX));
  }

  function onPointerMove(e: PointerEvent) {
    if (!trackRef.current || e.buttons === 0) return;
    applyFraction(fractionFromPointer(trackRef.current, e.clientX));
  }

  function onPointerUp(e: PointerEvent) {
    if (!trackRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function onPointerLeave() {
    state.cursor.value = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = dur * 0.01;
    const cur = state.cursor.value ?? 0;
    switch (e.key) {
      case 'ArrowLeft':  state.cursor.value = Math.max(0, cur - step); break;
      case 'ArrowRight': state.cursor.value = Math.min(dur, cur + step); break;
      case 'Home':       state.cursor.value = 0; break;
      case 'End':        state.cursor.value = dur; break;
      default: return;
    }
    e.preventDefault();
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={dur}
      aria-valuenow={cursor ?? 0}
      class={[
        'relative flex items-center w-full select-none outline-none',
        'h-7 cursor-pointer rounded-full',
        cls ?? '',
      ].join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      {/* Track background */}
      <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-surface-2" />

      {/* Filled portion */}
      {isActive && (
        <div
          class="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-accent/40 pointer-events-none"
          style={{ width: pct }}
        />
      )}

      {/* Tick marks */}
      {ticks?.map((f) => (
        <div
          key={f}
          class="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-ink-muted/30 pointer-events-none"
          style={{ left: `${(f * 100).toFixed(3)}%` }}
        />
      ))}

      {/* Handle + time bubble */}
      {isActive && (
        <div
          class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none
                 motion-safe:transition-[left] motion-safe:duration-75"
          style={{ left: pct }}
        >
          {/* Time bubble */}
          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                      px-1.5 py-0.5 rounded text-[10px] font-mono leading-none
                      bg-surface-2 text-ink shadow-soft whitespace-nowrap">
            {formatLabel(cursor!)}
          </div>
          {/* Handle dot */}
          <div class="w-3 h-3 rounded-full bg-accent shadow-soft" />
        </div>
      )}
    </div>
  );
}
