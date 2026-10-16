import { createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki';

const THEME = 'github-dark-default';

/** Allow-listed languages: alias → [Shiki id, label]. Everything else is plain text. */
const LANGUAGES = new Map<string, [string, string]>([
  ['python', ['python', 'Python']],
  ['py', ['python', 'Python']],
  ['javascript', ['javascript', 'JavaScript']],
  ['js', ['javascript', 'JavaScript']],
  ['typescript', ['typescript', 'TypeScript']],
  ['ts', ['typescript', 'TypeScript']],
  ['java', ['java', 'Java']],
  ['c', ['c', 'C']],
  ['cpp', ['cpp', 'C++']],
  ['c++', ['cpp', 'C++']],
  ['csharp', ['csharp', 'C#']],
  ['cs', ['csharp', 'C#']],
  ['vb', ['vb', 'Visual Basic']],
  ['sql', ['sql', 'SQL']],
  ['html', ['html', 'HTML']],
  ['css', ['css', 'CSS']],
  ['bash', ['bash', 'Bash']],
  ['sh', ['bash', 'Bash']],
  ['shell', ['bash', 'Bash']],
  ['json', ['json', 'JSON']],
  ['pseudocode', ['text', 'Pseudocode']],
]);

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
  return (await getHighlighter()).codeToHtml(code, { lang, theme: THEME });
}
