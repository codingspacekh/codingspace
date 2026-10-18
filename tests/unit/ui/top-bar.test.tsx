import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar, UiRoot } from '@/ui';
import type { Subject } from '@/lib/subjects';
import { render, SUBJECTS } from '../../support/subjects';

const renderBar = (subjects = SUBJECTS) =>
  render(
    <UiRoot motion={false}>
      <TopBar />
    </UiRoot>,
    { subjects },
  );

describe('<TopBar>', () => {
  it('links Home, Projects and Author', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(within(nav).getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/author');
  });

  it('opens the Study menu with the four subjects, the series and the syllabus', async () => {
    renderBar();
    const study = screen.getByRole('button', { name: 'Study' });
    expect(study).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(study);
    expect(study).toHaveAttribute('aria-expanded', 'true');
    const menu = document.getElementById(study.getAttribute('aria-controls')!)!;
    const links = within(menu).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/study/math',
      '/study/physics',
      '/study/coding',
      '/study/it',
      '/series',
      '/syllabus',
    ]);
  });

  it('lists the subjects the page was given, in their order (v1.1: subjects come from the admin)', async () => {
    const chemistry: Subject = {
      id: 'chemistry',
      name: 'Chemistry',
      glyph: '⚗',
      color: 'orange',
      blurb: 'Atoms up.',
      intro: '',
    };
    renderBar([chemistry, SUBJECTS[0]!]);
    await userEvent.click(screen.getByRole('button', { name: 'Study' }));
    const chem = screen.getByRole('link', { name: /Chemistry/ });
    expect(chem).toHaveAttribute('href', '/study/chemistry');
    expect(chem).toHaveClass('c-orange');
    expect(chem).toHaveTextContent('Atoms up.');
    expect(screen.getAllByRole('link', { name: /Chemistry|Math/ }).map((l) => l.getAttribute('href'))).toEqual([
      '/study/chemistry',
      '/study/math',
    ]);
  });

  it('closes the Study menu with Escape and returns focus to the button', async () => {
    renderBar();
    const study = screen.getByRole('button', { name: 'Study' });
    await userEvent.click(study);
    await userEvent.keyboard('{Escape}');
    expect(study).toHaveAttribute('aria-expanded', 'false');
    expect(study).toHaveFocus();
  });

  it('closes the Study menu on an outside click', async () => {
    renderBar();
    const study = screen.getByRole('button', { name: 'Study' });
    await userEvent.click(study);
    await userEvent.click(document.body);
    expect(study).toHaveAttribute('aria-expanded', 'false');
  });

  it('has a menu button for small screens', async () => {
    renderBar();
    const burger = screen.getByRole('button', { name: 'Menu' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles sound and motion, both reported with aria-pressed', async () => {
    // A device that asks for reduced motion: motion starts off, and the visitor can turn it on.
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(
      <UiRoot>
        <TopBar />
      </UiRoot>,
    );
    const sound = screen.getByRole('button', { name: /sound/i });
    const motion = screen.getByRole('button', { name: /motion/i });
    expect(sound).toHaveAttribute('aria-pressed', 'false');
    expect(motion).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(motion);
    expect(motion).toHaveAttribute('aria-pressed', 'true');
  });
});
