import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

// M6 (03 PUB-11, NFR-A11Y-1): motion, sound, reading mode and print, as visitors meet them.

test('no sound file is requested until the visitor turns sound on', async ({ page }) => {
  const sounds: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/sounds/')) sounds.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('link', { name: /^Math/ }).first().hover();
  await page.mouse.click(5, 300);
  await page.waitForTimeout(1000);
  expect(sounds).toEqual([]);
});

test.describe('a visitor whose device asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('sees no animation: the headline is final text at once, nothing moves', async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    // Arwes's decipher writes scrambled characters while it runs; with motion off it never does.
    await expect(page.locator('.headline')).toContainText('Prove it.');
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => (a as CSSAnimation).animationName ?? 'js'),
    );
    expect(running).toEqual([]);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('can still choose motion, and the choice is remembered on the next page', async ({ page }) => {
    await page.goto('/');
    const burger = page.getByRole('button', { name: 'Menu' });
    if (await burger.isVisible()) await burger.click();
    await page.getByRole('button', { name: /motion off/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await page.goto('/projects');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  });
});

test('keyboard: Study ▾ opens with Enter and reaches every subject', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop bar; on phones the same links sit behind Menu');
  await page.goto('/');
  const study = page.getByRole('button', { name: 'Study' });
  await study.focus();
  await page.keyboard.press('Enter');
  await expect(study).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Math', 'Physics', 'Coding', 'IT']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toContainText(name);
  }
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/study\/coding$/);
});

test('reading mode calms a lesson and stays on for the next one', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/posts/am-gm-inequality');
  await expect(page.getByTestId('backdrop')).toBeVisible();
  await page.getByRole('button', { name: 'Reading mode off' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'on');
  await expect(page.getByTestId('backdrop')).toBeHidden();
  await page.goto('/posts/cauchy-schwarz-inequality');
  await expect(page.getByRole('button', { name: 'Reading mode on' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('backdrop')).toBeHidden();
  expect(problems, problems.join('\n')).toEqual([]);
});

test('print shows only the lesson, black on white', async ({ page }) => {
  await page.goto('/posts/am-gm-inequality');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'The AM–GM inequality' })).toBeVisible();
  const colours = await page.evaluate(() => {
    const p = document.querySelector('.prose p')!;
    return [getComputedStyle(document.body).backgroundColor, getComputedStyle(p).color];
  });
  expect(colours).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
});
