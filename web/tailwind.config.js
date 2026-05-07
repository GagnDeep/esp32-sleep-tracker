/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OKLCH-derived palette. Defined in CSS via --tokens; expose
        // friendly aliases here so utilities like bg-surface work.
        surface:          'oklch(var(--surface)          / <alpha-value>)',
        'surface-2':      'oklch(var(--surface-2)        / <alpha-value>)',
        // surface-3: cards-on-cards layer; slightly lighter (dark) / darker (light) than surface-2
        'surface-3':      'oklch(var(--surface-3)        / <alpha-value>)',
        // surface-overlay: dialog/sheet/drawer backgrounds
        'surface-overlay': 'oklch(var(--surface-overlay) / <alpha-value>)',
        // hairline: for 1px borders, near-background subtlety
        hairline:         'oklch(var(--hairline)         / <alpha-value>)',
        ink:              'oklch(var(--ink)              / <alpha-value>)',
        'ink-muted':      'oklch(var(--ink-muted)        / <alpha-value>)',
        accent:           'oklch(var(--accent)           / <alpha-value>)',
        'accent-soft':    'oklch(var(--accent-soft)      / <alpha-value>)',
        good:             'oklch(var(--good)             / <alpha-value>)',
        warn:             'oklch(var(--warn)             / <alpha-value>)',
        bad:              'oklch(var(--bad)              / <alpha-value>)',
        deep:             'oklch(var(--stage-deep)       / <alpha-value>)',
        light:            'oklch(var(--stage-light)      / <alpha-value>)',
        awake:            'oklch(var(--stage-awake)      / <alpha-value>)',
      },
      // Motion tokens: ease-emphasis for page/modal transitions, duration-page for 240ms page transitions
      transitionTimingFunction: {
        emphasis: 'cubic-bezier(.2, .8, .2, 1)',
      },
      transitionDuration: {
        page: '240ms',
      },
      // Display typography for score ring (Today screen) and stat headers
      fontSize: {
        'display-xl': ['clamp(56px, 6vw, 88px)', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(40px, 4.2vw, 64px)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      fontFamily: {
        sans: ['"InterVariable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrainsMono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px oklch(0 0 0 / 0.08), 0 4px 12px oklch(0 0 0 / 0.06)',
      },
    },
  },
};
