import { render, screen } from '@testing-library/react';
import { Frame, UiRoot } from '@/ui';

// Behaviour, not animation: tests run with motion disabled (03 §10.2).
describe('<Frame>', () => {
  it('renders its content as normal, accessible markup', () => {
    render(
      <UiRoot motion={false}>
        <Frame>
          <h2>Problem of the week</h2>
          <p>Prove it.</p>
        </Frame>
      </UiRoot>,
    );
    expect(screen.getByRole('heading', { name: 'Problem of the week' })).toBeVisible();
    expect(screen.getByText('Prove it.')).toBeVisible();
  });

  it('draws the Arwes frame as decorative SVG hidden from screen readers', () => {
    const { container } = render(
      <UiRoot motion={false}>
        <Frame>content</Frame>
      </UiRoot>,
    );
    const svg = container.querySelector('svg.arwes-frames-frame');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('<UiRoot>', () => {
  it('marks the document with the motion setting', () => {
    render(<UiRoot motion={false}>x</UiRoot>);
    expect(document.documentElement.dataset.motion).toBe('off');
  });
});
