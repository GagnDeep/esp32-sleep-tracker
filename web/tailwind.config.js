/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OKLCH-derived palette. Defined in CSS via --tokens; expose
        // friendly aliases here so utilities like bg-surface work.
        surface:        'oklch(var(--surface)          / <alpha-value>)',
        'surface-2':    'oklch(var(--surface-2)        / <alpha-value>)',
        ink:            'oklch(var(--ink)              / <alpha-value>)',
        'ink-muted':    'oklch(var(--ink-muted)        / <alpha-value>)',
        accent:         'oklch(var(--accent)           / <alpha-value>)',
        'accent-soft':  'oklch(var(--accent-soft)      / <alpha-value>)',
        good:           'oklch(var(--good)             / <alpha-value>)',
        warn:           'oklch(var(--warn)             / <alpha-value>)',
        bad:            'oklch(var(--bad)              / <alpha-value>)',
        deep:           'oklch(var(--stage-deep)       / <alpha-value>)',
        light:          'oklch(var(--stage-light)      / <alpha-value>)',
        awake:          'oklch(var(--stage-awake)      / <alpha-value>)',
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
