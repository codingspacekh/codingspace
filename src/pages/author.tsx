import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { imageKey, mediaUrl, srcset } from '@/lib/media-urls';
import type { Subject } from '@/lib/subjects';
import { getAuthorPage, getSubjects } from '@/server/data/public';
import type { AuthorPageSection, PostCard, Profile } from '@/server/data/types';
import { AuthorSections } from '@/views/author-sections';

type Props = {
  profile: Profile | null;
  description: string;
  sections: AuthorPageSection[];
  lifePosts: PostCard[];
  hasMath: boolean;
  subjects: Subject[];
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [page, subjects] = await Promise.all([getAuthorPage(), getSubjects()]);
  return { props: { ...page, subjects }, revalidate: REVALIDATE };
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The author's photo in its frame (about 200 px wide), as AVIF or WebP. */
function Photo({ photo, name }: { photo: NonNullable<Profile['photo']>; name: string }) {
  const sizes = '(max-width: 760px) 140px, 200px';
  return (
    <picture>
      <source type="image/avif" srcSet={srcset(photo.id, photo.widths, 'avif')} sizes={sizes} />
      <img
        src={mediaUrl(imageKey(photo.id, photo.widths[0]!, 'webp'))}
        srcSet={srcset(photo.id, photo.widths, 'webp')}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={name}
        decoding="async"
      />
    </picture>
  );
}

export default function Author({ profile, description, sections, lifePosts, hasMath }: Props) {
  const name = profile?.name ?? 'CodingSpaceKH';
  return (
    <Layout title={`Author · ${name}`} description={description || undefined} path="/author" active="author">
      {hasMath && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <section className="frame profile c-cyan" aria-labelledby="who">
        {profile?.photo ? (
          <div className={`avatar avatar--photo avatar--${profile.photoShape}`}>
            <Photo photo={profile.photo} name={name} />
          </div>
        ) : (
          <div className={`avatar avatar--${profile?.photoShape ?? 'hexagon'}`} aria-hidden="true">
            <span>{initials(name)}</span>
          </div>
        )}
        <div className="who">
          <h1 id="who">{name}</h1>
          {profile?.bioHtml && <div className="prose lead" dangerouslySetInnerHTML={{ __html: profile.bioHtml }} />}
          {(profile?.years != null || profile?.students != null || profile?.email) && (
            <dl className="facts">
              {profile?.years != null && (
                <div className="fact">
                  <dt>Years teaching</dt>
                  <dd>{profile.years}</dd>
                </div>
              )}
              {profile?.students != null && (
                <div className="fact">
                  <dt>Students</dt>
                  <dd>{profile.students}+</dd>
                </div>
              )}
              {profile?.email && (
                <div className="fact">
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${profile.email}`}>{profile.email}</a>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <AuthorSections sections={sections} lifePosts={lifePosts} />
    </Layout>
  );
}
