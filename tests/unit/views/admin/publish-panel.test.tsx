import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { publishChecklist } from '@/lib/post-rules';
import { PublishPanel, type PublishState } from '@/views/admin/publish-panel';

const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };
const ready = publishChecklist({
  kind: 'lesson',
  title: 'AM–GM',
  summary: 'Means',
  section_id: 's1',
  content_json: body,
}).items;
const notReady = publishChecklist({
  kind: 'lesson',
  title: 'AM–GM',
  summary: '',
  section_id: null,
  content_json: { type: 'doc', content: [] },
}).items;

function setup(state: Partial<PublishState>, items = ready) {
  const handlers = { onPublish: vi.fn(), onUnpublish: vi.fn(), onSchedule: vi.fn(), onUnschedule: vi.fn() };
  render(
    <PublishPanel
      state={{ status: 'draft', slug: 'am-gm', scheduled_at: null, changes: false, ...state }}
      items={items}
      busy={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe('PublishPanel (ADM-07, ADM-09)', () => {
  it('shows the checklist, and blocks publishing until the required items are done', async () => {
    const { onPublish } = setup({}, notReady);
    const list = screen.getByRole('list');
    expect(within(list).getByText('Body').closest('li')).toHaveTextContent('Body: required');
    expect(within(list).getByText('Summary').closest('li')).toHaveTextContent('Recommended');
    expect(screen.getByText('Add the body, section to publish.')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publish now' });
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
  });

  it('a ready draft can be published now', async () => {
    const { onPublish } = setup({});
    await userEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(onPublish).toHaveBeenCalled();
  });

  it('schedules only a time at least a minute ahead', async () => {
    const user = userEvent.setup();
    const { onSchedule } = setup({});
    const input = screen.getByLabelText('Or publish later');
    const soon = new Date(Date.now() + 10_000);
    const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await user.type(input, local(soon));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least a minute from now');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onSchedule).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, local(new Date(Date.now() + 3 * 3600_000)));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date));
  });

  it('a scheduled post shows when, and can be cancelled or published now', async () => {
    const { onUnschedule } = setup({ status: 'scheduled', scheduled_at: '2026-10-20T02:00:00Z' });
    expect(screen.getByText('Tue 20 Oct, 09:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel the schedule' }));
    expect(onUnschedule).toHaveBeenCalled();
  });

  it('a published post: Update only with changes; Unpublish after confirming', async () => {
    const { onPublish, onUnpublish } = setup({ status: 'published', changes: false });
    expect(screen.getByRole('link', { name: '/posts/am-gm' })).toHaveAttribute('href', '/posts/am-gm');
    expect(screen.getByText(/Up to date/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish…' }));
    const confirm = screen.getByRole('group', { name: 'Confirm unpublish' });
    expect(confirm).toHaveTextContent('page not found');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Unpublish' }));
    expect(onUnpublish).toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('a published post with changes can be updated', async () => {
    const { onPublish } = setup({ status: 'published', changes: true });
    expect(screen.getByText(/not live yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onPublish).toHaveBeenCalled();
  });
});
