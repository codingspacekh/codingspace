import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderContent } from '@/server/render';
import { findUnsafe } from './assert-safe';

// Three reference lessons (maths, code, mixed). A change to the rendered HTML must be
// reviewed: update the snapshots with `npx vitest run -u` only when the change is intended.
const FIXTURES = join(__dirname, '../../fixtures/lessons');

describe.each(['maths', 'code', 'mixed'])('reference lesson: %s', (name) => {
  it('renders to the reviewed HTML and metadata', async () => {
    const input = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
    const { html, ...meta } = await renderContent(input);
    expect(findUnsafe(html)).toEqual([]);
    await expect(html).toMatchFileSnapshot(`./__snapshots__/${name}.html`);
    expect(meta).toMatchSnapshot();
  });
});
