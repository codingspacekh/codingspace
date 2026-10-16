import { markdownToDoc } from '@/server/content/markdown';
import { renderContent } from './index';

/**
 * Short Markdown-with-LaTeX text (problem statements, hints, solutions: 03 §7) → safe HTML,
 * through the same renderer as lessons.
 */
export async function renderSnippet(md: string, lang: 'en' | 'km' = 'en') {
  if (!md.trim()) return { html: '', hasMath: false };
  const { html, hasMath } = await renderContent(markdownToDoc(md).doc, { lang });
  return { html, hasMath };
}
