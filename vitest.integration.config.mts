import { defineConfig } from 'vitest/config';

// Integration tests against a local Supabase (`supabase start`). Keys come from
// `supabase status -o env` (API_URL, ANON_KEY, SERVICE_ROLE_KEY); see the CI database job.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
