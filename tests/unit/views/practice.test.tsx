import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderContent } from '@/server/render';
import type { PostPageData } from '@/server/data/types';
import { UiRoot } from '@/ui';
import { PostView } from '@/views/post-view';
import { render } from '../../support/subjects';

// v1.1 practice questions on a lesson page: the renderer's HTML, checked in the browser.

async function renderLesson() {
  const doc = JSON.parse(readFileSync(join(__dirname, '../../fixtures/lessons/practice.json'), 'utf8'));
  const { html } = await renderContent(doc);
  const data: PostPageData = {
    post: {
      slug: 'powers',
      kind: 'lesson',
      title: 'Powers of two',
      summary: '',
      html,
      toc: [],
      subject: 'coding',
      level: 1,
      lang: 'en',
      minutes: 3,
      problemCount: 3,
      hasMath: true,
      publishedAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    },
    section: null,
    siblings: [],
    series: [],
  };
  render(
    <UiRoot motion={false}>
      <PostView {...data} />
    </UiRoot>,
  );
  // By class, not by role and name: jsdom can't compute names over KaTeX's output.
  const [choice, text, reveal] = Array.from(document.querySelectorAll<HTMLElement>('section.practice'));
  return { choice: choice!, text: text!, reveal: reveal! };
}

describe('practice questions on a lesson (v1.1)', () => {
  it('multiple choice: asks for a choice, says wrong, then right and opens the explanation', async () => {
    const user = userEvent.setup();
    const { choice } = await renderLesson();
    const result = within(choice).getByRole('status');
    await user.click(within(choice).getByRole('button', { name: 'Check' }));
    expect(result).toHaveTextContent('Choose an answer first.');

    await user.click(within(choice).getByRole('radio', { name: '1000' }));
    expect(result).toBeEmptyDOMElement(); // a new choice clears the verdict
    await user.click(within(choice).getByRole('button', { name: 'Check' }));
    expect(result).toHaveTextContent('✗ Not quite. Try again, or open the hint.');
    expect(choice).toHaveClass('is-wrong');
    await user.click(within(choice).getByRole('button', { name: 'Check' }));
    expect(result).toHaveTextContent('Open “Show answer” to see how it works.');

    const solution = choice.querySelector('details.practice-solution')!;
    expect(solution).not.toHaveAttribute('open');
    await user.click(within(choice).getByRole('radio', { name: '1024' }));
    await user.click(within(choice).getByRole('button', { name: 'Check' }));
    expect(result).toHaveTextContent('✓ Correct!');
    expect(choice).toHaveClass('is-right');
    expect(solution).toHaveAttribute('open');
  });

  it('short answer: forgiving about case and spaces; Enter checks too', async () => {
    const user = userEvent.setup();
    const { text } = await renderLesson();
    const input = within(text).getByRole('textbox', { name: 'Your answer' });
    await user.type(input, 'merge sort{Enter}');
    expect(within(text).getByRole('status')).toHaveTextContent('✗ Not quite. Try again.');
    await user.clear(input);
    await user.type(input, '  Bubble   SORT. ');
    await user.click(within(text).getByRole('button', { name: 'Check' }));
    expect(within(text).getByRole('status')).toHaveTextContent('✓ Correct!');
  });

  it('reveal: open the answer, then mark yourself', async () => {
    const user = userEvent.setup();
    const { reveal } = await renderLesson();
    expect(within(reveal).queryByRole('button', { name: 'Check' })).toBeNull();
    await user.click(within(reveal).getByText('Show the answer'));
    await user.click(within(reveal).getByRole('button', { name: 'Not yet' }));
    expect(within(reveal).getByRole('status')).toHaveTextContent('read the answer once more');
    await user.click(within(reveal).getByRole('button', { name: 'I got it' }));
    expect(within(reveal).getByRole('status')).toHaveTextContent('✓ Great, well done.');
  });
});
