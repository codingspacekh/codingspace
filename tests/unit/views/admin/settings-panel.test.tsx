import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SettingsPanel, type Settings } from '@/views/admin/settings-panel';

const sections = [
  { id: 's-ineq', subject_id: 'math', title: 'Inequalities', sort: 1 },
  { id: 's-seq', subject_id: 'math', title: 'Sequences', sort: 0 },
  { id: 's-mech', subject_id: 'physics', title: 'Mechanics', sort: 0 },
];
const start: Settings = {
  subject_id: 'math',
  section_id: 's-ineq',
  level: 1,
  minutes: 5,
  problem_count: 0,
  lang: 'en',
  summary: '',
};

function Harness({ kind = 'lesson' as 'lesson' | 'life', onChange = vi.fn() }) {
  const [value, setValue] = useState(start);
  return (
    <SettingsPanel
      kind={kind}
      value={value}
      sections={sections}
      slug="am-gm"
      urlLocked={false}
      onChange={(p) => {
        onChange(p);
        setValue((v) => ({ ...v, ...p }));
      }}
    />
  );
}

const options = (name: string) =>
  [...(screen.getByRole('combobox', { name }) as HTMLSelectElement).options].map((o) => o.textContent);

describe('SettingsPanel (ADM-05)', () => {
  it('lists only the chosen subject’s sections, in order', () => {
    render(<Harness />);
    expect(options('Section')).toEqual(['Choose a section…', 'Sequences', 'Inequalities']);
  });

  it('changing the subject clears a section from the old subject', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Subject' }), 'physics');
    expect(onChange).toHaveBeenLastCalledWith({ subject_id: 'physics', section_id: null });
    expect(options('Section')).toEqual(['Choose a section…', 'Mechanics']);
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('');
  });

  it('says when a subject has no sections yet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Subject' }), 'it');
    expect(screen.getByText('This subject has no sections yet.')).toBeInTheDocument();
  });

  it('keeps numbers in range, counts summary characters, and shows the address', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const problems = screen.getByRole('spinbutton', { name: 'Practice problems' });
    await user.clear(problems);
    await user.type(problems, '9999');
    expect(onChange).toHaveBeenLastCalledWith({ problem_count: 500 });
    await user.type(screen.getByRole('textbox', { name: 'Summary' }), 'Means');
    expect(screen.getByText(/^5\/500 characters/)).toBeInTheDocument();
    expect(screen.getByText('codingspacekh.dev/posts/am-gm')).toBeInTheDocument();
  });

  it('a life post has no subject, section, level or problems', () => {
    render(<Harness kind="life" />);
    expect(screen.queryByRole('combobox', { name: 'Subject' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Section' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Practice problems' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });
});

describe('SettingsPanel: new section', () => {
  function WithCreate({ create }: { create: (t: string) => Promise<string | null> }) {
    const [value, setValue] = useState(start);
    return (
      <SettingsPanel
        kind="lesson"
        value={value}
        sections={sections}
        slug="am-gm"
        urlLocked={false}
        onChange={(p) => setValue((v) => ({ ...v, ...p }))}
        onCreateSection={create}
      />
    );
  }

  it('adds a section by title (Enter or the button), and can be cancelled', async () => {
    const create = vi.fn(async () => null);
    const user = userEvent.setup();
    render(<WithCreate create={create} />);
    await user.click(screen.getByRole('button', { name: 'New section…' }));
    const group = screen.getByRole('group', { name: 'New section' });
    expect(group).toHaveTextContent('Added at the end of Math');
    expect(screen.getByRole('button', { name: 'Add section' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'New section title' }), 'Functional equations{Enter}');
    expect(create).toHaveBeenCalledWith('Functional equations');
    expect(screen.queryByRole('group', { name: 'New section' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New section…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'New section' })).toBeNull();
  });

  it('shows why a section could not be added, and keeps the title', async () => {
    const user = userEvent.setup();
    render(<WithCreate create={async () => 'could not find a free address for this section'} />);
    await user.click(screen.getByRole('button', { name: 'New section…' }));
    await user.type(screen.getByRole('textbox', { name: 'New section title' }), 'X');
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('free address');
    expect(screen.getByRole('textbox', { name: 'New section title' })).toHaveValue('X');
  });
});
