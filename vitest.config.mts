import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'patches/**/*.mjs'],
      // Database adapters are exercised by tests/integration (npm run test:int), not unit tests.
      exclude: ['src/pages/**', '**/*.d.ts', 'src/server/content/supabase-store.ts', 'src/server/data/public.ts'],
      // NFR-MAINT-1: ≥ 90 % for src/lib and src/config, ≥ 70 % overall
      thresholds: {
        lines: 70,
        'src/lib/**': { lines: 90 },
        'src/config/**': { lines: 90 },
        'src/server/**': { lines: 90 },
      },
    },
  },
});
