import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production build: CSP, bundles and SSR differ in dev mode.
// In CI, BASE_URL can point at a Vercel preview deployment instead.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
// Admin tests that publish or change what students see run after the public-page tests
// (which count lessons, check the featured project…), one file at a time: both use the
// same test account.
const ADMIN_POSTS = /admin-posts\.spec\.ts$/;
const SITE_ADMIN = /admin-site\.spec\.ts$/;
const CHANGES_CONTENT = [ADMIN_POSTS, SITE_ADMIN];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // The one-time sound offer is answered already, so it never covers what a test clicks.
    // (tests/e2e/experience.spec.ts tests the offer itself with a fresh browser.)
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'cs-prefs', value: '{"invited":true}' }] }],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: CHANGES_CONTENT },
    // @single-account tests share one admin account and authenticator: one project runs them.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grepInvert: /@single-account/, testIgnore: CHANGES_CONTENT },
    // Writing, publishing and deleting posts.
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ADMIN_POSTS,
      dependencies: ['desktop', 'mobile'],
    },
    // Projects, the profile and the problem of the week (they put the content back afterwards).
    { name: 'site-admin', use: { ...devices['Desktop Chrome'] }, testMatch: SITE_ADMIN, dependencies: ['admin'] },
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
