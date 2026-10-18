import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('next/router', () => ({ useRouter: () => ({ events: { on() {}, off() {} }, pathname: '/saved' }) }));
import SavedPage from '@/pages/saved';
import { UiRoot } from '@/ui';
import { savePost } from '@/ui/saved-store';

const renderPage = () =>
  render(
    <UiRoot motion={false}>
      <SavedPage />
    </UiRoot>,
  );

describe('/saved', () => {
  it('says how to save when nothing is saved', () => {
    renderPage();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('lists saved posts newest first and removes one', async () => {
    savePost({ slug: 'am-gm', title: 'The AM–GM inequality', subject: 'math', lang: 'en' }, new Date('2026-10-17'));
    savePost({ slug: 'study-tips-km', title: 'គន្លឹះសិក្សា', subject: null, lang: 'km' }, new Date('2026-10-18'));
    renderPage();
    const list = screen.getByRole('list', { name: 'Your saved lessons' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/posts/study-tips-km', '/posts/am-gm']);
    expect(links[0]).toHaveAttribute('lang', 'km');
    expect(within(list).getByText('Life')).toBeInTheDocument();
    expect(within(list).getByText('Saved 18 Oct 2026')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove The AM–GM inequality' }));
    expect(within(list).getAllByRole('link')).toHaveLength(1);
  });
});
