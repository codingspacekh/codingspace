import { EMBED_ORIGINS, MEDIA_BASE_URL } from '@/server/render/policy';

const media = (value: string) => value.startsWith(`${MEDIA_BASE_URL.toLowerCase()}/`);

const FORBIDDEN_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'foreignobject',
  'use',
  'animate',
  'set',
  'frame',
  'frameset',
  'template',
  'noscript',
];

const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'srcset'];

/**
 * Parses rendered HTML and lists everything that could run code or load from an
 * origin the CSP does not allow. An empty list means the output is safe.
 */
export function findUnsafe(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const problems: string[] = [];

  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.includes(tag)) problems.push(`<${tag}> element`);

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) problems.push(`${name} handler on <${tag}>`);
      if (name === 'style' && /url\(|expression\(|@import|javascript:/.test(value)) {
        problems.push(`active style on <${tag}>: ${attr.value}`);
      }
      if (name === 'srcset') {
        // "url 480w, url 960w": every candidate must be on the media address.
        const urls = value.split(',').map((c) => c.trim().split(/\s+/)[0] ?? '');
        if (!['img', 'source'].includes(tag) || !urls.every(media)) problems.push(`srcset="${attr.value}" on <${tag}>`);
        continue;
      }
      if (URL_ATTRS.includes(name)) {
        const ok =
          (tag === 'a' && (/^https:\/\//.test(value) || value.startsWith('mailto:'))) ||
          (tag === 'a' && /^\/(?!\/)/.test(value)) ||
          (tag === 'a' && value.startsWith('#')) ||
          (tag === 'img' && media(value)) ||
          (tag === 'iframe' && EMBED_ORIGINS.some((o) => value.startsWith(`${o}/`)));
        if (!ok) problems.push(`${name}="${attr.value}" on <${tag}>`);
      }
    }

    if (tag === 'iframe' && !el.hasAttribute('src')) problems.push('<iframe> without src');
  }
  return problems;
}
