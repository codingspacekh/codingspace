import Router, { useRouter } from 'next/router';
import { useEffect } from 'react';
import { trackedPath } from '@/lib/analytics';

const ENDPOINT = '/api/visit';
/** Error pages: their URL is a real-looking path, so they are left out by route. */
const ERROR_ROUTES = new Set(['/404', '/500', '/_error']);

/**
 * The owner's analytics (v1.1): one small request per page view, then the time the page was
 * on screen when the visitor leaves it or hides the tab. Nothing is stored in the browser (no
 * cookie, no localStorage); each view gets a random id that only lives in this page's memory.
 * Admin pages, error pages and anything trackedPath() doesn't know are never sent.
 */
export function VisitTracker() {
  const router = useRouter();

  useEffect(() => {
    // The referring site counts for the first page only; later pages are moves inside the site.
    let referrer = document.referrer;
    let view: { id: string; shownMs: number; since: number | null; sent: number } | null = null;
    const visible = () => document.visibilityState === 'visible';

    const beacon = (body: object) => {
      const json = JSON.stringify(body);
      if (navigator.sendBeacon?.(ENDPOINT, json)) return;
      void fetch(ENDPOINT, { method: 'POST', body: json, keepalive: true }).catch(() => {});
    };

    // Sends the time on screen so far (the server keeps the largest it has seen).
    const flush = () => {
      if (!view) return;
      if (view.since !== null) {
        view.shownMs += performance.now() - view.since;
        view.since = visible() ? performance.now() : null;
      }
      const seconds = Math.round(view.shownMs / 1000);
      if (seconds >= 1 && seconds !== view.sent) {
        view.sent = seconds;
        beacon({ id: view.id, seconds });
      }
    };

    const start = (url: string) => {
      flush();
      view = null;
      const path = trackedPath(url);
      if (!path || ERROR_ROUTES.has(Router.pathname) || typeof crypto?.randomUUID !== 'function') return;
      view = { id: crypto.randomUUID(), shownMs: 0, since: visible() ? performance.now() : null, sent: 0 };
      const body = JSON.stringify({ id: view.id, path, ...(referrer ? { referrer } : {}) });
      referrer = '';
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (!view) return;
      if (visible()) view.since ??= performance.now();
      else flush();
    };
    const onLeave = () => flush();
    const onStart = (_url: string, { shallow }: { shallow: boolean }) => {
      if (shallow) return;
      flush();
      view = null;
    };
    const onDone = (url: string, { shallow }: { shallow: boolean }) => {
      if (!shallow) start(url);
    };

    start(window.location.pathname);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    router.events.on('routeChangeStart', onStart);
    router.events.on('routeChangeComplete', onDone);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      router.events.off('routeChangeStart', onStart);
      router.events.off('routeChangeComplete', onDone);
    };
  }, [router.events]);

  return null;
}
