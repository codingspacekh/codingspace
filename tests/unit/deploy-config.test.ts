// @vitest-environment node
import { readFileSync } from 'node:fs';

// Every admin request makes several database calls one after another, so the functions must run
// next to the database: Supabase codingspace-staging is in Singapore (ap-southeast-1). From
// Vercel's default region (iad1, Washington) each call took about 250 ms more.

describe('deploy config', () => {
  it('runs the functions in Singapore, next to the database', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { regions?: string[] };
    expect(config.regions).toEqual(['sin1']);
  });
});
