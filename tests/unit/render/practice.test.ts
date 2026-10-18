import { renderContent } from '@/server/render';
import { isAccepted, normalizeAnswer, practiceProblem } from '@/lib/practice';
import { findUnsafe } from './assert-safe';

const assertSafeHtml = (html: string) => expect(findUnsafe(html)).toEqual([]);

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const practice = (attrs: Record<string, unknown>) => ({ type: 'practice', attrs });
const render = async (attrs: Record<string, unknown>) => renderContent(doc(practice(attrs)));

describe('practice questions (v1.1)', () => {
  it('multiple choice: radios, the correct one marked for the browser, the answer behind "Show answer"', async () => {
    const out = await render({
      kind: 'choice',
      prompt: 'What is $2^{10}$?',
      options: [
        { text: '1000', correct: false },
        { text: '**1024**', correct: true },
        { text: '', correct: false },
      ],
      hint: 'Double 512.',
      explanation: 'Ten doublings of 1.',
    });
    expect(out.hasMath).toBe(true);
    expect(out.html).toContain(
      '<section class="practice practice--choice" data-kind="choice" aria-labelledby="pq-1-q">',
    );
    expect(out.html).toContain('<legend class="sr-only">Choose one answer</legend>');
    expect(out.html).toContain('<input type="radio" name="pq-1" value="0"> <span>1000</span>');
    expect(out.html).toContain(
      '<input type="radio" name="pq-1" value="1" data-correct=""> <span><strong>1024</strong></span>',
    );
    expect(out.html).not.toContain('value="2"'); // the empty option is dropped
    expect(out.html).toContain('<button type="button" class="btn practice-check">Check</button>');
    expect(out.html).toContain('<details class="practice-hint"><summary>Hint</summary><p>Double 512.</p></details>');
    expect(out.html).toContain(
      '<summary>Show answer</summary><p><strong>Answer:</strong> <strong>1024</strong></p><p>Ten doublings of 1.</p>',
    );
    expect(out.searchText).toContain('What is');
    assertSafeHtml(out.html);
  });

  it('several correct options become "choose all that apply" checkboxes', async () => {
    const { html } = await render({
      kind: 'choice',
      prompt: 'Which are prime?',
      options: [
        { text: '2', correct: true },
        { text: '4', correct: false },
        { text: '7', correct: true },
      ],
    });
    expect(html).toContain('Choose all that apply');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain('<strong>Answer:</strong> 2; 7');
  });

  it('a short answer keeps the accepted answers in an escaped attribute', async () => {
    const { html } = await render({
      kind: 'text',
      prompt: 'Name the sort that swaps neighbours.',
      answers: ['bubble sort', 'bubble', '"><script>alert(1)</script>'],
    });
    expect(html).toContain('<label for="pq-1-a">Your answer</label>');
    expect(html).toContain(
      'data-accept="[&quot;bubble sort&quot;,&quot;bubble&quot;,&quot;\\&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;]"',
    );
    expect(html).toContain('<strong>Answer:</strong> bubble sort');
    assertSafeHtml(html);
  });

  it('reveal: the answer to open, then "I got it" / "Not yet"', async () => {
    const { html } = await render({ kind: 'reveal', prompt: 'Prove it.', explanation: 'By induction on $n$.' });
    expect(html).toContain('<summary>Show the answer</summary>');
    expect(html).toContain('data-self="yes">I got it</button>');
    expect(html).not.toContain('practice-check');
  });

  it('drops a question that cannot work, and numbers the rest', async () => {
    for (const attrs of [
      {
        kind: 'choice',
        prompt: 'Q',
        options: [
          { text: 'a', correct: false },
          { text: 'b', correct: false },
        ],
      },
      { kind: 'choice', prompt: 'Q', options: [{ text: 'a', correct: true }] },
      { kind: 'text', prompt: 'Q', answers: ['  '] },
      { kind: 'reveal', prompt: 'Q' },
      { kind: 'text', prompt: '', answers: ['a'] },
    ]) {
      expect((await render(attrs)).html).toBe('');
    }
    const two = await renderContent(
      doc(
        practice({ kind: 'reveal', prompt: 'A', explanation: 'a' }),
        practice({ kind: 'reveal', prompt: 'B', explanation: 'b' }),
      ),
    );
    expect(two.html).toContain('id="pq-2-q"');
  });

  it('Markdown in a question goes through the same safe renderer', async () => {
    const { html } = await render({
      kind: 'reveal',
      prompt: '<img src=x onerror=alert(1)> [x](javascript:alert(1))',
      explanation: 'ok',
    });
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    assertSafeHtml(html);
  });
});

describe('practice answers', () => {
  it('compares answers without case, extra spaces or a final full stop', () => {
    expect(normalizeAnswer('  Bubble   SORT. ')).toBe('bubble sort');
    expect(isAccepted('bubble sort.', ['Bubble sort'])).toBe(true);
    expect(isAccepted('  ', ['x'])).toBe(false);
    expect(isAccepted('merge', ['bubble sort'])).toBe(false);
    expect(isAccepted('ｘ', ['x'])).toBe(true); // full-width letters (NFKC)
  });

  it('says what a question still needs', () => {
    expect(practiceProblem({ kind: 'choice', prompt: '' })).toBe('Write the question.');
    expect(practiceProblem({ kind: 'choice', prompt: 'Q', options: [{ text: 'a', correct: true }] })).toBe(
      'Give at least two options.',
    );
    expect(
      practiceProblem({
        kind: 'choice',
        prompt: 'Q',
        options: [
          { text: 'a', correct: false },
          { text: 'b', correct: false },
        ],
      }),
    ).toBe('Tick the correct option.');
    expect(practiceProblem({ kind: 'text', prompt: 'Q', answers: [' '] })).toBe('Add at least one accepted answer.');
    expect(practiceProblem({ kind: 'reveal', prompt: 'Q' })).toBe('Write the answer to show.');
    expect(practiceProblem({ kind: 'reveal', prompt: 'Q', explanation: 'A' })).toBeNull();
  });
});
