import { fileKey, mediaUrl } from '@/lib/media-urls';
import {
  downloadFor,
  downloadUrl,
  isDownloadPlatform,
  isFileDownload,
  PAGE_SECTIONS,
  sectionOrder,
  visitorPlatforms,
} from '@/lib/project-page';

describe('download buttons (2026-10-20)', () => {
  const file = { label: 'Windows', media: '41000000-0000-4000-8000-000000000001', name: 'a.exe', bytes: 1, sha256: '' };
  const link = { label: 'Linux', url: 'https://github.com/x/y/releases' };

  it('a file serves from our storage, a link goes where it says', () => {
    expect([isFileDownload(file), isFileDownload(link)]).toEqual([true, false]);
    expect(downloadUrl(file)).toBe(mediaUrl(fileKey(file.media)));
    expect(downloadUrl(link)).toBe(link.url);
  });

  it('knows the computers a download can be for', () => {
    expect(['windows', 'mac-arm', 'mac-intel', 'android'].every(isDownloadPlatform)).toBe(true);
    expect([isDownloadPlatform('ios'), isDownloadPlatform(''), isDownloadPlatform(1)]).toEqual([false, false, false]);
  });
});

describe('the page’s sections (2026-10-20)', () => {
  it('follow the owner’s order, then the rest in the default order; unknown names and repeats dropped', () => {
    expect(sectionOrder([])).toEqual([...PAGE_SECTIONS]);
    expect(sectionOrder(['faq', 'sidebar', 'download', 'faq'])).toEqual([
      'faq',
      'download',
      'numbers',
      'why',
      'showcase',
      'features',
      'screenshots',
      'requirements',
      'install',
    ]);
  });
});

describe('the visitor’s computer (2026-10-20)', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', ['windows']],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', ['mac-arm', 'mac', 'mac-intel']],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile', ['android']],
    ['Mozilla/5.0 (X11; Linux x86_64) Firefox/131', ['linux']],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604', []],
    ['Mozilla/5.0 (darwin) AppleWebKit/537.36 jsdom/26', []],
  ])('%s', (ua, platforms) => {
    expect(visitorPlatforms(ua)).toEqual(platforms);
  });

  it('picks the best download, else none', () => {
    const d = [{ platform: 'windows' as const }, { platform: 'mac-intel' as const }, {}];
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    expect(downloadFor(d, mac)).toBe(d[1]);
    expect(downloadFor([{ platform: 'mac-arm' as const }, ...d], mac)?.platform).toBe('mac-arm');
    expect(downloadFor(d, 'Mozilla/5.0 (X11; Linux x86_64)')).toBeNull();
  });
});
