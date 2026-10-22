import { useState, useSyncExternalStore } from 'react';
import { extensionOf, formatBytes } from '@/lib/media-rules';
import {
  DOWNLOAD_PLATFORMS,
  downloadFor,
  downloadUrl,
  isFileDownload,
  type DownloadPlatform,
  type ProjectDownload,
} from '@/lib/project-page';

/**
 * A project page's downloads (redesign 2026-10-20): the hero's button for the visitor's computer,
 * the cards in the Download section, and their checksums. The page is built ahead of time, so the
 * visitor's computer is only known in the browser: the server renders the first download, and
 * the browser switches to the best one after loading.
 */

const noop = () => () => {};
/** The browser's user agent; '' while the page is built and during hydration. */
export const useUserAgent = () =>
  useSyncExternalStore(
    noop,
    () => navigator.userAgent,
    () => '',
  );

/** The download that suits this visitor, or null (no match, or not known yet). */
export function useBestDownload(downloads: ProjectDownload[]): ProjectDownload | null {
  return downloadFor(downloads, useUserAgent());
}

export function PlatformIcon({ platform }: { platform?: DownloadPlatform }) {
  const common = { width: 28, height: 28, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (platform === 'windows')
    return (
      <svg {...common} fill="currentColor">
        <path d="M3 5.5 10 4.5v7H3zM11 4.4 21 3v8.5H11zM3 12.5h7v7l-7-1zM11 12.5h10V21l-10-1.4z" />
      </svg>
    );
  if (platform === 'mac' || platform === 'mac-arm' || platform === 'mac-intel')
    return (
      <svg {...common} fill="currentColor">
        <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-1.9-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.4-.9-2.4-3.6zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" />
      </svg>
    );
  if (platform === 'android')
    return (
      <svg {...common} fill="currentColor">
        <path d="M6 9h12v8a1 1 0 0 1-1 1h-1v3h-2v-3h-4v3H8v-3H7a1 1 0 0 1-1-1zM4 9h1.5v7H4zM18.5 9H20v7h-1.5zM7 8a5 5 0 0 1 10 0zm2.5-2.3a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2zm5 0a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z" />
      </svg>
    );
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" />
    </svg>
  );
}

/** "v0.11.0 · Installer · 175.0 MB": what the hero's button says under its label. */
function details(d: ProjectDownload, version: string) {
  return [version && `v${version}`, d.note, isFileDownload(d) && formatBytes(d.bytes)].filter(Boolean).join(' · ');
}

/** The hero's big button: the visitor's download, else the first one; with none, "Coming soon" if the owner says so. */
export function HeroDownload({
  downloads,
  version,
  comingSoon,
}: {
  downloads: ProjectDownload[];
  version: string;
  comingSoon: boolean;
}) {
  const best = useBestDownload(downloads) ?? downloads[0];
  if (!best) return comingSoon ? <span className="tag tag-soon">Coming soon</span> : null;
  return (
    <a href={downloadUrl(best)} className="pj-big-dl" rel="noopener">
      <PlatformIcon />
      <b>Download for {best.label}</b>{' '}
      <span>{details(best, version) || (isFileDownload(best) ? best.name : new URL(best.url).host)}</span>
    </a>
  );
}

/** Copies the checksum; where the browser refuses, selects it so the visitor can copy it. */
function Checksum({ sha256 }: { sha256: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="pj-sha">
      <span>SHA-256</span>
      <code>{sha256}</code>
      <button
        type="button"
        onClick={async (e) => {
          const code = e.currentTarget.previousElementSibling!;
          try {
            await navigator.clipboard.writeText(sha256);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            const range = document.createRange();
            range.selectNodeContents(code);
            getSelection()?.removeAllRanges();
            getSelection()?.addRange(range);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'} <span className="sr-only">the SHA-256 checksum</span>
      </button>
    </p>
  );
}

/** One card per download, the visitor's own marked. */
export function DownloadCards({ downloads }: { downloads: ProjectDownload[] }) {
  const best = useBestDownload(downloads);
  return (
    <ul className="pj-dl-grid">
      {downloads.map((d, i) => {
        const mine = d === best;
        const file = isFileDownload(d);
        const ext = file ? extensionOf(d.name) : '';
        return (
          <li key={i} className={`frame pj-dl${mine ? ' pj-dl--mine' : ''}`}>
            <div className="pj-dl-head">
              <div>
                <h3>{d.label}</h3>
                {d.note && <p className="meta">{d.note}</p>}
                {mine && <span className="tag pj-yours">Your computer</span>}
              </div>
              <PlatformIcon platform={d.platform} />
            </div>
            <p className="pj-dl-file">{file ? d.name : new URL(d.url).host}</p>
            <p className="meta pj-dl-spec">
              {file && <span>{formatBytes(d.bytes)}</span>}
              {d.platform && d.platform !== 'other' && <span>{DOWNLOAD_PLATFORMS[d.platform]}</span>}
            </p>
            <a href={downloadUrl(d)} className={`btn${mine || (!best && i === 0) ? ' pri' : ''}`} rel="noopener">
              {file ? `Download${ext ? ` .${ext}` : ''}` : 'Download ↗'} <span className="sr-only">for {d.label}</span>
            </a>
            {file && d.sha256 && <Checksum sha256={d.sha256} />}
          </li>
        );
      })}
    </ul>
  );
}
