import { expect, test, type Page } from '@playwright/test';
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

/** Two pictures of the orbit canvas, half a second apart. */
async function orbitFrames(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('.orbit.is-ready').waitFor({ timeout: 10_000 });
  const snap = () => page.locator('.orbit canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const a = await snap();
  await page.waitForTimeout(500);
  return [a, await snap()];
}

test('the orbit hero moves when motion is on', async ({ page }) => {
  const problems = await collectProblems(page);
  const [a, b] = await orbitFrames(page);
  expect(a).not.toBe(b);
  expect(problems, problems.join('\n')).toEqual([]);
});

test.describe('a visitor whose device asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the orbit is drawn once and stays still', async ({ page }) => {
    const [a, b] = await orbitFrames(page);
    expect(a).toBe(b);
    await expect(page.getByTestId('orbit')).toContainText('T+PAUSED');
  });
});

test.describe('a visitor whose device asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('sees no animation: the headline is final text at once, nothing moves', async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    // Arwes's decipher writes scrambled characters while it runs; with motion off it never does.
    await expect(page.locator('.headline')).toContainText('Love math.');
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

test('the footer stays on the bottom edge while the page scrolls (in the page on phones)', async ({
  page,
  isMobile,
}) => {
  await page.goto('/posts/am-gm-inequality');
  const footer = page.getByRole('contentinfo');
  const gap = () => footer.evaluate((f) => Math.round(window.innerHeight - f.getBoundingClientRect().bottom));
  if (isMobile) {
    // A phone keeps its screen for the lesson: the footer is at the end of the page.
    expect(await gap()).toBeLessThan(0);
    return;
  }
  expect(await gap()).toBe(0);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await gap()).toBe(0);
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

/**
 * A browser lets a fresh page play sound only after a click, tap or key press. Playwright runs its own
 * scripts as a user gesture, which Chromium counts like one, so the page would look clicked from the
 * start: this puts the browser's rule back (navigator.userActivation, set only by real input).
 */
async function browserSoundRule(page: Page) {
  await page.addInitScript(() => {
    const activation = { hasBeenActive: false, isActive: false };
    Object.defineProperty(Navigator.prototype, 'userActivation', { get: () => activation, configurable: true });
    for (const t of ['pointerdown', 'mousedown', 'touchend', 'keydown'])
      window.addEventListener(
        t,
        (e) => {
          if (e.isTrusted && (e as KeyboardEvent).key !== 'Escape') activation.hasBeenActive = true;
        },
        true,
      );
  });
}

test.describe('page changes and the sound offer (after soulextract.com)', () => {
  test('moving between pages animates the arrival, then leaves the page alone', async ({ page, isMobile }) => {
    test.skip(isMobile, 'same code; the desktop bar has the link in view');
    const problems = await collectProblems(page);
    await page.goto('/');
    // Watch the attribute from inside the page: the arrival lasts under a second.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      new MutationObserver(() => seen.push(document.documentElement.dataset.transition ?? '-')).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['data-transition'] },
      );
    });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-transition', /./);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(
      expect.arrayContaining(['loading', 'in', '-']),
    );
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('opening a subject shows skeleton cards, then the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'same code; the desktop bar has the link in view');
    const problems = await collectProblems(page);
    await page.goto('/projects');
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      new MutationObserver(() => seen.push(document.documentElement.dataset.transition ?? '-')).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['data-transition'] },
      );
    });
    await page.getByRole('navigation', { name: 'Subjects' }).getByRole('link', { name: 'Physics' }).click();
    await expect(page.getByTestId('page-skeleton')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('page-skeleton')).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-transition', /./);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(
      expect.arrayContaining(['loading', 'in', '-']),
    );
    expect(problems, problems.join('\n')).toEqual([]);
  });

  /** Records every data-transition value from before the page's own scripts run. (<html> may
   * not exist yet when this runs, so it watches the whole document.) */
  const recordFromStart = (page: import('@playwright/test').Page) =>
    page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      new MutationObserver(() => seen.push(document.documentElement.dataset.transition ?? '-')).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-transition'],
      });
    });

  test('a refresh plays the same arrival: skeleton, then the cards fade in', async ({ page }) => {
    const problems = await collectProblems(page);
    await recordFromStart(page);
    await page.goto('/study/physics');
    await expect(page.locator('html')).not.toHaveAttribute('data-transition', /./);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['loading', 'in', '-']);
    // The inline boot script ran under the strict CSP (collectProblems reports violations).
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('the page is simply there: no skeleton, nothing hidden', async ({ page }) => {
      await page.goto('/study/physics');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByTestId('page-skeleton')).toBeHidden();
      await expect(page.locator('html')).not.toHaveAttribute('data-transition', /./);
    });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('a first load is not animated', async ({ page }) => {
      await recordFromStart(page);
      await page.goto('/study/physics');
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
    });

    test('page changes are instant', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        new MutationObserver(() => ((window as unknown as { moved: boolean }).moved = true)).observe(
          document.documentElement,
          { attributes: true, attributeFilter: ['data-transition'] },
        );
      });
      await page.goto('/projects');
      await page.getByRole('link', { name: /Home/i }).first().click();
      await expect(page).toHaveURL(/\/$/);
      expect(await page.evaluate(() => (window as unknown as { moved?: boolean }).moved ?? false)).toBe(false);
    });
  });

  test('sound on, a fresh page: nothing plays before the first click; the reminder starts it', async ({ page }) => {
    const problems = await collectProblems(page);
    await browserSoundRule(page);
    await page.addInitScript(() => localStorage.setItem('cs-prefs', JSON.stringify({ invited: true, sound: true })));
    const sounds: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/sounds/')) sounds.push(r.url());
    });
    await page.goto('/');
    // Pointing at a link is not a click: the browser would drop the tick, so none is tried.
    await page.getByRole('link', { name: /^Math/ }).first().hover();
    const reminder = page.getByRole('region', { name: 'Sound' });
    await expect(reminder).toContainText('Sound is on');
    expect(sounds).toEqual([]);
    const chime = page.waitForResponse((r) => r.url().endsWith('/sounds/intro.mp3') && r.ok());
    await reminder.getByRole('button', { name: 'Start sound' }).click();
    await chime;
    await expect(reminder).toHaveCount(0);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test.describe('a first visit', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the page is never held back; a small offer turns sound on with a chime, once', async ({ page }) => {
      await browserSoundRule(page);
      await page.goto('/');
      // Content first: the heading is there before any offer.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const offer = page.getByRole('region', { name: 'Sound' });
      await expect(offer).toBeVisible();
      const chime = page.waitForResponse((r) => r.url().endsWith('/sounds/intro.mp3') && r.ok());
      await offer.getByRole('button', { name: 'Turn on sound' }).click();
      await chime;
      await expect(offer).toHaveCount(0);
      await page.reload();
      // Not asked again. Sound stays on, and this fresh page says it waits for a click to play it.
      const reminder = page.getByRole('region', { name: 'Sound' });
      await expect(reminder).toContainText('Sound is on');
      await expect(page.getByRole('button', { name: 'Turn on sound' })).toHaveCount(0);
      await reminder.getByRole('button', { name: 'Start sound' }).click();
      await expect(reminder).toHaveCount(0);
      const burger = page.getByRole('button', { name: 'Menu' });
      if (await burger.isVisible()) await burger.click();
      await expect(page.getByRole('button', { name: /sound on/i })).toBeVisible();
    });
  });
});
