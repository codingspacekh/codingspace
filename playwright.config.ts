import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production build: CSP, bundles and SSR differ in dev mode.
// In CI, BASE_URL can point at a Vercel preview deployment instead.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const SITE_ADMIN = /admin-site\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: SITE_ADMIN },
    // @single-account tests share one admin account and authenticator: one project runs them.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grepInvert: /@single-account/, testIgnore: SITE_ADMIN },
    // Editing projects, the profile and the problem of the week changes what the public-page
    // tests check, so these run alone, after everything else, and put the content back.
    {
      name: 'site-admin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: SITE_ADMIN,
      dependencies: ['desktop', 'mobile'],
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
