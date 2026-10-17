import { renderContent } from '@/server/render';
import { findUnsafe } from './assert-safe';

// 03 §8.4: script tags, javascript: URLs, event handlers, SVG payloads and CSS injection
// must produce no executable output, whatever JSON reaches the renderer.

const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: unknown, marks?: unknown[]) => ({ type: 'text', text: t, marks });
const link = (href: unknown) => [{ type: 'link', attrs: { href } }];
const doc = (...content: unknown[]) => ({ type: 'doc', content });

const BAD_URLS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java&#x09;script:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
  '//evil.example/x',
  'http://evil.example/x',
  'https://files.codingspacekh.dev.evil.example/x.png',
  'https://files.codingspacekh.dev@evil.example/x.png',
  'https://evil.example/x.png',
];

const CORPUS: [string, unknown][] = [
  ['script tag in text', doc(p(text('<script>alert(1)</script>')))],
  ['img onerror in text', doc(p(text('<img src=x onerror=alert(1)>')))],
  ['svg onload in text', doc(p(text('<svg/onload=alert(1)>')))],
  ['quote break-out in link href', doc(p(text('x', link('https://a.example/" onmouseover="alert(1)'))))],
  ...BAD_URLS.map((u): [string, unknown] => [`link to ${u}`, doc(p(text('x', link(u))))]),
  ...BAD_URLS.map((u): [string, unknown] => [`image from ${u}`, doc({ type: 'image', attrs: { src: u, alt: 'x' } })]),
  ...BAD_URLS.map((u): [string, unknown] => [
    `file link to ${u}`,
    doc({ type: 'file', attrs: { href: u, name: 'x.pdf' } }),
  ]),
  ...['javascript:alert(1)', '../../x', '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f/../../x', '" onerror="alert(1)'].flatMap(
    (m): [string, unknown][] => [
      [`uploaded image with media id ${m}`, doc({ type: 'image', attrs: { media: m, widths: [480], alt: 'x' } })],
      [`uploaded file with media id ${m}`, doc({ type: 'file', attrs: { media: m, name: 'x.pdf' } })],
    ],
  ),
  [
    'uploaded image widths injection',
    doc({
      type: 'image',
      attrs: { media: '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f', widths: [480, '960w, javascript:alert(1) 1x'], alt: 'x' },
    }),
  ],
  [
    'uploaded image alt break-out',
    doc({
      type: 'image',
      attrs: { media: '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f', widths: [480], alt: '" onerror="alert(1)' },
    }),
  ],
  [
    'image alt break-out',
    doc({ type: 'image', attrs: { src: 'https://files.codingspacekh.dev/a.png', alt: '" onerror="alert(1)' } }),
  ],
  [
    'image caption html',
    doc({
      type: 'image',
      attrs: { src: 'https://files.codingspacekh.dev/a.png', alt: 'a', caption: '<script>alert(1)</script>' },
    }),
  ],
  [
    'image width CSS injection',
    doc({
      type: 'image',
      attrs: {
        src: 'https://files.codingspacekh.dev/a.png',
        alt: 'a',
        width: '1" style="background:url(javascript:alert(1))',
      },
    }),
  ],
  ['unknown node: script', doc({ type: 'script', content: [text('alert(1)')] })],
  ['unknown node: raw html', doc({ type: 'html', attrs: { html: '<script>alert(1)</script>' } })],
  ['unknown node: iframe', doc({ type: 'iframe', attrs: { src: 'https://evil.example' } })],
  ['unknown mark', doc(p(text('x', [{ type: 'html', attrs: { html: '<script>' } }])))],
  ['embed from unknown provider', doc({ type: 'embed', attrs: { provider: 'evil', id: 'x' } })],
  ['embed id break-out', doc({ type: 'embed', attrs: { provider: 'youtube', id: 'abc"><script>alert(1)</script>' } })],
  ['embed id path traversal', doc({ type: 'embed', attrs: { provider: 'desmos', id: '../../evil' } })],
  [
    'embed title break-out',
    doc({ type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: '" onload="alert(1)' } }),
  ],
  ['katex \\href javascript', doc(p({ type: 'mathInline', attrs: { latex: '\\href{javascript:alert(1)}{x}' } }))],
  ['katex \\url javascript', doc({ type: 'mathBlock', attrs: { latex: '\\url{javascript:alert(1)}' } })],
  [
    'katex \\htmlStyle CSS',
    doc({ type: 'mathBlock', attrs: { latex: '\\htmlStyle{background:url(javascript:alert(1))}{x}' } }),
  ],
  [
    'katex \\includegraphics',
    doc({ type: 'mathBlock', attrs: { latex: '\\includegraphics{https://evil.example/x.png}' } }),
  ],
  ['katex raw html in error', doc({ type: 'mathBlock', attrs: { latex: '\\frac{<img src=x onerror=alert(1)>' } })],
  [
    'code language break-out',
    doc({ type: 'codeBlock', attrs: { language: '"><script>alert(1)</script>' }, content: [text('x')] }),
  ],
  [
    'code content closes tags',
    doc({ type: 'codeBlock', attrs: { language: 'html' }, content: [text('</code></pre><script>alert(1)</script>')] }),
  ],
  [
    'heading id break-out',
    doc({ type: 'heading', attrs: { level: 2 }, content: [text('"><img src=x onerror=alert(1)>')] }),
  ],
  [
    'callout variant break-out',
    doc({ type: 'callout', attrs: { variant: '" onclick="alert(1)' }, content: [p(text('x'))] }),
  ],
  [
    'ordered list start break-out',
    doc({
      type: 'orderedList',
      attrs: { start: '1" onclick="alert(1)' },
      content: [{ type: 'listItem', content: [p(text('x'))] }],
    }),
  ],
  [
    'file name html',
    doc({ type: 'file', attrs: { href: 'https://files.codingspacekh.dev/a.pdf', name: '<script>alert(1)</script>' } }),
  ],
  [
    'table cell attribute break-out',
    doc({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: '2" onclick="alert(1)', style: 'background:url(x)' },
              content: [p(text('x'))],
            },
          ],
        },
      ],
    }),
  ],
  ['unknown node inside a table', doc({ type: 'table', content: [{ type: 'script', content: [text('alert(1)')] }] })],
  ['prototype keys', JSON.parse('{"type":"doc","content":[{"type":"__proto__","attrs":{"polluted":true}}]}')],
];

