import { createContext, useContext, useMemo } from 'react';

/**
 * Subjects live in the database (public.subjects), edited in /admin/subjects. Pages get the
 * visible ones as the `subjects` prop and _app shares them through SubjectsProvider; the admin
 * shell shares all of them, hidden ones too.
 */
export type SubjectId = string;

/** Colours a subject can have: the c-<colour> classes in globals.css (the database checks the same list). */
export const SUBJECT_COLORS = ['cyan', 'violet', 'amber', 'lime', 'pink', 'orange', 'sky', 'rose', 'gold'] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

export type Subject = {
  id: SubjectId;
  name: string;
  glyph: string;
  color: SubjectColor;
  /** One line for the Study menu and the Home card. */
  blurb: string;
  /** The subject page's opening paragraph. */
  intro: string;
};

/** The address in /study/<id>: lowercase letters only (also the analytics path pattern). */
export const SUBJECT_ID = /^[a-z]{1,24}$/;

/** The address a new subject's name gives: "Further Maths" → furthermaths, "Économie 2" → economie; "" for none. */
export const subjectAddress = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 24);

const SubjectsContext = createContext<Subject[]>([]);
export const SubjectsProvider = SubjectsContext.Provider;

/** The subjects in site order, and a lookup that is undefined for a hidden or deleted subject. */
export function useSubjects() {
  const subjects = useContext(SubjectsContext);
  return useMemo(() => {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return { subjects, subject: (id: SubjectId | null | undefined) => (id ? byId.get(id) : undefined) };
  }, [subjects]);
}
