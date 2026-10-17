import AxeBuilder from '@axe-core/playwright';
import { expect, request as playwrightRequest, type Page } from '@playwright/test';
import { EDITOR, resetUser, serviceClient, totp } from '../support/admin-users';

/** Records console errors, hydration warnings, page errors and CSP violations. */
export async function collectProblems(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || /hydrat/i.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  return problems;
}

/** WCAG 2.1 AA checks (NFR-A11Y-1), once any page change has finished fading in. */
export async function expectAccessible(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-transition', /./);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** The Study menu sits behind the Menu button on small screens. */
export async function openStudyMenu(page: Page) {
  const burger = page.getByRole('button', { name: 'Menu' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('button', { name: 'Study' }).click();
}

/** Sets up the second test owner (EDITOR) with a fresh authenticator; returns its TOTP secret. */
export async function enrolEditor(baseURL: string): Promise<string> {
  await resetUser(serviceClient(), EDITOR);
  const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  await api.post('/api/auth/sign-in', { data: { email: EDITOR.email, password: EDITOR.password } });
  const { secret } = (await (await api.post('/api/auth/mfa/enroll')).json()) as { secret: string };
  expect((await api.post('/api/auth/mfa/verify', { data: { code: totp(secret) } })).status()).toBe(200);
  await api.dispose();
  return secret;
}

/** Signs the page's browser context in as EDITOR, with 2FA. */
export async function signInEditor(page: Page, baseURL: string, secret: string) {
  const headers = { Origin: baseURL };
  await page.request.post('/api/auth/sign-in', { headers, data: { email: EDITOR.email, password: EDITOR.password } });
  const verified = await page.request.post('/api/auth/mfa/verify', { headers, data: { code: totp(secret) } });
  expect(verified.status()).toBe(200);
}
