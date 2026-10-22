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
  comingSoon: false,
};

describe('<ProjectCard>', () => {
  it('opens the project’s own page on this site (v1.1), in the subject’s colour', () => {
    render(<ProjectCard project={project} />);
    const link = screen.getByRole('link', { name: /Pseudocode Runner/ });
    expect(link).toHaveAttribute('href', '/projects/runner');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveClass('c-amber');
    expect(link).toHaveTextContent('Details and download');
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('says “Coming soon” when the owner says so', () => {
    render(<ProjectCard project={{ ...project, available: false, comingSoon: true }} />);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('See the project');
  });

  it('nothing to download is not “Coming soon” by itself (a website, say)', () => {
    render(<ProjectCard project={{ ...project, available: false }} />);
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.getByRole('link')).toHaveTextContent('See the project');
  });
});
