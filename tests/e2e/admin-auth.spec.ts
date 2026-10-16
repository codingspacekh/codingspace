import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { OTHER, OWNER, resetUser, serviceClient, totp } from '../support/admin-users';
import { collectProblems, expectAccessible } from './helpers';

// M3 admin sign-in (03 ADM-01, §8.4): every admin API route refuses visitors, password-only
// sessions and other accounts; the owner signs in with a password and a TOTP code.

const ADMIN_API = join(__dirname, '../../src/pages/api/admin');
const adminRoutes = readdirSync(ADMIN_API, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f))
  .map(
    (f) =>
      '/api/admin/' +
      f
        .replace(/\.tsx?$/, '')
        .replace(/(^|\/)index$/, '')
        .replace(/\[[^\]]+\]/g, '00000000-0000-4000-8000-000000000000'),
  );

/** Every admin route, every method: `expected` status and error. */
async function sweep(request: APIRequestContext, baseURL: string, status: number, error: string) {
  for (const path of adminRoutes) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await request.fetch(path, {
        method,
        headers: { Origin: baseURL },
        data: method === 'GET' ? undefined : {},
      });
      expect.soft(res.status(), `${method} ${path}`).toBe(status);
      expect.soft(await res.json(), `${method} ${path}`).toEqual({ error });
    }
  }
}

async function passwordSignIn(request: APIRequestContext, baseURL: string, user: typeof OWNER) {
  const res = await request.post('/api/auth/sign-in', {
    headers: { Origin: baseURL },
    data: { email: user.email, password: user.password },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { step: string };
}

test('every admin API route returns 401 to a visitor', async ({ request, baseURL }) => {
  expect(adminRoutes.length).toBeGreaterThan(0);
  await sweep(request, baseURL!, 401, 'unauthenticated');
});

test('admin pages send a visitor to an accessible sign-in page', async ({ page }) => {
  const problems = await collectProblems(page);
  const res = await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
  expect(res!.headers()['x-robots-tag']).toContain('noindex');
  expect(res!.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page);
  expect(problems).toEqual([]);
});

test('a cross-site POST to the sign-in route is refused', async ({ request }) => {
  const res = await request.post('/api/auth/sign-in', {
    headers: { Origin: 'https://evil.example' },
    data: { email: OWNER.email, password: OWNER.password },
  });
  expect(res.status()).toBe(403);
});

// One account and one authenticator, shared across these steps: run them in order, on the desktop
// project only (playwright.config.ts drops @single-account from mobile, hooks included).
test.describe('signed in', { tag: '@single-account' }, () => {
  test.describe.configure({ mode: 'serial' });

  let secret = '';

  test.beforeAll(async () => {
    const admin = serviceClient();
    await resetUser(admin, OWNER);
    await resetUser(admin, OTHER);
  });

  test('a password alone (no 2FA) gets 403 from every admin route', async ({ request, baseURL }) => {
    expect(await passwordSignIn(request, baseURL!, OWNER)).toEqual({ step: 'enroll' });
    await sweep(request, baseURL!, 403, 'mfa_required');
  });

  test('the owner enrols an authenticator, signs out, and signs in again with a code', async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto('/admin');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
    const qr = page.getByRole('img', { name: /QR code/ });
    await expect(qr).toBeVisible();
    // Visible is not enough: a broken image shows its alt text. The SVG must actually decode.
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    secret = (await page.locator('.adm-secret').textContent())!.trim();
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(OWNER.email)).toBeVisible();
    expect((await page.request.get('/api/admin/session')).status()).toBe(200);
    await expectAccessible(page);

    // Signed in: the sign-in page forwards to the admin.
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect((await page.request.get('/api/admin/session')).status()).toBe(401);

    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
    await page.getByLabel('6-digit code').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('"Sign out everywhere" ends the other sessions too', async ({ browser, baseURL }) => {
    const other = await browser.newContext();
    await passwordSignIn(other.request, baseURL!, OWNER);
    const verified = await other.request.post('/api/auth/mfa/verify', {
      headers: { Origin: baseURL! },
      data: { code: totp(secret, 1) },
    });
    expect(verified.status()).toBe(200);

    const page = await browser.newPage();
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('6-digit code').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect((await other.request.get('/api/admin/session')).status()).toBe(401);
    await other.close();
  });

  test('another account with 2FA is refused', async ({ request, baseURL }) => {
    expect(await passwordSignIn(request, baseURL!, OTHER)).toEqual({ step: 'enroll' });
    const enrol = await request.post('/api/auth/mfa/enroll', { headers: { Origin: baseURL! } });
    const { secret: otherSecret } = (await enrol.json()) as { secret: string };
    const verify = await request.post('/api/auth/mfa/verify', {
      headers: { Origin: baseURL! },
      data: { code: totp(otherSecret) },
    });
    expect(verify.status()).toBe(403);
    expect((await request.get('/api/admin/session')).status()).toBe(401);
  });
});
