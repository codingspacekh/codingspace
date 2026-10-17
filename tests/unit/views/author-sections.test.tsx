import { render, screen, within } from '@testing-library/react';
import type { AuthorPageItem, AuthorPageSection } from '@/server/data/types';
import { AuthorSections } from '@/views/author-sections';

const item = (title: string, extra: Partial<AuthorPageItem> = {}): AuthorPageItem => ({
  title,
  subtitle: '',
  period: '',
  noteHtml: '',
  url: null,
  tags: [],
  ...extra,
});
const section = (kind: AuthorPageSection['kind'], title: string, items: AuthorPageItem[] = []): AuthorPageSection => ({
  id: kind === 'custom' ? '0f6c2a5e-0000-4000-8000-000000000001' : kind,
  kind,
  title,
  items,
});
const region = (name: string) => screen.getByRole('region', { name });

describe('<AuthorSections> (ADM-14)', () => {
  it('shows the sections in the order given, each under its own heading', () => {
    render(
      <AuthorSections
        lifePosts={[]}
        sections={[
          section('skills', 'What I know', [item('Code', { tags: ['Python'] })]),
          section('timeline', 'Timeline', [item('Started teaching', { period: '2018' })]),
          section('life_posts', 'Life posts'),
        ]}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'What I know',
      'Timeline',
      'Life posts',
    ]);
    expect(within(region('Life posts')).getByText('No posts yet.')).toBeInTheDocument();
  });

  it('shows a job or a school with where, when and the details', () => {
    render(
      <AuthorSections
        lifePosts={[]}
        sections={[
          section('experience', 'Experience', [
            item('Teacher', {
              subtitle: 'Some School',
              period: '2019 – now',
              noteHtml: '<p>Taught <strong>9618</strong>.</p>',
            }),
          ]),
        ]}
      />,
    );
    const job = within(region('Experience')).getByRole('listitem');
    expect(within(job).getByRole('heading', { level: 3, name: 'Teacher' })).toBeInTheDocument();
    expect(job).toHaveTextContent('Some School');
    expect(job).toHaveTextContent('2019 – now');
    expect(within(job).getByText('9618').tagName).toBe('STRONG');
  });

  it('shows skills as tags in their groups', () => {
    render(
      <AuthorSections
        lifePosts={[]}
        sections={[section('skills', 'Skills', [item('Programming', { tags: ['Python', 'C++'] })])]}
      />,
    );
    const group = within(region('Skills')).getByRole('list', { name: 'Programming' });
    expect(
      within(group)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Python', 'C++']);
  });

  it('links an award to its page in a new tab, safely', () => {
    render(
      <AuthorSections
        lifePosts={[]}
        sections={[
          section('awards', 'Awards', [
            item('Teacher of the year', { subtitle: 'Ministry', period: '2024', url: 'https://example.com/award' }),
            item('No link'),
          ]),
        ]}
      />,
    );
    const link = within(region('Awards')).getByRole('link', { name: /Teacher of the year/ });
    expect(link).toHaveAttribute('href', 'https://example.com/award');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(region('Awards')).getAllByRole('link')).toHaveLength(1);
  });

  it('shows hobbies and custom sections', () => {
    render(
      <AuthorSections
        lifePosts={[]}
        sections={[
          section('hobbies', 'Hobbies', [item('Chess', { noteHtml: '<p>Most evenings.</p>' })]),
          section('custom', 'Languages', [item('Khmer', { subtitle: 'Native' }), item('English')]),
        ]}
      />,
    );
    expect(within(region('Hobbies')).getByRole('heading', { level: 3, name: 'Chess' })).toBeInTheDocument();
    expect(region('Hobbies')).toHaveTextContent('Most evenings.');
    expect(within(region('Languages')).getAllByRole('listitem')).toHaveLength(2);
    expect(region('Languages')).toHaveTextContent('Native');
  });
});
