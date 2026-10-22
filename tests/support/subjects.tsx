import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SubjectsProvider, type Subject } from '@/lib/subjects';

/** The four subjects every database starts with (init + subjects_admin migrations). */
export const SUBJECTS: Subject[] = [
  {
    id: 'math',
    name: 'Math',
    glyph: '∑',
    icon: '',
    color: 'cyan',
    blurb: 'Competition maths: inequalities, sequences, functional equations and more.',
    intro: 'Olympiad-style mathematics.',
  },
  {
    id: 'physics',
    name: 'Physics',
    glyph: 'Ψ',
    icon: '',
    color: 'violet',
    blurb: 'Mechanics to modern physics, with diagrams and simulations.',
    intro: 'Physics built from intuition first.',
  },
  {
    id: 'coding',
    name: 'Coding',
    glyph: '</>',
    icon: '',
    color: 'amber',
    blurb: 'Python, algorithms, data structures and Cambridge CS 9618.',
    intro: 'Programming from the first loop to Paper 4.',
  },
  {
    id: 'it',
    name: 'IT',
    glyph: '⌘',
    icon: '',
    color: 'lime',
    blurb: 'Cambridge IT 9626: spreadsheets, databases, networks and more.',
    intro: 'Cambridge AS & A Level Information Technology (9626).',
  },
];

export const subjectName = (id: string) => SUBJECTS.find((s) => s.id === id)?.name;

/** Testing Library's render, inside the subjects pages and the admin shell share. */
export function render(ui: ReactElement, options: RenderOptions & { subjects?: Subject[] } = {}) {
  const { subjects = SUBJECTS, ...rest } = options;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SubjectsProvider value={subjects}>{children}</SubjectsProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...rest });
}
