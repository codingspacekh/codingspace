// NFR-CAP-1 load test (k6): 10× the expected traffic, 20 HTML requests a second for 10 minutes,
// spread over the public pages listed in the sitemap. The run fails unless p95 < 300 ms and
// no request fails. Run against the live site only on purpose (docs/runbook.md, "Load test"):
//   docker run --rm -i -e BASE_URL=https://codingspacekh.dev grafana/k6:1.5.0 run - < tests/load/html.js
// Shorter local try: add -e DURATION=30s -e RATE=5.
/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const RATE = Number(__ENV.RATE || 20);
const DURATION = __ENV.DURATION || '10m';

export const options = {
  scenarios: {
    html: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
  },
  // Pages only (no images, scripts or fonts): what NFR-CAP-1 measures.
  discardResponseBodies: true,
};

/** The pages to request: every URL in the sitemap, moved onto BASE_URL. */
export function setup() {
  const res = http.get(`${BASE_URL}/sitemap.xml`, { responseType: 'text' });
  if (res.status !== 200) throw new Error(`sitemap.xml answered ${res.status}`);
  const paths = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '') || '/'); // k6 has no URL class;
  if (!paths.length) throw new Error('sitemap.xml lists no pages');
  return { paths: [...new Set(['/', '/search?q=sum', ...paths])] };
}

export default function ({ paths }) {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE_URL}${path}`, { tags: { name: path } });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'is HTML': (r) => (r.headers['Content-Type'] || '').startsWith('text/html'),
  });
}
