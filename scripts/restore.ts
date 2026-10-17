/**
 * Restores an export into an EMPTY database (NFR-REL-2; docs/runbook.md, "Restore from a backup").
 *   RESTORE_URL=https://<ref>.supabase.co RESTORE_SERVICE_ROLE_KEY=… npm run restore -- export.zip
 * Takes a codingspace-export-*.zip or its content.json. Separate variables from the site's own
 * (NEXT_PUBLIC_SUPABASE_URL…), so a restore can't land on production by accident; it also
 * refuses a database that already has content.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readExport, RestoreError, restoreContent } from '@/server/export/restore';

async function main() {
  const file = process.argv[2];
  const url = process.env.RESTORE_URL;
  const key = process.env.RESTORE_SERVICE_ROLE_KEY;
  if (!file) throw new RestoreError('Usage: npm run restore -- <codingspace-export.zip | content.json>');
  if (!url || !key)
    throw new RestoreError('Set RESTORE_URL and RESTORE_SERVICE_ROLE_KEY for the database to restore into.');

  const data = readExport(readFileSync(file));
  console.log(`export from ${data.exported_at}; restoring into ${new URL(url).host} …`);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const restored = await restoreContent(db, data);
  for (const [table, n] of Object.entries(restored)) console.log(`  ${table.padEnd(18)} ${n}`);
  if (data.omitted?.length) console.warn(`note: this export left out ${data.omitted.join(', ')}`);
  console.log('done. Pages show the restored content once the site is rebuilt (redeploy).');
}

main().catch((e: unknown) => {
  console.error(e instanceof RestoreError ? e.message : e);
  process.exit(1);
});
