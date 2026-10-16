import { createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki';
import { CODE_LANGUAGES as LANGUAGES } from '@/lib/code-languages';

const THEME = 'github-dark-default';

let highlighter: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: [THEME],
    langs: [...new Set([...LANGUAGES.values()].map(([id]) => id).filter((id) => id !== 'text'))],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export function resolveLanguage(language: unknown): { id: string; label: string } {
  const key = typeof language === 'string' ? language.trim().toLowerCase() : '';
  const [id, label] = LANGUAGES.get(key) ?? ['text', 'Text'];
  return { id, label };
}

/** Returns Shiki's `<pre>`; Shiki escapes the code and only adds inline colour styles. */
export async function highlight(code: string, lang: string): Promise<string> {
  return (await getHighlighter()).codeToHtml(code, {
    lang,
    theme: THEME,
    // Shiki stops colouring a line after 500 ms by default, which a busy machine can hit while the
    // grammar compiles. Publishing must give the same HTML every time, so allow far longer.
    tokenizeTimeLimit: 30_000,
  });
}
