/**
 * Practice questions inside a lesson (v1.1): checked instantly in the student's browser, nothing
 * sent anywhere. Shared by the editor, the renderer (server) and the lesson page (browser).
 * The answers are in the page, so this is for practice, not for marks.
 */

export const PRACTICE_KINDS = {
  choice: 'Multiple choice',
  text: 'Short answer',
  reveal: 'Show the answer (self-check)',
} as const;
export type PracticeKind = keyof typeof PRACTICE_KINDS;

export type PracticeOption = { text: string; correct: boolean };

/** The node's attributes. Text fields are Markdown with $maths$, like the problem of the week. */
export type PracticeAttrs = {
  kind: PracticeKind;
  prompt: string;
  /** Multiple choice: 2–8 options; one correct is "choose one", more is "choose all that apply". */
  options?: PracticeOption[];
  /** Short answer: every accepted answer (case, spaces and a final full stop don't matter). */
  answers?: string[];
  hint?: string;
  /** Shown after checking (or the answer itself, for "reveal"). */
  explanation?: string;
};

export const PRACTICE_LIMITS = {
  prompt: 2000,
  option: 300,
  options: 8,
  answer: 200,
  answers: 20,
  hint: 1000,
  explanation: 3000,
};

/** The form an answer is compared in: "  Big-O. " and "big-o" are the same answer. */
export const normalizeAnswer = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]+$/, '')
    .trim();

export const isAccepted = (given: string, accepted: readonly string[]) => {
  const g = normalizeAnswer(given);
  return g !== '' && accepted.some((a) => normalizeAnswer(a) === g);
};

/** What stops a practice question from making sense, for the editor (null when it is fine). */
export function practiceProblem(a: PracticeAttrs): string | null {
  if (!a.prompt.trim()) return 'Write the question.';
  if (a.kind === 'choice') {
    const options = (a.options ?? []).filter((o) => o.text.trim());
    if (options.length < 2) return 'Give at least two options.';
    if (!options.some((o) => o.correct)) return 'Tick the correct option.';
  }
  if (a.kind === 'text' && !(a.answers ?? []).some((x) => x.trim())) return 'Add at least one accepted answer.';
  if (a.kind === 'reveal' && !(a.explanation ?? '').trim()) return 'Write the answer to show.';
  return null;
}
