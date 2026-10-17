import type { AuthorPageItem, AuthorPageSection, PostCard } from '@/server/data/types';
import { PostTile } from './cards';

/**
 * The Author page's sections (03 ADM-14), in the owner's order. Only what the owner chose to
 * show gets here (author_page() leaves the rest out); notes are HTML from the lesson renderer.
 */
export function AuthorSections({ sections, lifePosts }: { sections: AuthorPageSection[]; lifePosts: PostCard[] }) {
  return (
    <>
      {sections.map((s) => {
        const id = `a-${s.id}`;
        return (
          <section key={s.id} className={`section author-${s.kind}`} aria-labelledby={id}>
            <div className="shead">
              <div>
                {s.kind === 'life_posts' && <span className="eyebrow">Notes from outside class</span>}
                <h2 id={id}>{s.title}</h2>
              </div>
            </div>
            <Body section={s} lifePosts={lifePosts} />
          </section>
        );
      })}
    </>
  );
}

function Body({ section, lifePosts }: { section: AuthorPageSection; lifePosts: PostCard[] }) {
  const { kind, items } = section;
  if (kind === 'life_posts')
    return lifePosts.length > 0 ? (
      <div className="grid3">
        {lifePosts.map((p) => (
          <PostTile key={p.slug} post={p} />
        ))}
      </div>
    ) : (
      <p className="empty">No posts yet.</p>
    );

  if (kind === 'timeline')
    return (
      <ol className="timeline">
        {items.map((t, i) => (
          <li key={i} className="tl">
            <span className="y">{t.period}</span>
            <p>{t.title}</p>
          </li>
        ))}
      </ol>
    );

  if (kind === 'skills')
    return (
      <div className="skill-groups">
        {items.map((g, i) => (
          <div key={i} className="frame skill-group">
            <h3 id={`${section.id}-${i}`}>{g.title}</h3>
            <ul className="skill-tags" aria-labelledby={`${section.id}-${i}`}>
              {g.tags.map((t) => (
                <li key={t} className="tag">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );

  if (kind === 'hobbies')
    return (
      <ul className="grid3 hobbies">
        {items.map((h, i) => (
          <li key={i} className="frame hobby">
            <h3>{h.title}</h3>
            {h.noteHtml && <div className="prose" dangerouslySetInnerHTML={{ __html: h.noteHtml }} />}
          </li>
        ))}
      </ul>
    );

  // Experience, education, awards and custom sections: entries on the timeline line, with the
  // period on the left when there is one.
  const dated = items.some((e) => e.period);
  return (
    <ol className={`timeline${dated ? '' : ' timeline--plain'}`}>
      {items.map((e, i) => (
        <li key={i} className="tl">
          {dated && <span className="y">{e.period}</span>}
          <Entry entry={e} />
        </li>
      ))}
    </ol>
  );
}

function Entry({ entry: e }: { entry: AuthorPageItem }) {
  return (
    <div className="tl-body">
      <h3>
        {e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {e.title} ↗<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          e.title
        )}
      </h3>
      {e.subtitle && <p className="tl-where">{e.subtitle}</p>}
      {e.noteHtml && <div className="prose tl-note" dangerouslySetInnerHTML={{ __html: e.noteHtml }} />}
    </div>
  );
}
