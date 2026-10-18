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
const SERIES: Record<string, string> = {
  'series.create': 'Added the series',
  'series.update': 'Edited the series',
  'series.delete': 'Deleted the series',
};
const SUBJECT: Record<string, string> = {
  'subject.create': 'Added the subject',
  'subject.update': 'Edited the subject',
  'subject.delete': 'Deleted the subject',
};
const SYLLABUS: Record<string, string> = {
  'syllabus.create': 'Added the syllabus',
  'syllabus.update': 'Edited the syllabus',
  'syllabus.points': 'Edited the points of',
  'syllabus.delete': 'Deleted the syllabus',
};
const QUESTION: Record<string, string> = {
  'question.publish': 'Published a question from',
  'question.answer': 'Answered or edited a question from',
  'question.hide': 'Hid a question from',
  'question.delete': 'Deleted a question from',
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
  'author.update': 'Edited the Author page',
  'auth.sign_in': 'Signed in',
  'auth.sign_out_everywhere': 'Signed out everywhere',
  'content.export': 'Downloaded an export of all content',
};

/** `subjectName` gives a subject's current name (the admin's subject list). */
export function describeEvent(
  e: ActivityEvent,
  subjectName: (id: string) => string | undefined = () => undefined,
): { text: string; href: string | null } {
  const m = e.meta ?? {};
  const subject = (id: unknown) => {
    const name = typeof id === 'string' ? subjectName(id) : undefined;
    return name ? `${name} ` : '';
  };
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

  if (a in SUBJECT) return { text: `${SUBJECT[a]} ${q}`, href: '/admin/subjects' };
  if (a === 'subject.reorder') return { text: 'Reordered the subjects', href: '/admin/subjects' };

  if (a in SYLLABUS) return { text: `${SYLLABUS[a]} ${q}`, href: '/admin/syllabus' };
  if (a === 'syllabus.reorder') return { text: 'Reordered the syllabuses', href: '/admin/syllabus' };
  if (a === 'post.syllabus')
    return { text: `Changed the syllabus points of ${q}`, href: `/admin/posts/${e.entity_id}` };

  if (a in QUESTION) {
    // Entries before comments on life posts have no kind: they were all questions.
    const text = m.kind === 'life' ? QUESTION[a]!.replace('question', 'comment') : QUESTION[a];
    return { text: `${text} ${str(m.name) ?? 'a student'}`, href: '/admin/questions' };
  }

  if (a in SERIES) return { text: `${SERIES[a]} ${q}`, href: '/admin/series' };
  if (a === 'series.reorder') return { text: 'Reordered the series', href: '/admin/series' };

  if (a in PROBLEM)
    return { text: `${PROBLEM[a]} a ${subject(m.subject)}problem of the week`, href: '/admin/problems' };

  if (a in FIXED) {
    const href = /^(auth|content)\./.test(a) ? null : a.startsWith('project.') ? '/admin/projects' : '/admin/author';
    return { text: FIXED[a]!, href };
  }
  return { text: `${a} ${q}`, href: null };
}
