import { BUILT_IN, cleanItem, KINDS, plainText, splitTags } from '@/lib/author';

const item = {
  title: 'BSc Physics',
  subtitle: 'RUPP',
  period: '2012 – 2016',
  note: 'With honours.',
  url: 'https://example.com',
  tags: ['x'],
  visible: true,
};

describe('Author page sections (ADM-14)', () => {
  it('has seven built-in sections, each with a title, and life posts without items', () => {
    expect(BUILT_IN).toEqual(['timeline', 'experience', 'education', 'skills', 'awards', 'hobbies', 'life_posts']);
    for (const kind of BUILT_IN) expect(KINDS[kind].title).not.toBe('');
    expect(KINDS.life_posts.fields).toEqual({});
    for (const kind of [...BUILT_IN, 'custom'] as const) {
      if (kind !== 'life_posts') expect(KINDS[kind].fields.title).toBeTruthy();
    }
  });

  it('keeps only the fields a kind of section uses', () => {
    expect(cleanItem('skills', item)).toEqual({
      title: 'BSc Physics',
      subtitle: '',
      period: '',
      note: '',
      url: null,
      tags: ['x'],
      visible: true,
    });
    expect(cleanItem('education', item)).toEqual({ ...item, url: null, tags: [] });
    expect(cleanItem('timeline', { ...item, visible: false })).toMatchObject({ period: '2012 – 2016', visible: false });
  });

  it('splits skills on commas, without empty ones or repeats', () => {
    expect(splitTags(' Python, C++ ,, python ,Pascal,')).toEqual(['Python', 'C++', 'Pascal']);
    expect(splitTags('')).toEqual([]);
  });

  it('turns Markdown into plain text for the page description', () => {
    expect(plainText('I **teach** [maths](https://x.example) and _physics_.\n\nSince 2018.')).toBe(
      'I teach maths and physics. Since 2018.',
    );
    expect(plainText('a'.repeat(300))).toHaveLength(160);
    expect(plainText('a'.repeat(300)).endsWith('…')).toBe(true);
  });
});
