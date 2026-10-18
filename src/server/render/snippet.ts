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

/**
 * A visitor's question or comment (v1.1): Markdown with $maths$, but only words, lists, quotes,
 * code and maths, and links marked rel="nofollow ugc". The teacher's answer uses renderSnippet.
 */
export async function renderVisitorText(md: string) {
  if (!md.trim()) return { html: '', hasMath: false };
  const { html, hasMath } = await renderContent(markdownToDoc(md).doc, { ugc: true });
  return { html, hasMath };
}
