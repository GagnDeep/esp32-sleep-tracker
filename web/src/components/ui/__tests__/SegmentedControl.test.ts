/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { render as domRender } from 'preact';
import { act } from 'preact/test-utils';
import { SegmentedControl } from '../SegmentedControl';
import type { SegmentedControlProps } from '../SegmentedControl';

type Range = '7d' | '28d' | '90d' | 'all';

const OPTIONS = [
  { value: '7d'  as Range, label: '7 days',  shortLabel: '7d'  },
  { value: '28d' as Range, label: '28 days', shortLabel: '28d' },
  { value: '90d' as Range, label: '90 days', shortLabel: '90d' },
  { value: 'all' as Range, label: 'All' },
] as const;

function make(overrides: Partial<SegmentedControlProps<Range>> = {}) {
  return render(
    h(SegmentedControl<Range>, {
      options: OPTIONS,
      value: '7d',
      onChange: () => {},
      ...overrides,
    }),
  );
}

describe('SegmentedControl', () => {
  it('renders all option labels', () => {
    const out = make();
    expect(out).toContain('7 days');
    expect(out).toContain('28 days');
    expect(out).toContain('90 days');
    expect(out).toContain('All');
  });

  it('selected option has aria-selected="true"', () => {
    const out = make({ value: '28d' });
    expect(out).toContain('aria-selected="true"');
  });

  it('non-selected options have aria-selected="false"', () => {
    const out = make({ value: '7d' });
    const trueCount = (out.match(/aria-selected="true"/g) ?? []).length;
    const falseCount = (out.match(/aria-selected="false"/g) ?? []).length;
    expect(trueCount).toBe(1);
    expect(falseCount).toBe(OPTIONS.length - 1);
  });

  it('renders role="tablist" wrapper', () => {
    const out = make();
    expect(out).toContain('role="tablist"');
  });

  it('renders role="tab" on each button', () => {
    const out = make();
    const count = (out.match(/role="tab"/g) ?? []).length;
    expect(count).toBe(OPTIONS.length);
  });

  it('selected button has tabindex 0, others have -1', () => {
    const out = make({ value: '7d' });
    expect(out).toContain('tabindex="0"');
    const negOnes = (out.match(/tabindex="-1"/g) ?? []).length;
    expect(negOnes).toBe(OPTIONS.length - 1);
  });

  it('applies ariaLabel to the tablist', () => {
    const out = make({ ariaLabel: 'Time range' });
    expect(out).toContain('aria-label="Time range"');
  });

  it('renders shortLabel span with sm:hidden class', () => {
    const out = make();
    expect(out).toContain('sm:hidden');
    expect(out).toContain('7d');
  });

  it('disabled option renders with disabled attribute', () => {
    const opts = [
      ...OPTIONS.slice(0, 3),
      { value: 'all' as Range, label: 'All', disabled: true },
    ] as const;
    const out = make({ options: opts });
    expect(out).toContain('disabled');
  });
});

describe('keyboard / click behavior', () => {
  let root: HTMLDivElement;

  function setup(value: Range, onChange: (v: Range) => void, opts = OPTIONS) {
    root = document.createElement('div');
    document.body.appendChild(root);
    act(() => {
      domRender(
        h(SegmentedControl<Range>, { options: opts, value, onChange }),
        root,
      );
    });
    return root.querySelectorAll('button');
  }

  afterEach(() => {
    if (root) {
      domRender(null as unknown as ReturnType<typeof h>, root);
      root.remove();
    }
  });

  it('ArrowRight moves selection to next enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('28d');
  });

  it('ArrowRight wraps from last to first enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('all', onChange);
    act(() => { buttons[3].focus(); });
    act(() => { buttons[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('ArrowLeft moves selection to previous enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('28d', onChange);
    act(() => { buttons[1].focus(); });
    act(() => { buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('ArrowLeft wraps from first to last enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('ArrowDown moves selection to next enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('28d');
  });

  it('ArrowUp moves selection to previous enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('28d', onChange);
    act(() => { buttons[1].focus(); });
    act(() => { buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('Home jumps to first enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('90d', onChange);
    act(() => { buttons[2].focus(); });
    act(() => { buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('End jumps to last enabled option', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('ArrowRight skips disabled options', () => {
    const onChange = vi.fn();
    const opts = [
      { value: '7d'  as Range, label: '7 days' },
      { value: '28d' as Range, label: '28 days', disabled: true },
      { value: '90d' as Range, label: '90 days' },
    ] as const;
    const buttons = setup('7d', onChange, opts);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('90d');
  });

  it('ArrowLeft when value is not in enabled options lands on last enabled option', () => {
    const onChange = vi.fn();
    // '28d' is disabled, so value='28d' won't be found in enabledOptions (rawIdx === -1 → currentIdx = 0)
    // ArrowLeft from clamped index 0 should wrap to last = '90d'
    const opts = [
      { value: '7d'  as Range, label: '7 days' },
      { value: '28d' as Range, label: '28 days', disabled: true },
      { value: '90d' as Range, label: '90 days' },
    ] as const;
    const buttons = setup('28d', onChange, opts);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('90d');
  });

  it('ArrowRight when value is not in enabled options lands on second enabled option', () => {
    const onChange = vi.fn();
    // '28d' is disabled → rawIdx === -1 → currentIdx = 0 → ArrowRight lands on index 1 = '90d'
    const opts = [
      { value: '7d'  as Range, label: '7 days' },
      { value: '28d' as Range, label: '28 days', disabled: true },
      { value: '90d' as Range, label: '90 days' },
    ] as const;
    const buttons = setup('28d', onChange, opts);
    act(() => { buttons[0].focus(); });
    act(() => { buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('90d');
  });

  it('clicking a non-selected enabled option calls onChange', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[1].click(); });
    expect(onChange).toHaveBeenCalledWith('28d');
  });

  it('clicking the already-selected option does NOT call onChange', () => {
    const onChange = vi.fn();
    const buttons = setup('7d', onChange);
    act(() => { buttons[0].click(); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking a disabled option does NOT call onChange', () => {
    const onChange = vi.fn();
    const opts = [
      { value: '7d'  as Range, label: '7 days' },
      { value: '28d' as Range, label: '28 days', disabled: true },
    ] as const;
    const buttons = setup('7d', onChange, opts);
    act(() => { buttons[1].click(); });
    expect(onChange).not.toHaveBeenCalled();
  });
});
