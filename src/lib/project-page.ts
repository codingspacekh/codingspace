import { fileKey, mediaUrl } from './media-urls';

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

/** Which computer a download is for: picks the hero's button for the visitor, and the card's icon. */
export const DOWNLOAD_PLATFORMS = {
  windows: 'Windows',
  'mac-arm': 'Mac with Apple chip',
  'mac-intel': 'Mac with Intel',
  mac: 'Mac (any)',
  linux: 'Linux',
  android: 'Android',
  other: 'Other',
} as const;
export type DownloadPlatform = keyof typeof DOWNLOAD_PLATFORMS;
export const isDownloadPlatform = (v: unknown): v is DownloadPlatform =>
  typeof v === 'string' && Object.hasOwn(DOWNLOAD_PLATFORMS, v);

/** One button each, e.g. "Windows" with the note "Installer". */
type DownloadBase = { label: string; note?: string; platform?: DownloadPlatform };
/** A link to a file elsewhere, e.g. the installer on GitHub Releases. */
export type LinkDownload = DownloadBase & { url: string };
/**
 * A file uploaded here (2026-10-20): an app in the media library. Its name, size and SHA-256 are
 * copied into the project when it is saved, because visitors can't read the library.
 */
export type FileDownload = DownloadBase & { media: string; name: string; bytes: number; sha256: string };
export type ProjectDownload = LinkDownload | FileDownload;
export const isFileDownload = (d: ProjectDownload): d is FileDownload => 'media' in d;
/** Where the button goes: the file in our storage, or the link. */
export const downloadUrl = (d: ProjectDownload) => (isFileDownload(d) ? mediaUrl(fileKey(d.media)) : d.url);

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
  note: 60,
  version: 30,
  caption: 200,
} as const;

/** A list item left with every field blank is dropped on save: an "Add" pressed by mistake. */
export const isBlank = (item: Record<string, string>) => Object.values(item).every((v) => !v.trim());
