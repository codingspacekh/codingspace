import { screen } from '@testing-library/react';
import { ProjectCard } from '@/views/cards';
import { render } from '../../support/subjects';

const project = {
  slug: 'runner',
  name: 'Pseudocode Runner',
  glyph: '▶',
  subject: 'coding',
  tag: 'Tool',
  description: 'Run 9618 pseudocode.',
  platforms: ['Web'],
  landingUrl: 'https://example.com/runner',
  featured: true,
  available: true,
};

describe('<ProjectCard>', () => {
  it('opens the project’s own page on this site (v1.1), in the subject’s colour', () => {
    render(<ProjectCard project={project} />);
    const link = screen.getByRole('link', { name: /Pseudocode Runner/ });
    expect(link).toHaveAttribute('href', '/projects/runner');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveClass('c-amber');
    expect(link).toHaveTextContent('Details and download →');
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('says “Coming soon” until there is something to download', () => {
    render(<ProjectCard project={{ ...project, available: false }} />);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('See the project →');
  });
});
