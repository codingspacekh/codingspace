import { render, screen } from '@testing-library/react';
import { ProjectCard } from '@/views/cards';

describe('<ProjectCard>', () => {
  it('opens the project site in a new tab, safely, and says so', () => {
    render(
      <ProjectCard
        project={{
          slug: 'runner',
          name: 'Pseudocode Runner',
          glyph: '▶',
          subject: 'coding',
          tag: 'Tool',
          description: 'Run 9618 pseudocode.',
          platforms: ['Web'],
          landingUrl: 'https://example.com/runner',
          featured: true,
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /pseudocode runner.*opens in a new tab/i });
    expect(link).toHaveAttribute('href', 'https://example.com/runner');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
