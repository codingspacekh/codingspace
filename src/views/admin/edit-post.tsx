import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { Doc } from '@/editor/post-editor';
import { PostEditor } from '@/editor/post-editor';
import type { EditablePost } from '@/server/admin/posts';
import { StatusBadge } from './posts-browser';
import { SettingsPanel, type Section, type Settings } from './settings-panel';

type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

const SAVE_TEXT: Record<SaveState, string> = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  conflict:
    'This post was changed in another tab or window. Reload to get the latest version; your edits here will not be saved.',
  error: 'Not saved. Check your connection and press Save again.',
};

/** The editor page (03 ADM-04, ADM-05). Saving is by button or Ctrl/⌘+S; autosave comes next. */
export function EditPost({ id }: { id: string }) {
  const [post, setPost] = useState<EditablePost | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState('');
  const doc = useRef<Doc | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    api<{ post?: EditablePost; sections?: Section[]; error?: string }>(`/api/admin/posts/${id}`).then(
      ({ status, data }) => {
        if (status !== 200 || !data.post)
          return setLoadError(
            status === 404
              ? 'This post does not exist (it may have been deleted).'
              : 'The post could not be loaded. Reload the page to try again.',
          );
        const p = data.post;
        setPost(p);
        setSections(data.sections ?? []);
        setTitle(p.title);
        setSettings({
          subject_id: p.subject_id,
          section_id: p.section_id,
          level: p.level,
          minutes: p.minutes,
          problem_count: p.problem_count,
          lang: p.lang,
          summary: p.summary,
        });
        revision.current = p.revision;
      },
    );
  }, [id]);

  const dirty = useCallback(() => setState((s) => (s === 'conflict' ? s : 'dirty')), []);

  const save = useCallback(async () => {
    if (!settings || state === 'conflict' || state === 'saving') return;
    setState('saving');
    const fields = { title, ...settings, ...(doc.current ? { content_json: doc.current } : {}) };
    const { status, data } = await api<{ revision?: number; slug?: string; error?: string }>(`/api/admin/posts/${id}`, {
      method: 'PUT',
      body: { revision: revision.current, fields },
    }).catch(() => ({ status: 0, data: {} as { revision?: number; slug?: string; error?: string } }));
    if (status === 200 && data.revision) {
      revision.current = data.revision;
      setPost((p) => (p ? { ...p, slug: data.slug ?? p.slug, has_unpublished_changes: p.status === 'published' } : p));
      // Edits made while the request was in flight stay unsaved.
      setState((s) => (s === 'saving' ? 'saved' : s));
    } else if (status === 409) {
      setState('conflict');
    } else {
      setState('error');
      if (status === 422 && data.error) setMessage(data.error);
    }
  }, [id, settings, state, title]);

  // Ctrl/⌘+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (state === 'dirty' || state === 'saving' || state === 'error') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [save, state]);

  if (loadError)
    return (
      <>
        <p role="alert" className="adm-error">
          {loadError}
        </p>
        <Link href="/admin/posts">← All posts</Link>
      </>
    );
  if (!post || !settings) return <p aria-live="polite">Loading the post…</p>;

  return (
    <div className="ed-page">
      <div className="ed-top">
        <Link href="/admin/posts">← All posts</Link>
        <StatusBadge post={post} />
        <p className={`ed-save ed-save--${state}`} role="status">
          {SAVE_TEXT[state]}
        </p>
        <button type="button" className="btn pri" onClick={save} disabled={state === 'saving' || state === 'conflict'}>
          Save
        </button>
      </div>
      {message && (
        <p role="alert" className="adm-error">
          {message}
        </p>
      )}
      <div className="ed-layout">
        <div className="ed-main">
          <label className="sr-only" htmlFor="post-title">
            Title
          </label>
          <input
            id="post-title"
            className="ed-title"
            placeholder={post.kind === 'lesson' ? 'Lesson title' : 'Post title'}
            value={title}
            maxLength={200}
            lang={settings.lang}
            onChange={(e) => {
              setTitle(e.target.value);
              dirty();
            }}
          />
          <PostEditor
            initial={post.content_json}
            lang={settings.lang}
            onChange={(d) => {
              doc.current = d;
              dirty();
            }}
            onMessage={setMessage}
          />
        </div>
        <SettingsPanel
          kind={post.kind}
          value={settings}
          sections={sections}
          slug={post.slug}
          urlLocked={post.published_at !== null}
          onChange={(patch) => {
            setSettings((s) => (s ? { ...s, ...patch } : s));
            dirty();
          }}
        />
      </div>
    </div>
  );
}
