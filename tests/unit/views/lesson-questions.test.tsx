import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonQuestions } from '@/views/lesson-questions';
import { render } from '../../support/subjects';

const QUESTIONS = [
  {
    id: 'q1',
    name: 'Dara',
    bodyHtml: '<p>Why is it true?</p>',
    answerHtml: '<p>Because squares are never negative.</p>',
    publishedAt: '2026-10-18T03:00:00Z',
    hasMath: false,
  },
  {
    id: 'q2',
    name: 'Sok',
    bodyHtml: '<p>Is there a hint?</p>',
    answerHtml: '',
    publishedAt: '2026-10-18T04:00:00Z',
    hasMath: false,
  },
];

function mockFetch(result: string, status = 200) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ result }), { status });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('<LessonQuestions> (v1.1)', () => {
  it('lists approved questions with the teacher’s answers', () => {
    render(<LessonQuestions slug="am-gm" questions={QUESTIONS} />);
    const section = screen.getByRole('region', { name: 'Questions' });
    const [first, second] = within(section).getAllByRole('listitem');
    expect(first).toHaveTextContent('Dara · 18 Oct 2026');
    expect(within(first!).getByText('Teacher')).toBeInTheDocument();
    expect(first).toHaveTextContent('Because squares are never negative.');
    expect(within(second!).queryByText('Teacher')).toBeNull();
  });

  it('asks a question: a plain form that works without JavaScript, sent as JSON with it', async () => {
    const calls = mockFetch('ok');
    const user = userEvent.setup();
    render(<LessonQuestions slug="am-gm" questions={[]} />);
    expect(screen.getByText('No questions yet. Ask the first one.')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Ask a question' });
    expect(form).toHaveAttribute('action', '/api/questions');
    expect(form).toHaveAttribute('method', 'post');

    await user.click(within(form).getByRole('button', { name: 'Send question' }));
    // The browser's own "required" check stops an empty form; the script says so too.
    await user.type(within(form).getByRole('textbox', { name: 'Your name' }), 'Dara');
    await user.type(within(form).getByRole('textbox', { name: 'Your question' }), 'Why $x^2 \\ge 0$?');
    await user.click(within(form).getByRole('button', { name: 'Send question' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/questions',
        body: { post: 'am-gm', name: 'Dara', question: 'Why $x^2 \\ge 0$?', website: '' },
      }),
    );
    expect(await within(form).findByRole('status')).toHaveTextContent(
      'Thank you! Your question will appear here once the teacher has read it.',
    );
    expect(within(form).getByRole('textbox', { name: 'Your question' })).toHaveValue('');
    expect(within(form).getByRole('textbox', { name: 'Your name' })).toHaveValue('Dara');
  });

  it('says when a visitor has asked too much', async () => {
    mockFetch('limited', 429);
    const user = userEvent.setup();
    render(<LessonQuestions slug="am-gm" questions={[]} />);
    const form = screen.getByRole('form', { name: 'Ask a question' });
    await user.type(within(form).getByRole('textbox', { name: 'Your name' }), 'D');
    await user.type(within(form).getByRole('textbox', { name: 'Your question' }), 'Q');
    await user.click(within(form).getByRole('button', { name: 'Send question' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('Please try again later.');
  });

  it('is a comment section on a life post: same form and rules, other words', async () => {
    const calls = mockFetch('ok');
    const user = userEvent.setup();
    const { rerender } = render(<LessonQuestions slug="my-week" kind="life" questions={[]} />);
    expect(screen.getByText('No comments yet. Be the first.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Comments' })).toHaveAttribute('id', 'comments');
    const form = screen.getByRole('form', { name: 'Leave a comment' });
    expect(form).toHaveAttribute('action', '/api/questions');
    expect(form.querySelector('input[name="kind"]')).toHaveValue('life');
    await user.type(within(form).getByRole('textbox', { name: 'Your name' }), 'Dara');
    await user.type(within(form).getByRole('textbox', { name: 'Your comment' }), 'Nice post!');
    await user.click(within(form).getByRole('button', { name: 'Send comment' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/questions',
        body: { post: 'my-week', name: 'Dara', question: 'Nice post!', website: '' },
      }),
    );
    expect(await within(form).findByRole('status')).toHaveTextContent(
      'Thank you! Your comment will appear here once the teacher has read it.',
    );

    rerender(<LessonQuestions slug="my-week" kind="life" questions={QUESTIONS} />);
    const [first] = within(screen.getByRole('region', { name: 'Comments' })).getAllByRole('listitem');
    expect(within(first!).getByText('Teacher')).toBeInTheDocument();
  });

  it('shows older ones 20 at a time: a plain link without JavaScript, loaded in place with it', async () => {
    const older = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...QUESTIONS[1]!,
        id: `o${from + i}`,
        name: `Older ${from + i}`,
        publishedAt: `2026-10-0${from + i < 10 ? 2 : 1}T00:00:00.12345${i % 10}+00:00`,
      }));
    const urls: string[] = [];
    const pages = [
      { questions: older(2, 1), more: 1 },
      { questions: older(1, 3), more: 0 },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(pages.shift()), { status: 200 });
      }),
    );
    const user = userEvent.setup();
    render(<LessonQuestions slug="my-week" kind="life" questions={QUESTIONS} more={3} />);
    const section = screen.getByRole('region', { name: 'Comments' });
    const link = within(section).getByRole('link', { name: 'Show older comments (3 more)' });
    expect(link).toHaveAttribute('href', '/posts/my-week/older?before=2026-10-18T04%3A00%3A00Z');

    await user.click(link);
    expect(await within(section).findByText(/Older 1/)).toBeInTheDocument();
    expect(urls[0]).toBe('/api/questions?post=my-week&before=2026-10-18T04%3A00%3A00Z');
    expect(within(section).getAllByRole('listitem')).toHaveLength(4);
    // Focus moves to the first newly shown comment.
    expect(document.activeElement).toHaveTextContent('Older 1');
    const next = within(section).getByRole('link', { name: 'Show older comments (1 more)' });
    expect(urls).toHaveLength(1);

    await user.click(next);
    expect(await within(section).findByText(/Older 3/)).toBeInTheDocument();
    expect(urls[1]).toBe(`/api/questions?post=my-week&before=${encodeURIComponent(older(2, 1)[1]!.publishedAt)}`);
    expect(within(section).queryByRole('link', { name: /Show older/ })).toBeNull();
    expect(within(section).getAllByRole('listitem')).toHaveLength(5);
  });

  it('says so when the older ones can’t be loaded, and shows no link when there are none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const user = userEvent.setup();
    const { unmount } = render(<LessonQuestions slug="am-gm" questions={QUESTIONS} more={5} />);
    await user.click(screen.getByRole('link', { name: 'Show older questions (5 more)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The older questions could not be loaded.');
    expect(screen.getByRole('link', { name: 'Show older questions (5 more)' })).toBeInTheDocument();
    unmount();
    render(<LessonQuestions slug="am-gm" questions={QUESTIONS} />);
    expect(screen.queryByRole('link', { name: /Show older/ })).toBeNull();
  });

  it('keeps the honeypot away from people and assistive technology', () => {
    render(<LessonQuestions slug="am-gm" questions={[]} />);
    const trap = document.querySelector('input[name="website"]')!;
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Leave this empty' })).toBeNull();
  });
});
