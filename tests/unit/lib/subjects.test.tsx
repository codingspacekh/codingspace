import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SUBJECT_ID, subjectAddress, SubjectsProvider, useSubjects } from '@/lib/subjects';
import { SUBJECTS } from '../../support/subjects';

describe('subjects (v1.1: from the database)', () => {
  it('makes a letters-only address from a name', () => {
    expect(subjectAddress('Further Maths')).toBe('furthermaths');
    expect(subjectAddress('Économie 2')).toBe('economie');
    expect(subjectAddress('E2E Chemistry')).toBe('eechemistry');
    expect(subjectAddress('គណិតវិទ្យា')).toBe('');
    expect(subjectAddress('x'.repeat(30))).toHaveLength(24);
    expect(SUBJECT_ID.test('chemistry')).toBe(true);
    expect(SUBJECT_ID.test('chem-2')).toBe(false);
  });

  it('shares the subjects in order, with a lookup that misses hidden or deleted ones', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SubjectsProvider value={SUBJECTS}>{children}</SubjectsProvider>
    );
    const { result } = renderHook(() => useSubjects(), { wrapper });
    expect(result.current.subjects.map((s) => s.id)).toEqual(['math', 'physics', 'coding', 'it']);
    expect(result.current.subject('physics')?.name).toBe('Physics');
    expect(result.current.subject('chemistry')).toBeUndefined();
    expect(result.current.subject(null)).toBeUndefined();
    // Without a provider (a page that forgot to pass them): none, never a crash.
    expect(renderHook(() => useSubjects()).result.current.subjects).toEqual([]);
  });
});
