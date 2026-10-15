import { defineConfig, devices } from '@playwright/test';

// M0 spike: every test runs against a production build (next build && next start),
// because CSP, bundle size and SSR output differ in dev mode.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
