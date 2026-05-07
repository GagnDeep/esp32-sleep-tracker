// @vitest-environment node
// Tests for the Sparkline component using preact-render-to-string (no new deps).

import { describe, it, expect } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { Sparkline } from '../Sparkline';

interface ExtraProps {
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  baseline?: number;
  ariaLabel?: string;
  class?: string;
}

function svg(values: ReadonlyArray<number>, extra?: ExtraProps) {
  return render(h(Sparkline, { values, ...extra }));
}

describe('Sparkline', () => {
  it('renders empty svg for fewer than 2 finite points', () => {
    expect(svg([])).toContain('<svg');
    expect(svg([1])).toContain('<svg');
    expect(svg([NaN, NaN])).toContain('<svg');
    // No path drawn
    expect(svg([])).not.toContain('<path');
    expect(svg([1])).not.toContain('<path');
  });

  it('renders a path for 2+ valid points', () => {
    const out = svg([1, 2, 3]);
    expect(out).toContain('<path');
    expect(out).toContain('d=');
  });

  it('starts path with M command', () => {
    const out = svg([10, 20, 30]);
    const dMatch = out.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    expect(dMatch![1].startsWith('M')).toBe(true);
  });

  it('produces a flat mid-line for equal values', () => {
    const out = svg([5, 5, 5, 5]);
    expect(out).toContain('<path');
    const dMatch = out.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    // All y-coords must equal height/2 = 10 exactly (flat-line anchoring fix).
    const coords = dMatch![1].match(/[ML][\d.]+,([\d.]+)/g) ?? [];
    const ys = coords.map(c => c.replace(/[ML][\d.]+,/, ''));
    expect(ys.length).toBeGreaterThan(0);
    // height/2 = 10; toFixed(2) renders "10.00", so compare as float
    expect(ys.every(y => parseFloat(y) === 10)).toBe(true);
  });

  it('inserts pen-up (new M) across NaN gaps', () => {
    const out = svg([1, NaN, 3, 4]);
    const dMatch = out.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    // Expects two M commands: one before gap, one after
    const mCount = (dMatch![1].match(/M/g) ?? []).length;
    expect(mCount).toBe(2);
  });

  it('renders a baseline line when baseline prop is set', () => {
    const out = svg([1, 2, 3], { baseline: 1.5 });
    expect(out).toContain('<line');
    expect(out).toContain('stroke-opacity');
  });

  it('uses ariaLabel prop when provided', () => {
    const out = svg([1, 2], { ariaLabel: 'Custom label' });
    expect(out).toContain('Custom label');
  });

  it('auto-generates aria-label with point count and endpoints', () => {
    const out = svg([10, 20, 30]);
    expect(out).toContain('Trend:');
    expect(out).toContain('3 points');
    expect(out).toContain('10');
    expect(out).toContain('30');
  });

  it('respects custom width and height', () => {
    const out = svg([1, 2, 3], { width: 100, height: 40 });
    expect(out).toContain('width="100"');
    expect(out).toContain('height="40"');
  });

  it('applies class prop to svg element', () => {
    const out = svg([1, 2], { class: 'my-sparkline' });
    expect(out).toContain('my-sparkline');
  });
});
