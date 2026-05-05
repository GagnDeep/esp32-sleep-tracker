import { defineConfig } from 'vitest/config';

// Pure tests run in node — fast, no JSDOM cost. Tests that touch DOM
// APIs can opt in via /** @vitest-environment jsdom */.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
    typecheck: {
      tsconfig: './tsconfig.json',
    },
  },
});
