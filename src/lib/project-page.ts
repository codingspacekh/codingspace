/**
 * A project's landing page, /projects/<slug> (v1.1, owner request 2026-10-18). One fixed layout:
 * hero · screenshots · reasons · features · getting started · FAQ · downloads; a section with
 * nothing in it doesn't show. Shared by the admin form (browser: no zod here) and the server.
 */

export type ProjectReason = { title: string; text: string };
export type ProjectFeature = { glyph: string; title: string; text: string };
export type ProjectStep = { title: string; text: string };
/** The answer is Markdown (links, `code`, lists). */
export type ProjectFaq = { question: string; answer: string };
/** One button each, e.g. "Windows" → the installer on GitHub Releases. */
export type ProjectDownload = { label: string; url: string };

/** How many of each the page holds (the database checks the same). */
export const PROJECT_LIMITS = { reasons: 8, features: 12, steps: 8, faq: 12, downloads: 8, screenshots: 8 } as const;

/** The longest text each field takes. */
export const PROJECT_TEXT = {
  tagline: 160,
  intro: 3000,
  title: 80,
  text: 400,
  glyph: 4,
  question: 200,
  answer: 1500,
  label: 40,
  version: 30,
  caption: 200,
} as const;

/** A list item left with every field blank is dropped on save: an "Add" pressed by mistake. */
export const isBlank = (item: Record<string, string>) => Object.values(item).every((v) => !v.trim());
