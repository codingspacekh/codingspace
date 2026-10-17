import { defineConfig } from '@playwright/test';

// Read-only checks against the live site (M7): LIVE_URL=https://codingspacekh.dev npm run test:live
// Requests only, no browser: nothing here signs in, writes or uploads.
const baseURL = process.env.LIVE_URL;
if (!baseURL) throw new Error('Set LIVE_URL, e.g. LIVE_URL=https://codingspacekh.dev npm run test:live');

export default defineConfig({
  testDir: './tests/live',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL, extraHTTPHeaders: { 'User-Agent': 'codingspace-live-check' } },
});
