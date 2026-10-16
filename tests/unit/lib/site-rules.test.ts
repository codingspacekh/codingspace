import { landingUrlProblem, mondayOf } from '@/lib/site-rules';

describe('project landing page (03 ADM-13: https only)', () => {
  it.each(['https://quiz.example', 'https://apps.example.com/quiz?ref=cs#top', 'https://example.com:8443/x'])(
    'accepts %s',
    (url) => expect(landingUrlProblem(url)).toBeNull(),
  );

  it.each([
    ['http://quiz.example', /https/],
    ['javascript:alert(1)', /https/],
    ['JAVASCRIPT:alert(1)', /https/],
    ['data:text/html,<script>alert(1)</script>', /https/],
    ['ftp://files.example', /https/],
    ['//quiz.example', /isn’t a web address/],
    ['quiz.example', /isn’t a web address/],
    ['https://user:pw@evil.example', /user name or password/],
    ['https://localhost', /real domain/],
    ['https://exa mple.com', /spaces/],
    ['', /required/],
    [`https://example.com/${'x'.repeat(500)}`, /too long/],
  ])('refuses %s', (url, reason) => {
    expect(landingUrlProblem(url)).toMatch(reason);
  });
});

describe('week of', () => {
  it.each([
    ['2026-10-12', '2026-10-12'], // a Monday
    ['2026-10-16', '2026-10-12'], // Friday
    ['2026-10-18', '2026-10-12'], // Sunday
    ['2026-01-01', '2025-12-29'], // across a year
  ])('%s is in the week of %s', (day, monday) => {
    const [y, m, d] = day.split('-').map(Number);
    expect(mondayOf(new Date(y!, m! - 1, d!))).toBe(monday);
  });
});
