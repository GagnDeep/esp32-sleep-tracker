// @vitest-environment node
// Smoke tests for Drawer using preact-render-to-string.

import { describe, it, expect } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { Drawer } from '../Drawer';
import type { DrawerProps } from '../Drawer';

function drawer(props: Partial<DrawerProps> & { open: boolean }) {
  return render(
    h(Drawer, { onClose: () => {}, ...props })
  );
}

describe('Drawer', () => {
  it('returns null (empty string) when open=false', () => {
    const out = drawer({ open: false, title: 'Test' });
    expect(out).toBe('');
  });

  it('renders title and close button when open=true', () => {
    const out = drawer({ open: true, title: 'Session Details' });
    expect(out).toContain('Session Details');
    expect(out).toContain('aria-label="Close"');
  });

  it('has role="dialog" and aria-modal="true"', () => {
    const out = drawer({ open: true, title: 'Test' });
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
  });

  it('aria-labelledby matches the title element id', () => {
    const out = drawer({ open: true, title: 'My Drawer' });
    // Extract aria-labelledby value
    const labelledByMatch = out.match(/aria-labelledby="([^"]+)"/);
    expect(labelledByMatch).not.toBeNull();
    const labelId = labelledByMatch![1];
    // The title element should have that same id
    expect(out).toContain(`id="${labelId}"`);
  });

  it('respects custom ariaLabelledBy prop', () => {
    const out = drawer({ open: true, title: 'Test', ariaLabelledBy: 'custom-id' });
    expect(out).toContain('aria-labelledby="custom-id"');
    expect(out).toContain('id="custom-id"');
  });

  it('renders children', () => {
    const out = render(
      h(Drawer, { open: true, onClose: () => {}, title: 'T' },
        h('p', null, 'Child content'))
    );
    expect(out).toContain('Child content');
  });

  it('renders footer when provided', () => {
    const out = render(
      h(Drawer, {
        open: true,
        onClose: () => {},
        title: 'T',
        footer: h('button', null, 'Save'),
      })
    );
    expect(out).toContain('Save');
  });

  it('positions panel on right by default', () => {
    const out = drawer({ open: true });
    expect(out).toContain('right-0');
    expect(out).not.toContain('left-0');
  });

  it('positions panel on left when side="left"', () => {
    const out = drawer({ open: true, side: 'left' });
    expect(out).toContain('left-0');
    expect(out).not.toContain('right-0');
  });

  it('applies custom widthClass', () => {
    const out = drawer({ open: true, widthClass: 'w-80' });
    expect(out).toContain('w-80');
  });

  it('includes motion-safe transition class', () => {
    const out = drawer({ open: true });
    expect(out).toContain('motion-safe:transition-transform');
  });

  it('backdrop has aria-hidden', () => {
    const out = drawer({ open: true });
    expect(out).toContain('aria-hidden="true"');
  });

  it('close button is rendered with type="button"', () => {
    const out = drawer({ open: true, title: 'T' });
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-label="Close"');
  });
});
