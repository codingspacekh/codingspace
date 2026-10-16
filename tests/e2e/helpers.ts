import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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

/** WCAG 2.1 AA checks (NFR-A11Y-1). */
export async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** The Study menu sits behind the Menu button on small screens. */
export async function openStudyMenu(page: Page) {
  const burger = page.getByRole('button', { name: 'Menu' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('button', { name: 'Study' }).click();
}
