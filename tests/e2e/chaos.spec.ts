import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

// NFR-REL-1 chaos test: with the database down, the public pages still serve (they are built
// ahead and kept by ISR; a failed refresh keeps the last good page). Runs last, on its own
// (playwright.config.ts, project "chaos"): it pauses the local Supabase database container.

const container = (() => {
  if (process.env.BASE_URL) return null; // a deployed site: its database isn't ours to stop
  try {
    return (
      execFileSync('docker', ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'], { encoding: 'utf8' })
        .split('\n')
        .find(Boolean) ?? null
    );
  } catch {
    return null;
  }
})();

test.skip(!container, 'needs the local Supabase database container');

test('the public pages keep serving while the database is down', async ({ request }) => {
  const pages = ['/', '/study/math', '/posts/am-gm-inequality', '/projects', '/author'];
  // Each page has been built and served once before the database goes away.
  for (const path of pages) expect((await request.get(path)).status(), path).toBe(200);

  execFileSync('docker', ['pause', container!]);
  try {
    for (const path of pages) {
      const res = await request.get(path, { timeout: 15_000 });
      expect(res.status(), path).toBe(200);
      expect(await res.text(), path).toContain('CodingSpace');
    }
    const lesson = await (await request.get('/posts/am-gm-inequality')).text();
    expect(lesson).toContain('AM–GM');
  } finally {
    execFileSync('docker', ['unpause', container!]);
  }
});
