/**
 * Loads content/ into the database (M2). Usage:
 *   npm run content:import -- --dry-run   validate and render only, no database
 *   npm run content:import                write to NEXT_PUBLIC_SUPABASE_URL
 *   npm run content:import -- --replace-site-content
 *                                         also overwrite projects, profile, timeline and problems
 *                                         (normally kept once they exist: they are edited in the admin)
 * Needs SUPABASE_SERVICE_ROLE_KEY (from .env.local, or the environment).
 */
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { importContent } from '@/server/content/import';
import { ContentError, loadContent } from '@/server/content/load';
import { supabaseStore } from '@/server/content/supabase-store';
import { renderContent } from '@/server/render';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const replaceSiteContent = process.argv.includes('--replace-site-content');
  const content = loadContent(join(process.cwd(), 'content'));
  console.log(
    `content/: ${content.posts.length} posts, ${content.sections.length} sections, ` +
      `${content.projects.length} projects, ${content.problems.length} featured problems`,
  );
  if (content.dummyFiles) console.warn(`warning: ${content.dummyFiles} file(s) are still marked dummy: true`);

  if (dryRun) {
    for (const post of content.posts) await renderContent(post.doc, { lang: post.lang });
    console.log('dry run: everything is valid and renders. Nothing was written.');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
  console.log(`importing into ${new URL(url).host} …`);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await importContent(content, supabaseStore(db), new Date(), { replaceSiteContent });
  console.log(
    `done: ${report.posts} posts published, ${report.sections} sections, ${report.projects} projects, ` +
      `${report.timeline} timeline items, ${report.featuredProblems} featured problems`,
  );
  if (report.siteContent === 'kept') {
    console.log(
      'kept: projects, profile, timeline and problems were already in the database (edited in the admin). ' +
        'Add --replace-site-content to overwrite them with content/.',
    );
  }
  if (report.notInContent.length) {
    console.warn(`note: in the database but not in content/ (left unchanged): ${report.notInContent.join(', ')}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof ContentError ? e.message : e);
  process.exit(1);
});
