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
    expect(screen.getByText('codingspace.io/posts/am-gm')).toBeInTheDocument();
  });

  it('a life post has no subject, section, level or problems', () => {
    render(<Harness kind="life" />);
    expect(screen.queryByRole('combobox', { name: 'Subject' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Section' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Practice problems' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });
});
