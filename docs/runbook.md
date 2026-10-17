# CodingSpace — Runbook

What to do when something needs doing or goes wrong (03 §11, written in M7). Keep it short and true:
change it in the same PR as whatever it describes.

## Where everything is

| What | Where |
| --- | --- |
| Site | Vercel project `codingspace` (team `codingspacekhs-projects`), `main` → production |
| Domain, DNS | Cloudflare: `codingspacekh.dev` (DNS only, grey cloud, for Vercel's records) |
| Database, sign-in | Supabase project `codingspace-staging` (Singapore) |
| Images and files | Cloudflare R2 bucket `codingspace-media`, served at `https://files.codingspacekh.dev` |
| Scheduled publishing | GitHub Actions → "Publish scheduled posts", every 5 minutes (also keeps the free database awake) |
| Checks on every PR | GitHub Actions → "CI" |
| Checks on the live site | GitHub Actions → "Live site checks": by hand, and Mondays |

Repository settings used by the workflows: secret `CRON_SECRET`; variables `SITE_URL`
(`https://codingspacekh.dev`) and, from launch, `SITE_INDEXABLE=true`.

## Accounts that control the site

These accounts can do far more than the admin: whoever holds one can change the code, read the
secrets, or take the database, files or domain. Each needs its own 2FA (an authenticator app or a
security key, not SMS), a password used nowhere else, and its recovery codes kept offline.

| Account | Whoever holds it can |
| --- | --- |
| **The e-mail behind the accounts below** (`codingspacekh@gmail.com`) | Reset the passwords of every account that signs in with it. Protect it first. |
| **GitHub** (`codingspacekh`) | Push code to `main`, which deploys; change the workflows and their secrets; delete the repository |
| **Vercel** (`codingspacekh`, team `codingspacekhs-projects`) | Read every production secret (database service key, R2 keys, `CRON_SECRET`); deploy any code; take the site down |
| **Supabase** | Read and change all data; reset the admin password; remove the admin's 2FA (see "Lost 2FA device") |
| **Cloudflare** | Point the domain elsewhere (DNS); read, replace or delete every image and file in R2 |
| **Domain registrar** (Cloudflare, if bought there) | Transfer the domain away. Keep **Registrar Lock** on. |
| **The admin's sign-in e-mail** (a personal address, separate from the above) | Ask Supabase for a password-reset e-mail. The 2FA code is still needed to get in. |

Also: GitHub branch protection on `main` (CI must pass, no force pushes), so nothing reaches
production without the tests.

**Check once a term:** 2FA is still on everywhere; no unknown devices or sessions in Google, GitHub,
Vercel, Supabase and Cloudflare; no unknown members, tokens or deploy keys.

**If one of these accounts may have been taken over:**

1. Take it back: change its password, sign out every other session, check its 2FA and recovery
   options (an attacker may have added their own).
2. Look for what changed: GitHub (recent pushes, workflows, secrets, deploy keys, collaborators),
   Vercel (deployments, environment variables, members), Supabase (users, auth settings),
   Cloudflare (DNS records, R2, API tokens). The admin's **Activity** page shows content changes.
3. Roll back a bad deploy ("Deploy and roll back") and restore content if needed ("Backups and restore").
4. Rotate every secret ("Rotate secrets"), even ones that look untouched.
5. In the admin: **Sign out everywhere**, then change the admin password.

## Deploy and roll back

- **Deploy:** merge a PR into `main`. Vercel builds and switches production over when the build passes.
  Pages refresh from the database by themselves within 5 minutes (ISR); publishing in the admin
  refreshes the affected pages at once.
- **Roll back:** Vercel → project → Deployments → the last good one → **Instant Rollback**. Then
  revert the bad PR on GitHub, so the next deploy doesn't bring it back.
- **A database change (migration) went wrong:** roll back the site as above, then fix forward with a
  new migration. Never edit a migration that has run. If data was damaged, restore (below).

## Backups and restore

- **Download an export any time:** admin → Dashboard → Backup → **Download all content**. One .zip:
  `content.json` (every row of every content table) and each post as Markdown. Uploaded images and
  files are not inside; they stay in R2. Over 4 MB, the download leaves out the revision history
  (its README says so).
- **Supabase's own backups:** the free plan keeps none you can restore yourself. Download an export
  before any risky change, and keep a recent one somewhere safe.
- **Weekly export to R2:** not set up yet (needs a private bucket; see docs/04-milestones.md, M7).

### Restore from a backup

Restore only ever goes into an **empty** database; it refuses one that already has content.

1. Create a new Supabase project (or reset the broken one). Apply the schema:
   `npx supabase link --project-ref <ref>` then `npx supabase db push`.
2. Restore the content from the export:
   ```sh
   RESTORE_URL=https://<ref>.supabase.co RESTORE_SERVICE_ROLE_KEY=<service role key> \
     npm run restore -- codingspace-export-YYYY-MM-DD.zip
   ```
   It prints how many rows went into each table; compare with the export's `content.json`.
3. If it's a new project: set it up like the old one (README, "Supabase"): sign-up off, TOTP on,
   the owner's account and allow-list entry, Site URL `https://codingspacekh.dev`. Then point Vercel's
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` at it.
4. Redeploy (Vercel → Deployments → Redeploy). Run **Live site checks** to confirm.

**Restore drill** (before launch, then twice a year): do steps 1–2 into a spare project, run the E2E
suite against it locally (`RESTORE_*` values in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` etc.), and
check the counts match. Delete the spare project afterwards. CI runs the same round trip on every PR
on a local database (`tests/integration/restore.test.ts`).

