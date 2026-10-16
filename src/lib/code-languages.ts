/** Shared by the renderer (Shiki) and the editor's language menu. Pure data: safe in the browser. */

/** Allow-listed languages: alias → [Shiki id, label]. Everything else is plain text. */
export const CODE_LANGUAGES = new Map<string, [string, string]>([
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

/** One entry per language for the editor's menu: the stored value and its label. */
export const CODE_LANGUAGE_CHOICES: { value: string; label: string }[] = [
  ...new Map([...CODE_LANGUAGES].map(([alias, [id, label]]) => [id === 'text' ? alias : id, label])),
].map(([value, label]) => ({ value, label }));
