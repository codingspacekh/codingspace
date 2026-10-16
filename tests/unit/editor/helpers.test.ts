import { CODE_LANGUAGE_CHOICES } from '@/lib/code-languages';
import { parseEmbedUrl } from '@/lib/embed-url';
import { resolveLanguage } from '@/server/render/highlight';

describe('parseEmbedUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', { provider: 'youtube', id: 'dQw4w9WgXcQ' }],
    ['https://youtu.be/dQw4w9WgXcQ?si=x', { provider: 'youtube', id: 'dQw4w9WgXcQ' }],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', { provider: 'youtube', id: 'dQw4w9WgXcQ' }],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', { provider: 'youtube', id: 'dQw4w9WgXcQ' }],
    ['https://www.desmos.com/calculator/abcdef1234', { provider: 'desmos', id: 'abcdef1234' }],
    ['https://www.geogebra.org/m/Ab12Cd34', { provider: 'geogebra', id: 'Ab12Cd34' }],
    ['https://www.geogebra.org/material/show/id/Ab12Cd34', { provider: 'geogebra', id: 'Ab12Cd34' }],
  ])('%s', (url, ref) => {
    expect(parseEmbedUrl(url)).toEqual(ref);
  });

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
    'https://vimeo.com/123456',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s', (url) => {
    expect(parseEmbedUrl(url)).toBeNull();
  });
});

describe('code languages', () => {
  it('offers each language once, and every choice is one the renderer highlights', () => {
    const values = CODE_LANGUAGE_CHOICES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual(expect.arrayContaining(['python', 'java', 'sql', 'pseudocode']));
    for (const c of CODE_LANGUAGE_CHOICES) expect(resolveLanguage(c.value).label).toBe(c.label);
  });
});
