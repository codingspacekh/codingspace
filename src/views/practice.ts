import { useEffect } from 'react';
import { isAccepted } from '@/lib/practice';

/**
 * Practice questions in a lesson (v1.1; rendered by the server, src/server/render renderPractice):
 * Check marks the answer here in the browser, nothing is sent. One listener for the article.
 */

function say(section: Element, text: string, right: boolean | null) {
  const out = section.querySelector('.practice-result');
  if (out) out.textContent = text;
  section.classList.toggle('is-right', right === true);
  section.classList.toggle('is-wrong', right === false);
}

/** Right, wrong, or null when nothing was answered yet. */
function mark(section: Element): boolean | null {
  if (section.getAttribute('data-kind') === 'text') {
    const input = section.querySelector<HTMLInputElement>('.practice-input');
    if (!input || !input.value.trim()) return null;
    let accepted: unknown;
    try {
      accepted = JSON.parse(input.getAttribute('data-accept') ?? '[]');
    } catch {
      accepted = [];
    }
    return isAccepted(input.value, Array.isArray(accepted) ? accepted.filter((a) => typeof a === 'string') : []);
  }
  const inputs = Array.from(section.querySelectorAll<HTMLInputElement>('.practice-options input'));
  if (!inputs.some((i) => i.checked)) return null;
  return inputs.every((i) => i.checked === i.hasAttribute('data-correct'));
}

export function check(section: Element) {
  const right = mark(section);
  if (right === null) {
    say(
      section,
      section.getAttribute('data-kind') === 'text' ? 'Type an answer first.' : 'Choose an answer first.',
      null,
    );
    return;
  }
  const tries = Number(section.getAttribute('data-tries') ?? '0') + 1;
  section.setAttribute('data-tries', String(tries));
  if (right) {
    say(section, '✓ Correct!', true);
    // The explanation is the reward: open it.
    const solution = section.querySelector<HTMLDetailsElement>('.practice-solution');
    if (solution) solution.open = true;
  } else {
    say(
      section,
      tries >= 2
        ? '✗ Not quite. Open “Show answer” to see how it works.'
        : `✗ Not quite. Try again${section.querySelector('.practice-hint') ? ', or open the hint' : ''}.`,
      false,
    );
  }
}

export function usePractice(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const section = target.closest('.practice');
      if (!section) return;
      if (target.closest('.practice-check')) check(section);
      const self = target.closest('[data-self]')?.getAttribute('data-self');
      if (self === 'yes') say(section, '✓ Great, well done.', true);
      if (self === 'no') say(section, 'That’s fine: read the answer once more, then try it again tomorrow.', false);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== 'Enter' || !target.classList.contains('practice-input')) return;
      e.preventDefault();
      const section = target.closest('.practice');
      if (section) check(section);
    };
    // A new choice clears the last verdict.
    const onChange = (e: Event) => {
      const section = (e.target as HTMLElement).closest('.practice');
      if (section && section.getAttribute('data-kind') !== 'reveal') say(section, '', null);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.addEventListener('input', onChange);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('input', onChange);
    };
  }, [root]);
}
