# Security review — OWASP ASVS Level 1 (M7)

Checked against [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) v4.0.3,
Level 1, for the launch gate (03 NFR-SEC-1). Date: 2026-10-17. Scope: the whole app (public pages,
the admin, the API, uploads, the database rules).

**Outcome:** ASVS L1 is met. No code changes are outstanding. What remains is operational and already
tracked in M7 (secrets rotation, the restore drill, monitoring) — see "Before launch" at the end.

Each row is **Met**, **N/A** (feature not present), or **Action** (something to do, not a hole).

## V1 Architecture, V14 Configuration

| Item | Status | Evidence |
| --- | --- | --- |
| Security controls on the server, not the client (V1.1, V1.2) | Met | Every admin route runs through `withOwner` (`src/server/auth/guard.ts`); a unit test fails the build if any `/api/admin` route lacks it (`tests/unit/auth/admin-routes.test.ts`). The database also enforces RLS underneath. |
| Defined HTTP security headers (V14.4) | Met | `src/config/security-headers.mjs`: CSP, HSTS (preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP. Tested in `tests/unit/security-headers.test.ts` and `tests/e2e/headers.spec.ts`, and on the live domain in `tests/live/site.spec.ts`. |
| Content-Security-Policy (V14.4.3) | Met | `script-src 'self'` plus one hashed inline boot script — no `unsafe-inline`, no `unsafe-eval`. `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Media and embeds are allow-listed origins only. |
| Dependencies free of known-vulnerable components (V14.2) | Met | `npm run audit:ci` runs on every PR (`.github/workflows/ci.yml`); 0 vulnerabilities. Lockfile committed; GitHub Actions pinned to commit SHAs. |
| No secrets in client code (V14.3) | Met | Only `NEXT_PUBLIC_*` values reach the browser; service-role key and R2 keys are read in server-only modules. No secrets committed (`.gitignore` covers `.env*`, `.vercel/`). |

## V2 Authentication

| Item | Status | Evidence |
| --- | --- | --- |
| Password strength (V2.1.1, V2.1.9) | Met | Supabase: `minimum_password_length = 12`, `password_requirements = lower_upper_letters_digits_symbols` (`supabase/config.toml`). |
| Multi-factor (above L1; we require it) | Met | Admin needs AAL2 — password plus TOTP — checked on every request (`checkOwner` requires `claims.aal === 'aal2'`). |
| Credential recovery doesn't reveal accounts (V2.5.1) | Met | Sign-in returns one message for a wrong password and an unknown email (`signInWithPassword` in `src/server/auth/flow.ts`). |
| Anti-automation on auth (V2.2.1) | Met | Supabase rate limits sign-in/sign-up to 30 per 5 min per IP, OTP checks to 30 per 5 min, reset emails to 2/hour (`supabase/config.toml [auth.rate_limit]`). |
| No self-registration of admins (V2.x) | Met | `enable_signup = false`; accounts must also be on the owner allow-list, checked server-side (`admin_touch`). |

## V3 Session management

| Item | Status | Evidence |
| --- | --- | --- |
| Session tokens in HttpOnly, Secure, SameSite cookies (V3.4) | Met | `cookieOptions` in `src/server/auth/clients.ts`: `httpOnly: true`, `sameSite: 'lax'`, `secure` on HTTPS, `path: '/'`. The browser never handles the token. |
| Idle timeout (V3.3.1) | Met | 12-hour idle limit enforced server-side by `admin_touch()` on every request; the cookie `maxAge` matches. |
| Logout invalidates the session (V3.3.1) | Met | `signOut` with `local` and a `global` ("sign out everywhere") scope (`src/server/auth/flow.ts`); revoked tokens are rejected (`PGRST301/303` → 401). |
| Token rotation (V3.2) | Met | Supabase `enable_refresh_token_rotation = true`, `jwt_expiry = 3600`. |

## V4 Access control

| Item | Status | Evidence |
| --- | --- | --- |
| Enforced on every request, default deny (V4.1.1, V4.1.3) | Met | Three independent layers (`guard.ts` header comment): `src/proxy.ts`, `withOwner`, and RLS `private.is_owner()` on every table. The public anon role can read only the `public_*` views (published content). |
| No direct object reference bypass (V4.2.1) | Met | All admin reads/writes go through the owner's RLS session; a non-owner session sees nothing (verified by `supabase/tests` pgTAP and integration tests). |
| CSRF protection on state changes (V4.2.2 / V3.5) | Met | `isSameOrigin` requires a matching `Origin` on every POST/PUT/PATCH/DELETE; missing Origin is refused. Combined with `SameSite=lax` cookies. |

## V5 Validation, sanitization, encoding

| Item | Status | Evidence |
| --- | --- | --- |
| Output encoding / XSS (V5.3.3) | Met | The renderer emits only allow-listed node types and escapes every text value and attribute (`escapeHtml`, used throughout `src/server/render/index.ts`). `post-view.tsx` injects only this server-built, escaped HTML. No raw user HTML is ever stored or rendered (raw HTML nodes are dropped on import). |
| URL/scheme allow-list (V5.1.3, V5.3.x) | Met | `src/server/render/policy.ts`: links limited to `https:`, `mailto:`, site-relative and anchors; control/whitespace chars rejected (blocks `java\tscript:`); images only under the media origin; embeds rebuilt from a validated id, never a stored URL. |
| SQL injection (V5.3.4) | Met | All queries use parameterized PostgREST filters (`.eq`, `.lt`, `.in`). The one text-built query (`search_posts`) uses `quote_literal` + `to_tsquery` and escapes `%_\` in ILIKE (`supabase/migrations/20261023000000_search.sql`). Live probing: every payload treated as a literal, no DB error, nothing leaked. A malformed slug is now rejected before the query (PR #49). |
| Deserialization (V5.5) | Met | Export restore reads JSON with `JSON.parse` and validates `format`/`tables` (`src/server/export/restore.ts`); the ZIP reader decompresses in memory and never writes files (`src/server/export/unzip.ts`). Content import parses YAML front matter and validates every field (`src/server/content/load.ts`). |

## V7 Error handling and logging

| Item | Status | Evidence |
| --- | --- | --- |
| Generic error messages to the client (V7.4.1) | Met | `sendError` returns `{ error: 'server_error' }` with the detail logged server-side only (`src/server/admin/http.ts`); refusals map to typed statuses (400/401/403/404/409/422). No stack traces in responses (confirmed live). |
| Audit log of security-relevant events (above L1) | Met | Every admin change and sign-in writes an `audit_events` row in the same transaction; readable at `/admin/activity` (ADM-15). |

## V8 Data protection, V9 Communication

| Item | Status | Evidence |
| --- | --- | --- |
| TLS everywhere, modern only (V9.1） | Met | Live site accepts TLS 1.2/1.3 only, refuses 1.0/1.1; HSTS `max-age=63072000; includeSubDomains; preload`; http and www redirect to the bare https domain (`tests/live/site.spec.ts`). |
| No sensitive data in caches (V8.1) | Met | Admin and auth responses set `Cache-Control: private, no-store` (`guard.ts`, `src/proxy.ts`). |
| Admin pages excluded from search (V8.x) | Met | `/admin/*` sends `X-Robots-Tag: noindex`; whole site `noindex` until launch. |

## V12 Files and resources

| Item | Status | Evidence |
| --- | --- | --- |
| Uploaded file type verified by content, not name (V12.2.1) | Met | `src/server/media/sniff.ts` checks magic bytes for each accepted type; a mismatch is rejected. Text must be valid UTF-8. |
| Dangerous types rejected (V12.x) | Met | SVG is not an accepted image type (not in `sniffImage`), so it is rejected — no script-bearing images. Images are re-encoded with sharp (metadata/EXIF stripped). |
| Uploads served from a separate origin (V12.3, V12.5) | Met | Media is served from `files.codingspacekh.dev` (its own origin), not the app origin; files download with their checked content-type. |
| Upload size/flow (V12.1) | Met | The browser uploads straight to R2 (presigned), so bytes never pass through a function; the server then verifies and re-encodes (`src/server/media/uploads.ts`). |

## V11 / V13 Business logic & API

| Item | Status | Evidence |
| --- | --- | --- |
| API methods restricted (V13.2.1) | Met | Each route declares its methods in `withOwner([...])`; others get 405 with an `Allow` header. |
| Server-side enforcement of workflow rules (V11.1) | Met | Publish/schedule/slug-lock/one-featured-project rules enforced in SQL functions and triggers (`supabase/migrations`), not just the UI. |

## Findings

No code-level vulnerabilities. Two low-severity, non-blocking notes:

1. **The export download is a GET that also writes an audit row.** A cross-site link could make the
   owner's browser download their own export and add a spurious "Downloaded an export" entry. It
   cannot read the file (no CORS, `no-store`, CORP `same-origin`). Low severity; optional fix is to
   make the download a POST with the same-origin check.
2. **Malformed lesson address returned 500 instead of 404** — fixed in PR #49 (`isPostSlug` guards
   `getPostPage`). No data was ever exposed.

## Before launch (operational, tracked in M7)

These are process items, not code gaps:

- Rotate all secrets (runbook, "Rotate secrets") and confirm 2FA on every account that controls the
  site (runbook, "Accounts that control the site").
- Run the restore drill on a spare empty project (exit criterion).
- Weekly content export to a **private** R2 bucket (the current media bucket is public).
- Add Sentry, an uptime monitor, and Vercel Speed Insights.
- Run the k6 load test once against the live site (NFR-CAP-1).
- Hold the 2FA recovery (setup) key offline (exit criterion).

## How to re-check

- On every PR: `npm run check` (types, lint, unit), pgTAP RLS tests, integration tests, E2E + axe,
  Lighthouse, `npm audit`.
- On the live site: **Actions → Live site checks** (headers, redirects, links, ZAP baseline), and
  `LIVE_URL=… npm run test:live`.
