# CodingSpace (codingspacekh.dev) — System Requirements Specification

> **Superseded.** The current baseline is [03-system-analysis.md](./03-system-analysis.md), with the build plan in [04-milestones.md](./04-milestones.md). This file is kept as history.

| | |
|---|---|
| Project | Personal teaching blog & software distribution site |
| Owner / sole author | Site owner (teacher) |
| Version | 0.1 (draft) — 2026-10-15 |
| UI framework | React + [Arwes](https://github.com/arwes/arwes) (sci-fi UI, animation, sound) |

---

## 1. Purpose & scope

A personal website where the owner publishes:

- **Lessons** — mathematics, physics, coding (incl. Cambridge AS/A Level Computer Science 9618 and IT 9626).
- **Projects** — software the owner builds, with downloadable installers / files for students.
- **Life** — life lessons and daily-life posts.

Students read lessons, download software and course files, and ask questions in comments. The owner answers them. Visitors never log in; only the owner has an account.

### Out of scope (v1)
- Student accounts, grades, quizzes, or a learning management system.
- Multiple authors or editorial roles.
- Payments and paid content.
- A native mobile app. The site is responsive and works on phones.

---

## 2. Actors

| Actor | Description | Auth |
|---|---|---|
| **Visitor / Student** | Reads posts, downloads files, posts comments and questions. Often on a phone with limited bandwidth. | None (anonymous) |
| **Owner (Admin)** | Writes and publishes posts, uploads media and software, moderates and replies to comments. | Email login + 2FA |
| **System** | Sends notifications, rebuilds pages, runs spam checks. | Service credentials |

---

## 3. Functional requirements

Priority: **M** = Must (v1), **S** = Should (v1 if time allows), **C** = Could (later).

### 3.1 Public content browsing

| ID | Requirement | P |
|---|---|---|
| FR-01 | The home page shows the latest posts, featured courses and featured software. | M |
| FR-02 | Posts are grouped by **category** (Math, Physics, Coding, CS 9618, IT 9626, Projects, Life) and by free-form **tags**. | M |
| FR-03 | **Course / series** pages list ordered lessons (e.g. *9618 › Paper 1 › 1.1 Data Representation*) with previous/next navigation inside the series. | M |
| FR-04 | Post pages render rich content: headings, paragraphs, images with captions, links, lists, tables, quotes, callout boxes, **LaTeX math** (inline and block), **syntax-highlighted code**, embedded video (YouTube) and file attachments. | M |
| FR-05 | Full-text search across post titles, summaries and body text. | M |
| FR-06 | Each post shows a table of contents, estimated reading time, published and updated dates. | S |
| FR-07 | "Copy code" button on code blocks. | S |
| FR-08 | Print-friendly / "save as PDF" layout for lesson pages, with animations and backgrounds removed. | S |
| FR-09 | RSS / Atom feed. | S |
| FR-10 | About / contact page. | M |
| FR-11 | Each post has a language (`en` default, `km` supported). Khmer articles render in a Khmer font with correct line-breaking. No translation linking between posts. | S |

### 3.2 Projects & lesson files

> Decision (2026-10-15): each piece of software has **its own landing page** elsewhere. This site lists the projects and links out to them. It does **not** host installers.

| ID | Requirement | P |
|---|---|---|
| FR-20 | **Projects catalogue**: name, short description, icon/screenshot, related course, platforms, current version label, external **landing page URL**, optional tutorial post link. | M |
| FR-21 | One project can be marked *featured* and shown large at the top of the Projects page and on the home page. | S |
| FR-22 | Any post can attach documents (PDF, DOCX, PPTX, XLSX, ZIP, source files) shown as a download list. | M |
| FR-23 | Counts of outbound clicks to landing pages and of attachment downloads, visible to the admin. | S |
| FR-24 | Attachments are served from a CDN. Maximum file size is 100 MB. | M |

### 3.3 Comments & questions (no login) — **deferred to a later release**

> Decision (2026-10-15): launch **without comments**. The requirements below are kept for a later phase. In v1 these become C (Could).

| ID | Requirement | P |
|---|---|---|
| FR-30 | Visitors post a comment with a **display name** (required), **email** (optional, never shown; used only to notify them of a reply) and message body. | M |
| FR-31 | Comment bodies support plain text plus a safe Markdown subset (code, inline math, links). Raw HTML is stripped. | M |
| FR-32 | Threaded replies, at least 2 levels: student question → owner answer → follow-up. | M |
| FR-33 | Owner replies are clearly marked (badge, distinct frame or colour). | M |
| FR-34 | **Moderation mode** set per site, overridable per post: `pre-moderated` (default; held until approved) or `auto-publish`. | M |
| FR-35 | Spam protection: CAPTCHA (e.g. Cloudflare Turnstile), honeypot field, per-IP rate limit, link limit, banned-word list. | M |
| FR-36 | The owner is notified of new comments by email and can view them in an admin inbox. | M |
| FR-37 | A student who left an email receives one notification when the owner replies, with an unsubscribe link. | S |
| FR-38 | Comments can be closed per post. | S |
| FR-39 | A student can mark a question as "helpful" (anonymous, rate-limited). | C |
| FR-40 | The owner can pin a comment (e.g. an FAQ answer) to the top. | S |

### 3.4 Authoring (admin)

| ID | Requirement | P |
|---|---|---|
| FR-50 | Admin login with email + password or magic link, plus TOTP 2FA. | M |
| FR-51 | **Rich block editor** (WYSIWYG) supporting paragraphs, headings, bold/italic/underline/strike, links, lists, quotes, tables, callouts, dividers, images, video embeds, file attachments, **math blocks (LaTeX with live preview)** and **code blocks with language selection**. | M |
| FR-52 | Images can be dragged in, pasted from the clipboard or uploaded. They are compressed, resized to several widths and converted to WebP/AVIF automatically. | M |
| FR-53 | Documents upload through the editor and appear as an attachment block. | M |
| FR-54 | Markdown shortcuts in the editor (`#`, `-`, `` ``` ``, `$$`). | S |
| FR-55 | Post metadata: title, slug, summary, cover image, category, tags, course + lesson order, SEO title/description, comment mode. | M |
| FR-56 | Post states: `draft` → `scheduled` → `published` → `archived`. Scheduled posts publish automatically. | M |
| FR-57 | Autosave every few seconds, plus revision history with restore. | M |
| FR-58 | Preview of a draft rendered in the real site theme, through a secret preview link. | M |
| FR-59 | Media library to browse, search, reuse and delete uploaded files. | M |
| FR-60 | Software/release manager (CRUD for FR-20 and FR-21) that computes the checksum on upload. | M |
| FR-61 | Comment moderation inbox: approve, reply, edit, hide, delete, mark as spam, filter by post or status. | M |
| FR-62 | Dashboard with page views per post, downloads and pending comments. | S |
| FR-63 | Import Markdown files (migrating existing notes). | C |

### 3.5 UI, animation & sound (Arwes)

| ID | Requirement | P |
|---|---|---|
| FR-70 | Futuristic sci-fi look: Arwes frames (corner/octagon/underline frames), glowing borders, grid-line and moving-dot backgrounds, decoding text effects. | M |
| FR-71 | Orchestrated enter/exit animations on page transitions and on content blocks. | M |
| FR-72 | UI sound effects ("bleeps") on hover, click, page transition, typing reveal and notifications. | M |
| FR-73 | **Sound is OFF by default** and turned on with a toggle in the header. The setting is remembered. (Browsers block audio before a user gesture.) | M |
| FR-74 | **Animation toggle** (full / reduced / off). The default follows the OS `prefers-reduced-motion` setting. | M |
| FR-75 | Lesson body text is always fully readable: no decoding effect on long paragraphs, high contrast, comfortable line length. Effects decorate the content without getting in the way. | M |
| FR-76 | A "Reading mode" option that turns off backgrounds and effects on article pages. | S |
| FR-77 | The admin editor uses a calm, plain theme (Arwes style without animation and sound) for productive writing. | S |

---

## 4. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | **Performance** | Article pages: LCP < 2.5 s on 4G mid-range Android; JS for public pages ≤ ~250 KB gzipped. Article content is server-rendered HTML and visible **before** Arwes animations hydrate. |
| NFR-02 | **Performance** | Sound assets are lazy-loaded only after sound is enabled. Background effects pause when the tab is hidden. |
| NFR-03 | **SEO** | Server-rendered or static HTML, semantic markup, OpenGraph/Twitter cards, `sitemap.xml`, canonical URLs, structured data (`Article`, `SoftwareApplication`). |
| NFR-04 | **Accessibility** | WCAG 2.1 AA: keyboard navigation, visible focus, alt text required for images in the editor, colour contrast ≥ 4.5:1, honours `prefers-reduced-motion`. |
| NFR-05 | **Security** | HTTPS only; admin routes protected with 2FA; all user HTML sanitised; CSP headers; uploads validated by MIME/extension and size; database row-level security; secrets kept out of the client. |
| NFR-06 | **Privacy** | Many visitors are minors. Collect minimal data: email optional, never public, deletable on request. Store IP addresses only hashed, for rate limiting. Cookie-less analytics. |
| NFR-07 | **Availability** | 99.5 % monthly. Public pages served from a CDN keep working if the database is briefly down (only comments are affected). |
| NFR-08 | **Scalability** | Up to ~5k visitors/day and ~100 concurrent users at exam peaks. Large downloads served from object storage + CDN, not the app server. |
| NFR-09 | **Cost** | Fits free or low-cost tiers (target < USD 10/month at launch). |
| NFR-10 | **Maintainability** | TypeScript throughout. Arwes is **unmaintained and React 18-only**, so it is isolated behind an internal `ui/` component layer that can be replaced later. Exact dependency versions pinned. |
| NFR-11 | **Backup** | Daily automated database backup. Object storage is versioned or replicated. Posts can be exported to Markdown/JSON. |
| NFR-12 | **Compatibility** | Latest 2 versions of Chrome, Edge, Firefox and Safari, plus Android Chrome and iOS Safari. Graceful fallback when WebAudio or SVG filters are unavailable. |
| NFR-13 | **i18n** | UTF-8 throughout. Font stack includes a Khmer font (e.g. *Kantumruy Pro* / *Noto Sans Khmer*) next to the sci-fi Latin font. |

---

## 5. Constraints & assumptions

1. **Arwes constraints** (from the project README): *"no longer maintained"*, React **v18** packages only, *"does not work with React strict mode nor React Server Components."* So:
   - Use **React 18.x** (not 19). Disable `StrictMode`.
   - Do not use the Next.js App Router (it is built on Server Components). Use the **Pages Router** or a Vite-based SPA/SSG instead.
2. There is one author, so no collaborative-editing or permission system is needed.
3. Software binaries may be large; storage egress cost matters → prefer storage with zero egress fees.
4. The owner is technical and can do occasional maintenance (dependency updates, deploys via Git).

---

## 6. Key use cases

**UC-1 Student reviews a lesson.** The student opens a link shared in class, the lesson renders immediately, and animations play in. The student reads the math, copies the code, downloads the attached worksheet PDF, then goes to the next lesson in the series.

**UC-2 Student asks a question.** At the bottom of a lesson the student types a question with a name and optional email, then passes the invisible CAPTCHA. The comment is held for moderation and the student sees "Transmission received — awaiting approval". The owner gets an email.

**UC-3 Owner answers.** The owner opens Admin › Comments, approves the question and writes a reply. The page updates. If the student gave an email, they get a reply notification.

**UC-4 Owner publishes a lesson.** The owner creates a post, pastes a screenshot, types `$$` to insert a formula, adds a Python code block and drags in a PDF. They assign it to *9618 › Paper 4 › Lesson 3*, preview it and schedule it for 07:00 Monday. At that time the post publishes and the page is regenerated.

**UC-5 Owner releases software.** The owner opens Admin › Software › "Pseudocode Runner" › New release, uploads the `.exe` and `.dmg`, writes the changelog and publishes. The checksum and size are computed automatically.

---

## 7. Decisions (answered 2026-10-15)

| # | Question | Decision |
|---|---|---|
| 1 | Comment moderation | **No comments at launch.** Revisit later (§3.3 stays as the future spec). |
| 2 | Khmer | English UI and content. Individual articles may be written in **Khmer** (per-post `lang`, Khmer font). No translations. |
| 3 | Software size / hosting | Software is **not hosted here**. Projects link to their own landing pages. |
| 4 | Domain | **`codingspacekh.dev`** (bought 2026-10-17 at Cloudflare Registrar). |
| 6 | Site structure (redesign feedback) | Menu is **Home · Study ▾ (Math, Physics, Coding, IT) · Projects · Author**. Lessons are grouped by section inside each subject. Math covers **competition topics** (inequalities, sequences, functional equations, number theory, combinatorics), not pure maths. Life posts appear on the Author page. The home hero should be more creative. |
| 5 | Access control | **Everything is public.** |

Use cases UC-2, UC-3 (comments) and UC-5 (software releases) are therefore out of scope for v1.
