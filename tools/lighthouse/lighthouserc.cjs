// Lighthouse CI lab gate (03 NFR-PERF-1, calibrated in docs/adr/0001-arwes.md):
// mobile, simulated throttling, median of 3 runs on a local production build.
// The build must use SITE_INDEXABLE=true: before launch every page is noindex, which
// Lighthouse's SEO category fails by design.
const PORT = process.env.LHCI_PORT ?? '3100';
const base = `http://localhost:${PORT}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `npx next start -p ${PORT}`,
      startServerReadyPattern: 'Ready',
      // Home, a subject page, a maths lesson and a code lesson (04 M2: lesson and subject pages).
      url: ['/', '/study/math', '/posts/am-gm-inequality', '/posts/linear-search'].map((p) => base + p),
      numberOfRuns: 3,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.75 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'total-blocking-time': ['error', { maxNumericValue: 1000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
