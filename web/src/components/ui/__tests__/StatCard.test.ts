// @vitest-environment node
// Smoke tests for StatCard using preact-render-to-string.

import { describe, it, expect } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { StatCard } from '../StatCard';
import type { StatCardProps } from '../StatCard';

function card(props: StatCardProps) {
  return render(h(StatCard, props));
}

describe('StatCard', () => {
  it('renders label and value', () => {
    const out = card({ label: 'Sleep Score', value: '82' });
    expect(out).toContain('Sleep Score');
    expect(out).toContain('82');
  });

  it('renders optional unit', () => {
    const out = card({ label: 'HR', value: '58', unit: 'bpm' });
    expect(out).toContain('bpm');
  });

  it('renders hint when provided', () => {
    const out = card({ label: 'Deep', value: '1h 20m', hint: 'below avg' });
    expect(out).toContain('below avg');
  });

  it('renders as div with role=group when no onClick', () => {
    const out = card({ label: 'Score', value: '80' });
    expect(out).toContain('role="group"');
    expect(out).not.toContain('<button');
  });

  it('renders as button when onClick is provided', () => {
    const out = card({ label: 'Score', value: '80', onClick: () => {} });
    expect(out).toContain('<button');
    expect(out).toContain('type="button"');
  });

  it('composes aria-label from label + value + unit', () => {
    const out = card({ label: 'HR', value: '58', unit: 'bpm' });
    expect(out).toContain('HR: 58 bpm');
  });

  it('respects user-provided ariaLabel', () => {
    const out = card({ label: 'HR', value: '58', ariaLabel: 'Custom label' });
    expect(out).toContain('Custom label');
    expect(out).not.toContain('HR: 58');
  });

  it('renders trend chevron and delta', () => {
    const out = card({ label: 'Score', value: '82', trend: { delta: 3, deltaUnit: 'pts' } });
    expect(out).toContain('+3 pts');
    expect(out).toContain('<svg');
  });

  it('renders negative trend with − sign', () => {
    const out = card({ label: 'Score', value: '79', trend: { delta: -2 } });
    expect(out).toContain('−2');
  });

  it('flat trend (delta=0) has ink-muted color class', () => {
    const out = card({ label: 'Score', value: '80', trend: { delta: 0 } });
    expect(out).toContain('text-ink-muted');
  });

  it('natural semantics: up delta gets text-good', () => {
    const out = card({ label: 'Score', value: '85', trend: { delta: 5, semantics: 'natural' } });
    expect(out).toContain('text-good');
  });

  it('inverted semantics: up delta gets text-bad', () => {
    const out = card({ label: 'Awakenings', value: '4', trend: { delta: 2, semantics: 'inverted' } });
    expect(out).toContain('text-bad');
  });

  it('inverted semantics: down delta gets text-good', () => {
    const out = card({ label: 'Awakenings', value: '2', trend: { delta: -2, semantics: 'inverted' } });
    expect(out).toContain('text-good');
  });

  it('includes trend in aria-label', () => {
    const out = card({ label: 'Score', value: '82', trend: { delta: 3 } });
    expect(out).toContain('trend up 3');
  });

  it('renders sparkline footer when spark is provided', () => {
    const out = card({ label: 'Score', value: '82', spark: [70, 75, 80, 82] });
    expect(out).toContain('<svg');
    expect(out).toContain('opacity-70');
  });

  it('does not render sparkline when spark is absent', () => {
    const out = card({ label: 'Score', value: '82' });
    // No sparkline SVG should appear (the chevron also emits svg, so check opacity-70)
    expect(out).not.toContain('opacity-70');
  });

  it('applies tone color class to value', () => {
    const out = card({ label: 'Score', value: '82', tone: 'bad' });
    expect(out).toContain('text-bad');
  });

  it('applies custom class to wrapper', () => {
    const out = card({ label: 'Score', value: '82', class: 'my-custom' });
    expect(out).toContain('my-custom');
  });
});
