import { fileKey, mediaUrl } from './media-urls';

/**
 * A project's landing page, /projects/<slug> (v1.1, owner request 2026-10-18; redesigned
 * 2026-10-20). The hero comes first and a closing call last; the sections between them follow
 * the owner's order, and the owner can hide any of them. A section with nothing in it doesn't
 * show either. Shared by the admin form (browser: no zod here) and the server.
 */

/** The sections between the hero and the closing call, in their default order. */
export const PAGE_SECTIONS = [
  'numbers',
  'why',
  'showcase',
  'features',
  'screenshots',
  'requirements',
  'download',
  'install',
  'faq',
] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];
export const isPageSection = (v: unknown): v is PageSection => PAGE_SECTIONS.includes(v as PageSection);

/** Names in the admin and the page's sub-navigation. */
export const SECTION_NAMES: Record<PageSection, string> = {
  numbers: 'Numbers',
  why: 'Why',
  showcase: 'Showcase',
  features: 'Features',
  screenshots: 'Screenshots',
  requirements: 'Requirements',
  download: 'Download',
  install: 'Install',
  faq: 'Questions',
};

/** The owner's order, then any section it leaves out, in the default order; unknown names dropped. */
export function sectionOrder(order: readonly string[]): PageSection[] {
  const known = order.filter(isPageSection);
  return [...new Set([...known, ...PAGE_SECTIONS])];
}

/** A big fact under the hero, e.g. "4 GB" · "of RAM is enough". */
export type ProjectHighlight = { value: string; label: string };
/** Something the project replaces, for the Before side of Why, e.g. "DaVinci Resolve" · "needs a strong GPU". */
export type ProjectReplaced = { name: string; note: string };
export type ProjectRequirement = { part: string; minimum: string; recommended: string };
/** A point in a showcase row, e.g. "V4" · "Titles and captions". The code is optional. */
export type ShowcasePoint = { code: string; text: string };

/** The colours a showcase row may take (the subject colours). */
export const SHOWCASE_COLORS = ['cyan', 'violet', 'amber', 'lime', 'pink', 'orange', 'sky', 'rose', 'gold'] as const;
export type ShowcaseColor = (typeof SHOWCASE_COLORS)[number];

/** Which computer an install step is for: steps for several computers show as tabs. */
export const STEP_PLATFORMS = { windows: 'Windows', mac: 'macOS', linux: 'Linux', android: 'Android' } as const;
export type StepPlatform = keyof typeof STEP_PLATFORMS;

export type ProjectReason = { title: string; text: string };
export type ProjectFeature = { glyph: string; title: string; text: string };
export type ProjectStep = { title: string; text: string; platform?: StepPlatform };
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
export const PROJECT_LIMITS = {
  reasons: 8,
  features: 12,
  steps: 12,
  faq: 12,
  downloads: 8,
  screenshots: 8,
  highlights: 4,
  replaces: 8,
  requirements: 10,
  showcase: 6,
  points: 6,
} as const;

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
  value: 12,
  highlight: 80,
  whyTitle: 120,
  whyText: 600,
  replacedName: 60,
  part: 40,
  requirement: 160,
  requirementsNote: 300,
  releaseNotes: 2000,
  showcaseLabel: 60,
  showcaseTitle: 120,
  showcaseText: 600,
  code: 8,
  point: 160,
  version: 30,
  caption: 200,
} as const;

/** A list item left with every field blank is dropped on save: an "Add" pressed by mistake. */
export const isBlank = (item: Record<string, string>) => Object.values(item).every((v) => !v.trim());

/** Which computers the visitor's browser says it runs on, best first; empty when it can't tell. */
export function visitorPlatforms(userAgent: string): DownloadPlatform[] {
  if (/Android/i.test(userAgent)) return ['android'];
  if (/iPhone|iPad|iPod/i.test(userAgent)) return [];
  // Browsers report Intel even on Apple chips, and most Macs sold since 2020 have one.
  if (/Macintosh|Mac OS X/.test(userAgent)) return ['mac-arm', 'mac', 'mac-intel'];
  if (/Windows/.test(userAgent)) return ['windows'];
  if (/Linux|CrOS/.test(userAgent)) return ['linux'];
  return [];
}

/** The download that suits the visitor best, or null. */
export function downloadFor<T extends { platform?: DownloadPlatform }>(downloads: T[], userAgent: string): T | null {
  for (const platform of visitorPlatforms(userAgent)) {
    const found = downloads.find((d) => d.platform === platform);
    if (found) return found;
  }
  return null;
}
