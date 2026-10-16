# CodingSpace

Source for **[codingspace.io](https://codingspace.io)**: lessons in competition mathematics, physics, coding and Cambridge AS & A Level Computer Science (9618) and IT (9626), plus the tools built for those classes.

Built with Next.js (Pages Router), React 18, [Arwes](https://github.com/arwes/arwes) for the sci-fi interface, and Supabase. Developed test-first.

## Documentation

| Doc                                                      | What it covers                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [docs/03-system-analysis.md](docs/03-system-analysis.md) | Requirements, architecture, security, performance, TDD process (current baseline) |
| [docs/04-milestones.md](docs/04-milestones.md)           | Build order (M0–M7) and the tests that define each milestone                      |
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
3. In GitHub (Settings → Secrets and variables → Actions): secret `CRON_SECRET` (the same value) and variable `SITE_URL` (e.g. `https://codingspace-tawny.vercel.app`).

Until then the workflow skips itself, and scheduled posts wait.

Under Authentication → Providers, **Email** must be enabled (it is the sign-in method) while **Allow new users to sign up** stays off. Keep the authenticator's recovery key offline.

## Tests

```bash
npm run check          # types, lint, formatting, unit tests
npm run test:coverage  # unit + component tests with coverage gates
npm run test:e2e       # Playwright + axe against a production build
npm run db:start       # local Supabase (Docker)
npm run db:test        # pgTAP row-level-security tests
npm run test:int       # integration tests against the local database (content import, admin sign-in)
```

Every pull request runs the same gates in GitHub Actions. A red check blocks the merge.

## Security

Please report security issues privately via GitHub's **Report a vulnerability** (Security tab), not in public issues.

## Licence

All rights reserved. The code is public for transparency and learning, but it is not licensed for reuse.
