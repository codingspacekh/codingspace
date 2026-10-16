import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { Doc } from '@/editor/post-editor';
import { PostEditor } from '@/editor/post-editor';
import type { EditablePost } from '@/server/admin/posts';
import { StatusBadge } from './posts-browser';
import { RevisionHistory } from './revision-history';
import { SettingsPanel, type Section, type Settings } from './settings-panel';

/** 03 ADM-06: save at most a second after the last edit. */
export const AUTOSAVE_MS = 1000;
const RETRY_MS = [2_000, 5_000, 10_000, 30_000];

type SaveState = 'saved' | 'dirty' | 'saving' | 'offline' | 'signed_out' | 'rejected' | 'conflict';

const SAVE_TEXT: Record<SaveState, string> = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Not saved: no connection. Retrying…',
  signed_out: 'Not saved: you were signed out. Sign in again in another tab, then press Save. Keep this tab open.',
  rejected: 'Not saved: the server refused this change.',
  conflict:
    'This post was changed in another tab or window. Reload to get the latest version; your edits here will not be saved.',
};

type SaveReply = { revision?: number; slug?: string; error?: string };

/** The editor page (03 ADM-04…06): autosaves, keeps history, never overwrites a newer save. */
export function EditPost({ id }: { id: string }) {
  const [post, setPost] = useState<EditablePost | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<SaveState>('saved');
  const [edits, setEdits] = useState(0);
  const [message, setMessage] = useState('');
  const [panel, setPanel] = useState<'settings' | 'history'>('settings');
  const [editorKey, setEditorKey] = useState(0);
  const [saves, setSaves] = useState(0);
  const doc = useRef<Doc | null>(null);
  const revision = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const retries = useRef(0);

  const load = useCallback(async () => {
    const { status, data } = await api<{ post?: EditablePost; sections?: Section[] }>(`/api/admin/posts/${id}`);
    if (status !== 200 || !data.post) {
      setLoadError(
        status === 404
          ? 'This post does not exist (it may have been deleted).'
          : 'The post could not be loaded. Reload the page to try again.',
      );
      return;
    }
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
    doc.current = null;
    setEditorKey((k) => k + 1);
    setState('saved');
  }, [id]);

  useEffect(() => {
    // Loading the post is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const changed = useCallback(() => {
    setEdits((n) => n + 1);
    setState((s) => (s === 'conflict' ? s : 'dirty'));
  }, []);

  /** Saves what is on screen now. Resolves true if it was saved. One request at a time. */
  const save = useCallback(
    async (options: { keepalive?: boolean } = {}): Promise<boolean> => {
      if (!settings) return false;
      if (inFlight.current) await inFlight.current;
      const fields = { title, ...settings, ...(doc.current ? { content_json: doc.current } : {}) };
      setState((s) => (s === 'conflict' ? s : 'saving'));
      const request = (async () => {
        const { status, data } = await api<SaveReply>(`/api/admin/posts/${id}`, {
          method: 'PUT',
          body: { revision: revision.current, fields },
          keepalive: options.keepalive,
        }).catch(() => ({ status: 0, data: {} as SaveReply }));
        if (status === 200 && data.revision) {
          revision.current = data.revision;
          retries.current = 0;
          setPost((p) =>
            p ? { ...p, slug: data.slug ?? p.slug, has_unpublished_changes: p.status === 'published' } : p,
          );
          setSaves((n) => n + 1);
          setMessage('');
          // Edits made while the request was in flight stay unsaved (and are saved next).
          setState((s) => (s === 'saving' ? 'saved' : s));
          return true;
        }
        if (status === 409) setState('conflict');
        else if (status === 401) setState('signed_out');
        else if (status === 0 || status >= 500) setState('offline');
        else {
          setState('rejected');
          if (data.error) setMessage(data.error);
        }
        return false;
      })();
      inFlight.current = request;
      try {
        return await request;
      } finally {
        inFlight.current = null;
      }
    },
    [id, settings, title],
  );

  // Autosave: a second after the last edit; after a failed request, retry with growing gaps.
  useEffect(() => {
    if (state !== 'dirty' && state !== 'offline') return;
    const delay = state === 'offline' ? RETRY_MS[Math.min(retries.current++, RETRY_MS.length - 1)]! : AUTOSAVE_MS;
    const timer = setTimeout(() => void save(), delay);
    return () => clearTimeout(timer);
  }, [state, edits, save]);

  // Ctrl/⌘+S saves now; leaving with unsaved changes asks first; hiding the tab saves at once.
  useEffect(() => {
    const unsaved = state !== 'saved' && state !== 'conflict';
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state !== 'conflict') void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (unsaved) e.preventDefault();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden' && state === 'dirty') void save({ keepalive: true });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [save, state]);

  const restore = useCallback(
    async (revisionId: number): Promise<boolean> => {
      if (state === 'conflict') return false;
      // Pending edits go into the history first, like everything else.
      if (state !== 'saved' && !(await save())) return false;
      const { status } = await api(`/api/admin/posts/${id}/revisions/${revisionId}`, {
        method: 'POST',
        body: { revision: revision.current },
      });
      if (status === 409) {
        setState('conflict');
        return false;
      }
      if (status !== 200) {
        setMessage('The version could not be restored. Try again.');
        return false;
      }
      await load();
      setSaves((n) => n + 1);
      setMessage('Restored. The previous draft is in the history if you want it back.');
      return true;
    },
    [id, load, save, state],
  );

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
        <button
          type="button"
          className="btn"
          aria-expanded={panel === 'history'}
          aria-controls="ed-side"
          onClick={() => setPanel((p) => (p === 'history' ? 'settings' : 'history'))}
        >
          {panel === 'history' ? 'Settings' : 'History'}
        </button>
        <button
          type="button"
          className="btn pri"
          onClick={() => void save()}
          disabled={state === 'saving' || state === 'conflict'}
        >
          Save
        </button>
      </div>
      {message && (
        <p role="alert" className={state === 'rejected' ? 'adm-error' : 'adm-note'}>
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
              changed();
            }}
          />
          <PostEditor
            key={editorKey}
            initial={post.content_json}
            lang={settings.lang}
            onChange={(d) => {
              doc.current = d;
              changed();
            }}
            onMessage={setMessage}
          />
        </div>
        <div id="ed-side">
          {panel === 'history' ? (
            <RevisionHistory postId={id} refreshKey={saves} onRestore={restore} />
          ) : (
            <SettingsPanel
              kind={post.kind}
              value={settings}
              sections={sections}
              slug={post.slug}
              urlLocked={post.published_at !== null}
              onChange={(patch) => {
                setSettings((s) => (s ? { ...s, ...patch } : s));
                changed();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
