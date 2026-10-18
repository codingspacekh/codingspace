import { describeEvent, type ActivityEvent } from '@/lib/activity';
import { subjectName } from '../../support/subjects';

const event = (action: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: 1,
  action,
  entity: action.split('.')[0]!,
  entity_id: 'id-1',
  meta: {},
  at: '2026-10-17T09:00:00Z',
  name: null,
  ...extra,
});

// 03 ADM-15: the audit log in plain words, linking to what still exists.
describe('describeEvent', () => {
  it('names the post and links to its editor', () => {
    expect(describeEvent(event('post.publish', { name: 'AM–GM' }))).toEqual({
      text: 'Published “AM–GM”',
      href: '/admin/posts/id-1',
    });
    expect(describeEvent(event('post.update', { name: 'AM–GM' })).text).toBe('Updated the live “AM–GM”');
    expect(describeEvent(event('post.create', { meta: { slug: 'lesson-1' } })).text).toBe('Created “lesson-1”');
  });

  it('falls back to the title kept in the event when the post is gone, without a link', () => {
    expect(
      describeEvent(event('post.delete', { meta: { slug: 'am-gm', title: 'AM–GM', was_published: true } })),
    ).toEqual({ text: 'Deleted “AM–GM” (it was live)', href: null });
    expect(describeEvent(event('post.delete', { meta: { slug: 'am-gm', title: '' } })).text).toBe('Deleted “am-gm”');
  });

  it('describes series changes and links to the series admin (v1.1)', () => {
    expect(describeEvent(event('series.create', { name: 'Maths for Physics' }))).toEqual({
      text: 'Added the series “Maths for Physics”',
      href: '/admin/series',
    });
    expect(describeEvent(event('series.delete', { meta: { title: 'Paper 1' } })).text).toBe(
      'Deleted the series “Paper 1”',
    );
    expect(describeEvent(event('series.reorder', { entity_id: '' }))).toEqual({
      text: 'Reordered the series',
      href: '/admin/series',
    });
  });

  it('names subjects and links to the Subjects page (v1.1)', () => {
    expect(describeEvent(event('subject.create', { entity_id: 'chemistry', name: 'Chemistry' }))).toEqual({
      text: 'Added the subject “Chemistry”',
      href: '/admin/subjects',
    });
    expect(describeEvent(event('subject.delete', { entity_id: 'chemistry', meta: { name: 'Chemistry' } })).text).toBe(
      'Deleted the subject “Chemistry”',
    );
    expect(describeEvent(event('subject.reorder', { entity_id: '' })).text).toBe('Reordered the subjects');
  });

  it('shows when a post was scheduled for', () => {
    expect(describeEvent(event('post.schedule', { name: 'Vectors', meta: { at: '2026-10-20T01:00:00Z' } })).text).toBe(
      'Scheduled “Vectors” for 20 Oct 2026',
    );
  });

  it('describes sections, media, projects, problems and the Author page', () => {
    expect(describeEvent(event('section.create', { name: 'Inequalities' }))).toEqual({
      text: 'Created the section “Inequalities”',
      href: '/admin/sections',
    });
    expect(describeEvent(event('section.reorder', { entity: 'subject', entity_id: 'math' }), subjectName).text).toBe(
      'Reordered the Math sections',
    );
    // Without the subject list (or for a deleted subject), no name.
    expect(describeEvent(event('section.reorder', { entity: 'subject', entity_id: 'math' })).text).toBe(
      'Reordered the sections',
    );
    expect(describeEvent(event('media.delete', { meta: { name: 'tri.png' } })).text).toBe('Deleted the file “tri.png”');
    expect(describeEvent(event('project.feature', { name: 'Orbit' })).text).toBe('Featured the project “Orbit”');
    expect(describeEvent(event('project.feature', { entity_id: '' })).text).toBe('Featured no project');
    expect(describeEvent(event('problem.show', { meta: { subject: 'physics' } }), subjectName)).toEqual({
      text: 'Showed a Physics problem of the week',
      href: '/admin/problems',
    });
    expect(describeEvent(event('timeline.update')).text).toBe('Edited the Author timeline');
    expect(describeEvent(event('author.update', { entity: 'profile' }))).toEqual({
      text: 'Edited the Author page',
      href: '/admin/author',
    });
    expect(describeEvent(event('auth.sign_in', { entity: 'session' }))).toEqual({ text: 'Signed in', href: null });
    expect(describeEvent(event('content.export'))).toEqual({ text: 'Downloaded an export of all content', href: null });
  });

  it('shows an unknown action as it is rather than hiding it', () => {
    expect(describeEvent(event('post.archive', { name: 'X' }))).toEqual({ text: 'post.archive “X”', href: null });
  });
});
