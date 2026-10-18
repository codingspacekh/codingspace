import { parsePoints, pointAnchor } from '@/lib/syllabus';

describe('syllabus points (v1.1)', () => {
  it('reads a list pasted from a syllabus document', () => {
    const { points, problems } = parsePoints(
      [
        '1.1 Data representation',
        '  • 1.2 – Multimedia',
        '',
        '1.3: Compression',
        '4.2(a)\tAbstraction and decomposition',
        '- P1 Paper 1 revision',
        'Just some words',
        '2.1',
      ].join('\n'),
    );
    expect(points).toEqual([
      { code: '1.1', title: 'Data representation' },
      { code: '1.2', title: 'Multimedia' },
      { code: '1.3', title: 'Compression' },
      { code: '4.2(a)', title: 'Abstraction and decomposition' },
      { code: 'P1', title: 'Paper 1 revision' },
    ]);
    expect(problems).toEqual([
      'Line 7: “Just some words” needs a code and a title, like “1.1 Data representation”.',
      'Line 8: “2.1” needs a code and a title, like “1.1 Data representation”.',
    ]);
  });

  it('makes an anchor for each point', () => {
    expect(pointAnchor('1.1')).toBe('p-1-1');
    expect(pointAnchor('4.2(a)')).toBe('p-4-2-a');
    expect(pointAnchor('P1')).toBe('p-p1');
    expect(pointAnchor('§')).toBe('p-x');
  });
});
