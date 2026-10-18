import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPORT_TABLES, type ExportData, type TableName } from './bundle';
import { unzip } from './unzip';

/**
 * Puts an export (./bundle.ts) back into a database (NFR-REL-2, the restore drill), with the
 * service-role key. Only into an empty one: a restore never mixes with or overwrites content.
 * Rows keep their ids, so links between them (and media keys in R2) still match. Revisions get
 * new ids (the column is generated); a problem's updated_at becomes the restore time.
 */

const CONFLICT: Record<TableName, string> = {
  subjects: 'id', // the first four are already there (seeded); added ones come with the export
  sections: 'id',
  media: 'id',
  posts: 'id',
  post_revisions: 'id',
  post_media: 'post_id,media_id', // also rebuilt by a trigger as each post goes in
  projects: 'id',
  project_screenshots: 'project_id,position',
  profile: 'id',
  author_sections: 'id', // the built-in ones are already there, like the subjects
  author_items: 'id',
  featured_problems: 'id',
  series: 'id',
  series_lessons: 'series_id,post_id',
  syllabuses: 'id',
  syllabus_points: 'id',
  post_syllabus: 'post_id,point_id',
};
const BATCH = 200;

const without = (row: Record<string, unknown>, key: string) => {
  const copy = { ...row };
  delete copy[key];
  return copy;
};

export class RestoreError extends Error {}

/** content.json, or a whole export .zip. */
export function readExport(file: Buffer): ExportData {
  const isZip = file.readUInt32LE(0) === 0x04034b50;
  const text = isZip ? unzip(file).get('content.json') : file.toString('utf8');
  if (!text) throw new RestoreError('the .zip has no content.json');
  const data = JSON.parse(text) as ExportData;
  if (data.format !== 1 || !data.tables) throw new RestoreError('not a CodingSpace export (format 1)');
  return data;
}

type Row = Record<string, unknown>;

/** Exports made before the Author page had sections kept the timeline in its own table. */
function upgrade(tables: ExportData['tables']): ExportData['tables'] {
  const legacy = (tables as Record<string, Row[] | undefined>).timeline_items;
  if (!legacy?.length || tables.author_items?.length) return tables;
  return {
    ...tables,
    author_items: legacy.map((t) => ({ section_id: 'timeline', title: t.text, period: String(t.year), sort: t.sort })),
  };
}

export async function restoreContent(db: SupabaseClient, data: ExportData): Promise<Record<TableName, number>> {
  for (const table of ['posts', 'sections', 'projects'] as const) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    if (count) throw new RestoreError(`the database already has ${table}: restore only into an empty one`);
  }

  const tables = upgrade(data.tables);
  const restored = {} as Record<TableName, number>;
  for (const { name } of EXPORT_TABLES) {
    let rows = tables[name] ?? [];
    if (name === 'post_revisions') rows = rows.map((r) => without(r, 'id'));
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } =
        name === 'post_revisions'
          ? await db.from(name).insert(batch)
          : await db.from(name).upsert(batch, { onConflict: CONFLICT[name] });
      if (error) throw new Error(`${name}: ${error.message}`);
    }
    restored[name] = rows.length;
  }
  return restored;
}
