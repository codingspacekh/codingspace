import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OWNER_GUARD } from '@/server/auth/guard';

// 03 §8.4 (2): every /api/admin route must go through withOwner(). A new route without it fails here.
const ROOT = join(__dirname, '../../../src/pages/api/admin');
const routes = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => join(ROOT, f));

describe('admin API routes', () => {
  it('exist', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes.map((r) => [relative(ROOT, r), r]))('%s is wrapped in withOwner()', async (_name, file) => {
    const mod = (await import(file)) as { default?: Record<symbol, unknown> };
    expect(mod.default?.[OWNER_GUARD]).toBe(true);
  });
});
