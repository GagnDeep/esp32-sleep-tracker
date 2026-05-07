// @vitest-environment node
// Tests for EventPin using preact-render-to-string (no new deps).

import { describe, it, expect, vi } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { EventPin, PIN_ICONS, type EventPinKind } from '../EventPin';

type Props = Parameters<typeof EventPin>[0];

function renderPin(props: Props): string {
  return render(h(EventPin, props));
}

describe('EventPin', () => {
  it('renders at correct left% for t within range', () => {
    const out = renderPin({ t: 500, durationMs: 1000, kind: 'note' });
    expect(out).toContain('left:50%');
  });

  it('clamps t below 0 to left: 0%', () => {
    const out = renderPin({ t: -100, durationMs: 1000, kind: 'note' });
    expect(out).toContain('left:0%');
  });

  it('clamps t above durationMs to left: 100%', () => {
    const out = renderPin({ t: 2000, durationMs: 1000, kind: 'note' });
    expect(out).toContain('left:100%');
  });

  it('renders at 0% when durationMs is 0 (guard)', () => {
    const out = renderPin({ t: 500, durationMs: 0, kind: 'note' });
    expect(out).toContain('left:0%');
  });

  it('renders at 25% correctly', () => {
    const out = renderPin({ t: 250, durationMs: 1000, kind: 'wake' });
    expect(out).toContain('left:25%');
  });

  it('defaults aria-label to kind when title is omitted', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'alarm-fire' });
    expect(out).toContain('aria-label="alarm-fire"');
  });

  it('uses title as aria-label when provided', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note', title: 'My annotation' });
    expect(out).toContain('aria-label="My annotation"');
    expect(out).toContain('My annotation');
  });

  it('alarm-fire maps to text-warn color class', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'alarm-fire' });
    expect(out).toContain('text-warn');
  });

  it('alarm-snooze maps to text-ink-muted color class', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'alarm-snooze' });
    expect(out).toContain('text-ink-muted');
  });

  it('motion-spike maps to text-bad color class', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'motion-spike' });
    expect(out).toContain('text-bad');
  });

  it('note maps to text-accent color class', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note' });
    expect(out).toContain('text-accent');
  });

  it('wake maps to text-good color class', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'wake' });
    expect(out).toContain('text-good');
  });

  it('each kind has an entry in PIN_ICONS', () => {
    const kinds: EventPinKind[] = ['alarm-fire', 'alarm-snooze', 'motion-spike', 'note', 'wake', 'custom'];
    for (const kind of kinds) {
      expect(PIN_ICONS[kind]).toBeTruthy();
    }
  });

  it('renders default icon path from PIN_ICONS', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'motion-spike' });
    expect(out).toContain(PIN_ICONS['motion-spike']);
  });

  it('iconPath overrides default icon', () => {
    const customPath = 'M0 0 L24 24';
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note', iconPath: customPath });
    expect(out).toContain(customPath);
    expect(out).not.toContain(PIN_ICONS['note']);
  });

  it('renders as button and is focusable when onClick is provided', () => {
    const handler = vi.fn();
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'wake', onClick: handler });
    expect(out).toContain('<button');
    expect(out).toContain('tabindex');
  });

  it('renders as span (not button) when no onClick', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note' });
    expect(out).not.toContain('<button');
    expect(out).toContain('<span');
  });

  it('renders hairline drop-line element', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note' });
    expect(out).toContain('opacity-40');
  });

  it('applies extra class prop', () => {
    const out = renderPin({ t: 0, durationMs: 1000, kind: 'note', class: 'my-pin' });
    expect(out).toContain('my-pin');
  });
});
