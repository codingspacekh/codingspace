import Head from 'next/head';
import Link from 'next/link';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { imageKey, mediaUrl, srcset } from '@/lib/media-urls';
import {
  downloadUrl,
  visitorPlatforms,
  SECTION_NAMES,
  STEP_PLATFORMS,
  type PageSection,
  type ProjectStep,
  type StepPlatform,
} from '@/lib/project-page';
import { useSubjects } from '@/lib/subjects';
import type { ProjectPageData, ProjectScreenshot } from '@/server/data/types';
import { DownloadCards, HeroDownload, useBestDownload, useUserAgent } from './project-downloads';

/** A screenshot at its real proportions: AVIF where the browser has it, WebP otherwise. */
function Shot({
  shot,
  sizes,
  eager = false,
  className = '',
}: {
  shot: Omit<ProjectScreenshot, 'caption'> & { caption?: string };
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  const largest = shot.widths.at(-1)!;
  return (
    <a
      href={mediaUrl(imageKey(shot.media, largest, 'webp'))}
      className={`shot ${className}`.trim()}
      target="_blank"
      rel="noopener"
    >
      <picture>
        <source type="image/avif" srcSet={srcset(shot.media, shot.widths, 'avif')} sizes={sizes} />
        <img
          src={mediaUrl(imageKey(shot.media, shot.widths[0]!, 'webp'))}
          srcSet={srcset(shot.media, shot.widths, 'webp')}
          sizes={sizes}
          width={shot.width}
          height={shot.height}
          alt={shot.alt || shot.caption || 'Screenshot'}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      </picture>
      <span className="sr-only"> (full size, opens in a new tab)</span>
    </a>
  );
}

/** Whether a section has anything to show (an empty one is left out, like a hidden one). */
function hasContent(page: ProjectPageData, s: PageSection): boolean {
  switch (s) {
    case 'numbers':
      return page.highlights.length > 0;
    case 'why':
      return page.reasons.length > 0 || page.replaces.length > 0;
    case 'showcase':
      return page.showcase.length > 0;
    case 'features':
      return page.features.length > 0;
    case 'screenshots':
      return page.screenshots.length > 1;
    case 'requirements':
      return page.requirements.length > 0;
    case 'download':
      return true; // says "Coming soon" with no downloads yet
    case 'install':
      return page.steps.length > 0;
    case 'faq':
      return page.faq.length > 0;
  }
}

function Section({
  id,
  title,
  eyebrow,
  lead,
  children,
}: {
  id: PageSection;
  title: string;
  eyebrow?: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section pj-section" aria-labelledby={`pj-${id}-h`}>
      <div className="pj-head">
        {eyebrow && <span className="pj-eyebrow">{eyebrow}</span>}
        <h2 id={`pj-${id}-h`}>{title}</h2>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** The sub-navigation's current section: the last one whose top has passed under the bars. */
function useCurrent(ids: string[]): string {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCurrent(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return current;
}

function SubNav({ page, ids }: { page: ProjectPageData; ids: PageSection[] }) {
  const current = useCurrent(ids);
  const best = useBestDownload(page.downloads) ?? page.downloads[0];
  const target = ids.includes('download') ? '#download' : best ? downloadUrl(best) : null;
  return (
    <nav className="pj-subnav" aria-label={`${page.project.name}: on this page`}>
      <span className="pj-subnav-name">
        {page.project.name}
        {page.version && <span className="meta">v{page.version}</span>}
      </span>
      <span className="pj-subnav-links">
        {ids.map((id) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? 'location' : undefined}>
            {SECTION_NAMES[id]}
          </a>
        ))}
      </span>
      {target && page.downloads.length > 0 && (
        <a href={target} className="btn pri">
          Download
        </a>
      )}
    </nav>
  );
}

function Why({ page }: { page: ProjectPageData }) {
  const { project: p } = page;
  return (
    <Section id="why" eyebrow={`Why ${p.name}`} title={page.whyTitle || `Why ${p.name}?`} lead={page.whyText}>
      {page.replaces.length > 0 ? (
        <div className="pj-swap">
          <div className="frame pj-before">
            <span className="meta">Before</span>
            <ul>
              {page.replaces.map((r) => (
                <li key={r.name}>
                  <span>{r.name}</span>
                  {r.note && <span className="meta">{r.note}</span>}
                </li>
              ))}
            </ul>
          </div>
          <span className="pj-arrow" aria-hidden="true">
            →
          </span>
          <div className="frame pj-after">
            <span className="meta">Now</span>
            <h3>
              {p.glyph && (
                <span className="pj-glyph" aria-hidden="true">
                  {p.glyph}
                </span>
              )}
              {p.name}
            </h3>
            <ul>
              {page.reasons.map((r) => (
                <li key={r.title}>
                  <span>
                    {r.title}
                    {r.text && <span className="pj-after-text"> {r.text}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="pj-cards">
          {page.reasons.map((r) => (
            <li key={r.title} className="frame">
              <h3>{r.title}</h3>
              {r.text && <p>{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Steps for several computers show as tabs; a step for any computer is in every tab. */
function Install({ page }: { page: ProjectPageData }) {
  const platforms = [...new Set(page.steps.flatMap((s) => (s.platform ? [s.platform] : [])))];
  const os = visitorPlatforms(useUserAgent())[0];
  const preferred = platforms.find((p) => p === (os?.startsWith('mac') ? 'mac' : os));
  const [picked, setPicked] = useState<StepPlatform | null>(null);
  const tab = picked ?? preferred ?? platforms[0];
  const stepsFor = (p?: StepPlatform) => page.steps.filter((s) => !s.platform || s.platform === p);

  return (
    <Section id="install" title="Install">
      {platforms.length > 1 && (
        <div className="pj-tabs" role="tablist" aria-label="Your computer">
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              id={`pj-tab-${p}`}
              aria-selected={tab === p}
              aria-controls={`pj-steps-${p}`}
              onClick={() => setPicked(p)}
            >
              {STEP_PLATFORMS[p]}
            </button>
          ))}
        </div>
      )}
      {platforms.length > 1 ? (
        platforms.map((p) => (
          <Steps key={p} steps={stepsFor(p)} id={`pj-steps-${p}`} labelledBy={`pj-tab-${p}`} hidden={tab !== p} />
        ))
      ) : (
        <Steps steps={page.steps} />
      )}
    </Section>
  );
}

function Steps({
  steps,
  id,
  labelledBy,
  hidden = false,
}: {
  steps: ProjectStep[];
  id?: string;
  labelledBy?: string;
  hidden?: boolean;
}) {
  return (
    <ol
      className="pj-steps"
      id={id}
      role={labelledBy ? 'tabpanel' : undefined}
      aria-labelledby={labelledBy}
      hidden={hidden}
    >
      {steps.map((s, i) => (
        <li key={`${s.title}-${i}`} className="frame">
          <span className="sn" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3>{s.title}</h3>
          {s.text && <p>{s.text}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * v1.1 (owner request 2026-10-18), redesigned 2026-10-20 from the approved prototype: a
 * software landing page. Hero with the visitor's download, then the sections in the owner's
 * order (hidden and empty ones left out), with a sub-navigation that stays on screen, then a
 * closing call to download.
 */
export function ProjectPage(page: ProjectPageData) {
  const { project: p } = page;
  const subject = useSubjects().subject(p.subject);
  const [hero] = page.screenshots;
  const ids = page.sections.filter((s) => hasContent(page, s));
  const best = useBestDownload(page.downloads) ?? page.downloads[0];
  const mac =
    page.downloads.some((d) => d.platform === 'mac-arm') && page.downloads.some((d) => d.platform === 'mac-intel');

  const sections: Record<PageSection, () => ReactNode> = {
    numbers: () => (
      <section id="numbers" className="pj-numbers pj-section" aria-label="At a glance">
        <ul>
          {page.highlights.map((h) => (
            <li key={h.value + h.label}>
              <span className="pj-n">{h.value}</span>
              <span className="pj-l">{h.label}</span>
            </li>
          ))}
        </ul>
      </section>
    ),
    why: () => <Why page={page} />,
    showcase: () => (
      <Section id="showcase" eyebrow="A closer look" title={`What ${p.name} does`}>
        <div className="pj-show">
          {page.showcase.map((row) => (
            <article key={row.media + row.title} className={`pj-row${row.color ? ` c-${row.color}` : ''}`}>
              <div className="pj-row-copy">
                {row.label && <span className="pj-eyebrow">{row.label}</span>}
                <h3>{row.title}</h3>
                {row.text && <p>{row.text}</p>}
                {row.points.length > 0 && (
                  <ul>
                    {row.points.map((pt) => (
                      <li key={pt.code + pt.text}>
                        {pt.code ? <code>{pt.code}</code> : <span aria-hidden="true">◆</span>}
                        <span>{pt.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Shot shot={row} sizes="(max-width: 860px) 100vw, 640px" className="frame" />
            </article>
          ))}
        </div>
      </Section>
    ),
    features: () => (
      <Section id="features" title="Features">
        <ul className="pj-cards pj-features">
          {page.features.map((f) => (
            <li key={f.title} className="frame">
              <span className="g" aria-hidden="true">
                {f.glyph || '◆'}
              </span>
              <h3>{f.title}</h3>
              {f.text && <p>{f.text}</p>}
            </li>
          ))}
        </ul>
      </Section>
    ),
    screenshots: () => (
      <Section id="screenshots" title="Screenshots">
        <ul className="pj-gallery">
          {page.screenshots.map((s) => (
            <li key={s.media}>
              <figure>
                <Shot shot={s} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 360px" />
                {s.caption && <figcaption>{s.caption}</figcaption>}
              </figure>
            </li>
          ))}
        </ul>
      </Section>
    ),
    requirements: () => {
      const recommended = page.requirements.some((r) => r.recommended);
      return (
        <Section id="requirements" title="System requirements" lead={page.requirementsNote}>
          <div className="frame pj-table">
            <table>
              <thead>
                <tr>
                  <td />
                  <th scope="col">Minimum</th>
                  {recommended && <th scope="col">Recommended</th>}
                </tr>
              </thead>
              <tbody>
                {page.requirements.map((r) => (
                  <tr key={r.part}>
                    <th scope="row">{r.part}</th>
                    <td>{r.minimum || '—'}</td>
                    {recommended && <td className="pj-rec">{r.recommended || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      );
    },
    download: () => (
      <Section id="download" title={page.downloads.length ? `Get ${p.name}` : `${p.name} is coming soon`}>
        {page.downloads.length ? (
          <>
            <p className="pj-release">
              {page.version && <span className="tag">Version {page.version}</span>}
              {page.releaseDate && <span className="meta">Released {formatDate(page.releaseDate)}</span>}
            </p>
            <DownloadCards downloads={page.downloads} />
            {(page.releaseNotes.length > 0 || mac) && (
              <div className="pj-dl-aside">
                {page.releaseNotes.length > 0 && (
                  <div className="frame">
                    <h3>What’s new{page.version ? ` in ${page.version}` : ''}</h3>
                    <ul>
                      {page.releaseNotes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {mac && (
                  <div className="frame">
                    <h3>Which Mac do I have?</h3>
                    <p>
                      Apple menu (top left) ▸ <b>About This Mac</b>. “Chip: Apple M…” means an <b>Apple chip</b>;
                      “Processor: … Intel …” means <b>Intel</b>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p>It isn’t ready to download yet. Check back soon.</p>
        )}
      </Section>
    ),
    install: () => <Install page={page} />,
    faq: () => (
      <Section id="faq" title="Questions">
        <div className="pj-faq">
          {page.faq.map((f) => (
            <details key={f.question} className="frame">
              <summary>{f.question}</summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: f.answerHtml }} />
            </details>
          ))}
        </div>
      </Section>
    ),
  };

  return (
    <article className={`project c-${subject?.color ?? 'lime'}`}>
      {page.hasMath && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      {ids.length > 1 && <SubNav page={page} ids={ids} />}
      <header className={`pj-hero${hero ? ' pj-hero--shot' : ''}`}>
        <div className="pj-copy">
          <nav aria-label="Breadcrumb" className="crumbs">
            <Link href="/projects">Projects</Link> / {p.name}
          </nav>
          <h1>
            {p.glyph && (
              <span className="pj-glyph" aria-hidden="true">
                {p.glyph}
              </span>
            )}
            {p.name}
          </h1>
          <p className="lead">{page.tagline || p.description}</p>
          {page.introHtml && <div className="prose" dangerouslySetInnerHTML={{ __html: page.introHtml }} />}
          {(p.tag || subject) && (
            <p className="stack">
              {p.tag && <span className="tag">{p.tag}</span>}
              {subject && <span className="tag">{subject.name}</span>}
            </p>
          )}
          <div className="pj-cta">
            <HeroDownload downloads={page.downloads} version={page.version} />
            <p className="pj-more">
              {page.downloads.length > 1 && ids.includes('download') && <a href="#download">Other downloads</a>}
              {page.sourceUrl && (
                <a href={page.sourceUrl} rel="noopener">
                  Source code ↗
                </a>
              )}
              {p.landingUrl && (
                <a href={p.landingUrl} target="_blank" rel="noopener noreferrer">
                  Website ↗<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </p>
          </div>
          {p.platforms.length > 0 && (
            <ul className="pj-facts meta" aria-label="Runs on">
              {p.platforms.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
        {hero && (
          <figure className="pj-visual">
            <Shot shot={hero} sizes="(max-width: 900px) 100vw, 640px" eager className="frame pj-window" />
            {hero.caption && <figcaption>{hero.caption}</figcaption>}
          </figure>
        )}
      </header>

      {ids.map((id) => (
        <Fragment key={id}>{sections[id]()}</Fragment>
      ))}

      <section className="pj-closing" aria-labelledby="pj-closing-h">
        <div>
          <h2 id="pj-closing-h">{page.downloads.length ? `Ready to try ${p.name}?` : p.name}</h2>
          <p>{page.tagline || p.description}</p>
        </div>
        <p className="pj-actions">
          {best && (
            <a href={downloadUrl(best)} className="btn pri" rel="noopener">
              Download for {best.label}
            </a>
          )}
          <Link href="/projects" className="btn">
            ← All projects
          </Link>
        </p>
      </section>
    </article>
  );
}
