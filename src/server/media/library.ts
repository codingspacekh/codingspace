import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { cleanFileName } from '@/lib/media-rules';
import { fileKey, IMAGE_FORMATS, imageKey } from '@/lib/media-urls';
import { PostError } from '@/server/admin/posts';
import type { MediaStore } from './store';
import type { MediaItem } from './uploads';

/**
 * The media library (03 ADM-10): browse, search, see where a file is used, rename, delete unused.
 * v1.1: folders, one level deep; a file is in one folder or none (Unsorted).
 */

const SELECT = 'id, kind, mime, bytes, width, height, widths, alt, original_name, created_at, use_count, folder_id';
export const PAGE_SIZE = 60;

export const listQuery = z.object({
  kind: z.enum(['image', 'file']).optional(),
  q: z.string().max(100).optional(),
  unused: z.enum(['1']).optional(),
  /** A folder's id, or "none" for Unsorted; left out: every folder. */
  folder: z.union([z.uuid(), z.literal('none')]).optional(),
  /** created_at of the last item already shown (newest first). */
  before: z.iso.datetime({ offset: true }).optional(),
});

/** Newest first, PAGE_SIZE at a time; `more` says whether to ask again with `before`. */
export async function listMedia(supabase: SupabaseClient, query: unknown) {
  const q = listQuery.safeParse(query);
  if (!q.success) throw new PostError(400, z.prettifyError(q.error));
  let req = supabase
    .from('admin_media')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (q.data.kind) req = req.eq('kind', q.data.kind);
  if (q.data.unused) req = req.eq('use_count', 0);
  if (q.data.folder === 'none') req = req.is('folder_id', null);
  else if (q.data.folder) req = req.eq('folder_id', q.data.folder);
  if (q.data.before) req = req.lt('created_at', q.data.before);
  const text = q.data.q?.trim();
  // LIKE wildcards in the search are literal characters.
  if (text) req = req.ilike('original_name', `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await req;
  if (error) throw new Error(`admin_media: ${error.message}`);
  const items = (data ?? []) as MediaItem[];
  return { items: items.slice(0, PAGE_SIZE), more: items.length > PAGE_SIZE };
}

export type MediaUse = { id: string; title: string; slug: string; in_draft: boolean; in_live: boolean };

const uuid = z.uuid();

export async function getMedia(supabase: SupabaseClient, id: string) {
  const mediaId = uuid.parse(id);
  const [media, uses, profile] = await Promise.all([
    supabase.from('admin_media').select(SELECT).eq('id', mediaId).maybeSingle(),
    supabase.from('post_media').select('in_draft, in_live, posts(id, title, slug)').eq('media_id', mediaId),
    supabase.from('profile').select('photo_media_id').eq('photo_media_id', mediaId).maybeSingle(),
  ]);
  if (media.error) throw new Error(`admin_media: ${media.error.message}`);
  if (uses.error) throw new Error(`post_media: ${uses.error.message}`);
  if (profile.error) throw new Error(`profile: ${profile.error.message}`);
  if (!media.data) throw new PostError(404, 'file not found');
  const used_by = (uses.data ?? []).map((u) => {
    const post = u.posts as unknown as { id: string; title: string; slug: string };
    return { ...post, in_draft: u.in_draft as boolean, in_live: u.in_live as boolean };
  });
  used_by.sort((a, b) => a.title.localeCompare(b.title));
  return { ...(media.data as MediaItem), used_by: used_by as MediaUse[], author_photo: !!profile.data };
}

export const mediaEdit = z.object({
  alt: z.string().max(500),
  original_name: z.string().max(500),
});

/** The default alt text (offered when the image is inserted again) and the display name. */
export async function updateMedia(supabase: SupabaseClient, id: string, input: unknown) {
  const body = mediaEdit.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const name = cleanFileName(body.data.original_name);
  if (!name) throw new PostError(422, 'a name is required');
  const { error } = await supabase.rpc('admin_update_media', {
    p_id: uuid.parse(id),
    p_alt: body.data.alt,
    p_original_name: name,
  });
  if (error) {
    if (error.code === 'PT404') throw new PostError(404, error.message);
    throw new Error(`admin_update_media: ${error.message}`);
  }
}

/** Only an unused file (409 otherwise). The row goes first; then its objects in R2. */
export async function deleteMedia(supabase: SupabaseClient, store: MediaStore | null, id: string) {
  const mediaId = uuid.parse(id);
  const { data, error } = await supabase.rpc('admin_delete_media', { p_id: mediaId });
  if (error) {
    if (error.code === 'PT404') throw new PostError(404, error.message);
    if (error.code === 'PT409') throw new PostError(409, error.message);
    throw new Error(`admin_delete_media: ${error.message}`);
  }
  const { kind, widths } = data as { kind: 'image' | 'file'; widths: number[] };
  const keys =
    kind === 'image' ? widths.flatMap((w) => IMAGE_FORMATS.map((f) => imageKey(mediaId, w, f))) : [fileKey(mediaId)];
  // Leftover objects are harmless (nothing links to them); a failure here isn't the owner's problem.
  if (store) await store.delete(keys).catch((e) => console.error('media delete: objects left in storage', keys, e));
  return { keys };
}

// ---------- folders (v1.1) ----------

export type MediaFolder = { id: string; name: string; file_count: number };
export type MediaFolders = { folders: MediaFolder[]; all: number; unsorted: number };

/** The folders A–Z with their file counts, and the counts for "All media" and "Unsorted". */
export async function listFolders(supabase: SupabaseClient): Promise<MediaFolders> {
  const [folders, all, unsorted] = await Promise.all([
    supabase.from('admin_media_folders').select('id, name, file_count').order('name'),
    supabase.from('media').select('id', { count: 'exact', head: true }),
    supabase.from('media').select('id', { count: 'exact', head: true }).is('folder_id', null),
  ]);
  for (const r of [folders, all, unsorted]) if (r.error) throw new Error(`media folders: ${r.error.message}`);
  const list = (folders.data ?? []) as MediaFolder[];
  list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
  return { folders: list, all: all.count ?? 0, unsorted: unsorted.count ?? 0 };
}

function folderError(error: { code?: string; message: string }, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  throw new Error(`${what}: ${error.message}`);
}

export const folderInput = z.object({ name: z.string().trim().min(1, 'a folder needs a name').max(80) });

/** A new folder (id null) or a new name for one; returns its id. Names are unique, whatever the case. */
export async function saveFolder(supabase: SupabaseClient, id: string | null, input: unknown) {
  const body = folderInput.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const { data, error } = await supabase.rpc('admin_save_media_folder', {
    p_id: id === null ? null : uuid.parse(id),
    p_name: body.data.name,
  });
  if (error) folderError(error, 'admin_save_media_folder');
  return { id: data as string };
}

/** Deletes a folder; its files go back to Unsorted (never deleted). Returns how many moved. */
export async function deleteFolder(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc('admin_delete_media_folder', { p_id: uuid.parse(id) });
  if (error) folderError(error, 'admin_delete_media_folder');
  return { moved: data as number };
}

export const moveInput = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  /** null: back to Unsorted. */
  folder: z.uuid().nullable(),
});

/** Moves files into a folder (or back to Unsorted). Returns how many moved. */
export async function moveMedia(supabase: SupabaseClient, input: unknown) {
  const body = moveInput.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const { data, error } = await supabase.rpc('admin_move_media', { p_ids: body.data.ids, p_folder: body.data.folder });
  if (error) folderError(error, 'admin_move_media');
  return { moved: data as number };
}
