import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'patches/**/*.mjs'],
      exclude: ['src/pages/**', '**/*.d.ts'],
      // NFR-MAINT-1: ≥ 90 % for src/lib and src/config, ≥ 70 % overall
      thresholds: {
        lines: 70,
        'src/lib/**': { lines: 90 },
        'src/config/**': { lines: 90 },
      },
    },
  },
});
