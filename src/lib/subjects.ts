/** The four fixed subjects (seeded in the init migration) and their copy. */
export const SUBJECTS = {
  math: {
    name: 'Math',
    glyph: '∑',
    color: 'cyan',
    blurb: 'Competition maths: inequalities, sequences, functional equations and more.',
    intro:
      'Olympiad-style mathematics. These problems reward clever ideas, not formula plugging. Each section moves from first tools to contest-level problems.',
  },
  physics: {
    name: 'Physics',
    glyph: 'Ψ',
    color: 'violet',
    blurb: 'Mechanics to modern physics, with diagrams and simulations.',
    intro:
      'Physics built from intuition first, then equations. Each lesson has worked problems and, where possible, a simulation to play with.',
  },
  coding: {
    name: 'Coding',
    glyph: '</>',
    color: 'amber',
    blurb: 'Python, algorithms, data structures and Cambridge CS 9618.',
    intro:
      'Programming from the first loop to Paper 4. Every lesson has code you can run, plus pseudocode in the Cambridge 9618 style.',
  },
  it: {
    name: 'IT',
    glyph: '⌘',
    color: 'lime',
    blurb: 'Cambridge IT 9626: spreadsheets, databases, networks and more.',
    intro:
      'Cambridge AS & A Level Information Technology (9626), with theory notes and step-by-step practical walkthroughs.',
  },
} as const;

export type SubjectId = keyof typeof SUBJECTS;
export const SUBJECT_IDS = Object.keys(SUBJECTS) as SubjectId[];
export const isSubjectId = (v: unknown): v is SubjectId => typeof v === 'string' && Object.hasOwn(SUBJECTS, v);
