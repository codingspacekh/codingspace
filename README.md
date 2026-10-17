# CodingSpace

Source for **[codingspacekh.dev](https://codingspacekh.dev)**: lessons in competition mathematics, physics, coding and Cambridge AS & A Level Computer Science (9618) and IT (9626), plus the tools built for those classes.

Built with Next.js (Pages Router), React 18, [Arwes](https://github.com/arwes/arwes) for the sci-fi interface, and Supabase. Developed test-first.

## Documentation

| Doc                                                      | What it covers                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [docs/03-system-analysis.md](docs/03-system-analysis.md) | Requirements, architecture, security, performance, TDD process (current baseline) |
| [docs/04-milestones.md](docs/04-milestones.md)           | Build order (M0–M7) and the tests that define each milestone                      |
| [docs/runbook.md](docs/runbook.md)                       | Deploy, roll back, back up and restore, rotate secrets, lost 2FA, outages         |
| [docs/adr/](docs/adr/)                                   | Architecture decision records                                                     |

## Run it locally

Requirements: Node 24, and a Docker runtime (e.g. [Colima](https://github.com/abiosoft/colima)) for the local database.

```bash
npm install                 # also applies the Arwes safe-math patch
cp .env.example .env.local  # fill in values from `npm run db:start`
npm run dev                 # http://localhost:3000
```

## Admin

`/admin` is for the site owner only: email + password, then a 6-digit code from an authenticator app (TOTP, required). The first sign-in shows a QR code to set one up. Sessions end after 12 hours without activity; **Sign out everywhere** ends every session at once.

Locally, `supabase start` seeds a test owner (see `supabase/seed.sql`); the tests create its account. On a real Supabase project, add the owner once, in the SQL editor:

```sql
-- The owner's user id: Authentication → Users (create the user there; sign-ups stay disabled).
insert into private.owner (user_id) values ('<user id>');
```

### Scheduled publishing

A GitHub Actions schedule (`.github/workflows/publish-due.yml`) calls `/api/cron/publish-due` every 5 minutes; Vercel Cron on the Hobby plan runs only once a day. Set up once:

1. Make a random secret of at least 32 characters, e.g. `openssl rand -hex 32`.
2. In Vercel (Production): environment variables `CRON_SECRET` (that secret) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys), then redeploy.
3. In GitHub (Settings → Secrets and variables → Actions): secret `CRON_SECRET` (the same value) and variable `SITE_URL` (`https://codingspacekh.dev`).

Until then the workflow skips itself, and scheduled posts wait.

### Media (R2)

Images and files are uploaded to a Cloudflare R2 bucket. Until `codingspacekh.dev` exists, the bucket's temporary public address (`https://pub-….r2.dev`) serves them. Set up once, in the Cloudflare dashboard → **R2**:

1. **Create bucket** `codingspace-media` (location hint: Asia-Pacific).
2. Bucket → **Settings → Public access → R2.dev subdomain → Allow**. Copy the `https://pub-….r2.dev` address.
3. Bucket → **Settings → CORS policy → Add**, so the admin's browser may upload straight to R2:
   ```json
   [
     {
       "AllowedOrigins": ["https://codingspacekh.dev", "https://codingspace-tawny.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Bucket → **Settings → Object lifecycle rules → Add rule**: prefix `u/`, delete objects 1 day after upload (uploads that were never finished).
5. R2 overview → **Manage API tokens → Create API token**: permission **Object Read & Write**, applied to `codingspace-media` only. Copy the Access Key ID and Secret Access Key (shown once), and the Account ID.
6. In Vercel (Production and Preview): `NEXT_PUBLIC_MEDIA_BASE_URL` (the r2.dev address), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=codingspace-media`. Redeploy (the media address is built into the pages and the CSP).

Until then uploads answer "Uploads aren't set up yet". Content stores media ids, not URLs, so moving to `files.codingspacekh.dev` later (M7) is: connect the domain to the bucket, change `NEXT_PUBLIC_MEDIA_BASE_URL`, redeploy, and **Update** the published posts that have images. Keep the r2.dev address on until that is done.

Locally, without R2: `MEDIA_STORE=local` and `NEXT_PUBLIC_MEDIA_BASE_URL=http://localhost:3000/api/media-local` keep uploads in `./.media-local` (refused on Vercel). The E2E tests run that way.

Under Authentication → Providers, **Email** must be enabled (it is the sign-in method) while **Allow new users to sign up** stays off. Keep the authenticator's recovery key offline.

## Tests

```bash
npm run check          # types, lint, formatting, unit tests
npm run test:coverage  # unit + component tests with coverage gates
npm run test:e2e       # Playwright + axe against a production build
npm run db:start       # local Supabase (Docker)
npm run db:test        # pgTAP row-level-security tests
npm run test:int       # integration tests against the local database (content import, admin sign-in)
LIVE_URL=https://codingspacekh.dev npm run test:live   # read-only checks against the live site
```

Every pull request runs the same gates in GitHub Actions. A red check blocks the merge. The live
site has its own workflow, "Live site checks" (headers, ZAP scan, k6 load test): see the runbook.

## Security

Please report security issues privately via GitHub's **Report a vulnerability** (Security tab), not in public issues.

## Credits

Interface sounds `click`, `type`, `deploy` and `intro` are from the [ARWES](https://github.com/arwes/arwes) project, MIT License (see `public/sounds/LICENSE-arwes.txt`).

## Licence

All rights reserved. The code is public for transparency and learning, but it is not licensed for reuse.
