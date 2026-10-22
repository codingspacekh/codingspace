import { render } from '@testing-library/react';
import { SubjectMark } from '@/ui/subject-mark';

describe('<SubjectMark> (2026-10-23)', () => {
  it('draws the subject’s icon, in the text colour', () => {
    const { container } = render(<SubjectMark subject={{ glyph: 'Ψ', icon: 'physics' }} />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg.subject-icon path')).toHaveAttribute('stroke', 'currentColor');
  });

  it('shows the symbol without an icon, or with one the site no longer has', () => {
    expect(render(<SubjectMark subject={{ glyph: 'Ψ', icon: '' }} />).container.textContent).toBe('Ψ');
    const gone = render(<SubjectMark subject={{ glyph: '⚗', icon: 'chemistry' }} />).container;
    expect(gone.querySelector('svg')).toBeNull();
    expect(gone.textContent).toBe('⚗');
    expect(render(<SubjectMark subject={undefined} />).container.textContent).toBe('✦');
  });
});