describe('renderer XSS corpus', () => {
  it.each(CORPUS)('%s produces nothing executable', async (_name, input) => {
    const { html } = await renderContent(input);
    expect(findUnsafe(html)).toEqual([]);
  });

  it('escapes markup typed as text instead of dropping it', async () => {
    const { html } = await renderContent(doc(p(text('<script>alert(1)</script>'))));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps the link text when it drops a bad href', async () => {
    const { html } = await renderContent(doc(p(text('click me', link('javascript:alert(1)')))));
    expect(html).toBe('<p>click me</p>');
  });

  it('survives hostile shapes without throwing', async () => {
    let deep: unknown = text('bottom');
    for (let i = 0; i < 10_000; i++) deep = { type: 'blockquote', content: [deep] };
    const shapes: unknown[] = [
      null,
      undefined,
      42,
      'doc',
      [],
      {},
      { type: 'doc' },
      { type: 'doc', content: 'x' },
      doc(deep),
      doc(p(text({ toString: 1 }))),
    ];
    for (const s of shapes) {
      const out = await renderContent(s);
      expect(findUnsafe(out.html)).toEqual([]);
    }
  });

  it('does not pollute Object.prototype', async () => {
    await renderContent(JSON.parse('{"type":"doc","content":[{"type":"paragraph","__proto__":{"polluted":1}}]}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
