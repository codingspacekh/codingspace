import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar, UiRoot } from '@/ui';

const renderBar = () =>
  render(
    <UiRoot motion={false}>
      <TopBar />
    </UiRoot>,
  );

describe('<TopBar>', () => {
  it('links Home, Projects and Author', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(within(nav).getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/author');
  });

  it('opens the Study menu with the four subjects', async () => {
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
