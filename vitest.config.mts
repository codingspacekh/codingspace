import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Unit tests expect the default media address, whatever the shell or CI job has set.
    env: { NEXT_PUBLIC_MEDIA_BASE_URL: '', MEDIA_STORE: '' },
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'patches/**/*.mjs'],
      // Database adapters are exercised by tests/integration (npm run test:int), not unit tests.
      exclude: [
        'src/pages/**',
        '**/*.d.ts',
        'src/server/content/supabase-store.ts',
        'src/server/data/public.ts',
        'src/server/admin/posts.ts',
        'src/server/admin/list.ts',
        'src/server/admin/sections.ts',
        'src/server/admin/preview.ts',
        'src/server/media/uploads.ts',
        'src/server/media/library.ts',
        'src/server/admin/site.ts',
      ],
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
