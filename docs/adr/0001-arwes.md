# ADR 0001 — Use Arwes for the UI (M0 spike result)

| | |
|---|---|
| Status | **Accepted: GO**, with the four conditions below |
| Date | 2026-10-15 |
| Milestone | M0, Arwes & stack spike (`spikes/m0-arwes/`, throwaway code) |
| Related | 03-system-analysis.md D1, D2, §8.3 (CSP), NFR-PERF-* |

## Question
Can Arwes run inside our planned stack (Next.js Pages Router, static pages, strict CSP) with acceptable performance, accessibility and security, or do we fall back to plain CSS frames?

## What was built
A production build with:
- Arwes `FrameCorners`, `Text` (decipher), `Animator` stagger and a `GridLines` + `Dots` backdrop
- `BleepsProvider` with lazy sounds and a `BleepsOnAnimator` assemble sound
- reduced-motion handling
- a lesson page with build-time **KaTeX** maths and **Shiki** code highlighting
- a control page with the same lesson and no Arwes components

**Versions (exact):**
- `next@16.4.1`, `react@18.3.1`, `@arwes/react@1.0.0-next.25020502`
- `katex@0.19.0`, `shiki@3.2.1`, `@playwright/test@1.64.1`
- `npm audit`: **0 vulnerabilities**

## Tests (written first, all passing)
| Suite | Tests | Result |
|---|---|---|
| SSR with JavaScript disabled: headline, intro, lesson body, KaTeX and Shiki output present | 2 | ✅ |
| Runtime: no console errors, hydration warnings or CSP violations (home + lesson) | 2 | ✅ |
| Arwes: frame assembles into SVG paths; decipher ends on the real text; backdrop canvases draw | 3 | ✅ |
| Sound files not downloaded until sound is turned on | 1 | ✅ |
| Reduced motion: headline fully visible immediately; `data-motion="off"` | 1 | ✅ |
| Layout: brand font applied; backdrop not covered by `body` | 2 | ✅ |
| Security headers incl. CSP policy shape (2 pages) | 2 | ✅ |
| First-load JS budget (2 pages) | 2 | ✅ |
| Unit: safe-math evaluator (correct, rejects non-arithmetic); patched Arwes files contain no `eval` | 3 | ✅ |
| **Total** | **18** | **18 / 18** |

## Measurements
Lighthouse 12.6, mobile, simulated throttling, on a local production build (Intel i9 MacBook):

| Page | Perf | A11y | Best pr. | SEO | LCP | TBT | CLS | First-load JS (gzip) |
|---|---|---|---|---|---|---|---|---|
| Home (Arwes hero, frame, backdrop) | 78 | 100 | 100 | 100 | 2.3 s | 890 ms | 0 | 154 KB |
| Lesson (Arwes chrome + KaTeX + Shiki) | 77 | 100 | 100 | 100 | 2.7 s | 830 ms | 0 | 154 KB |
| **Control** (same lesson, **no Arwes components**) | 79 | 100 | 100 | 100 | 2.2 s | 810 ms | 0 | — |

**Reading:** Arwes costs about **1–2 Lighthouse points**. Almost all of the blocking time is React's own runtime (`framework` chunk ≈ 880 ms under 4× simulated CPU), which is present with or without Arwes. Both pages are well under the JS budgets (200/260 KB).

## Findings
1. **Arwes calls `eval()`.** `@arwes/frames` (`internal/formatFrameDimension.js`) uses `eval` to compute frame size formulas such as `"100% - 10"`. Under a CSP without `'unsafe-eval'` the page crashes.
   **Decision:** do **not** allow `'unsafe-eval'`. Instead, `patches/apply-arwes-patch.mjs` (run on `postinstall`) replaces it with a tested safe arithmetic parser. The script refuses to run if the Arwes file changes, so an upgrade can't silently undo the patch. `patch-package` was rejected because it brings dependencies with high-severity advisories.
2. **Turbopack adds an inline bootstrap script** to every page; the hash changes per page and per build. That forces either `'unsafe-inline'`, per-request nonces (which make every page dynamic and lose static caching), or per-build hash management.
   **Decision:** build with **webpack** (`next build --webpack`), which adds no executable inline script, so `script-src 'self'` stays strict. Revisit when Next.js supports SRI or hashes for Pages Router.
3. **`style=""` attributes are unavoidable.** KaTeX, Shiki and Arwes positioning all set them.
   **Decision:** allow **only** `style-src-attr 'unsafe-inline'`; `style-src` stays `'self'`. Style attributes can't execute code. A test enforces that this is the only `unsafe-inline` in the policy.
4. **Next.js 16 deprecates React 18** ("will be removed in Next.js 17"). Arwes declares `react: 18` as its peer.
   **Experiment:** the same spike on **React 19.1** (peer override) passed **all tests**, with similar Lighthouse scores and +12 KB JS. Arwes's React 18 requirement looks like an outdated label, not a technical limit.
5. **Arwes does not handle reduced motion itself.** We read `prefers-reduced-motion` on the first client render and pass `disabled` to `AnimatorGeneralProvider`. A test covers it.
6. **Sounds:** with `preload: false`, Bleeps fetch nothing until the first `play()`. Combined with a sound-off default, visitors download no audio unless they ask for it. A test covers it.
7. **Backdrop canvases** are mounted after `requestIdleCallback`, so they never compete with hydration. They need the page background on `<html>`, not `<body>`, or they are painted over. Caught by screenshot review; now covered by a test.
8. **Accessibility:** Shiki's `github-dark` comment colour failed contrast; `github-dark-default` passes. `<html lang>`, a meta description and a favicon are required for the 100 scores.

## Decision
**GO with Arwes**, on these conditions:
1. All Arwes imports stay in `src/ui/arwes/` (D2), pinned to `1.0.0-next.25020502`, with the safe-math patch and its tests.
2. Build with `next build --webpack`. CSP as tested: `script-src 'self'`, `style-src 'self'`, `style-src-attr 'unsafe-inline'`, no `'unsafe-eval'`.
3. **Start on React 18.3.1** (the combination Arwes declares), and run a **React 19 compatibility job in CI** using the same test suite. Switch to React 19 before upgrading to Next.js 17, or sooner if anything requires it.
4. Body content is never wrapped in animators; background effects load on idle; motion and sound follow the visitor's preferences.

## Consequences for the plan
- **03-system-analysis:**
  - D1 is updated to Next 16.4.1 + webpack, with React 18.3 now and React 19 tested in CI.
  - The CSP in §8.3 is updated to the tested policy.
  - The performance targets are adjusted: the CI lab gate is Lighthouse **≥ 75** performance (mobile, simulated) with **TBT ≤ 1,000 ms**. Real-user targets (LCP < 2.5 s, INP < 200 ms at p75) are unchanged and measured in production. The spike showed the React runtime alone scores about 79, so a lab gate of 90 would fail regardless of our code.
- **M2 performance work:**
  - Investigate lesson LCP (2.7 s lab): preload the title font weight, inline critical CSS, and check the KaTeX font load.
  - Confirm numbers on Vercel preview builds (Linux) instead of a laptop.
- **Fallback if Arwes ever breaks:** the clickable prototype shows a CSS-only version of the same look. Because Arwes is isolated in `src/ui/arwes/`, swapping it out stays contained.
