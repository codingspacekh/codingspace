import type { GetStaticProps } from 'next';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { getAuthorPage } from '@/server/data/public';
import type { PostCard, Profile } from '@/server/data/types';
import { PostTile } from '@/views/cards';

type Props = { profile: Profile | null; timeline: { year: number; text: string }[]; lifePosts: PostCard[] };

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: await getAuthorPage(),
  revalidate: REVALIDATE,
});

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function Author({ profile, timeline, lifePosts }: Props) {
  const name = profile?.name ?? 'CodingSpace';
  return (
    <Layout title={`Author · ${name}`} description={profile?.bio} active="author">
      <section className="frame profile c-cyan" aria-labelledby="who">
        <div className="avatar" aria-hidden="true">
          <span>{initials(name)}</span>
        </div>
        <div className="who">
          <span className="eyebrow">Author</span>
          <h1 id="who">{name}</h1>
          {profile?.bio && <p className="lead">{profile.bio}</p>}
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
        </div>
      </section>

      {timeline.length > 0 && (
        <section className="section" aria-labelledby="timeline">
          <div className="shead">
            <h2 id="timeline">Timeline</h2>
          </div>
          <ol className="timeline">
            {timeline.map((t) => (
              <li key={`${t.year}-${t.text}`} className="tl">
                <span className="y">{t.year}</span>
                <p>{t.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="section" aria-labelledby="life">
        <div className="shead">
          <div>
            <span className="eyebrow">Notes from outside class</span>
            <h2 id="life">Life posts</h2>
          </div>
        </div>
        {lifePosts.length > 0 ? (
          <div className="grid3">
            {lifePosts.map((p) => (
              <PostTile key={p.slug} post={p} />
            ))}
          </div>
        ) : (
          <p className="empty">No posts yet.</p>
        )}
      </section>
    </Layout>
  );
}
