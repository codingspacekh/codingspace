import { test, expect } from '@playwright/test';

// NFR: lesson content must be readable before (and without) JavaScript.
test.describe('server-rendered content with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('home headline and intro are readable', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Prove it.');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Code it.');
    await expect(page.getByTestId('intro')).toBeVisible();
    await expect(page.getByTestId('intro')).toContainText('Competition maths');
  });

  test('lesson body, maths and code are rendered on the server', async ({ page }) => {
    await page.goto('/lesson');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AM–GM: the workhorse inequality');
    const body = page.getByTestId('lesson-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('arithmetic mean');
    // KaTeX output exists without client JS
    expect(await body.locator('.katex').count()).toBeGreaterThan(0);
    // Shiki output exists without client JS
    await expect(body.locator('pre.shiki')).toBeVisible();
  });
});
