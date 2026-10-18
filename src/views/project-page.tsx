import Head from 'next/head';
import Link from 'next/link';
import { imageKey, mediaUrl, srcset } from '@/lib/media-urls';
import { useSubjects } from '@/lib/subjects';
import type { ProjectPageData, ProjectScreenshot } from '@/server/data/types';

/** A screenshot at its real proportions: AVIF where the browser has it, WebP otherwise. */
function Shot({ shot, sizes, eager = false }: { shot: ProjectScreenshot; sizes: string; eager?: boolean }) {
  const largest = shot.widths.at(-1)!;
  return (
    <a href={mediaUrl(imageKey(shot.media, largest, 'webp'))} className="shot" target="_blank" rel="noopener">
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

/** The download buttons, or "Coming soon" while there are none. */
function Downloads({ page, primary = false }: { page: ProjectPageData; primary?: boolean }) {
  if (!page.downloads.length) return <span className="tag tag-soon">Coming soon</span>;
  return (
    <>
      {page.downloads.map((d, i) => (
        <a key={d.url} href={d.url} className={`btn${primary && i === 0 ? ' pri' : ''}`} rel="noopener">
          Download for {d.label}
        </a>
      ))}
    </>
  );
}

/**
 * v1.1 (owner request 2026-10-18): a project's landing page in one fixed layout. Every section
 * after the hero shows only when it has something in it.
 */
export function ProjectPage(page: ProjectPageData) {
  const { project: p } = page;
  const subject = useSubjects().subject(p.subject);
  const [hero, ...more] = page.screenshots;
  const gallery = more.length ? page.screenshots : [];
  const single = page.downloads.length === 1;

  return (
    <article className={`project c-${subject?.color ?? 'lime'}`}>
      {page.hasMath && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <header className={`pj-hero${hero ? ' pj-hero--shot' : ''}`}>
        <div className="pj-copy">
          <nav aria-label="Breadcrumb" className="crumbs">
            <Link href="/projects">Projects</Link> / {p.name}
          </nav>
          <h1>
            <span className="pj-glyph" aria-hidden="true">
              {p.glyph || '◆'}
            </span>{' '}
            {p.name}
          </h1>
          <p className="lead">{page.tagline || p.description}</p>
          {page.introHtml && <div className="prose" dangerouslySetInnerHTML={{ __html: page.introHtml }} />}
          <p className="stack pj-facts">
            {p.tag && <span className="tag">{p.tag}</span>}
            {subject && <span className="tag">{subject.name}</span>}
            {page.version && <span className="meta">Version {page.version}</span>}
            {p.platforms.length > 0 && <span className="meta">{p.platforms.join(' · ')}</span>}
          </p>
          <p className="pj-actions">
            {single || !page.downloads.length ? (
              <Downloads page={page} primary />
            ) : (
              <a href="#download" className="btn pri">
                Download
              </a>
            )}
            {page.sourceUrl && (
              <a href={page.sourceUrl} className="btn" rel="noopener">
                Source code
              </a>
            )}
            {p.landingUrl && (
              <a href={p.landingUrl} className="btn" target="_blank" rel="noopener noreferrer">
                Website ↗<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </p>
        </div>
        {hero && (
          <figure className="pj-visual">
            <Shot shot={hero} sizes="(max-width: 900px) 100vw, 560px" eager />
            {hero.caption && <figcaption>{hero.caption}</figcaption>}
          </figure>
        )}
      </header>

      {gallery.length > 0 && (
        <section className="section" aria-labelledby="pj-shots">
          <h2 id="pj-shots">Screenshots</h2>
          <ul className="pj-gallery">
            {gallery.map((s) => (
              <li key={s.media}>
                <figure>
                  <Shot shot={s} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 360px" />
                  {s.caption && <figcaption>{s.caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.reasons.length > 0 && (
        <section className="section" aria-labelledby="pj-why">
          <h2 id="pj-why">Why {p.name}?</h2>
          <ul className="pj-cards">
            {page.reasons.map((r) => (
              <li key={r.title} className="frame">
                <h3>{r.title}</h3>
                {r.text && <p>{r.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.features.length > 0 && (
        <section className="section" aria-labelledby="pj-features">
          <h2 id="pj-features">Features</h2>
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
        </section>
      )}

      {page.steps.length > 0 && (
        <section className="section" aria-labelledby="pj-start">
          <h2 id="pj-start">Get started</h2>
          <ol className="pj-steps">
            {page.steps.map((s, i) => (
              <li key={s.title}>
                <span className="sn" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  {s.text && <p>{s.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {page.faq.length > 0 && (
        <section className="section" aria-labelledby="pj-faq">
          <h2 id="pj-faq">Questions</h2>
          <div className="pj-faq">
            {page.faq.map((f) => (
              <details key={f.question} className="frame">
                <summary>{f.question}</summary>
                <div className="prose" dangerouslySetInnerHTML={{ __html: f.answerHtml }} />
              </details>
            ))}
          </div>
        </section>
      )}

      <section id="download" className="section pj-download frame" aria-labelledby="pj-get">
        <h2 id="pj-get">{page.downloads.length ? `Get ${p.name}` : `${p.name} is coming soon`}</h2>
        <p>
          {page.downloads.length
            ? `Free${page.version ? `, version ${page.version}` : ''}${p.platforms.length ? `, for ${p.platforms.join(', ')}` : ''}.`
            : 'It isn’t ready to download yet. Check back soon.'}
        </p>
        <p className="pj-actions">
          <Downloads page={page} primary />
        </p>
        <p className="meta">
          <Link href="/projects">← All projects</Link>
        </p>
      </section>
    </article>
  );
}
