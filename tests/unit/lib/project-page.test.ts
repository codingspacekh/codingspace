import { fileKey, mediaUrl } from '@/lib/media-urls';
import { downloadUrl, isDownloadPlatform, isFileDownload } from '@/lib/project-page';

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
