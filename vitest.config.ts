import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', 'build', 'coverage'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
