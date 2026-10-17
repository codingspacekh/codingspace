import { isSubjectId, SUBJECTS } from '@/lib/subjects';

/**
 * The audit log in plain words (03 ADM-15). Events come from audit_events, written in the same
 * transaction as each change; `name` is the item's current title, or null when it is gone.
 */
export type ActivityEvent = {
  id: number;
  action: string;
  entity: string;
  entity_id: string;
  meta: Record<string, unknown>;
  at: string;
  name: string | null;
};

export type ActivityPage = { events: ActivityEvent[]; more: boolean };

/** Autosaves happen every few seconds while typing; listing them would bury everything else. */
export const HIDDEN_ACTIONS = ['post.save'];

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const day = (iso: unknown) =>
  typeof iso === 'string'
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
const subject = (id: unknown) => (typeof id === 'string' && isSubjectId(id) ? `${SUBJECTS[id].name} ` : '');

const POST: Record<string, string> = {
  'post.create': 'Created',
  'post.publish': 'Published',
  'post.update': 'Updated the live',
  'post.unpublish': 'Unpublished',
  'post.unschedule': 'Cancelled the schedule of',
  'post.restore': 'Restored an earlier version of',
};
const SECTION: Record<string, string> = {
  'section.create': 'Created the section',
  'section.update': 'Edited the section',
  'section.reorder_lessons': 'Reordered the lessons in',
};
const MEDIA: Record<string, string> = {
  'media.add': 'Uploaded',
  'media.update': 'Renamed or edited',
};
const PROJECT: Record<string, string> = {
  'project.create': 'Added the project',
  'project.update': 'Edited the project',
  'project.feature': 'Featured the project',
};
const PROBLEM: Record<string, string> = {
  'problem.create': 'Added',
  'problem.update': 'Edited',
  'problem.show': 'Showed',
  'problem.hide': 'Hid',
  'problem.delete': 'Deleted',
};
const FIXED: Record<string, string> = {
  'project.reorder': 'Reordered the projects',
  'profile.update': 'Edited the Author profile',
  'timeline.update': 'Edited the Author timeline',
  'auth.sign_in': 'Signed in',
  'auth.sign_out_everywhere': 'Signed out everywhere',
  'content.export': 'Downloaded an export of all content',
};

export function describeEvent(e: ActivityEvent): { text: string; href: string | null } {
  const m = e.meta ?? {};
  const name = e.name ?? str(m.title) ?? str(m.name) ?? str(m.slug) ?? e.entity_id;
  const q = `“${name}”`;
  const a = e.action;

  if (a in POST) return { text: `${POST[a]} ${q}`, href: `/admin/posts/${e.entity_id}` };
  if (a === 'post.schedule') return { text: `Scheduled ${q} for ${day(m.at)}`, href: `/admin/posts/${e.entity_id}` };
  if (a === 'post.delete') return { text: `Deleted ${q}${m.was_published ? ' (it was live)' : ''}`, href: null };

  if (a in SECTION) return { text: `${SECTION[a]} ${q}`, href: '/admin/sections' };
  if (a === 'section.delete') return { text: `Deleted the section ${q}`, href: '/admin/sections' };
  if (a === 'section.reorder')
    return { text: `Reordered the ${subject(e.entity_id)}sections`, href: '/admin/sections' };

  if (a in MEDIA) return { text: `${MEDIA[a]} the file ${q}`, href: '/admin/media' };
  if (a === 'media.delete') return { text: `Deleted the file ${q}`, href: '/admin/media' };

  if (a === 'project.feature' && !e.entity_id) return { text: 'Featured no project', href: '/admin/projects' };
  if (a in PROJECT) return { text: `${PROJECT[a]} ${q}`, href: '/admin/projects' };
  if (a === 'project.delete') return { text: `Deleted the project ${q}`, href: '/admin/projects' };

  if (a in PROBLEM)
    return { text: `${PROBLEM[a]} a ${subject(m.subject)}problem of the week`, href: '/admin/problems' };

  if (a in FIXED) {
    const href = /^(auth|content)\./.test(a) ? null : a.startsWith('project.') ? '/admin/projects' : '/admin/author';
    return { text: FIXED[a]!, href };
  }
  return { text: `${a} ${q}`, href: null };
}