## Rotate secrets

Rotate when someone may have seen a secret, and once a year. After each change: redeploy, then run
**Live site checks**.

| Secret | Make a new one | Put it in |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys (new secret key, then revoke the old) | Vercel (Production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page (publishable key). Public by design, rotate only with the above | Vercel (all environments) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → Manage API tokens: new token with Object Read & Write on `codingspace-media` only, then delete the old | Vercel (Production and Preview) |
| `CRON_SECRET` | Any random string of 32+ characters (`openssl rand -hex 32`) | Vercel (Production) **and** GitHub secret `CRON_SECRET` — the same value |

## Lost 2FA device

The admin needs the password and a code from the authenticator app. Supabase's 2FA has no recovery
codes, so:

1. **Keep the setup key offline** (the text under the QR code when 2FA was set up): on paper or in a
   password manager. Typing it into a new phone's authenticator app gives the same codes.
2. Without the setup key: sign in to the **Supabase dashboard** (protect that account with its own
   2FA) → Authentication → Users → the owner → remove the MFA factor. At the next admin sign-in the
   site asks to set up 2FA again, with a new QR code. Save the new setup key offline.

## The database is paused or down

- Public pages keep working: they're built ahead and kept (tested on every PR,
  `tests/e2e/chaos.spec.ts`). Search, the admin, scheduled publishing and refreshes stop.
- **Paused** (free plan, after a week without activity; the 5-minute publishing job normally prevents
  it): Supabase dashboard → the project → **Restore project**. Takes a few minutes.
- **Down for Supabase:** check status.supabase.com; nothing to do but wait. Pages refresh by
  themselves once it's back.

## Other problems

- **A scheduled post didn't go live:** Actions → "Publish scheduled posts": a red run says why
  (usually `CRON_SECRET` differs between Vercel and GitHub). Run it by hand with **Run workflow**.
- **Uploads fail in the admin:** the R2 bucket's CORS must allow `https://codingspacekh.dev`
  (README, "Media (R2)"), and the R2 token must still exist.
- **Images missing on a lesson:** open it in the admin and **Update** it (published HTML keeps the
  media address it was published with).

## Checks on the live site

Actions → **Live site checks** → Run workflow:

- **Headers, redirects, links and media** (`tests/live`): read-only requests; also every Monday.
  Locally: `LIVE_URL=https://codingspacekh.dev npm run test:live`.
- **ZAP baseline:** a passive security scan; fails on any high-risk alert. The report is attached to
  the run. Known and accepted: "Source Code Disclosure" on coding lessons (their code examples) and
  no Cross-Origin-Embedder-Policy (it would block the embeds and media).
- **Load test** (tick the box): k6 sends 20 page requests a second for 10 minutes and fails unless
  p95 < 300 ms with no errors (NFR-CAP-1). Run it only on purpose, not during lessons.
